// src/tools/webSearch.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";

// ─── Tool: Web Search ───────────────────────────────────────────────────────
export const webSearchTool = tool(
  async ({ query, maxResults, searchDepth }) => {
    if (!config.tavilyApiKey) {
      return JSON.stringify({
        error: "Web search is not configured. Set TAVILY_API_KEY to enable.",
      });
    }

    try {
      const { tavily } = await import("@tavily/core");
      const client = tavily({ apiKey: config.tavilyApiKey });

      const response = await client.search(query, {
        maxResults: maxResults || 5,
        searchDepth: searchDepth || "basic",
      });

      const results = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      }));

      logger.info(`Web search: "${query}" → ${results.length} results`);

      return JSON.stringify({
        query,
        results,
        responseTime: response.responseTime,
      });
    } catch (err) {
      logger.error("Web search failed", { error: err.message });
      return JSON.stringify({ error: `Search failed: ${err.message}` });
    }
  },
  {
    name: "web_search",
    description:
      "Search the web for current information on any topic. Returns titles, URLs, and content snippets from relevant web pages.",
    schema: z.object({
      query: z.string().describe("The search query"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum number of results to return (default: 5)"),
      searchDepth: z
        .enum(["basic", "advanced"])
        .optional()
        .describe(
          "Search depth: 'basic' for quick results, 'advanced' for more thorough search (default: basic)"
        ),
    }),
  }
);
