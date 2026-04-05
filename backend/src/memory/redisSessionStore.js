// src/memory/redisSessionStore.js
// Redis-backed session store with the same interface as the in-memory sessionStore.
import Redis from "ioredis";
import { logger } from "../config/logger.js";
import { serializeMessages, deserializeMessages } from "./messageSerializer.js";

const MAX_MESSAGES_PER_SESSION = 100;
const SESSION_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Build the Redis key for a session.
 *
 * @param {string} sessionId
 * @returns {string}
 */
function sessionKey(sessionId) {
  return `session:${sessionId}`;
}

/**
 * Apply the same smart truncation logic as the in-memory store:
 * - Never split a tool call / tool result pair.
 * - Walk forward to the nearest HumanMessage boundary after the raw cut point.
 * - Preserve a leading SystemMessage when present.
 *
 * @param {Array} messages - LangChain message instances
 * @returns {Array} Truncated array (mutates nothing, returns new reference)
 */
function truncateMessages(messages) {
  if (messages.length <= MAX_MESSAGES_PER_SESSION) return messages;

  const hasSystem =
    messages[0]?._getType?.() === "system" || messages[0]?.role === "system";
  const startIdx = hasSystem ? 1 : 0;

  let cutIndex = messages.length - MAX_MESSAGES_PER_SESSION;
  if (cutIndex <= startIdx) return messages;

  // Walk forward to the nearest HumanMessage boundary
  while (cutIndex < messages.length) {
    const msgType =
      messages[cutIndex]._getType?.() || messages[cutIndex]?.role;
    if (msgType === "human") break;
    cutIndex++;
  }

  return hasSystem
    ? [messages[0], ...messages.slice(cutIndex)]
    : messages.slice(cutIndex);
}

/**
 * Create and return a Redis-backed session store.
 * Resolves once the connection is confirmed ready.
 *
 * @param {string} redisUrl - Connection string, e.g. "redis://localhost:6379"
 * @returns {Promise<Object>} Session store with the standard interface
 */
export async function createRedisSessionStore(redisUrl) {
  const client = new Redis(redisUrl, {
    // Disable ioredis's built-in auto-retry on command failure — let callers
    // surface errors rather than hanging indefinitely.
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  client.on("error", (err) => {
    logger.error("Redis client error", { error: err.message });
  });

  client.on("connect", () => {
    logger.info("Redis client connected");
  });

  client.on("ready", () => {
    logger.info("Redis client ready");
  });

  // Wait for the client to be ready before returning the store.
  await new Promise((resolve, reject) => {
    if (client.status === "ready") {
      resolve();
      return;
    }
    const onReady = () => { client.off("error", onError); resolve(); };
    const onError = (err) => { client.off("ready", onReady); reject(err); };
    client.once("ready", onReady);
    client.once("error", onError);
  });

  const store = {
    /**
     * Get messages for a session.
     * Refreshes the TTL on every access.
     *
     * @param {string} sessionId
     * @returns {Promise<Array>} LangChain message instances (may be empty)
     */
    async getMessages(sessionId) {
      const key = sessionKey(sessionId);
      try {
        const [rawMessages, _] = await Promise.all([
          client.hget(key, "messages"),
          client.expire(key, SESSION_TTL_SECONDS),
        ]);

        if (!rawMessages) return [];

        await client.hset(key, "lastAccessed", Date.now());

        const parsed = JSON.parse(rawMessages);
        return deserializeMessages(parsed);
      } catch (err) {
        logger.error("Redis getMessages error", { sessionId, error: err.message });
        return [];
      }
    },

    /**
     * Append new messages to a session.
     * Creates the session entry if it does not exist.
     * Applies smart truncation to stay within MAX_MESSAGES_PER_SESSION.
     * Refreshes the TTL.
     *
     * @param {string} sessionId
     * @param {Array} newMessages - LangChain message instances
     * @returns {Promise<void>}
     */
    async appendMessages(sessionId, newMessages) {
      const key = sessionKey(sessionId);
      try {
        const now = Date.now();

        // Read existing state
        const [rawMessages, existingCreatedAt] = await Promise.all([
          client.hget(key, "messages"),
          client.hget(key, "createdAt"),
        ]);

        const existing = rawMessages
          ? deserializeMessages(JSON.parse(rawMessages))
          : [];

        const createdAt = existingCreatedAt ? parseInt(existingCreatedAt, 10) : now;

        // Merge and truncate
        const merged = truncateMessages([...existing, ...newMessages]);
        const serialized = serializeMessages(merged);

        await client.hset(key, {
          messages: JSON.stringify(serialized),
          createdAt,
          lastAccessed: now,
        });

        await client.expire(key, SESSION_TTL_SECONDS);
      } catch (err) {
        logger.error("Redis appendMessages error", { sessionId, error: err.message });
      }
    },

    /**
     * Delete a session entirely.
     *
     * @param {string} sessionId
     * @returns {Promise<void>}
     */
    async clearSession(sessionId) {
      try {
        await client.del(sessionKey(sessionId));
        logger.debug(`Session cleared: ${sessionId}`);
      } catch (err) {
        logger.error("Redis clearSession error", { sessionId, error: err.message });
      }
    },

    /**
     * List all active sessions (metadata only).
     * Uses SCAN to avoid blocking the Redis event loop.
     *
     * @returns {Promise<Array<Object>>} Array of { id, messageCount, createdAt, lastAccessed }
     */
    async listSessions() {
      const results = [];
      try {
        let cursor = "0";
        do {
          const [nextCursor, keys] = await client.scan(
            cursor,
            "MATCH",
            "session:*",
            "COUNT",
            100
          );
          cursor = nextCursor;

          if (keys.length === 0) continue;

          // Fetch metadata for each key in parallel
          const fetches = keys.map(async (key) => {
            try {
              const [rawMessages, createdAt, lastAccessed] = await Promise.all([
                client.hget(key, "messages"),
                client.hget(key, "createdAt"),
                client.hget(key, "lastAccessed"),
              ]);

              const id = key.replace(/^session:/, "");
              const messageCount = rawMessages
                ? JSON.parse(rawMessages).length
                : 0;

              return {
                id,
                messageCount,
                createdAt: createdAt ? parseInt(createdAt, 10) : null,
                lastAccessed: lastAccessed ? parseInt(lastAccessed, 10) : null,
              };
            } catch {
              return null;
            }
          });

          const fetched = await Promise.all(fetches);
          for (const entry of fetched) {
            if (entry !== null) results.push(entry);
          }
        } while (cursor !== "0");
      } catch (err) {
        logger.error("Redis listSessions error", { error: err.message });
      }
      return results;
    },

    /**
     * No-op: Redis TTL handles expiration automatically.
     * Logs a message to make this behaviour visible in diagnostics.
     *
     * @returns {Promise<void>}
     */
    async pruneExpired() {
      logger.info(
        "pruneExpired called on Redis session store — TTL-based expiry is handled automatically by Redis"
      );
    },
  };

  return store;
}
