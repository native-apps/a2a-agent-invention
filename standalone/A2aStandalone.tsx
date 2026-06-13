// ---------------------------------------------------------------------------
// A2A Agent — Fullscreen Isolated Tauri Window
// ---------------------------------------------------------------------------
// Renders a standalone chat UI for the A2A agent. Designed to run in its own
// Tauri WebviewWindow, independent from the main Mother Brain window.
// Connects to the live A2A endpoint via JSON-RPC 2.0.
// ---------------------------------------------------------------------------

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Trash2 } from "lucide-react";
import BrainLogo from "../../../components/BrainLogo";

// ── Types ────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  time: string;
}

interface AgentConfig {
  agentName: string;
  agentDescription: string;
  agentUrl: string;
  widgetColor: string;
  widgetBranding: string;
  logoUrl: string;
}

// ── Themes ──────────────────────────────────────────────────────────────

const T_DARK = {
  deepVoid: "#0a0a0f",
  darkMatter: "#13131f",
  neuralNode: "#1e1e2d",
  neonGreen: "#39ff14",
  text: "#e2e8f0",
  textMuted: "#64748b",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

const T_LIGHT = {
  deepVoid: "#f9fafb",
  darkMatter: "#ffffff",
  neuralNode: "#e5e7eb",
  neonGreen: "#059669",
  text: "#111827",
  textMuted: "#6b7280",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

// ── Helpers ──────────────────────────────────────────────────────────────

function timeNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getVisitorId(): string {
  const KEY = "a2a_standalone_visitor_id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

// ── Component ────────────────────────────────────────────────────────────

const A2aStandalone: React.FC = () => {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visitorIdRef = useRef(getVisitorId());

  // ── Light/dark mode detection (device preference) ──
  const [isLightMode, setIsLightMode] = useState(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      return true;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const check = () => setIsLightMode(mediaQuery.matches);
    mediaQuery.addEventListener("change", check);
    return () => mediaQuery.removeEventListener("change", check);
  }, []);

  const T = isLightMode ? T_LIGHT : T_DARK;

  // ── Load invention config from the Mother Brain API ──
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/api/inventions/a2a-agent");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const s = data.settings || {};
        setConfig({
          agentName: s.agentName || "Mother",
          agentDescription:
            s.agentDescription || "AI assistant powered by Mother Brain",
          agentUrl: s.agentUrl || "https://a2a.motherbrain.app",
          widgetColor: s.widgetColor || "#39ff14",
          widgetBranding: s.widgetBranding || "Powered by Mother Brain",
          logoUrl: s.logoUrl || "",
        });
        // Set welcome message
        setMessages([
          {
            id: "welcome",
            role: "agent",
            text: `Hi! I'm **${s.agentName || "Mother"}**, ${s.agentDescription || "your AI assistant"}. How can I help you today?`,
            time: timeNow(),
          },
        ]);
      } catch (err) {
        setError(
          `Failed to load config: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on load
  useEffect(() => {
    if (!loading && config) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [loading, config]);

  // ── Send message via JSON-RPC 2.0 ──
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !config) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      time: timeNow(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(config.agentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "message/send",
          params: {
            taskId: currentTaskId || undefined,
            message: {
              role: "user",
              parts: [{ type: "text", text }],
            },
            metadata: {
              visitor_id: visitorIdRef.current,
              source: "standalone-window",
            },
          },
          id: Date.now(),
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "agent",
            text: `⚠ Error: ${data.error.message || "Unknown error"}`,
            time: timeNow(),
          },
        ]);
        return;
      }

      const task = data.result?.task;
      if (task?.taskId) setCurrentTaskId(task.taskId);

      if (task?.history && Array.isArray(task.history)) {
        const agentEvents = task.history.filter(
          (e: { role: string }) => e.role === "agent",
        );
        const lastAgent = agentEvents[agentEvents.length - 1];
        if (lastAgent?.parts) {
          const agentText = lastAgent.parts
            .filter((p: { type: string }) => p.type === "text")
            .map((p: { text?: string }) => p.text || "")
            .join("");
          if (agentText) {
            setMessages((prev) => [
              ...prev,
              {
                id: `a-${Date.now()}`,
                role: "agent",
                text: agentText,
                time: timeNow(),
              },
            ]);
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "agent",
          text: `⚠ Failed to reach agent: ${err instanceof Error ? err.message : "Network error"}`,
          time: timeNow(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, config, currentTaskId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setCurrentTaskId(null);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "agent",
        text: `Chat cleared. How can I help you?`,
        time: timeNow(),
      },
    ]);
  };

  // ── Render: Loading ──
  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: T.deepVoid,
          fontFamily: T.font,
        }}
      >
        <Loader2
          size={24}
          style={{ color: T.neonGreen, animation: "spin 1s linear infinite" }}
        />
      </div>
    );
  }

  // ── Render: Error ──
  if (error || !config) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: T.deepVoid,
          fontFamily: T.font,
          color: "#ef4444",
          gap: 12,
          padding: 40,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 14 }}>{error || "No configuration found"}</p>
        <p style={{ fontSize: 12, color: T.textMuted }}>
          Make sure the Mother Brain server is running.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 12,
            padding: "8px 16px",
            background: `${T.neonGreen}20`,
            color: T.neonGreen,
            border: `1px solid ${T.neonGreen}40`,
            borderRadius: 6,
            fontFamily: T.font,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Render: Chat UI ──
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: T.deepVoid,
        fontFamily: T.font,
        color: T.text,
      }}
    >
      {/* ── Title Bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 20px",
          borderBottom: `1px solid ${T.neuralNode}`,
          backgroundColor: T.darkMatter,
          flexShrink: 0,
        }}
      >
        <BrainLogo size={28} color={T.neonGreen} logoUrl={config.logoUrl} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.neonGreen }}>
            {config.agentName}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted }}>
            {config.widgetBranding}
          </div>
        </div>
        <button
          onClick={clearChat}
          title="Clear chat"
          style={{
            background: "none",
            border: "none",
            color: T.textMuted,
            cursor: "pointer",
            padding: 6,
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* ── Messages ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              gap: 4,
            }}
          >
            <span
              style={{ fontSize: 10, color: T.textMuted, fontFamily: T.font }}
            >
              {msg.role === "user" ? "You" : config.agentName} · {msg.time}
            </span>
            <div
              style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                ...(msg.role === "user"
                  ? {
                      backgroundColor: `${config.widgetColor}15`,
                      border: `1px solid ${config.widgetColor}30`,
                      color: T.text,
                      borderBottomRightRadius: 2,
                    }
                  : {
                      backgroundColor: T.darkMatter,
                      border: `1px solid ${T.neuralNode}`,
                      color: T.text,
                      borderBottomLeftRadius: 2,
                    }),
              }}
            >
              {msg.text.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                  return (
                    <strong key={i} style={{ color: T.neonGreen }}>
                      {part.slice(2, -2)}
                    </strong>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </div>
          </div>
        ))}
        {sending && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: T.textMuted,
              fontSize: 12,
            }}
          >
            <Loader2
              size={14}
              style={{ animation: "spin 1s linear infinite" }}
            />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar ── */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: `1px solid ${T.neuralNode}`,
          backgroundColor: T.darkMatter,
          display: "flex",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${config.agentName}...`}
          disabled={sending}
          style={{
            flex: 1,
            padding: "10px 14px",
            backgroundColor: T.deepVoid,
            border: `1px solid ${T.neuralNode}`,
            borderRadius: 8,
            color: T.text,
            fontFamily: T.font,
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          style={{
            padding: "10px 16px",
            background: sending
              ? `${config.widgetColor}30`
              : config.widgetColor,
            color: sending ? T.textMuted : T.deepVoid,
            border: "none",
            borderRadius: 8,
            fontFamily: T.font,
            fontSize: 13,
            fontWeight: 600,
            cursor: sending ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Send size={14} />
          Send
        </button>
      </div>
    </div>
  );
};

export default A2aStandalone;
