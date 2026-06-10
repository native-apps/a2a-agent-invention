// ---------------------------------------------------------------------------
// A2A Agent — Fullscreen Chat Overlay Preview
// ---------------------------------------------------------------------------
// Renders a REAL preview of the Chat UI — a fullscreen overlay that
// collapses to a full-width bottom bar. Uses the cyberpunk theme from
// motherbrain.app. Connects to the actual Mother Brain chat API when
// an active model is configured.
// ---------------------------------------------------------------------------

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Minimize2, Maximize2, Loader2 } from "lucide-react";
import BrainLogo from "../../../components/BrainLogo";
import FastMarkdown from "../../../components/FastMarkdown";

// ── Types ────────────────────────────────────────────────────────────────

interface A2aChatPreviewProps {
  invention: {
    settings: Record<string, unknown>;
  };
}

interface ChatMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  time: string;
  taskId?: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    resultPreview?: string;
  }>;
  isWorking?: boolean; // true while the agent is processing
  thinking?: string; // current thinking/working label
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getSettings(settings: Record<string, unknown>) {
  return {
    agentName: (settings.agentName as string) || "Mother",
    agentDescription:
      (settings.agentDescription as string) ||
      "AI assistant powered by Mother Brain",
    agentUrl: (settings.agentUrl as string) || "",
    widgetColor: (settings.widgetColor as string) || "#39ff14",
    widgetBranding:
      (settings.widgetBranding as string) || "Powered by Mother Brain",
    logoUrl: (settings.logoUrl as string) || "",
  };
}

// BrainLogo is imported from ../../../components/BrainLogo

function timeNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Dark theme (default) ───────────────────────────────────────────────

const T_DARK = {
  deepVoid: "#0a0a0f",
  darkMatter: "#13131f",
  neuralNode: "#1e1e2d",
  neonGreen: "#39ff14",
  hotPink: "#ff3d7f",
  bloodOrange: "#ff5500",
  electricCyan: "#38bdf8",
  text: "#e2e8f0",
  textMuted: "#64748b",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

// ── Light theme ─────────────────────────────────────────────────────────

const T_LIGHT = {
  deepVoid: "#f9fafb",
  darkMatter: "#ffffff",
  neuralNode: "#e5e7eb",
  neonGreen: "#059669",
  hotPink: "#db2777",
  bloodOrange: "#ea580c",
  electricCyan: "#0284c7",
  text: "#111827",
  textMuted: "#6b7280",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

// ── Visitor ID (persisted in localStorage) ──────────────────────────
// Uses localStorage so the visitor ID survives page reloads and tab switches.
// This is the sessionless architecture — the ID persists indefinitely.

const PREVIEW_VISITOR_KEY = "motherbrain_preview_visitor_id";
const INITIAL_LOAD_LIMIT = 10;
const LOAD_MORE_LIMIT = 10;

function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(PREVIEW_VISITOR_KEY);
    if (existing) return existing;
    const id = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(PREVIEW_VISITOR_KEY, id);
    return id;
  } catch {
    return `preview-${Date.now()}-temp`;
  }
}

function timeFromISO(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ── Supabase History Loading ─────────────────────────────────────────────

interface HistoryMessage {
  id: string;
  role: string;
  text: string;
  created_at: string;
  task_id: string;
}

async function fetchHistoryFromSupabase(
  supabaseUrl: string,
  supabaseKey: string,
  visitorId: string,
  limit: number,
  beforeCreatedAt?: string,
): Promise<{ messages: HistoryMessage[]; hasMore: boolean }> {
  try {
    const endpointUrl = "https://a2a.motherbrain.app";
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "visitor/history",
        id: Date.now(),
        params: {
          visitor_id: visitorId,
          limit: 20,
        },
      }),
    });

    if (!res.ok) return { messages: [], hasMore: false };

    const data = await res.json();
    if (data.error) return { messages: [], hasMore: false };

    const conversations: Array<{
      taskId: string;
      messages: Array<{ role: string; text: string }>;
      createdAt: string;
    }> = data.result?.conversations || [];

    const allMessages: HistoryMessage[] = [];
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        allMessages.push({
          id: `hist-${conv.taskId}-${allMessages.length}`,
          role: msg.role,
          text: msg.text,
          created_at: conv.createdAt,
          task_id: conv.taskId,
        });
      }
    }

    let filtered = allMessages;
    if (beforeCreatedAt) {
      filtered = allMessages.filter((m) => m.created_at < beforeCreatedAt);
    }

    const hasMore = filtered.length > limit;
    const sliced = filtered.slice(-limit);

    return { messages: sliced, hasMore };
  } catch (err) {
    console.warn("Failed to fetch history from Supabase:", err);
    return { messages: [], hasMore: false };
  }
}

