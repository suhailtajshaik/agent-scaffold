// src/routes/mcp.js
import { Router } from "express";
import {
  addMCPServer,
  removeMCPServer,
  reconnectMCPServer,
  getMCPServersStatus,
  getMCPToolsWithSource,
} from "../tools/mcpManager.js";
import { logger } from "../config/logger.js";

const router = Router();

const VALID_SERVER_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

// GET /api/mcp/servers — list all servers with their status and tool lists
router.get("/servers", (req, res) => {
  res.json(getMCPServersStatus());
});

// POST /api/mcp/servers — add a new MCP server and trigger hot-reload
router.post("/servers", async (req, res) => {
  const { name, config } = req.body;

  if (!name?.trim() || !VALID_SERVER_NAME.test(name.trim())) {
    return res.status(400).json({ error: "name must be 1-64 alphanumeric, dash, or underscore characters" });
  }
  if (!config || typeof config !== "object") {
    return res.status(400).json({ error: "config is required and must be an object" });
  }

  // Transport-specific required field validation
  if (config.transport === "stdio" && !config.command) {
    return res.status(400).json({ error: "command is required for stdio transport" });
  }
  if ((config.transport === "sse" || config.transport === "http") && !config.url) {
    return res.status(400).json({ error: "url is required for sse/http transport" });
  }

  try {
    await addMCPServer(name.trim(), config);
    res.json(getMCPServersStatus());
  } catch (err) {
    logger.error("Failed to add MCP server", { name, error: err.message });
    // Return current status alongside the error — other servers may still be healthy
    res.status(500).json({ error: err.message, ...getMCPServersStatus() });
  }
});

// DELETE /api/mcp/servers/:name — remove a server and trigger hot-reload
router.delete("/servers/:name", async (req, res) => {
  const { name } = req.params;
  if (!VALID_SERVER_NAME.test(name)) {
    return res.status(400).json({ error: "Invalid server name" });
  }
  try {
    await removeMCPServer(name);
    res.json({ removed: true, name });
  } catch (err) {
    logger.error("Failed to remove MCP server", { name, error: err.message });
    const statusCode = err.message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

// POST /api/mcp/servers/:name/reconnect — force-reconnect a specific server
router.post("/servers/:name/reconnect", async (req, res) => {
  const { name } = req.params;
  if (!VALID_SERVER_NAME.test(name)) {
    return res.status(400).json({ error: "Invalid server name" });
  }
  try {
    await reconnectMCPServer(name);
    res.json(getMCPServersStatus());
  } catch (err) {
    logger.error("Failed to reconnect MCP server", { name, error: err.message });
    const statusCode = err.message.includes("not found") ? 404 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

// GET /api/mcp/tools — list all MCP tools annotated with their source server
router.get("/tools", (req, res) => {
  res.json({ tools: getMCPToolsWithSource() });
});

export default router;
