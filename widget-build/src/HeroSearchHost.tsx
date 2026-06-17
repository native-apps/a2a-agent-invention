// ── Hero Search Host — React Wrapper for <ne-hero-search> ────────────────
// Mounts the web component, feeds it AI-generated suggestions, shows a
// clickable suggestion dropdown below the search (used prompts dimmed), and
// shows the "Continue paused conversation" button when chat history exists.
//
// Mirrors HeroSearchHost from settings/A2aChatPreview.tsx (lines ~686-890).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { registerHeroSearch } from "./HeroSearchElement";
import {
  canGenerateMore,
  fetchSuggestions,
  getAllSuggestions,
  markSuggestionUsed,
  type CachedSuggestion,
} from "./suggestion-cache";
import { BrainIcon } from "./BrainIcon";

// ── Theme ───────────────────────────────────────────────────────────────

const T = {
  deepVoid: "#050508",
  darkMatter: "#0d0d15",
  neuralNode: "#13131f",
  neonGreen: "#00dc82",
  hotPink: "#ff3e88",
  bloodOrange: "#ff6b35",
  electricCyan: "#22d3ee",
  text: "#e4e4e7",
  textMuted: "#a1a1aa",
  font: "'Inter', system-ui, -apple-system, sans-serif",
};

// ── Types ───────────────────────────────────────────────────────────────

export interface HeroSearchHostProps {
  /** A2A JSON-RPC endpoint URL (for fetching AI suggestions) */
  endpoint: string;
  /** Agent display name */
  agentName?: string;
  /** Agent description shown above the search bar */
  agentDescription?: string;
  /** Custom default suggestions shown until AI suggestions arrive */
  defaultSuggestions?: string[];
  /** Optional: pass a pre-generated visitor ID. If omitted, generates via Broprint.js. */
  visitorId?: string;
  /** Called when user submits a search query (typing or clicking a prompt) */
  onSubmit: (query: string) => void;
  /** Called when user clicks "Continue paused conversation" */
  onOpenChat?: () => void;
  /** Number of existing chat messages (shows continue button when > 0) */
  messageCount?: number;
  /** Preview text of last message (shown in continue button) */
  lastMessagePreview?: string;
  /** Gradient color 1 (stroke + brain icon top) */
  gradientColor1?: string;
  /** Gradient color 2 (stroke + brain icon bottom) */
  gradientColor2?: string;
  /** Branding text shown below search */
  branding?: string;
}

// ── Component ───────────────────────────────────────────────────────────

