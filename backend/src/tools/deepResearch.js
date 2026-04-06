// src/tools/deepResearch.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";

// ─── Tool: Deep Research ───────────────────────────────────────────────────
export const deepResearchTool = tool(
  async ({ query, maxSources, topic, timeRange, includeDomains }) => {
    if (!config.tavilyApiKey) {
      return JSON.stringify({
        error: "Deep research is not configured. Set TAVILY_API_KEY to enable.",
      });
    }

    try {
      const { tavily } = await import("@tavily/core");
      const client = tavily({ apiKey: config.tavilyApiKey });

      logger.info(`Deep research: "${query}" (topic: ${topic || "general"})`);

      // Step 1: Advanced search with include_raw_content — combines search + extract in one call
      const opts = {
        maxResults: maxSources || 5,
        searchDepth: "advanced",
        topic: topic || "general",
        includeAnswer: true,
        includeRawContent: true,
      };
      if (timeRange) opts.timeRange = timeRange;
      if (includeDomains?.length) opts.includeDomains = includeDomains;

      const searchResponse = await client.search(query, opts);

      // Step 2: If raw content wasn't returned inline, extract separately
      let needsExtract = searchResponse.results.some((r) => !r.rawContent);
      let extractedContent = [];

      if (needsExtract) {
        const urls = searchResponse.results
          .filter((r) => r.url && r.score > 0.3 && !r.rawContent)
          .slice(0, maxSources || 5)
          .map((r) => r.url);

        if (urls.length > 0) {
          try {
            const extractResponse = await client.extract(urls);
            extractedContent = extractResponse.results.map((r) => ({
              url: r.url,
              content: r.rawContent?.slice(0, 3000) || "",
            }));
          } catch (extractErr) {
            logger.warn("Content extraction partially failed", { error: extractErr.message });
          }
        }
      }

      // Merge results: prefer inline raw_content, fall back to extracted
      const sources = searchResponse.results.map((r) => {
        const extracted = extractedContent.find((e) => e.url === r.url);
        const fullContent = r.rawContent?.slice(0, 3000) || extracted?.content || null;
        return {
          title: r.title,
          url: r.url,
          snippet: r.content,
          fullContent,
          score: r.score,
        };
      });

      const sourcesWithContent = sources.filter((s) => s.fullContent).length;
      logger.info(`Deep research complete: ${sources.length} sources, ${sourcesWithContent} with full content`);

      return JSON.stringify({
        query,
        answer: searchResponse.answer || null,
        sources,
        totalSourcesFound: searchResponse.results.length,
        totalWithFullContent: sourcesWithContent,
        responseTime: searchResponse.responseTime,
      });
    } catch (err) {
      logger.error("Deep research failed", { error: err.message });
      return JSON.stringify({ error: `Deep research failed: ${err.message}` });
    }
  },
  {
    name: "deep_research",
    description:
      "Perform in-depth research on a topic by searching the web with advanced depth and extracting full content from the most relevant sources. Use this for complex questions that need thorough analysis, fact-checking, or comprehensive information gathering. Returns an AI-generated answer, source snippets, and full page content. More thorough but slower than web_search.",
    schema: z.object({
      query: z
        .string()
        .describe("The research question or topic to investigate thoroughly"),
      maxSources: z
        .number().int().min(1).max(10).optional()
        .describe("Maximum number of sources to research (default: 5)"),
      topic: z
        .enum(["general", "news", "finance"]).optional()
        .describe("Topic category to focus the research (default: general)"),
      timeRange: z
        .enum(["day", "week", "month", "year"]).optional()
        .describe("Limit results to a time range"),
      includeDomains: z
        .array(z.string()).optional()
        .describe("Only include results from these domains"),
    }),
  }
);
