// src/agents/agentStore.js
// Central store for agent definitions.
// Dual-mode: Redis-backed when REDIS_URL is configured, in-memory Map fallback otherwise.
//
// Redis data model:
//   Key: agent:{id}     Type: Hash  — all scalar fields as strings
//   Key: agents:index   Type: Set   — contains all agent IDs
//
// Interface:
//   agentStore.list()              → AgentConfig[]
//   agentStore.get(id)             → AgentConfig | null
//   agentStore.getDefault()        → AgentConfig
//   agentStore.create(data)        → AgentConfig
//   agentStore.update(id, data)    → AgentConfig
//   agentStore.patch(id, partial)  → AgentConfig
//   agentStore.delete(id)          → void
//   agentStore.seedDefault()       → void
//   agentStore.onUpdate(callback)  → unsubscribe fn

import { v4 as uuidv4 } from "uuid";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENTS_INDEX_KEY = "agents:index";

/** Build the Redis hash key for a given agent ID. */
function agentKey(id) {
  return `agent:${id}`;
}

// ── Default seed data ─────────────────────────────────────────────────────────

const DEFAULT_AGENT_SEED = {
  name: "Default Agent",
  description: "General-purpose AI assistant with access to all available tools",
  systemPrompt: `You are an intelligent AI assistant. You are helpful, precise, and professional.

You have access to tools for web search, content extraction, site crawling, deep research, calculations, date/time, data formatting, and state management. Each tool accepts dynamic parameters — choose the right tool and configure its parameters based on what the user's request actually needs.

Guidelines:
- Dynamically choose which tools to use and how to configure them based on the request
- For web research: chain tools as needed (search → extract → crawl) depending on the depth required
- Set search parameters (topic, time range, domains, depth, result count) based on what the query demands
- Always use tools when they can provide accurate, current information
- Be concise but thorough in your responses
- When performing calculations, show your work
- Format data clearly for readability
- If unsure, say so rather than guessing

You are running as a scaffold agent. Your capabilities can be extended with additional tools and MCP server connections.`,
  tools: null,
  isDefault: true,
  status: "active",
  enableUI: true,
};

// ── Validation helpers ────────────────────────────────────────────────────────

/**
 * Validate fields supplied for create or update operations.
 * Throws a descriptive Error on the first violation found.
 *
 * @param {object} data - Fields to validate
 * @param {{ allowPartial?: boolean }} [opts]
 */
function validateAgentData(data, { allowPartial = false } = {}) {
  const { name, systemPrompt, tools, status, enableUI } = data;

  if (!allowPartial || name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error("Validation error: 'name' is required and must be a non-empty string");
    }
    if (name.trim().length > 100) {
      throw new Error("Validation error: 'name' must be 100 characters or fewer");
    }
  }

  if (!allowPartial || systemPrompt !== undefined) {
    if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
      throw new Error("Validation error: 'systemPrompt' is required and must be a non-empty string");
    }
  }

  if (tools !== undefined && tools !== null) {
    if (!Array.isArray(tools)) {
      throw new Error("Validation error: 'tools' must be null or an array of strings");
    }
    for (const t of tools) {
      if (typeof t !== "string") {
        throw new Error("Validation error: each entry in 'tools' must be a string");
      }
    }
  }

  if (status !== undefined) {
    if (status !== "active" && status !== "inactive") {
      throw new Error("Validation error: 'status' must be \"active\" or \"inactive\"");
    }
  }

  if (enableUI !== undefined && typeof enableUI !== "boolean") {
    throw new Error("Validation error: 'enableUI' must be a boolean");
  }
}

/**
 * Ensure `name` is unique (case-insensitive) across existing agents.
 * Excludes the agent identified by `excludeId` from the comparison (used on update).
 *
 * @param {AgentConfig[]} allAgents
 * @param {string} name
 * @param {string|null} [excludeId]
 */
