// ── ChatWidget — Self-Contained A2A Chat Widget ────────────────────────
// Drop-in component that manages the FULL hero → bar → overlay state
// machine internally. Mirrors settings/A2aChatPreview.tsx behavior so
// any website that drops this in gets exactly what the Preview shows:
//
//   - HERO mode: full hero search screen
//   - BAR mode:  hero search + collapsed bar at bottom with expand button
//   - OVERLAY mode: fullscreen chat with minimize/close buttons
//
// Fetches the REAL message count from visitor/history (not hardcoded).
// Resolves the visitor ID via Broprint.js (shared with the website).
//
// Usage:
//   import { ChatWidget } from "./motherbrain-widget";
//   <ChatWidget endpoint="https://a2a.motherbrain.app" />
//
// No hand-wiring required. Self-contained.

import React, { useState, useRef, useEffect, useCallback } from "react";
import { HeroSearchHost } from "./HeroSearchHost";
import { ChatApp } from "./ChatApp";
import { getVisitorId } from "./visitor-identity";
import { BrainIcon } from "./BrainIcon";
import { useTheme } from "./use-theme";

/** Read the JWT session token from localStorage if the user is authenticated. */
function getSessionToken(): string | null {
  try {
    return localStorage.getItem("motherbrain_session_token");
  } catch {
    return null;
  }
}

/** Build A2A fetch headers, including JWT Bearer token if present. */
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

// (Theme is provided by useTheme() inside the component — supports light/dark
// via prefers-color-scheme.)

// ── Types ──────────────────────────────────────────────────────────────

// Inline SVG icons matching lucide-react's Maximize2 / Minimize2 / X exactly.
// The bundle doesn't depend on lucide-react, so we inline the same paths the
// Preview renders — this guarantees the website shows the SAME arrow icons.
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

type WidgetMode = "hero" | "bar" | "overlay";

interface HistoryMessage {
  id: string;
  role: "agent" | "user";
  text: string;
  time: string;
  taskId: string;
}

export interface ChatWidgetProps {
  /** A2A JSON-RPC endpoint URL (e.g. https://a2a.motherbrain.app) */
  endpoint: string;
  /** Agent display name (default: "Mother") */
  agentName?: string;
  /** Agent description shown above search bar + in chat header */
  agentDescription?: string;
  /** Branding text shown below the hero search */
  branding?: string;
  /** Optional logo URL (falls back to BrainIcon) */
  logoUrl?: string;
  /** Hero search gradient color 1 */
  gradientColor1?: string;
  /** Hero search gradient color 2 */
  gradientColor2?: string;
  /** Optional: pre-resolved visitor ID. If omitted, uses Broprint.js. */
  visitorId?: string;
}

// ── History fetcher (mirrors ChatApp.fetchHistory) ─────────────────────

async function fetchWidgetHistory(
  endpointUrl: string,
  visitorId: string,
): Promise<HistoryMessage[]> {
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
          id: `w-${conv.taskId}-${allMessages.length}`,
          role: (msg.role === "user" ? "user" : "agent") as "user" | "agent",
          text: msg.text,
          time: conv.createdAt,
          taskId: conv.taskId,
        });
      }
    }
    return allMessages;
  } catch {
    return [];
  }
}

