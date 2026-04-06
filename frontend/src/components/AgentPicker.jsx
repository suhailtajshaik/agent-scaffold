import { useState, useRef, useEffect } from "react";

// ─── Icons ──────────────────────────────────────────────────────────────────
const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const GearIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// ─── AgentPicker ────────────────────────────────────────────────────────────
export function AgentPicker({ agents, selectedAgentId, onSelect, onManageClick }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const activeAgents = agents.filter((a) => a.status === "active");

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: "relative", minWidth: 160, maxWidth: 220 }}>
      {/* Trigger button showing current agent */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current agent: ${selectedAgent?.name ?? "Select Agent"}`}
        style={{
          background: isOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${isOpen ? "rgba(167,139,250,0.35)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 6,
          padding: "6px 10px",
          color: "rgba(255,255,255,0.9)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontFamily: "'IBM Plex Mono', monospace",
          width: "100%",
          transition: "all 0.15s",
          outline: "none",
        }}
      >
        {/* Status dot */}
        <span style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: selectedAgent ? "#4ade80" : "rgba(255,255,255,0.2)",
          display: "inline-block",
          flexShrink: 0,
          boxShadow: selectedAgent ? "0 0 5px rgba(74,222,128,0.5)" : "none",
        }} />

        {/* Agent name */}
        <span style={{
          flex: 1,
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: selectedAgent ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
        }}>
          {selectedAgent?.name ?? "Select Agent"}
        </span>

        {/* Chevron */}
        <span style={{
          display: "flex",
          color: "rgba(255,255,255,0.4)",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.15s",
          flexShrink: 0,
        }}>
          <ChevronDownIcon />
        </span>
      </button>

      {/* Dropdown list */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Available agents"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "rgba(18,18,22,0.99)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            zIndex: 1000,
            maxHeight: 320,
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {activeAgents.length === 0 ? (
            <div style={{
              padding: "16px 12px",
              textAlign: "center",
              fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace",
              color: "rgba(255,255,255,0.25)",
            }}>
              No active agents
            </div>
          ) : (
            activeAgents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;
              return (
                <button
                  key={agent.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelect(agent.id);
                    setIsOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 12px",
                    background: isSelected ? "rgba(167,139,250,0.12)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.9)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    transition: "background 0.1s",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 500, color: isSelected ? "#a78bfa" : "rgba(255,255,255,0.85)" }}>
                      {agent.name}
                    </span>
                    {agent.isDefault && (
                      <span style={{
                        fontSize: 9,
                        color: "rgba(255,255,255,0.3)",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 3,
                        padding: "1px 4px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}>
                        default
                      </span>
                    )}
                    {isSelected && (
                      <span style={{ marginLeft: "auto", color: "#a78bfa", fontSize: 10 }}>✓</span>
                    )}
                  </div>
                  {agent.description && (
                    <div style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.35)",
                      marginTop: 3,
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {agent.description}
                    </div>
                  )}
                </button>
              );
            })
          )}

          {/* Manage button */}
          <button
            onClick={() => {
              onManageClick();
              setIsOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              width: "100%",
              padding: "9px 12px",
              background: "transparent",
              border: "none",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(167,139,250,0.75)",
              cursor: "pointer",
              textAlign: "center",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              transition: "all 0.15s",
              outline: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(167,139,250,0.06)";
              e.currentTarget.style.color = "#a78bfa";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(167,139,250,0.75)";
            }}
          >
            <GearIcon />
            Manage Agents
          </button>
        </div>
      )}
    </div>
  );
}
