// src/memory/index.js
// Factory that selects the correct session store at startup based on env config.
// When REDIS_URL is set the Redis-backed store is used; otherwise the in-memory
// store is used as a fallback so local development works without Redis.
// Also initialises the scoped state store (session / user / app).
import { config } from "../config/index.js";
import { sessionStore as inMemoryStore } from "./sessionStore.js";
import { initStateStore, stateStore } from "./stateStore.js";
import { logger } from "../config/logger.js";

let sessionStore;

if (config.redisUrl) {
  try {
    const { createRedisSessionStore } = await import("./redisSessionStore.js");
    sessionStore = await createRedisSessionStore(config.redisUrl);
    logger.info("Using Redis session store");
  } catch (err) {
    logger.error("Failed to connect to Redis, falling back to in-memory store", { error: err.message });
    sessionStore = inMemoryStore;
  }
} else {
  sessionStore = inMemoryStore;
  logger.info("Using in-memory session store (no REDIS_URL configured)");
}

// Initialise the state store with the same Redis URL (no-op when redisUrl is null)
await initStateStore(config.redisUrl);

export { sessionStore, stateStore };
