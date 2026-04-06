// src/routes/agent.js
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { buildRequestAgent } from "../agents/agentCompiler.js";
import { agentStore } from "../agents/agentStore.js";
import { runAgent } from "../agents/agentFactory.js";
import { sessionStore, stateStore } from "../memory/index.js";
import { sanitizeInput, extractUserId } from "../middleware/index.js";
import { getAllTools, getToolsInfo } from "../tools/index.js";
import { logger } from "../config/logger.js";

const router = Router();

// ── POST /api/agent/chat ──────────────────────────────────────────────────
// Standard (non-streaming) chat endpoint
router.post("/chat", sanitizeInput, extractUserId, async (req, res) => {
  const { message, sessionId: clientSessionId, agentId } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const sessionId = clientSessionId || uuidv4();

  try {
    const { agent, config: agentConfig } = await buildRequestAgent(agentId, sessionId, req.userId);
    const result = await runAgent({ agent, sessionId, userMessage: message });

    res.json({
      sessionId,
      agentId: agentConfig.id,
      agentName: agentConfig.name,
      message: result.text,
      toolsUsed: result.toolsUsed,
      durationMs: result.durationMs,
    });
  } catch (err) {
    logger.error("Chat error", { error: err.message });
    res.status(500).json({ error: "Agent failed to respond", detail: err.message });
  }
});

// ── POST /api/agent/stream ────────────────────────────────────────────────
// Server-Sent Events streaming endpoint
router.post("/stream", sanitizeInput, extractUserId, async (req, res) => {
  const { message, sessionId: clientSessionId, agentId } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const sessionId = clientSessionId || uuidv4();

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering

  const send = (eventType, data) => {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send session ID immediately
  send("session", { sessionId });

  try {
    const { agent, config: agentConfig } = await buildRequestAgent(
      agentId, sessionId, req.userId, 0,
      (evt) => send("delegation", evt) // delegation callback emits SSE events
    );

    await runAgent({
      agent,
      sessionId,
      userMessage: message,
      onChunk: (chunk) => {
        if (chunk.type === "text") {
          send("text", { text: chunk.text });
        } else if (chunk.type === "tool_call") {
          send("tool_call", { toolName: chunk.toolName, args: chunk.args });
        } else if (chunk.type === "tool_result") {
          send("tool_result", { toolName: chunk.toolName });
        }
      },
    });

    send("done", { sessionId, agentId: agentConfig.id, agentName: agentConfig.name });
    res.end();
  } catch (err) {
    logger.error("Stream error", { error: err.message });
    send("error", { error: err.message });
    res.end();
  }
});

// ── GET /api/agent/sessions ───────────────────────────────────────────────
router.get("/sessions", async (req, res) => {
  res.json({ sessions: await sessionStore.listSessions() });
});

// ── DELETE /api/agent/sessions/:id ───────────────────────────────────────
router.delete("/sessions/:id", async (req, res) => {
  await sessionStore.clearSession(req.params.id);
  res.json({ cleared: true, sessionId: req.params.id });
});

// ── GET /api/agent/tools ──────────────────────────────────────────────────
router.get("/tools", (req, res) => {
  res.json({ tools: getToolsInfo() });
});

// ── GET /api/agent/agents ─────────────────────────────────────────────────
router.get("/agents", async (req, res) => {
  const agents = await agentStore.list();
  res.json({
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      isDefault: a.isDefault,
      status: a.status,
    })),
  });
});

// ── GET /api/agent/history/:sessionId ────────────────────────────────────
router.get("/history/:sessionId", async (req, res) => {
  const messages = await sessionStore.getMessages(req.params.sessionId);
  const formatted = messages.map((m) => {
    const role =
      m._getType?.() ||
      m.constructor?.name?.replace("Message", "").toLowerCase() ||
      "unknown";
    const entry = {
      role,
      content:
        typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    };
    if (m.tool_calls?.length) entry.tool_calls = m.tool_calls;
    if (m.tool_call_id) entry.tool_call_id = m.tool_call_id;
    if (role === "tool" && m.name) entry.tool_name = m.name;
    return entry;
  });
  res.json({ sessionId: req.params.sessionId, messages: formatted });
});

// ── GET /api/agent/state/:scope/:scopeId? ────────────────────────────────
// Direct REST access to scoped state (no agent required).
//
// Examples:
//   GET /api/agent/state/app          — all app-level state
//   GET /api/agent/state/session/:id  — all state for a session
//   GET /api/agent/state/user          — all state for the authenticated user
//                                        (requires x-user-id header)
router.get("/state/:scope/:scopeId?", extractUserId, async (req, res) => {
  const { scope, scopeId: paramScopeId } = req.params;

  if (!["session", "user", "app"].includes(scope)) {
    return res.status(400).json({
      error: "scope must be one of: session, user, app",
    });
  }

  let scopeId;
  if (scope === "session") {
    scopeId = paramScopeId;
    if (!scopeId) {
      return res.status(400).json({ error: "scopeId (session ID) is required for session scope" });
    }
  } else if (scope === "user") {
    scopeId = req.userId;
    if (!scopeId) {
      return res.status(400).json({
        error: "x-user-id header is required for user scope",
      });
    }
  } else {
    // app scope — no scopeId needed
    scopeId = null;
  }

  try {
    const state = await stateStore.getAll(scope, scopeId);
    res.json({ scope, scopeId: scopeId ?? "global", state });
  } catch (err) {
    logger.error("State fetch error", { scope, scopeId, error: err.message });
    res.status(500).json({ error: "Failed to fetch state", detail: err.message });
  }
});

export default router;
