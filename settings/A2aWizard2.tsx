// ---------------------------------------------------------------------------
// A2A Agent Invention — Setup Wizard 2 (step-by-step reorganization)
// ---------------------------------------------------------------------------
// The newer, cleaner Wizard. Same great layout (SVG canvas + fullscreen slide
// modal), rebuilt around a logical step-by-step flow:
//
//   1. AGENT IDENTITY — the exact same fields the classic Settings screen
//      owns (Bot User, Name, Description, Provider, Access Token). They are
//      TRUE MIRRORS: Wizard 2 reads/writes the same invention settings via
//      the same PATCH endpoint, so editing here updates Settings and
//      vice-versa, 100% of the time. Nothing is duplicated or stored twice.
//
//   More steps (Knowledge, Models, Deploy, …) will be reorganized here next.
//
// AI ASSISTANT — the old left-side "Setup Guide" markdown reader is REPLACED
// by a live chat thread powered by the default chat LLM (via the MCP
// Gateway's OpenAI-compatible /v1/chat/completions). The assistant is
// grounded in the official Recipes (recipes/a2a-setup.md) and can pre-fill
// fields for the user — its [[SET:field=value]] suggestions render as
// one-click "Apply" buttons that write straight into the shared settings.
//
// This component is registered in config.json as components."Wizard 2" and is
// loaded by Mother Brain's InventionsView — no Mother Brain app changes.
// ---------------------------------------------------------------------------

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Code2,
  Copy,
  Eye,
  EyeOff,
  FileJson,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import FastMarkdown from "../../../components/FastMarkdown";
import ThemedSelect from "../../../components/ThemedSelect";
import { saveSupabaseCreds } from "../shared/supabaseConfig";
import { activateInventionTab } from "./tabNav";

// ── Types ────────────────────────────────────────────────────────────────

interface InventionConfig {
  id: string;
  name: string;
  description: string;
  type: string;
  version: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  projectIds: string[];
  settings: Record<string, unknown>;
  icon?: string;
}

interface A2aWizard2Props {
  invention: InventionConfig;
  onUpdate: (updates: Partial<InventionConfig>) => void;
}

// Wizard settings — a typed subset of the invention's settings object.
// The index signature preserves every OTHER setting the classic screen owns
// (skills, embeddings, kb config, …) so saving never wipes them.
interface Wizard2Settings {
  agentName: string;
  agentDescription: string;
  agentUrl: string;
  agentProvider: string;
  accessToken: string;
  botUserEmail: string;
  botUserId: string;
  gatewayToken: string;
  gatewayBaseUrl: string;
  primaryProjectId: string;
  additionalProjectIds: string[];
  aiModel: string;
  cfMaxTokens?: number;
  cfTemperature?: number;
  embeddingProvider: string;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  widgetColor: string;
  widgetBranding: string;
  heroGradientColor1: string;
  heroGradientColor2: string;
  logoUrl: string;
  showToolCalls: boolean;
  showThinking: boolean;
  showReasoning: boolean;
  mcpCloudUrl: string;
  forceCloudMcp: boolean;
  mbSupabaseUrl: string;
  mbSupabaseServiceKey: string;
  mbSupabaseAccessToken: string;
  mbProjectId: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseSyncEnabled: boolean;
  dbProvider: string;
  localPgStatus: string;
  cloudflareAccountId: string;
  cfApiToken: string;
  workerName: string;
  cfWorkerModel: string;
  forceCfWorker: boolean;
  deployStatus: string;
  lastDeployedAt: string | null;
  lastEndpointPingAt: string | null;
  lastEndpointPingOk: boolean;
  lastCfCheckAt?: string | null;
  lastCfDeployedAt?: string | null;
  skills: Skill[];
  agentSkillsJson?: string;
  [key: string]: unknown;
}

interface Project {
  id: string;
  name: string;
  projectName?: string;
}

interface ProjectUser {
  id: string;
  name: string;
  email: string;
  role: string;
  accessToken: string;
  bio?: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
  inputModes: string[];
  outputModes: string[];
}

interface Model {
  id: string;
  label: string;
  provider: string;
  model: string;
}

type NodeId = "identity" | "website" | "cloudmirror"; // Wizard 2 grows node-by-node.

