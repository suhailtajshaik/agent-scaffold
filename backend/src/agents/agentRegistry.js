// src/agents/agentRegistry.js
import { logger } from "../config/logger.js";

const registry = new Map();

export function registerAgent(name, config) {
  // config: { systemPrompt, tools, description }
  registry.set(name, config);
  logger.info(`Agent registered: ${name}`);
}

export function getAgentConfig(name) {
  return registry.get(name);
}

export function listAgents() {
  return Array.from(registry.entries()).map(([name, config]) => ({
    name,
    description: config.description,
  }));
}

export function getRegistry() {
  return registry;
}
