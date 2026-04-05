// src/routes/health.js
import { Router } from "express";
import { config } from "../config/index.js";
import { sessionStore } from "../memory/sessionStore.js";
import { getToolsInfo } from "../tools/index.js";

const router = Router();

router.get("/", (req, res) => {
  const sessions = sessionStore.listSessions();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    model: config.model,
    tools: getToolsInfo().map((t) => t.name),
    activeSessions: sessions.length,
    environment: config.nodeEnv,
  });
});

export default router;
