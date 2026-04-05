// src/tools/stateTools.js
// Factory that returns per-request state tools with session/user context baked in.
// These tools allow the agent to read, write, and delete values across three scopes:
//   - session: lasts only for this conversation
//   - user:    persists across conversations (requires x-user-id header)
//   - app:     global, shared by all users
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { stateStore } from "../memory/stateStore.js";
import { logger } from "../config/logger.js";

/**
 * Create scoped state tools bound to a specific request context.
 *
 * @param {{ sessionId: string, userId: string|null }} context
 * @returns {import("@langchain/core/tools").StructuredTool[]}
 */
export function createStateTools({ sessionId, userId }) {
  // ── get_state ─────────────────────────────────────────────────────────────
  const getStateTool = tool(
    async ({ scope, key }) => {
      if (scope === "user" && !userId) {
        return JSON.stringify({ error: "No user identity available — send the x-user-id header" });
      }
      const scopeId = _resolveScopeId(scope, sessionId, userId);
      const value = await stateStore.get(scope, scopeId, key);
      logger.debug(`State get: ${scope}/${key}`, { found: value !== undefined });
      return JSON.stringify({ scope, key, value: value ?? null });
    },
    {
      name: "get_state",
      description:
        "Retrieve a stored value from session, user, or app-level state. " +
        "Use this to recall preferences, settings, or data saved in a previous step.",
      schema: z.object({
        scope: z
          .enum(["session", "user", "app"])
          .describe(
            "State scope: 'session' (this conversation only), " +
            "'user' (persists across conversations for this user), " +
            "'app' (global, shared across all users)"
          ),
        key: z.string().describe("The key to retrieve"),
      }),
    }
  );

  // ── set_state ─────────────────────────────────────────────────────────────
  const setStateTool = tool(
    async ({ scope, key, value }) => {
      if (scope === "user" && !userId) {
        return JSON.stringify({ error: "No user identity available — send the x-user-id header" });
      }
      const scopeId = _resolveScopeId(scope, sessionId, userId);

      // value arrives as a string (JSON) — try to parse it so we store
      // the real type (object, number, etc.) rather than a raw string.
      let parsed = value;
      if (typeof value === "string") {
        try {
          parsed = JSON.parse(value);
        } catch {
          // Keep as plain string if it isn't valid JSON
        }
      }

      await stateStore.set(scope, scopeId, key, parsed);
      logger.debug(`State set: ${scope}/${key}`);
      return JSON.stringify({ scope, key, saved: true });
    },
    {
      name: "set_state",
      description:
        "Store a value in session, user, or app-level state. " +
        "Use this to remember user preferences, save intermediate results, " +
        "or share data across sessions. The value should be a JSON string.",
      schema: z.object({
        scope: z
          .enum(["session", "user", "app"])
          .describe("State scope: 'session', 'user', or 'app'"),
        key: z.string().describe("The key to store the value under"),
        value: z
          .string()
          .describe(
            "The value to store as a JSON string. " +
            "Strings: '\"hello\"', numbers: '42', objects: '{\"a\":1}', arrays: '[1,2,3]'"
          ),
      }),
    }
  );

  // ── delete_state ──────────────────────────────────────────────────────────
  const deleteStateTool = tool(
    async ({ scope, key }) => {
      if (scope === "user" && !userId) {
        return JSON.stringify({ error: "No user identity available — send the x-user-id header" });
      }
      const scopeId = _resolveScopeId(scope, sessionId, userId);
      await stateStore.delete(scope, scopeId, key);
      logger.debug(`State deleted: ${scope}/${key}`);
      return JSON.stringify({ scope, key, deleted: true });
    },
    {
      name: "delete_state",
      description: "Delete a stored value from session, user, or app-level state",
      schema: z.object({
        scope: z
          .enum(["session", "user", "app"])
          .describe("State scope: 'session', 'user', or 'app'"),
        key: z.string().describe("The key to delete"),
      }),
    }
  );

  return [getStateTool, setStateTool, deleteStateTool];
}

// ── Internal helpers ────────────────────────────────────────────────────────
function _resolveScopeId(scope, sessionId, userId) {
  if (scope === "session") return sessionId;
  if (scope === "user") return userId;
  return null; // app scope doesn't need an id
}
