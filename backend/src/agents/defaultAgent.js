// src/agents/defaultAgent.js
import { createAgent } from "./agentFactory.js";
import { getAllTools } from "../tools/index.js";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";

export const SYSTEM_PROMPT = `You are an intelligent enterprise AI assistant. You are helpful, precise, and professional.

You have access to tools for web search, content extraction, site crawling, deep research, calculations, date/time, data formatting, and state management. Each tool accepts dynamic parameters — choose the right tool and configure its parameters based on what the user's request actually needs.

Guidelines:
- Dynamically choose which tools to use and how to configure them based on the request
- For web research: chain tools as needed (search → extract → crawl) depending on the depth required
- Set search parameters (topic, time range, domains, depth, result count) based on what the query demands
- Always use tools when they can provide accurate, current information
- Be concise but thorough in your responses
- When performing calculations, show your work
- Format data clearly for readability
- If unsure, say so rather than guessing

You are running as a scaffold agent. Developers will extend you by adding domain-specific tools and customizing your system prompt.`;

// Singleton compiled agent — shared across all requests
let _agent = null;

export async function getDefaultAgent() {
  if (!_agent) {
    if (config.multiAgentEnabled) {
      // Dynamic imports avoid circular dependency issues at module load time
      const { createSupervisorAgent } = await import("./supervisorAgent.js");
      const { registerAgent } = await import("./agentRegistry.js");
      const { researchAgentConfig } = await import("./specialists/researchAgent.js");
      const { creativeAgentConfig } = await import("./specialists/creativeAgent.js");
      const { codeAgentConfig } = await import("./specialists/codeAgent.js");

      registerAgent(researchAgentConfig.name, researchAgentConfig);
      registerAgent(creativeAgentConfig.name, creativeAgentConfig);
      registerAgent(codeAgentConfig.name, codeAgentConfig);

      _agent = createSupervisorAgent();
      logger.info("Multi-agent supervisor initialized");
    } else {
      _agent = createAgent({ systemPrompt: SYSTEM_PROMPT, tools: getAllTools() });
    }
  }
  return _agent;
}

// Call this after MCP tools are loaded to rebuild the agent
export function resetDefaultAgent() {
  _agent = null;
}
