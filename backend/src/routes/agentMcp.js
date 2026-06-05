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
import { isValidServerName, validateServerConfig } from "./mcpValidation.js";
import { sendError } from "./httpErrors.js";

const router = Router();

// GET /api/agents/:id/mcp/servers — List agent's MCP servers
router.get("/:id/mcp/servers", async (req, res) => {
  try {
    const agent = await agentStore.get(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const config = await getAgentMCPConfig(req.params.id);
    const status = getAgentMCPStatus(req.params.id);

    res.json({ agentId: req.params.id, config, status });
  } catch (err) {
    sendError(res, err, "Get agent MCP servers failed");
  }
});

// POST /api/agents/:id/mcp/servers — Add MCP server to agent
router.post("/:id/mcp/servers", async (req, res) => {
  try {
    const agent = await agentStore.get(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const { name, config: serverConfig } = req.body;
    if (!isValidServerName(name)) {
      return res.status(400).json({ error: "name must be 1-64 alphanumeric/dash/underscore characters" });
    }
    const configError = validateServerConfig(serverConfig);
    if (configError) {
      return res.status(400).json({ error: configError });
    }

    await addAgentMCPServer(req.params.id, name, serverConfig);
    const status = getAgentMCPStatus(req.params.id);
    res.json({ agentId: req.params.id, status });
  } catch (err) {
    sendError(res, err, "Add agent MCP server failed");
  }
});

// DELETE /api/agents/:id/mcp/servers/:name — Remove MCP server from agent
router.delete("/:id/mcp/servers/:name", async (req, res) => {
  try {
    if (!isValidServerName(req.params.name)) {
      return res.status(400).json({ error: "Invalid server name" });
    }
    await removeAgentMCPServer(req.params.id, req.params.name);
    res.json({ removed: true, agentId: req.params.id, serverName: req.params.name });
  } catch (err) {
    sendError(res, err, "Remove agent MCP server failed");
  }
});

// POST /api/agents/:id/mcp/servers/:name/reconnect
router.post("/:id/mcp/servers/:name/reconnect", async (req, res) => {
  try {
    if (!isValidServerName(req.params.name)) {
      return res.status(400).json({ error: "Invalid server name" });
    }
    await reconnectAgentMCPServer(req.params.id, req.params.name);
    const status = getAgentMCPStatus(req.params.id);
    res.json({ agentId: req.params.id, status });
  } catch (err) {
    sendError(res, err, "Reconnect agent MCP server failed");
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
