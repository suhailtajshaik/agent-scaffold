// src/memory/stateStore.js
// Scoped state manager with three persistence levels:
//   - session: scoped to a single session (expires with session)
//   - user:    persists across sessions for a given userId
//   - app:     global, shared across all users and sessions
import { logger } from "../config/logger.js";

// ── In-memory backing stores ────────────────────────────────────────────────
const stores = {
  session: new Map(), // key: sessionId  → Map of key-value pairs
  user: new Map(),    // key: userId     → Map of key-value pairs
  app: new Map(),     // single entry "_global" → Map of key-value pairs
};

// Seed the app-level map so it always exists
stores.app.set("_global", new Map());

let redisClient = null;

// ── Redis initialisation ────────────────────────────────────────────────────
/**
 * Optionally connect the state store to Redis.
 * Must be called once at startup (before any get/set calls).
 *
 * @param {string|null} redisUrl - e.g. "redis://localhost:6379"
 */
export async function initStateStore(redisUrl) {
  if (!redisUrl) return;
  try {
    const Redis = (await import("ioredis")).default;
    redisClient = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
    redisClient.on("error", (err) => {
      logger.error("State store Redis error", { error: err.message });
    });
    logger.info("State store using Redis");
  } catch (err) {
    logger.warn("Redis not available for state store, using in-memory", {
      error: err.message,
    });
    redisClient = null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────
export const stateStore = {
  /**
   * Retrieve a single value from scoped state.
   *
   * @param {"session"|"user"|"app"} scope
   * @param {string|null} scopeId  - sessionId / userId (ignored for "app")
   * @param {string} key
   * @returns {Promise<any>}
   */
  async get(scope, scopeId, key) {
    if (redisClient) {
      const val = await redisClient.hget(_redisKey(scope, scopeId), key);
      return val !== null ? JSON.parse(val) : undefined;
    }
    return _memGet(scope, scopeId, key);
  },

  /**
   * Store a value in scoped state.
   *
   * @param {"session"|"user"|"app"} scope
   * @param {string|null} scopeId
   * @param {string} key
   * @param {*} value  - must be JSON-serialisable
   * @returns {Promise<void>}
   */
  async set(scope, scopeId, key, value) {
    if (redisClient) {
      const redisKey = _redisKey(scope, scopeId);
      await redisClient.hset(redisKey, key, JSON.stringify(value));
      // Session-scoped state expires after 1 hour, matching session TTL
      if (scope === "session") await redisClient.expire(redisKey, 3600);
      return;
    }
    _memSet(scope, scopeId, key, value);
  },

  /**
   * Delete a single key from scoped state.
   *
   * @param {"session"|"user"|"app"} scope
   * @param {string|null} scopeId
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(scope, scopeId, key) {
    if (redisClient) {
      await redisClient.hdel(_redisKey(scope, scopeId), key);
      return;
    }
    _memDelete(scope, scopeId, key);
  },

  /**
   * Return all key-value pairs stored under a scope/scopeId.
   *
   * @param {"session"|"user"|"app"} scope
   * @param {string|null} scopeId
   * @returns {Promise<Record<string, any>>}
   */
  async getAll(scope, scopeId) {
    if (redisClient) {
      const data = await redisClient.hgetall(_redisKey(scope, scopeId));
      if (!data) return {};
      const result = {};
      for (const [k, v] of Object.entries(data)) {
        result[k] = JSON.parse(v);
      }
      return result;
    }
    return _memGetAll(scope, scopeId);
  },

  /**
   * Delete all state for a given scope/scopeId.
   *
   * @param {"session"|"user"|"app"} scope
   * @param {string|null} scopeId
   * @returns {Promise<void>}
   */
  async clearScope(scope, scopeId) {
    if (redisClient) {
      await redisClient.del(_redisKey(scope, scopeId));
      return;
    }
    _memClear(scope, scopeId);
  },
};

// ── Redis helpers ───────────────────────────────────────────────────────────
function _redisKey(scope, scopeId) {
  if (scope === "app") return "state:app";
  return `state:${scope}:${scopeId}`;
}

// ── In-memory helpers ───────────────────────────────────────────────────────
function _resolveId(scope, scopeId) {
  return scope === "app" ? "_global" : scopeId;
}

function _memGet(scope, scopeId, key) {
  const id = _resolveId(scope, scopeId);
  return stores[scope]?.get(id)?.get(key);
}

function _memSet(scope, scopeId, key, value) {
  const id = _resolveId(scope, scopeId);
  if (!stores[scope].has(id)) stores[scope].set(id, new Map());
  stores[scope].get(id).set(key, value);
}

function _memDelete(scope, scopeId, key) {
  const id = _resolveId(scope, scopeId);
  stores[scope]?.get(id)?.delete(key);
}

function _memGetAll(scope, scopeId) {
  const id = _resolveId(scope, scopeId);
  const map = stores[scope]?.get(id);
  if (!map) return {};
  return Object.fromEntries(map);
}

function _memClear(scope, scopeId) {
  const id = _resolveId(scope, scopeId);
  stores[scope]?.delete(id);
}
