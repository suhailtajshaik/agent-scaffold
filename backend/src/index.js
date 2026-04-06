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
import mcpRoutes from "./routes/mcp.js";
import agentCrudRoutes from "./routes/agentCrud.js";
import agentMcpRoutes from "./routes/agentMcp.js";
import toolAssignmentRoutes from "./routes/toolAssignment.js";
import graphRoutes from "./routes/graphRoutes.js";
import { getLocalToolNames } from "./tools/index.js";
import { agentStore } from "./agents/agentStore.js";
import { initGraph, closeGraph } from "./graph/client.js";
import { initSchema } from "./graph/schema.js";
import { shutdownAllAgentMCP } from "./tools/perAgentMCP.js";

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
app.use("/api/mcp", mcpRoutes);
app.use("/api/agents", agentCrudRoutes);
app.use("/api/agents", agentMcpRoutes);         // for /:id/mcp/* endpoints
app.use("/api/agents", toolAssignmentRoutes);    // for /:id/tools endpoints
app.get("/api/tools/available", (req, res) => {  // available tools (no collision)
  res.json({ tools: getLocalToolNames() });
});
app.use("/api/graph", graphRoutes);

// ── Optional frontend static serving ─────────────────────────────────────────
if (config.enableUI) {
  const { default: fs } = await import("fs");
  const { default: path } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "../../frontend/dist");

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      // Only serve index.html for non-API routes
      if (req.path.startsWith("/api") || req.path.startsWith("/health")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
    logger.info(`Frontend static files served from ${distPath}`);
  }
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error Handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  await closeGraph();
  await shutdownAllAgentMCP();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Start ─────────────────────────────────────────────────────────────────────
(async () => {
  validateConfig();

  // Initialize JanusGraph (no-op / fallback when JANUSGRAPH_URL is unset)
  await initGraph(config.janusgraphUrl);

  // Verify schema / run health-check query
  await initSchema();

  // Seed the default agent if no agents exist yet
  await agentStore.seedDefault();

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
