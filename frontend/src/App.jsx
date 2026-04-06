// src/App.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useAgent } from "./hooks/useAgent.js";
import { useAgents } from "./hooks/useAgents.js";
import { useMCP } from "./hooks/useMCP.js";
import { api } from "./lib/api.js";
import { AgentPicker } from "./components/AgentPicker.jsx";
import { AgentManager } from "./components/AgentManager.jsx";

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
const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);
const PlugIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v6m0 12v2m-6-8h12M7 12a5 5 0 0 1 10 0"/>
  </svg>
);
const ReconnectIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const ChevronRightIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
        {!isUser && msg.delegatedTo && (
          <span style={{
            padding: "1px 5px",
            borderRadius: "4px",
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.25)",
            color: "#fbbf24",
            fontSize: "9px",
            letterSpacing: "0.06em",
            textTransform: "none",
          }}>
            via {msg.delegatedTo}
          </span>
        )}
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

// ─── MCP Server Card ─────────────────────────────────────────────────────────
function MCPServerCard({ name, server, mcpTools, onReconnect, onRemove, loading }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = server.status || "unknown";
  const transport = server.config?.transport || server.transport || "unknown";
  const toolsForServer = mcpTools.filter((t) => t.server === name);

  const statusColor = status === "connected" ? "#4ade80"
    : status === "connecting" ? "#facc15"
    : "#f87171";

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onRemove(name);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      // Auto-cancel confirmation after 3s
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div style={{
      borderRadius: "8px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      overflow: "hidden",
      opacity: loading ? 0.6 : 1,
      transition: "opacity 0.15s",
    }}>
      {/* Card header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 12px",
      }}>
        {/* Status dot */}
        <div style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: statusColor,
          flexShrink: 0,
          boxShadow: status === "connected" ? `0 0 6px ${statusColor}` : "none",
        }} />

        {/* Name + transport */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: "12px",
            fontFamily: "'IBM Plex Mono', monospace",
            color: "rgba(255,255,255,0.85)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>{name}</div>
          <div style={{
            fontSize: "10px",
            fontFamily: "'IBM Plex Mono', monospace",
            color: "rgba(255,255,255,0.35)",
            marginTop: "2px",
          }}>
            {transport}
            {toolsForServer.length > 0 && (
              <span style={{ color: "#34d399", marginLeft: "6px" }}>
                {toolsForServer.length} tool{toolsForServer.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Expand tools button */}
        {toolsForServer.length > 0 && (
          <button
            onClick={() => setExpanded((p) => !p)}
            title="Toggle tools"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "22px",
              height: "22px",
              borderRadius: "4px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        )}

        {/* Reconnect button */}
        <button
          onClick={() => onReconnect(name)}
          title="Reconnect"
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            borderRadius: "4px",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.4)",
            cursor: loading ? "default" : "pointer",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = "rgba(52,211,153,0.1)"; e.currentTarget.style.color = "#34d399"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.3)"; }}}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
        >
          <ReconnectIcon />
        </button>

        {/* Delete button */}
        <button
          onClick={handleDeleteClick}
          title={confirmDelete ? "Click again to confirm" : "Remove server"}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: confirmDelete ? "0 6px" : "0",
            height: "22px",
            minWidth: "22px",
            borderRadius: "4px",
            background: confirmDelete ? "rgba(248,113,113,0.15)" : "transparent",
            border: confirmDelete ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(255,255,255,0.08)",
            color: confirmDelete ? "#f87171" : "rgba(255,255,255,0.4)",
            cursor: loading ? "default" : "pointer",
            flexShrink: 0,
            fontSize: "9px",
            fontFamily: "'IBM Plex Mono', monospace",
            gap: "3px",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => { if (!loading && !confirmDelete) { e.currentTarget.style.background = "rgba(248,113,113,0.1)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)"; }}}
          onMouseLeave={(e) => { if (!confirmDelete) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}}
        >
          <TrashIcon />
          {confirmDelete && <span>confirm?</span>}
        </button>
      </div>

      {/* Expanded tool list */}
      {expanded && toolsForServer.length > 0 && (
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "8px 12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}>
          {toolsForServer.map((tool) => (
            <div key={tool.name} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "6px",
              padding: "5px 8px",
              borderRadius: "5px",
              background: "rgba(52,211,153,0.04)",
              border: "1px solid rgba(52,211,153,0.1)",
            }}>
              <span style={{ color: "#34d399", marginTop: "1px", flexShrink: 0 }}><ToolIcon /></span>
              <div>
                <div style={{ fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.7)" }}>{tool.name}</div>
                {tool.description && (
                  <div style={{ fontSize: "9px", fontFamily: "'IBM Plex Mono', monospace", color: "rgba(255,255,255,0.3)", marginTop: "2px", lineHeight: 1.4 }}>
                    {tool.description.length > 80 ? tool.description.slice(0, 80) + "…" : tool.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Server Form ──────────────────────────────────────────────────────────
function AddServerForm({ onAdd, loading, error }) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const inputStyle = {
    width: "100%",
    padding: "7px 10px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.85)",
    fontSize: "11px",
    fontFamily: "'IBM Plex Mono', monospace",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box",
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!name.trim()) { setFormError("Name is required"); return; }
    if (transport === "stdio" && !command.trim()) { setFormError("Command is required"); return; }
    if (transport === "sse" && !url.trim()) { setFormError("URL is required"); return; }

    const config = transport === "stdio"
      ? { transport: "stdio", command: command.trim(), args: args.trim() ? args.trim().split(/\s+/) : [] }
      : { transport: "sse", url: url.trim() };

    try {
      setSubmitting(true);
      await onAdd(name.trim(), config);
      // Reset on success
      setName(""); setCommand(""); setArgs(""); setUrl("");
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.08)",
      paddingTop: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    }}>
      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono', monospace" }}>
        Add Server
      </div>

      {/* Name */}
      <input
        type="text"
        placeholder="Server name (e.g. filesystem)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={inputStyle}
        onFocus={(e) => e.target.style.borderColor = "rgba(167,139,250,0.4)"}
        onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
      />

      {/* Transport */}
      <select
        value={transport}
        onChange={(e) => setTransport(e.target.value)}
        style={{ ...inputStyle, cursor: "pointer" }}
      >
        <option value="stdio">stdio</option>
        <option value="sse">sse</option>
      </select>

      {/* Stdio fields */}
      {transport === "stdio" && (
        <>
          <input
            type="text"
            placeholder="Command (e.g. npx)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            style={inputStyle}
            onFocus={(e) => e.target.style.borderColor = "rgba(167,139,250,0.4)"}
            onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
          <input
            type="text"
            placeholder="Args (space-separated, e.g. -y @modelcontextprotocol/server-filesystem)"
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            style={inputStyle}
            onFocus={(e) => e.target.style.borderColor = "rgba(167,139,250,0.4)"}
            onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
          />
        </>
      )}

      {/* SSE URL field */}
      {transport === "sse" && (
        <input
          type="url"
          placeholder="Server URL (e.g. http://localhost:3001/sse)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={inputStyle}
          onFocus={(e) => e.target.style.borderColor = "rgba(167,139,250,0.4)"}
          onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
        />
      )}

      {/* Error */}
      {(formError || error) && (
        <div style={{
          padding: "7px 10px",
          borderRadius: "6px",
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.2)",
          fontSize: "10px",
          fontFamily: "'IBM Plex Mono', monospace",
          color: "#f87171",
          lineHeight: 1.5,
        }}>
          {formError || error}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || loading}
        style={{
          padding: "8px 14px",
          borderRadius: "6px",
          background: (submitting || loading) ? "rgba(167,139,250,0.08)" : "rgba(167,139,250,0.15)",
          border: "1px solid rgba(167,139,250,0.3)",
          color: (submitting || loading) ? "rgba(167,139,250,0.5)" : "#a78bfa",
          fontSize: "11px",
          fontFamily: "'IBM Plex Mono', monospace",
          cursor: (submitting || loading) ? "default" : "pointer",
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
        onMouseEnter={(e) => { if (!submitting && !loading) e.currentTarget.style.background = "rgba(167,139,250,0.25)"; }}
        onMouseLeave={(e) => { if (!submitting && !loading) e.currentTarget.style.background = "rgba(167,139,250,0.15)"; }}
      >
        {(submitting || loading) ? (
          <>
            <div style={{ width: "10px", height: "10px", border: "1.5px solid rgba(167,139,250,0.3)", borderTopColor: "#a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            connecting…
          </>
        ) : (
          <>+ add server</>
        )}
      </button>
    </div>
  );
}

// ─── MCP Panel ────────────────────────────────────────────────────────────────
function MCPPanel({ servers, mcpTools, loading, error, showPanel, onClose, onAdd, onRemove, onReconnect }) {
  const serverEntries = Object.entries(servers);
  const connectedCount = serverEntries.filter(([, s]) => s.status === "connected").length;

  return (
    <>
      {/* Backdrop (closes panel on click) */}
      {showPanel && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.3)",
          }}
          aria-hidden="true"
        />
      )}

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-label="MCP Servers"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "400px",
          zIndex: 1000,
          background: "rgba(14,14,18,0.98)",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          flexDirection: "column",
          transform: showPanel ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Panel header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <PlugIcon />
            <span style={{
              fontSize: "13px",
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 500,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "0.04em",
            }}>
              MCP Servers
            </span>
            {serverEntries.length > 0 && (
              <span style={{
                padding: "1px 7px",
                borderRadius: "10px",
                background: connectedCount > 0 ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)",
                border: connectedCount > 0 ? "1px solid rgba(74,222,128,0.25)" : "1px solid rgba(255,255,255,0.08)",
                fontSize: "10px",
                fontFamily: "'IBM Plex Mono', monospace",
                color: connectedCount > 0 ? "#4ade80" : "rgba(255,255,255,0.3)",
              }}>
                {connectedCount}/{serverEntries.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close MCP panel"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}>
          {/* Loading overlay hint */}
          {loading && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              borderRadius: "6px",
              background: "rgba(167,139,250,0.06)",
              border: "1px solid rgba(167,139,250,0.15)",
              fontSize: "10px",
              fontFamily: "'IBM Plex Mono', monospace",
              color: "rgba(167,139,250,0.8)",
            }}>
              <div style={{ width: "8px", height: "8px", border: "1.5px solid rgba(167,139,250,0.3)", borderTopColor: "#a78bfa", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
              updating…
            </div>
          )}

          {/* Error banner (non-form errors) */}
          {error && !loading && (
            <div style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
              fontSize: "10px",
              fontFamily: "'IBM Plex Mono', monospace",
              color: "#f87171",
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Server list */}
          {serverEntries.length === 0 && !loading ? (
            <div style={{
              textAlign: "center",
              padding: "32px 16px",
              color: "rgba(255,255,255,0.2)",
              fontSize: "12px",
              fontFamily: "'IBM Plex Mono', monospace",
              lineHeight: 1.7,
            }}>
              No MCP servers configured.{"\n"}Add one below to get started.
            </div>
          ) : (
            serverEntries.map(([name, server]) => (
              <MCPServerCard
                key={name}
                name={name}
                server={server}
                mcpTools={mcpTools}
                onReconnect={onReconnect}
                onRemove={onRemove}
                loading={loading}
              />
            ))
          )}

          {/* Add server form */}
          <AddServerForm onAdd={onAdd} loading={loading} error={null} />
        </div>
      </div>
    </>
  );
}

// ─── Sidebar: Session Info ───────────────────────────────────────────────────
function Sidebar({ sessionId, tools, mcpTools, onClear, onOpenMCP, mcpConnectedCount, agents, selectedAgentId, onSelectAgent, onOpenAgentManager, selectedAgent }) {
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

      {/* Agent Picker */}
      <div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", fontFamily: "'IBM Plex Mono', monospace" }}>Agent</div>
        <AgentPicker
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelect={onSelectAgent}
          onManageClick={onOpenAgentManager}
        />
        {selectedAgent?.description && (
          <div style={{
            marginTop: "6px",
            fontSize: "10px",
            fontFamily: "'IBM Plex Mono', monospace",
            color: "rgba(255,255,255,0.3)",
            lineHeight: 1.5,
            wordBreak: "break-word",
          }}>
            {selectedAgent.description}
          </div>
        )}
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
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", fontFamily: "'IBM Plex Mono', monospace" }}>
          Tools ({tools.length + mcpTools.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* Local tools */}
          {tools.map((t) => (
            <div key={t.name} style={{
              padding: "6px 8px",
              borderRadius: "5px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              fontSize: "10px",
              fontFamily: "'IBM Plex Mono', monospace",
              color: "rgba(255,255,255,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span>{t.name}</span>
            </div>
          ))}
          {/* MCP tools */}
          {mcpTools.map((t) => (
            <div key={`mcp-${t.name}`} style={{
              padding: "6px 8px",
              borderRadius: "5px",
              background: "rgba(52,211,153,0.03)",
              border: "1px solid rgba(52,211,153,0.1)",
              fontSize: "10px",
              fontFamily: "'IBM Plex Mono', monospace",
              color: "rgba(52,211,153,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "4px",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
              <span style={{
                flexShrink: 0,
                padding: "1px 4px",
                borderRadius: "3px",
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.2)",
                fontSize: "8px",
                color: "#34d399",
                letterSpacing: "0.05em",
              }}>MCP</span>
            </div>
          ))}
        </div>
      </div>

      {/* MCP Settings button */}
      <div>
        <button
          onClick={onOpenMCP}
          aria-label="Manage MCP servers"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
            padding: "8px 10px",
            borderRadius: "6px",
            background: "rgba(167,139,250,0.05)",
            border: "1px solid rgba(167,139,250,0.15)",
            color: "rgba(167,139,250,0.7)",
            fontSize: "11px",
            cursor: "pointer",
            fontFamily: "'IBM Plex Mono', monospace",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.1)"; e.currentTarget.style.color = "#a78bfa"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.05)"; e.currentTarget.style.color = "rgba(167,139,250,0.7)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.15)"; }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <GearIcon /> mcp servers
          </span>
          {mcpConnectedCount > 0 && (
            <span style={{
              padding: "1px 6px",
              borderRadius: "10px",
              background: "rgba(74,222,128,0.12)",
              border: "1px solid rgba(74,222,128,0.25)",
              fontSize: "9px",
              color: "#4ade80",
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              {mcpConnectedCount}
            </span>
          )}
        </button>
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
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(248,113,113,0.12)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(248,113,113,0.06)"}
        >
          <ClearIcon /> clear session
        </button>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const {
    agents, selectedAgentId, selectedAgent,
    selectAgent, createAgent, updateAgent, deleteAgent, cloneAgent,
    fetchAgents, loading: agentsLoading, error: agentsError,
  } = useAgents();

  const { messages, sessionId, isLoading, activeTools, sendMessage, clearConversation, cancelStream } = useAgent(selectedAgentId);
  const { servers, mcpTools, loading: mcpLoading, error: mcpError, showPanel, addServer, removeServer, reconnectServer, togglePanel } = useMCP();
  const [input, setInput] = useState("");
  const [tools, setTools] = useState([]);
  const [health, setHealth] = useState(null);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [availableTools, setAvailableTools] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const mcpConnectedCount = Object.values(servers).filter((s) => s.status === "connected").length;

  // Load tools, available tools & health on mount
  useEffect(() => {
    api.getTools().then((d) => setTools(d.tools || [])).catch(() => {});
    api.health().then(setHealth).catch(() => {});
    api.getAvailableTools().then((d) => setAvailableTools(d.tools || [])).catch(() => {});
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

      {/* MCP Panel */}
      <MCPPanel
        servers={servers}
        mcpTools={mcpTools}
        loading={mcpLoading}
        error={mcpError}
        showPanel={showPanel}
        onClose={togglePanel}
        onAdd={addServer}
        onRemove={removeServer}
        onReconnect={reconnectServer}
      />

      {/* Agent Manager Panel */}
      <AgentManager
        show={showAgentManager}
        onClose={() => setShowAgentManager(false)}
        agents={agents}
        onCreateAgent={createAgent}
        onUpdateAgent={updateAgent}
        onDeleteAgent={deleteAgent}
        onCloneAgent={cloneAgent}
        availableTools={availableTools}
        loading={agentsLoading}
        error={agentsError}
      />

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          sessionId={sessionId}
          tools={tools}
          mcpTools={mcpTools}
          onClear={clearConversation}
          onOpenMCP={togglePanel}
          mcpConnectedCount={mcpConnectedCount}
          agents={agents}
          selectedAgentId={selectedAgentId}
          selectedAgent={selectedAgent}
          onSelectAgent={selectAgent}
          onOpenAgentManager={() => setShowAgentManager(true)}
        />

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