// ── Persistence ──────────────────────────────────────────────────────────

function saveTaskId(id: string) {
  try {
    localStorage.setItem("motherbrain_preview_task_id", id);
  } catch {
    /* */
  }
}
function loadTaskId(): string | null {
  try {
    return localStorage.getItem("motherbrain_preview_task_id");
  } catch {
    return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────

const A2aChatPreview: React.FC<A2aChatPreviewProps> = ({ invention }) => {
  const cfg = getSettings(invention.settings);
  const endpointUrl = cfg.agentUrl || "https://a2a.motherbrain.app";
  const [mode, setMode] = useState<"overlay" | "bar">("overlay");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(
    loadTaskId(),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const visitorIdRef = useRef(getOrCreateVisitorId());
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Light/dark mode detection ──
  // Detects the user's device preference AND the Mother Brain app's light mode.
  // The MB app sets `document.body.classList.contains('light')`.
  // For the standalone Chat UI package, it falls back to `prefers-color-scheme`.
  const [isLightMode, setIsLightMode] = useState(() => {
    if (
      typeof document !== "undefined" &&
      document.body.classList.contains("light")
    ) {
      return true;
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      return true;
    }
    return false;
  });

  useEffect(() => {
    // Listen for Mother Brain app theme changes (body class)
    const check = () => {
      const bodyLight = document.body.classList.contains("light");
      const deviceLight = window.matchMedia(
        "(prefers-color-scheme: light)",
      ).matches;
      setIsLightMode(bodyLight || deviceLight);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    // Also listen for device theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener("change", check);
    check();
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", check);
    };
  }, []);

  // Select theme based on mode
  const T = isLightMode ? T_LIGHT : T_DARK;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when overlay opens
  useEffect(() => {
    if (mode === "overlay") {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [mode]);

  // ── Load chat history from Supabase on mount ──
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const supabaseUrl = (invention.settings.supabaseUrl as string) || "";
        const supabaseKey =
          (invention.settings.supabaseServiceKey as string) || "";
        const { messages: historyMsgs, hasMore } =
          await fetchHistoryFromSupabase(
            supabaseUrl,
            supabaseKey,
            visitorIdRef.current,
            INITIAL_LOAD_LIMIT,
          );

        if (historyMsgs.length > 0) {
          const chatMsgs: ChatMessage[] = historyMsgs.map((hm) => ({
            id: hm.id,
            role: (hm.role === "user" ? "user" : "agent") as "user" | "agent",
            text: hm.text,
            time: timeFromISO(hm.created_at),
            taskId: hm.task_id,
          }));

          setMessages(chatMsgs);
          setHasMoreHistory(hasMore);

          const lastMsg = chatMsgs[chatMsgs.length - 1];
          if (lastMsg?.taskId) {
            setCurrentTaskId(lastMsg.taskId);
            saveTaskId(lastMsg.taskId);
          }
        } else {
          // No history — start with empty chat
          setMessages([]);
        }
      } catch {
        setMessages([]);
      }
      setIsLoadingHistory(false);
    };

    loadHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more history on scroll-up ──
  const loadOlderMessages = async () => {
    if (isLoadingHistory || !hasMoreHistory) return;
    setIsLoadingHistory(true);

    const prevScrollHeight = scrollContainerRef.current?.scrollHeight || 0;

    try {
      const beforeCursor = messages[0]?.time;
      const supabaseUrl = (invention.settings.supabaseUrl as string) || "";
      const supabaseKey =
        (invention.settings.supabaseServiceKey as string) || "";

      const { messages: olderMsgs, hasMore } = await fetchHistoryFromSupabase(
        supabaseUrl,
        supabaseKey,
        visitorIdRef.current,
        LOAD_MORE_LIMIT,
        beforeCursor,
      );

      if (olderMsgs.length > 0) {
        const chatMsgs: ChatMessage[] = olderMsgs.map((hm) => ({
          id: hm.id,
          role: (hm.role === "user" ? "user" : "agent") as "user" | "agent",
          text: hm.text,
          time: timeFromISO(hm.created_at),
          taskId: hm.task_id,
        }));

        setMessages((prev) => [...chatMsgs, ...prev]);
        setHasMoreHistory(hasMore);

        // Preserve scroll position after prepending
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      } else {
        setHasMoreHistory(false);
      }
    } catch {
      // Silently fail
    }
    setIsLoadingHistory(false);
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container || isLoadingHistory || !hasMoreHistory) return;
    if (container.scrollTop < 50) {
      loadOlderMessages();
    }
  };

  // Cleanup streaming timers
  useEffect(() => {
    return () => {
      if (streamTimerRef.current) {
        clearTimeout(streamTimerRef.current);
      }
    };
  }, []);

  // ── Typewriter streaming (matches website Chat UI) ──
  const streamText = useCallback((fullText: string, messageIndex: number) => {
    setIsStreaming(true);
    let charIndex = 0;
    const speed = 12; // 12ms per character

    const tick = () => {
      charIndex++;
      const visibleText = fullText.slice(0, charIndex);
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex ? { ...m, text: visibleText } : m,
        ),
      );
      if (charIndex < fullText.length) {
        streamTimerRef.current = setTimeout(tick, speed);
      } else {
        setIsStreaming(false);
      }
    };

    setMessages((prev) =>
      prev.map((m, i) => (i === messageIndex ? { ...m, text: "" } : m)),
    );
    streamTimerRef.current = setTimeout(tick, speed);
  }, []);

  const streamToolCalls = useCallback(
    (
      toolCalls: ChatMessage["toolCalls"],
      messageIndex: number,
      onComplete: () => void,
    ) => {
      if (!toolCalls || toolCalls.length === 0) {
        onComplete();
        return;
      }
      setIsStreaming(true);
      let callIndex = 0;
      const delay = 400;

      const showNext = () => {
        if (callIndex >= toolCalls.length) {
          onComplete();
          return;
        }
        const callsSoFar = toolCalls.slice(0, callIndex + 1);
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex ? { ...m, toolCalls: callsSoFar } : m,
          ),
        );
        callIndex++;
        streamTimerRef.current = setTimeout(showNext, delay);
      };
      showNext();
    },
    [],
  );

  // ── Send message to live A2A endpoint via JSON-RPC 2.0 ──
  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      time: timeNow(),
    };

    const agentId = `a-${Date.now()}`;
    const workingMsg: ChatMessage = {
      id: agentId,
      role: "agent",
      text: "",
      time: timeNow(),
      isWorking: true,
      thinking: "Thinking...",
    };

    setMessages((prev) => [...prev, userMsg, workingMsg]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch(endpointUrl, {
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
            metadata: { visitor_id: visitorIdRef.current },
          },
          id: Date.now(),
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === agentId
              ? {
                  ...m,
                  text: `⚠ Connection error: ${data.error.message || "Unknown error"}`,
                  isWorking: false,
                  thinking: undefined,
                }
              : m,
          ),
        );
        return;
      }

      const task = data.result?.task;
      if (task?.taskId) {
        setCurrentTaskId(task.taskId);
        saveTaskId(task.taskId);
      }

      let agentText = "";
      let toolCalls: ChatMessage["toolCalls"] = [];

      if (task?.history && Array.isArray(task.history)) {
        const agentEvents = task.history.filter(
          (e: { role: string }) => e.role === "agent",
        );
        const lastAgent = agentEvents[agentEvents.length - 1];
        if (lastAgent?.parts) {
          agentText = lastAgent.parts
            .filter((p: { type: string }) => p.type === "text")
            .map((p: { text?: string }) => p.text || "")
            .join("");
        }
      }

      // Extract tool calls from artifacts metadata
      // Log the full response for debugging
      console.log(
        "[preview] A2A response:",
        JSON.stringify(data.result, null, 2)?.slice(0, 2000),
      );

      const artifacts = data.result?.artifacts;
      if (artifacts && Array.isArray(artifacts)) {
        // Use the LAST artifact (matches website a2a.ts logic)
        const lastArtifact = artifacts[artifacts.length - 1];
        if (
          lastArtifact?.metadata?.toolCalls &&
          Array.isArray(lastArtifact.metadata.toolCalls)
        ) {
          toolCalls = lastArtifact.metadata.toolCalls.map((tc: any) => ({
            name: tc.name || tc.toolName || "unknown",
            args: tc.args || tc.arguments || {},
            resultPreview: tc.resultPreview
              ? tc.resultPreview
              : tc.result
                ? typeof tc.result === "string"
                  ? tc.result.slice(0, 500)
                  : JSON.stringify(tc.result).slice(0, 500)
                : undefined,
          }));
        }
        console.log(
          "[preview] Extracted tool calls:",
          toolCalls.length,
          toolCalls.map((tc: any) => tc.name),
        );
      } else {
        console.log(
          "[preview] No artifacts in response. data.result keys:",
          data.result ? Object.keys(data.result) : "no result",
        );
      }

      if (!agentText && !toolCalls.length) {
        agentText = "No response received.";
      }

      // Mark as no longer working
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? { ...m, isWorking: false, thinking: undefined }
            : m,
        ),
      );

      // Get current index of the agent message and stream into it
      // Use a small setTimeout to ensure state update has applied
      setTimeout(() => {
        setMessages((current) => {
          const idx = current.findIndex((m) => m.id === agentId);
          if (idx === -1) return current;

          if (toolCalls.length > 0) {
            streamToolCalls(toolCalls, idx, () => {
              streamText(agentText, idx);
            });
          } else {
            streamText(agentText, idx);
          }
          return current;
        });
      }, 50);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? {
                ...m,
                text: `⚠ Failed to reach agent at ${endpointUrl}. ${err instanceof Error ? err.message : "Network error"}`,
                isWorking: false,
                thinking: undefined,
              }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Get last agent message for the bar preview
  const lastAgentMsg = [...messages].reverse().find((m) => m.role === "agent");
  const barPreview = lastAgentMsg
    ? lastAgentMsg.text.replace(/\*\*/g, "").slice(0, 120)
    : "";

  // ── BAR MODE (collapsed full-width bottom bar) ──
  if (mode === "bar") {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          width: "100%",
          zIndex: 1000,
          borderTop: `1px solid ${T.neonGreen}40`,
          backgroundColor: T.deepVoid + "f5",
          backdropFilter: "blur(12px)",
          fontFamily: T.font,
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
          }}
        >
          {/* Brain icon */}
          <BrainLogo size={24} color={T.neonGreen} logoUrl={cfg.logoUrl} />
          {/* Preview text */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              fontSize: 13,
              color: T.neonGreen,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {barPreview}
          </div>
          {/* Expand button */}
          <button
            onClick={() => setMode("overlay")}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
            }}
          >
            <Maximize2 size={16} />
          </button>
          {/* Close button */}
          <button
            onClick={() => setMode("overlay")}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // ── OVERLAY MODE (fullscreen chat) ──
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "500px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: T.deepVoid,
        fontFamily: T.font,
        color: T.text,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${T.neuralNode}`,
          padding: "12px 20px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BrainLogo size={28} color={T.neonGreen} logoUrl={cfg.logoUrl} />
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: T.neonGreen,
                letterSpacing: "0.05em",
              }}
            >
              {cfg.agentName.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: T.textMuted }}>online</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setMode("bar")}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 6,
            }}
          >
            <Minimize2 size={18} />
          </button>
          <button
            onClick={() => setMode("bar")}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}
      >
        <div
          style={{
            maxWidth: 780,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  border: `1px solid ${
                    msg.role === "user" ? T.hotPink + "30" : T.neonGreen + "15"
                  }`,
                  backgroundColor:
                    msg.role === "user" ? T.hotPink + "10" : T.darkMatter,
                  padding: "12px 14px",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {msg.role === "agent" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 6,
                      fontSize: 10,
                      color: T.neonGreen,
                    }}
                  >
                    <span>⟡</span>
                    <span style={{ letterSpacing: "0.05em" }}>
                      {cfg.agentName.toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Thinking indicator */}
                {msg.role === "agent" && msg.isWorking && !msg.text && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: T.textMuted,
                    }}
                  >
                    <Loader2
                      size={12}
                      className="animate-spin"
                      style={{ color: T.neonGreen }}
                    />
                    <span style={{ fontSize: 12 }}>
                      {msg.thinking || "Thinking..."}
                    </span>
                  </div>
                )}

                {/* Tool calls (expandable) */}
                {msg.role === "agent" &&
                  msg.toolCalls &&
                  msg.toolCalls.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {msg.toolCalls.map((tc, j) => (
                        <details
                          key={j}
                          style={{
                            borderRadius: 4,
                            border: `1px solid ${T.neuralNode}`,
                            backgroundColor: T.deepVoid + "80",
                            marginBottom: 4,
                          }}
                        >
                          <summary
                            style={{
                              display: "flex",
                              cursor: "pointer",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 10px",
                              fontSize: 11,
                              color: T.textMuted,
                              overflow: "hidden",
                            }}
                          >
                            <span style={{ color: T.neonGreen, flexShrink: 0 }}>
                              ⟡
                            </span>
                            <span
                              style={{
                                fontWeight: 600,
                                color: T.neonGreen,
                                flexShrink: 0,
                              }}
                            >
                              {tc.name}
                            </span>
                            <span
                              style={{
                                color: T.textMuted,
                                fontSize: 10,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {Object.entries(tc.args)
                                .map(
                                  ([k, v]) =>
                                    `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
                                )
                                .join(", ")}
                            </span>
                          </summary>
                          <div
                            style={{
                              borderTop: `1px solid ${T.neuralNode}`,
                              padding: "6px 10px",
                              fontSize: 11,
                              color: T.textMuted,
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                color: T.bloodOrange,
                                marginBottom: 2,
                              }}
                            >
                              Result:
                            </div>
                            <pre
                              style={{
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                margin: 0,
                              }}
                            >
                              {tc.resultPreview || "(no result)"}
                            </pre>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}

                {/* Message text */}
                {msg.text &&
                  (msg.role === "user" ? (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.text}
                    </div>
                  ) : isStreaming && i === messages.length - 1 ? (
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {msg.text}
                      <span
                        style={{
                          color: T.neonGreen,
                          animation: "pulse 1s infinite",
                        }}
                      >
                        ▌
                      </span>
                    </div>
                  ) : (
                    <FastMarkdown content={msg.text} variant="chat" />
                  ))}

                <div
                  style={{
                    fontSize: 9,
                    color: T.textMuted,
                    marginTop: 6,
                    textAlign: msg.role === "user" ? "right" : "left",
                  }}
                >
                  {msg.time}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: `1px solid ${T.neuralNode}`,
          padding: "12px 20px",
          flexShrink: 0,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{
            maxWidth: 780,
            margin: "0 auto",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            placeholder={
              sending ? "Mother is thinking..." : "Ask Mother anything..."
            }
            style={{
              flex: 1,
              background: T.darkMatter,
              border: `1px solid ${T.neuralNode}`,
              padding: "12px 14px",
              fontSize: 13,
              fontFamily: T.font,
              color: T.text,
              outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = T.neonGreen + "60")
            }
            onBlur={(e) => (e.currentTarget.style.borderColor = T.neuralNode)}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              border: `1px solid ${sending ? T.electricCyan : T.neonGreen}`,
              background: sending ? T.electricCyan + "10" : T.neonGreen + "10",
              color: sending ? T.electricCyan : T.neonGreen,
              cursor: input.trim() && !sending ? "pointer" : "default",
              flexShrink: 0,
              opacity: input.trim() || sending ? 1 : 0.3,
              transition: "opacity 0.2s, border-color 0.2s",
            }}
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <span style={{ fontSize: 18, lineHeight: 1 }}>⏎</span>
            )}
          </button>
        </form>
        <div
          style={{
            textAlign: "center",
            fontSize: 10,
            color: T.textMuted,
            marginTop: 8,
            letterSpacing: "0.05em",
          }}
        >
          {cfg.widgetBranding}
        </div>
      </div>
    </div>
  );
};

export default A2aChatPreview;
