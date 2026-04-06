// src/graph/client.js
// JanusGraph client singleton using the Gremlin protocol.
// When JanusGraph is not available (no JANUSGRAPH_URL or connection failure),
// the module falls into fallback mode: all query helpers return null/empty and
// the rest of the application continues to work via Redis.
import { logger } from "../config/logger.js";

// Lazily-resolved gremlin module — imported dynamically so the server starts
// even when the package has not yet finished installing.
let gremlin;

let client = null;
let _connected = false;
let _fallbackMode = false;

/**
 * Initialise the JanusGraph connection.
 * Call once at startup (e.g. from src/index.js).
 *
 * @param {string|undefined} url  WebSocket URL, e.g. "ws://localhost:8182/gremlin"
 */
export async function initGraph(url) {
  if (!url) {
    logger.info("No JANUSGRAPH_URL configured — using in-memory graph fallback");
    _fallbackMode = true;
    return;
  }

  try {
    gremlin = await import("gremlin");

    // The gremlin package exposes its Client under driver.Client
    const GremlinClient = gremlin.driver.Client;

    client = new GremlinClient(url, {
      traversalSource: "g",
      mimeType: "application/json",
    });

    await client.open();
    _connected = true;
    logger.info(`JanusGraph connected: ${url}`);
  } catch (err) {
    logger.error("JanusGraph connection failed, using in-memory fallback", {
      error: err.message,
    });
    _fallbackMode = true;
  }
}

/** Returns the raw Gremlin Client instance (null in fallback mode). */
export function getClient() {
  return client;
}

/** True when the WebSocket connection to JanusGraph is open. */
export function isConnected() {
  return _connected;
}

/** True when JanusGraph is unavailable and the layer is running without graph persistence. */
export function isFallback() {
  return _fallbackMode;
}

/**
 * Submit a Gremlin string query to JanusGraph.
 * Returns null (not an error) when in fallback mode.
 *
 * @param {string} query     Gremlin traversal string
 * @param {object} bindings  Named parameter bindings
 * @returns {Promise<any[]|null>}
 */
export async function submitQuery(query, bindings = {}) {
  if (_fallbackMode || !client) return null;

  try {
    const result = await client.submit(query, bindings);
    return result.toArray();
  } catch (err) {
    logger.error("Gremlin query failed", { query, error: err.message });
    throw err;
  }
}

/**
 * Gracefully close the JanusGraph connection.
 * Safe to call even when in fallback mode.
 */
export async function closeGraph() {
  if (client) {
    try {
      await client.close();
      _connected = false;
      logger.info("JanusGraph connection closed");
    } catch (err) {
      logger.error("Error closing JanusGraph", { error: err.message });
    }
  }
}
