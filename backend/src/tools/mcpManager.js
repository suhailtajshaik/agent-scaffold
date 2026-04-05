// src/tools/mcpManager.js
import { logger } from "../config/logger.js";

let client = null;
let mcpTools = [];

export async function initMCPTools(serverConfig) {
  if (!serverConfig || Object.keys(serverConfig).length === 0) {
    logger.info("No MCP servers configured");
    return [];
  }

  try {
    // Dynamic import to avoid breaking when package isn't installed
    const { MultiServerMCPClient } = await import("@langchain/mcp-adapters");

    client = new MultiServerMCPClient(serverConfig);
    mcpTools = await client.getTools();

    logger.info(`MCP tools loaded: ${mcpTools.map((t) => t.name).join(", ")}`);
    return mcpTools;
  } catch (error) {
    logger.error("Failed to initialize MCP tools", { error: error.message });
    return [];
  }
}

export function getMCPTools() {
  return mcpTools;
}

export async function shutdownMCP() {
  if (client) {
    try {
      await client.close();
      logger.info("MCP connections closed");
    } catch (error) {
      logger.error("Error closing MCP connections", { error: error.message });
    }
  }
}

export function getMCPStatus() {
  return {
    connected: client !== null,
    toolCount: mcpTools.length,
    tools: mcpTools.map((t) => t.name),
  };
}
