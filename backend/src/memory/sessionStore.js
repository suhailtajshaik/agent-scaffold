// src/memory/sessionStore.js
// In-memory store — swap for Redis/MongoDB in production
import { logger } from "../config/logger.js";

const sessions = new Map();
const MAX_MESSAGES_PER_SESSION = 50;
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
      // Always keep system message if present at index 0
      const hasSystem = session.messages[0]?.role === "system";
      const keep = hasSystem
        ? [session.messages[0], ...session.messages.slice(-(MAX_MESSAGES_PER_SESSION - 1))]
        : session.messages.slice(-MAX_MESSAGES_PER_SESSION);
      session.messages = keep;
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
