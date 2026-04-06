// src/tools/webSearch.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../config/logger.js";
import { config } from "../config/index.js";
import { validateUrl } from "../guardrails/index.js";

/**
 * Helper: lazily create a Tavily client.
 * Uses dynamic import so the server starts even if @tavily/core has issues.
 */
async function getTavilyClient() {
  if (!config.tavilyApiKey) {
    throw new Error("Web search is not configured. Set TAVILY_API_KEY to enable.");
  }
  const { tavily } = await import("@tavily/core");
  return tavily({ apiKey: config.tavilyApiKey });
}

// ─── Tool: Web Search ──────────────────────────────────────────────────────
export const webSearchTool = tool(
  async ({ query, maxResults, searchDepth, topic, timeRange, includeDomains, includeAnswer }) => {
    try {
      const client = await getTavilyClient();

      const opts = {};
      if (maxResults !== undefined) opts.maxResults = maxResults;
      if (searchDepth) opts.searchDepth = searchDepth;
      if (topic) opts.topic = topic;
      if (timeRange) opts.timeRange = timeRange;
      if (includeDomains?.length) opts.includeDomains = includeDomains;
      if (includeAnswer) opts.includeAnswer = true;

      const response = await client.search(query, opts);

      const results = response.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      }));

      logger.info(`Web search: "${query}" → ${results.length} results`);

      const output = { query, results, responseTime: response.responseTime };
      if (response.answer) output.answer = response.answer;
      return JSON.stringify(output);
    } catch (err) {
      logger.error("Web search failed", { error: err.message });
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "web_search",
    description:
      "Search the web for current information on any topic. Returns titles, URLs, and content snippets from relevant web pages. Use specific queries for best results.",
    schema: z.object({
      query: z.string().describe("The search query — be specific for better results"),
      maxResults: z.number().int().min(1).max(20).optional()
        .describe("Maximum number of results to return"),
      searchDepth: z.enum(["basic", "advanced"]).optional()
        .describe("'basic' for quick results, 'advanced' for thorough search"),
      topic: z.enum(["general", "news", "finance"]).optional()
        .describe("Topic category to focus the search"),
      timeRange: z.enum(["day", "week", "month", "year"]).optional()
        .describe("Limit results to a time range"),
      includeDomains: z.array(z.string()).optional()
        .describe("Only include results from these domains (e.g., ['techcrunch.com'])"),
      includeAnswer: z.boolean().optional()
        .describe("Whether to include an AI-generated answer summary"),
    }),
  }
);

// ─── Tool: Web Extract ─────────────────────────────────────────────────────
export const webExtractTool = tool(
  async ({ urls, extractDepth }) => {
    try {
      // Validate all URLs before making any API calls
      for (const url of urls) {
        const check = validateUrl(url);
        if (!check.valid) {
          return JSON.stringify({ error: `URL blocked (${url}): ${check.error}` });
        }
      }

      const client = await getTavilyClient();

      logger.info(`Web extract: ${urls.length} URL(s)`);

      const opts = {};
      if (extractDepth) opts.extractDepth = extractDepth;

      const response = await client.extract(urls, opts);

      const results = response.results.map((r) => ({
        url: r.url,
        content: r.rawContent || "",
      }));

      return JSON.stringify({
        results,
        totalExtracted: results.length,
        failedUrls: response.failedResults?.map((f) => f.url) || [],
      });
    } catch (err) {
      logger.error("Web extract failed", { error: err.message });
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "web_extract",
    description:
      "Extract the full content from specific web page URLs. Use this when you have URLs from a previous search and need the complete page content for detailed analysis. Can process up to 20 URLs at once.",
    schema: z.object({
      urls: z.array(z.string()).min(1).max(20)
        .describe("List of URLs to extract content from"),
      extractDepth: z.enum(["basic", "advanced"]).optional()
        .describe("'advanced' for complex pages with dynamic content, tables, or embedded media"),
    }),
  }
);

// ─── Tool: Web Crawl ───────────────────────────────────────────────────────
export const webCrawlTool = tool(
  async ({ url, maxDepth, maxBreadth, instructions, selectPaths, excludePaths }) => {
    try {
      // Validate URL before crawling
      const urlCheck = validateUrl(url);
      if (!urlCheck.valid) {
        return JSON.stringify({ error: `URL blocked: ${urlCheck.error}` });
      }

      const client = await getTavilyClient();

      logger.info(`Web crawl: ${url}`);

      const opts = {};
      if (maxDepth !== undefined) opts.maxDepth = maxDepth;
      if (maxBreadth !== undefined) opts.maxBreadth = maxBreadth;
      if (instructions) opts.instructions = instructions;
      if (selectPaths?.length) opts.selectPaths = selectPaths;
      if (excludePaths?.length) opts.excludePaths = excludePaths;

      const response = await client.crawl(url, opts);

      const results = response.results.map((r) => ({
        url: r.url,
        content: r.rawContent || "",
      }));

      logger.info(`Web crawl complete: ${results.length} pages from ${url}`);

      return JSON.stringify({
        baseUrl: url,
        results,
        totalPages: results.length,
      });
    } catch (err) {
      logger.error("Web crawl failed", { error: err.message });
      return JSON.stringify({ error: `Web crawl failed: ${err.message}` });
    }
  },
  {
    name: "web_crawl",
    description:
      "Crawl a website to explore its structure and gather content from linked pages. Use this for deep research on a specific website — e.g., exploring documentation, gathering all product pages, or reading all blog posts from a site.",
    schema: z.object({
      url: z.string().describe("The base URL to start crawling from"),
      maxDepth: z.number().int().min(1).max(5).optional()
        .describe("How deep to follow links"),
      maxBreadth: z.number().int().min(1).max(20).optional()
        .describe("How many links to follow per page"),
      instructions: z.string().optional()
        .describe("Natural language instructions to guide the crawl (e.g., 'find only pricing pages')"),
      selectPaths: z.array(z.string()).optional()
        .describe("Only crawl pages matching these URL path patterns"),
      excludePaths: z.array(z.string()).optional()
        .describe("Skip pages matching these URL path patterns"),
    }),
  }
);
