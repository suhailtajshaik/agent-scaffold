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
  multiAgentEnabled: process.env.MULTI_AGENT_ENABLED === "true",
  tavilyApiKey: process.env.TAVILY_API_KEY || null,
};

export function validateConfig() {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
}
