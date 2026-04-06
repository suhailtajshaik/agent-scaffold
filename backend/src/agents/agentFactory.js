// src/agents/agentFactory.js
import { ChatAnthropic } from "@langchain/anthropic";
import { StateGraph, MessagesAnnotation, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { config } from "../config/index.js";
import { logger } from "../config/logger.js";
import { sessionStore } from "../memory/index.js";
import { getAllTools } from "../tools/index.js";
import { createToolCallGuard, validateToolCall, validateOutput, guardrailConfig } from "../guardrails/index.js";

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
  tools = null,
  beforeModel = null,
  afterModel = null,
} = {}) {
  const resolvedTools = tools ?? getAllTools();

  // Bind tools to the LLM
  const llm = new ChatAnthropic({
    apiKey: config.anthropicApiKey,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  }).bindTools(resolvedTools);

  const toolNode = new ToolNode(resolvedTools);

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
  logger.info(`Agent compiled with ${resolvedTools.length} tools`);

  return compiled;
}

/**
 * Run an agent invocation with session memory
 */
export async function runAgent({ agent, sessionId, userMessage, onChunk = null }) {
  const startTime = Date.now();

  // Load session history
  const history = await sessionStore.getMessages(sessionId);
  const newUserMessage = new HumanMessage(userMessage);
  const inputMessages = [...history, newUserMessage];

  logger.info(`Running agent | session=${sessionId} | history=${history.length} messages`);

  let finalText = "";
  const toolCallsUsed = [];
  const toolCallGuard = createToolCallGuard();

  // Wrap execution in a timeout
  const timeoutMs = guardrailConfig.requestTimeoutMs;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  try {
    const agentExecution = async () => {
      if (onChunk) {
        // ── Streaming Mode ─────────────────────────────────────────────────────
        const stream = await agent.stream(
          { messages: inputMessages },
          { streamMode: "values" }
        );

        let allStreamMessages = [];

        for await (const chunk of stream) {
          allStreamMessages = chunk.messages;
          const last = chunk.messages.at(-1);

          if (last?.constructor?.name === "AIMessage" || last?._getType?.() === "ai") {
            if (last.tool_calls?.length > 0) {
              for (const tc of last.tool_calls) {
                // Guardrail: enforce tool call limit
                toolCallGuard.onToolCall(tc.name);
                // Guardrail: validate tool arguments
                const check = validateToolCall(tc.name, tc.args);
                if (!check.allowed) {
                  logger.warn(`Tool call blocked: ${tc.name} — ${check.error}`);
                  onChunk({ type: "tool_call", toolName: tc.name, args: tc.args, blocked: true, reason: check.error });
                  continue;
                }
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
          } else if (last?.constructor?.name === "ToolMessage" || last?._getType?.() === "tool") {
            onChunk({ type: "tool_result", toolName: last.name, result: last.content });
          }
        }

        // Persist full message chain from stream
        const generatedMessages = allStreamMessages.slice(inputMessages.length);
        await sessionStore.appendMessages(sessionId, [newUserMessage, ...generatedMessages]);
      } else {
        // ── Non-Streaming Mode ─────────────────────────────────────────────────
        const result = await agent.invoke({ messages: inputMessages });
        const lastMessage = result.messages.at(-1);

        finalText = typeof lastMessage.content === "string"
          ? lastMessage.content
          : lastMessage.content?.map?.((b) => b.text || "").join("") || "";

        // Extract tool calls and validate
        for (const msg of result.messages) {
          if (msg.tool_calls?.length) {
            for (const tc of msg.tool_calls) {
              toolCallGuard.onToolCall(tc.name);
              validateToolCall(tc.name, tc.args);
            }
            toolCallsUsed.push(...msg.tool_calls.map((tc) => tc.name));
          }
        }

        // Persist full message chain (tool calls + results + final text)
        const generatedMessages = result.messages.slice(inputMessages.length);
        await sessionStore.appendMessages(sessionId, [newUserMessage, ...generatedMessages]);
      }
    };

    await Promise.race([agentExecution(), timeoutPromise]);

    // Guardrail: validate output
    const outputCheck = validateOutput(finalText);
    if (!outputCheck.safe) {
      logger.warn(`Output blocked | session=${sessionId} | reason=${outputCheck.reason}`);
      finalText = "I'm sorry, I can't provide that information.";
    }

    const duration = Date.now() - startTime;
    logger.info(`Agent completed | session=${sessionId} | ${duration}ms | tools=[${toolCallsUsed.join(",")}] | toolCalls=${toolCallGuard.count}`);

    const response = {
      text: finalText,
      toolsUsed: [...new Set(toolCallsUsed)],
      sessionId,
      durationMs: duration,
    };

    if (outputCheck.warnings) {
      response.warnings = outputCheck.warnings;
    }

    return response;
  } catch (error) {
    logger.error(`Agent error | session=${sessionId}`, { error: error.message });
    throw error;
  }
}
