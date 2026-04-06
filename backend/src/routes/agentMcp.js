import { Router } from "express";
import {
  getAgentMCPConfig,
  addAgentMCPServer,
  removeAgentMCPServer,
  reconnectAgentMCPServer,
  getAgentMCPStatus,
  getAgentMCPTools,
} from "../tools/perAgentMCP.js";
import { agentStore } from "../agents/agentStore.js";
import { logger } from "../config/logger.js";

const router = Router();

const VALID_SERVER_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

// GET /api/agents/:id/mcp/servers — List agent's MCP servers
router.get("/:id/mcp/servers", async (req, res) => {
  try {
    const agent = await agentStore.get(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const config = await getAgentMCPConfig(req.params.id);
    const status = getAgentMCPStatus(req.params.id);

    res.json({ agentId: req.params.id, config, status });
  } catch (err) {
    logger.error("Get agent MCP servers failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/:id/mcp/servers — Add MCP server to agent
router.post("/:id/mcp/servers", async (req, res) => {
  try {
    const agent = await agentStore.get(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { name, config: serverConfig } = req.body;
    if (!name?.trim() || !VALID_SERVER_NAME.test(name.trim())) {
      return res.status(400).json({ error: "name must be 1-64 alphanumeric/dash/underscore characters" });
    }
    if (!serverConfig) {
      return res.status(400).json({ error: "config is required" });
    }
    if (serverConfig.transport === "stdio" && !serverConfig.command) {
      return res.status(400).json({ error: "command is required for stdio transport" });
    }
    if ((serverConfig.transport === "sse" || serverConfig.transport === "http") && !serverConfig.url) {
      return res.status(400).json({ error: "url is required for sse/http transport" });
    }

    await addAgentMCPServer(req.params.id, name, serverConfig);
    const status = getAgentMCPStatus(req.params.id);
    res.json({ agentId: req.params.id, status });
  } catch (err) {
    logger.error("Add agent MCP server failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/agents/:id/mcp/servers/:name — Remove MCP server from agent
router.delete("/:id/mcp/servers/:name", async (req, res) => {
  try {
    if (!VALID_SERVER_NAME.test(req.params.name)) {
      return res.status(400).json({ error: "Invalid server name" });
    }
    await removeAgentMCPServer(req.params.id, req.params.name);
    res.json({ removed: true, agentId: req.params.id, serverName: req.params.name });
  } catch (err) {
    logger.error("Remove agent MCP server failed", { error: err.message });
    res.status(err.message.includes("not found") ? 404 : 500).json({ error: err.message });
  }
});

// POST /api/agents/:id/mcp/servers/:name/reconnect
router.post("/:id/mcp/servers/:name/reconnect", async (req, res) => {
  try {
    if (!VALID_SERVER_NAME.test(req.params.name)) {
      return res.status(400).json({ error: "Invalid server name" });
    }
    await reconnectAgentMCPServer(req.params.id, req.params.name);
    const status = getAgentMCPStatus(req.params.id);
    res.json({ agentId: req.params.id, status });
  } catch (err) {
    logger.error("Reconnect agent MCP server failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id/mcp/tools — List MCP-discovered tools for agent
router.get("/:id/mcp/tools", async (req, res) => {
  const tools = getAgentMCPTools(req.params.id).map(t => ({
    name: t.name, description: t.description,
  }));
  res.json({ agentId: req.params.id, tools });
});

export default router;