function assertNameUnique(allAgents, name, excludeId = null) {
  const normalised = name.trim().toLowerCase();
  const conflict = allAgents.find(
    (a) => a.name.toLowerCase() === normalised && a.id !== excludeId
  );
  if (conflict) {
    throw new Error(`Validation error: an agent named "${name.trim()}" already exists`);
  }
}

// ── Serialisation helpers (Redis stores everything as strings) ────────────────

/**
 * Serialise an AgentConfig object into a flat Record<string, string> suitable
 * for storage in a Redis Hash.
 *
 * @param {object} config
 * @returns {Record<string, string>}
 */
function serialiseToHash(cfg) {
  return {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description ?? "",
    systemPrompt: cfg.systemPrompt,
    tools: JSON.stringify(cfg.tools),          // null → "null", array → "[...]"
    model: cfg.model !== null && cfg.model !== undefined ? cfg.model : "",
    temperature: cfg.temperature !== null && cfg.temperature !== undefined
      ? String(cfg.temperature)
      : "",
    maxTokens: cfg.maxTokens !== null && cfg.maxTokens !== undefined
      ? String(cfg.maxTokens)
      : "",
    isDefault: cfg.isDefault ? "true" : "false",
    status: cfg.status,
    enableUI: cfg.enableUI ? "true" : "false",
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  };
}

/**
 * Deserialise a flat Redis Hash record back to an AgentConfig object.
 *
 * @param {Record<string, string>} hash
 * @returns {object} AgentConfig
 */
function deserialiseFromHash(hash) {
  return {
    id: hash.id,
    name: hash.name,
    description: hash.description ?? "",
    systemPrompt: hash.systemPrompt,
    tools: JSON.parse(hash.tools),             // "null" → null, "[...]" → array
    model: hash.model || null,
    temperature: hash.temperature !== "" && hash.temperature !== undefined
      ? parseFloat(hash.temperature)
      : null,
    maxTokens: hash.maxTokens !== "" && hash.maxTokens !== undefined
      ? parseInt(hash.maxTokens, 10)
      : null,
    isDefault: hash.isDefault === "true",
    status: hash.status,
    enableUI: hash.enableUI !== "false",       // default true when missing
    createdAt: hash.createdAt,
    updatedAt: hash.updatedAt,
  };
}

// ── Change-notification helpers ───────────────────────────────────────────────

/**
 * Create a simple listener registry.
 * Returns { notify, onUpdate } where:
 *   - notify(event) calls all registered callbacks
 *   - onUpdate(cb) registers a callback and returns an unsubscribe function
 */
