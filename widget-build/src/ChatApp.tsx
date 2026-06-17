import React, { useState, useRef, useEffect, useCallback } from "react";
import { BrainIcon } from "./BrainIcon";
import { renderMarkdown } from "./markdown";
import { getVisitorId } from "./visitor-identity";

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
  }>;
  isWorking?: boolean;
  thinking?: string;
}

// ── Theme ────────────────────────────────────────────────────────────────

const T = {
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

// ── History Loading ──────────────────────────────────────────────────────

interface HistoryMessage {
  id: string;
  role: string;
  text: string;
  created_at: string;
  task_id: string;
}

async function fetchHistory(
  endpointUrl: string,
  visitorId: string,
): Promise<ChatMessage[]> {
  try {
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  const [input, setInput] = useState(initialQuery || "");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const visitorIdRef = useRef<string | null>(null);
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll
  React.useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  useEffect(() => {
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
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const visitorId = await getVisitorId();
      if (cancelled) return;
      visitorIdRef.current = visitorId;
      const history = await fetchHistory(endpoint, visitorId);
      if (!cancelled && history.length > 0) setMessages(history);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  // Typewriter streaming
  const streamText = useCallback((fullText: string, messageIndex: number) => {
    setIsStreaming(true);
    let charIndex = 0;
    const speed = 12;

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
        headers: { "Content-Type": "application/json" },
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
  useEffect(() => {
    if (initialQuery) {
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
          {onMinimize && (
            <button
              onClick={onMinimize}
              style={{
                background: "none",
                border: "none",
                color: T.textMuted,
                cursor: "pointer",
                padding: 6,
                fontSize: 18,
              }}
              aria-label="Minimize chat"
            >
              —
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: T.textMuted,
                cursor: "pointer",
                padding: 6,
                fontSize: 20,
              }}
              aria-label="Close chat"
            >
              ✕
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
                    <div
                      className="mb-markdown"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(msg.text),
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
