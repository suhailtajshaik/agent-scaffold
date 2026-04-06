import { useState, useCallback, useEffect } from "react";

// ─── Icons ───────────────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const EditIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const CopyIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const TrashIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);

const BotIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" />
    <line x1="12" y1="7" x2="12" y2="11" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);

const ToolIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

// ─── Shared style helpers ────────────────────────────────────────────────────
const FONT = "'IBM Plex Mono', monospace";

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.85)",
  fontSize: 12,
  fontFamily: FONT,
  outline: "none",
  transition: "border-color 0.15s",
  boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 10,
  fontFamily: FONT,
  color: "rgba(255,255,255,0.35)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 5,
  display: "block",
};

const sectionStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

// ─── Toggle component ────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label, id }) {
  return (
    <label
      htmlFor={id}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => onChange(!checked)}
        style={{
          width: 32,
          height: 18,
          borderRadius: 9,
          background: checked ? "rgba(167,139,250,0.7)" : "rgba(255,255,255,0.1)",
          border: `1px solid ${checked ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.15)"}`,
          position: "relative",
          transition: "all 0.2s",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: checked ? "#fff" : "rgba(255,255,255,0.4)",
          position: "absolute",
          top: 2,
          left: checked ? 16 : 2,
          transition: "left 0.2s, background 0.2s",
        }} />
      </div>
      <span style={{
        fontSize: 12,
        fontFamily: FONT,
        color: "rgba(255,255,255,0.7)",
      }}>
        {label}
      </span>
    </label>
  );
}

// ─── Empty form state factory ────────────────────────────────────────────────
function emptyForm() {
  return {
    name: "",
    description: "",
    systemPrompt: "",
    tools: null, // null = all tools
    model: "",
    temperature: 0.7,
    maxTokens: 4096,
    isDefault: false,
    enableUI: true,
    status: "active",
  };
}

function agentToForm(agent) {
  return {
    name: agent.name ?? "",
    description: agent.description ?? "",
    systemPrompt: agent.systemPrompt ?? "",
    tools: agent.tools ?? null,
    model: agent.model ?? "",
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.maxTokens ?? 4096,
    isDefault: agent.isDefault ?? false,
    enableUI: agent.enableUI !== false,
    status: agent.status ?? "active",
  };
}

