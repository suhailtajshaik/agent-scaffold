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
};

export function validateConfig() {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
}
