// src/tools/perAgentMCP.js
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";

// Per-agent MCP state: Map<agentId, { servers: Map<name, { client, tools }>, allTools: Tool[] }>
const _agentMCP = new Map();

// Per-agent in-flight connect promise cache to prevent concurrent reconnect races
const _connectPromises = new Map();

// In-memory fallback for when Redis is unavailable
const _agentMCPConfigs = new Map();

// Redis key for per-agent MCP config: agent:{agentId}:mcp
// Value: JSON string of { [serverName]: serverConfig }

// Module-level Redis client — reused across all calls to avoid duplicate connections
let _redis = null;

/**
 * Get Redis client (lazily initialised; reuses the module-level singleton).
 */
async function getRedis() {
  if (!config.redisUrl) return null;
  try {
    const Redis = (await import("ioredis")).default;
    if (!_redis) {
      _redis = new Redis(config.redisUrl);
    }
    return _redis;
  } catch {
    return null;
  }
}

/**
 * Load MCP config for an agent from Redis.
 * Falls back to the in-memory map when Redis is unavailable.
 */
export async function getAgentMCPConfig(agentId) {
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get(`agent:${agentId}:mcp`);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  // Redis not available — use in-memory fallback
  return _agentMCPConfigs.get(agentId) ?? {};
}

/**
 * Save MCP config for an agent to Redis and the in-memory fallback.
 */
export async function saveAgentMCPConfig(agentId, serverConfig) {
  const redis = await getRedis();
  if (redis) {
    await redis.set(`agent:${agentId}:mcp`, JSON.stringify(serverConfig));
  }
  // Always mirror to in-memory map so no-Redis mode has the latest state
  _agentMCPConfigs.set(agentId, serverConfig);
}

/**
 * Connect to all MCP servers for a specific agent.
 * Persisted config is loaded from Redis (or the in-memory fallback).
 * Returns an array of LangChain-compatible tools.
 *
 * Uses a per-agent promise cache to prevent concurrent reconnect races —
 * concurrent callers for the same agentId share the single in-flight promise.
 */
export async function connectAgentMCP(agentId) {
  if (_connectPromises.has(agentId)) {
    return _connectPromises.get(agentId);
  }

  const promise = _doConnectAgentMCP(agentId);
  _connectPromises.set(agentId, promise);
  try {
    const result = await promise;
    return result;
  } finally {
    _connectPromises.delete(agentId);
  }
}

/**
 * Internal implementation — performs the actual connect logic.
 * Always called through connectAgentMCP to ensure race-condition safety.
 */
async function _doConnectAgentMCP(agentId) {
  const serverConfig = await getAgentMCPConfig(agentId);
  const serverNames = Object.keys(serverConfig);

  if (serverNames.length === 0) {
    _agentMCP.set(agentId, { servers: new Map(), allTools: [] });
    return [];
  }

  // Close any existing connections for this agent before rebuilding
  await disconnectAgentMCP(agentId);

  const servers = new Map();
  const allTools = [];

  for (const [name, serverCfg] of Object.entries(serverConfig)) {
    try {
      const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");
      const client = new MultiServerMCPClient({ [name]: serverCfg });
      const tools = await client.getTools();
      servers.set(name, { client, tools });
      allTools.push(...tools);
      logger.info(`Agent ${agentId}: MCP server "${name}" connected (${tools.length} tools)`);
    } catch (err) {
      logger.error(`Agent ${agentId}: MCP server "${name}" failed`, { error: err.message });
      servers.set(name, { client: null, tools: [], error: err.message });
    }
  }

  _agentMCP.set(agentId, { servers, allTools });
  return allTools;
}

/**
 * Disconnect all MCP servers for a given agent and remove the in-memory entry.
 */
export async function disconnectAgentMCP(agentId) {
  const entry = _agentMCP.get(agentId);
  if (!entry) return;

  for (const [name, { client }] of entry.servers) {
    if (client) {
      try {
        await client.close();
      } catch (err) {
        logger.warn(`Error closing MCP "${name}" for agent ${agentId}`, { error: err.message });
      }
    }
  }

  _agentMCP.delete(agentId);
}

/**
 * Return the currently connected MCP tools for an agent from the in-memory
 * cache. Does NOT trigger a reconnect.
 */
export function getAgentMCPTools(agentId) {
  return _agentMCP.get(agentId)?.allTools ?? [];
}

/**
 * Add a single MCP server to an agent's config, persist it, and reconnect
 * all servers for that agent. Returns the refreshed tools array.
 */
export async function addAgentMCPServer(agentId, serverName, serverConfig) {
  const agentCfg = await getAgentMCPConfig(agentId);
  agentCfg[serverName] = serverConfig;
  await saveAgentMCPConfig(agentId, agentCfg);
  // Rebuild all connections so the new server is live immediately
  return connectAgentMCP(agentId);
}

/**
 * Remove a single MCP server from an agent's config, persist the change, and
 * reconnect the remaining servers. Throws if the server name is unknown.
 */
export async function removeAgentMCPServer(agentId, serverName) {
  const agentCfg = await getAgentMCPConfig(agentId);
  if (!(serverName in agentCfg)) {
    throw new Error(`MCP server "${serverName}" not found for agent ${agentId}`);
  }
  delete agentCfg[serverName];
  await saveAgentMCPConfig(agentId, agentCfg);
  return connectAgentMCP(agentId);
}

/**
 * Force-reconnect a specific MCP server for an agent by rebuilding all of
 * that agent's connections. Throws if the server name is not in the config.
 */
export async function reconnectAgentMCPServer(agentId, serverName) {
  const agentCfg = await getAgentMCPConfig(agentId);
  if (!(serverName in agentCfg)) {
    throw new Error(`MCP server "${serverName}" not found for agent ${agentId}`);
  }
  return connectAgentMCP(agentId);
}

/**
 * Return the connection status of every MCP server currently configured for
 * an agent, including per-server tool lists and an aggregate tool count.
 */
export function getAgentMCPStatus(agentId) {
  const entry = _agentMCP.get(agentId);
  if (!entry) return { servers: {}, totalTools: 0 };

  const servers = {};
  for (const [name, { client, tools, error }] of entry.servers) {
    servers[name] = {
      status: client ? "connected" : "error",
      error: error ?? null,
      tools: tools.map((t) => t.name),
      toolCount: tools.length,
    };
  }

  return {
    servers,
    totalTools: entry.allTools.length,
  };
}

/**
 * Disconnect every agent's MCP connections and tear down the Redis client.
 * Call this during process shutdown.
 */
export async function shutdownAllAgentMCP() {
  for (const agentId of _agentMCP.keys()) {
    await disconnectAgentMCP(agentId);
  }
  if (_redis) {
    _redis.disconnect();
    _redis = null;
  }
}
