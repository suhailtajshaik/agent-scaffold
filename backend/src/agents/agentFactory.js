// src/agents/agentFactory.js
import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, MessagesAnnotation, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { sessionStore } from "../memory/sessionStore.js";
import { ALL_TOOLS } from "../tools/index.js";

/**
 * Agent Factory
 * Creates a compiled LangGraph agent wired to a session-aware memory store.
 *
 * SCAFFOLD: To customize for your use case:
 *  1. Pass a custom systemPrompt
 *  2. Pass a subset of tools (or add new ones in src/tools/index.js)
 *  3. Add middleware hooks (beforeModel, afterModel)
 */
export function createAgent({
  systemPrompt = null,
  tools = ALL_TOOLS,
  beforeModel = null,
  afterModel = null,
} = {}) {
  // Bind tools to the LLM
  const llm = new ChatAnthropic({
    apiKey: config.anthropicApiKey,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  }).bindTools(tools);

  const toolNode = new ToolNode(tools);

  // ── Agent Node ─────────────────────────────────────────────────────────────
  async function agentNode(state) {
    let { messages } = state;

    // Inject system prompt at the front if provided
    if (systemPrompt && messages[0]?.constructor?.name !== "SystemMessage") {
      messages = [new SystemMessage(systemPrompt), ...messages];
    }

    // Before-model middleware hook
    if (beforeModel) messages = await beforeModel(messages);

    logger.debug(`Agent invoking LLM with ${messages.length} messages`);
    const response = await llm.invoke(messages);
    logger.debug(`LLM response type: ${response.tool_calls?.length ? "tool_call" : "text"}`);

    // After-model middleware hook
    let finalResponse = response;
    if (afterModel) finalResponse = await afterModel(response);

    return { messages: [finalResponse] };
  }

  // ── Routing Logic ──────────────────────────────────────────────────────────
  function shouldContinue({ messages }) {
    const last = messages.at(-1);
    if (last?.tool_calls?.length > 0) {
      logger.debug(`Routing to tools: ${last.tool_calls.map((tc) => tc.name).join(", ")}`);
      return "tools";
    }
    return END;
  }

  // ── Build Graph ────────────────────────────────────────────────────────────
  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  const compiled = graph.compile();
  logger.info(`Agent compiled with ${tools.length} tools`);

  return compiled;
}

/**
 * Run an agent invocation with session memory
 */
export async function runAgent({ agent, sessionId, userMessage, onChunk = null }) {
  const startTime = Date.now();

  // Load session history
  const history = sessionStore.getMessages(sessionId);
  const newUserMessage = new HumanMessage(userMessage);
  const inputMessages = [...history, newUserMessage];

  logger.info(`Running agent | session=${sessionId} | history=${history.length} messages`);

  let finalText = "";
  const toolCallsUsed = [];

  try {
    if (onChunk) {
      // ── Streaming Mode ─────────────────────────────────────────────────────
      const stream = await agent.stream(
        { messages: inputMessages },
        { streamMode: "values" }
      );

      let lastAIMessage = null;

      for await (const chunk of stream) {
        const last = chunk.messages.at(-1);

        if (last?.constructor?.name === "AIMessage" || last?._getType?.() === "ai") {
          if (last.tool_calls?.length > 0) {
            // Tool call happening
            for (const tc of last.tool_calls) {
              toolCallsUsed.push(tc.name);
              onChunk({ type: "tool_call", toolName: tc.name, args: tc.args });
            }
          } else if (last.content) {
            const text = typeof last.content === "string"
              ? last.content
              : last.content.map((b) => b.text || "").join("");
            if (text) {
              finalText = text;
              onChunk({ type: "text", text });
            }
          }
          lastAIMessage = last;
        } else if (last?.constructor?.name === "ToolMessage" || last?._getType?.() === "tool") {
          onChunk({ type: "tool_result", toolName: last.name, result: last.content });
        }
      }
    } else {
      // ── Non-Streaming Mode ─────────────────────────────────────────────────
      const result = await agent.invoke({ messages: inputMessages });
      const lastMessage = result.messages.at(-1);

      finalText = typeof lastMessage.content === "string"
        ? lastMessage.content
        : lastMessage.content?.map?.((b) => b.text || "").join("") || "";

      // Extract tool calls from intermediate messages
      for (const msg of result.messages) {
        if (msg.tool_calls?.length) {
          toolCallsUsed.push(...msg.tool_calls.map((tc) => tc.name));
        }
      }
    }

    // Persist to session memory
    sessionStore.appendMessages(sessionId, [
      newUserMessage,
      new AIMessage(finalText),
    ]);

    const duration = Date.now() - startTime;
    logger.info(`Agent completed | session=${sessionId} | ${duration}ms | tools=[${toolCallsUsed.join(",")}]`);

    return {
      text: finalText,
      toolsUsed: [...new Set(toolCallsUsed)],
      sessionId,
      durationMs: duration,
    };
  } catch (error) {
    logger.error(`Agent error | session=${sessionId}`, { error: error.message });
    throw error;
  }
}
