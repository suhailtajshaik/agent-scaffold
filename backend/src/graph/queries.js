// src/graph/queries.js
// Common Gremlin traversal queries used by the agentStore and routes.
//
// Every exported function checks isFallback() first and returns safe empty
// data when JanusGraph is unavailable, so callers never need to handle the
// absence of a graph connection themselves.
import { submitQuery, isFallback } from "./client.js";
import { logger } from "../config/logger.js";

// ─── Agent Vertices ──────────────────────────────────────────────────────────

/**
 * Create or update an Agent vertex with the agent's current configuration.
 *
 * @param {object} agentConfig  Must include { id, name, description?, status? }
 */
export async function upsertAgentVertex(agentConfig) {
  if (isFallback()) return;

  const { id, name, description, status } = agentConfig;

  try {
    await submitQuery(
      `g.V().has('Agent', 'agentId', agentId).fold()
        .coalesce(unfold(), addV('Agent').property('agentId', agentId))
        .property('name', name)
        .property('description', description)
        .property('status', status)`,
      {
        agentId: id,
        name: name ?? "",
        description: description ?? "",
        status: status ?? "active",
      }
    );
  } catch (err) {
    logger.error("upsertAgentVertex failed", { agentId: id, error: err.message });
  }
}

/**
 * Remove an Agent vertex and all its incident edges.
 *
 * @param {string} agentId
 */
export async function removeAgentVertex(agentId) {
  if (isFallback()) return;

  try {
    await submitQuery("g.V().has('Agent', 'agentId', agentId).drop()", {
      agentId,
    });
  } catch (err) {
    logger.error("removeAgentVertex failed", { agentId, error: err.message });
  }
}

// ─── Tool Vertices & Edges ───────────────────────────────────────────────────

/**
 * Create or update a Tool vertex.
 *
 * @param {string} toolName
 * @param {string} toolType        e.g. "local" | "mcp"
 * @param {string} description
 */
export async function upsertToolVertex(toolName, toolType, description) {
  if (isFallback()) return;

  try {
    await submitQuery(
      `g.V().has('Tool', 'toolName', toolName).fold()
        .coalesce(unfold(), addV('Tool').property('toolName', toolName))
        .property('toolType', toolType)
        .property('description', description)`,
      {
        toolName,
        toolType: toolType ?? "local",
        description: description ?? "",
      }
    );
  } catch (err) {
    logger.error("upsertToolVertex failed", { toolName, error: err.message });
  }
}

/**
 * Replace all USES_TOOL edges for an agent with the supplied tool list.
 * Ensures tool vertices exist before creating edges.
 *
 * @param {string}   agentId
 * @param {string[]} toolNames
 */
export async function setAgentTools(agentId, toolNames) {
  if (isFallback()) return;

  try {
    // Drop all existing assignments first
    await submitQuery(
      "g.V().has('Agent', 'agentId', agentId).outE('USES_TOOL').drop()",
      { agentId }
    );

    for (const toolName of toolNames) {
      const now = new Date().toISOString();
      await submitQuery(
        `g.V().has('Agent', 'agentId', agentId).as('a')
          .V().has('Tool', 'toolName', toolName).as('t')
          .addE('USES_TOOL').from('a').to('t').property('assignedAt', '${now}')`,
        { agentId, toolName }
      );
    }
  } catch (err) {
    logger.error("setAgentTools failed", { agentId, error: err.message });
  }
}

/**
 * Return the tool names assigned to an agent.
 *
 * @param {string} agentId
 * @returns {Promise<string[]>}
 */
export async function getAgentTools(agentId) {
  if (isFallback()) return [];

  try {
    const result = await submitQuery(
      "g.V().has('Agent', 'agentId', agentId).out('USES_TOOL').values('toolName')",
      { agentId }
    );
    return result ?? [];
  } catch (err) {
    logger.error("getAgentTools failed", { agentId, error: err.message });
    return [];
  }
}

// ─── Delegation Edges ────────────────────────────────────────────────────────

/**
 * Replace all CAN_DELEGATE_TO edges for an agent.
 *
 * @param {string}   agentId
 * @param {string[]} targetAgentIds
 */
export async function setDelegationTargets(agentId, targetAgentIds) {
  if (isFallback()) return;

  try {
    await submitQuery(
      "g.V().has('Agent', 'agentId', agentId).outE('CAN_DELEGATE_TO').drop()",
      { agentId }
    );

    for (const targetId of targetAgentIds) {
      await submitQuery(
        `g.V().has('Agent', 'agentId', agentId).as('a')
          .V().has('Agent', 'agentId', targetId).as('t')
          .addE('CAN_DELEGATE_TO').from('a').to('t')`,
        { agentId, targetId }
      );
    }
  } catch (err) {
    logger.error("setDelegationTargets failed", { agentId, error: err.message });
  }
}

/**
 * Return the agent IDs that the given agent can delegate to.
 *
 * @param {string} agentId
 * @returns {Promise<string[]>}
 */
export async function getDelegationTargets(agentId) {
  if (isFallback()) return [];

  try {
    const result = await submitQuery(
      "g.V().has('Agent', 'agentId', agentId).out('CAN_DELEGATE_TO').values('agentId')",
      { agentId }
    );
    return result ?? [];
  } catch (err) {
    logger.error("getDelegationTargets failed", { agentId, error: err.message });
    return [];
  }
}

