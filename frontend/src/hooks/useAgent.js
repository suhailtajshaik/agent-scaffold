// src/hooks/useAgent.js
import { useState, useRef, useCallback } from "react";
import { api } from "../lib/api.js";

const generateId = () => Math.random().toString(36).slice(2);

export function useAgent() {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTools, setActiveTools] = useState([]);
  const streamRef = useRef(null);

  const addMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, { id: generateId(), timestamp: Date.now(), ...msg }]);
  }, []);

  const updateLastAssistantMessage = useCallback((updater) => {
    setMessages((prev) => {
      const next = [...prev];
      // Find last assistant message
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = typeof updater === "function" ? updater(next[i]) : { ...next[i], ...updater };
          break;
        }
      }
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || isLoading) return;

      const currentSessionId = sessionId;
      addMessage({ role: "user", content: text });
      setIsLoading(true);
      setActiveTools([]);

      // Placeholder assistant message for streaming
      const placeholderId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: placeholderId,
          role: "assistant",
          content: "",
          toolsUsed: [],
          isStreaming: true,
          timestamp: Date.now(),
        },
      ]);

      let newSessionId = currentSessionId;
      let accumulatedText = "";

      const stream = api.streamChat({
        message: text,
        sessionId: currentSessionId,
        onEvent: (type, data) => {
          if (type === "session") {
            newSessionId = data.sessionId;
            if (!currentSessionId) setSessionId(data.sessionId);
          } else if (type === "text") {
            accumulatedText = data.text;
            setMessages((prev) => {
              const next = [...prev];
              const idx = next.findIndex((m) => m.id === placeholderId);
              if (idx !== -1) {
                next[idx] = { ...next[idx], content: accumulatedText };
              }
              return next;
            });
          } else if (type === "tool_call") {
            setActiveTools((prev) => [...new Set([...prev, data.toolName])]);
          } else if (type === "tool_result") {
            // Tool finished
          }
        },
        onDone: () => {
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex((m) => m.id === placeholderId);
            if (idx !== -1) {
              next[idx] = {
                ...next[idx],
                isStreaming: false,
                toolsUsed: activeTools,
              };
            }
            return next;
          });
          setIsLoading(false);
          setActiveTools([]);
          streamRef.current = null;
        },
        onError: (err) => {
          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex((m) => m.id === placeholderId);
            if (idx !== -1) {
              next[idx] = {
                ...next[idx],
                content: `⚠️ Error: ${err.message}`,
                isStreaming: false,
                isError: true,
              };
            }
            return next;
          });
          setIsLoading(false);
          setActiveTools([]);
          streamRef.current = null;
        },
      });

      streamRef.current = stream;
    },
    [sessionId, isLoading, addMessage, activeTools]
  );

  const clearConversation = useCallback(async () => {
    if (sessionId) {
      await api.clearSession(sessionId).catch(() => {});
    }
    setMessages([]);
    setSessionId(null);
    setActiveTools([]);
    setIsLoading(false);
  }, [sessionId]);

  const cancelStream = useCallback(() => {
    streamRef.current?.cancel();
    streamRef.current = null;
    setIsLoading(false);
    updateLastAssistantMessage((msg) => ({ ...msg, isStreaming: false }));
  }, [updateLastAssistantMessage]);

  return {
    messages,
    sessionId,
    isLoading,
    activeTools,
    sendMessage,
    clearConversation,
    cancelStream,
  };
}
