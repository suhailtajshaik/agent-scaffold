// src/routes/health.js
import { Router } from "express";
import { config } from "../config/index.js";
import { sessionStore } from "../memory/index.js";
import { getToolsInfo } from "../tools/index.js";
import { getMCPStatus } from "../tools/mcpManager.js";

const router = Router();

router.get("/", async (req, res) => {
  const sessions = await sessionStore.listSessions();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    model: config.model,
    tools: getToolsInfo().map((t) => t.name),
    activeSessions: sessions.length,
    environment: config.nodeEnv,
    mcp: getMCPStatus(),
  });
});

export default router;
