// src/agents/supervisorAgent.js
import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, MessagesAnnotation, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { getRegistry } from "./agentRegistry.js";
import { getAllTools } from "../tools/index.js";

export function createSupervisorAgent() {
  const registry = getRegistry();

  if (registry.size === 0) {
    throw new Error(
      "No agents registered. Register specialists before creating supervisor."
    );
  }

  // Build agent descriptions for the supervisor prompt
  const agentDescriptions = Array.from(registry.entries())
    .map(([name, cfg]) => `- **${name}**: ${cfg.description}`)
    .join("\n");

  const supervisorPrompt = `You are a supervisor agent that routes user requests to the most appropriate specialist.

Available specialists:
${agentDescriptions}

Your job:
1. Analyze the user's message
2. Decide which specialist should handle it
3. If the request is a simple greeting or doesn't clearly fit any specialist, respond directly

IMPORTANT: You must respond with a JSON object (and nothing else) in this exact format:
{"route": "<specialist_name>"}
or for direct response:
{"route": "direct", "response": "<your response>"}

Only use specialist names from the list above. Always route to the most appropriate specialist.`;

  const supervisorLLM = new ChatAnthropic({
    apiKey: config.anthropicApiKey,
    model: config.model,
    temperature: 0,
    maxTokens: 256,
  });

  // Create specialist compiled graphs — each is a standard agent with tools
  const specialistGraphs = new Map();

  for (const [name, agentConfig] of registry.entries()) {
    const tools = agentConfig.tools || getAllTools();
    const llm = new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    }).bindTools(tools);

    const toolNode = new ToolNode(tools);

    const specialistNode = async (state) => {
      let { messages } = state;
      // Inject specialist system prompt, replacing any existing system messages
      if (agentConfig.systemPrompt) {
        messages = [
          new SystemMessage(agentConfig.systemPrompt),
          ...messages.filter((m) => m._getType?.() !== "system"),
        ];
      }
      const response = await llm.invoke(messages);
      return { messages: [response] };
    };

    const shouldContinue = ({ messages }) => {
      const last = messages.at(-1);
      if (last?.tool_calls?.length > 0) return "tools";
      return END;
    };

    const graph = new StateGraph(MessagesAnnotation)
      .addNode("specialist", specialistNode)
      .addNode("tools", toolNode)
      .addEdge("__start__", "specialist")
      .addConditionalEdges("specialist", shouldContinue)
      .addEdge("tools", "specialist");

    specialistGraphs.set(name, graph.compile());
    logger.info(`Specialist graph compiled: ${name}`);
  }

  // Supervisor node — decides routing and invokes the chosen specialist
  async function supervisorNode(state) {
    const { messages } = state;

    // Get the last human message for routing decisions
    const userMessages = messages.filter((m) => m._getType?.() === "human");
    const lastUserMsg = userMessages.at(-1);

    if (!lastUserMsg) {
      return {
        messages: [new AIMessage("I'm ready to help. What would you like to do?")],
      };
    }

    try {
      const routingResponse = await supervisorLLM.invoke([
        new SystemMessage(supervisorPrompt),
        new HumanMessage(lastUserMsg.content),
      ]);

      const responseText =
        typeof routingResponse.content === "string"
          ? routingResponse.content
          : routingResponse.content.map((b) => b.text || "").join("");

      // Parse the routing decision from JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn("Supervisor returned non-JSON, responding directly");
        return { messages: [new AIMessage(responseText)] };
      }

      const decision = JSON.parse(jsonMatch[0]);
      logger.info(`Supervisor routed to: ${decision.route}`);

      if (decision.route === "direct") {
        return {
          messages: [new AIMessage(decision.response || responseText)],
        };
      }

      const specialistGraph = specialistGraphs.get(decision.route);
      if (!specialistGraph) {
        logger.warn(`Unknown specialist: ${decision.route}, responding directly`);
        return {
          messages: [
            new AIMessage(`I'll help you directly. ${decision.response || responseText}`),
          ],
        };
      }

      // Invoke the specialist with the full conversation history
      const result = await specialistGraph.invoke({ messages });
      // Return the specialist's final response (last AI message)
      const finalMessage = result.messages.at(-1);
      return { messages: [finalMessage] };
    } catch (error) {
      logger.error("Supervisor routing error", { error: error.message });
      return {
        messages: [
          new AIMessage(
            "I encountered an error routing your request. Let me try to help directly."
          ),
        ],
      };
    }
  }

  // Simple single-node graph — routing is handled inside supervisorNode
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("supervisor", supervisorNode)
    .addEdge("__start__", "supervisor")
    .addEdge("supervisor", END);

  const compiled = graph.compile();
  logger.info(`Supervisor agent compiled with ${registry.size} specialists`);
  return compiled;
}
