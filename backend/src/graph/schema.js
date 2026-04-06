// src/graph/schema.js
// JanusGraph schema initialisation.
//
// JanusGraph's DefaultSchemaMaker auto-creates vertex/edge labels and property
// keys the first time they are used, so explicit schema management via Gremlin
// strings from Node.js is not required.  This module runs a simple health-check
// query instead to confirm the connection is working after startup.
import { submitQuery, isFallback } from "./client.js";
import { logger } from "../config/logger.js";

/**
 * Verify the JanusGraph connection and log the current vertex count.
 * Skips silently when running in fallback mode.
 */
export async function initSchema() {
  if (isFallback()) {
    logger.info("Skipping JanusGraph schema init (fallback mode)");
    return;
  }

  try {
    const result = await submitQuery("g.V().count()");
    const count = result?.[0] ?? 0;
    logger.info(`JanusGraph schema ready (${count} vertices)`);
  } catch (err) {
    // A failed health check is not fatal — the application continues and any
    // subsequent query that fails will be logged individually.
    logger.warn("JanusGraph schema check failed", { error: err.message });
  }
}
