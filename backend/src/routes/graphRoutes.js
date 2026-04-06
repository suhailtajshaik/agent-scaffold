import { Router } from "express";
import { getFullTopology, getAgentDependencies } from "../graph/queries.js";
import { isFallback } from "../graph/client.js";
import { logger } from "../config/logger.js";

const router = Router();

// GET /api/graph/topology — Full graph topology
router.get("/topology", async (req, res) => {
  if (isFallback()) {
    return res.json({
      fallback: true,
      message: "JanusGraph not connected — topology unavailable",
      vertices: [], edges: [],
    });
  }
  try {
    const topology = await getFullTopology();
    res.json(topology);
  } catch (err) {
    logger.error("Topology query failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/agent/:id/dependencies — Agent dependency subgraph
router.get("/agent/:id/dependencies", async (req, res) => {
  if (isFallback()) {
    return res.json({ fallback: true, agentId: req.params.id, tools: [], delegationTargets: [] });
  }
  try {
    const deps = await getAgentDependencies(req.params.id);
    res.json(deps);
  } catch (err) {
    logger.error("Agent dependencies query failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
