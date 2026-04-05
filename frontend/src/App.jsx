// src/App.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useAgent } from "./hooks/useAgent.js";
import { api } from "./lib/api.js";

// ─── Icons ──────────────────────────────────────────────────────────────────
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" />
  </svg>
);
const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);
const BotIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="11"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>
  </svg>
);
const ToolIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

// ─── Suggested Prompts ───────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What time is it in Tokyo right now?",
  "Calculate the compound interest on $10,000 at 8% for 5 years",
  "Format this data as a table: [{name:'Alice',score:92},{name:'Bob',score:87}]",
  "Search for the latest AI agent frameworks",
];

// ─── Message Bubble ──────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      marginBottom: "20px",
      animation: "fadeUp 0.25s ease-out",
    }}>
      {/* Role label */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "6px",
        opacity: 0.5,
        fontSize: "10px",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontFamily: "'IBM Plex Mono', monospace",
        color: isUser ? "#a78bfa" : "#34d399",
        flexDirection: isUser ? "row-reverse" : "row",
      }}>
        {!isUser && <BotIcon />}
        <span>{isUser ? "you" : "agent"}</span>
        <span style={{ opacity: 0.6 }}>{time}</span>
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: "78%",
        padding: "12px 16px",
        borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
        background: isUser
          ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
          : "rgba(255,255,255,0.04)",
        border: isUser ? "none" : "1px solid rgba(255,255,255,0.08)",
        color: isUser ? "#fff" : "#e2e8f0",
        fontSize: "13.5px",
        lineHeight: "1.7",
        fontFamily: "'Space Grotesk', sans-serif",
        boxShadow: isUser ? "0 4px 20px rgba(79,70,229,0.3)" : "none",
        position: "relative",
      }}>
        {msg.isError ? (
          <span style={{ color: "#f87171" }}>{msg.content}</span>
        ) : isUser ? (
          <span>{msg.content}</span>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown>{msg.content || ""}</ReactMarkdown>
            {msg.isStreaming && (
              <span style={{
                display: "inline-block",
                width: "2px",
                height: "14px",
                background: "#34d399",
                marginLeft: "2px",
                verticalAlign: "middle",
                animation: "blink 0.8s infinite",
              }} />
            )}
          </div>
        )}

        {/* Tools used badge */}
        {!isUser && msg.toolsUsed?.length > 0 && (
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            marginTop: "10px",
            paddingTop: "10px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}>
            {msg.toolsUsed.map((t) => (
              <span key={t} style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "2px 8px",
                borderRadius: "20px",
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.2)",
                color: "#34d399",
                fontSize: "10px",
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
                <ToolIcon />{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool Activity Indicator ─────────────────────────────────────────────────
function ToolActivity({ tools }) {
  if (!tools.length) return null;
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 14px",
      marginBottom: "12px",
      borderRadius: "8px",
      background: "rgba(52,211,153,0.05)",
      border: "1px solid rgba(52,211,153,0.15)",
      fontSize: "11px",
      color: "#34d399",
      fontFamily: "'IBM Plex Mono', monospace",
      animation: "fadeUp 0.2s ease-out",
    }}>
      <div style={{
        width: "6px", height: "6px", borderRadius: "50%",
        background: "#34d399",
        animation: "pulse 1s infinite",
      }} />
      calling: {tools.join(", ")}
    </div>
  );
}

// ─── Sidebar: Session Info ───────────────────────────────────────────────────
function Sidebar({ sessionId, tools, onClear }) {
  return (
    <div style={{
      width: "220px",
      flexShrink: 0,
      padding: "24px 16px",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      flexDirection: "column",
      gap: "24px",
    }}>
      {/* Logo */}
      <div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: "13px",
          fontWeight: 500,
          color: "#a78bfa",
          letterSpacing: "0.05em",
          marginBottom: "4px",
        }}>agent-scaffold</div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono', monospace" }}>
          v1.0.0 · enterprise
        </div>
      </div>

      {/* Session */}
      <div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", fontFamily: "'IBM Plex Mono', monospace" }}>Session</div>
        <div style={{
          padding: "8px 10px",
          borderRadius: "6px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          fontSize: "10px",
          fontFamily: "'IBM Plex Mono', monospace",
          color: sessionId ? "#a78bfa" : "rgba(255,255,255,0.25)",
          wordBreak: "break-all",
          lineHeight: 1.5,
        }}>
          {sessionId ? sessionId.slice(0, 20) + "…" : "no active session"}
        </div>
      </div>

      {/* Tools */}
      <div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", fontFamily: "'IBM Plex Mono', monospace" }}>Tools ({tools.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {tools.map((t) => (
            <div key={t.name} style={{
              padding: "6px 8px",
              borderRadius: "5px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              fontSize: "10px",
              fontFamily: "'IBM Plex Mono', monospace",
              color: "rgba(255,255,255,0.5)",
            }}>
              {t.name}
            </div>
          ))}
        </div>
      </div>

      {/* Clear */}
      <div style={{ marginTop: "auto" }}>
        <button
          onClick={onClear}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "8px",
            borderRadius: "6px",
            background: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.15)",
            color: "#f87171",
            fontSize: "11px",
            cursor: "pointer",
            fontFamily: "'IBM Plex Mono', monospace",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => e.target.style.background = "rgba(248,113,113,0.12)"}
          onMouseLeave={(e) => e.target.style.background = "rgba(248,113,113,0.06)"}
        >
          <ClearIcon /> clear session
        </button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { messages, sessionId, isLoading, activeTools, sendMessage, clearConversation, cancelStream } = useAgent();
  const [input, setInput] = useState("");
  const [tools, setTools] = useState([]);
  const [health, setHealth] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load tools & health on mount
  useEffect(() => {
    api.getTools().then((d) => setTools(d.tools || [])).catch(() => {});
    api.health().then(setHealth).catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTools]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput("");
    inputRef.current?.focus();
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #090c10; color: #e2e8f0; font-family: 'Space Grotesk', sans-serif; height: 100vh; overflow: hidden; }
        #root { height: 100vh; display: flex; flex-direction: column; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.3)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .markdown-body p { margin-bottom: 8px; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body code { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; }
        .markdown-body pre { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; overflow-x: auto; margin: 8px 0; }
        .markdown-body pre code { background: none; padding: 0; font-size: 12px; }
        .markdown-body ul, .markdown-body ol { padding-left: 18px; margin: 6px 0; }
        .markdown-body li { margin-bottom: 3px; }
        .markdown-body strong { color: #f8fafc; }
        textarea { resize: none; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>

      {/* Top bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        height: "48px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: health ? "#34d399" : "#f87171", boxShadow: health ? "0 0 8px #34d399" : "none" }} />
          <span style={{ fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.4)" }}>
            {health ? `${health.model} · ${health.activeSessions} session${health.activeSessions !== 1 ? "s" : ""}` : "connecting…"}
          </span>
        </div>
        <span style={{ fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>
          ENTERPRISE AI SCAFFOLD
        </span>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar sessionId={sessionId} tools={tools} onClear={clearConversation} />

        {/* Chat area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
            {isEmpty ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "32px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>◈</div>
                  <div style={{ fontSize: "20px", fontWeight: 600, color: "#f8fafc", marginBottom: "6px" }}>Agent Scaffold</div>
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono', monospace" }}>
                    multi-tool · session-aware · streaming
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", maxWidth: "560px" }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      style={{
                        padding: "8px 14px",
                        borderRadius: "20px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.6)",
                        fontSize: "12px",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        fontFamily: "'Space Grotesk', sans-serif",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.1)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)"; e.currentTarget.style.color = "#a78bfa"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
                <ToolActivity tools={activeTools} />
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div style={{
            padding: "16px 24px 20px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.2)",
          }}>
            <div style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
              padding: "10px 12px 10px 16px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              transition: "border-color 0.15s",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
                rows={1}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "#f8fafc",
                  fontSize: "13.5px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  lineHeight: "1.6",
                  maxHeight: "120px",
                  overflowY: "auto",
                }}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
              />
              <button
                onClick={isLoading ? cancelStream : handleSend}
                disabled={!isLoading && !input.trim()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "34px",
                  height: "34px",
                  borderRadius: "8px",
                  background: isLoading
                    ? "rgba(248,113,113,0.15)"
                    : input.trim()
                      ? "linear-gradient(135deg, #4f46e5, #7c3aed)"
                      : "rgba(255,255,255,0.05)",
                  border: isLoading ? "1px solid rgba(248,113,113,0.3)" : "none",
                  color: isLoading ? "#f87171" : "#fff",
                  cursor: isLoading || input.trim() ? "pointer" : "default",
                  opacity: !isLoading && !input.trim() ? 0.3 : 1,
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
              >
                {isLoading ? <StopIcon /> : <SendIcon />}
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: "8px", fontSize: "10px", color: "rgba(255,255,255,0.2)", fontFamily: "'IBM Plex Mono', monospace" }}>
              claude-sonnet · langgraph · session-aware memory
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
