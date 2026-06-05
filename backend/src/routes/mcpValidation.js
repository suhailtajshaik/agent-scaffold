// src/routes/mcpValidation.js
// Shared validation for MCP server endpoints, used by both the global MCP
// routes (routes/mcp.js) and the per-agent MCP routes (routes/agentMcp.js)
// so the rules stay identical in one place.

/** Server names: 1-64 chars, alphanumeric plus dash and underscore. */
export const VALID_SERVER_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validate an MCP server name.
 * @param {string} name
 * @returns {boolean}
 */
export function isValidServerName(name) {
  return typeof name === "string" && VALID_SERVER_NAME.test(name.trim());
}

/**
 * Validate an MCP server connection config.
 * Returns an error message string when invalid, or null when valid.
 *
 * Transport rules:
 *   - stdio      → requires `command`
 *   - sse / http → requires `url`
 *
 * @param {object} config
 * @returns {string|null}
 */
export function validateServerConfig(config) {
  if (!config || typeof config !== "object") {
    return "config is required and must be an object";
  }
  if (config.transport === "stdio" && !config.command) {
    return "command is required for stdio transport";
  }
  if ((config.transport === "sse" || config.transport === "http") && !config.url) {
    return "url is required for sse/http transport";
  }
  return null;
}
