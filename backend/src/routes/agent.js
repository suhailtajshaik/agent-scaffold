// src/routes/agent.js
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDefaultAgent } from "../agents/defaultAgent.js";
import { runAgent } from "../agents/agentFactory.js";
import { sessionStore } from "../memory/sessionStore.js";
import { sanitizeInput } from "../middleware/index.js";
import { getToolsInfo } from "../tools/index.js";
import { logger } from "../config/logger.js";

const router = Router();

// ── POST /api/agent/chat ──────────────────────────────────────────────────────
// Standard (non-streaming) chat endpoint
router.post("/chat", sanitizeInput, async (req, res) => {
  const { message, sessionId: clientSessionId } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const sessionId = clientSessionId || uuidv4();

  try {
    const agent = getDefaultAgent();
    const result = await runAgent({ agent, sessionId, userMessage: message });

    res.json({
      sessionId,
      message: result.text,
      toolsUsed: result.toolsUsed,
      durationMs: result.durationMs,
    });
  } catch (err) {
    logger.error("Chat error", { error: err.message });
    res.status(500).json({ error: "Agent failed to respond", detail: err.message });
  }
});

// ── POST /api/agent/stream ────────────────────────────────────────────────────
// Server-Sent Events streaming endpoint
router.post("/stream", sanitizeInput, async (req, res) => {
  const { message, sessionId: clientSessionId } = req.body;

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
    const agent = getDefaultAgent();

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

    send("done", { sessionId });
    res.end();
  } catch (err) {
    logger.error("Stream error", { error: err.message });
    send("error", { error: err.message });
    res.end();
  }
});

// ── GET /api/agent/sessions ───────────────────────────────────────────────────
router.get("/sessions", (req, res) => {
  res.json({ sessions: sessionStore.listSessions() });
});

// ── DELETE /api/agent/sessions/:id ───────────────────────────────────────────
router.delete("/sessions/:id", (req, res) => {
  sessionStore.clearSession(req.params.id);
  res.json({ cleared: true, sessionId: req.params.id });
});

// ── GET /api/agent/tools ──────────────────────────────────────────────────────
router.get("/tools", (req, res) => {
  res.json({ tools: getToolsInfo() });
});

// ── GET /api/agent/history/:sessionId ────────────────────────────────────────
router.get("/history/:sessionId", (req, res) => {
  const messages = sessionStore.getMessages(req.params.sessionId);
  const formatted = messages.map((m) => {
    const role = m._getType?.() || m.constructor?.name?.replace("Message", "").toLowerCase() || "unknown";
    const entry = {
      role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    };
    if (m.tool_calls?.length) entry.tool_calls = m.tool_calls;
    if (m.tool_call_id) entry.tool_call_id = m.tool_call_id;
    if (role === "tool" && m.name) entry.tool_name = m.name;
    return entry;
  });
  res.json({ sessionId: req.params.sessionId, messages: formatted });
});

export default router;
