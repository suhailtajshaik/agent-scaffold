// src/tools/index.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { logger } from "../config/logger.js";

/**
 * SCAFFOLD TOOLS
 * These are example tools. Add your own domain-specific tools here.
 * Each tool follows the same pattern: tool(fn, { name, description, schema })
 */

// ─── Tool: Date & Time ──────────────────────────────────────────────────────
export const getCurrentDateTimeTool = tool(
  async ({ timezone }) => {
    const tz = timezone || "UTC";
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        dateStyle: "full",
        timeStyle: "long",
      });
      return JSON.stringify({
        iso: now.toISOString(),
        formatted: formatter.format(now),
        timezone: tz,
        unixMs: now.getTime(),
      });
    } catch {
      return JSON.stringify({ error: `Invalid timezone: ${tz}` });
    }
  },
  {
    name: "get_current_datetime",
    description: "Get the current date and time in a specific timezone",
    schema: z.object({
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone string, e.g. 'America/New_York'. Defaults to UTC"),
    }),
  }
);

// ─── Tool: Calculator ───────────────────────────────────────────────────────
export const calculatorTool = tool(
  async ({ expression }) => {
    try {
      // Safe math evaluation — only allows numbers and operators
      if (!/^[\d\s\+\-\*\/\.\(\)\%\^]+$/.test(expression)) {
        return JSON.stringify({ error: "Invalid expression — only math operators allowed" });
      }
      // Using Function for safe arithmetic (no variable access)
      const result = new Function(`"use strict"; return (${expression})`)();
      logger.debug(`Calculator: ${expression} = ${result}`);
      return JSON.stringify({ expression, result, type: typeof result });
    } catch (err) {
      return JSON.stringify({ error: `Calculation failed: ${err.message}` });
    }
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression and return the result",
    schema: z.object({
      expression: z.string().describe("Math expression to evaluate, e.g. '(100 * 1.18) / 3'"),
    }),
  }
);

// ─── Tool: Data Formatter ───────────────────────────────────────────────────
export const dataFormatterTool = tool(
  async ({ data, format }) => {
    try {
      const parsed = typeof data === "string" ? JSON.parse(data) : data;
      if (format === "table") {
        if (!Array.isArray(parsed)) throw new Error("Table format requires an array");
        const keys = Object.keys(parsed[0] || {});
        const header = keys.join(" | ");
        const sep = keys.map(() => "---").join(" | ");
        const rows = parsed.map((row) => keys.map((k) => String(row[k] ?? "")).join(" | "));
        return [header, sep, ...rows].join("\n");
      }
      if (format === "csv") {
        if (!Array.isArray(parsed)) throw new Error("CSV format requires an array");
        const keys = Object.keys(parsed[0] || {});
        const rows = parsed.map((row) => keys.map((k) => `"${row[k] ?? ""}"`).join(","));
        return [keys.join(","), ...rows].join("\n");
      }
      return JSON.stringify(parsed, null, 2);
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  },
  {
    name: "data_formatter",
    description: "Format data as JSON, table (markdown), or CSV",
    schema: z.object({
      data: z.string().describe("JSON string of the data to format"),
      format: z.enum(["json", "table", "csv"]).describe("Output format"),
    }),
  }
);

// ─── Tool Registry ──────────────────────────────────────────────────────────
export const ALL_TOOLS = [
  getCurrentDateTimeTool,
  calculatorTool,
  dataFormatterTool,
];

export function getToolByName(name) {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function getToolsInfo() {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
  }));
}