function createNotifier() {
  const listeners = new Set();

  function notify(event) {
    for (const cb of listeners) {
      try {
        cb(event);
      } catch (err) {
        logger.error("agentStore onUpdate callback threw", { error: err.message });
      }
    }
  }

  function onUpdate(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  return { notify, onUpdate };
}

// ── In-memory store implementation ────────────────────────────────────────────

/**
 * Build an in-memory agent store backed by a plain Map.
 * All methods are async for interface consistency.
 *
 * @returns {object} agentStore
 */
function createInMemoryAgentStore() {
  /** @type {Map<string, object>} */
  const agents = new Map();
  const { notify, onUpdate } = createNotifier();

  return {
    async list() {
      return Array.from(agents.values());
    },

    async get(id) {
      return agents.get(id) ?? null;
    },

    async getDefault() {
      const all = Array.from(agents.values());
      const def = all.find((a) => a.isDefault);
      if (!def) {
        throw new Error("No default agent configured");
      }
      return def;
    },

    async create(data) {
      validateAgentData(data);

      const all = Array.from(agents.values());
      assertNameUnique(all, data.name);

      const now = new Date().toISOString();
      const id = uuidv4();

      // If this new agent is marked as default, clear everyone else
      if (data.isDefault) {
        for (const agent of agents.values()) {
          if (agent.isDefault) {
            agents.set(agent.id, { ...agent, isDefault: false, updatedAt: now });
          }
        }
      }

      const newAgent = {
        id,
        name: data.name.trim(),
        description: data.description ?? "",
        systemPrompt: data.systemPrompt,
        tools: data.tools !== undefined ? data.tools : null,
        model: data.model ?? null,
        temperature: data.temperature ?? null,
        maxTokens: data.maxTokens ?? null,
        isDefault: data.isDefault ?? false,
        status: data.status ?? "active",
        enableUI: data.enableUI !== undefined ? data.enableUI : true,
        createdAt: now,
        updatedAt: now,
      };

      agents.set(id, newAgent);
      logger.info("agentStore: agent created", { id, name: newAgent.name });
      notify({ type: "create", agentId: id, config: newAgent });
      return newAgent;
    },

    async update(id, data) {
      const existing = agents.get(id);
      if (!existing) {
        throw new Error(`Agent not found: ${id}`);
      }

      validateAgentData(data);

      const all = Array.from(agents.values());
      assertNameUnique(all, data.name, id);

      const now = new Date().toISOString();

      // If marking this one as default, clear others
      if (data.isDefault) {
        for (const agent of agents.values()) {
          if (agent.id !== id && agent.isDefault) {
            agents.set(agent.id, { ...agent, isDefault: false, updatedAt: now });
          }
        }
      }

      const updated = {
        id,
        name: data.name.trim(),
        description: data.description ?? "",
        systemPrompt: data.systemPrompt,
        tools: data.tools !== undefined ? data.tools : null,
        model: data.model ?? null,
        temperature: data.temperature ?? null,
        maxTokens: data.maxTokens ?? null,
        isDefault: data.isDefault ?? false,
        status: data.status ?? "active",
        enableUI: data.enableUI !== undefined ? data.enableUI : true,
        createdAt: existing.createdAt,
        updatedAt: now,
      };

      agents.set(id, updated);
      logger.info("agentStore: agent updated", { id, name: updated.name });
      notify({ type: "update", agentId: id, config: updated });
      return updated;
    },

    async patch(id, partial) {
      const existing = agents.get(id);
      if (!existing) {
        throw new Error(`Agent not found: ${id}`);
      }

      validateAgentData(partial, { allowPartial: true });

      const all = Array.from(agents.values());
      if (partial.name !== undefined) {
        assertNameUnique(all, partial.name, id);
      }

      const now = new Date().toISOString();

      // If patching isDefault to true, clear others
      if (partial.isDefault === true) {
        for (const agent of agents.values()) {
          if (agent.id !== id && agent.isDefault) {
            agents.set(agent.id, { ...agent, isDefault: false, updatedAt: now });
          }
        }
      }

      const patched = {
        ...existing,
        ...partial,
        ...(partial.name !== undefined ? { name: partial.name.trim() } : {}),
        updatedAt: now,
      };

      agents.set(id, patched);
      logger.info("agentStore: agent patched", { id });
      notify({ type: "update", agentId: id, config: patched });
      return patched;
    },

    async delete(id) {
      const all = Array.from(agents.values());

      if (all.length <= 1) {
        throw new Error("Cannot delete the last remaining agent");
      }

      const target = agents.get(id);
      if (!target) {
        throw new Error(`Agent not found: ${id}`);
      }

      if (target.isDefault) {
        throw new Error(
          "Cannot delete the default agent. Set another agent as default first."
        );
      }

      agents.delete(id);
      logger.info("agentStore: agent deleted", { id });
      notify({ type: "delete", agentId: id });
    },

    async seedDefault() {
      const all = Array.from(agents.values());
      if (all.length > 0) {
        logger.debug("agentStore: seedDefault skipped — agents already exist");
        return;
      }
      await this.create(DEFAULT_AGENT_SEED);
      logger.info("agentStore: default agent seeded (in-memory)");
    },

    onUpdate,
  };
}

// ── Redis store implementation ────────────────────────────────────────────────

/**
 * Build a Redis-backed agent store.
 * Resolves once the Redis connection is confirmed ready.
 *
 * @param {string} redisUrl
 * @returns {Promise<object>} agentStore
 */
async function createRedisAgentStore(redisUrl) {
  const Redis = (await import("ioredis")).default;

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  client.on("error", (err) => {
    logger.error("agentStore Redis client error", { error: err.message });
  });

  client.on("connect", () => {
    logger.info("agentStore Redis client connected");
  });

  client.on("ready", () => {
    logger.info("agentStore Redis client ready");
  });

  // Wait until the client is ready before returning the store
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

  const { notify, onUpdate } = createNotifier();

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Fetch and deserialise a single agent by ID.
   * Returns null if the key does not exist.
   */
  async function fetchOne(id) {
    const hash = await client.hgetall(agentKey(id));
    if (!hash || Object.keys(hash).length === 0) return null;
    return deserialiseFromHash(hash);
  }

  /**
   * Fetch all agents referenced in the index set.
   * Silently drops IDs whose hash no longer exists (stale index entries).
   */
  async function fetchAll() {
    const ids = await client.smembers(AGENTS_INDEX_KEY);
    if (ids.length === 0) return [];

    const results = await Promise.all(ids.map(fetchOne));
    return results.filter(Boolean);
  }

  /**
   * Persist an agent hash and ensure its ID is recorded in the index set.
   * Also sets a field-level update for updatedAt without needing a full rewrite.
   */
  async function persistOne(agentConfig) {
    const hash = serialiseToHash(agentConfig);
    await Promise.all([
      client.hset(agentKey(agentConfig.id), hash),
      client.sadd(AGENTS_INDEX_KEY, agentConfig.id),
    ]);
  }

  /**
   * Clear the isDefault flag on all agents except the one identified by `exceptId`.
   * Uses a pipeline for efficiency.
   */
  async function clearDefaultExcept(exceptId, now) {
    const all = await fetchAll();
    const pipeline = client.pipeline();
    for (const agent of all) {
      if (agent.id !== exceptId && agent.isDefault) {
        pipeline.hset(agentKey(agent.id), { isDefault: "false", updatedAt: now });
      }
    }
    await pipeline.exec();
  }

  // ── Public store object ───────────────────────────────────────────────────

  const store = {
    async list() {
      try {
        return await fetchAll();
      } catch (err) {
        logger.error("agentStore.list error", { error: err.message });
        throw err;
      }
    },

    async get(id) {
      try {
        return await fetchOne(id);
      } catch (err) {
        logger.error("agentStore.get error", { id, error: err.message });
        throw err;
      }
    },

    async getDefault() {
      try {
        const all = await fetchAll();
        const def = all.find((a) => a.isDefault);
        if (!def) {
          throw new Error("No default agent configured");
        }
        return def;
      } catch (err) {
        logger.error("agentStore.getDefault error", { error: err.message });
        throw err;
      }
    },

    async create(data) {
      try {
        validateAgentData(data);

        const all = await fetchAll();
        assertNameUnique(all, data.name);

        const now = new Date().toISOString();
        const id = uuidv4();

        if (data.isDefault) {
          await clearDefaultExcept(id, now);
        }

        const newAgent = {
          id,
          name: data.name.trim(),
          description: data.description ?? "",
          systemPrompt: data.systemPrompt,
          tools: data.tools !== undefined ? data.tools : null,
          model: data.model ?? null,
          temperature: data.temperature ?? null,
          maxTokens: data.maxTokens ?? null,
          isDefault: data.isDefault ?? false,
          status: data.status ?? "active",
          enableUI: data.enableUI !== undefined ? data.enableUI : true,
          createdAt: now,
          updatedAt: now,
        };

        await persistOne(newAgent);
        logger.info("agentStore: agent created", { id, name: newAgent.name });
        notify({ type: "create", agentId: id, config: newAgent });
        return newAgent;
      } catch (err) {
        logger.error("agentStore.create error", { error: err.message });
        throw err;
      }
    },

    async update(id, data) {
      try {
        const existing = await fetchOne(id);
        if (!existing) {
          throw new Error(`Agent not found: ${id}`);
        }

        validateAgentData(data);

        const all = await fetchAll();
        assertNameUnique(all, data.name, id);

        const now = new Date().toISOString();

        if (data.isDefault) {
          await clearDefaultExcept(id, now);
        }

        const updated = {
          id,
          name: data.name.trim(),
          description: data.description ?? "",
          systemPrompt: data.systemPrompt,
          tools: data.tools !== undefined ? data.tools : null,
          model: data.model ?? null,
          temperature: data.temperature ?? null,
          maxTokens: data.maxTokens ?? null,
          isDefault: data.isDefault ?? false,
          status: data.status ?? "active",
          enableUI: data.enableUI !== undefined ? data.enableUI : true,
          createdAt: existing.createdAt,
          updatedAt: now,
        };

        await persistOne(updated);
        logger.info("agentStore: agent updated", { id, name: updated.name });
        notify({ type: "update", agentId: id, config: updated });
        return updated;
      } catch (err) {
        logger.error("agentStore.update error", { id, error: err.message });
        throw err;
      }
    },

    async patch(id, partial) {
      try {
        const existing = await fetchOne(id);
        if (!existing) {
          throw new Error(`Agent not found: ${id}`);
        }

        validateAgentData(partial, { allowPartial: true });

        const all = await fetchAll();
        if (partial.name !== undefined) {
          assertNameUnique(all, partial.name, id);
        }

        const now = new Date().toISOString();

        if (partial.isDefault === true) {
          await clearDefaultExcept(id, now);
        }

        const patched = {
          ...existing,
          ...partial,
          ...(partial.name !== undefined ? { name: partial.name.trim() } : {}),
          updatedAt: now,
        };

        await persistOne(patched);
        logger.info("agentStore: agent patched", { id });
        notify({ type: "update", agentId: id, config: patched });
        return patched;
      } catch (err) {
        logger.error("agentStore.patch error", { id, error: err.message });
        throw err;
      }
    },

    async delete(id) {
      try {
        const all = await fetchAll();

        if (all.length <= 1) {
          throw new Error("Cannot delete the last remaining agent");
        }

        const target = all.find((a) => a.id === id);
        if (!target) {
          throw new Error(`Agent not found: ${id}`);
        }

        if (target.isDefault) {
          throw new Error(
            "Cannot delete the default agent. Set another agent as default first."
          );
        }

        await Promise.all([
          client.del(agentKey(id)),
          client.srem(AGENTS_INDEX_KEY, id),
        ]);

        logger.info("agentStore: agent deleted", { id });
        notify({ type: "delete", agentId: id });
      } catch (err) {
        logger.error("agentStore.delete error", { id, error: err.message });
        throw err;
      }
    },

    async seedDefault() {
      try {
        const count = await client.scard(AGENTS_INDEX_KEY);
        if (count > 0) {
          logger.debug("agentStore: seedDefault skipped — agents already exist");
          return;
        }
        await store.create(DEFAULT_AGENT_SEED);
        logger.info("agentStore: default agent seeded (Redis)");
      } catch (err) {
        logger.error("agentStore.seedDefault error", { error: err.message });
        throw err;
      }
    },

    onUpdate,
  };

  return store;
}

// ── Module-level singleton ────────────────────────────────────────────────────
// Select Redis or in-memory at import time. Top-level await is available
// because the project uses ES modules ("type": "module" in package.json).

let agentStore;

if (config.redisUrl) {
  try {
    agentStore = await createRedisAgentStore(config.redisUrl);
    logger.info("agentStore: using Redis backend");
  } catch (err) {
    logger.error(
      "agentStore: failed to connect to Redis, falling back to in-memory store",
      { error: err.message }
    );
    agentStore = createInMemoryAgentStore();
  }
} else {
  agentStore = createInMemoryAgentStore();
  logger.info("agentStore: using in-memory backend (no REDIS_URL configured)");
}

export { agentStore };
