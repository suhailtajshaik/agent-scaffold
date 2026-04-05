// src/index.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config, validateConfig } from "./config/index.js";
import { logger } from "./config/logger.js";
import { apiRateLimiter, requestLogger, errorHandler } from "./middleware/index.js";
import agentRoutes from "./routes/agent.js";
import healthRoutes from "./routes/health.js";
import { loadMCPConfig } from "./config/mcp.config.js";
import { initMCPTools, shutdownMCP } from "./tools/mcpManager.js";
import { setMCPTools } from "./tools/index.js";
import { resetDefaultAgent } from "./agents/defaultAgent.js";

// Validate environment before starting
validateConfig();

const app = express();

// ── Security & Parsing ────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// ── Logging ───────────────────────────────────────────────────────────────────
if (config.nodeEnv !== "test") {
  app.use(morgan("dev"));
}
app.use(requestLogger);

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.use("/api/", apiRateLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/health", healthRoutes);
app.use("/api/agent", agentRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  await shutdownMCP();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Start ─────────────────────────────────────────────────────────────────────
(async () => {
  // Initialize MCP tools before starting the server
  const mcpConfig = loadMCPConfig();
  const mcpTools = await initMCPTools(mcpConfig);

  if (mcpTools.length > 0) {
    setMCPTools(mcpTools);
    resetDefaultAgent();
  }

  app.listen(config.port, () => {
    logger.info(`╔═══════════════════════════════════════╗`);
    logger.info(`║     Agent Scaffold Backend Started     ║`);
    logger.info(`╠═══════════════════════════════════════╣`);
    logger.info(`║  Port    : ${config.port}                        ║`);
    logger.info(`║  Model   : ${config.model}  ║`);
    logger.info(`║  Env     : ${config.nodeEnv}               ║`);
    logger.info(`╚═══════════════════════════════════════╝`);
  });
})();

export default app;
