// src/tools/mcpManager.js
import { logger } from "../config/logger.js";
import { saveMCPConfig } from "../config/mcp.config.js";

// ── Module-level state ────────────────────────────────────────────────────────

let _serverConfig = {};                // name -> connection config
const _serverStatus = new Map();       // name -> { status, error, tools }
const _clients = new Map();            // name -> { client: MultiServerMCPClient, tools: Tool[] }

// Simple promise-based mutex so concurrent callers wait for the same rebuild
let _rebuildPromise = null;

// Flat tool array consumed by the rest of the app (kept for backward compat)
let mcpTools = [];

// ── Internal rebuild ──────────────────────────────────────────────────────────

async function _doRebuild() {
  // Close all existing per-server clients
  for (const [name, entry] of _clients) {
    try {
      await entry.client.close();
    } catch {
      // Ignore close errors — the server may already be gone
    }
  }
  _clients.clear();
  mcpTools = [];

  const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");

  for (const [name, config] of Object.entries(_serverConfig)) {
    try {
      const serverClient = new MultiServerMCPClient({ [name]: config });
      const tools = await serverClient.getTools();
      _clients.set(name, { client: serverClient, tools });
      _serverStatus.set(name, {
        status: "connected",
        error: null,
        tools: tools.map((t) => t.name),
      });
      mcpTools.push(...tools);
      logger.info(`MCP server "${name}" connected (${tools.length} tools)`);
    } catch (err) {
      _serverStatus.set(name, {
        status: "error",
        error: err.message,
        tools: [],
      });
      logger.error(`MCP server "${name}" failed to connect`, { error: err.message });
    }
  }

  // Propagate tools to the shared registry and reset the compiled agent
  const { setMCPTools } = await import("../tools/index.js");
  const { resetDefaultAgent } = await import("../agents/defaultAgent.js");
  setMCPTools(mcpTools);
  resetDefaultAgent();

  logger.info(`MCP rebuild complete — ${mcpTools.length} total tools across ${_clients.size} servers`);
}

async function _rebuildClient() {
  if (_rebuildPromise) return _rebuildPromise;
  _rebuildPromise = _doRebuild().finally(() => {
    _rebuildPromise = null;
  });
  return _rebuildPromise;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called once at startup. Stores the loaded config and connects all servers.
 * Backward-compatible: still returns the flat tools array.
 */
export async function initMCPTools(serverConfig) {
  if (!serverConfig || Object.keys(serverConfig).length === 0) {
    logger.info("No MCP servers configured");
    return [];
  }

  _serverConfig = { ...serverConfig };

  // Pre-populate status as "connecting" so callers can see intent immediately
  for (const name of Object.keys(_serverConfig)) {
    _serverStatus.set(name, { status: "connecting", error: null, tools: [] });
  }

  await _rebuildClient();
  return mcpTools;
}

/** Add a server, persist the config, and trigger a hot-reload. */
export async function addMCPServer(name, connectionConfig) {
  const prev = _serverConfig[name];
  _serverConfig[name] = connectionConfig;
  _serverStatus.set(name, { status: "connecting", error: null, tools: [] });
  try {
    await _rebuildClient();
    saveMCPConfig(_serverConfig);
  } catch (err) {
    // Roll back in-memory state on failure
    if (prev) { _serverConfig[name] = prev; } else { delete _serverConfig[name]; }
    _serverStatus.delete(name);
    throw err;
  }
  return _serverStatus.get(name);
}

/** Remove a server, persist the config, and trigger a hot-reload. */
export async function removeMCPServer(name) {
  if (!(name in _serverConfig)) {
    throw new Error(`MCP server "${name}" not found`);
  }
  const prev = _serverConfig[name];
  const prevStatus = _serverStatus.get(name);
  delete _serverConfig[name];
  _serverStatus.delete(name);
  try {
    await _rebuildClient();
    saveMCPConfig(_serverConfig);
  } catch (err) {
    // Roll back on failure
    _serverConfig[name] = prev;
    if (prevStatus) _serverStatus.set(name, prevStatus);
    throw err;
  }
}

/** Force-reconnect a single server by rebuilding all connections. */
export async function reconnectMCPServer(name) {
  if (!(name in _serverConfig)) {
    throw new Error(`MCP server "${name}" not found in config`);
  }
  _serverStatus.set(name, { status: "connecting", error: null, tools: [] });
  await _rebuildClient();
  return _serverStatus.get(name);
}

/** Returns status + config for every configured server. */
export function getMCPServersStatus() {
  const servers = {};
  for (const [name, config] of Object.entries(_serverConfig)) {
    const status = _serverStatus.get(name) ?? { status: "unknown", error: null, tools: [] };
    servers[name] = { config, ...status };
  }
  return { servers };
}

/** Returns tools annotated with the server name they came from. */
export function getMCPToolsWithSource() {
  const result = [];
  for (const [name, entry] of _clients) {
    for (const tool of entry.tools) {
      result.push({
        name: tool.name,
        description: tool.description ?? "",
        server: name,
      });
    }
  }
  return result;
}

/** Flat tools array — kept for existing callers. */
export function getMCPTools() {
  return mcpTools;
}

/** Summary used by the /health endpoint. */
export function getMCPStatus() {
  return {
    connected: _clients.size > 0,
    serverCount: Object.keys(_serverConfig).length,
    toolCount: mcpTools.length,
    tools: mcpTools.map((t) => t.name),
  };
}

/** Graceful shutdown — closes every per-server client. */
export async function shutdownMCP() {
  for (const [name, entry] of _clients) {
    try {
      await entry.client.close();
      logger.info(`MCP server "${name}" connection closed`);
    } catch (err) {
      logger.error(`Error closing MCP server "${name}"`, { error: err.message });
    }
  }
  _clients.clear();
  mcpTools = [];
}
