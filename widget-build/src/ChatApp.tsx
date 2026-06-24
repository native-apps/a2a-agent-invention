import React, { useState, useRef, useEffect, useCallback } from "react";
import { BrainIcon } from "./BrainIcon";
import { renderMarkdown } from "./markdown";
import { getVisitorId } from "./visitor-identity";
import { useTheme } from "./use-theme";

// ── Types ────────────────────────────────────────────────────────────────

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
    action?: {
      type: string; // "navigate" | "scroll_highlight" | "highlight_not_found"
      url?: string;
      label?: string;
      headingText?: string;
      selector?: string;
      message?: string;
      availableHeadings?: Array<{ text: string; id: string }>;
      [key: string]: unknown;
    };
  }>;
  isWorking?: boolean;
  thinking?: string;
}

// ── Theme ────────────────────────────────────────────────────────────

// Inline SVG icons — match lucide-react's Minimize2 / Maximize2 / X exactly
// so the website shows the SAME icons the Preview shows.
const MinimizeIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const MaximizeIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const CloseIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// (Theme is provided by useTheme() inside the component — supports light/dark
// via prefers-color-scheme.)

// ── Helpers ──────────────────────────────────────────────────────────────

function timeNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
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

// ── Visitor ID ─────────────────────────────────────────────────────────
// Resolved async via getVisitorId() (Broprint.js) — see visitor-identity.ts.
// Uses localStorage key `motherbrain_visitor_id` (shared with the website)
// so chat history, rate limiting, and personalization stay consistent.
// visitorIdRef.current is null until resolved on mount.

// ── Session Token (Dual-Path Auth) ───────────────────────────────────────
// When the website user is authenticated, a JWT is stored in localStorage
// under `motherbrain_session_token`. We attach it as a Bearer header on
// every A2A request so the Worker can verify it and link the message to
// the customer account. If absent (anonymous visitor), no header is sent.
function getSessionToken(): string | null {
  try {
    return localStorage.getItem("motherbrain_session_token");
  } catch {
    return null;
  }
}

/** Build the standard headers for an A2A fetch, including JWT if present. */
function buildA2aHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getSessionToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ── History Loading ──────────────────────────────────────────────────────

interface HistoryMessage {
  id: string;
  role: string;
  text: string;
  created_at: string;
  task_id: string;
}

// Shape of a tool call as it arrives in an artifact's metadata.toolCalls.
// Fields are intentionally permissive (multiple key variants) because the
// Worker may emit either naming convention.
interface ArtifactToolCall {
  name?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
  resultPreview?: string;
  result?: string | Record<string, unknown> | unknown[];
  structuredResult?: unknown; // Full parsed result for website.* tools
}

async function fetchHistory(
  endpointUrl: string,
  visitorId: string,
): Promise<ChatMessage[]> {
  try {
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: buildA2aHeaders(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "visitor/history",
        id: Date.now(),
        params: { visitor_id: visitorId, limit: 20 },
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) return [];

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

    return allMessages.map((hm) => ({
      id: hm.id,
      role: (hm.role === "user" ? "user" : "agent") as "user" | "agent",
      text: hm.text,
      time: timeFromISO(hm.created_at),
      taskId: hm.task_id,
    }));
  } catch {
    return [];
  }
}

// ── Props ────────────────────────────────────────────────────────────────

