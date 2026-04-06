// src/tools/remoteAgentTool.js
// Factory for cross-instance agent communication via HTTP.
// Only useful when config.instanceUrl is set (i.e. INSTANCE_URL env var is present).
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";

/**
 * Creates a call_remote_agent tool for cross-instance federation.
 * Only available when INSTANCE_URL is configured.
 *
 * @param {object} options
 * @param {function} options.getRemoteInstances - Function that returns list of remote instances from Redis
 */
export function createRemoteAgentTool({ getRemoteInstances }) {
  return tool(
    async ({ instanceUrl, agentId, task }) => {
      if (!config.instanceUrl) {
        return JSON.stringify({
          error: "Cross-instance federation is not enabled. Set INSTANCE_URL.",
        });
      }

      // Don't call ourselves
      if (instanceUrl === config.instanceUrl) {
        return JSON.stringify({
          error:
            "Cannot call remote agent on the same instance. Use delegate_to_agent instead.",
        });
      }

      logger.info(`Remote agent call: ${instanceUrl} / ${agentId || "default"}`);

      try {
        const url = `${instanceUrl.replace(/\/$/, "")}/api/agent/chat`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: task, agentId }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          return JSON.stringify({
            error: `Remote agent responded with ${response.status}: ${errBody}`,
          });
        }

        const result = await response.json();

        logger.info(`Remote agent call complete: ${instanceUrl} → ${result.durationMs}ms`);

        return JSON.stringify({
          instanceUrl,
          agentId: agentId || "default",
          response: result.message,
          toolsUsed: result.toolsUsed || [],
          durationMs: result.durationMs,
        });
      } catch (err) {
        if (err.name === "AbortError") {
          return JSON.stringify({ error: "Remote agent call timed out after 60 seconds" });
        }
        logger.error("Remote agent call failed", { error: err.message });
        return JSON.stringify({ error: `Remote agent call failed: ${err.message}` });
      }
    },
    {
      name: "call_remote_agent",
      description:
        "Call an agent running on a different server instance. Use for distributed agent collaboration across servers.",
      schema: z.object({
        instanceUrl: z
          .string()
          .describe(
            "The base URL of the remote instance (e.g., 'http://agent-2:3001')"
          ),
        agentId: z
          .string()
          .optional()
          .describe(
            "The agent ID on the remote instance (omit for default agent)"
          ),
        task: z.string().describe("The task to send to the remote agent"),
      }),
    }
  );
}
