// src/config/index.js
import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.MODEL || "claude-sonnet-4-20250514",
  temperature: parseFloat(process.env.TEMPERATURE || "0"),
  maxTokens: parseInt(process.env.MAX_TOKENS || "4096"),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV || "development",
  redisUrl: process.env.REDIS_URL || null,
  tavilyApiKey: process.env.TAVILY_API_KEY || null,
  janusgraphUrl: process.env.JANUSGRAPH_URL || null,
  maxDelegationDepth: parseInt(process.env.MAX_DELEGATION_DEPTH || "3"),
  instanceId: process.env.INSTANCE_ID || null,  // auto-generated if null at startup
  instanceUrl: process.env.INSTANCE_URL || null, // enables cross-instance federation
  enableUI: process.env.ENABLE_UI !== "false",   // default true, set to "false" to disable
};

export function validateConfig() {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
}
