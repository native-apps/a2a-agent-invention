import { useState, useRef, useEffect, useCallback } from "react";
import { X, Maximize2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useChat } from "@/context/ChatContext";
import { BrainIcon } from "./svg/BrainIcon";

/**
 * Fullscreen chat overlay — black void background, typewriter responses.
 * Also renders as a collapsed bottom bar when mode === "bar".
 */
export function ChatOverlay() {
  const {
    mode,
    messages,
    isStreaming,
    isSending,
    isLoadingHistory,
    sendMessage,
    collapseToBar,
    expandToOverlay,
    endChat,
  } = useChat();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (mode === "overlay") {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [mode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending || isStreaming) return;
    sendMessage(text);
    setInput("");
  };

  const handleLinkClick = useCallback(
    (href: string) => {
      navigate(href);
      collapseToBar();
    },
    [navigate, collapseToBar],
  );

  // Render Mother's response as markdown using marked + DOMPurify (matches FastMarkdown output)
  const renderResponse = useCallback((text: string) => {
    const html = DOMPurify.sanitize(
      marked.parse(text, { gfm: true, breaks: true }) as string,
    );
    return (
      <div
        className="fast-markdown chat-variant"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }, []);

  // Event delegation: intercept clicks on internal links (<a href="/...">) in rendered markdown
  const handleMarkdownClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a[href]");
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href && href.startsWith("/")) {
          e.preventDefault();
          handleLinkClick(href);
        }
      }
    },
    [handleLinkClick],
  );

  if (mode === "idle") return null;

  // ========================
  // BAR MODE (collapsed bottom)
  // ========================
  if (mode === "bar") {
    // Find Mother's last response for the bar preview
    const lastAssistantMsg = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.text);
    const barPreview = lastAssistantMsg
      ? lastAssistantMsg.text
          .replace(/\*\*/g, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .slice(0, 120)
      : messages.length > 0
        ? messages[messages.length - 1].text.slice(0, 100)
        : "";

    return (
      <div className="fixed bottom-0 left-0 right-0 z-[200] border-t border-neon-green/30 bg-deep-void/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <BrainIcon className="h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1 overflow-hidden font-mono text-sm">
            <span className="text-neon-green">{barPreview}</span>
            {barPreview.length >= 100 && (
              <span className="text-muted-foreground">...</span>
            )}
          </div>
          <button
            onClick={expandToOverlay}
            className="shrink-0 p-2 text-muted-foreground transition-colors hover:text-neon-green"
            aria-label="Expand chat"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={endChat}
            className="shrink-0 p-2 text-muted-foreground transition-colors hover:text-hot-pink"
            aria-label="End chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // OVERLAY MODE (fullscreen chat)
  // ========================
  return (
    <div className="fixed inset-0 z-[200] flex animate-fade-in flex-col bg-deep-void">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neural-node px-6 py-4">
        <div className="flex items-center gap-3">
          <BrainIcon className="h-8 w-8" />
          <div>
            <div className="font-mono text-lg font-bold text-neon-green">
              MOTHER
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {isSending
                ? "thinking..."
                : isStreaming
                  ? "responding..."
                  : "online"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={collapseToBar}
            className="p-2 text-muted-foreground transition-colors hover:text-neon-green"
            aria-label="Minimize to bar"
          >
            <Maximize2 className="h-5 w-5 rotate-180" />
          </button>
          <button
            onClick={endChat}
            className="p-2 text-muted-foreground transition-colors hover:text-hot-pink"
            aria-label="End chat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-6 py-8"
        onClick={handleMarkdownClick}
      >
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 font-mono text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "border border-hot-pink/30 bg-hot-pink/10 text-foreground"
                    : "border border-neon-green/20 bg-dark-matter/50 text-foreground"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="mb-1 flex items-center gap-2 text-xs text-neon-green">
                    <BrainIcon className="h-3 w-3" />
                    <span>Mother</span>
                  </div>
                )}
                <div>
                  {/* Tool calls */}
                  {msg.role === "assistant" &&
                    msg.toolCalls &&
                    msg.toolCalls.length > 0 && (
                      <div className="mb-3 space-y-2">
                        {msg.toolCalls.map((tc, j) => (
                          <details
                            key={j}
                            className="group rounded border border-neural-node bg-deep-void/50"
                          >
                            <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-neon-green">
                              <span className="text-neon-green">⟡</span>
                              <span className="font-semibold text-neon-green">
                                {tc.name}
                              </span>
                              <span className="text-muted-foreground">
                                {Object.entries(tc.args)
                                  .map(
                                    ([k, v]) =>
                                      `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
                                  )
                                  .join(", ")}
                              </span>
                            </summary>
                            <div className="border-t border-neural-node px-3 py-2 text-xs text-muted-foreground">
                              <div className="mb-1 font-semibold text-blood-orange">
                                Result:
                              </div>
                              <pre className="whitespace-pre-wrap break-words">
                                {tc.resultPreview}
                              </pre>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}

                  {msg.role === "assistant" ? (
                    // Use markdown for completed messages, raw text for streaming
                    isStreaming && i === messages.length - 1 ? (
                      <span className="whitespace-pre-wrap">
                        {msg.text}
                        <span className="animate-pulse text-neon-green">▌</span>
                      </span>
                    ) : (
                      renderResponse(msg.text)
                    )
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.text}</span>
                  )}
                </div>
                {msg.role === "assistant" &&
                  isSending &&
                  !msg.text &&
                  i === messages.length - 1 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs">Thinking...</span>
                    </div>
                  )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-neural-node px-6 py-4">
        {/* Loading history indicator */}
        {isLoadingHistory && (
          <div className="mx-auto mb-3 flex max-w-3xl items-center justify-center gap-2 font-mono text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading previous conversation...</span>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl items-center gap-3"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isSending || isStreaming
                  ? "Wait for Mother to respond..."
                  : "Ask Mother anything..."
              }
              disabled={isSending || isStreaming || isLoadingHistory}
              className="w-full border border-neural-node bg-dark-matter px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-neon-green focus:outline-none disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={
              !input.trim() || isSending || isStreaming || isLoadingHistory
            }
            className="flex h-11 w-11 shrink-0 items-center justify-center border border-neon-green bg-neon-green/10 text-neon-green transition-colors hover:bg-neon-green/20 disabled:opacity-30"
            aria-label="Send message"
          >
            <span className="text-lg font-bold">↵</span>
          </button>
        </form>
        <div className="mx-auto mt-2 max-w-3xl text-center font-mono text-xs text-muted-foreground">
          Powered by Mother Brain — Persistent AI Memory
        </div>
      </div>
    </div>
  );
}