// ── Component ──────────────────────────────────────────────────────────

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  endpoint,
  agentName = "Mother",
  agentDescription = "AI assistant powered by Mother Brain",
  branding = "Powered by Mother Brain",
  logoUrl,
  gradientColor1,
  gradientColor2,
  visitorId: visitorIdProp,
}) => {
  const T = useTheme();
  const [mode, setMode] = useState<WidgetMode>("hero");
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [initialQuery, setInitialQuery] = useState<string>("");
  const visitorIdRef = useRef<string | null>(visitorIdProp ?? null);
  const [resolvedVisitorId, setResolvedVisitorId] = useState<
    string | undefined
  >(visitorIdProp);

  // ── Resolve visitor ID + fetch real history on mount ────────────────
  // This is the key fix: messageCount comes from the real database,
  // not a hardcoded value. Matches Preview behavior.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Resolve visitor ID via Broprint.js (or use provided prop)
      let vid: string | null = visitorIdProp ?? null;
      if (!vid) {
        try {
          vid = await getVisitorId();
        } catch {
          vid = null;
        }
      }
      if (cancelled) return;
      if (vid) {
        visitorIdRef.current = vid;
        setResolvedVisitorId(vid);
      }

      // Fetch REAL message history from visitor/history JSON-RPC
      const history = vid ? await fetchWidgetHistory(endpoint, vid) : [];
      if (!cancelled && history.length > 0) setMessages(history);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [endpoint, visitorIdProp]);

  const messageCount = messages.length;

  // Cleaned preview of the last message (same logic as Preview L1819-1824)
  const lastMessagePreview =
    messages.length > 0
      ? (messages[messages.length - 1]?.text || "")
          .replace(/^\s*-{3,}\s*\n?/, "")
          .replace(/\*\*/g, "")
          .slice(0, 100)
      : undefined;

  // Hero submit → stash query + open overlay (matches Preview handleHeroSubmit)
  const handleHeroSubmit = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setInitialQuery(trimmed);
    setMode("overlay");
  }, []);

  const handleOpenChat = useCallback(() => setMode("overlay"), []);
  const handleMinimize = useCallback(() => setMode("bar"), []);
  const handleClose = useCallback(() => setMode("hero"), []);

  // ── HERO MODE ───────────────────────────────────────────────────────
  // HeroSearchHost now accepts logoUrl (added to bundle props for parity
  // with the Preview). Whatever the Preview shows, the bundle supports.
  if (mode === "hero") {
    return (
      <HeroSearchHost
        endpoint={endpoint}
        agentDescription={agentDescription}
        logoUrl={logoUrl}
        branding={branding}
        gradientColor1={gradientColor1}
        gradientColor2={gradientColor2}
        visitorId={resolvedVisitorId}
        onSubmit={handleHeroSubmit}
        onOpenChat={messageCount > 0 ? handleOpenChat : undefined}
        messageCount={messageCount}
        lastMessagePreview={lastMessagePreview}
      />
    );
  }

  // ── BAR MODE (hero search + collapsed bar at bottom) ────────────────
  if (mode === "bar") {
    return (
      <>
        <HeroSearchHost
          endpoint={endpoint}
          agentDescription={agentDescription}
          logoUrl={logoUrl}
          branding={branding}
          gradientColor1={gradientColor1}
          gradientColor2={gradientColor2}
          visitorId={resolvedVisitorId}
          onSubmit={handleHeroSubmit}
          onOpenChat={messageCount > 0 ? handleOpenChat : undefined}
          messageCount={messageCount}
          lastMessagePreview={lastMessagePreview}
        />
        {/* Collapsed bar at bottom — mirrors Preview L1873-1953 */}
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
              onClick={handleOpenChat}
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
              >
                {lastMessagePreview || `Continue chat with ${agentName}…`}
              </div>
            </div>
            {/* Expand button — same Maximize2 SVG the Preview uses */}
            <button
              onClick={handleOpenChat}
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
            {/* Close button → back to hero (same X SVG the Preview uses) */}
            <button
              onClick={handleClose}
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
      </>
    );
  }

  // ── OVERLAY MODE (fullscreen chat) ──────────────────────────────────
  return (
    <ChatApp
      endpoint={endpoint}
      agentName={agentName}
      agentDescription={agentDescription}
      branding={branding}
      logoUrl={logoUrl}
      gradientColor1={gradientColor1}
      gradientColor2={gradientColor2}
      initialQuery={initialQuery}
      onMinimize={handleMinimize}
      onClose={handleClose}
    />
  );
};