// ─── MCP Server Vertices & Edges ─────────────────────────────────────────────

/**
 * Create or update an MCPServer vertex.
 *
 * @param {string} serverName
 * @param {object} serverConfig  Expected to contain at least { transport }
 */
export async function upsertMCPServerVertex(serverName, serverConfig) {
  if (isFallback()) return;

  try {
    await submitQuery(
      `g.V().has('MCPServer', 'serverName', serverName).fold()
        .coalesce(unfold(), addV('MCPServer').property('serverName', serverName))
        .property('transport', transport)
        .property('status', 'active')`,
      {
        serverName,
        transport: serverConfig?.transport ?? "unknown",
      }
    );
  } catch (err) {
    logger.error("upsertMCPServerVertex failed", { serverName, error: err.message });
  }
}

/**
 * Create a CONNECTS_TO edge between an agent and an MCP server (idempotent).
 *
 * @param {string} agentId
 * @param {string} serverName
 */
export async function setAgentMCPServer(agentId, serverName) {
  if (isFallback()) return;

  try {
    // Use coalesce so duplicate edges are not created
    const now = new Date().toISOString();
    await submitQuery(
      `g.V().has('Agent', 'agentId', agentId).as('a')
        .V().has('MCPServer', 'serverName', serverName).as('s')
        .coalesce(
          __.select('a').outE('CONNECTS_TO').where(inV().has('serverName', serverName)),
          addE('CONNECTS_TO').from('a').to('s').property('configuredAt', '${now}')
        )`,
      { agentId, serverName }
    );
  } catch (err) {
    logger.error("setAgentMCPServer failed", { agentId, serverName, error: err.message });
  }
}

/**
 * Remove the CONNECTS_TO edge between an agent and an MCP server.
 *
 * @param {string} agentId
 * @param {string} serverName
 */
export async function removeAgentMCPServer(agentId, serverName) {
  if (isFallback()) return;

  try {
    await submitQuery(
      `g.V().has('Agent', 'agentId', agentId).outE('CONNECTS_TO')
        .where(inV().has('serverName', serverName)).drop()`,
      { agentId, serverName }
    );
  } catch (err) {
    logger.error("removeAgentMCPServer failed", { agentId, serverName, error: err.message });
  }
}

// ─── Instance Vertices & Edges ───────────────────────────────────────────────

/**
 * Create or update an Instance vertex (represents a running backend instance).
 *
 * @param {string} instanceId
 * @param {string} instanceUrl
 */
export async function upsertInstanceVertex(instanceId, instanceUrl) {
  if (isFallback()) return;

  try {
    await submitQuery(
      `g.V().has('Instance', 'instanceId', instanceId).fold()
        .coalesce(unfold(), addV('Instance').property('instanceId', instanceId))
        .property('url', url)
        .property('status', 'active')`,
      { instanceId, url: instanceUrl }
    );
  } catch (err) {
    logger.error("upsertInstanceVertex failed", { instanceId, error: err.message });
  }
}

/**
 * Replace the HOSTED_ON edge for an agent, pointing it to the given instance.
 *
 * @param {string} agentId
 * @param {string} instanceId
 */
export async function setAgentInstance(agentId, instanceId) {
  if (isFallback()) return;

  try {
    await submitQuery(
      "g.V().has('Agent', 'agentId', agentId).outE('HOSTED_ON').drop()",
      { agentId }
    );

    await submitQuery(
      `g.V().has('Agent', 'agentId', agentId).as('a')
        .V().has('Instance', 'instanceId', instanceId).as('i')
        .addE('HOSTED_ON').from('a').to('i')`,
      { agentId, instanceId }
    );
  } catch (err) {
    logger.error("setAgentInstance failed", { agentId, instanceId, error: err.message });
  }
}

// ─── Topology Queries ────────────────────────────────────────────────────────

/**
 * Return the entire graph as a plain { vertices, edges } object.
 * Useful for building topology visualisations.
 *
 * @returns {Promise<{ vertices: any[], edges: any[] }>}
 */
export async function getFullTopology() {
  if (isFallback()) return { vertices: [], edges: [] };

  try {
    const [vertices, edges] = await Promise.all([
      submitQuery(
        "g.V().project('id', 'label', 'properties').by(id()).by(label()).by(valueMap())"
      ),
      submitQuery(
        "g.E().project('id', 'label', 'from', 'to').by(id()).by(label()).by(outV().id()).by(inV().id())"
      ),
    ]);

    return { vertices: vertices ?? [], edges: edges ?? [] };
  } catch (err) {
    logger.error("getFullTopology failed", { error: err.message });
    return { vertices: [], edges: [] };
  }
}

/**
 * Return the tools and delegation targets for a single agent.
 *
 * @param {string} agentId
 * @returns {Promise<{ agentId: string, tools: string[], delegationTargets: string[] }>}
 */
export async function getAgentDependencies(agentId) {
  if (isFallback()) {
    return { agentId, tools: [], delegationTargets: [] };
  }

  try {
    const [tools, delegationTargets] = await Promise.all([
      getAgentTools(agentId),
      getDelegationTargets(agentId),
    ]);

    return { agentId, tools, delegationTargets };
  } catch (err) {
    logger.error("getAgentDependencies failed", { agentId, error: err.message });
    return { agentId, tools: [], delegationTargets: [] };
  }
}
