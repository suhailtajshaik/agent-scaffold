// src/memory/messageSerializer.js
// Serialize/deserialize LangChain message objects for Redis (JSON) storage.
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from "@langchain/core/messages";

/**
 * Convert an array of LangChain message instances into plain JSON-serializable objects.
 *
 * @param {Array} messages - LangChain message instances
 * @returns {Array<Object>} Plain objects safe to pass through JSON.stringify
 */
export function serializeMessages(messages) {
  return messages.map((m) => ({
    type: typeof m._getType === "function" ? m._getType() : (m.role ?? "human"),
    content: m.content,
    tool_calls: m.tool_calls,
    tool_call_id: m.tool_call_id,
    name: m.name,
    additional_kwargs: m.additional_kwargs,
  }));
}

/**
 * Reconstruct LangChain message instances from plain objects produced by serializeMessages.
 *
 * @param {Array<Object>} arr - Plain objects previously produced by serializeMessages
 * @returns {Array} LangChain message instances
 */
export function deserializeMessages(arr) {
  return arr.map((obj) => {
    switch (obj.type) {
      case "human":
        return new HumanMessage(obj.content);
      case "ai":
        return new AIMessage({
          content: obj.content,
          tool_calls: obj.tool_calls || [],
          additional_kwargs: obj.additional_kwargs || {},
        });
      case "tool":
        return new ToolMessage({
          content: obj.content,
          tool_call_id: obj.tool_call_id,
          name: obj.name,
        });
      case "system":
        return new SystemMessage(obj.content);
      default:
        return new HumanMessage(obj.content);
    }
  });
}