export interface ChatAppProps {
  endpoint: string;
  agentName?: string;
  agentDescription?: string;
  primaryColor?: string;
  branding?: string;
  logoUrl?: string;
  gradientColor1?: string;
  gradientColor2?: string;
  initialQuery?: string;
  onClose?: () => void;
  /** Called when user clicks minimize — parent should hide ChatApp and show the hero/bar view */
  onMinimize?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────

export const ChatApp: React.FC<ChatAppProps> = ({
  endpoint,
  agentName = "Mother",
  agentDescription = "AI assistant powered by Mother Brain",
  branding = "Powered by Mother Brain",
  logoUrl,
  initialQuery,
  onClose,
  onMinimize,
}) => {
  const T = useTheme();
  const [input, setInput] = useState(initialQuery || "");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const visitorIdRef = useRef<string | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRef = useRef(true);
  const prevMsgCountRef = useRef(0);

  // Auto-scroll release mechanism:
  // - Tracks whether the user is near the bottom of the scroll area.
  // - If the user scrolls up, auto-scroll STOPS (no more fighting).
  // - Auto-scroll RE-ENABLES when a new message is added (length increases).
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScrollEvt = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      autoScrollRef.current = distanceFromBottom < 80;
    };
    container.addEventListener("scroll", handleScrollEvt, { passive: true });
    return () => container.removeEventListener("scroll", handleScrollEvt);
  }, []);

  // Re-enable auto-scroll when a NEW message is added (length increased),
  // not on streaming updates of existing messages.
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      autoScrollRef.current = true;
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  React.useLayoutEffect(() => {
    if (!autoScrollRef.current) return;
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    const tid = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    }, 60);
    return () => clearTimeout(tid);
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  // Load history (resolve visitor ID via Broprint.js first, then fetch)
  // Guard against race condition: if user sends a message while history is
  // loading, we must NOT overwrite the messages array with just the history.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const visitorId = await getVisitorId();
      if (cancelled) return;
      visitorIdRef.current = visitorId;
      const history = await fetchHistory(endpoint, visitorId);
      if (cancelled) return;
      // Only set history if no messages were added during the async load
      // (prevents race condition where user sends a message before history
      // finishes loading, and the history overwrites their new message)
      setMessages((prev) => {
        if (prev.length > 0) return prev; // User already added messages — don't overwrite
        if (history.length > 0) return history;
        return prev;
      });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  // Typewriter with real-time markdown rendering.
  // Text is revealed gradually (adaptive chunk size targeting ~4s total)
  // so the visitor sees a smooth streaming effect. At each tick the partial
  // text is stored on the message — the render branch always runs
  // renderMarkdown() so markdown formats live as text arrives.
  // Adaptive chunk size keeps the total duration reasonable regardless of
  // response length and reduces re-render count on mobile (longer text =
  // bigger chunks = fewer renders).
  const streamText = useCallback((fullText: string, messageIndex: number) => {
    setIsStreaming(true);
    const total = fullText.length;
    if (total === 0) {
      setIsStreaming(false);
      return;
    }
    // Target ~4 seconds total, ~60fps ticks (16ms)
    const tickMs = 16;
    const targetTicks = Math.ceil(4000 / tickMs);
    const charsPerTick = Math.max(1, Math.ceil(total / targetTicks));
    let pos = 0;

    const tick = () => {
      pos += charsPerTick;
      if (pos >= total) {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex ? { ...m, text: fullText } : m,
          ),
        );
        setIsStreaming(false);
        return;
      }
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex ? { ...m, text: fullText.slice(0, pos) } : m,
        ),
      );
      streamTimerRef.current = setTimeout(tick, tickMs);
    };
    tick();
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
        streamTimerRef.current = setTimeout(showNext, 400);
      };
      showNext();
    },
    [],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearTimeout(streamTimerRef.current);
    };
  }, []);

  // Send message
  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;

    // Ensure visitor ID is resolved before sending (also used for history /
    // rate-limiting / personalization on the backend). Guards the
    // initialQuery auto-send race where handleSend may fire before the
    // mount effect has finished resolving Broprint.js.
    if (!visitorIdRef.current) {
      visitorIdRef.current = await getVisitorId();
    }
    const visitorId = visitorIdRef.current;

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
      const response = await fetch(endpoint, {
        method: "POST",
        headers: buildA2aHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "message/send",
          params: {
            message: {
              role: "user",
              parts: [{ type: "text", text }],
            },
            metadata: { visitor_id: visitorId },
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

      const artifacts = data.result?.artifacts;
      if (artifacts && Array.isArray(artifacts)) {
        const lastArtifact = artifacts[artifacts.length - 1];
        if (
          lastArtifact?.metadata?.toolCalls &&
          Array.isArray(lastArtifact.metadata.toolCalls)
        ) {
          toolCalls = lastArtifact.metadata.toolCalls.map(
            (tc: ArtifactToolCall) => {
              const mapped: NonNullable<
                NonNullable<ChatMessage["toolCalls"]>[number]
              > = {
                name: tc.name || tc.toolName || "unknown",
                args: tc.args || tc.arguments || {},
                resultPreview: tc.resultPreview
                  ? tc.resultPreview
                  : tc.result
                    ? typeof tc.result === "string"
                      ? tc.result.slice(0, 500)
                      : JSON.stringify(tc.result).slice(0, 500)
                    : undefined,
              };

              // Detect navigate/highlight actions from structured result
              const sr = tc.structuredResult;
              if (sr && typeof sr === "object" && !Array.isArray(sr)) {
                const r = sr as { action?: string };
                if (
                  r.action === "navigate" ||
                  r.action === "scroll_highlight" ||
                  r.action === "highlight_not_found"
                ) {
                  mapped.action = r as {
                    type: string;
                    [key: string]: unknown;
                  };
                }
              }

              return mapped;
            },
          );
        }
      }

      if (!agentText && !(toolCalls?.length ?? 0)) {
        agentText = "No response received.";
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? { ...m, isWorking: false, thinking: undefined }
            : m,
        ),
      );

      setTimeout(() => {
        setMessages((current) => {
          const idx = current.findIndex((m) => m.id === agentId);
          if (idx === -1) return current;

          if (toolCalls && toolCalls.length > 0) {
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
      const errMsg = err instanceof Error ? err.message : "Network error";
      const isLoadFailed =
        errMsg === "Load failed" ||
        errMsg === "Failed to fetch" ||
        errMsg.includes("NetworkError");
      const helpfulMsg = isLoadFailed
        ? `⚠ Could not reach the A2A endpoint at ${endpoint}. The agent server may be offline, or the request was blocked.`
        : `⚠ Failed to reach agent at ${endpoint}. ${errMsg}`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? {
                ...m,
                text: helpfulMsg,
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

  // Handle initial query (sent from Hero Search)
  // Guard with a ref so it only fires ONCE — prevents duplicate messages
  // if the parent component re-renders and passes the same initialQuery again.
  const initialQuerySentRef = useRef(false);
  useEffect(() => {
    if (initialQuery && !initialQuerySentRef.current) {
      initialQuerySentRef.current = true;
      setTimeout(() => handleSend(initialQuery), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── MINIMIZED BAR MODE ────────────────────────────────────────────
  // When the user clicks minimize (and no onMinimize callback is provided),
  // ChatApp collapses to a fixed bar at the bottom of the screen — exactly
  // like the Preview's bar mode. Click to expand, or close to dismiss.
  if (minimized) {
    const lastMsg = messages[messages.length - 1];
    const barPreview = lastMsg
      ? renderMarkdown((lastMsg.text || "").replace(/^\s*-{3,}\s*\n?/, ""))
      : `Continue chat with ${agentName}…`;

    return (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          width: "100%",
          zIndex: 2147483647,
          borderTop: `1px solid ${T.neonGreen}40`,
          backgroundColor: T.deepVoid + "f5",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
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
          <BrainIcon size={24} logoUrl={logoUrl} />
          {/* Preview text — click to expand */}
          <div
            onClick={() => setMinimized(false)}
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              fontSize: 13,
              color: T.neonGreen,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              maxHeight: 20,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              dangerouslySetInnerHTML={{ __html: barPreview }}
            />
          </div>
          {/* Expand button — same Maximize2 SVG the Preview uses */}
          <button
            onClick={() => setMinimized(false)}
            aria-label="Expand chat"
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MaximizeIcon size={16} />
          </button>
          {/* Close button → dismiss chat entirely */}
          <button
            onClick={() => {
              setMinimized(false);
              onClose?.();
            }}
            aria-label="Close chat"
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 4,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
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
          <BrainIcon size={28} logoUrl={logoUrl} />
          <div>
            <div
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: T.neonGreen,
                letterSpacing: "0.05em",
              }}
            >
              {agentName.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: T.textMuted }}>
              {sending ? "thinking..." : agentDescription}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => {
              if (onMinimize) {
                onMinimize();
              } else {
                setMinimized(true);
              }
            }}
            style={{
              background: "none",
              border: "none",
              color: T.textMuted,
              cursor: "pointer",
              padding: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Minimize chat"
          >
            <MinimizeIcon size={18} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: T.textMuted,
                cursor: "pointer",
                padding: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Close chat"
            >
              <CloseIcon size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
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
                    <BrainIcon size={12} logoUrl={logoUrl} />
                    <span style={{ letterSpacing: "0.05em" }}>
                      {agentName.toUpperCase()}
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
                    <span
                      style={{
                        display: "inline-block",
                        width: 12,
                        height: 12,
                        border: `2px solid ${T.neonGreen}`,
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
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

                {/* Action cards (navigate / highlight) */}
                {msg.role === "agent" &&
                  msg.toolCalls &&
                  msg.toolCalls.some((tc) => tc.action) && (
                    <div
                      style={{
                        marginBottom: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {msg.toolCalls
                        .filter((tc) => tc.action)
                        .map((tc, j) => {
                          const a = tc.action!;
                          if (a.type === "navigate" && a.url) {
                            return (
                              <a
                                key={`action-${j}`}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 12px",
                                  borderRadius: 6,
                                  border: `1px solid ${T.neuralNode}`,
                                  backgroundColor: T.deepVoid,
                                  color: T.neonGreen,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  textDecoration: "none",
                                  cursor: "pointer",
                                  transition: "opacity 0.2s",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.opacity = "0.8")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.opacity = "1")
                                }
                              >
                                <span style={{ fontSize: 14 }}>🧭</span>
                                <span>{a.label || a.url}</span>
                              </a>
                            );
                          }
                          if (a.type === "scroll_highlight" && a.url) {
                            const deepLink = a.selector
                              ? `${a.url}${a.url.includes("#") ? "" : "#"}${a.selector.replace(/^#/, "")}`
                              : a.url;
                            return (
                              <a
                                key={`action-${j}`}
                                href={deepLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 12px",
                                  borderRadius: 6,
                                  border: `1px solid ${T.neuralNode}`,
                                  backgroundColor: T.deepVoid,
                                  color: T.electricCyan,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  textDecoration: "none",
                                  cursor: "pointer",
                                  transition: "opacity 0.2s",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.opacity = "0.8")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.opacity = "1")
                                }
                              >
                                <span style={{ fontSize: 14 }}>📍</span>
                                <span>
                                  {a.headingText
                                    ? `Jump to: ${a.headingText}`
                                    : a.message || deepLink}
                                </span>
                              </a>
                            );
                          }
                          if (a.type === "highlight_not_found") {
                            return (
                              <div
                                key={`action-${j}`}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 6,
                                  border: `1px solid ${T.neuralNode}`,
                                  backgroundColor: T.deepVoid + "80",
                                  fontSize: 11,
                                  color: T.textMuted,
                                }}
                              >
                                <div style={{ marginBottom: 4 }}>
                                  {a.message || "Section not found."}
                                </div>
                                {Array.isArray(a.availableHeadings) &&
                                  a.availableHeadings.length > 0 && (
                                    <div
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 4,
                                      }}
                                    >
                                      {a.availableHeadings.map((h, k) => (
                                        <span
                                          key={k}
                                          style={{
                                            padding: "2px 6px",
                                            borderRadius: 3,
                                            backgroundColor:
                                              T.neuralNode + "40",
                                            fontSize: 10,
                                          }}
                                        >
                                          {h.text}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            );
                          }
                          return null;
                        })}
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
                  ) : (
                    /*
                     * Agent messages ALWAYS render as markdown — even during
                     * the typewriter stream. This gives real-time markdown
                     * formatting as text arrives. The cursor ▌ is appended
                     * while streaming so the visitor sees text is still coming.
                     */
                    <div
                      className="mb-markdown"
                      dangerouslySetInnerHTML={{
                        __html:
                          renderMarkdown(msg.text) +
                          (isStreaming && i === messages.length - 1
                            ? '<span style="color:' +
                              T.neonGreen +
                              ';animation:pulse 1s infinite">▌</span>'
                            : ""),
                      }}
                    />
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
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 16,
                  border: `2px solid ${T.electricCyan}`,
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
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
          {branding}
        </div>
      </div>

      {/* Keyframes for spin/pulse animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .mb-markdown { font-size: 13px; line-height: 1.6; }
        .mb-markdown h1 { font-size: 18px; font-weight: bold; margin: 12px 0 6px; color: ${T.neonGreen}; }
        .mb-markdown h2 { font-size: 16px; font-weight: bold; margin: 10px 0 4px; color: ${T.neonGreen}; }
        .mb-markdown h3 { font-size: 14px; font-weight: bold; margin: 8px 0 4px; color: ${T.neonGreen}; }
        .mb-markdown h4 { font-size: 13px; font-weight: bold; margin: 6px 0 3px; color: ${T.neonGreen}; }
        .mb-markdown h5 { font-size: 12px; font-weight: bold; margin: 6px 0 3px; color: ${T.neonGreen}; }
        .mb-markdown h6 { font-size: 12px; font-weight: bold; margin: 6px 0 3px; color: ${T.textMuted}; }
        .mb-markdown strong { color: ${T.neonGreen}; }
        .mb-markdown em { font-style: italic; }
        .mb-markdown a { color: ${T.electricCyan}; text-decoration: underline; }
        .mb-markdown .mb-code-block { background: ${T.deepVoid}; border: 1px solid ${T.neuralNode}; border-radius: 4px; padding: 8px 12px; overflow-x: auto; margin: 8px 0; font-size: 12px; }
        .mb-markdown .mb-code-block code { font-family: ${T.font}; color: ${T.text}; }
        .mb-markdown .mb-inline-code { background: ${T.deepVoid}; border: 1px solid ${T.neuralNode}; border-radius: 3px; padding: 1px 4px; font-size: 12px; }
        .mb-markdown ul, .mb-markdown ol { padding-left: 20px; margin: 6px 0; }
        .mb-markdown li { margin: 2px 0; }
        .mb-markdown blockquote { border-left: 3px solid ${T.neonGreen}; padding-left: 12px; margin: 6px 0; color: ${T.textMuted}; }
        .mb-markdown hr { border: none; border-top: 1px solid ${T.neuralNode}; margin: 12px 0; }
        .mb-markdown table { border-collapse: collapse; margin: 8px 0; font-size: 12px; }
        .mb-markdown th, .mb-markdown td { border: 1px solid ${T.neuralNode}; padding: 6px 10px; text-align: left; }
        .mb-markdown th { background: ${T.darkMatter}; color: ${T.neonGreen}; }
      `}</style>
    </div>
  );
};
