// src/memory/sessionStore.js
// In-memory store — swap for Redis/MongoDB in production
import { logger } from "../config/logger.js";

const sessions = new Map();
const MAX_MESSAGES_PER_SESSION = 100;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

export const sessionStore = {
  /**
   * Get messages for a session
   */
  getMessages(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return [];
    session.lastAccessed = Date.now();
    return session.messages;
  },

  /**
   * Append messages to a session
   */
  appendMessages(sessionId, newMessages) {
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        messages: [],
        createdAt: Date.now(),
        lastAccessed: Date.now(),
      });
    }
    const session = sessions.get(sessionId);
    session.messages.push(...newMessages);
    session.lastAccessed = Date.now();

    // Keep only the last N messages to avoid token overflow
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      const hasSystem = session.messages[0]?._getType?.() === "system"
        || session.messages[0]?.role === "system";
      const startIdx = hasSystem ? 1 : 0;

      // Find a safe truncation point — never cut inside a tool call/result pair
      let cutIndex = session.messages.length - MAX_MESSAGES_PER_SESSION;
      if (cutIndex <= startIdx) return;

      // Walk forward to the nearest HumanMessage boundary
      while (cutIndex < session.messages.length) {
        const msgType = session.messages[cutIndex]._getType?.()
          || session.messages[cutIndex]?.role;
        if (msgType === "human") break;
        cutIndex++;
      }

      session.messages = hasSystem
        ? [session.messages[0], ...session.messages.slice(cutIndex)]
        : session.messages.slice(cutIndex);
    }
  },

  /**
   * Clear a session
   */
  clearSession(sessionId) {
    sessions.delete(sessionId);
    logger.debug(`Session cleared: ${sessionId}`);
  },

  /**
   * List all active sessions (metadata only)
   */
  listSessions() {
    const result = [];
    for (const [id, session] of sessions.entries()) {
      result.push({
        id,
        messageCount: session.messages.length,
        createdAt: session.createdAt,
        lastAccessed: session.lastAccessed,
      });
    }
    return result;
  },

  /**
   * Prune expired sessions
   */
  pruneExpired() {
    const now = Date.now();
    let pruned = 0;
    for (const [id, session] of sessions.entries()) {
      if (now - session.lastAccessed > SESSION_TTL_MS) {
        sessions.delete(id);
        pruned++;
      }
    }
    if (pruned > 0) logger.info(`Pruned ${pruned} expired sessions`);
    return pruned;
  },
};

// Auto-prune every 15 minutes
setInterval(() => sessionStore.pruneExpired(), 15 * 60 * 1000);