interface Slide {
  title: string;
  desc: string;
  body: React.ReactNode;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FieldSuggestion {
  field: string;
  value: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Wizard2Settings = {
  agentName: "AI Assistant",
  agentDescription: "AI assistant",
  agentUrl: "",
  agentProvider: "",
  accessToken: "",
  botUserEmail: "",
  botUserId: "",
  gatewayToken: "",
  gatewayBaseUrl: "",
  primaryProjectId: "",
  additionalProjectIds: [],
  aiModel: "default",
  cfMaxTokens: 1024,
  cfTemperature: 0.7,
  embeddingProvider: "voyage-ai",
  embeddingApiKey: "",
  embeddingModel: "voyage-4-large",
  embeddingDimensions: 1024,
  widgetColor: "#39ff14",
  widgetBranding: "",
  heroGradientColor1: "#00dc82",
  heroGradientColor2: "#a78bfa",
  logoUrl: "",
  showToolCalls: true,
  showThinking: false,
  showReasoning: false,
  deployStatus: "not-deployed",
  lastDeployedAt: null,
  mcpCloudUrl: "",
  forceCloudMcp: false,
  mbSupabaseUrl: "",
  mbSupabaseServiceKey: "",
  mbSupabaseAccessToken: "",
  mbProjectId: "",
  supabaseUrl: "",
  supabaseServiceKey: "",
  supabaseSyncEnabled: true,
  dbProvider: "both",
  localPgStatus: "stopped",
  cloudflareAccountId: "",
  cfApiToken: "",
  workerName: "a2a-endpoint",
  cfWorkerModel: "@cf/zai-org/glm-4.7-flash",
  forceCfWorker: false,
  lastEndpointPingAt: null,
  lastEndpointPingOk: false,
  skills: [
    {
      id: "general-support",
      name: "General Support",
      description: "Answer general questions and provide helpful guidance",
      tags: ["general", "support"],
      examples: ["How can you help me?", "What can you do?"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
  agentSkillsJson: "",
};

// Cloudflare Workers AI model options (same list the Settings screen uses
// for the Cloudflare Worker Model select — the Agent Cloud Mirror node).
const CF_MODEL_OPTIONS = [
  { value: "@cf/zai-org/glm-4.7-flash", label: "GLM-4.7-Flash (Zhipu AI) — Cheap, fast, function calling" },
  { value: "@cf/zai-org/glm-5.2", label: "GLM-5.2 (Zhipu AI) — Powerful, reasoning, expensive" },
  { value: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B (Meta) — MoE, function calling" },
  { value: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B FP8 Fast (Meta) — Fast, function calling" },
  { value: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B MoE FP8 (Qwen) — Cheap, reasoning" },
  { value: "@cf/openai/gpt-oss-20b", label: "GPT-OSS-20B (OpenAI) — Open weights, reasoning" },
  { value: "@cf/openai/gpt-oss-120b", label: "GPT-OSS-120B (OpenAI) — Powerful, reasoning" },
  { value: "@cf/google/gemma-4-26b-a4b-it", label: "Gemma 4 26B (Google) — Reasoning, vision" },
  { value: "@cf/mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1 24B (Mistral) — Function calling" },
  { value: "@cf/nvidia/nemotron-3-120b-a12b", label: "Nemotron 3 120B (NVIDIA) — Agentic, reasoning" },
  { value: "@cf/ibm-granite/granite-4.0-h-micro", label: "Granite 4.0 H-Micro (IBM) — Cheapest, function calling" },
  { value: "@cf/moonshotai/kimi-k2.7-code", label: "Kimi K2.7-Code (Moonshot) — 1T param, agentic" },
];

// ── Agent Card Data (same constant the classic screens use) ─────────────

const AGENT_CARD = {
  schemaVersion: "1.0",
  name: "AI Assistant",
  description: "AI assistant",
  url: "",
  preferredTransport: "jsonrpc",
  version: "1.0.0",
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  authentication: { schemes: ["bearer"] },
  skills: [
    {
      id: "general-support",
      name: "General Support",
      description: "Answer general questions and provide helpful guidance",
      tags: ["general", "support"],
      examples: ["How can you help me?", "What can you do?"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────

function getSettings(invention: InventionConfig): Wizard2Settings {
  const raw = invention.settings || {};
  return { ...DEFAULT_SETTINGS, ...(raw as Partial<Wizard2Settings>) };
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── SVG canvas helpers (matches Mother Brain Canvas / MVA screens) ──────

/** Chamfered octagonal SVG polygon points (matches motherbrain.app OctagonButton). */
function octPath(w: number, h: number, c = 16): string {
  return `${c},0 ${w - c},0 ${w},${c} ${w},${h - c} ${w - c},${h} ${c},${h} 0,${h - c} 0,${c}`;
}

// Minimal stroke icons drawn as raw SVG (lucide path data) so the canvas is
// a pure SVG canvas with no HTML overlay.
const ICONS = {
  bot: () => (
    <>
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </>
  ),
  globe: () => (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  cloud: () => (
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  ),
};



// Fields the AI assistant is allowed to pre-fill (Identity step only).
const SUGGESTABLE_FIELDS: Record<string, string> = {
  agentName: "Agent Name",
  agentDescription: "Agent Description",
  agentProvider: "Provider",
};

/** Extract [[SET:field=value]] suggestions from an assistant message. */
function parseSuggestions(content: string): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  const re = /\[\[SET:([a-zA-Z]+)=([^\]]*)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (SUGGESTABLE_FIELDS[m[1]]) {
      out.push({ field: m[1], value: m[2] });
    }
  }
  return out;
}

/** Strip the [[SET:…]] tags for display. */
function stripSuggestions(content: string): string {
  return content.replace(/\[\[SET:[^\]]+\]\]/g, "").trim();
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your A2A setup assistant. I'll walk you through this step — ask me what any field means, or tell me about your business and I'll draft your agent's **name**, **description**, and **provider** for you. Anything I suggest shows up as an **Apply** button you can click to fill the field instantly.",
};

// ── Component ────────────────────────────────────────────────────────────

const A2aWizard2: React.FC<A2aWizard2Props> = ({ invention, onUpdate }) => {
  const propsSettings = getSettings(invention);
  const [settings, setSettings] = useState<Wizard2Settings>(propsSettings);
  const savedSnapshotRef = useRef<Wizard2Settings>(propsSettings);

  // ── View state ──
  const [openNode, setOpenNode] = useState<NodeId | null>(null);
  const [slide, setSlide] = useState(0);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

  // ── AI Assistant state (replaces the old Setup Guide sidebar) ──
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([GREETING]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [recipeText, setRecipeText] = useState<string | null>(null);
  const [appliedSuggestions, setAppliedSuggestions] = useState<Set<string>>(
    new Set(),
  );
  const chatThreadRef = useRef<HTMLDivElement | null>(null);

  // ── Data state ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectUsers, setProjectUsers] = useState<ProjectUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string>(
    invention.projectIds?.[0] || "",
  );
  const [availableModels, setAvailableModels] = useState<Model[]>([]);

  // ── Skills editor + agent card state (mirrors the classic screens) ──
  const [copiedCard, setCopiedCard] = useState(false);
  const [aiSkillSuggestions, setAiSkillSuggestions] = useState<Skill[]>([]);
  const [aiSuggestingLoading, setAiSuggestingLoading] = useState(false);
  const [aiSuggestingOpen, setAiSuggestingOpen] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<
    Set<string>
  >(new Set());

  // ── Busy / status state ──
  const [saving, setSaving] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [embeddingFetching, setEmbeddingFetching] = useState(false);
  const [widgetBuildUrl, setWidgetBuildUrl] = useState<string | null>(null);
  const [isBuildingWidget, setIsBuildingWidget] = useState(false);
  // Cloud mirror node state — mirrors the Settings Deploy/Database handlers
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [supabaseFetching, setSupabaseFetching] = useState(false);
  const [mbFetching, setMbFetching] = useState(false);
  const [fetchingMbKey, setFetchingMbKey] = useState(false);
  const [dbBusy, setDbBusy] = useState(false);
  // Endpoint health check / connection test — mirrors the Settings Endpoint
  // section exactly (runHealthCheck + Test Connection).
  const [healthChecking, setHealthChecking] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
    taskId?: string;
  } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // ── Light/dark theme detection (matches classic settings screen) ──
  const [isLightMode, setIsLightMode] = useState(false);
  useEffect(() => {
    const check = () =>
      setIsLightMode(document.body.classList.contains("light"));
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    check();
    return () => observer.disconnect();
  }, []);

  // Sync local state when parent props change (e.g. the Settings screen
  // saved new values). Guard: don't override the user's unsaved edits.
  useEffect(() => {
    setSettings((prev) => {
      const current = JSON.stringify(prev);
      const saved = JSON.stringify(savedSnapshotRef.current);
      if (current !== saved) return prev; // unsaved edits — preserve them
      savedSnapshotRef.current = propsSettings;
      return propsSettings;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invention.settings]);

  // ── Fetch projects ──
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          const normalized = data.map((p: Record<string, unknown>) => ({
            id: (p.projectId || p.id) as string,
            name: (p.projectName || p.name || "") as string,
          }));
          setProjects(normalized);
        }
      })
      .catch(() => {});
  }, []);

  // ── Available AI models from MB App Settings (same as classic screens) ──
  useEffect(() => {
    fetch("/api/settings/global")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.llms && Array.isArray(data.llms)) {
          const models = data.llms
            .filter(
              (llm: Record<string, unknown>) =>
                llm.model && typeof llm.model === "string",
            )
            .map((llm: Record<string, unknown>) => ({
              id: (llm.id || llm.model) as string,
              label: `${llm.model} (${llm.provider || "unknown"})`,
              provider: llm.provider as string,
              model: llm.model as string,
            }));
          setAvailableModels(models);
        }
      })
      .catch(() => {});
  }, []);

  // ── Active project ID from MB server (fallback for fresh configs) ──
  useEffect(() => {
    const load = () => {
      fetch("/api/active-project")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.activeProjectId) setActiveProjectId(data.activeProjectId);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("project-changed", load);
    return () => window.removeEventListener("project-changed", load);
  }, []);

  // ── Fetch project users (Sub-Agents only) when project changes ──
  // The bot user MUST come from the ACTIVE project — never from a stale
  // primaryProjectId baked into the invention config by a different project.
  useEffect(() => {
    const projectId = settings.primaryProjectId || activeProjectId;
    if (!projectId) return;
    setUsersLoading(true);
    fetch(`/api/projects/${projectId}/users`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          const agentsOnly = data.filter(
            (u: Record<string, unknown>) =>
              u.type === "agent" ||
              (typeof u.role === "string" && u.role.includes("agent")),
          );
          setProjectUsers(agentsOnly as ProjectUser[]);
        }
      })
      .catch(() => setProjectUsers([]))
      .finally(() => setUsersLoading(false));
  }, [activeProjectId, settings.primaryProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Identity safety — never show another project's agent identity ──
  // Same safeguard as the classic Settings screen, so both screens always
  // display the exact same truth. Two protections against identity loss:
  //   1. Self-heal — botUserId empty but botUserEmail matches an agent user
  //      in THIS project → restore the ID.
  //   2. Only blank when the users list is CONFIRMED non-empty and genuinely
  //      lacks the bot user (a fetch failure must never wipe identity).
  useEffect(() => {
    const pid = settings.primaryProjectId || activeProjectId;
    if (!pid) return;
    if (usersLoading) return; // wait for the users list to settle

    if (!settings.botUserId && settings.botUserEmail) {
      const match = projectUsers.find((u) => u.email === settings.botUserEmail);
      if (match) {
        setSettings((prev) => ({
          ...prev,
          botUserId: match.id,
          accessToken: match.accessToken || prev.accessToken,
          agentName: match.name || prev.agentName,
        }));
        return;
      }
    }

    if (!settings.botUserId) return; // nothing stale to blank
    if (projectUsers.length === 0) return; // list not confirmed — preserve
    const stillExists = projectUsers.some((u) => u.id === settings.botUserId);
    if (stillExists) return;
    setSettings((prev) => ({
      ...prev,
      botUserId: "",
      botUserEmail: "",
      accessToken: "",
      agentName: "AI Assistant",
      agentDescription: "AI assistant",
      agentProvider: "",
    }));
  }, [activeProjectId, settings.primaryProjectId, projectUsers, usersLoading, settings.botUserId, settings.botUserEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AUTO-GRAB on mount: resolve project + gateway URL (for the
  //    assistant's LLM connection). Same sources as the classic screens. ──
  useEffect(() => {
    const autoGrab = async () => {
      const updates: Partial<Wizard2Settings> = {};

      if (!settings.primaryProjectId) {
        try {
          const res = await fetch("/api/active-project");
          if (res.ok) {
            const data = await res.json();
            if (data.activeProjectId) {
              updates.primaryProjectId = data.activeProjectId;
            }
          }
        } catch {}
      }

      if (!settings.gatewayBaseUrl || !settings.gatewayToken) {
        try {
          const res = await fetch("/api/settings/global");
          if (res.ok) {
            const g = await res.json();
            // Gateway Token = the Sub-Agent's User Access Token, NOT the MB
            // Master API Key (Zero Trust attribution).
            if (!settings.gatewayToken && settings.accessToken) {
              updates.gatewayToken = settings.accessToken;
            }
            const gwUrl = g.gatewayUrl || g.gatewayWorkerUrl || g.mcpGatewayUrl;
            if (!settings.gatewayBaseUrl && gwUrl) {
              updates.gatewayBaseUrl = gwUrl;
            }
          }
        } catch {}
      }

      if (Object.keys(updates).length > 0) {
        setSettings((prev) => {
          const merged = { ...prev, ...updates };
          persist(merged);
          return merged;
        });
      }
    };
    autoGrab();
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── PERSIST (save full settings to server) ──
  // CRITICAL: merges into the SERVER's CURRENT config, never into local
  // state — the exact same write path as the classic Settings screen, which
  // is what keeps Wizard 2 and Settings perfect mirrors of each other.
  const persist = useCallback(
    async (s: Wizard2Settings) => {
      // Keep the Worker's AGENT_SKILLS_JSON secret in sync with the skills
      // array (same rule as the classic Settings screen's save).
      const merged = { ...s };
      if (Array.isArray(merged.skills)) {
        merged.agentSkillsJson = JSON.stringify(merged.skills);
      }
      try {
        const pid = merged.primaryProjectId || activeProjectId;
        if (!pid) {
          // NEVER write to the base config: this invention is project-scoped.
          return;
        }
        // Load the server's CURRENT config, then merge this state on top.
        const curRes = await fetch(
          `/api/inventions/${invention.id}?projectId=${encodeURIComponent(pid)}`,
        );
        const curInv = curRes.ok ? await curRes.json() : null;
        const serverSettings =
          curInv?.settings && typeof curInv.settings === "object"
            ? (curInv.settings as Record<string, unknown>)
            : {};
        const finalSettings: Record<string, unknown> = {
          ...serverSettings,
          ...merged,
        };
        if (Array.isArray(merged.skills)) {
          finalSettings.agentSkillsJson = JSON.stringify(merged.skills);
        }
        const res = await fetch(`/api/inventions/${invention.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: finalSettings,
            projectId: pid,
          }),
        });
        if (res.ok) {
          onUpdate({ settings: merged });
          savedSnapshotRef.current = merged;
          // Persist Supabase creds to localStorage as fallback (parity with
          // the classic screens — these fields aren't edited in Wizard 2 but
          // must keep flowing if they're already configured).
          if (merged.supabaseUrl || merged.supabaseServiceKey) {
            saveSupabaseCreds(
              merged.supabaseUrl as string,
              merged.supabaseServiceKey as string,
              pid,
            );
          }
        }
      } catch {
        // Network hiccup — the next edit will retry
      }
    },
    [invention.id, onUpdate, activeProjectId],
  );

  // ── updateField: local edit + debounced auto-save ──
  const saveTimer = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings; // keep in sync on every render
  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    persist(settingsRef.current);
  }, [persist]);
  const updateField = useCallback(
    (key: string, value: unknown) => {
      setSettings((prev) => {
        const merged = { ...prev, [key]: value };
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(async () => {
          setSaving(true);
          await persist(merged);
          setSaving(false);
        }, 600);
        return merged;
      });
    },
    [persist],
  );

  // ── applyAndSave: apply values AND persist immediately (auto-populate) ──
  const applyAndSave = useCallback(
    (updates: Partial<Wizard2Settings>) => {
      setSettings((prev) => {
        const merged = { ...prev, ...updates };
        persist(merged);
        return merged;
      });
    },
    [persist],
  );

  // ── Bot user selection (auto-populates name, token, provider) ──
  // Identical to the classic Settings screen behavior — same fields, same
  // auto-populate rules, same persistence.
  const handleBotUserSelect = (userId: string) => {
    const user = projectUsers.find((u) => u.id === userId);
    if (user) {
      applyAndSave({
        botUserId: user.id,
        botUserEmail: user.email,
        accessToken: user.accessToken || "",
        agentName: user.name || settings.agentName,
        agentProvider: settings.agentProvider || user.name || "",
        ...(user.bio ? { agentDescription: user.bio } : {}),
      });
    }
  };

  const handleRotateToken = async () => {
    if (!settings.botUserId) return;
    const pid = settings.primaryProjectId || activeProjectId;
    if (!pid) return;
    setRotatingToken(true);
    try {
      const r = await fetch(
        `/api/projects/${pid}/users/${settings.botUserId}/regenerate-token`,
        { method: "POST" },
      );
      if (r.ok) {
        const data = await r.json();
        applyAndSave({
          accessToken: data.accessToken || data.token || "",
        });
      }
    } catch {} finally {
      setRotatingToken(false);
    }
  };

  // ── Agent Skills editor handlers (same fields as the Settings screen) ──
  const addSkill = () => {
    const skillId = `skill-${Date.now()}`;
    const newSkill: Skill = {
      id: skillId,
      name: "New Skill",
      description: "Describe what this skill does",
      tags: [],
      examples: [],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    };
    updateField("skills", [...((settings.skills as Skill[]) || []), newSkill]);
  };

  const updateSkill = (index: number, field: string, value: string | string[]) => {
    const skills = [...((settings.skills as Skill[]) || [])];
    skills[index] = { ...skills[index], [field]: value };
    updateField("skills", skills);
  };

  const removeSkill = (index: number) => {
    const skills = [...((settings.skills as Skill[]) || [])];
    skills.splice(index, 1);
    updateField("skills", skills);
  };

  const moveSkill = (index: number, dir: -1 | 1) => {
    const skills = [...((settings.skills as Skill[]) || [])];
    const to = index + dir;
    if (to < 0 || to >= skills.length) return;
    const [moved] = skills.splice(index, 1);
    skills.splice(to, 0, moved);
    updateField("skills", skills);
  };

  // ── Vectorization: fetch embedding key from the project's config ──
  const fetchEmbedding = async () => {
    const pid = settings.primaryProjectId || activeProjectId;
    if (!pid) return;
    setEmbeddingFetching(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/config`);
      if (res.ok) {
        const config = await res.json();
        const updates: Partial<Wizard2Settings> = {};
        const key =
          config?.embedding?.apiKey ||
          config?.embeddingApiKey ||
          config?.voyageApiKey ||
          "";
        if (key) updates.embeddingApiKey = key;
        if (config?.embedding?.provider) updates.embeddingProvider = config.embedding.provider;
        if (config?.embedding?.model) updates.embeddingModel = config.embedding.model;
        if (config?.embedding?.dimensions) updates.embeddingDimensions = config.embedding.dimensions;
        if (Object.keys(updates).length > 0) applyAndSave(updates);
      }
    } catch {
    } finally {
      setEmbeddingFetching(false);
    }
  };

  // ── Website node: health check — EXACT MIRROR of the Settings screen's
  // runHealthCheck (Endpoint section). Same endpoint, same response fields
  // (data.endpointReachable, data.suggestedStatus, data.cloudflareLastModified),
  // same persisted settings (lastEndpointPingAt/Ok, lastCfCheckAt/DeployedAt,
  // deployStatus). ──
  const runHealthCheck = async () => {
    setHealthChecking(true);
    const activePid = settings.primaryProjectId || activeProjectId;
    try {
      const r = await fetch(
        `/api/inventions/a2a-agent/action/health-check${activePid ? `?projectId=${activePid}` : ""}`,
      );
      if (r.ok) {
        const data = await r.json();
        const updates: Partial<Wizard2Settings> = {};
        const nowISO = new Date().toISOString();

        updates.lastEndpointPingAt = nowISO;
        updates.lastEndpointPingOk = !!data.endpointReachable;
        updates.lastCfCheckAt = nowISO;
        if (data.cloudflareLastModified) {
          updates.lastCfDeployedAt = data.cloudflareLastModified;
        }
        if (
          settings.deployStatus !== data.suggestedStatus &&
          data.suggestedStatus
        ) {
          updates.deployStatus = data.suggestedStatus;
        }

        if (Object.keys(updates).length > 0) {
          applyAndSave(updates);
        }
      }
    } catch {
      // silently fail
    } finally {
      setHealthChecking(false);
    }
  };

  // ── Cloud mirror node handlers — exact mirrors of the Settings screen ──

  // A2A Chat DB Supabase: auto-fill from project config (+ Management API key
  // resolution) — same function as the classic screens' fetchSupabase.
  const fetchSupabase = async () => {
    const pid = settings.primaryProjectId || activeProjectId;
    if (!pid) return;
    setSupabaseFetching(true);
    try {
      const configRes = await fetch(
        `/api/projects/${encodeURIComponent(pid)}/config`,
      );
      if (!configRes.ok) return;
      const projectConfig = await configRes.json();
      const updates: Partial<Wizard2Settings> = {};
      if (projectConfig.supabaseUrl) {
        updates.supabaseUrl = projectConfig.supabaseUrl;
      }
      if (projectConfig.supabaseServiceKey) {
        updates.supabaseServiceKey = projectConfig.supabaseServiceKey;
      } else if (projectConfig.supabaseAccessToken && projectConfig.supabaseUrl) {
        const ref = projectConfig.supabaseUrl
          .replace(/^https:\/\//, "")
          .replace(/\.supabase\.co.*$/, "");
        try {
          const keysRes = await fetch(
            `https://api.supabase.com/v1/projects/${ref}/api-keys`,
            {
              headers: {
                Authorization: `Bearer ${projectConfig.supabaseAccessToken}`,
              },
            },
          );
          if (keysRes.ok) {
            const keys = await keysRes.json();
            const serviceKey = Array.isArray(keys)
              ? keys.find(
                  (k: { name?: string; api_key?: string }) =>
                    k.name === "service_role",
                )?.api_key
              : undefined;
            if (serviceKey) updates.supabaseServiceKey = serviceKey;
          }
        } catch {}
      }
      if (Object.keys(updates).length > 0) applyAndSave(updates);
    } catch {
    } finally {
      setSupabaseFetching(false);
    }
  };

  // Project KB Supabase (#1): pull URL/token/key from the project config —
  // same auto-load path as the Settings "Offline Fallback (Knowledge Base)"
  // section + its deploy pre-fetch.
  const fetchMbSupabase = async () => {
    const pid = settings.primaryProjectId || activeProjectId;
    if (!pid) return;
    setMbFetching(true);
    try {
      const configRes = await fetch(
        `/api/projects/${encodeURIComponent(pid)}/config`,
      );
      if (!configRes.ok) return;
      const c = await configRes.json();
      const updates: Partial<Wizard2Settings> = {};
      if (c.supabaseUrl) updates.mbSupabaseUrl = c.supabaseUrl;
      updates.mbProjectId = pid;
      if (c.supabaseAccessToken) updates.mbSupabaseAccessToken = c.supabaseAccessToken;
      if (c.supabaseUrl && c.supabaseAccessToken) {
        const ref = c.supabaseUrl
          .replace(/^https:\/\//, "")
          .replace(/\.supabase\.co.*$/, "");
        try {
          const keysRes = await fetch(
            `https://api.supabase.com/v1/projects/${ref}/api-keys`,
            {
              headers: { Authorization: `Bearer ${c.supabaseAccessToken}` },
            },
          );
          if (keysRes.ok) {
            const keys = await keysRes.json();
            const serviceKey = Array.isArray(keys)
              ? keys.find(
                  (k: { name?: string; api_key?: string }) =>
                    k.name === "service_role",
                )?.api_key
              : undefined;
            if (serviceKey) updates.mbSupabaseServiceKey = serviceKey;
          }
        } catch {}
      }
      if (Object.keys(updates).length > 0) applyAndSave(updates);
    } catch {
    } finally {
      setMbFetching(false);
    }
  };

  // Re-fetch the service_role key via the Management API — same as the
  // Settings screen's handleFetchMbServiceKey.
  const handleFetchMbServiceKey = async () => {
    const pid =
      settings.mbProjectId || settings.primaryProjectId || activeProjectId;
    if (!pid || !settings.mbSupabaseAccessToken) return;
    setFetchingMbKey(true);
    try {
      const ref = (settings.mbSupabaseUrl || "")
        .replace(/^https:\/\//, "")
        .replace(/\.supabase\.co.*$/, "");
      if (!ref) return;
      const keysRes = await fetch(
        `https://api.supabase.com/v1/projects/${ref}/api-keys`,
        {
          headers: {
            Authorization: `Bearer ${settings.mbSupabaseAccessToken}`,
          },
        },
      );
      if (keysRes.ok) {
        const keys = await keysRes.json();
        const serviceKey = Array.isArray(keys)
          ? keys.find(
              (k: { name?: string; api_key?: string }) => k.name === "service_role",
            )?.api_key
          : undefined;
        if (serviceKey) {
          updateField("mbSupabaseServiceKey", serviceKey);
        }
      }
    } catch {
      // silently fail
    } finally {
      setFetchingMbKey(false);
    }
  };

  // Start the local chat DB (used on the Chat History slide) — same as the
  // classic screens' handleStartDb.
  const handleStartDb = async () => {
    if (dbBusy) return;
    setDbBusy(true);
    try {
      const pid = settings.primaryProjectId || activeProjectId;
      const r = await fetch(
        `/api/inventions/a2a-agent/action/start-db${pid ? `?projectId=${encodeURIComponent(pid)}` : ""}`,
        { method: "POST" },
      );
      if (r.ok) {
        const data = await r.json();
        applyAndSave({ localPgStatus: data.status || "running" });
      }
    } catch {
    } finally {
      setDbBusy(false);
    }
  };

  // Deploy to Cloudflare — the old wizard's modal-proven handleDeploy: awaited
  // full-settings PATCH first, then the MB deploy action (wrangler deploy +
  // secrets), with the friendly auth-error hint.
  const handleDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    setDeployError(null);
    setDeployMsg("Saving settings…");
    try {
      const activePid = settings.primaryProjectId || activeProjectId;
      if (!activePid) throw new Error("No project context — cannot deploy.");
      // 1. Explicit awaited save so every secret is on disk before deploy
      const merged = { ...settings };
      if (Array.isArray(merged.skills)) {
        merged.agentSkillsJson = JSON.stringify(merged.skills);
      }
      const saveRes = await fetch(`/api/inventions/${invention.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: merged, projectId: activePid }),
      });
      if (!saveRes.ok) throw new Error(`Save failed (HTTP ${saveRes.status})`);
      onUpdate({ settings: merged });
      savedSnapshotRef.current = merged;

      // 2. Trigger the Mother Brain deploy action (wrangler deploy + secrets)
      setDeployMsg("Deploying to Cloudflare…");
      const r = await fetch(
        `/api/inventions/a2a-agent/action/deploy${activePid ? `?projectId=${encodeURIComponent(activePid)}` : ""}`,
        { method: "POST" },
      );
      if (r.ok) {
        const data = await r.json();
        applyAndSave({
          deployStatus: data.status || "deployed",
          lastDeployedAt: new Date().toISOString(),
        });
        setDeployMsg("Deploy complete ✓ Your agent endpoint is live.");
      } else {
        let errMsg = `Deploy failed (HTTP ${r.status})`;
        try {
          const errData = await r.json();
          if (errData.error) errMsg = errData.error;
        } catch {}
        if (
          errMsg.includes("Invalid access token") ||
          errMsg.includes("Authentication error")
        ) {
          errMsg =
            "The Mother Brain app's Cloudflare API token is invalid or expired. Update it in Mother Brain app Settings → Cloudflare, then try again.";
        }
        throw new Error(errMsg);
      }
    } catch (err) {
      setDeployError(
        err instanceof Error ? err.message : "Network error during deploy",
      );
    } finally {
      setDeploying(false);
    }
  };

  // ── Minimal ZIP creator (STORE mode, no compression, zero deps) ──
  const CRC_TABLE: Uint32Array = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();

  function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++)
      crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createZip(files: { name: string; content: string }[]): Blob {
    const enc = new TextEncoder();
    const fileRecs: Uint8Array[] = [];
    const centralRecords: Uint8Array[] = [];
    let offset = 0;

    for (const f of files) {
      const data = enc.encode(f.content);
      const name = enc.encode(f.name);
      const crc = crc32(data);

      const lfh = new Uint8Array(30 + name.length + data.length);
      const dv = new DataView(lfh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      lfh.set(name, 30);
      lfh.set(data, 30 + name.length);
      fileRecs.push(lfh);

      const cdr = new Uint8Array(46 + name.length);
      const cdv = new DataView(cdr.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, 0, true);
      cdv.setUint16(14, 0x21, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, data.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, name.length, true);
      cdv.setUint32(42, offset, true);
      cdr.set(name, 46);
      centralRecords.push(cdr);

      offset += lfh.length;
    }

    const cdSize = centralRecords.reduce((s, r) => s + r.length, 0);
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);

    const total = offset + cdSize + 22;
    const result = new Uint8Array(total);
    let pos = 0;
    for (const r of fileRecs) {
      result.set(r, pos);
      pos += r.length;
    }
    for (const r of centralRecords) {
      result.set(r, pos);
      pos += r.length;
    }
    result.set(eocd, pos);
    return new Blob([result], { type: "application/zip" });
  }

  // ── Build the Chat UI Widget bundle (client-side zip download) ──
  const handleBuildWidget = async () => {
    if (isBuildingWidget) return;
    setIsBuildingWidget(true);
    try {
      const basePath = "/api/inventions/a2a-agent/resource/widget-build";
      const filesToFetch = [
        "src/index.ts",
        "src/HeroSearchElement.ts",
        "src/HeroSearchHost.tsx",
        "src/useHeroSuggestions.ts",
        "src/ChatApp.tsx",
        "src/ChatWidget.tsx",
        "src/BrainIcon.tsx",
        "src/markdown.ts",
        "src/visitor-identity.ts",
        "src/use-theme.ts",
        "src/suggestion-cache.ts",
        "src/SuggestionsPreloader.tsx",
        "package.json",
        "tsconfig.json",
        "README.md",
      ];
      const fileContents = await Promise.all(
        filesToFetch.map(async (f) => {
          const res = await fetch(`${basePath}/${f}`);
          const text = await res.text();
          return { name: `motherbrain-widget/${f}`, content: text };
        }),
      );
      const zipBlob = createZip(fileContents);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "motherbrain-widget.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setWidgetBuildUrl("downloaded");
    } catch (err) {
      console.error("Widget build failed:", err);
    } finally {
      setIsBuildingWidget(false);
    }
  };

  // ── Node open/close ──
  const openNodeModal = (id: NodeId) => {
    if (!nodeUnlocked[id]) return; // locked nodes never open (canvas blocks clicks too)
    setOpenNode(id);
    setSlide(0);
    setAssistantOpen(false); // fresh modal starts without the sidebar (same as the old guide)
  };
  const closeNodeModal = () => {
    flushSave();
    setOpenNode(null);
    setSlide(0);
  };

  // ── Shared styles (theme-aware, matching the classic settings screen) ──
  const inputCls = isLightMode
    ? 'w-full bg-white border border-gray-300 px-3 py-2 text-sm font-["Departure_Mono",monospace] text-gray-900 focus:border-[#00dc82]/60 focus:outline-none transition-colors rounded'
    : 'w-full bg-[#0a0a0f] border border-[#1e1e2d] px-3 py-2 text-sm font-["Departure_Mono",monospace] text-white focus:border-[#39ff14]/40 focus:outline-none transition-colors';
  const labelCls = isLightMode
    ? 'text-xs font-["Departure_Mono",monospace] text-gray-600 mb-1 block'
    : 'text-xs font-["Departure_Mono",monospace] text-gray-500 mb-1 block';
  const btnCls = isLightMode
    ? 'px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 text-xs font-["Departure_Mono",monospace] hover:bg-gray-200 transition-colors disabled:opacity-50 rounded'
    : 'px-3 py-1.5 bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20 text-xs font-["Departure_Mono",monospace] hover:bg-[#39ff14]/20 transition-colors disabled:opacity-50';
  const primaryBtnCls =
    "px-3 py-1.5 bg-[#00dc82] text-black text-xs font-[\"Departure_Mono\",monospace] hover:bg-[#00dc82]/90 transition-colors disabled:opacity-50";
  const cardCls = isLightMode
    ? "border border-gray-200 bg-white rounded-lg"
    : "border border-[#1e1e2d] bg-[#0a0a0f] rounded-lg";
  const textMuted = isLightMode ? "text-gray-500" : "text-gray-500";
  const textAccent = isLightMode ? "text-emerald-700" : "text-[#39ff14]";

  // ── Field render helpers ──
  const renderField = (opts: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    hint?: string;
    placeholder?: string;
    type?: "text" | "password";
    fieldId?: string;
  }) => {
    const isSecret = opts.type === "password";
    const revealed =
      isSecret && opts.fieldId && revealedFields.has(opts.fieldId);
    const toggleReveal =
      isSecret && opts.fieldId
        ? () => {
            const next = new Set(revealedFields);
            if (revealed) next.delete(opts.fieldId!);
            else next.add(opts.fieldId!);
            setRevealedFields(next);
          }
        : undefined;
    return (
      <div>
        <label className={labelCls}>{opts.label}</label>
        <div className="relative">
          <input
            type={revealed ? "text" : (opts.type || "text")}
            className={inputCls + (isSecret ? " pr-10" : "")}
            value={opts.value}
            placeholder={opts.placeholder}
            onChange={(e) => opts.onChange(e.target.value)}
          />
          {isSecret && toggleReveal && (
            <button
              type="button"
              data-a2a-nav
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 ${isLightMode ? "text-gray-500 hover:text-gray-700" : "text-gray-500 hover:text-gray-300"}`}
              onClick={toggleReveal}
              title={revealed ? "Hide" : "Show"}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
        {opts.hint && (
          <p className={`text-[10px] font-mono ${textMuted} mt-1`}>{opts.hint}</p>
        )}
      </div>
    );
  };

  const renderTextarea = (opts: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    hint?: string;
    placeholder?: string;
    rows?: number;
  }) => (
    <div>
      <label className={labelCls}>{opts.label}</label>
      <textarea
        className={inputCls + " resize-none"}
        rows={opts.rows || 3}
        value={opts.value}
        placeholder={opts.placeholder}
        onChange={(e) => opts.onChange(e.target.value)}
      />
      {opts.hint && (
        <p className={`text-[10px] font-mono ${textMuted} mt-1`}>{opts.hint}</p>
      )}
    </div>
  );

  // ── Identity readiness (drives the canvas pill + review slide) ──
  const identityChecks = [
    {
      label: "Bot user chosen",
      done: !!(settings.botUserId && settings.accessToken),
    },
    { label: "Agent name", done: !!settings.agentName },
    { label: "Agent description", done: !!settings.agentDescription },
  ];
  const identityDone = identityChecks.filter((c) => c.done).length;
  const identityReady = identityDone === identityChecks.length;

  // ── Node unlocking — every node is ALWAYS VISIBLE on the canvas, but dimmed
  // and non-clickable until its prerequisites are complete. New nodes plug in
  // here as they're added to the wizard. ──
  const nodeUnlocked: Record<NodeId, boolean> = {
    identity: true, // the starting step — always unlocked
    website: identityReady, // requires Agent Identity complete
    cloudmirror:
      identityReady && !!settings.agentUrl, // requires Identity + Website endpoint
  };

  // ── Canvas — one centered node for now: Agent Identity ──
  // Same pure-SVG canvas style (octagonal nodes, glow, ring) as the original
  // wizard; future steps will join the canvas as they're reorganized here.
  const renderCanvas = () => {
    const titleFill = isLightMode ? "#1f2937" : "#e5e7eb";
    const subFill = isLightMode ? "#9ca3af" : "#6b7280";
    const GREY = isLightMode ? "#9ca3af" : "#6b7280";
    const GREEN = "#39ff14";
    const NODE = { cx: 500, cy: 420, w: 260, h: 180, c: 24, ring: 230 };
    const WEBSITE = { x: 500, y: 110, w: 240, h: 120, c: 18 };
    const MIRROR = { x: 800, y: 420, w: 250, h: 130, c: 18 };
    const websiteDone = !!settings.agentUrl;
    const websiteHovered = hoverNode === "Deploy to Website";
    const websiteActive = websiteHovered || websiteDone;
    const mirrorLocked = !nodeUnlocked.cloudmirror;
    const mirrorDeployed =
      settings.deployStatus === "deployed" || !!settings.lastDeployedAt;
    const mirrorHovered = hoverNode === "Agent Cloud Mirror";
    const mirrorActive = !mirrorLocked && (mirrorHovered || mirrorDeployed);

    const renderOctNode = (opts: {
      x: number;
      y: number;
      w: number;
      h: number;
      c: number;
      icon: "bot" | "globe" | "cloud";
      iconSize: number;
      title: string;
      titleSize: number;
      titleY: number;
      sub?: string;
      subY?: number;
      subSize?: number;
      pill?: { text: string; done: boolean };
      pillY?: number;
      active: boolean;
      hovered: boolean;
      glow?: boolean;
      locked?: boolean;
      lockHint?: string;
      onClick: () => void;
    }) => {
      const Icon = ICONS[opts.icon];
      const strokeColor = opts.active ? GREEN : GREY;
      const textW = opts.title.length * opts.titleSize * 0.62;
      const rowW = opts.iconSize + 10 + textW;
      const rowX = opts.x - rowW / 2;
      const iconCX = rowX + opts.iconSize / 2;
      const textX = rowX + opts.iconSize + 10;
      return (
        <g
          onClick={opts.locked ? undefined : opts.onClick}
          onMouseEnter={() => {
            if (!opts.locked) setHoverNode(opts.title);
          }}
          onMouseLeave={() => setHoverNode(null)}
          style={{
            cursor: opts.locked ? "not-allowed" : "pointer",
            opacity: opts.locked ? 0.35 : 1,
            transition: "opacity 200ms ease",
          }}
        >
          {opts.locked && opts.lockHint && <title>{opts.lockHint}</title>}
          {opts.glow && (
            <g transform={`translate(${opts.x - opts.w / 2} ${opts.y - opts.h / 2})`}>
              <polygon
                points={octPath(opts.w, opts.h, opts.c)}
                fill="none"
                stroke={GREEN}
                strokeWidth={3}
                opacity={0.3}
                filter="url(#a2a2-node-glow)"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          <g transform={`translate(${opts.x - opts.w / 2} ${opts.y - opts.h / 2})`}>
            <polygon
              points={octPath(opts.w, opts.h, opts.c)}
              fill={
                opts.active
                  ? isLightMode
                    ? `${GREEN}1f`
                    : `${GREEN}17`
                  : isLightMode
                    ? `${GREY}1f`
                    : `${GREY}17`
              }
              stroke={strokeColor}
              strokeWidth={opts.hovered ? 2.5 : 1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ transition: "stroke 150ms ease, fill 150ms ease" }}
            />
          </g>
          <g transform={`translate(${iconCX} ${opts.y + opts.titleY})`}>
            <g
              transform={`scale(${opts.iconSize / 24}) translate(-12 -12)`}
              stroke={strokeColor}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Icon />
            </g>
          </g>
          <text
            x={textX}
            y={opts.y + opts.titleY}
            textAnchor="start"
            dominantBaseline="central"
            fill={titleFill}
            style={{
              fontFamily: "Departure_Mono, monospace",
              fontSize: opts.titleSize,
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {opts.title}
          </text>
          {opts.sub && (
            <text
              x={opts.x}
              y={opts.y + (opts.subY ?? 0)}
              textAnchor="middle"
              fill={subFill}
              style={{
                fontFamily: "Departure_Mono, monospace",
                fontSize: opts.subSize ?? 11,
              }}
            >
              {opts.sub}
            </text>
          )}
          {opts.pill && (
            <g transform={`translate(${opts.x} ${opts.y + (opts.pillY ?? 0)})`}>
              <rect
                x={-52}
                y={-11}
                width={104}
                height={22}
                rx={11}
                fill={
                  opts.pill.done
                    ? isLightMode
                      ? "#d1fae5"
                      : "rgba(0,220,130,0.15)"
                    : isLightMode
                      ? "#fef3c7"
                      : "rgba(251,191,36,0.15)"
                }
                stroke={
                  opts.pill.done
                    ? isLightMode
                      ? "#34d399"
                      : "rgba(0,220,130,0.4)"
                    : isLightMode
                      ? "#fbbf24"
                      : "rgba(251,191,36,0.4)"
                }
                strokeWidth={1}
              />
              <text
                textAnchor="middle"
                y={4}
                fill={
                  opts.pill.done
                    ? isLightMode
                      ? "#047857"
                      : "#00dc82"
                    : isLightMode
                      ? "#92400e"
                      : "#fbbf24"
                }
                style={{
                  fontFamily: "Departure_Mono, monospace",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {opts.pill.text}
              </text>
            </g>
          )}
        </g>
      );
    };

    const identityHovered = hoverNode === "Agent Identity";
    const websiteLocked = !nodeUnlocked.website;

    return (
      <svg
        viewBox="0 0 1000 700"
        className="w-full h-auto block"
        style={{ maxWidth: 720 }}
      >
        <defs>
          <filter id="a2a2-node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {([GREEN, GREY] as const).map((color) => (
            <marker
              key={color}
              id={`a2a2-arrow-${color.replace("#", "")}`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
            </marker>
          ))}
        </defs>

        {/* Decorative ring + satellite dots (visual consistency) */}
        <circle
          cx={NODE.cx}
          cy={NODE.cy}
          r={NODE.ring}
          fill="none"
          stroke={GREY}
          strokeWidth={1}
          strokeDasharray="4 6"
          opacity={0.35}
        />
        {[45, 135, 225, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={NODE.cx + NODE.ring * Math.cos(rad)}
              cy={NODE.cy + NODE.ring * Math.sin(rad)}
              r={4}
              fill={GREY}
              opacity={0.4}
            />
          );
        })}

        {/* Connector: identity top edge → website bottom edge (dimmed while locked) */}
        <line
          x1={NODE.cx}
          y1={NODE.cy - NODE.h / 2}
          x2={WEBSITE.x}
          y2={WEBSITE.y + WEBSITE.h / 2}
          stroke={websiteDone ? GREEN : GREY}
          strokeWidth={1.5}
          opacity={websiteLocked ? 0.18 : websiteDone ? 0.6 : 0.35}
          markerEnd={`url(#a2a2-arrow-${(websiteDone ? GREEN : GREY).replace("#", "")})`}
        />

        {/* Connector: identity right edge → cloud mirror left edge (dimmed while locked) */}
        <line
          x1={NODE.cx + NODE.w / 2}
          y1={NODE.cy}
          x2={MIRROR.x - MIRROR.w / 2}
          y2={MIRROR.y}
          stroke={mirrorDeployed ? GREEN : GREY}
          strokeWidth={1.5}
          opacity={mirrorLocked ? 0.18 : mirrorDeployed ? 0.6 : 0.35}
          markerEnd={`url(#a2a2-arrow-${(mirrorDeployed ? GREEN : GREY).replace("#", "")})`}
        />

        {/* Center — Agent Identity */}
        {renderOctNode({
          x: NODE.cx,
          y: NODE.cy,
          w: NODE.w,
          h: NODE.h,
          c: NODE.c,
          icon: "bot",
          iconSize: 28,
          title: "Agent Identity",
          titleSize: 16,
          titleY: -34,
          sub: "Who your agent is",
          subY: -4,
          subSize: 11,
          pill: {
            text: identityReady
              ? "✓ Ready"
              : `${identityDone}/${identityChecks.length} configured`,
            done: identityReady,
          },
          pillY: 26,
          active: identityReady || identityHovered,
          hovered: identityHovered,
          glow: true,
          onClick: () => openNodeModal("identity"),
        })}

        {/* Top — Deploy to Website (dimmed + locked until Agent Identity is complete) */}
        {renderOctNode({
          x: WEBSITE.x,
          y: WEBSITE.y,
          w: WEBSITE.w,
          h: WEBSITE.h,
          c: WEBSITE.c,
          icon: "globe",
          iconSize: 22,
          title: "Deploy to Website",
          titleSize: 13,
          titleY: -14,
          sub: websiteLocked
            ? "🔒 Finish Agent Identity"
            : websiteDone
              ? "✓ Endpoint set"
              : "Widget + endpoint",
          subY: 16,
          subSize: 10,
          active: !websiteLocked && websiteActive,
          hovered: !websiteLocked && websiteHovered,
          locked: websiteLocked,
          lockHint: `Locked — complete "Agent Identity" first (${identityDone}/${identityChecks.length} configured)`,
          onClick: () => openNodeModal("website"),
        })}

        {/* Right — Agent Cloud Mirror (dimmed + locked until Identity AND the
            website endpoint are set; this is the always-on cloud step) */}
        {renderOctNode({
          x: MIRROR.x,
          y: MIRROR.y,
          w: MIRROR.w,
          h: MIRROR.h,
          c: MIRROR.c,
          icon: "cloud",
          iconSize: 22,
          title: "Agent Cloud Mirror",
          titleSize: 13,
          titleY: -22,
          sub: mirrorLocked
            ? "🔒 Finish Deploy to Website"
            : mirrorDeployed
              ? "✓ Always-on"
              : "Mirror + 2 Supabase DBs",
          subY: 2,
          subSize: 10,
          pill: mirrorLocked
            ? undefined
            : {
                text: mirrorDeployed ? "✓ Deployed" : "Not deployed",
                done: mirrorDeployed,
              },
          pillY: 30,
          active: mirrorActive,
          hovered: !mirrorLocked && mirrorHovered,
          locked: mirrorLocked,
          lockHint:
            'Locked — complete "Agent Identity" and set your A2A endpoint in "Deploy to Website" first',
          onClick: () => openNodeModal("cloudmirror"),
        })}
      </svg>
    );
  };

  // ── AI Assistant (replaces the old Setup Guide markdown sidebar) ──

  // Load the recipe once, when the assistant is first opened. Recipes are
  // the assistant's ONLY knowledge source — no more giant setup-guide reader.
  const ensureRecipe = useCallback(async (): Promise<string> => {
    if (recipeText !== null) return recipeText;
    try {
      const res = await fetch(
        `/api/inventions/${invention.id}/resource/recipes/a2a-setup.md`,
      );
      const text = res.ok ? await res.text() : "";
      setRecipeText(text);
      return text;
    } catch {
      setRecipeText("");
      return "";
    }
  }, [invention.id, recipeText]);

  // Secret values never go to the model — only set/not-set.
  const maskSecret = (v: unknown): string => (v ? "(set)" : "(not set)");

  // Fresh server-side truth: the project's config.json. The component can't
  // read ~/.mother-brain directly, but the MB app serves that exact file via
  // GET /api/inventions/{id}?projectId=… — the same endpoint persist() uses.
  const fetchProjectConfigSnapshot = useCallback(
    async (): Promise<Record<string, unknown> | null> => {
      const pid = settings.primaryProjectId || activeProjectId;
      if (!pid) return null;
      try {
        const res = await fetch(
          `/api/inventions/${invention.id}?projectId=${encodeURIComponent(pid)}`,
        );
        if (!res.ok) return null;
        const inv = await res.json();
        return inv?.settings && typeof inv.settings === "object"
          ? (inv.settings as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    },
    [invention.id, settings.primaryProjectId, activeProjectId],
  );

  const buildSystemPrompt = (opts: {
    recipe: string;
    slides: { title: string; desc: string }[];
    slideIndex: number;
    serverSettings: Record<string, unknown> | null;
  }) => {
    const { recipe, slides, slideIndex, serverSettings } = opts;
    const cfg = serverSettings || {};
    // Prefer the fresh server value; fall back to local state, then "(empty)".
    const g = (k: string): string => {
      const v =
        cfg[k] !== undefined && cfg[k] !== ""
          ? cfg[k]
          : (settings as Record<string, unknown>)[k];
      if (v === undefined || v === null || v === "") return "(empty)";
      if (typeof v === "string") return v;
      return String(v);
    };
    const projectName =
      projects.find(
        (p) => p.id === (settings.primaryProjectId || activeProjectId),
      )?.name ||
      settings.primaryProjectId ||
      activeProjectId ||
      "unknown";
    const stepMap = slides
      .map(
        (s, i) => `${i + 1}. ${s.title}${i === slideIndex ? "  ← CURRENT STEP" : ""}`,
      )
      .join("\n");
    const current = slides[slideIndex] || slides[slides.length - 1];
    const checklist = identityChecks
      .map((c) => `- ${c.label}: ${c.done ? "done" : "not done"}`)
      .join("\n");
    return [
      "You are the built-in Setup Assistant inside the A2A Agent \"Wizard 2\" screen in the Mother Brain app.",
      "You guide the user through the Wizard 2 setup steps for ONE project's A2A Agent.",
      "",
      "WIZARD STEP MAP:",
      stepMap,
      "",
      `The user is CURRENTLY ON Step ${slideIndex + 1} of ${slides.length}: "${current.title}" — ${current.desc}`,
      "Tailor every answer to this step. When it looks complete, offer to move to the next step.",
      "",
      "IDENTITY CHECKLIST:",
      checklist,
      "",
      "LIVE PROJECT CONFIG (from this project's config.json — secrets masked; treat as truth):",
      `- Project: ${projectName}`,
      `- Bot user: ${g("botUserEmail")}`,
      `- Agent Name: ${g("agentName")}`,
      `- Agent Description: ${g("agentDescription")}`,
      `- Provider: ${g("agentProvider")}`,
      `- Access token: ${maskSecret(cfg.accessToken ?? settings.accessToken)}`,
      `- Gateway URL: ${g("gatewayBaseUrl")}`,
      `- Gateway token: ${maskSecret(cfg.gatewayToken ?? settings.gatewayToken)}`,
      `- AI model: ${g("aiModel")}`,
      `- Local chat DB: ${g("localPgStatus")}`,
      `- Deploy status: ${g("deployStatus")}`,
      `- Website URL: ${g("websiteUrl")}`,
      "",
      "OFFICIAL SETUP KNOWLEDGE (the A2A setup recipe — ground your answers in this):",
      "<recipe>",
      recipe || "(recipe unavailable — rely on general A2A Agent knowledge)",
      "</recipe>",
      "",
      "Rules:",
      "- Be concise and friendly. Short paragraphs or small lists. Never dump giant markdown walls.",
      "- Explain fields simply: what they are, why they matter, and good examples.",
      "- Stay grounded in the recipe and the live config above; never contradict them or invent values.",
      "- You may pre-fill fields: when you propose a concrete value, ALSO emit a line exactly like [[SET:agentName=Ava]] on its own. Allowed fields: agentName, agentDescription, agentProvider. The wizard turns those tags into one-click Apply buttons.",
      "- Keep the visible sentence natural; the tags are stripped from what the user reads.",
      "- Never output secrets or tokens, never invent API keys.",
    ].join("\n");
  };

  // The MB app's own server serves an OpenAI-compatible router at
  // /v1/chat/completions. It authenticates with the app's MASTER API key
  // (from /api/settings/global) + X-Mother-Brain-Project routing header —
  // both are in the local server's CORS allow-list, so browser calls pass.
  // Cached for the session; the key doesn't rotate mid-session.
  const masterKeyRef = useRef<string | null>(null);
  const fetchMasterKey = useCallback(async (): Promise<string> => {
    if (masterKeyRef.current !== null) return masterKeyRef.current;
    try {
      const res = await fetch("/api/settings/global");
      if (res.ok) {
        const g = await res.json();
        masterKeyRef.current = g.masterApiKey || g.apiKey || "";
        return masterKeyRef.current;
      }
    } catch {}
    masterKeyRef.current = "";
    return "";
  }, []);

  // Shared LLM call — local app server first, then localhost direct, then
  // the cloud gateway (bot token, NO custom X- headers — the gateway's CORS
  // allow-list only permits Content-Type + Authorization). Used by BOTH the
  // setup assistant and the skills AI-suggest.
  const chatComplete = async (
    messages: { role: string; content: string }[],
    maxTokens?: number,
  ): Promise<string> => {
    const projectId = settings.primaryProjectId || activeProjectId;
    const masterKey = await fetchMasterKey();
    const cloudToken = settings.gatewayToken || settings.accessToken;
    const cloudBase = (settings.gatewayBaseUrl || "").replace(/\/+$/, "");
    const candidates: {
      label: string;
      url: string;
      headers: Record<string, string>;
    }[] = [];
    if (masterKey && projectId) {
      candidates.push(
        {
          label: "local",
          url: "/v1/chat/completions",
          headers: {
            Authorization: `Bearer ${masterKey}`,
            "X-Mother-Brain-Project": projectId,
          },
        },
        {
          label: "local-direct",
          url: "http://localhost:3100/v1/chat/completions",
          headers: {
            Authorization: `Bearer ${masterKey}`,
            "X-Mother-Brain-Project": projectId,
          },
        },
      );
    }
    if (cloudToken && cloudBase) {
      candidates.push({
        label: "gateway",
        url: `${cloudBase}/v1/chat/completions`,
        headers: { Authorization: `Bearer ${cloudToken}` },
      });
    }
    if (candidates.length === 0) throw new Error("no-gateway");

    let lastErr = "";
    for (const c of candidates) {
      try {
        const res = await fetch(c.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...c.headers },
          body: JSON.stringify({
            model: settings.aiModel || "default",
            messages,
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
            ...(typeof settings.cfTemperature === "number"
              ? { temperature: settings.cfTemperature }
              : {}),
          }),
        });
        if (!res.ok) {
          lastErr = `${c.label}: HTTP ${res.status}`;
          continue;
        }
        const data = await res.json();
        const r = data?.choices?.[0]?.message?.content;
        if (!r) {
          lastErr = `${c.label}: empty response`;
          continue;
        }
        return r as string;
      } catch (e) {
        lastErr = `${c.label}: ${(e as Error).message}`;
      }
    }
    throw new Error(lastErr || "all endpoints failed");
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    const nextMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: text },
    ];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatSending(true);
    try {
      const recipe = await ensureRecipe();
      const slides = identitySlides();
      const idx = Math.min(slide, slides.length - 1);
      const serverSettings = await fetchProjectConfigSnapshot();
      const messagesPayload = [
        {
          role: "system",
          content: buildSystemPrompt({
            recipe,
            slides,
            slideIndex: idx,
            serverSettings,
          }),
        },
        ...nextMessages.map((m) => ({ role: m.role, content: m.content })),
      ];
      const reply = await chatComplete(
        messagesPayload,
        settings.cfMaxTokens || 1024,
      );
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      const message =
        (err as Error).message === "no-gateway"
          ? "I can't reach the AI Router yet. Open **MB App Settings** (the master API key lives there), or select a **Bot User** on step 1 so a gateway token exists — then ask me again."
          : `Assistant error: ${(err as Error).message}. Try again in a moment.`;
      setChatMessages((prev) => [...prev, { role: "assistant", content: message }]);
    } finally {
      setChatSending(false);
    }
  };

  // ── AI skill suggestions — powered by the same local-first LLM path ──
  const aiSuggestSkills = async () => {
    setAiSuggestingOpen(true);
    setAiSuggestingLoading(true);
    setSelectedSuggestionIds(new Set());
    try {
      const existing = (settings.skills as Skill[]) || [];
      const sys = [
        "You suggest A2A Agent Card skills. Reply with ONLY a JSON array — no prose, no code fences.",
        'Each element: {"id": "kebab-case-id", "name": string, "description": one sentence, "tags": [2-4 short tags], "examples": [2 example user requests], "inputModes": ["text/plain"], "outputModes": ["text/plain"]}.',
        "Suggest 3-5 skills. Do not duplicate existing skills.",
        `Existing skills: ${JSON.stringify(existing.map((s) => s.name))}`,
        `Agent description: ${settings.agentDescription || "(not set)"}`,
      ].join("\n");
      const reply = await chatComplete(
        [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Suggest Agent Card skills for an agent named "${settings.agentName || "AI Assistant"}".`,
          },
        ],
        2000,
      );
      const jsonText = (reply.match(/\[[\s\S]*\]/) || [reply])[0];
      const parsed = JSON.parse(jsonText);
      setAiSkillSuggestions(
        Array.isArray(parsed)
          ? parsed.filter((s) => s && typeof s.name === "string")
          : [],
      );
    } catch {
      setAiSkillSuggestions([]);
    } finally {
      setAiSuggestingLoading(false);
    }
  };

  const addSelectedSuggestions = () => {
    const chosen = aiSkillSuggestions.filter((s) =>
      selectedSuggestionIds.has(s.id || s.name),
    );
    if (chosen.length === 0) return;
    const added: Skill[] = chosen.map((s, i) => ({
      id: s.id || `skill-${Date.now()}-${i}`,
      name: s.name,
      description: s.description || "",
      tags: Array.isArray(s.tags) ? s.tags : [],
      examples: Array.isArray(s.examples) ? s.examples : [],
      inputModes: Array.isArray(s.inputModes) ? s.inputModes : ["text/plain"],
      outputModes: Array.isArray(s.outputModes) ? s.outputModes : ["text/plain"],
    }));
    updateField("skills", [...((settings.skills as Skill[]) || []), ...added]);
    setAiSuggestingOpen(false);
    setAiSkillSuggestions([]);
    setSelectedSuggestionIds(new Set());
  };

  const applySuggestion = (msgIndex: number, s: FieldSuggestion) => {
    if (!SUGGESTABLE_FIELDS[s.field]) return;
    updateField(s.field, s.value);
    const key = `${msgIndex}:${s.field}`;
    setAppliedSuggestions((prev) => new Set([...prev, key]));
  };

  // Auto-scroll the thread to the latest message.
  useEffect(() => {
    const el = chatThreadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatSending, assistantOpen]);

  const renderAssistantPanel = () => (
    <div
      className={`h-full flex flex-col shrink-0 transition-all duration-300 ease-out ${
        assistantOpen
          ? isLightMode
            ? "border-r border-gray-200 bg-gray-50"
            : "border-r border-[#1e1e2d] bg-[#0a0a0f]"
          : "w-0 border-r-0 overflow-hidden opacity-0"
      }`}
      style={{ width: assistantOpen ? "max(30vw, 320px)" : "0" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Assistant header — shows the step context the model receives */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
      >
        <div className="min-w-0">
          <p
            className={`text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 ${textAccent}`}
          >
            <Sparkles size={11} /> Setup Assistant
          </p>
          {openNode &&
            (() => {
              const sl = slidesFor(openNode);
              const cur = sl[Math.min(slide, sl.length - 1)];
              return (
                <p
                  className={`text-[9px] font-mono mt-0.5 truncate ${textMuted}`}
                  title="Injected into every message: current step, step map, checklist, recipe, and this project's config (secrets masked)"
                >
                  Step {Math.min(slide, sl.length - 1) + 1}/{sl.length} · {cur?.title} · recipe + project config
                </p>
              );
            })()}
        </div>
        <button
          type="button"
          data-a2a-nav
          className={btnCls}
          onClick={() => {
            setChatMessages([GREETING]);
            setAppliedSuggestions(new Set());
          }}
          title="Reset the conversation"
        >
          <RefreshCw size={10} /> Reset
        </button>
      </div>

      {/* Thread */}
      <div
        ref={chatThreadRef}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3"
      >
        {chatMessages.map((m, i) => {
          const suggestions =
            m.role === "assistant" ? parseSuggestions(m.content) : [];
          const body = m.role === "assistant" ? stripSuggestions(m.content) : m.content;
          return (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex flex-col gap-2"}>
              <div
                className={
                  m.role === "user"
                    ? `max-w-[85%] rounded-lg px-3 py-2 text-[11px] font-mono ${isLightMode ? "bg-emerald-100 text-gray-900" : "bg-[#39ff14]/10 text-gray-100"}`
                    : `rounded-lg px-3 py-2 text-[11px] font-mono leading-relaxed ${isLightMode ? "bg-white border border-gray-200 text-gray-700" : "bg-[#0d0d14] border border-[#1e1e2d] text-gray-300"}`
                }
              >
                {m.role === "assistant" ? (
                  <FastMarkdown content={body} variant="chat" />
                ) : (
                  body
                )}
              </div>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-1">
                  {suggestions.map((s, j) => {
                    const applied = appliedSuggestions.has(`${i}:${s.field}`);
                    return (
                      <button
                        key={j}
                        type="button"
                        data-a2a-nav
                        className={
                          applied
                            ? primaryBtnCls + " flex items-center gap-1"
                            : btnCls + " flex items-center gap-1"
                        }
                        onClick={() => applySuggestion(i, s)}
                        disabled={applied}
                        title={`Sets ${SUGGESTABLE_FIELDS[s.field]} in your shared settings`}
                      >
                        {applied ? (
                          <>
                            <Check size={10} /> Applied
                          </>
                        ) : (
                          <>
                            <Wand2 size={10} /> Apply {SUGGESTABLE_FIELDS[s.field]}:{" "}
                            {s.value.length > 24 ? s.value.slice(0, 24) + "…" : s.value}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {chatSending && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500 pl-1">
            <Loader2 size={11} className="animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        className={`px-3 py-3 border-t shrink-0 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
      >
        <div className="flex items-end gap-2">
          <textarea
            className={inputCls + " resize-none text-xs"}
            rows={2}
            value={chatInput}
            placeholder="Ask about this step, or describe your business…"
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChat();
              }
            }}
          />
          <button
            type="button"
            data-a2a-nav
            className={primaryBtnCls + " flex items-center gap-1 shrink-0"}
            onClick={sendChat}
            disabled={chatSending || !chatInput.trim()}
            title="Send"
          >
            {chatSending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
          </button>
        </div>
        <p className={`text-[9px] font-mono ${textMuted} mt-1.5`}>
          Powered by your default chat LLM · knows your step + project config (recipe-grounded)
        </p>
      </div>
    </div>
  );

  // ── Agent Card preview (same data the Settings screen shows) ──
  const renderAgentCardPreview = () => {
    const skills = (settings.skills as Skill[]) || [];
    return (
      <div className="space-y-3">
        <p className={`text-[11px] font-mono leading-relaxed ${isLightMode ? "text-gray-600" : "text-gray-500"}`}>
          Well-known A2A agent card served at{" "}
          <code className={isLightMode ? "text-emerald-700" : "text-[#39ff14]"}>
            /.well-known/agent.json
          </code>
          . External agents use this to discover your agent's capabilities.
        </p>
        <div
          className={`border p-4 space-y-3 ${isLightMode ? "bg-gray-50 border-gray-200" : "bg-[#13131f] border-[#1e1e2d]"}`}
        >
          <div
            className={`flex items-center justify-between border-b pb-3 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-semibold ${isLightMode ? "text-gray-900" : "text-white"}`}>
                  {settings.agentName || AGENT_CARD.name}
                </span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 ${isLightMode ? "text-emerald-700 bg-emerald-50" : "text-[#39ff14]/60 bg-[#39ff14]/10"}`}>
                  v{AGENT_CARD.version}
                </span>
              </div>
              <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                {settings.agentDescription || AGENT_CARD.description}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono text-gray-500">{AGENT_CARD.preferredTransport}</p>
              <p className="text-[10px] font-mono text-gray-600 mt-0.5">schema v{AGENT_CARD.schemaVersion}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Globe size={10} className="text-gray-500" />
            <code className={`text-[10px] font-mono ${isLightMode ? "text-emerald-700" : "text-[#39ff14]"}`}>
              {settings.agentUrl || AGENT_CARD.url || "(endpoint not set)"}
            </code>
          </div>
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Capabilities</span>
            <div className="flex gap-2 mt-1 flex-wrap">
              {Object.entries(AGENT_CARD.capabilities).map(([key, val]) => (
                <span
                  key={key}
                  className={`text-[10px] font-mono px-2 py-0.5 border ${
                    val
                      ? isLightMode
                        ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                        : "text-[#39ff14] border-[#39ff14]/20 bg-[#39ff14]/5"
                      : isLightMode
                        ? "text-gray-400 border-gray-200 bg-white"
                        : "text-gray-600 border-[#1e1e2d] bg-[#0a0a0f]"
                  }`}
                >
                  {key}: {val ? "yes" : "no"}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Authentication</span>
            <div className="flex gap-2 mt-1">
              {AGENT_CARD.authentication.schemes.map((scheme) => (
                <span key={scheme} className="text-[10px] font-mono px-2 py-0.5 border border-[#ff3d7f]/20 bg-[#ff3d7f]/5 text-[#ff3d7f]">
                  {scheme}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
              Skills ({(skills.length > 0 ? skills : AGENT_CARD.skills).length})
            </span>
            <div className="mt-1.5 space-y-1.5">
              {(skills.length > 0 ? skills : AGENT_CARD.skills).map((skill) => (
                <div key={skill.id} className={`p-2 border ${isLightMode ? "bg-white border-gray-200" : "bg-[#0a0a0f] border-[#1e1e2d]"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono ${isLightMode ? "text-emerald-700" : "text-[#39ff14]/80"}`}>{skill.id}</span>
                    <span className={`text-[11px] font-mono ${isLightMode ? "text-gray-900" : "text-white"}`}>{skill.name}</span>
                  </div>
                  <p className="text-[10px] font-mono text-gray-500 mt-0.5">{skill.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          data-a2a-nav
          className={btnCls + " flex items-center gap-1.5"}
          onClick={() => {
            navigator.clipboard.writeText(
              JSON.stringify(
                {
                  ...AGENT_CARD,
                  name: settings.agentName || AGENT_CARD.name,
                  description: settings.agentDescription || AGENT_CARD.description,
                  url: settings.agentUrl || AGENT_CARD.url,
                  provider: settings.agentProvider
                    ? { organization: settings.agentProvider }
                    : undefined,
                  skills: skills.length > 0 ? skills : AGENT_CARD.skills,
                },
                null,
                2,
              ),
            );
            setCopiedCard(true);
            setTimeout(() => setCopiedCard(false), 2000);
          }}
        >
          {copiedCard ? (
            <><Check size={11} /> Copied!</>
          ) : (
            <><Copy size={11} /> Copy JSON</>
          )}
        </button>
      </div>
    );
  };

  // ── Agent Identity slides (mirrored fields from the Settings screen) ──
  const identitySlides = (): Slide[] => {
    const selectedUser = projectUsers.find((u) => u.id === settings.botUserId);
    return [
      {
        title: "Choose the Bot User",
        desc: "The bot user IS your agent's identity — its name, bio, and access token flow into every field below. Same field as Settings → Agent Identity & Authentication.",
        body: (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Bot User (Agent Identity)</label>
              <ThemedSelect
                value={settings.botUserId || ""}
                onChange={(v) => handleBotUserSelect(v)}
                options={[
                  { value: "", label: "— Select a bot user —" },
                  ...(usersLoading
                    ? [{ value: "", label: "Loading users...", disabled: true }]
                    : []),
                  ...projectUsers.map((u) => ({
                    value: u.id,
                    label: `${u.name || u.email} (${u.role})`,
                  })),
                ]}
              />
              {selectedUser && (
                <p className={`text-[11px] font-mono mt-1 ${textAccent}`}>
                  Agent name: <strong>{selectedUser.name || selectedUser.email}</strong>
                </p>
              )}
              <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                Pick an AI Agent user from this project. Their name, bio, and access
                token auto-populate the next steps — exactly like the Settings screen.
                No agent users yet? Create one in Mother Brain under Project → Users.
              </p>
            </div>
          </div>
        ),
      },
      {
        title: "Name Your Agent",
        desc: "This name appears in the chat header, the Agent Card, and the deployed Worker (AGENT_NAME).",
        body: (
          <div className="space-y-3">
            {renderField({
              label: "Agent Name",
              value: settings.agentName,
              onChange: (v) => updateField("agentName", v),
              placeholder: "e.g. Ava, Support Bot, Knowledge Assistant",
              hint: "Auto-filled from the bot user — edit freely. Saved to the same field the Settings screen shows.",
            })}
          </div>
        ),
      },
      {
        title: "Describe Your Agent",
        desc: "One or two sentences about what your agent does. Deployed as AGENT_DESCRIPTION and shown in the Agent Card.",
        body: (
          <div className="space-y-3">
            {renderTextarea({
              label: "Agent Description",
              value: settings.agentDescription,
              onChange: (v) => updateField("agentDescription", v),
              placeholder: "e.g. Answers product questions and helps visitors get started.",
              hint: "Auto-filled from the bot user's bio if they have one. The assistant on the left can draft this for you.",
            })}
          </div>
        ),
      },
      {
        title: "Organization / Provider",
        desc: "Shown as the provider in the Agent Card. Usually your company or product name.",
        body: (
          <div className="space-y-3">
            {renderField({
              label: "Organization / Provider",
              value: settings.agentProvider,
              onChange: (v) => updateField("agentProvider", v),
              placeholder: "Your company name",
              hint: "Defaults to the agent name if left empty.",
            })}
          </div>
        ),
      },
      {
        title: "Access Token",
        desc: "The bot user's key for authenticating with the MCP Gateway. Auto-populated — rotate it anytime.",
        body: (
          <div className="space-y-3">
            {renderField({
              label: "Access Token",
              type: "password",
              fieldId: "accessToken",
              value: settings.accessToken,
              onChange: (v) => updateField("accessToken", v),
              placeholder: "mb_…",
              hint: "Auto-populated from the bot user. Never share it — it authenticates your agent.",
            })}
            <div className="flex gap-2 items-center">
              <button
                type="button"
                data-a2a-nav
                className={btnCls + " flex items-center gap-1.5"}
                onClick={handleRotateToken}
                disabled={
                  !settings.botUserId ||
                  !settings.primaryProjectId ||
                  rotatingToken
                }
              >
                <RefreshCw size={11} className={rotatingToken ? "animate-spin" : ""} />
                {rotatingToken
                  ? "Rotating…"
                  : settings.accessToken
                    ? "Rotate Token"
                    : "Generate Token"}
              </button>
              {!settings.botUserId && (
                <span className={`text-[10px] font-mono ${textMuted}`}>
                  Select a bot user first
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        title: "AI Model",
        desc: "Which LLM powers your agent. Defaults to your Mother Brain app's active LLM — no Cloudflare required.",
        body: (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>AI Model</label>
              <ThemedSelect
                value={settings.aiModel || "default"}
                onChange={(v) => updateField("aiModel", v)}
                options={[
                  { value: "default", label: "Default (MB Active LLM)" },
                  ...availableModels.map((m) => ({
                    value: m.model,
                    label: m.label,
                  })),
                ]}
              />
              <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                The model your agent uses for replies through the MCP Gateway. Add
                more models in MB App Settings. (Cloudflare Worker model settings
                live in the Agent Cloud Mirror step — they only matter once deployed.)
              </p>
            </div>
          </div>
        ),
      },
      {
        title: "Response Settings",
        desc: "How long and how creative your agent's replies are. Same fields as the Settings screen.",
        body: (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Max Tokens</label>
              <input
                type="number"
                min={128}
                max={8192}
                value={settings.cfMaxTokens ?? 1024}
                onChange={(e) =>
                  updateField("cfMaxTokens", parseInt(e.target.value) || 1024)
                }
                className={inputCls + " max-w-[160px]"}
              />
              <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                Maximum response tokens. Higher = longer replies. Default: 1024.
              </p>
            </div>
            <div>
              <label className={labelCls}>Temperature</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={settings.cfTemperature ?? 0.7}
                onChange={(e) =>
                  updateField("cfTemperature", parseFloat(e.target.value) ?? 0.7)
                }
                className={inputCls + " max-w-[160px]"}
              />
              <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                Creativity (0–2). Higher = more creative, lower = more
                deterministic. Default: 0.7.
              </p>
            </div>
          </div>
        ),
      },
      {
        title: "Vectorization",
        desc: "Embeddings for the agent's Chat DB — every visitor message is vectorized for eternal conversation recall (Total Recall). Same fields as Settings → Vectorization.",
        body: (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Embedding Provider</label>
              <ThemedSelect
                value={settings.embeddingProvider || "voyage-ai"}
                onChange={(v) => updateField("embeddingProvider", v)}
                options={[
                  { value: "voyage-ai", label: "Voyage AI" },
                  { value: "openai", label: "OpenAI" },
                ]}
              />
              <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                Powers the Chat DB's vector memory (task_messages.embedding) and the
                offline knowledge-base fallback.
              </p>
            </div>
            <div>
              <label className={labelCls}>Model</label>
              <input
                type="text"
                className={inputCls}
                value={settings.embeddingModel || ""}
                onChange={(e) => updateField("embeddingModel", e.target.value)}
                placeholder="e.g., voyage-4-large"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className={labelCls + " mb-0!"}>API Key</label>
                <button
                  type="button"
                  data-a2a-nav
                  className={btnCls + " ml-auto flex items-center gap-1 shrink-0"}
                  onClick={fetchEmbedding}
                  disabled={embeddingFetching}
                  title="Auto-fill from the project's Embedding Configuration (Mother Brain → Project Settings)"
                >
                  {embeddingFetching ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <KeyRound size={12} />
                  )}
                  {embeddingFetching ? "Fetching…" : "Fetch"}
                </button>
              </div>
              <div className="relative">
                <input
                  type={revealedFields.has("embeddingApiKey") ? "text" : "password"}
                  className={inputCls + " pr-10"}
                  value={settings.embeddingApiKey || ""}
                  onChange={(e) => updateField("embeddingApiKey", e.target.value)}
                  placeholder="API key for embedding provider"
                />
                <button
                  type="button"
                  data-a2a-nav
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 ${isLightMode ? "text-gray-500 hover:text-gray-700" : "text-gray-500 hover:text-gray-300"}`}
                  onClick={() => {
                    const next = new Set(revealedFields);
                    if (next.has("embeddingApiKey")) next.delete("embeddingApiKey");
                    else next.add("embeddingApiKey");
                    setRevealedFields(next);
                  }}
                  title="Toggle visibility"
                >
                  {revealedFields.has("embeddingApiKey") ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
              </div>
            </div>
            <div>
              <label className={labelCls}>Vector Dimensions</label>
              <input
                type="number"
                className={inputCls + " max-w-[160px]"}
                value={settings.embeddingDimensions ?? 1024}
                onChange={(e) =>
                  updateField("embeddingDimensions", parseInt(e.target.value, 10) || 1024)
                }
              />
              <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                Must match the chat DB's vector column (default 1024 for voyage-4-large).
              </p>
            </div>
          </div>
        ),
      },
      {
        title: "Agent Skills",
        desc: "What your agent can do — published in the Agent Card. Same fields as the Settings screen.",
        body: (() => {
          const skillsArr = (settings.skills as Skill[]) || [];
          return (
            <div className="space-y-3">
              {skillsArr.map((skill, i) => (
                <div key={skill.id} className={`${cardCls} p-3 space-y-2`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono ${textAccent}`}>
                      {skill.id}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <button type="button" data-a2a-nav className={btnCls} disabled={i === 0} onClick={() => moveSkill(i, -1)} title="Move up">
                        <ArrowUp size={10} />
                      </button>
                      <button type="button" data-a2a-nav className={btnCls} disabled={i === skillsArr.length - 1} onClick={() => moveSkill(i, 1)} title="Move down">
                        <ArrowDown size={10} />
                      </button>
                      <button type="button" data-a2a-nav className={btnCls} onClick={() => removeSkill(i)} title="Remove">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  {renderField({
                    label: "Skill Name",
                    value: skill.name,
                    onChange: (v) => updateSkill(i, "name", v),
                  })}
                  {renderTextarea({
                    label: "Description",
                    value: skill.description,
                    onChange: (v) => updateSkill(i, "description", v),
                    rows: 2,
                  })}
                  {renderField({
                    label: "Tags (comma-separated)",
                    value: (skill.tags || []).join(", "),
                    onChange: (v) =>
                      updateSkill(
                        i,
                        "tags",
                        v.split(",").map((t) => t.trim()).filter(Boolean),
                      ),
                  })}
                  {renderTextarea({
                    label: "Example Requests (one per line)",
                    value: (skill.examples || []).join("\n"),
                    onChange: (v) =>
                      updateSkill(
                        i,
                        "examples",
                        v.split("\n").map((x) => x.trim()).filter(Boolean),
                      ),
                    rows: 2,
                  })}
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" data-a2a-nav className={btnCls + " flex items-center gap-1"} onClick={addSkill}>
                  <Plus size={11} /> Add Skill
                </button>
                <button
                  type="button"
                  data-a2a-nav
                  className={btnCls + " flex items-center gap-1"}
                  onClick={aiSuggestSkills}
                  disabled={aiSuggestingLoading}
                >
                  <Sparkles size={11} />
                  {aiSuggestingLoading ? "Suggesting…" : "AI Suggest Skills"}
                </button>
              </div>
              {aiSuggestingOpen && (
                <div className={`${cardCls} p-3 space-y-2`}>
                  <p className={`text-[10px] font-mono ${textMuted}`}>
                    AI-suggested skills — pick the ones you want:
                  </p>
                  {aiSuggestingLoading ? (
                    <p className="flex items-center gap-1.5 text-[11px] font-mono text-gray-500">
                      <Loader2 size={11} className="animate-spin" /> Thinking…
                    </p>
                  ) : aiSkillSuggestions.length === 0 ? (
                    <p className={`text-[10px] font-mono ${textMuted}`}>
                      No suggestions right now — try again in a moment.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {aiSkillSuggestions.map((s) => {
                          const key = s.id || s.name;
                          return (
                            <label
                              key={key}
                              className={`flex items-start gap-2 px-2 py-1 cursor-pointer ${isLightMode ? "hover:bg-gray-100" : "hover:bg-[#13131f]"}`}
                            >
                              <input
                                type="checkbox"
                                className="accent-[#39ff14] mt-0.5"
                                checked={selectedSuggestionIds.has(key)}
                                onChange={(e) => {
                                  const next = new Set(selectedSuggestionIds);
                                  if (e.target.checked) next.add(key);
                                  else next.delete(key);
                                  setSelectedSuggestionIds(next);
                                }}
                              />
                              <span className="text-[11px] font-mono">
                                <strong>{s.name}</strong> — {s.description}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        data-a2a-nav
                        className={primaryBtnCls + " flex items-center gap-1"}
                        disabled={selectedSuggestionIds.size === 0}
                        onClick={addSelectedSuggestions}
                      >
                        <Check size={11} /> Add {selectedSuggestionIds.size} selected
                      </button>
                    </>
                  )}
                </div>
              )}
              <p className={`text-[10px] font-mono ${textMuted}`}>
                Synced with the Settings screen and deployed as AGENT_SKILLS_JSON.
              </p>
            </div>
          );
        })(),
      },
      {
        title: "Project Access",
        desc: "Which Mother Brain projects your agent can read. Same rules as the Settings screen.",
        body: (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Primary Knowledge Base Project</label>
              <div
                className={inputCls + " opacity-70 cursor-not-allowed"}
                title="Locked — always the project the A2A Agent is activated for"
              >
                {projects.find(
                  (p) => p.id === (settings.primaryProjectId || activeProjectId),
                )?.name ||
                  settings.primaryProjectId ||
                  activeProjectId ||
                  "— No project —"}
              </div>
              <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                Locked to the current project. The A2A Agent is project-specific
                and always uses the project it is activated in as its primary
                knowledge source.
              </p>
            </div>
            <div>
              <label className={labelCls}>
                Additional Context Projects (Brainstorm Mode)
              </label>
              <div className="space-y-1.5 mt-1 max-h-40 overflow-y-auto">
                {projects.length === 0 && (
                  <p className={`text-[10px] font-mono ${textMuted}`}>
                    Loading projects…
                  </p>
                )}
                {projects.map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 px-2 py-1 transition-colors cursor-pointer ${isLightMode ? "hover:bg-gray-100" : "hover:bg-[#13131f]"}`}
                  >
                    <input
                      type="checkbox"
                      checked={(settings.additionalProjectIds || []).includes(p.id)}
                      onChange={(e) => {
                        const cur = settings.additionalProjectIds || [];
                        const ids = e.target.checked
                          ? [...cur, p.id]
                          : cur.filter((id) => id !== p.id);
                        updateField("additionalProjectIds", ids);
                      }}
                      className="accent-[#39ff14]"
                    />
                    <span className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
                      {p.name}
                    </span>
                    {(settings.primaryProjectId || activeProjectId) === p.id && (
                      <span className={`text-[10px] font-mono ml-auto ${isLightMode ? "text-emerald-600" : "text-[#39ff14]/60"}`}>
                        primary
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                Additional projects give the agent extra context when brainstorming.
              </p>
            </div>
          </div>
        ),
      },
      {
        title: "Agent Card & Review",
        desc: "Your complete agent identity — reviewed, then rendered as the world will discover it (/.well-known/agent.json).",
        body: (
          <div className="space-y-4">
            {/* Readiness checklist */}
            <div className="space-y-1">
              {identityChecks.map((c) => (
                <div key={c.label} className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-mono ${c.done ? textAccent : textMuted}`}
                  >
                    {c.done ? "✓" : "○"} {c.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Summary card */}
            <div className={`${cardCls} p-4 space-y-2`}>
              {[
                {
                  label: "Project",
                  value:
                    projects.find(
                      (p) =>
                        p.id ===
                        (settings.primaryProjectId || activeProjectId),
                    )?.name || settings.primaryProjectId || "—",
                },
                { label: "Bot User", value: settings.botUserEmail || "—" },
                { label: "Agent Name", value: settings.agentName || "—" },
                { label: "Description", value: settings.agentDescription || "—" },
                { label: "Provider", value: settings.agentProvider || "—" },
                {
                  label: "Access Token",
                  value: settings.accessToken ? "•••••• (set)" : "—",
                },
                {
                  label: "AI Model",
                  value: settings.aiModel || "default",
                },
                {
                  label: "Max Tokens / Temp",
                  value: `${settings.cfMaxTokens ?? 1024} / ${settings.cfTemperature ?? 0.7}`,
                },
                {
                  label: "Skills",
                  value: `${((settings.skills as Skill[]) || []).length} skill(s)`,
                },
                {
                  label: "Projects",
                  value: `${(settings.additionalProjectIds || []).length} additional`,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-3">
                  <span
                    className={`text-[10px] font-mono w-28 shrink-0 ${textMuted}`}
                  >
                    {row.label}
                  </span>
                  <span className="text-xs font-mono break-all">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Agent URL + the live card — the payoff */}
            {renderField({
              label: "Agent URL (A2A endpoint)",
              value: settings.agentUrl,
              onChange: (v) => updateField("agentUrl", v),
              placeholder: "https://your-agent.workers.dev",
              hint: "Where your agent is reachable over A2A. Filled automatically after you deploy — or set your own domain.",
            })}
            {renderAgentCardPreview()}

            <p className={`text-[10px] font-mono ${textMuted}`}>
              Everything above lives in the same shared settings as the classic screen —
              edit it anywhere, it stays in sync. Next steps (Knowledge Base, Deploy…)
              will be added to this wizard as we reorganize them — one step at a time.
            </p>
          </div>
        ),
      },
    ];
  };

  // ── Deploy to Website slides (Endpoint + Chat UI + Chat UI Widget from
  //    the Settings screen — local-first: works via the MCP Gateway without
  //    Cloudflare or Supabase) ──
  const websiteSlides = (): Slide[] => {
    const endpoint = settings.agentUrl || "https://a2a.yourdomain.com";
    const agentName = settings.agentName || "AI Assistant";
    const gradColor1 = settings.heroGradientColor1 || "#00dc82";
    const gradColor2 = settings.heroGradientColor2 || "#a78bfa";
    const branding = settings.widgetBranding || "";
    const logoUrl = settings.logoUrl || "";

    const snippetHtml = [
      "<!-- A2A Widget — React/TS source components -->",
      "import { HeroSearchHost, ChatApp } from './motherbrain-widget/src';",
      "import { useState } from 'react';",
      "",
      "function HeroSection() {",
      "  const [chatOpen, setChatOpen] = useState(false);",
      "  const [query, setQuery] = useState('');",
      "",
      "  return (",
      "    <>",
      "      {!chatOpen && (",
      "        <HeroSearchHost",
      '          endpoint="' + endpoint + '"',
      '          gradientColor1="' + gradColor1 + '"',
      '          gradientColor2="' + gradColor2 + '"',
      '          branding="' + branding + '"',
      "          onSubmit={(q) => { setQuery(q); setChatOpen(true); }}",
      "          onOpenChat={() => setChatOpen(true)}",
      "        />",
      "      )}",
      "      {chatOpen && (",
      "        <ChatApp",
      '          endpoint="' + endpoint + '"',
      '          agentName="' + agentName + '"',
      logoUrl ? '          logoUrl="' + logoUrl + '"' : null,
      "          initialQuery={query}",
      "          onClose={() => setChatOpen(false)}",
      "        />",
      "      )}",
      "    </>",
      "  );",
      "}",
    ]
      .filter(Boolean)
      .join("\n");

    const aiAgentPrompt = [
      "I have a motherbrain-widget.zip containing React/TypeScript source components.",
      "  src/ChatWidget.tsx         — RECOMMENDED: Drop-in widget with full hero → bar → overlay state machine",
      "  src/HeroSearchHost.tsx     — React wrapper that mounts <ne-hero-search>, fetches AI suggestions, shows continue button",
      "  src/HeroSearchElement.ts   — <ne-hero-search> web component (octagonal SVG search)",
      "  src/useHeroSuggestions.ts  — AI suggestions hook (fetches + caches)",
      "  src/ChatApp.tsx            — Resizable chat overlay panel (drag handle, adjustable height, collapse to bar)",
      "  src/BrainIcon.tsx          — Brain SVG logo",
      "  src/markdown.ts            — Custom markdown renderer",
      "  src/use-theme.ts           — Device theme hook (light/dark via prefers-color-scheme)",
      "  src/visitor-identity.ts    — Broprint.js visitor ID (shared localStorage key with website)",
      "  src/suggestion-cache.ts    — Persistent suggestion cache (localStorage, 24-item cap)",
      "  src/SuggestionsPreloader.tsx — Invisible preloader for first-visit suggestion generation",
      "  src/index.ts               — Re-exports all components",
      "",
      "## Integration Steps (Easiest — use ChatWidget):",
      "1. Unzip motherbrain-widget/ into the project (e.g. src/components/motherbrain-widget/)",
      "2. import { ChatWidget } from './motherbrain-widget/src'",
      "3. Render <ChatWidget endpoint='" + endpoint + "' /> — handles everything",
      "",
      "## Key Details:",
      "- Endpoint: " + endpoint,
      "- Agent Name: " + agentName,
      "- ChatWidget props: endpoint, agentName, agentDescription, branding, logoUrl, gradientColor1, gradientColor2, visitorId",
      "- ChatWidget manages hero → bar → overlay modes internally (no state wiring needed)",
      "- ChatApp: resizable panel with drag handle — drag up to expand, drag down to collapse",
      "- HeroSearchHost auto-fetches AI suggestions from visitor/suggestions endpoint",
      "- AI suggestions are cached in sessionStorage (no re-fetch on page navigation)",
      "- Hero Search is a web component — works in any framework, uses Shadow DOM",
      "- ChatApp is a React component — needs React 18+",
      "- No npm dependencies beyond react/react-dom",
      "- Markdown rendering is built-in (custom renderer, no external deps)",
      "",
      "## Important:",
      "- HeroSearchHost is the recommended entry point — it handles everything",
      "- For manual control: use useHeroSuggestions() hook + <ne-hero-search> directly",
      "- ChatApp is a controlled component — mount/unmount based on chat open state",
      "- The endpoint uses JSON-RPC 2.0 protocol (A2A standard)",
      "- Visitor IDs are auto-generated and persisted in localStorage",
      "- Chat history loads automatically from the endpoint on mount",
    ].join("\n");

    return [
      {
        title: "The A2A Endpoint",
        desc: "Where your website reaches the agent. No Cloudflare or Supabase needed yet — the endpoint talks to the MCP Gateway, which connects to your local Mother Brain app.",
        body: (() => {
          // Live status — exact mirror of the Settings Endpoint section.
          const endpointDotColor = healthChecking
            ? "bg-yellow-400 animate-pulse"
            : settings.lastEndpointPingOk
              ? "bg-[#39ff14]"
              : settings.lastEndpointPingAt
                ? "bg-red-500"
                : "bg-gray-600";
          const endpointLabel = healthChecking
            ? "Checking..."
            : settings.lastEndpointPingOk
              ? "Live"
              : settings.lastEndpointPingAt
                ? "Unreachable"
                : "Not checked";
          const endpointTextColor = healthChecking
            ? "text-yellow-400"
            : settings.lastEndpointPingOk
              ? "text-[#39ff14]"
              : settings.lastEndpointPingAt
                ? "text-red-400"
                : "text-gray-500";
          return (
            <div className="space-y-3">
              {/* A2A Endpoint URL — mirror of Settings → Endpoint */}
              <div>
                <label className={labelCls}>A2A Endpoint URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className={inputCls}
                    defaultValue={settings.agentUrl}
                    onBlur={(e) => updateField("agentUrl", e.target.value)}
                    placeholder="https://a2a.yourdomain.com"
                  />
                  <button
                    type="button"
                    data-a2a-nav
                    className={btnCls + " shrink-0"}
                    onClick={() => navigator.clipboard.writeText(settings.agentUrl)}
                    title="Copy URL"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>

              {/* Health check status row — mirror of Settings → Endpoint */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${endpointDotColor}`} />
                <span className={`text-xs font-mono ${endpointTextColor}`}>
                  {endpointLabel}
                </span>
                {settings.lastEndpointPingAt && !healthChecking && (
                  <span className="text-[10px] font-mono text-gray-600">
                    (checked {timeAgo(settings.lastEndpointPingAt)})
                  </span>
                )}
                <button
                  type="button"
                  data-a2a-nav
                  className="px-2 py-1 bg-[#1f1f1f] hover:bg-[#2a2a2a] disabled:opacity-50 text-gray-400 hover:text-white rounded text-[10px] border border-[#333] flex items-center gap-1 transition-colors ml-auto"
                  disabled={healthChecking}
                  onClick={runHealthCheck}
                  title="Re-run health check"
                >
                  {healthChecking ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <RefreshCw size={10} />
                  )}
                  Check Now
                </button>
              </div>

              {/* Manual Test Connection — mirror of Settings → Endpoint */}
              {settings.agentUrl && (
                <button
                  type="button"
                  data-a2a-nav
                  className="px-3 py-1.5 bg-[#1f1f1f] hover:bg-[#2a2a2a] disabled:opacity-50 text-white rounded text-xs border border-[#333] flex items-center gap-1.5 transition-colors"
                  disabled={isTestingConnection}
                  onClick={async () => {
                    setIsTestingConnection(true);
                    setConnectionResult(null);
                    try {
                      const r = await fetch(settings.agentUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          jsonrpc: "2.0",
                          method: "message/send",
                          params: {
                            message: {
                              role: "user",
                              parts: [{ type: "text", text: "ping" }],
                            },
                            metadata: { source: "connection-test" },
                          },
                          id: Date.now(),
                        }),
                      });
                      const data = await r.json();
                      if (data.result?.task?.status === "completed") {
                        setConnectionResult({
                          success: true,
                          message: "Connected! Agent responded successfully.",
                          taskId: data.result.task.taskId,
                        });
                      } else if (data.error) {
                        setConnectionResult({
                          success: false,
                          message: data.error.message || "Unknown error",
                        });
                      } else {
                        setConnectionResult({
                          success: false,
                          message: `Unexpected response: ${JSON.stringify(data).slice(0, 200)}`,
                        });
                      }
                    } catch (err) {
                      setConnectionResult({
                        success: false,
                        message: `Failed to reach endpoint: ${err instanceof Error ? err.message : "Network error"}`,
                      });
                    } finally {
                      setIsTestingConnection(false);
                    }
                  }}
                >
                  {isTestingConnection ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    "Test Connection"
                  )}
                </button>
              )}
              {connectionResult && (
                <div className="mt-2">
                  {connectionResult.success ? (
                    <div className="flex items-center gap-2 text-[#00dc82] text-xs bg-[#00dc82]/10 border border-[#00dc82]/20 rounded px-3 py-2">
                      <CheckCircle size={14} />
                      <span>
                        {connectionResult.message}
                        {connectionResult.taskId && (
                          <span className="ml-1 font-mono text-[#00dc82]/70">
                            ({connectionResult.taskId})
                          </span>
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                      <XCircle size={14} />
                      <span>{connectionResult.message}</span>
                    </div>
                  )}
                </div>
              )}

              <p className={`text-[10px] font-mono ${textMuted}`}>
                Identity is already live locally — the gateway routes your agent to
                Mother Brain's MCP tools and the local Postgres chat DB. Cloudflare
                (always-on) and Supabase (cloud backup) come later as optional steps.
              </p>
            </div>
          );
        })(),
      },
      {
        title: "Chat UI Style",
        desc: "Make the chat feel native to your site. Same fields as Settings → Chat UI.",
        body: (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Primary Color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={settings.widgetColor || "#39ff14"}
                  onChange={(e) => updateField("widgetColor", e.target.value)}
                  className={`w-8 h-8 border bg-transparent cursor-pointer ${isLightMode ? "border-gray-300" : "border-[#1e1e2d]"}`}
                />
                <span className="text-xs font-mono text-gray-400">{settings.widgetColor}</span>
              </div>
            </div>
            <div>
              <label className={labelCls}>Hero Search Gradient</label>
              <div className="flex gap-4 items-center">
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={settings.heroGradientColor1 || "#00dc82"}
                    onChange={(e) => updateField("heroGradientColor1", e.target.value)}
                    className={`w-8 h-8 border bg-transparent cursor-pointer ${isLightMode ? "border-gray-300" : "border-[#1e1e2d]"}`}
                  />
                  <span className="text-xs font-mono text-gray-400">{settings.heroGradientColor1}</span>
                </div>
                <span className="text-gray-600">→</span>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={settings.heroGradientColor2 || "#a78bfa"}
                    onChange={(e) => updateField("heroGradientColor2", e.target.value)}
                    className={`w-8 h-8 border bg-transparent cursor-pointer ${isLightMode ? "border-gray-300" : "border-[#1e1e2d]"}`}
                  />
                  <span className="text-xs font-mono text-gray-400">{settings.heroGradientColor2}</span>
                </div>
              </div>
            </div>
            {renderField({
              label: "Branding Text",
              value: settings.widgetBranding || "",
              onChange: (v) => updateField("widgetBranding", v),
              placeholder: "Powered by Your Brand",
            })}
            <div>
              <label className={labelCls}>Agent Logo</label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  className={inputCls}
                  value={settings.logoUrl || ""}
                  onChange={(e) => updateField("logoUrl", e.target.value)}
                  placeholder="https://example.com/logo.svg"
                />
                <label
                  className={`${btnCls} shrink-0 cursor-pointer flex items-center gap-1.5`}
                >
                  <FileJson size={11} />
                  Upload
                  <input
                    type="file"
                    accept=".svg,.png,.jpg,.jpeg,.icns"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (
                        file.type === "image/svg+xml" ||
                        file.type.startsWith("text/")
                      ) {
                        const text = await file.text();
                        const encoded = `data:${file.type};utf8,${encodeURIComponent(text)}`;
                        updateField("logoUrl", encoded);
                      } else {
                        const reader = new FileReader();
                        reader.onload = () => {
                          updateField("logoUrl", reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
              {settings.logoUrl && (
                <div className="flex items-center gap-2 mt-2">
                  <img
                    src={settings.logoUrl}
                    alt="Logo preview"
                    width={20}
                    height={20}
                    style={{ objectFit: "contain" }}
                  />
                  <span className="text-[10px] font-mono text-gray-500">Preview</span>
                  <button
                    type="button"
                    data-a2a-nav
                    className="text-[10px] font-mono text-[#ff3d7f] hover:text-[#ff3d7f]/80 ml-auto"
                    onClick={() => updateField("logoUrl", "")}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
            <div className={`border-t pt-3 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}>
              <label className={labelCls}>Display Options</label>
              <div className="space-y-2 mt-2">
                {[
                  { key: "showToolCalls", label: "Show MCP Tool Calls" },
                  { key: "showThinking", label: "Show Thinking" },
                  { key: "showReasoning", label: "Show Reasoning" },
                ].map((t) => (
                  <label key={t.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!(settings as Record<string, unknown>)[t.key]}
                      onChange={(e) => updateField(t.key, e.target.checked)}
                      className="accent-[#39ff14]"
                    />
                    <span className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
                      {t.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ),
      },
      {
        title: "Build the Widget",
        desc: "Download the React/TypeScript component bundle — self-contained, no npm dependencies beyond react/react-dom.",
        body: (
          <div className="space-y-3">
            <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
              The bundle includes Hero Search (octagonal SVG), the fullscreen chat
              overlay, markdown rendering, and your styling. Unzip it into your
              website's codebase — the next slide gives your coding AI the exact
              import instructions.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-a2a-nav
                className={primaryBtnCls + " flex items-center gap-2"}
                disabled={isBuildingWidget}
                onClick={handleBuildWidget}
              >
                {isBuildingWidget ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Building…
                  </>
                ) : (
                  <>
                    <Code2 size={14} /> Build Widget
                  </>
                )}
              </button>
              {widgetBuildUrl && (
                <span className={`text-[11px] font-mono ${textAccent}`}>
                  ✓ motherbrain-widget.zip downloaded
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className={labelCls + " mb-0!"}>Embedding Snippet</label>
                <button
                  type="button"
                  data-a2a-nav
                  className={btnCls + " ml-auto flex items-center gap-1"}
                  onClick={() => {
                    navigator.clipboard.writeText(snippetHtml);
                    setCopiedSnippet(true);
                    setTimeout(() => setCopiedSnippet(false), 2000);
                  }}
                >
                  {copiedSnippet ? (
                    <><Check size={10} /> Copied</>
                  ) : (
                    <><Copy size={10} /> Copy</>
                  )}
                </button>
              </div>
              <pre
                className={`${cardCls} p-3 text-[10px] font-mono overflow-x-auto whitespace-pre leading-relaxed ${isLightMode ? "text-gray-700" : "text-gray-300"}`}
              >
                {snippetHtml}
              </pre>
            </div>
          </div>
        ),
      },
      {
        title: "Coding Agent Prompt",
        desc: "Hand this prompt + the widget zip to your website's coding AI — it will establish the A2A endpoint and wire the chat into your codebase.",
        body: (
          <div className="space-y-3">
            <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
              Your coding AI (Cursor, Zed, Claude Code…) reads this and knows: the
              agent connects to your Mother Brain project (knowledge + chat history)
              via the MCP Gateway, the endpoint speaks JSON-RPC 2.0 (A2A standard),
              and exactly how to import every component.
            </p>
            <div className="flex">
              <button
                type="button"
                data-a2a-nav
                className={primaryBtnCls + " flex items-center gap-1.5"}
                onClick={() => {
                  navigator.clipboard.writeText(aiAgentPrompt);
                  setCopiedPrompt(true);
                  setTimeout(() => setCopiedPrompt(false), 2000);
                }}
              >
                {copiedPrompt ? (
                  <><Check size={12} /> Copied!</>
                ) : (
                  <><Copy size={12} /> Copy Prompt for Coding AI</>
                )}
              </button>
            </div>
            <pre
              className={`${cardCls} p-3 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto ${isLightMode ? "text-gray-700" : "text-gray-300"}`}
            >
              {aiAgentPrompt}
            </pre>
            <p className={`text-[10px] font-mono ${textMuted}`}>
              Once your coding AI sets the endpoint URL on your website, paste it
              into slide 1 — the canvas node turns green when it's set.
            </p>
          </div>
        ),
      },
    ];
  };

  // ── Agent Cloud Mirror slides — the ALWAYS-ON step. Exact mirrors of the
  //    Settings sections: MCP Cloud Mirror (Deploy section), Offline Fallback
  //    / Project KB Supabase, Chat DB Supabase (Database section), Cloudflare
  //    Worker Model, and Deploy. The agent keeps working when the Mother Brain
  //    app is offline: worker → MCP Mirror + Project KB Supabase + Chat DB. ──
  const cloudMirrorSlides = (): Slide[] => [
    {
      title: "Why a Cloud Mirror?",
      desc: "Your agent already works locally. This step makes it work 24/7 — even when the Mother Brain app is offline.",
      body: (
        <div className="space-y-3">
          <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
            Three cloud pieces keep the agent alive without your laptop:
          </p>
          <div className={`${cardCls} p-4 space-y-2`}>
            {[
              {
                label: "Cloudflare MCP Mirror",
                desc: "Cloud-hosted MCP tools — the agent's brain when the local Gateway is down.",
                ok: !!settings.mcpCloudUrl,
              },
              {
                label: "Project Knowledge Base (Supabase #1)",
                desc: "Your Mother Brain project's knowledge, queried directly when offline.",
                ok: !!(settings.mbSupabaseUrl && settings.mbSupabaseServiceKey && settings.mbProjectId),
              },
              {
                label: "A2A Chat History (Supabase #2)",
                desc: "Conversations stored in the cloud, synced from the local chat DB.",
                ok: !!(settings.supabaseUrl && settings.supabaseServiceKey),
              },
            ].map((row) => (
              <div key={row.label} className="flex items-start gap-2">
                <span className={`text-[11px] font-mono mt-0.5 ${row.ok ? textAccent : textMuted}`}>
                  {row.ok ? "✓" : "○"}
                </span>
                <div>
                  <p className="text-xs font-mono">{row.label}</p>
                  <p className={`text-[10px] font-mono ${textMuted}`}>{row.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className={`text-[10px] font-mono ${textMuted}`}>
            The final slide deploys your A2A Agent to Cloudflare Workers — that's
            what makes the mirror reachable. Same fields as the classic Settings
            screen; editing either stays in sync.
          </p>
        </div>
      ),
    },
    {
      title: "Cloudflare MCP Mirror",
      desc: "The cloud copy of the MCP Gateway — configured in Mother Brain App Settings, mirrored here.",
      body: (
        <div className="space-y-3">
          {renderField({
            label: "MCP Cloud Mirror URL",
            value: settings.mcpCloudUrl || "",
            onChange: (v) => updateField("mcpCloudUrl", v),
            placeholder: "https://mother-brain-mcp-cloud…workers.dev",
            hint: "Deployed as the MCP_CLOUD_URL Worker secret. Optional — cloud-hosted MCP tools for fallback when the local Gateway is unreachable.",
          })}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.forceCloudMcp}
              onChange={(e) => updateField("forceCloudMcp", e.target.checked)}
              className="accent-[#39ff14] w-3.5 h-3.5"
            />
            <span className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
              Force Cloud MCP Server
            </span>
          </label>
          <p className={`text-[10px] font-mono ${textMuted}`}>
            When forced, MCP tool calls always route to the cloud mirror — useful
            for testing or when the local app is rarely online.
          </p>
        </div>
      ),
    },
    {
      title: "Project Knowledge Base",
      desc: "Supabase #1 — your Mother Brain project's knowledge (code index, memories, chat history). Auto-loads from the project config.",
      body: (() => {
        const kbConfigured = !!(
          settings.mbSupabaseUrl &&
          settings.mbSupabaseServiceKey &&
          settings.mbProjectId
        );
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${kbConfigured ? "bg-[#39ff14]" : "bg-gray-600"}`} />
              <span className={`text-xs font-mono ${kbConfigured ? textAccent : "text-gray-500"}`}>
                {kbConfigured ? "Configured" : "Not configured"}
              </span>
              <button
                type="button"
                data-a2a-nav
                className={btnCls + " ml-auto flex items-center gap-1"}
                onClick={fetchMbSupabase}
                disabled={mbFetching}
              >
                {mbFetching ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Fetch from Project
              </button>
            </div>
            <p className={`text-[10px] font-mono ${textMuted}`}>
              When the MCP Gateway is down, the Worker queries this Supabase
              directly to retrieve stored knowledge and still answer. Deployed as
              Worker secrets: MB_SUPABASE_URL, MB_SUPABASE_SERVICE_KEY, MB_PROJECT_ID.
            </p>
            {renderField({
              label: "Project Supabase URL",
              value: settings.mbSupabaseUrl || "",
              onChange: (v) => updateField("mbSupabaseUrl", v),
              placeholder: "https://your-project-ref.supabase.co",
            })}
            <div>
              <label className={labelCls}>
                Project ID (table prefix)
                <span className={`ml-2 text-[10px] font-normal ${isLightMode ? "text-gray-400" : "text-white/40"}`}>
                  managed by Project Settings
                </span>
              </label>
              <input
                type="text"
                className={`${inputCls} opacity-60 cursor-not-allowed`}
                value={settings.mbProjectId || ""}
                readOnly
                disabled
                placeholder="auto-populated from primary project"
              />
            </div>
            {renderField({
              label: "Supabase Access Token",
              type: "password",
              fieldId: "mbSupabaseAccessToken",
              value: settings.mbSupabaseAccessToken || "",
              onChange: (v) => updateField("mbSupabaseAccessToken", v),
              placeholder: "sbp_… (auto-loaded from project config)",
            })}
            {renderField({
              label: "Service Role Key",
              type: "password",
              fieldId: "mbSupabaseServiceKey",
              value: settings.mbSupabaseServiceKey || "",
              onChange: (v) => updateField("mbSupabaseServiceKey", v),
              placeholder: "eyJ… (auto-fetched via Management API)",
              fetchLabel: "Fetch",
              onFetch: handleFetchMbServiceKey,
              fetching: fetchingMbKey,
            })}
          </div>
        );
      })(),
    },
    {
      title: "A2A Chat History",
      desc: "Supabase #2 — the CHAT DATABASE (not the project KB). Cloud storage for conversations so they survive reboots.",
      body: (
        <div className="space-y-3">
          {renderField({
            label: "Supabase URL",
            value: settings.supabaseUrl || "",
            onChange: (v) => updateField("supabaseUrl", v),
            placeholder: "https://xxxx.supabase.co",
            fetchLabel: "Fetch",
            onFetch: fetchSupabase,
            fetching: supabaseFetching,
            hint: "Auto-filled from the project config when available.",
          })}
          {renderField({
            label: "Supabase Service Key",
            type: "password",
            fieldId: "supabaseServiceKey",
            value: settings.supabaseServiceKey || "",
            onChange: (v) => updateField("supabaseServiceKey", v),
            placeholder: "eyJ…",
            fetchLabel: "Fetch",
            onFetch: fetchSupabase,
            fetching: supabaseFetching,
            hint: "Service role key — stored as a Worker secret.",
          })}
          <div>
            <label className={labelCls}>Database Provider</label>
            <ThemedSelect
              value={settings.dbProvider || "both"}
              onChange={(v) => updateField("dbProvider", v)}
              options={[
                { value: "local-pg", label: "Local Postgres Only" },
                { value: "supabase", label: "Supabase Only" },
                { value: "both", label: "Both (Local + Remote Sync)" },
              ]}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.supabaseSyncEnabled}
              onChange={(e) => updateField("supabaseSyncEnabled", e.target.checked)}
              className="accent-[#39ff14] w-3.5 h-3.5"
            />
            <span className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
              Sync to Supabase
            </span>
          </label>
          <p className={`text-[10px] font-mono ${textMuted}`}>
            Mirror local chats to the cloud.
          </p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${settings.localPgStatus === "running" ? "bg-[#39ff14]" : "bg-gray-600"}`} />
            <span className={`text-xs font-mono ${settings.localPgStatus === "running" ? textAccent : "text-gray-500"}`}>
              Local chat DB: {settings.localPgStatus || "stopped"}
            </span>
            {settings.localPgStatus !== "running" && (
              <button
                type="button"
                data-a2a-nav
                className={btnCls + " ml-auto flex items-center gap-1"}
                onClick={handleStartDb}
                disabled={dbBusy}
              >
                {dbBusy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Start Local DB
              </button>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Cloudflare Worker Model",
      desc: "The Workers AI model your deployed agent uses for offline fallback — or for ALL inference when forced.",
      body: (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Cloudflare Worker Model</label>
            <ThemedSelect
              value={settings.cfWorkerModel || "@cf/zai-org/glm-4.7-flash"}
              onChange={(v) => updateField("cfWorkerModel", v)}
              options={CF_MODEL_OPTIONS}
            />
            <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
              Used by the Cloudflare Workers AI binding when the Gateway is
              unreachable, or for all inference when forced below. (These fields
              intentionally live HERE, not in Agent Identity — they only matter
              once deployed.)
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.forceCfWorker}
              onChange={(e) => updateField("forceCfWorker", e.target.checked)}
              className="accent-[#39ff14] w-3.5 h-3.5"
            />
            <span className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
              Force Cloudflare Worker Model
            </span>
          </label>
          <p className={`text-[10px] font-mono ${textMuted}`}>
            When enabled, ALL inference runs on Cloudflare Workers AI — no MCP
            tools. Useful for cost control or testing the deployed agent.
          </p>
        </div>
      ),
    },
    {
      title: "Deploy to Cloudflare",
      desc: "Push the A2A Agent worker live — this is what makes the mirror + both Supabase DBs reachable 24/7.",
      body: (
        <div className="space-y-3">
          {renderField({
            label: "Cloudflare Account ID",
            value: settings.cloudflareAccountId || "",
            onChange: (v) => updateField("cloudflareAccountId", v),
            placeholder: "Your Cloudflare account ID",
          })}
          {renderField({
            label: "Cloudflare API Token",
            type: "password",
            fieldId: "cfApiToken",
            value: settings.cfApiToken || "",
            onChange: (v) => updateField("cfApiToken", v),
            placeholder: "Your Cloudflare API token (Workers:Secrets permission)",
            hint: "Required to deploy and push secrets. Cloudflare Dashboard → My Profile → API Tokens → \"Edit Cloudflare Workers\" template.",
          })}
          {renderField({
            label: "Worker Name",
            value: settings.workerName || "",
            onChange: (v) => updateField("workerName", v),
            placeholder: "e.g., my-a2a-endpoint",
          })}
          {/* Deploy status row — mirror of Settings → Deploy */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-gray-500">Status:</span>
            {settings.deployStatus === "deployed" || settings.lastDeployedAt ? (
              <>
                <span className={`w-2 h-2 rounded-full ${settings.lastEndpointPingOk ? "bg-[#39ff14]" : "bg-yellow-400"}`} />
                <span className={`text-xs font-mono ${settings.lastEndpointPingOk ? "text-[#39ff14]" : "text-yellow-400"}`}>
                  {settings.lastEndpointPingOk ? "Deployed" : "Deployed (endpoint unreachable)"}
                </span>
              </>
            ) : deploying || settings.deployStatus === "deploying" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-xs font-mono text-yellow-400">Deploying…</span>
              </>
            ) : settings.deployStatus === "failed" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#ff3d7f]" />
                <span className="text-xs font-mono text-[#ff3d7f]">Failed</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-gray-600" />
                <span className="text-xs font-mono text-gray-500">Not Deployed</span>
              </>
            )}
            {settings.lastDeployedAt && (
              <span className="text-[10px] font-mono text-gray-600 ml-auto">
                deployed {timeAgo(settings.lastDeployedAt)}
              </span>
            )}
          </div>
          <button
            type="button"
            data-a2a-nav
            className={primaryBtnCls + " w-full flex items-center justify-center gap-2"}
            onClick={handleDeploy}
            disabled={deploying}
          >
            {deploying ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Deploying…
              </>
            ) : (
              <>
                <Rocket size={14} /> Deploy to Cloudflare
              </>
            )}
          </button>
          {deployMsg && !deployError && (
            <p className={`text-[11px] font-mono ${textAccent}`}>{deployMsg}</p>
          )}
          {deployError && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              <XCircle size={14} />
              <span className="font-mono">{deployError}</span>
            </div>
          )}
          <p className={`text-[10px] font-mono ${textMuted}`}>
            Save → wait ~5 seconds → Deploy if you just changed settings (known
            save/deploy race). Deploys code + all secrets (identity, mirror,
            both Supabase DBs, tokens).
          </p>
        </div>
      ),
    },
    {
      title: "Mirror Checklist",
      desc: "Everything needed for your agent to answer 24/7 — even with the Mother Brain app closed.",
      body: (
        <div className={`${cardCls} p-4 space-y-2.5`}>
          {[
            {
              ok: !!settings.mcpCloudUrl,
              label: "Cloudflare MCP Mirror",
              sub: settings.mcpCloudUrl || "Not configured",
            },
            {
              ok: !!(settings.mbSupabaseUrl && settings.mbSupabaseServiceKey && settings.mbProjectId),
              label: "Project Knowledge Base (Supabase #1)",
              sub: settings.mbSupabaseUrl || "Not configured",
            },
            {
              ok: !!(settings.supabaseUrl && settings.supabaseServiceKey),
              label: "A2A Chat History (Supabase #2)",
              sub: settings.supabaseUrl || "Not configured",
            },
            {
              ok: settings.deployStatus === "deployed" || !!settings.lastDeployedAt,
              label: "Cloudflare Worker deployed",
              sub: settings.agentUrl || "Not deployed",
            },
          ].map((row) => (
            <div key={row.label} className="flex items-start gap-2">
              <span className={`text-[11px] font-mono mt-0.5 ${row.ok ? textAccent : textMuted}`}>
                {row.ok ? "✓" : "○"}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-mono">{row.label}</p>
                <p className={`text-[10px] font-mono ${textMuted} break-all`}>{row.sub}</p>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const nodeMeta: Record<NodeId, { title: string; blurb: string; icon: React.ElementType }> = {
    identity: {
      title: "Agent Identity",
      blurb: "Who your agent is — mirrored live from Settings.",
      icon: Bot,
    },
    website: {
      title: "Deploy to Website",
      blurb: "Widget bundle + endpoint — no Cloudflare needed.",
      icon: Globe,
    },
    cloudmirror: {
      title: "Agent Cloud Mirror",
      blurb: "Always-on: MCP Mirror + 2 Supabase DBs + Cloudflare deploy.",
      icon: Cloud,
    },
  };

  const slidesFor = (id: NodeId): Slide[] => {
    switch (id) {
      case "identity":
        return identitySlides();
      case "website":
        return websiteSlides();
      case "cloudmirror":
        return cloudMirrorSlides();
    }
  };

  // ── Modal (same layout structure as the original wizard) ──
  const modal = openNode ? (
    <div
      className={
        "fixed inset-0 z-50 flex" +
        (isLightMode ? " bg-black/20" : " bg-black/60")
      }
      onClick={closeNodeModal}
    >
      {/* AI Assistant sidebar — slides in from the left (replaces the old
          Setup Guide markdown reader) */}
      {renderAssistantPanel()}

      {/* Modal area — fills remaining space, centers the modal */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div
          className={`w-full flex flex-col overflow-hidden rounded-lg border shadow-2xl ${isLightMode ? "border-gray-200 bg-white" : "border-[#1e1e2d] bg-[#0a0a0f]"}`}
          style={{ maxWidth: 640, height: "92vh", maxHeight: "92vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#00dc82]/10 text-[#00dc82] flex items-center justify-center shrink-0">
                {(() => {
                  const Icon = nodeMeta[openNode].icon;
                  return <Icon size={18} />;
                })()}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-mono font-semibold truncate">
                  {nodeMeta[openNode].title}
                </h2>
                <p className={`text-[10px] font-mono ${textMuted} truncate`}>
                  {nodeMeta[openNode].blurb}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-a2a-nav
                className="p-1.5 text-gray-500 hover:text-white transition-colors"
                onClick={closeNodeModal}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Slide content */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden" style={{ position: "relative" }}>
              <div
                className="absolute inset-0 flex transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${slide * 100}%)` }}
              >
                {slidesFor(openNode).map((sl, i) => (
                  <div
                    key={i}
                    className="w-full h-full shrink-0 overflow-y-auto px-6 py-5"
                  >
                    <h3 className="text-base font-mono font-bold mb-1">
                      {sl.title}
                    </h3>
                    <p className={`text-[11px] font-mono ${textMuted} mb-4`}>
                      {sl.desc}
                    </p>
                    {sl.body}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer — Back / progress / Assistant / Next */}
          <div
            className={`flex items-center justify-between px-6 py-3.5 border-t shrink-0 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
          >
            <button
              type="button"
              data-a2a-nav
              className={btnCls + " flex items-center gap-1"}
              onClick={() => {
                flushSave();
                setSlide((s) => Math.max(0, s - 1));
              }}
              disabled={slide === 0}
            >
              <ChevronLeft size={12} /> Back
            </button>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {slidesFor(openNode).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    data-a2a-nav
                    aria-label={`Step ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === slide
                        ? "w-5 bg-[#00dc82]"
                        : i < slide
                          ? "w-1.5 bg-[#00dc82]/40"
                          : "w-1.5 bg-gray-700"
                    }`}
                    onClick={() => setSlide(i)}
                  />
                ))}
              </div>
              <button
                type="button"
                data-a2a-nav
                className={btnCls + " flex items-center gap-1"}
                onClick={() => setAssistantOpen((o) => !o)}
              >
                <Sparkles size={12} />
                {assistantOpen ? "Hide assistant" : "Assistant"}
              </button>
            </div>

            {slide < slidesFor(openNode).length - 1 ? (
              <button
                type="button"
                data-a2a-nav
                className={btnCls + " flex items-center gap-1"}
                onClick={() => {
                  flushSave();
                  setSlide((s) => s + 1);
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                data-a2a-nav
                className={primaryBtnCls + " flex items-center gap-1"}
                onClick={() => {
                  flushSave();
                  closeNodeModal();
                }}
              >
                <Check size={14} /> Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#00dc82]/10 text-[#00dc82] flex items-center justify-center">
              <Wand2 size={20} />
            </div>
            <div>
              <h1 className="text-lg font-mono font-bold">Wizard 2</h1>
              <p className={`text-[11px] font-mono ${textMuted}`}>
                The newer, cleaner setup — step by step, with an AI assistant.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-gray-500">
                <Loader2 size={11} className="animate-spin" /> Saving…
              </span>
            )}
            <button
              type="button"
              data-a2a-nav
              className={btnCls + " flex items-center gap-1.5"}
              onClick={() => activateInventionTab("Settings")}
            >
              <Settings size={12} />
              Classic Settings
            </button>
          </div>
        </div>

        {/* Canvas — Agent Identity (step 1 of the reorganization) */}
        <div className="mx-auto w-full mt-2">
          {renderCanvas()}
        </div>

        {/* Legend / quick actions */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2 mb-6">
          <span className={`text-[10px] font-mono ${textMuted}`}>
            Complete Agent Identity to unlock the next nodes — more coming:
          </span>
          <button
            type="button"
            data-a2a-nav
            className={btnCls + " flex items-center gap-1"}
            onClick={() => openNodeModal("identity")}
          >
            <Sparkles size={12} /> Start Setup
          </button>
        </div>
      </div>

      {modal}
    </div>
  );
};

export default A2aWizard2;
