// src/tools/delegationTool.js
// Factory that returns a per-request delegate_to_agent tool bound to the
// current agent's context. Circular imports with agentFactory are avoided by
// using a dynamic import() inside the tool handler.
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";
import { validateInput, validateOutput } from "../guardrails/index.js";

/**
 * Creates a delegate_to_agent tool bound to the current request context.
 *
 * @param {object} options
 * @param {object} options.agentStore - The agent store instance
 * @param {string} options.currentAgentId - ID of the agent making the delegation
 * @param {string} options.sessionId - Current session ID
 * @param {string|null} options.userId - Current user ID
 * @param {number} options.depth - Current delegation depth (starts at 0)
 * @param {function} options.buildAgentForRequest - Function to compile target agent (injected by agentCompiler)
 * @param {function} [options.onDelegation] - Callback for delegation events (streaming)
 */
export function createDelegationTool({
  agentStore,
  currentAgentId,
  sessionId,
  userId,
  depth = 0,
  buildAgentForRequest,
  onDelegation,
}) {
  const maxDepth = config.maxDelegationDepth;

  return tool(
    async ({ agentId, task }) => {
      // Guard: depth limit
      if (depth >= maxDepth) {
        logger.warn(`Delegation depth exceeded: ${depth} >= ${maxDepth}`);
        return JSON.stringify({
          error: `Maximum delegation depth (${maxDepth}) exceeded. Cannot delegate further.`,
        });
      }

      // Guard: self-delegation
      if (agentId === currentAgentId) {
        return JSON.stringify({ error: "Cannot delegate to yourself." });
      }

      // Guard: validate task content
      const inputCheck = validateInput(task);
      if (!inputCheck.valid) {
        return JSON.stringify({ error: `Delegation task rejected: ${inputCheck.error}` });
      }

      // Load target agent
      const targetConfig = await agentStore.get(agentId);
      if (!targetConfig) {
        return JSON.stringify({ error: `Agent "${agentId}" not found.` });
      }
      if (targetConfig.status !== "active") {
        return JSON.stringify({ error: `Agent "${targetConfig.name}" is inactive.` });
      }

      logger.info(
        `Delegation: ${currentAgentId} → ${agentId} (depth ${depth + 1}): "${task.slice(0, 100)}"`
      );

      // Emit delegation event for streaming
      if (onDelegation) {
        onDelegation({ from: currentAgentId, to: agentId, toName: targetConfig.name, task });
      }

      try {
        // Build and invoke target agent. buildAgentForRequest handles tool
        // resolution, state tools, and creates a NEW delegation tool with depth+1.
        const { agent } = await buildAgentForRequest(agentId, sessionId, userId, depth + 1);

        // Dynamic import avoids a circular dependency with agentFactory.
        const { runAgent } = await import("../agents/agentFactory.js");

        // Use a sub-session so delegation history doesn't pollute the main conversation.
        const result = await runAgent({
          agent,
          sessionId: `${sessionId}:delegation:${depth + 1}`,
          userMessage: task,
        });

        // Validate output from the delegated agent
        const outputCheck = validateOutput(result.text);
        if (!outputCheck.safe) {
          return JSON.stringify({ error: "Delegated agent produced unsafe content." });
        }

        logger.info(
          `Delegation complete: ${agentId} → ${result.durationMs}ms, tools: [${result.toolsUsed.join(",")}]`
        );

        return JSON.stringify({
          agentId,
          agentName: targetConfig.name,
          response: result.text,
          toolsUsed: result.toolsUsed,
          durationMs: result.durationMs,
        });
      } catch (err) {
        logger.error(`Delegation to ${agentId} failed`, { error: err.message });
        return JSON.stringify({ error: `Delegation failed: ${err.message}` });
      }
    },
    {
      name: "delegate_to_agent",
      description:
        "Delegate a task to another specialist agent. Use when the task would be better handled by an agent with different expertise. The other agent will process the task and return its response.",
      schema: z.object({
        agentId: z.string().describe("The ID of the agent to delegate to"),
        task: z
          .string()
          .describe("A clear description of what you want the other agent to do"),
      }),
    }
  );
}