// ─── Agent Card (list view) ──────────────────────────────────────────────────
function AgentCard({ agent, onEdit, onClone, onDelete, loading }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusColor = agent.status === "active" ? "#4ade80" : "rgba(255,255,255,0.25)";
  const toolCount = agent.tools === null ? null : (agent.tools?.length ?? 0);

  const handleDeleteClick = useCallback(() => {
    if (confirmDelete) {
      onDelete(agent.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }, [confirmDelete, onDelete, agent.id]);

  const iconBtnBase = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 5,
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.4)",
    cursor: loading ? "default" : "pointer",
    flexShrink: 0,
    transition: "all 0.15s",
    outline: "none",
  };

  return (
    <div style={{
      borderRadius: 8,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      padding: "12px 14px",
      display: "flex",
      alignItems: "flex-start",
      gap: 12,
      opacity: loading ? 0.6 : 1,
      transition: "opacity 0.15s",
    }}>
      {/* Status dot */}
      <div style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: statusColor,
        flexShrink: 0,
        marginTop: 5,
        boxShadow: agent.status === "active" ? `0 0 6px ${statusColor}` : "none",
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 13,
            fontFamily: FONT,
            fontWeight: 500,
            color: "rgba(255,255,255,0.85)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {agent.name}
          </span>
          {agent.isDefault && (
            <span style={{
              fontSize: 9,
              fontFamily: FONT,
              color: "rgba(167,139,250,0.7)",
              background: "rgba(167,139,250,0.1)",
              border: "1px solid rgba(167,139,250,0.2)",
              borderRadius: 3,
              padding: "1px 5px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              default
            </span>
          )}
          {agent.status === "inactive" && (
            <span style={{
              fontSize: 9,
              fontFamily: FONT,
              color: "rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 3,
              padding: "1px 5px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}>
              inactive
            </span>
          )}
        </div>

        {agent.description && (
          <div style={{
            fontSize: 11,
            fontFamily: FONT,
            color: "rgba(255,255,255,0.35)",
            marginTop: 3,
            lineHeight: 1.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {agent.description}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          {toolCount === null ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: FONT, color: "#34d399" }}>
              <ToolIcon />all tools
            </span>
          ) : toolCount > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: FONT, color: "#34d399" }}>
              <ToolIcon />{toolCount} tool{toolCount !== 1 ? "s" : ""}
            </span>
          ) : (
            <span style={{ fontSize: 10, fontFamily: FONT, color: "rgba(255,255,255,0.2)" }}>no tools</span>
          )}

          {agent.model && (
            <span style={{ fontSize: 10, fontFamily: FONT, color: "rgba(255,255,255,0.25)" }}>
              {agent.model}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {/* Edit */}
        <button
          onClick={() => onEdit(agent)}
          title="Edit agent"
          disabled={loading}
          style={iconBtnBase}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = "rgba(167,139,250,0.1)"; e.currentTarget.style.color = "#a78bfa"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
        >
          <EditIcon />
        </button>

        {/* Clone */}
        <button
          onClick={() => onClone(agent)}
          title="Clone agent"
          disabled={loading}
          style={iconBtnBase}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = "rgba(52,211,153,0.08)"; e.currentTarget.style.color = "#34d399"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.25)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
        >
          <CopyIcon />
        </button>

        {/* Delete */}
        <button
          onClick={handleDeleteClick}
          title={confirmDelete ? "Click again to confirm deletion" : "Delete agent"}
          disabled={loading}
          style={{
            ...iconBtnBase,
            padding: confirmDelete ? "0 7px" : "0",
            width: confirmDelete ? "auto" : 26,
            background: confirmDelete ? "rgba(248,113,113,0.12)" : "transparent",
            border: confirmDelete ? "1px solid rgba(248,113,113,0.35)" : "1px solid rgba(255,255,255,0.08)",
            color: confirmDelete ? "#f87171" : "rgba(255,255,255,0.4)",
            fontSize: 9,
            fontFamily: FONT,
            gap: 3,
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => { if (!loading && !confirmDelete) { e.currentTarget.style.background = "rgba(248,113,113,0.1)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.3)"; } }}
          onMouseLeave={(e) => { if (!confirmDelete) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; } }}
        >
          <TrashIcon />
          {confirmDelete && <span>confirm?</span>}
        </button>
      </div>
    </div>
  );
}

// ─── Agent Edit Form ─────────────────────────────────────────────────────────
function AgentForm({ initialData, isNew, availableTools, onSave, onCancel, loading, error }) {
  const [form, setForm] = useState(() => initialData ? agentToForm(initialData) : emptyForm());
  const [formError, setFormError] = useState(null);
  const [allTools, setAllTools] = useState(initialData?.tools === null || initialData?.tools === undefined);

  const set = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  }, []);

  const handleAllToolsToggle = useCallback((checked) => {
    setAllTools(checked);
    if (checked) {
      setForm((prev) => ({ ...prev, tools: null }));
    } else {
      setForm((prev) => ({ ...prev, tools: [] }));
    }
  }, []);

  const handleToolToggle = useCallback((toolName) => {
    setForm((prev) => {
      const current = prev.tools ?? [];
      const next = current.includes(toolName)
        ? current.filter((t) => t !== toolName)
        : [...current, toolName];
      return { ...prev, tools: next };
    });
  }, []);

  const handleSave = useCallback(async () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Agent name is required");
      return;
    }
    const payload = {
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
      model: form.model.trim() || undefined,
      temperature: Number(form.temperature),
      maxTokens: Number(form.maxTokens),
      tools: allTools ? null : (form.tools ?? []),
    };
    try {
      await onSave(payload);
    } catch (err) {
      setFormError(err?.message ?? "Failed to save agent");
    }
  }, [form, allTools, onSave]);

  const fieldFocus = (e) => { e.target.style.borderColor = "rgba(167,139,250,0.4)"; };
  const fieldBlur = (e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; };

  const displayError = formError || error;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Name */}
      <div style={sectionStyle}>
        <label style={labelStyle} htmlFor="agent-name">Name *</label>
        <input
          id="agent-name"
          type="text"
          placeholder="e.g. Research Assistant"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          style={inputStyle}
          onFocus={fieldFocus}
          onBlur={fieldBlur}
          autoFocus
        />
      </div>

      {/* Description */}
      <div style={sectionStyle}>
        <label style={labelStyle} htmlFor="agent-desc">Description</label>
        <input
          id="agent-desc"
          type="text"
          placeholder="Brief description of what this agent does"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          style={inputStyle}
          onFocus={fieldFocus}
          onBlur={fieldBlur}
        />
      </div>

      {/* System Prompt */}
      <div style={sectionStyle}>
        <label style={labelStyle} htmlFor="agent-prompt">System Prompt</label>
        <textarea
          id="agent-prompt"
          placeholder="You are a helpful assistant..."
          value={form.systemPrompt}
          onChange={(e) => set("systemPrompt", e.target.value)}
          rows={6}
          style={{
            ...inputStyle,
            resize: "vertical",
            lineHeight: 1.6,
            minHeight: 120,
          }}
          onFocus={fieldFocus}
          onBlur={fieldBlur}
        />
      </div>

      {/* Tools */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Tools</label>
        <div style={{
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.02)",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <Toggle
            id="all-tools-toggle"
            checked={allTools}
            onChange={handleAllToolsToggle}
            label="All tools (unrestricted)"
          />

          {!allTools && (
            <>
              {availableTools?.length > 0 ? (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxHeight: 180,
                  overflowY: "auto",
                  marginTop: 4,
                  paddingRight: 2,
                }}>
                  {availableTools.map((tool) => {
                    const toolName = typeof tool === "string" ? tool : tool.name;
                    const toolDesc = typeof tool === "string" ? "" : tool.description;
                    const isChecked = (form.tools ?? []).includes(toolName);
                    return (
                      <label
                        key={toolName}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          cursor: "pointer",
                          padding: "5px 6px",
                          borderRadius: 5,
                          background: isChecked ? "rgba(52,211,153,0.05)" : "transparent",
                          border: `1px solid ${isChecked ? "rgba(52,211,153,0.15)" : "transparent"}`,
                          transition: "all 0.1s",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToolToggle(toolName)}
                          style={{ marginTop: 2, accentColor: "#34d399", flexShrink: 0 }}
                        />
                        <div>
                          <div style={{ fontSize: 11, fontFamily: FONT, color: "rgba(255,255,255,0.75)" }}>{toolName}</div>
                          {toolDesc && (
                            <div style={{ fontSize: 10, fontFamily: FONT, color: "rgba(255,255,255,0.3)", marginTop: 1, lineHeight: 1.4 }}>
                              {toolDesc.length > 70 ? toolDesc.slice(0, 70) + "…" : toolDesc}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 11, fontFamily: FONT, color: "rgba(255,255,255,0.25)", padding: "4px 0" }}>
                  No tools available — connect MCP servers first
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Model + Temperature row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={sectionStyle}>
          <label style={labelStyle} htmlFor="agent-model">Model</label>
          <input
            id="agent-model"
            type="text"
            placeholder="Default model"
            value={form.model}
            onChange={(e) => set("model", e.target.value)}
            style={inputStyle}
            onFocus={fieldFocus}
            onBlur={fieldBlur}
          />
        </div>
        <div style={sectionStyle}>
          <label style={labelStyle} htmlFor="agent-temp">Temperature</label>
          <input
            id="agent-temp"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.temperature}
            onChange={(e) => set("temperature", e.target.value)}
            style={inputStyle}
            onFocus={fieldFocus}
            onBlur={fieldBlur}
          />
        </div>
      </div>

      {/* Max Tokens */}
      <div style={sectionStyle}>
        <label style={labelStyle} htmlFor="agent-tokens">Max Tokens</label>
        <input
          id="agent-tokens"
          type="number"
          min={1}
          step={256}
          value={form.maxTokens}
          onChange={(e) => set("maxTokens", e.target.value)}
          style={inputStyle}
          onFocus={fieldFocus}
          onBlur={fieldBlur}
        />
      </div>

      {/* Toggles */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        padding: "12px 14px",
      }}>
        <Toggle
          id="agent-default"
          checked={form.isDefault}
          onChange={(v) => set("isDefault", v)}
          label="Set as default agent"
        />
        <Toggle
          id="agent-ui"
          checked={form.enableUI}
          onChange={(v) => set("enableUI", v)}
          label="Enable UI access"
        />
        <Toggle
          id="agent-status"
          checked={form.status === "active"}
          onChange={(v) => set("status", v ? "active" : "inactive")}
          label={`Status: ${form.status}`}
        />
      </div>

      {/* Error banner */}
      {displayError && (
        <div style={{
          padding: "8px 12px",
          borderRadius: 6,
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.2)",
          fontSize: 11,
          fontFamily: FONT,
          color: "#f87171",
          lineHeight: 1.5,
        }}>
          {displayError}
        </div>
      )}

      {/* Save / Cancel */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleSave}
          disabled={loading}
          style={{
            flex: 1,
            padding: "9px 14px",
            borderRadius: 6,
            background: loading ? "rgba(167,139,250,0.06)" : "rgba(167,139,250,0.15)",
            border: "1px solid rgba(167,139,250,0.3)",
            color: loading ? "rgba(167,139,250,0.4)" : "#a78bfa",
            fontSize: 12,
            fontFamily: FONT,
            cursor: loading ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.15s",
            outline: "none",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "rgba(167,139,250,0.25)"; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "rgba(167,139,250,0.15)"; }}
        >
          {loading ? (
            <>
              <div style={{
                width: 10,
                height: 10,
                border: "1.5px solid rgba(167,139,250,0.3)",
                borderTopColor: "#a78bfa",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }} />
              saving…
            </>
          ) : (
            isNew ? "+ Create Agent" : "Save Changes"
          )}
        </button>

        <button
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: "9px 14px",
            borderRadius: 6,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.45)",
            fontSize: 12,
            fontFamily: FONT,
            cursor: loading ? "default" : "pointer",
            transition: "all 0.15s",
            outline: "none",
          }}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── AgentManager ────────────────────────────────────────────────────────────
export function AgentManager({
  show,
  onClose,
  agents,
  onCreateAgent,
  onUpdateAgent,
  onDeleteAgent,
  onCloneAgent,
  availableTools,
  loading,
  error,
}) {
  // view: "list" | "create" | "edit"
  const [view, setView] = useState("list");
  const [editingAgent, setEditingAgent] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // Reset to list when panel is hidden
  useEffect(() => {
    if (!show) {
      setView("list");
      setEditingAgent(null);
      setSaveError(null);
    }
  }, [show]);

  // Close panel on Escape
  useEffect(() => {
    if (!show) return;
    const handleKey = (e) => {
      if (e.key === "Escape") {
        if (view !== "list") {
          setView("list");
          setEditingAgent(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [show, view, onClose]);

  const handleEdit = useCallback((agent) => {
    setEditingAgent(agent);
    setSaveError(null);
    setView("edit");
  }, []);

  const handleCreate = useCallback(() => {
    setEditingAgent(null);
    setSaveError(null);
    setView("create");
  }, []);

  const handleClone = useCallback((agent) => {
    setEditingAgent({
      ...agent,
      id: undefined,
      name: `${agent.name} (copy)`,
      isDefault: false,
    });
    setSaveError(null);
    setView("create");
  }, []);

  const handleDelete = useCallback(async (id) => {
    try {
      await onDeleteAgent(id);
    } catch (err) {
      // Surface error without navigating away
      setSaveError(err?.message ?? "Failed to delete agent");
    }
  }, [onDeleteAgent]);

  const handleSaveCreate = useCallback(async (payload) => {
    setSaveError(null);
    await onCreateAgent(payload);
    setView("list");
    setEditingAgent(null);
  }, [onCreateAgent]);

  const handleSaveEdit = useCallback(async (payload) => {
    setSaveError(null);
    await onUpdateAgent(editingAgent.id, payload);
    setView("list");
    setEditingAgent(null);
  }, [onUpdateAgent, editingAgent]);

  const handleBack = useCallback(() => {
    setView("list");
    setEditingAgent(null);
    setSaveError(null);
  }, []);

  const viewTitle = view === "create"
    ? "New Agent"
    : view === "edit"
    ? "Edit Agent"
    : "Agents";

  return (
    <>
      {/* Backdrop */}
      {show && (
        <div
          onClick={onClose}
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      )}

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-label="Agent Manager"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: 500,
          zIndex: 1000,
          background: "rgba(14,14,18,0.98)",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          flexDirection: "column",
          transform: show ? "translateX(0)" : "translateX(100%)",
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Back button when in form view */}
            {view !== "list" && (
              <button
                onClick={handleBack}
                aria-label="Back to agent list"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  outline: "none",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
              >
                <ArrowLeftIcon />
              </button>
            )}

            <BotIcon />

            <span style={{
              fontSize: 13,
              fontFamily: FONT,
              fontWeight: 500,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "0.04em",
            }}>
              {viewTitle}
            </span>

            {view === "list" && agents.length > 0 && (
              <span style={{
                padding: "1px 7px",
                borderRadius: 10,
                background: "rgba(74,222,128,0.1)",
                border: "1px solid rgba(74,222,128,0.2)",
                fontSize: 10,
                fontFamily: FONT,
                color: "#4ade80",
              }}>
                {agents.filter((a) => a.status === "active").length}/{agents.length}
              </span>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close Agent Manager"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              transition: "all 0.15s",
              outline: "none",
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
          gap: 12,
        }}>
          {/* Global loading indicator */}
          {loading && view === "list" && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 6,
              background: "rgba(167,139,250,0.06)",
              border: "1px solid rgba(167,139,250,0.15)",
              fontSize: 10,
              fontFamily: FONT,
              color: "rgba(167,139,250,0.8)",
            }}>
              <div style={{
                width: 8,
                height: 8,
                border: "1.5px solid rgba(167,139,250,0.3)",
                borderTopColor: "#a78bfa",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
                flexShrink: 0,
              }} />
              updating…
            </div>
          )}

          {/* Global error banner (list view only) */}
          {(error || saveError) && view === "list" && (
            <div style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.2)",
              fontSize: 10,
              fontFamily: FONT,
              color: "#f87171",
              lineHeight: 1.5,
            }}>
              {saveError || error}
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {view === "list" && (
            <>
              {/* Create new agent button */}
              <button
                onClick={handleCreate}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 7,
                  background: "rgba(167,139,250,0.08)",
                  border: "1px dashed rgba(167,139,250,0.3)",
                  color: "rgba(167,139,250,0.8)",
                  fontSize: 12,
                  fontFamily: FONT,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all 0.15s",
                  outline: "none",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.14)"; e.currentTarget.style.color = "#a78bfa"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.5)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.08)"; e.currentTarget.style.color = "rgba(167,139,250,0.8)"; e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)"; }}
              >
                + Create New Agent
              </button>

              {/* Agent cards */}
              {agents.length === 0 && !loading ? (
                <div style={{
                  textAlign: "center",
                  padding: "40px 20px",
                  color: "rgba(255,255,255,0.2)",
                  fontSize: 12,
                  fontFamily: FONT,
                  lineHeight: 1.8,
                }}>
                  No agents configured yet.{"\n"}Create one to get started.
                </div>
              ) : (
                agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onEdit={handleEdit}
                    onClone={handleClone}
                    onDelete={handleDelete}
                    loading={loading}
                  />
                ))
              )}
            </>
          )}

          {/* ── CREATE VIEW ── */}
          {view === "create" && (
            <AgentForm
              initialData={editingAgent}
              isNew
              availableTools={availableTools}
              onSave={handleSaveCreate}
              onCancel={handleBack}
              loading={loading}
              error={saveError}
            />
          )}

          {/* ── EDIT VIEW ── */}
          {view === "edit" && editingAgent && (
            <AgentForm
              initialData={editingAgent}
              isNew={false}
              availableTools={availableTools}
              onSave={handleSaveEdit}
              onCancel={handleBack}
              loading={loading}
              error={saveError}
            />
          )}
        </div>
      </div>
    </>
  );
}