export function HeroSearchHost({
  endpoint,
  agentName = "Mother",
  agentDescription,
  defaultSuggestions,
  visitorId,
  onSubmit,
  onOpenChat,
  messageCount = 0,
  lastMessagePreview,
  gradientColor1 = "#00dc82",
  gradientColor2 = "#a78bfa",
  branding = "Powered by Mother Brain",
}: HeroSearchHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const heroElRef = useRef<HTMLElement | null>(null);

  // ── Suggestion list (single source of truth via the cache) ───────────
  // HeroSearchHost owns the full list (used + unused) so the dropdown and
  // the typewriter stay in sync: marking a prompt used updates both at once.
  const [allSuggestions, setAllSuggestions] = useState<CachedSuggestion[]>(() =>
    getAllSuggestions(),
  );
  const [generating, setGenerating] = useState(false);

  // Unused suggestion texts — fed to the <ne-hero-search> typewriter.
  const unusedTexts = allSuggestions.filter((s) => !s.used).map((s) => s.text);

  const refreshList = useCallback(() => {
    setAllSuggestions(getAllSuggestions());
  }, []);

  // Register the web component once
  useEffect(() => {
    registerHeroSearch();
  }, []);

  // Initial fetch: if the preloader hasn't populated the cache yet (or this is
  // the first mount), fetch the first batch. Coalesced by the cache module.
  useEffect(() => {
    let cancelled = false;
    if (allSuggestions.length > 0) return;
    (async () => {
      await fetchSuggestions(endpoint, visitorId);
      if (!cancelled) refreshList();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generate a new batch of suggestions (up to the 24-item cap).
  const handleGenerateMore = useCallback(async () => {
    if (!canGenerateMore() || generating) return;
    setGenerating(true);
    try {
      await fetchSuggestions(endpoint, visitorId);
    } finally {
      setGenerating(false);
      refreshList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating]);

  // Auto-refill: when every suggestion has been used, fetch a new batch
  // (only if under the 24 cap). `lastAutoTotalRef` prevents an infinite loop
  // if the fetch keeps failing without adding new suggestions.
  const lastAutoTotalRef = useRef(-1);
  useEffect(() => {
    if (generating) return;
    if (allSuggestions.length === 0) return; // nothing stored yet
    if (unusedTexts.length > 0) return; // still have fresh prompts
    if (!canGenerateMore()) return; // at the 24 cap
    const total = allSuggestions.length;
    if (total === lastAutoTotalRef.current) return; // already tried at this size
    lastAutoTotalRef.current = total;
    setGenerating(true);
    fetchSuggestions(endpoint, visitorId)
      .catch(() => {})
      .finally(() => {
        setGenerating(false);
        refreshList();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSuggestions, unusedTexts.length, generating]);

  // Clicking a suggestion: mark it used, refresh (dropdown + typewriter), submit.
  const handleSuggestionClick = useCallback(
    (text: string) => {
      markSuggestionUsed(text);
      refreshList();
      onSubmit(text);
    },
    [onSubmit, refreshList],
  );

  const showThinking = allSuggestions.length === 0;

  // Create the <ne-hero-search> element and wire up events
  const mountHero = useCallback(() => {
    if (!containerRef.current) return;
    if (!customElements.get("ne-hero-search")) return;

    // Clear previous content
    containerRef.current.innerHTML = "";

    // Create the custom element
    const el = document.createElement("ne-hero-search") as HTMLElement;
    heroElRef.current = el;

    // Set custom suggestions
    const neEl = el as any;
    if (typeof neEl.setSuggestions === "function") {
      neEl.setSuggestions(unusedTexts);
    }

    // Listen for submit events (typing + Enter, or brain icon click)
    const handleSubmit = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.query) {
        // Track usage so the prompt is dimmed in the dropdown afterwards.
        markSuggestionUsed(detail.query);
        refreshList();
        onSubmit(detail.query);
      }
    };
    el.addEventListener("hero-search-submit", handleSubmit);

    containerRef.current.appendChild(el);

    // Set suggestions again after connectedCallback runs
    setTimeout(() => {
      if (typeof neEl.setSuggestions === "function") {
        neEl.setSuggestions(unusedTexts);
      }
      // Apply custom gradient colors to the stroke and brain icon
      const shadow = neEl.shadowRoot;
      if (shadow) {
        const strokeStops = shadow.querySelectorAll("#hs-amberGlow stop");
        if (strokeStops.length >= 2 && gradientColor1) {
          strokeStops[0].setAttribute("stop-color", gradientColor1);
          strokeStops[strokeStops.length - 1].setAttribute(
            "stop-color",
            gradientColor2 || gradientColor1,
          );
        }
        const brainStops = shadow.querySelectorAll("#hs-brainGrad stop");
        if (brainStops.length >= 2) {
          if (gradientColor1)
            brainStops[0].setAttribute("stop-color", gradientColor1);
          if (gradientColor2)
            brainStops[1].setAttribute("stop-color", gradientColor2);
        }
      }
    }, 100);

    return () => {
      el.removeEventListener("hero-search-submit", handleSubmit);
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cleanup = mountHero();
    return cleanup || (() => {});
  }, [mountHero]);

  // Push unused suggestions to the typewriter whenever they change.
  useEffect(() => {
    const neEl = heroElRef.current as any;
    if (neEl && typeof neEl.setSuggestions === "function") {
      neEl.setSuggestions(unusedTexts);
    }
  }, [unusedTexts]);

  return (
    <div style={hostStyle}>
      {/* Agent Description */}
      {agentDescription && (
        <div style={descriptionStyle}>{agentDescription}</div>
      )}

      {/* <ne-hero-search> web component */}
      <div style={searchWrapperStyle}>
        <div ref={containerRef} style={{ width: "100%" }} />
      </div>

      {/* Suggestion dropdown — clickable list below the search */}
      <div style={dropdownStyle}>
        {showThinking ? (
          <div style={dropdownLoadingStyle}>
            <span style={thinkingDotStyle} />
            Thinking…
          </div>
        ) : (
          <>
            {allSuggestions.map((s, i) => (
              <button
                key={`${s.text}-${i}`}
                className={s.used ? "mb-sugg-row mb-sugg-used" : "mb-sugg-row"}
                style={s.used ? usedRowStyle : rowStyle}
                disabled={s.used}
                onClick={() => handleSuggestionClick(s.text)}
              >
                <span style={rowTextStyle}>{s.text}</span>
                {s.used && <span style={usedBadgeStyle}>✓</span>}
              </button>
            ))}

            {/* Generate new suggestions — hidden once the 24-item cap is hit */}
            {canGenerateMore() && (
              <button
                className="mb-sugg-row"
                style={generateRowStyle}
                disabled={generating}
                onClick={handleGenerateMore}
              >
                {generating ? (
                  <>
                    <span style={thinkingDotStyle} />
                    Generating…
                  </>
                ) : (
                  <>↻ Generate new suggestions</>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Continue paused conversation */}
      {onOpenChat && messageCount > 0 && (
        <button onClick={onOpenChat} style={continueBtnStyle}>
          <div style={continueIconStyle}>
            <BrainIcon size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={continueTitleStyle}>Continue paused conversation</div>
            {lastMessagePreview && (
              <div style={continuePreviewStyle}>{lastMessagePreview}</div>
            )}
          </div>
          <div style={continueCountStyle}>{messageCount} msgs</div>
        </button>
      )}

      {/* Branding */}
      {branding && (
        <div style={brandingStyle}>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <BrainIcon size={12} />
            {branding}
          </span>
        </div>
      )}

      {/* Keyframes + dropdown row hover styles */}
      <style>{`
        @keyframes mb-thinking-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.7); } }
        .mb-sugg-row { background: transparent; transition: background 0.15s; }
        .mb-sugg-row:hover:not(:disabled) { background: ${T.neuralNode}; }
      `}</style>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const hostStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: "400px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: T.deepVoid,
  fontFamily: T.font,
  color: T.text,
  padding: "24px",
};

const descriptionStyle: CSSProperties = {
  fontSize: 12,
  color: T.textMuted,
  marginBottom: 24,
  textAlign: "center",
  maxWidth: 480,
  lineHeight: 1.5,
};

const searchWrapperStyle: CSSProperties = {
  width: "100%",
  maxWidth: 768,
  padding: "0 8px",
};

// ── Dropdown styles ─────────────────────────────────────────────────────

const dropdownStyle: CSSProperties = {
  marginTop: 14,
  width: "100%",
  maxWidth: 640,
  maxHeight: 280,
  overflowY: "auto",
  background: T.darkMatter,
  border: `1px solid ${T.neuralNode}`,
  borderRadius: 12,
  padding: 6,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const dropdownLoadingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "14px 0",
  fontSize: 12,
  color: T.textMuted,
  letterSpacing: 0.5,
};

const thinkingDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: T.neonGreen,
  display: "inline-block",
  flexShrink: 0,
  animation: "mb-thinking-pulse 1.2s ease-in-out infinite",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: T.font,
  fontSize: 13,
  color: T.text,
  cursor: "pointer",
};

const usedRowStyle: CSSProperties = {
  ...rowStyle,
  opacity: 0.35,
  cursor: "default",
};

const rowTextStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const usedBadgeStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  color: T.neonGreen,
  opacity: 0.8,
};

const generateRowStyle: CSSProperties = {
  ...rowStyle,
  justifyContent: "center",
  color: T.neonGreen,
  fontWeight: 600,
  borderTop: `1px solid ${T.neuralNode}`,
  borderRadius: 8,
  marginTop: 2,
};

// ── Continue-conversation styles ────────────────────────────────────────

const continueBtnStyle: CSSProperties = {
  marginTop: 20,
  width: "100%",
  maxWidth: 480,
  background: T.darkMatter,
  border: `1px solid ${T.neonGreen}33`,
  borderRadius: 12,
  padding: "14px 18px",
  cursor: "pointer",
  fontFamily: T.font,
  display: "flex",
  alignItems: "center",
  gap: 12,
  textAlign: "left",
  transition: "border-color 0.2s, background 0.2s",
};

const continueIconStyle: CSSProperties = {
  width: 36,
  height: 36,
  flexShrink: 0,
  borderRadius: 8,
  background: `${T.neonGreen}1a`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const continueTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: "bold",
  color: T.text,
  marginBottom: 2,
};

const continuePreviewStyle: CSSProperties = {
  fontSize: 11,
  color: T.textMuted,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const continueCountStyle: CSSProperties = {
  fontSize: 10,
  color: T.textMuted,
  flexShrink: 0,
  whiteSpace: "nowrap",
};

const brandingStyle: CSSProperties = {
  marginTop: 20,
  fontSize: 11,
  color: T.textMuted,
  opacity: 0.7,
};
