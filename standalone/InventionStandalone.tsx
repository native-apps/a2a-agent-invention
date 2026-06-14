// ---------------------------------------------------------------------------
// Invention Standalone — Full invention UI in an isolated Tauri window
// ---------------------------------------------------------------------------
// Renders the complete invention detail view (Conversations, Settings,
// Preview, Readme) as a standalone window. Loaded when the user clicks
// an invention in the main InventionsView list.
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from "react";
import { MessageSquare, Settings, Eye, BookOpen, Loader2 } from "lucide-react";
import BrainLogo from "../../../components/BrainLogo";
import A2aAgentSettings from "../settings/A2aAgentSettings";
import A2aChatPreview from "../settings/A2aChatPreview";
import A2aCrmView from "../crm/A2aCrmView";
import A2aReadme from "../settings/A2aReadme";

// ── Types ────────────────────────────────────────────────────────────────

interface InventionConfig {
  id: string;
  name: string;
  description: string;
  type: string;
  version: string;
  enabled: boolean;
  enabledForProject?: boolean;
  installedAt: string;
  updatedAt: string;
  projectIds: string[];
  settings: Record<string, unknown>;
  icon?: string;
}

// ── Theme ────────────────────────────────────────────────────────────────
// Reads Mother Brain's current theme from document.body class.
// The main app sets `body.classList.add("light")` for light mode.

const getTheme = (isLight: boolean) => ({
  deepVoid: isLight ? "#ffffff" : "#0a0a0f",
  darkMatter: isLight ? "#f5f5f7" : "#13131f",
  neuralNode: isLight ? "#e5e5ea" : "#1e1e2d",
  neonGreen: isLight ? "#00a854" : "#39ff14",
  text: isLight ? "#111111" : "#e2e8f0",
  textMuted: isLight ? "#6b7280" : "#64748b",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
});

/** Detect if the main app is in light mode */
const isLightMode = () =>
  typeof document !== "undefined" && document.body.classList.contains("light");

// ── Component ────────────────────────────────────────────────────────────

const InventionStandalone: React.FC = () => {
  const [invention, setInvention] = useState<InventionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<
    "conversations" | "settings" | "preview" | "readme"
  >("conversations");

  // ── Theme detection ──
  const [light, setLight] = useState(isLightMode());
  useEffect(() => {
    const check = () => setLight(isLightMode());
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  const T = getTheme(light);

  // Detect which invention from URL query param
  const inventionId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("invention")
      : null;
  const projectId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("projectId") ||
        localStorage.getItem("activeProjectId") ||
        "mother_brain"
      : "mother_brain";

  useEffect(() => {
    if (!inventionId) {
      setError("No invention ID specified in URL.");
      setLoading(false);
      return;
    }
    fetch(
      `/api/inventions/${inventionId}?projectId=${encodeURIComponent(projectId)}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setInvention(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load invention",
        );
        setLoading(false);
      });
  }, [inventionId]);

  const isActive = invention?.enabledForProject === true;

  // ── Loading ──
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
          className="animate-spin"
          style={{ color: T.neonGreen }}
        />
      </div>
    );
  }

  // ── Error ──
  if (error || !invention) {
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
        }}
      >
        <p style={{ fontSize: 14 }}>{error || "Invention not found"}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
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

  // ── Tab content ──
  // All tabs are rendered simultaneously and hidden/shown via CSS display.
  // This prevents unmounting (and state loss) when switching tabs.
  const isA2a = invention.type === "a2a-agent";

  const panelStyle = (tab: typeof detailTab): React.CSSProperties => ({
    display: detailTab === tab ? "block" : "none",
    height: "100%",
  });

  // ── Main render ──
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
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: `1px solid ${T.neuralNode}`,
          backgroundColor: T.darkMatter,
          flexShrink: 0,
        }}
      >
        <BrainLogo size={24} color={T.neonGreen} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.neonGreen }}>
            {invention.name}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted }}>
            v{invention.version} · {invention.type}
          </div>
        </div>
        <span
          className={`font-mono text-xs ${isActive ? "text-[#00dc82]" : "text-gray-600"}`}
        >
          {isActive ? "Active" : "Disabled"}
        </span>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${T.neuralNode}`,
          backgroundColor: T.darkMatter,
          flexShrink: 0,
        }}
      >
        {[
          { id: "conversations", label: "Conversations", icon: MessageSquare },
          { id: "settings", label: "Settings", icon: Settings },
          { id: "preview", label: "Preview", icon: Eye },
          { id: "readme", label: "Readme", icon: BookOpen },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDetailTab(tab.id as typeof detailTab)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              fontSize: 11,
              fontFamily: T.font,
              background: "none",
              border: "none",
              borderBottom:
                detailTab === tab.id
                  ? `2px solid ${T.neonGreen}`
                  : "2px solid transparent",
              color: detailTab === tab.id ? T.neonGreen : T.textMuted,
              cursor: "pointer",
              transition: "color 0.15s",
            }}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — all panels rendered, inactive ones hidden */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {isA2a ? (
          <>
            <div style={panelStyle("conversations")}>
              <A2aCrmView invention={invention} />
            </div>
            <div style={panelStyle("settings")}>
              <A2aAgentSettings
                invention={invention}
                onUpdate={(updates) => {
                  // Merge updates directly into local state.
                  // This preserves secrets (like supabaseServiceKey) that the
                  // MB backend strips from GET responses.
                  setInvention((prev) =>
                    prev
                      ? {
                          ...prev,
                          ...updates,
                          settings: {
                            ...prev.settings,
                            ...(updates.settings || {}),
                          },
                        }
                      : prev,
                  );
                }}
              />
            </div>
            <div
              style={{
                display: detailTab === "preview" ? "flex" : "none",
                flex: detailTab === "preview" ? 1 : undefined,
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <div style={{ flex: 1, minHeight: 0 }}>
                {/* Mount/unmount: A2aChatPreview's EnhancedTyped typewriter
                    dispatches focus-stealing DOM events (setSelectionRange,
                    focus) even when hidden via display:none. By only mounting
                    it when the Preview tab is active, the custom element's
                    disconnectedCallback() clears the timer on tab switch. */}
                {detailTab === "preview" && (
                  <A2aChatPreview invention={invention} />
                )}
              </div>
            </div>
            <div style={panelStyle("readme")}>
              <A2aReadme />
            </div>
          </>
        ) : (
          <div
            style={{
              padding: 20,
              fontFamily: T.font,
              color: T.textMuted,
              fontSize: 13,
            }}
          >
            Settings UI not registered for invention type: {invention.type}
          </div>
        )}
      </div>
    </div>
  );
};

export default InventionStandalone;
