// src/lib/api.js

const BASE = "/api/agent";

export const api = {
  /**
   * Send a chat message (non-streaming)
   */
  async chat({ message, sessionId }) {
    const res = await fetch(`${BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  /**
   * Start a streaming chat — returns an EventSource-like stream
   * onEvent(type, data) is called for each SSE event
   */
  streamChat({ message, sessionId, onEvent, onDone, onError }) {
    // Use fetch + ReadableStream for POST-based SSE
    const controller = new AbortController();

    fetch(`${BASE}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line

          let eventType = null;
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ") && eventType) {
              try {
                const data = JSON.parse(line.slice(6));
                onEvent(eventType, data);
                if (eventType === "done") onDone?.(data);
                if (eventType === "error") onError?.(new Error(data.error));
              } catch {}
              eventType = null;
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") onError?.(err);
      });

    return { cancel: () => controller.abort() };
  },

  /**
   * Get session history
   */
  async getHistory(sessionId) {
    const res = await fetch(`${BASE}/history/${sessionId}`);
    return res.json();
  },

  /**
   * Clear a session
   */
  async clearSession(sessionId) {
    await fetch(`${BASE}/sessions/${sessionId}`, { method: "DELETE" });
  },

  /**
   * Get available tools
   */
  async getTools() {
    const res = await fetch(`${BASE}/tools`);
    return res.json();
  },

  /**
   * Health check
   */
  async health() {
    const res = await fetch("/health");
    return res.json();
  },

  // ─── MCP Server Management ─────────────────────────────────────────────────

  async getMCPServers() {
    const res = await fetch("/api/mcp/servers");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  async addMCPServer({ name, config }) {
    const res = await fetch("/api/mcp/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, config }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async removeMCPServer(name) {
    const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async reconnectMCPServer(name) {
    const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}/reconnect`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async getMCPTools() {
    const res = await fetch("/api/mcp/tools");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};
