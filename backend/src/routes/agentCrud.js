import { Router } from "express";
import { agentStore } from "../agents/agentStore.js";
import { logger } from "../config/logger.js";

const router = Router();

// GET /api/agents — List all agents
router.get("/", async (req, res) => {
  try {
    const agents = await agentStore.list();
    // Don't expose full systemPrompt in list view (it can be large)
    const summary = agents.map(a => ({
      id: a.id, name: a.name, description: a.description,
      isDefault: a.isDefault, status: a.status, enableUI: a.enableUI,
      tools: a.tools, model: a.model,
      createdAt: a.createdAt, updatedAt: a.updatedAt,
    }));
    res.json({ agents: summary });
  } catch (err) {
    logger.error("List agents failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id — Get full agent config
router.get("/:id", async (req, res) => {
  try {
    const agent = await agentStore.get(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });
    res.json({ agent });
  } catch (err) {
    logger.error("Get agent failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents — Create agent
router.post("/", async (req, res) => {
  try {
    const agent = await agentStore.create(req.body);
    res.status(201).json({ agent });
  } catch (err) {
    logger.error("Create agent failed", { error: err.message });
    const status = err.message.includes("required") || err.message.includes("unique") ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PUT /api/agents/:id — Full update
router.put("/:id", async (req, res) => {
  try {
    const agent = await agentStore.update(req.params.id, req.body);
    res.json({ agent });
  } catch (err) {
    logger.error("Update agent failed", { error: err.message });
    const status = err.message.includes("not found") ? 404
      : err.message.includes("required") || err.message.includes("unique") ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PATCH /api/agents/:id — Partial update
router.patch("/:id", async (req, res) => {
  try {
    const agent = await agentStore.patch(req.params.id, req.body);
    res.json({ agent });
  } catch (err) {
    logger.error("Patch agent failed", { error: err.message });
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/agents/:id — Delete agent
router.delete("/:id", async (req, res) => {
  try {
    await agentStore.delete(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    logger.error("Delete agent failed", { error: err.message });
    const status = err.message.includes("not found") ? 404
      : err.message.includes("Cannot delete") ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/agents/:id/clone — Clone an agent with a new name
router.post("/:id/clone", async (req, res) => {
  try {
    const source = await agentStore.get(req.params.id);
    if (!source) return res.status(404).json({ error: "Agent not found" });

    const { id, createdAt, updatedAt, isDefault, ...cloneData } = source;
    cloneData.name = req.body.name || `${source.name} (copy)`;
    cloneData.isDefault = false;

    const agent = await agentStore.create(cloneData);
    res.status(201).json({ agent });
  } catch (err) {
    logger.error("Clone agent failed", { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

export default router;
