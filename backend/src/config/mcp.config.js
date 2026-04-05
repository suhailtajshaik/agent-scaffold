// src/config/mcp.config.js
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { logger } from "./logger.js";

export function loadMCPConfig() {
  // First try MCP_SERVERS env var (JSON string)
  if (process.env.MCP_SERVERS) {
    try {
      return JSON.parse(process.env.MCP_SERVERS);
    } catch (e) {
      logger.error("Failed to parse MCP_SERVERS env var", { error: e.message });
      return {};
    }
  }

  // Then try mcp.json config file
  const configPath = resolve(process.cwd(), "mcp.json");
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      logger.error("Failed to read mcp.json", { error: e.message });
      return {};
    }
  }

  return {};
}
