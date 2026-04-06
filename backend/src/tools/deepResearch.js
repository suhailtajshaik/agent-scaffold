// src/tools/deepResearch.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";

// ─── Tool: Deep Research ───────────────────────────────────────────────────
export const deepResearchTool = tool(
  async ({ query, maxSources, topic }) => {
    if (!config.tavilyApiKey) {
      return JSON.stringify({
        error: "Deep research is not configured. Set TAVILY_API_KEY to enable.",
      });
    }

    try {
      const { tavily } = await import("@tavily/core");
      const client = tavily({ apiKey: config.tavilyApiKey });

      logger.info(`Deep research: "${query}" (topic: ${topic || "general"})`);

      // Step 1: Advanced search to find the best sources
      const searchResponse = await client.search(query, {
        maxResults: maxSources || 5,
        searchDepth: "advanced",
        topic: topic || "general",
        includeAnswer: true,
      });

      // Step 2: Extract full content from the top URLs
      const urls = searchResponse.results
        .filter((r) => r.url && r.score > 0.3)
        .slice(0, maxSources || 5)
        .map((r) => r.url);

      let extractedContent = [];
      if (urls.length > 0) {
        try {
          const extractResponse = await client.extract(urls);
          extractedContent = extractResponse.results.map((r) => ({
            url: r.url,
            content: r.rawContent?.slice(0, 3000) || "",
          }));
        } catch (extractErr) {
          logger.warn("Content extraction partially failed", { error: extractErr.message });
          // Fall back to search snippets if extraction fails
        }
      }

      const sources = searchResponse.results.map((r) => {
        const extracted = extractedContent.find((e) => e.url === r.url);
        return {
          title: r.title,
          url: r.url,
          snippet: r.content,
          fullContent: extracted?.content || null,
          score: r.score,
        };
      });

      logger.info(`Deep research complete: ${sources.length} sources, ${extractedContent.length} extracted`);

      return JSON.stringify({
        query,
        answer: searchResponse.answer || null,
        sources,
        totalSourcesFound: searchResponse.results.length,
        totalExtracted: extractedContent.length,
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
      "Perform in-depth research on a topic by searching the web and extracting full content from the most relevant sources. Use this for complex questions that need thorough analysis, fact-checking, or comprehensive information gathering. Returns an AI-generated answer, source snippets, and extracted full-page content.",
    schema: z.object({
      query: z
        .string()
        .describe("The research question or topic to investigate thoroughly"),
      maxSources: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum number of sources to research (default: 5)"),
      topic: z
        .enum(["general", "news", "finance"])
        .optional()
        .describe("Topic category to focus the research (default: general)"),
    }),
  }
);
