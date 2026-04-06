import { Router } from "express";
import { agentStore } from "../agents/agentStore.js";
import { getLocalToolNames } from "../tools/index.js";
import { getAgentMCPTools } from "../tools/perAgentMCP.js";
import { logger } from "../config/logger.js";

const router = Router();

// GET /api/tools/available — List all tools available for assignment
router.get("/available", (req, res) => {
  const tools = getLocalToolNames();
  res.json({ tools });
});

// GET /api/agents/:id/tools — List agent's assigned tools
router.get("/:id/tools", async (req, res) => {
  try {
    const agent = await agentStore.get(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const mcpTools = getAgentMCPTools(req.params.id).map(t => ({
      name: t.name, description: t.description, source: "mcp",
    }));

    res.json({
      agentId: req.params.id,
      configuredTools: agent.tools, // null = all, [] = none, [...] = specific
      mcpTools,
    });
  } catch (err) {
    logger.error("Get agent tools failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/agents/:id/tools — Set agent's tool list (full replace)
router.put("/:id/tools", async (req, res) => {
  try {
    const { tools } = req.body;
    // Validate: must be null or array of strings
    if (tools !== null && !Array.isArray(tools)) {
      return res.status(400).json({ error: "tools must be null (all tools) or an array of tool names" });
    }
    if (Array.isArray(tools) && tools.some(t => typeof t !== "string")) {
      return res.status(400).json({ error: "Each tool must be a string name" });
    }

    const agent = await agentStore.patch(req.params.id, { tools });
    res.json({ agent });
  } catch (err) {
    logger.error("Set agent tools failed", { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

export default router;
