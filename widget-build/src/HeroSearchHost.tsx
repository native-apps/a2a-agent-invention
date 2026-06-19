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
import { getVisitorId } from "./visitor-identity";
import { useTheme, type ThemeColors } from "./use-theme";

// Inline Maximize2 SVG — matches lucide-react's Maximize2 icon exactly
// (same one the Preview uses in the continue button icon area).
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

// ── Theme ───────────────────────────────────────────────────────────────

// (Theme is provided by useTheme() inside the component — supports light/dark
// via prefers-color-scheme. Module-level styles that depend on theme colors are
// wrapped in makeStyles(T) below.)

// ── Types ───────────────────────────────────────────────────────────────

export interface HeroSearchHostProps {
  /** A2A JSON-RPC endpoint URL (for fetching AI suggestions) */
  endpoint: string;
  /** Agent display name */
  agentName?: string;
  /** Agent description shown above the search bar */
  agentDescription?: string;
  /** Optional logo URL — passed to BrainIcon (matches Preview). */
  logoUrl?: string;
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
  logoUrl,
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
  // ── Theme (device prefers-color-scheme) ─────────────────────────────
  const T = useTheme();
  const {
    hostStyle,
    descriptionStyle,
    searchWrapperStyle,
    dropdownStyle,
    thinkingDotStyle,
    rowStyle,
    usedRowStyle,
    rowTextStyle,
    usedBadgeStyle,
    generateRowStyle,
    continueBtnStyle,
    continueIconStyle,
    continueTitleStyle,
    continuePreviewStyle,
    continueCountStyle,
    brandingStyle,
  } = makeStyles(T);

  const containerRef = useRef<HTMLDivElement>(null);
  const heroElRef = useRef<HTMLElement | null>(null);

  // ── Suggestion list (single source of truth via the cache) ───────────
  // HeroSearchHost owns the full list (used + unused) so the dropdown and
  // the typewriter stay in sync: marking a prompt used updates both at once.
  const [allSuggestions, setAllSuggestions] = useState<CachedSuggestion[]>(() =>
    getAllSuggestions(),
  );
  const [generating, setGenerating] = useState(false);

  // Dropdown visibility + live filter state.
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filterText, setFilterText] = useState("");

  // ── Real message count from the database ────────────────────────────
  // Fetch from visitor/history so the "Continue paused conversation" button
  // shows the REAL count, not a value the website guesses. Mirrors the
  // Preview's behavior where messages.length comes from fetched history.
  const [dbMessageCount, setDbMessageCount] = useState<number | null>(null);
  const [dbLastMessagePreview, setDbLastMessagePreview] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vid = visitorId || (await getVisitorId());
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "visitor/history",
            id: Date.now(),
            params: { visitor_id: vid, limit: 20 },
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.error || !data.result) return;
        const conversations = data.result.conversations || [];
        let total = 0;
        let lastText = "";
        for (const conv of conversations) {
          for (const msg of conv.messages) {
            total++;
            lastText = msg.text || lastText;
          }
        }
        if (cancelled) return;
        if (total > 0) {
          setDbMessageCount(total);
          setDbLastMessagePreview(
            lastText
              .replace(/^\s*-{3,}\s*\n?/, "")
              .replace(/\*\*/g, "")
              .slice(0, 100),
          );
        }
      } catch {
        /* network error — fall back to prop values */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  // Use the real database count when available, otherwise fall back to the prop
  const realMessageCount =
    dbMessageCount !== null ? dbMessageCount : messageCount;
  const realLastMessagePreview =
    dbLastMessagePreview !== undefined
      ? dbLastMessagePreview
      : lastMessagePreview;

  // Unused suggestion texts — fed to the <ne-hero-search> typewriter.
  const unusedTexts = allSuggestions.filter((s) => !s.used).map((s) => s.text);

  // Filter suggestions by what the user has typed in the search input
  const filteredSuggestions = filterText.trim()
    ? allSuggestions.filter((s) =>
        s.text.toLowerCase().includes(filterText.trim().toLowerCase()),
      )
    : allSuggestions;

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

        // Wire up dropdown open/close on the Shadow DOM input.
        // Use pointerdown (NOT focus) to open — focus fires on programmatic
        // auto-focus and window focus events, which would open the dropdown
        // unexpectedly. pointerdown only fires on genuine user interaction.
        const editor = shadow.querySelector("input") as HTMLInputElement | null;
        if (editor) {
          // Open dropdown on user click/touch only
          el.addEventListener("pointerdown", () => {
            setDropdownOpen(true);
          });
          // Close on blur (delay so dropdown item clicks register)
          editor.addEventListener("blur", () => {
            setTimeout(() => {
              setDropdownOpen(false);
              setFilterText("");
            }, 200);
          });
          // Filter as the user types (programmatic .value sets do NOT
          // fire input events, so this only triggers on real user typing)
          editor.addEventListener("input", () => {
            setFilterText(editor.value);
          });
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

  // Push unused suggestions to the typewriter when CONTENT changes (not just
  // reference). `unusedTexts` is a derived array (new reference every parent
  // render), so without a content check this effect would fire on every
  // re-render and call setSuggestions() which RESTARTS the typewriter mid-cycle.
  const lastSuggestionsRef = useRef<string[]>(unusedTexts);
  useEffect(() => {
    // Deep-compare: only push to web component if content actually changed
    const prev = lastSuggestionsRef.current;
    const changed =
      unusedTexts.length !== prev.length ||
      unusedTexts.some((s, i) => s !== prev[i]);
    if (!changed) return;
    lastSuggestionsRef.current = unusedTexts;
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

        {/* Suggestion dropdown — absolute overlay, only when input is focused */}
        {dropdownOpen && filteredSuggestions.length > 0 && (
          <div style={dropdownStyle}>
            {filteredSuggestions.map((s, i) => (
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
          </div>
        )}
      </div>

      {/* Continue paused conversation */}
      {onOpenChat && realMessageCount > 0 && (
        <button onClick={onOpenChat} style={continueBtnStyle}>
          <div style={continueIconStyle}>
            <MaximizeIcon size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={continueTitleStyle}>Continue paused conversation</div>
            {realLastMessagePreview && (
              <div style={continuePreviewStyle}>{realLastMessagePreview}</div>
            )}
          </div>
          <div style={continueCountStyle}>{realMessageCount} msgs</div>
        </button>
      )}

      {/* Branding */}
      {branding && (
        <div style={brandingStyle}>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <BrainIcon size={12} logoUrl={logoUrl} />
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

// ── Styles (theme-reactive — re-computed on each render via makeStyles) ──

function makeStyles(T: ThemeColors) {
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
    position: "relative",
  };

  // ── Dropdown styles ─────────────────────────────────────────────────────

  const dropdownStyle: CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 50,
    marginTop: 4,
    maxHeight: 280,
    overflowY: "auto",
    background: T.darkMatter,
    border: `1px solid ${T.neuralNode}`,
    borderRadius: 12,
    padding: 6,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
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
    color: T.neonGreen,
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

  return {
    hostStyle,
    descriptionStyle,
    searchWrapperStyle,
    dropdownStyle,
    thinkingDotStyle,
    rowStyle,
    usedRowStyle,
    rowTextStyle,
    usedBadgeStyle,
    generateRowStyle,
    continueBtnStyle,
    continueIconStyle,
    continueTitleStyle,
    continuePreviewStyle,
    continueCountStyle,
    brandingStyle,
  };
}
