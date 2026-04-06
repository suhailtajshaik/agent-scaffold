// src/agents/agentCompiler.js
// Central orchestration module that builds a fully-configured agent for a request.
//
// Responsibilities:
//   1. Load agent config from agentStore
//   2. Resolve tools (filtered by agent config + per-agent MCP tools)
//   3. Create per-request tools (state tools, delegation tool)
//   4. Augment system prompt with available delegation targets
//   5. Compile the LangGraph agent via createAgent()
//
// This function is called per-request and is NOT cached because per-request
// tools (state tools, delegation tool) carry request-scoped context.

import { agentStore } from "./agentStore.js";
import { createAgent } from "./agentFactory.js";
import { getAllTools, getToolsByNames } from "../tools/index.js";
import { createStateTools } from "../tools/stateTools.js";
import { createDelegationTool } from "../tools/delegationTool.js";
import { getAgentMCPTools, connectAgentMCP } from "../tools/perAgentMCP.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";

/**
 * Build a fully-configured agent for a specific request.
 *
 * This is the single entry point used by routes. It handles everything:
 * config loading, tool resolution, MCP, state tools, delegation, prompt
 * augmentation, and final compilation into a runnable LangGraph agent.
 *
 * Delegation recursion is implemented by passing this function itself as the
 * `buildAgentForRequest` callback to `createDelegationTool`. Each recursive
 * call increments `delegationDepth`, which is checked against
 * `config.maxDelegationDepth` to prevent infinite loops.
 *
 * @param {string|null} agentId - Agent ID to load. Pass null to use the default agent.
 * @param {string} sessionId - Session ID used by state tools to scope session-level state.
 * @param {string|null} userId - User ID used by state tools to scope user-level state.
 * @param {number} [delegationDepth=0] - Current nesting depth (0 for top-level requests).
 * @param {function|null} [onDelegation=null] - Optional callback invoked when a delegation
 *   event fires (useful for streaming progress to the client).
 * @returns {Promise<{ agent: import("@langchain/langgraph").CompiledGraph, config: object }>}
 *   The compiled agent graph and the resolved AgentConfig that was used to build it.
 */
export async function buildRequestAgent(
  agentId,
  sessionId,
  userId,
  delegationDepth = 0,
  onDelegation = null
) {
  // ── Step 1: Load agent config ────────────────────────────────────────────────
  const agentConfig = agentId
    ? await agentStore.get(agentId)
    : await agentStore.getDefault();

  if (!agentConfig) {
    throw new Error(`Agent not found: ${agentId || "default"}`);
  }
  if (agentConfig.status !== "active") {
    throw new Error(`Agent "${agentConfig.name}" is inactive`);
  }

  // ── Step 2: Resolve base tools ───────────────────────────────────────────────
  // tools === null means "all available tools"; [] means "no tools";
  // an array of names means "only these tools".
  let baseTools;
  if (agentConfig.tools === null) {
    baseTools = getAllTools();
  } else if (agentConfig.tools.length === 0) {
    baseTools = [];
  } else {
    baseTools = getToolsByNames(agentConfig.tools);
  }

  // ── Step 3: Add per-agent MCP tools ─────────────────────────────────────────
  // Return cached tools if already connected; otherwise attempt a fresh connect.
  // connectAgentMCP is a no-op when no MCP servers are configured for this agent.
  let mcpTools = getAgentMCPTools(agentConfig.id);
  if (mcpTools.length === 0) {
    mcpTools = await connectAgentMCP(agentConfig.id);
  }

  // ── Step 4: Create per-request tools ────────────────────────────────────────
  const stateTools = createStateTools({ sessionId, userId });

  const delegationTool = createDelegationTool({
    agentStore,
    currentAgentId: agentConfig.id,
    sessionId,
    userId,
    depth: delegationDepth,
    // Recursive call: the target agent is compiled with depth+1. The depth
    // increment happens inside createDelegationTool before it calls this.
    buildAgentForRequest: async (targetId, sid, uid, depth) => {
      return buildRequestAgent(targetId, sid, uid, depth, onDelegation);
    },
    onDelegation,
  });

  // ── Step 5: Optionally add remote agent tool ─────────────────────────────────
  // Only attempted when an instanceUrl is configured (federation mode).
  let remoteTools = [];
  if (config.instanceUrl) {
    try {
      const { createRemoteAgentTool } = await import("../tools/remoteAgentTool.js");
      remoteTools = [
        createRemoteAgentTool({
          getRemoteInstances: async () => {
            // TODO: fetch live instance registry from Redis
            return [];
          },
        }),
      ];
    } catch (err) {
      logger.warn("Remote agent tool not available", { error: err.message });
    }
  }

  // ── Step 6: Augment system prompt with delegation context ────────────────────
  // Only inject delegation guidance when there are other active agents to
  // delegate to and we have not yet hit the depth ceiling.
  let systemPrompt = agentConfig.systemPrompt;

  const allAgents = await agentStore.list();
  const delegationCandidates = allAgents.filter(
    (a) => a.id !== agentConfig.id && a.status === "active"
  );

  if (
    delegationCandidates.length > 0 &&
    delegationDepth < config.maxDelegationDepth
  ) {
    systemPrompt +=
      `\n\nYou can delegate tasks to other agents using the delegate_to_agent tool` +
      ` when their expertise is better suited.`;
    systemPrompt += `\nAvailable agents:\n`;
    systemPrompt += delegationCandidates
      .map((a) => `- ID: "${a.id}" | ${a.name}: ${a.description}`)
      .join("\n");
    systemPrompt += `\nOnly delegate when another agent is clearly better suited for the task.`;
  }

  // ── Step 7: Merge all tool sets ──────────────────────────────────────────────
  // Order: configured base tools, MCP tools, state tools, delegation, remote.
  const allTools = [
    ...baseTools,
    ...mcpTools,
    ...stateTools,
    delegationTool,
    ...remoteTools,
  ];

  // ── Step 8: Compile the LangGraph agent ──────────────────────────────────────
  const agent = createAgent({
    systemPrompt,
    tools: allTools,
    model: agentConfig.model,
    temperature: agentConfig.temperature ?? null,
    maxTokens: agentConfig.maxTokens ?? null,
  });

  logger.debug(
    `Agent compiled: ${agentConfig.name} (${allTools.length} tools, depth ${delegationDepth})`,
    { agentId: agentConfig.id, sessionId, delegationDepth }
  );

  return { agent, config: agentConfig };
}
