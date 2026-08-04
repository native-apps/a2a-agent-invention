// ---------------------------------------------------------------------------
// A2A Agent Invention — Setup Wizard (Hub & Spoke)
// ---------------------------------------------------------------------------
// A clean, guided, visually pleasing setup experience that makes deploying
// the A2A Agent easy for anyone — even non-developers.
//
//   CENTER  : Sub-Agent — the MINIMUM REQUIREMENTS (Local First). Everything
//             needed to run the agent locally without Cloudflare/Supabase is
//             grouped into this node's modal slides.
//   SPOKES  : Deploy to Website · Chat Widget Bundle ·
//             Persistent Mode (always online) · Telegram
//
// Every node opens a fullscreen modal with one field per slide (some fields
// that belong together share a slide). Fields are AUTO-POPULATED from Mother
// Brain's App/Project settings whenever possible, and each prefilled field
// keeps a "Fetch" button so a value can be recovered if deleted.
//
// This component is registered in config.json as components."Wizard" and is
// loaded by Mother Brain's InventionsView — no Mother Brain app changes.
// ---------------------------------------------------------------------------

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Bot,
  Globe,
  MessageSquare,
  Cloud,
  Cpu,
  Send,
  Wand2,
  X,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Loader2,
  Database,
  FileJson,
  RefreshCw,
  Rocket,
  Info,
  Settings,
  MonitorSmartphone,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
  EyeOff,
  Download,
  Code2,
} from "lucide-react";
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

interface A2aWizardProps {
  invention: InventionConfig;
  onUpdate: (updates: Partial<InventionConfig>) => void;
}

// Wizard settings — a typed subset of the invention's settings object.
// The index signature preserves every OTHER setting the classic screen owns
// (skills, embeddings, kb config, …) so saving never wipes them.
interface WizardSettings {
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
  dbProvider: string;
  localPgStatus: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseSyncEnabled: boolean;
  websiteUrl: string;
  telegramBotToken: string;
  widgetColor: string;
  widgetBranding: string;
  heroGradientColor1: string;
  heroGradientColor2: string;
  cloudflareAccountId: string;
  cfApiToken: string;
  workerName: string;
  aiModel: string;
  cfWorkerModel: string;
  forceCfWorker: boolean;
  cfMaxTokens: number;
  cfTemperature: number;
  deployStatus: string;
  lastDeployedAt: string | null;
  lastEndpointPingAt: string | null;
  lastEndpointPingOk: boolean;
  logoUrl: string;
  skills: Skill[];
  agentSkillsJson: string;
  showMcpToolCalls: boolean;
  showMultiStepThinking: boolean;
  showReasoningSteps: boolean;
  voyageApiKey: string;
  voyageModel: string;
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

interface Model {
  id: string;
  label: string;
  provider: string;
  model: string;
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

type NodeId = "subagent" | "website" | "chat" | "persistent" | "telegram";

interface Slide {
  title: string;
  desc: string;
  body: React.ReactNode;
}

// ── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: WizardSettings = {
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
  dbProvider: "both",
  localPgStatus: "stopped",
  supabaseUrl: "",
  supabaseServiceKey: "",
  supabaseSyncEnabled: true,
  websiteUrl: "",
  telegramBotToken: "",
  widgetColor: "#39ff14",
  widgetBranding: "",
  heroGradientColor1: "#00dc82",
  heroGradientColor2: "#a78bfa",
  cloudflareAccountId: "",
  cfApiToken: "",
  workerName: "a2a-endpoint",
  aiModel: "default",
  cfWorkerModel: "@cf/zai-org/glm-4.7-flash",
  forceCfWorker: false,
  cfMaxTokens: 1024,
  cfTemperature: 0.7,
  deployStatus: "not-deployed",
  lastDeployedAt: null,
  lastEndpointPingAt: null,
  lastEndpointPingOk: false,
  logoUrl: "",
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
  showMcpToolCalls: true,
  showMultiStepThinking: true,
  showReasoningSteps: false,
  voyageApiKey: "",
  voyageModel: "voyage-3-lite",
};

// ── Agent Card Data ──────────────────────────────────────────────────────

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

const CF_MODEL_OPTIONS = [
  {
    value: "@cf/zai-org/glm-4.7-flash",
    label: "GLM-4.7-Flash (Zhipu AI) — Cheap, fast, function calling",
  },
  {
    value: "@cf/zai-org/glm-5.2",
    label: "GLM-5.2 (Zhipu AI) — Powerful, reasoning, expensive",
  },
  {
    value: "@cf/meta/llama-4-scout-17b-16e-instruct",
    label: "Llama 4 Scout 17B (Meta) — MoE, function calling",
  },
  {
    value: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B FP8 Fast (Meta) — Fast, function calling",
  },
  {
    value: "@cf/openai/gpt-oss-20b",
    label: "GPT-OSS-20B (OpenAI) — Open weights, reasoning",
  },
  {
    value: "@cf/google/gemma-4-26b-a4b-it",
    label: "Gemma 4 26B (Google) — Reasoning, vision",
  },
  {
    value: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    label: "Mistral Small 3.1 24B (Mistral) — Function calling",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function getSettings(invention: InventionConfig): WizardSettings {
  const raw = invention.settings || {};
  return { ...DEFAULT_SETTINGS, ...(raw as Partial<WizardSettings>) };
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

// Tolerant deep lookup for nested config values (e.g. Cloudflare creds).
function findNested(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object") {
      const nested = findNested(v, keys);
      if (nested) return nested;
    }
  }
  return undefined;
}

// ── SVG canvas helpers (matches Mother Brain Canvas / MVA screens) ──────

/** Chamfered octagonal SVG polygon points (matches motherbrain.app OctagonButton). */
function octPath(w: number, h: number, c = 16): string {
  return `${c},0 ${w - c},0 ${w},${c} ${w},${h - c} ${w - c},${h} ${c},${h} 0,${h - c} 0,${c}`;
}

// Minimal stroke icons drawn as raw SVG (lucide path data) so the wheel is
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
  chat: () => (
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  ),
  cloud: () => (
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  ),
  send: () => (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
};

type IconKey = keyof typeof ICONS;

// ── Component ────────────────────────────────────────────────────────────

const A2aWizard: React.FC<A2aWizardProps> = ({ invention, onUpdate }) => {
  const propsSettings = getSettings(invention);
  const [settings, setSettings] = useState<WizardSettings>(propsSettings);
  const savedSnapshotRef = useRef<WizardSettings>(propsSettings);

  // ── View state ──
  const [openNode, setOpenNode] = useState<NodeId | null>(null);
  const [slide, setSlide] = useState(0);
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeText, setRecipeText] = useState<string | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [hoverNode, setHoverNode] = useState<string | null>(null);

  // ── Agent Skills editor state (ported from the classic Settings screen) ──
  const [collapsedSkillIds, setCollapsedSkillIds] = useState<Set<string>>(
    () => new Set((propsSettings.skills || []).map((s) => s.id)),
  );
  const [aiSkillSuggestions, setAiSkillSuggestions] = useState<Skill[]>([]);
  const [aiSuggestingLoading, setAiSuggestingLoading] = useState(false);
  const [aiSuggestingOpen, setAiSuggestingOpen] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<
    Set<string>
  >(new Set());
  const [copiedCard, setCopiedCard] = useState(false);

  // ── Data state ──
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectUsers, setProjectUsers] = useState<ProjectUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [preventSleep, setPreventSleep] = useState<boolean | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string>(
    invention.projectIds?.[0] || "",
  );

  // ── Busy / status state ──
  const [saving, setSaving] = useState(false);
  const [gatewayFetching, setGatewayFetching] = useState(false);
  const [supabaseFetching, setSupabaseFetching] = useState(false);
  const [cfFetching, setCfFetching] = useState(false);
  const [dbBusy, setDbBusy] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{
    state: "idle" | "testing" | "registering" | "success" | "error";
    message: string;
  }>({ state: "idle", message: "" });
  const [widgetBuildUrl, setWidgetBuildUrl] = useState<string | null>(null);
  const [isBuildingWidget, setIsBuildingWidget] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());

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

  // Sync local state when parent props change (e.g. after external update).
  // Guard: don't override the user's unsaved edits.
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

  // ── Fetch project users (Sub-Agents only) when project changes ──
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
  }, [settings.primaryProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Active project ID from MB server ──
  useEffect(() => {
    fetch("/api/active-project")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.activeProjectId) setActiveProjectId(data.activeProjectId);
      })
      .catch(() => {});
  }, []);

  // ── Available AI models from MB App Settings ──
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

  // ── Prevent Sleep status (Mother Brain System Settings) ──
  const refreshTrayStatus = useCallback(() => {
    fetch("/api/tray/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.preventSleep === "boolean") {
          setPreventSleep(data.preventSleep);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshTrayStatus();
  }, [refreshTrayStatus]);

  // ── PERSIST (save full settings to server) ──
  const persist = useCallback(
    async (s: WizardSettings) => {
      // Keep the Worker's AGENT_SKILLS_JSON secret in sync with the skills array
      const merged = { ...s };
      if (Array.isArray(merged.skills)) {
        merged.agentSkillsJson = JSON.stringify(merged.skills);
      }
      try {
        const pid = activeProjectId || merged.primaryProjectId;
        const res = await fetch(`/api/inventions/${invention.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: merged, projectId: pid }),
        });
        if (res.ok) {
          onUpdate({ settings: merged });
          savedSnapshotRef.current = merged;
          // Persist Supabase creds to localStorage as fallback
          if (merged.supabaseUrl || merged.supabaseServiceKey) {
            saveSupabaseCreds(
              merged.supabaseUrl,
              merged.supabaseServiceKey,
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

  // ── updateField: local edit + debounced auto-save (wizard saves itself) ──
  const saveTimer = useRef<number | null>(null);
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
    (updates: Partial<WizardSettings>) => {
      setSettings((prev) => {
        const merged = { ...prev, ...updates };
        persist(merged);
        return merged;
      });
    },
    [persist],
  );

  // ── AUTO-GRAB on mount: prefill everything we can (prefill rule) ──
  useEffect(() => {
    const autoGrab = async () => {
      const updates: Partial<WizardSettings> = {};

      // 1. Primary project → active project
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

      // 2. Gateway token + URL from global config
      if (!settings.gatewayToken || !settings.gatewayBaseUrl) {
        try {
          const res = await fetch("/api/settings/global");
          if (res.ok) {
            const globalConfig = await res.json();
            if (!settings.gatewayToken && globalConfig.masterApiKey) {
              updates.gatewayToken = globalConfig.masterApiKey;
            }
            if (!settings.gatewayBaseUrl) {
              const gwUrl =
                globalConfig.gatewayUrl ||
                globalConfig.gatewayWorkerUrl ||
                globalConfig.mcpGatewayUrl;
              if (gwUrl) updates.gatewayBaseUrl = gwUrl;
            }
          }
        } catch {}
      }

      // 3. Supabase credentials from project config
      const pid = activeProjectId || settings.primaryProjectId || updates.primaryProjectId;
      if (pid && (!settings.supabaseUrl || !settings.supabaseServiceKey)) {
        try {
          const configRes = await fetch(
            `/api/projects/${encodeURIComponent(pid)}/config`,
          );
          if (configRes.ok) {
            const projectConfig = await configRes.json();
            if (projectConfig.supabaseUrl) {
              updates.supabaseUrl = projectConfig.supabaseUrl;
            }
            if (projectConfig.supabaseServiceKey) {
              updates.supabaseServiceKey = projectConfig.supabaseServiceKey;
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

  // ── Sub-Agent selection (auto-populates name, token, provider) ──
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
    const pid = activeProjectId || settings.primaryProjectId;
    if (!pid) return;
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
    } catch {}
  };

  // ── Agent Skills editor handlers (ported from the classic Settings screen) ──
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
    setCollapsedSkillIds((prev) => new Set([...prev, skillId]));
  };

  const updateSkill = (
    index: number,
    field: string,
    value: string | string[],
  ) => {
    const skills = [...((settings.skills as Skill[]) || [])];
    skills[index] = { ...skills[index], [field]: value };
    updateField("skills", skills);
  };

  const removeSkill = (index: number) => {
    const skills = [...((settings.skills as Skill[]) || [])];
    skills.splice(index, 1);
    updateField("skills", skills);
  };

  const toggleSkillCollapse = (skillId: string) => {
    setCollapsedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };

  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const handleDragStart = (index: number) => {
    dragFromRef.current = index;
    dragOverRef.current = null;
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragFromRef.current === null || dragFromRef.current === index) return;
    dragOverRef.current = index;
  };
  const handleDragEnd = () => {
    const from = dragFromRef.current;
    const to = dragOverRef.current;
    dragFromRef.current = null;
    dragOverRef.current = null;
    if (from === null || to === null || from === to) return;
    const skills = [...((settings.skills as Skill[]) || [])];
    const [dragged] = skills.splice(from, 1);
    skills.splice(to, 0, dragged);
    updateField("skills", skills);
  };

  // ── AI Suggest Skills ──
  const aiSuggestSkills = async () => {
    if (!settings.agentUrl) return;
    setAiSuggestingLoading(true);
    setAiSuggestingOpen(true);
    setSelectedSuggestionIds(new Set());
    try {
      const res = await fetch(settings.agentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "agent/suggest-skills",
          params: {
            currentSkills: (settings.skills as Skill[]) || [],
            agentDescription: settings.agentDescription,
          },
          id: "ai-suggest",
        }),
      });
      if (!res.ok) {
        setAiSkillSuggestions([]);
      } else {
        const data = await res.json();
        setAiSkillSuggestions(data?.result?.suggestions || []);
      }
    } catch {
      setAiSkillSuggestions([]);
    } finally {
      setAiSuggestingLoading(false);
    }
  };

  // ── Fetch handlers (the "Fetch" buttons — prefill recovery) ──
  const fetchGateway = async () => {
    setGatewayFetching(true);
    try {
      const res = await fetch("/api/settings/global");
      if (res.ok) {
        const g = await res.json();
        const updates: Partial<WizardSettings> = {};
        if (g.masterApiKey) updates.gatewayToken = g.masterApiKey;
        const gwUrl = g.gatewayUrl || g.gatewayWorkerUrl || g.mcpGatewayUrl;
        if (gwUrl) updates.gatewayBaseUrl = gwUrl;
        if (Object.keys(updates).length > 0) applyAndSave(updates);
      }
    } catch {
    } finally {
      setGatewayFetching(false);
    }
  };

  const fetchSupabase = async () => {
    const pid = activeProjectId || settings.primaryProjectId;
    if (!pid) return;
    setSupabaseFetching(true);
    try {
      const configRes = await fetch(
        `/api/projects/${encodeURIComponent(pid)}/config`,
      );
      if (!configRes.ok) return;
      const projectConfig = await configRes.json();
      const updates: Partial<WizardSettings> = {};
      if (projectConfig.supabaseUrl) {
        updates.supabaseUrl = projectConfig.supabaseUrl;
      }
      if (projectConfig.supabaseServiceKey) {
        updates.supabaseServiceKey = projectConfig.supabaseServiceKey;
      } else if (projectConfig.supabaseAccessToken && projectConfig.supabaseUrl) {
        // Resolve the service_role key via the Supabase Management API
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

  const fetchCloudflare = async () => {
    setCfFetching(true);
    try {
      const res = await fetch("/api/settings/global");
      if (res.ok) {
        const g = await res.json();
        const updates: Partial<WizardSettings> = {};
        const account = findNested(g, [
          "cloudflareAccountId",
          "cfAccountId",
          "accountId",
        ]);
        const token = findNested(g, [
          "cfApiToken",
          "cloudflareApiToken",
          "apiToken",
        ]);
        if (account) updates.cloudflareAccountId = account;
        if (token) updates.cfApiToken = token;
        if (Object.keys(updates).length > 0) applyAndSave(updates);
      }
    } catch {
    } finally {
      setCfFetching(false);
    }
  };

  // ── Prevent Sleep toggle (Mother Brain System Settings) ──
  const togglePreventSleep = async () => {
    const next = !preventSleep;
    setPreventSleep(next);
    try {
      await fetch("/api/prevent-sleep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
    } catch {
      setPreventSleep(!next);
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
    const fileRecords: Uint8Array[] = [];
    const centralRecords: Uint8Array[] = [];
    let offset = 0;

    for (const f of files) {
      const data = enc.encode(f.content);
      const name = enc.encode(f.name);
      const crc = crc32(data);

      // Local file header (30 bytes) + name + data
      const lfh = new Uint8Array(30 + name.length + data.length);
      const dv = new DataView(lfh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true); // UTF-8 filename
      dv.setUint16(8, 0, true); // store (no compression)
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      lfh.set(name, 30);
      lfh.set(data, 30 + name.length);
      fileRecords.push(lfh);

      // Central directory record (46 bytes) + name
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

    // End of central directory (22 bytes)
    const cdSize = centralRecords.reduce((s, r) => s + r.length, 0);
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);

    // Combine
    const total = offset + cdSize + 22;
    const result = new Uint8Array(total);
    let pos = 0;
    for (const r of fileRecords) {
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

  // ── Build Widget (mirrors Settings > Widget Deploy) ──
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
      alert(
        "Build failed: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setIsBuildingWidget(false);
    }
  };

  // ── Local chat database ──
  const handleStartDb = async () => {
    if (dbBusy) return;
    setDbBusy(true);
    try {
      const pid = activeProjectId || settings.primaryProjectId;
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

  // ── Deploy to Cloudflare (saves everything, then runs MB deploy action) ──
  const handleDeploy = async () => {
    if (deploying) return;
    setDeploying(true);
    setDeployError(null);
    setDeployMsg("Saving settings…");
    try {
      const activePid = activeProjectId || settings.primaryProjectId;
      // 1. Explicit awaited save so every secret is on disk before deploy
      const merged = { ...settings };
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

  // ── Telegram webhook registration ──
  const webhookUrl = settings.agentUrl
    ? `${settings.agentUrl.replace(/\/+$/, "")}/webhook/telegram`
    : "";
  const registerTelegramWebhook = async () => {
    if (!settings.telegramBotToken || !webhookUrl) return;
    setWebhookStatus({ state: "testing", message: "Verifying bot token…" });
    try {
      const meRes = await fetch(
        `https://api.telegram.org/bot${settings.telegramBotToken}/getMe`,
      );
      const meData = await meRes.json();
      if (!meData.ok) {
        setWebhookStatus({
          state: "error",
          message: `Invalid bot token: ${meData.description || "Unknown error"}`,
        });
        return;
      }
      setWebhookStatus({
        state: "registering",
        message: `Bot verified: @${meData.result.username}. Registering webhook…`,
      });
      const whRes = await fetch(
        `https://api.telegram.org/bot${settings.telegramBotToken}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: webhookUrl }),
        },
      );
      const whData = await whRes.json();
      if (whData.ok) {
        setWebhookStatus({
          state: "success",
          message: `Webhook registered! Bot @${meData.result.username} is live at your agent.`,
        });
      } else {
        setWebhookStatus({
          state: "error",
          message: `Webhook registration failed: ${whData.description || "Unknown error"}`,
        });
      }
    } catch (err) {
      setWebhookStatus({
        state: "error",
        message: `Network error: ${err instanceof Error ? err.message : "Could not reach Telegram API"}`,
      });
    }
  };

  // ── Recipes support: load the setup guide for the open node ──
  const NODE_RECIPES: Record<NodeId, string> = {
    subagent: "recipes/a2a-setup.md",
    website: "recipes/a2a-deploy.md",
    chat: "recipes/a2a-widget-deploy.md",
    persistent: "recipes/a2a-deploy.md",
    telegram: "recipes/a2a-setup.md",
  };
  const toggleRecipe = async () => {
    if (!openNode) return;
    if (recipeOpen) {
      setRecipeOpen(false);
      return;
    }
    setRecipeOpen(true);
    if (recipeText === null) {
      setRecipeLoading(true);
      try {
        const res = await fetch(
          `/api/inventions/${invention.id}/resource/${NODE_RECIPES[openNode]}`,
        );
        setRecipeText(res.ok ? await res.text() : "(Setup guide not found.)");
      } catch {
        setRecipeText("(Could not load the setup guide.)");
      } finally {
        setRecipeLoading(false);
      }
    }
  };

  // ── Node open/close ──
  const openNodeModal = (id: NodeId) => {
    setOpenNode(id);
    setSlide(0);
    setRecipeOpen(false);
  };
  const closeNodeModal = () => {
    setOpenNode(null);
    setSlide(0);
    setRecipeOpen(false);
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
    "px-4 py-2 rounded-lg bg-[#00dc82] text-black text-sm font-mono font-semibold hover:bg-[#00dc82]/90 transition-colors disabled:opacity-50";
  const cardCls = isLightMode
    ? "border border-gray-200 bg-white rounded-lg"
    : "border border-[#1e1e2d] bg-[#0a0a0f] rounded-lg";
  const textMuted = isLightMode ? "text-gray-500" : "text-gray-500";
  const textAccent = isLightMode ? "text-emerald-700" : "text-[#39ff14]";

  // ── Field render helpers ──
  const renderFetchButton = (
    label: string,
    onFetch: () => void,
    fetching: boolean,
  ) => (
    <button
      type="button"
      className={btnCls + " flex items-center gap-1 shrink-0"}
      onClick={onFetch}
      disabled={fetching}
      title="Auto-fill this field from Mother Brain settings"
    >
      <RefreshCw size={12} className={fetching ? "animate-spin" : ""} />
      {label}
    </button>
  );

  const renderField = (opts: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    hint?: string;
    placeholder?: string;
    type?: "text" | "password" | "number";
    fetchLabel?: string;
    onFetch?: () => void;
    fetching?: boolean;
    fieldId?: string;
  }) => {
    const isSecret = opts.type === "password";
    const revealed = isSecret && opts.fieldId && revealedFields.has(opts.fieldId);
    const toggleReveal = isSecret && opts.fieldId
      ? () => {
          const next = new Set(revealedFields);
          if (revealed) next.delete(opts.fieldId!);
          else next.add(opts.fieldId!);
          setRevealedFields(next);
        }
      : undefined;
    return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className={labelCls + " mb-0!"}>{opts.label}</label>
        {opts.fetchLabel && opts.onFetch && (
          <span className="ml-auto">
            {renderFetchButton(opts.fetchLabel, opts.onFetch, !!opts.fetching)}
          </span>
        )}
      </div>
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
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 ${isLightMode ? "text-gray-500 hover:text-gray-700" : "text-gray-500 hover:text-gray-300"}`}
            onClick={toggleReveal}
            title={revealed ? "Hide" : "Show"}
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {opts.hint && (
        <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
          {opts.hint}
        </p>
      )}
    </div>
  );
  };

  const renderInfoCard = (
    title: string,
    lines: string[],
    tone: "info" | "warn" = "info",
  ) => {
    const Icon = tone === "warn" ? AlertCircle : Info;
    const border = isLightMode
      ? tone === "warn"
        ? "border-amber-300 bg-amber-50"
        : "border-emerald-200 bg-emerald-50"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10"
        : "border-[#39ff14]/20 bg-[#39ff14]/5";
    const iconColor = isLightMode
      ? tone === "warn"
        ? "text-amber-700"
        : "text-emerald-600"
      : tone === "warn"
        ? "text-amber-400"
        : "text-[#39ff14]";
    return (
      <div className={`rounded-lg border p-3 ${border}`}>
        <div className="flex items-start gap-2">
          <Icon size={14} className={`${iconColor} mt-0.5 shrink-0`} />
          <div>
            <p className={`text-[11px] font-mono font-semibold ${iconColor}`}>
              {title}
            </p>
            <div className={`text-[11px] font-mono ${textMuted} mt-1 space-y-1`}>
              {lines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCheckRow = (
    done: boolean,
    label: string,
    detail?: string,
  ) => (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2
          size={16}
          className={isLightMode ? "text-emerald-600" : "text-[#39ff14]"}
        />
      ) : (
        <AlertCircle
          size={16}
          className={isLightMode ? "text-gray-300" : "text-gray-600"}
        />
      )}
      <div className="min-w-0">
        <p
          className={`text-xs font-mono ${done ? (isLightMode ? "text-gray-800" : "text-gray-200") : (isLightMode ? "text-gray-400" : "text-gray-500")}`}
        >
          {label}
        </p>
        {detail && (
          <p className={`text-[10px] font-mono ${textMuted} truncate`}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );

  const renderToggle = (
    label: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <button
      type="button"
      className="w-10 h-5 rounded-full relative cursor-pointer transition-colors"
      style={{ backgroundColor: value ? "#00dc82" : "#1f1f1f" }}
      onClick={() => onChange(!value)}
    >
      <span
        className={`absolute top-1 w-3 h-3 rounded-full transition-all ${value ? "right-1 bg-black" : "left-1 bg-gray-500"}`}
      />
      <span className="sr-only">{label}</span>
    </button>
  );

  // ── Apple Silicon command box — shown when Prevent Sleep is ON.
  // Same content as Mother Brain App Settings → System & Projects →
  // Prevent Sleep on Lid Close.
  const renderAppleSiliconCmd = () => {
    if (preventSleep !== true) return null;
    return (
      <div
        className={`mt-2 p-2.5 rounded-lg border ${isLightMode ? "bg-gray-50 border-gray-200" : "bg-[#0a0a0a] border-[#1e1e2d]"}`}
      >
        <span
          className={`block text-[10px] font-mono mb-1.5 ${isLightMode ? "text-emerald-700" : "text-[#00dc82]"}`}
        >
          🍎 Apple Silicon: Run this terminal command for full protection:
        </span>
        <code
          className={`block text-[11px] px-2 py-1.5 rounded font-mono select-all ${isLightMode ? "text-gray-900 bg-gray-100 border border-gray-200" : "text-gray-300 bg-[#0a0a0f]"}`}
        >
          sudo pmset -a disablesleep 1
        </code>
        <span
          className={`block text-[9px] mt-1.5 ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
        >
          Requires admin password · Run once · Restore with: sudo pmset -a
          disablesleep 0
        </span>
      </div>
    );
  };

  // ── Status calculations (wheel + summaries) ──
  const minChecks = [
    { label: "Sub-Agent chosen", done: !!(settings.botUserId && settings.accessToken) },
    { label: "Agent name & description", done: !!settings.agentName },
    { label: "MCP Gateway connected", done: !!(settings.gatewayBaseUrl && settings.gatewayToken) },
    { label: "Primary project selected", done: !!settings.primaryProjectId },
    { label: "Local chat database", done: settings.localPgStatus === "running" },
  ];
  const minDone = minChecks.filter((c) => c.done).length;

  const spokeStatus: Record<NodeId, { text: string; done: boolean }> = {
    subagent: {
      text: `${minDone}/${minChecks.length} minimums`,
      done: minDone === minChecks.length,
    },
    website: {
      text:
        settings.deployStatus === "deployed" || settings.lastDeployedAt
          ? "Live"
          : settings.agentUrl
            ? "Endpoint set"
            : "Not set up",
      done: !!(settings.agentUrl && (settings.lastDeployedAt || settings.deployStatus !== "not-deployed")),
    },
    chat: {
      text: settings.widgetBranding ? "Styled" : "Optional gift",
      done: !!settings.widgetBranding,
    },
    persistent: {
      text:
        settings.supabaseUrl && settings.supabaseServiceKey
          ? "Configured"
          : "Optional",
      done: !!(settings.supabaseUrl && settings.supabaseServiceKey),
    },
    telegram: {
      text: settings.telegramBotToken ? "Connected" : "Not set up",
      done: !!settings.telegramBotToken,
    },
  };

  // ── Hub & Spoke — pure SVG canvas ──
  // Renders the wheel as a single SVG (like MB's Canvas / MVA screens):
  // octagonal SVG nodes (motherbrain.app OctagonButton style) with connectors
  // drawn UNDER the nodes that terminate exactly at each node's edge.
  const HUB = {
    cx: 500,
    cy: 350,
    ring: 270,
    cw: 260,
    ch: 180,
    cc: 24,
    sw: 220,
    sh: 120,
    sc: 18,
  };
  const SPOKE_DEFS: {
    id: NodeId;
    x: number;
    y: number;
    icon: IconKey;
    title: string;
  }[] = [
    { id: "website", x: 500, y: 80, icon: "globe", title: "Deploy to Website" },
    { id: "chat", x: 770, y: 350, icon: "chat", title: "Chat Widget" },
    { id: "persistent", x: 500, y: 620, icon: "cloud", title: "Persistent Mode" },
    { id: "telegram", x: 230, y: 350, icon: "send", title: "Telegram" },
  ];

  const renderHubCanvas = () => {
    const titleFill = isLightMode ? "#1f2937" : "#e5e7eb";
    const subFill = isLightMode ? "#9ca3af" : "#6b7280";
    // Node strokes: light grey by default → Mother Brain neon green when active
    const GREY = isLightMode ? "#9ca3af" : "#6b7280";
    const GREEN = "#39ff14";
    const nodeFill = (active: boolean) => {
      const base = active ? GREEN : GREY;
      return isLightMode ? `${base}1f` : `${base}17`;
    };

    const renderNode = (opts: {
      key?: string;
      x: number;
      y: number;
      w: number;
      h: number;
      c: number;
      icon: IconKey;
      iconSize: number;
      title: string;
      titleY: number;
      titleSize: number;
      sub?: string;
      subY?: number;
      subSize?: number;
      pill?: { text: string; done: boolean };
      pillY?: number;
      onClick: () => void;
      hovered: boolean;
      glow?: boolean;
      done?: boolean;
    }) => {
      const Icon = ICONS[opts.icon];
      // Active = configured (done) or hovered → MB neon green; otherwise grey
      const active = opts.done === true || opts.hovered;
      const strokeColor = active ? GREEN : GREY;
      // Inline [icon][title] row, horizontally centered on the node center
      const textW = opts.title.length * opts.titleSize * 0.62;
      const rowW = opts.iconSize + 10 + textW;
      const rowX = opts.x - rowW / 2;
      const iconCX = rowX + opts.iconSize / 2;
      const textX = rowX + opts.iconSize + 10;
      return (
        <g
          key={opts.key}
          onClick={opts.onClick}
          onMouseEnter={() => setHoverNode(opts.title)}
          onMouseLeave={() => setHoverNode(null)}
          style={{ cursor: "pointer" }}
        >
          {opts.glow && (
            <g
              transform={`translate(${opts.x - opts.w / 2} ${opts.y - opts.h / 2})`}
            >
              <polygon
                points={octPath(opts.w, opts.h, opts.c)}
                fill="none"
                stroke={GREEN}
                strokeWidth={3}
                opacity={0.3}
                filter="url(#a2a-node-glow)"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          <g
            transform={`translate(${opts.x - opts.w / 2} ${opts.y - opts.h / 2})`}
          >
            <polygon
              points={octPath(opts.w, opts.h, opts.c)}
              fill={nodeFill(active)}
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
                x={-46}
                y={-11}
                width={92}
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

    return (
      <svg
        viewBox="0 0 1000 700"
        className="w-full h-auto block"
        style={{ maxWidth: 720 }}
      >
        <defs>
          <filter id="a2a-node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {([GREEN, GREY] as const).map((color) => (
            <marker
              key={color}
              id={`a2a-arrow-${color.replace("#", "")}`}
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

        {/* Decorative ring — passes through every spoke center (true wheel) */}
        <circle
          cx={HUB.cx}
          cy={HUB.cy}
          r={HUB.ring}
          fill="none"
          stroke={GREY}
          strokeWidth={1}
          strokeDasharray="4 6"
          opacity={0.35}
        />
        {/* Satellite dots on the ring diagonals */}
        {[45, 135, 225, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={HUB.cx + HUB.ring * Math.cos(rad)}
              cy={HUB.cy + HUB.ring * Math.sin(rad)}
              r={4}
              fill={GREY}
              opacity={0.4}
            />
          );
        })}

        {/* Connectors — center node edge → spoke node edge, drawn UNDER the
            nodes so every line visibly connects (no more scattered lines) */}
        {SPOKE_DEFS.map((sp) => {
          let x1 = HUB.cx;
          let y1 = HUB.cy;
          let x2 = sp.x;
          let y2 = sp.y;
          if (sp.y < HUB.cy) {
            y1 = HUB.cy - HUB.ch / 2; // center top edge
            y2 = sp.y + HUB.sh / 2; // spoke bottom edge
          } else if (sp.y > HUB.cy) {
            y1 = HUB.cy + HUB.ch / 2; // center bottom edge
            y2 = sp.y - HUB.sh / 2; // spoke top edge
          } else if (sp.x > HUB.cx) {
            x1 = HUB.cx + HUB.cw / 2; // center right edge
            x2 = sp.x - HUB.sw / 2; // spoke left edge
          } else {
            x1 = HUB.cx - HUB.cw / 2; // center left edge
            x2 = sp.x + HUB.sw / 2; // spoke right edge
          }
          return (
            <line
              key={sp.id}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={spokeStatus[sp.id].done ? GREEN : GREY}
              strokeWidth={1.5}
              opacity={spokeStatus[sp.id].done ? 0.6 : 0.35}
              markerEnd={`url(#a2a-arrow-${(spokeStatus[sp.id].done ? GREEN : GREY).replace("#", "")})`}
            />
          );
        })}

        {/* Center — Sub-Agent (minimum requirements) */}
        {renderNode({
          x: HUB.cx,
          y: HUB.cy,
          w: HUB.cw,
          h: HUB.ch,
          c: HUB.cc,
          icon: "bot",
          iconSize: 28,
          title: "Sub-Agent",
          titleY: -34,
          titleSize: 16,
          sub: "Minimum Requirements",
          subY: -4,
          subSize: 11,
          pill: {
            text:
              minDone === minChecks.length
                ? "✓ Ready"
                : `${minDone}/${minChecks.length} configured`,
            done: minDone === minChecks.length,
          },
          pillY: 26,
          onClick: () => openNodeModal("subagent"),
          hovered: hoverNode === "Sub-Agent",
          glow: true,
          done: true,
        })}

        {/* Spokes */}
        {SPOKE_DEFS.map((sp) => {
          const status = spokeStatus[sp.id];
          return renderNode({
            key: sp.id,
            x: sp.x,
            y: sp.y,
            w: HUB.sw,
            h: HUB.sh,
            c: HUB.sc,
            icon: sp.icon,
            iconSize: 22,
            title: sp.title,
            titleY: -12,
            titleSize: 12,
            sub: (status.done ? "✓ " : "") + status.text,
            subY: 18,
            subSize: 10,
            onClick: () => openNodeModal(sp.id),
            hovered: hoverNode === sp.title,
            done: status.done,
          });
        })}
      </svg>
    );
  };

  // ── Agent Skills editor (ported from the classic Settings screen) ──
  const renderSkillsSection = () => {
    const skills = (settings.skills as Skill[]) || [];
    return (
      <div className="space-y-3">
        <p
          className={`text-[11px] font-mono leading-relaxed ${isLightMode ? "text-gray-600" : "text-gray-500"}`}
        >
          Define the skills your agent advertises in its{" "}
          <code className={isLightMode ? "text-emerald-700" : "text-[#39ff14]"}>
            agent-card.json
          </code>
          . Each skill maps to A2A Protocol v1.0{" "}
          <code className="text-[10px]">AgentSkill</code> fields. Drag a
          skill's header to reorder.
        </p>

        {skills.length > 0 ? (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {skills.map((skill, i) => (
              <div
                key={skill.id}
                className={`border transition-shadow ${isLightMode ? "bg-white border-gray-200 hover:shadow-md" : "bg-[#13131f] border-[#1e1e2d] hover:border-[#39ff14]/30"} ${collapsedSkillIds.has(skill.id) ? "" : "p-3 space-y-2"}`}
              >
                <div
                  className={`flex items-center justify-between cursor-pointer select-none ${collapsedSkillIds.has(skill.id) ? "p-3" : ""}`}
                  onClick={() => toggleSkillCollapse(skill.id)}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    handleDragStart(i);
                  }}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-gray-600">
                      {collapsedSkillIds.has(skill.id) ? "▶" : "▼"}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 border ${isLightMode ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-[#39ff14]/80 border-[#39ff14]/20 bg-[#39ff14]/5"}`}
                    >
                      {skill.id}
                    </span>
                    <span
                      className={`text-[11px] font-mono font-semibold truncate ${isLightMode ? "text-gray-900" : "text-white"}`}
                    >
                      {skill.name}
                    </span>
                    {collapsedSkillIds.has(skill.id) && (
                      <span
                        className={`text-[10px] font-mono truncate max-w-[160px] ${isLightMode ? "text-gray-400" : "text-gray-500"}`}
                      >
                        {skill.description.slice(0, 50)}
                        {skill.description.length > 50 ? "…" : ""}
                      </span>
                    )}
                  </div>
                  <button
                    className={`p-1 rounded shrink-0 ${isLightMode ? "hover:bg-red-50 text-gray-400 hover:text-red-500" : "hover:bg-[#ff3d7f]/10 text-gray-500 hover:text-[#ff3d7f]"} transition-colors`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSkill(i);
                    }}
                    title="Remove skill"
                  >
                    <XCircle size={12} />
                  </button>
                </div>

                {!collapsedSkillIds.has(skill.id) && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                        >
                          ID
                        </label>
                        <input
                          className={inputCls + " text-[11px] py-1"}
                          value={skill.id}
                          onChange={(e) =>
                            updateSkill(i, "id", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label
                          className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                        >
                          Name
                        </label>
                        <input
                          className={inputCls + " text-[11px] py-1"}
                          value={skill.name}
                          onChange={(e) =>
                            updateSkill(i, "name", e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                      >
                        Description
                      </label>
                      <input
                        className={inputCls + " text-[11px] py-1"}
                        value={skill.description}
                        onChange={(e) =>
                          updateSkill(i, "description", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label
                        className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                      >
                        Tags (comma-separated)
                      </label>
                      <input
                        className={inputCls + " text-[11px] py-1"}
                        value={(skill.tags || []).join(", ")}
                        onChange={(e) =>
                          updateSkill(
                            i,
                            "tags",
                            e.target.value
                              .split(",")
                              .map((t) => t.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder="general, support"
                      />
                    </div>
                    <div>
                      <label
                        className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                      >
                        Examples (one per line)
                      </label>
                      <textarea
                        className={inputCls + " text-[11px] py-1"}
                        style={{ resize: "vertical" }}
                        rows={2}
                        value={(skill.examples || []).join("\n")}
                        onChange={(e) =>
                          updateSkill(
                            i,
                            "examples",
                            e.target.value.split("\n").filter(Boolean),
                          )
                        }
                        placeholder="How can you help me?"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                        >
                          Input Modes
                        </label>
                        <input
                          className={inputCls + " text-[11px] py-1"}
                          value={(skill.inputModes || ["text/plain"]).join(", ")}
                          onChange={(e) =>
                            updateSkill(
                              i,
                              "inputModes",
                              e.target.value
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder="text/plain"
                        />
                      </div>
                      <div>
                        <label
                          className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                        >
                          Output Modes
                        </label>
                        <input
                          className={inputCls + " text-[11px] py-1"}
                          value={(skill.outputModes || ["text/plain"]).join(", ")}
                          onChange={(e) =>
                            updateSkill(
                              i,
                              "outputModes",
                              e.target.value
                                .split(",")
                                .map((t) => t.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder="text/plain"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p
            className={`text-[11px] font-mono italic ${isLightMode ? "text-gray-400" : "text-gray-600"}`}
          >
            No skills defined. Add at least one skill below.
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            className={btnCls + " flex items-center gap-1.5"}
            onClick={addSkill}
          >
            <span className="text-base leading-none">+</span>
            Add Skill
          </button>
          <button
            className={
              btnCls +
              " flex items-center gap-1.5" +
              (aiSuggestingLoading ? " opacity-60" : "")
            }
            onClick={aiSuggestSkills}
            disabled={aiSuggestingLoading || !settings.agentUrl}
            title={
              !settings.agentUrl
                ? "Deploy your agent first"
                : "Let AI generate skill suggestions from your Knowledge Base"
            }
          >
            {aiSuggestingLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Cpu size={12} />
            )}
            AI Suggest
          </button>
        </div>

        {/* ── AI Suggestion modal ── */}
        {aiSuggestingOpen && (
          <div
            className={
              "fixed inset-0 z-50 flex items-center justify-center" +
              (isLightMode ? " bg-black/20" : " bg-black/60")
            }
            onClick={() => setAiSuggestingOpen(false)}
          >
            <div
              className={
                cardCls +
                " w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4 shadow-2xl p-4"
              }
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-mono font-semibold">
                  AI Skill Suggestions
                </span>
                <button
                  onClick={() => setAiSuggestingOpen(false)}
                  className={`p-1 rounded ${isLightMode ? "hover:bg-gray-100" : "hover:bg-[#1e1e2d]"}`}
                >
                  <XCircle size={14} />
                </button>
              </div>

              {aiSuggestingLoading ? (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <Loader2
                    size={20}
                    className={`animate-spin ${isLightMode ? "text-gray-400" : "text-gray-500"}`}
                  />
                  <span
                    className={`text-sm font-mono ${isLightMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    Analyzing knowledge base...
                  </span>
                </div>
              ) : aiSkillSuggestions.length === 0 ? (
                <div className="py-8 text-center">
                  <p
                    className={`text-sm font-mono ${isLightMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    No new skill suggestions found. Your existing skills may
                    already cover everything, or the AI couldn't reach the
                    Gateway.
                  </p>
                </div>
              ) : (
                <>
                  <p
                    className={`text-[11px] font-mono mb-3 ${isLightMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    Select skills to add. Already-existing skills are
                    automatically excluded.
                  </p>
                  <div className="space-y-2 mb-4">
                    {aiSkillSuggestions.map((skill) => (
                      <label
                        key={skill.id}
                        className={`flex items-start gap-3 p-2.5 border rounded cursor-pointer transition-colors ${
                          selectedSuggestionIds.has(skill.id)
                            ? isLightMode
                              ? "bg-emerald-50 border-emerald-300"
                              : "bg-[#39ff14]/5 border-[#39ff14]/30"
                            : isLightMode
                              ? "hover:bg-gray-50 border-gray-200"
                              : "hover:bg-[#1e1e2d] border-[#1e1e2d]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-[#39ff14]"
                          checked={selectedSuggestionIds.has(skill.id)}
                          onChange={() => {
                            setSelectedSuggestionIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(skill.id)) {
                                next.delete(skill.id);
                              } else {
                                next.add(skill.id);
                              }
                              return next;
                            });
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code
                              className={`text-[10px] font-mono ${isLightMode ? "text-emerald-700" : "text-[#39ff14]/80"}`}
                            >
                              {skill.id}
                            </code>
                            <span
                              className={`text-[12px] font-mono font-semibold ${isLightMode ? "text-gray-900" : "text-white"}`}
                            >
                              {skill.name}
                            </span>
                          </div>
                          <p
                            className={`text-[10px] font-mono mt-0.5 ${isLightMode ? "text-gray-500" : "text-gray-400"}`}
                          >
                            {skill.description}
                          </p>
                          {(skill.tags || []).length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {(skill.tags || []).map((tag) => (
                                <span
                                  key={tag}
                                  className={`text-[8px] font-mono px-1 py-0.5 border ${isLightMode ? "bg-gray-100 border-gray-300 text-gray-500" : "bg-[#39ff14]/5 border-[#39ff14]/20 text-[#39ff14]/60"}`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className={
                        primaryBtnCls +
                        " flex items-center gap-1.5 text-sm" +
                        (selectedSuggestionIds.size === 0 ? " opacity-50" : "")
                      }
                      onClick={() => {
                        const toAdd = aiSkillSuggestions.filter((s) =>
                          selectedSuggestionIds.has(s.id),
                        );
                        if (toAdd.length === 0) return;
                        applyAndSave({
                          skills: [
                            ...((settings.skills as Skill[]) || []),
                            ...toAdd,
                          ],
                        });
                        setCollapsedSkillIds(
                          (prev) =>
                            new Set([...prev, ...toAdd.map((s) => s.id)]),
                        );
                        setAiSuggestingOpen(false);
                      }}
                      disabled={selectedSuggestionIds.size === 0}
                    >
                      Add Selected ({selectedSuggestionIds.size})
                    </button>
                    <button
                      className={btnCls + " text-sm"}
                      onClick={() => setAiSuggestingOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Agent Card preview (ported from the classic Settings screen) ──
  const renderAgentCardSection = () => {
    const skills = (settings.skills as Skill[]) || [];
    return (
      <div className="space-y-3">
        <p
          className={`text-[11px] font-mono leading-relaxed ${isLightMode ? "text-gray-600" : "text-gray-500"}`}
        >
          Well-known A2A agent card served at{" "}
          <code className={isLightMode ? "text-emerald-700" : "text-[#39ff14]"}>
            /.well-known/agent.json
          </code>
          . External agents use this to discover your agent's capabilities.
        </p>

        <div
          className={`border p-4 space-y-3 ${isLightMode ? "bg-gray-50 border-gray-200" : "bg-[#13131f] border-[#1e1e2d]"}`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between border-b pb-3 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-mono font-semibold ${isLightMode ? "text-gray-900" : "text-white"}`}
                >
                  {settings.agentName || AGENT_CARD.name}
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 ${isLightMode ? "text-emerald-700 bg-emerald-50" : "text-[#39ff14]/60 bg-[#39ff14]/10"}`}
                >
                  v{AGENT_CARD.version}
                </span>
              </div>
              <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                {settings.agentDescription || AGENT_CARD.description}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono text-gray-500">
                {AGENT_CARD.preferredTransport}
              </p>
              <p className="text-[10px] font-mono text-gray-600 mt-0.5">
                schema v{AGENT_CARD.schemaVersion}
              </p>
            </div>
          </div>

          {/* URL */}
          <div className="flex items-center gap-2">
            <Globe size={10} className="text-gray-500" />
            <code
              className={`text-[10px] font-mono ${isLightMode ? "text-emerald-700" : "text-[#39ff14]"}`}
            >
              {settings.agentUrl || AGENT_CARD.url}
            </code>
          </div>

          {/* Capabilities */}
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
              Capabilities
            </span>
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

          {/* Authentication */}
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
              Authentication
            </span>
            <div className="flex gap-2 mt-1">
              {AGENT_CARD.authentication.schemes.map((scheme) => (
                <span
                  key={scheme}
                  className="text-[10px] font-mono px-2 py-0.5 border border-[#ff3d7f]/20 bg-[#ff3d7f]/5 text-[#ff3d7f]"
                >
                  {scheme}
                </span>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div>
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
              Skills ({(skills.length > 0 ? skills : AGENT_CARD.skills).length})
            </span>
            <div className="mt-1.5 space-y-1.5">
              {(skills.length > 0 ? skills : AGENT_CARD.skills).map((skill) => (
                <div
                  key={skill.id}
                  className={`p-2 border ${isLightMode ? "bg-white border-gray-200" : "bg-[#0a0a0f] border-[#1e1e2d]"}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono ${isLightMode ? "text-emerald-700" : "text-[#39ff14]/80"}`}
                    >
                      {skill.id}
                    </span>
                    <span
                      className={`text-[11px] font-mono ${isLightMode ? "text-gray-900" : "text-white"}`}
                    >
                      {skill.name}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-gray-500 mt-0.5">
                    {skill.description}
                  </p>
                  {(skill.tags || []).length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(skill.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className={`text-[8px] font-mono px-1 py-0.5 border ${isLightMode ? "bg-gray-100 border-gray-300 text-gray-500" : "bg-[#39ff14]/5 border-[#39ff14]/20 text-[#39ff14]/60"}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {(skill.examples || []).length > 0 && (
                    <p className="text-[9px] font-mono text-gray-600 mt-1 italic">
                      e.g. {(skill.examples || [])[0]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Copy JSON */}
        <button
          className={btnCls + " flex items-center gap-1.5"}
          onClick={() => {
            navigator.clipboard.writeText(
              JSON.stringify(
                {
                  ...AGENT_CARD,
                  name: settings.agentName || AGENT_CARD.name,
                  description:
                    settings.agentDescription || AGENT_CARD.description,
                  url: settings.agentUrl || AGENT_CARD.url,
                  skills:
                    skills.length > 0 ? skills : AGENT_CARD.skills,
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
            <>
              <Check size={11} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={11} />
              Copy JSON
            </>
          )}
        </button>
      </div>
    );
  };

  // ── Slides ──────────────────────────────────────────────────────────────

  const subagentSlides = (): Slide[] => [
    {
      title: "Local First — Your laptop is the brain",
      desc: "The A2A Agent runs on your machine, powered by Mother Brain's Gateway and local MCP. No Cloudflare or Supabase required.",
      body: (
        <div className="space-y-4">
          {renderInfoCard(
            "How it works",
            [
              "While Mother Brain is running, your A2A Agent is online — your laptop IS the server.",
              "Chat history is stored in the local chat database on your machine.",
              "Cloudflare + Supabase are only needed for Persistent Mode (always-online).",
            ],
          )}
          <div className={`p-4 ${cardCls}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonitorSmartphone
                  size={16}
                  className={isLightMode ? "text-gray-500" : "text-gray-400"}
                />
                <div>
                  <p className="text-xs font-mono font-semibold">
                    Prevent Sleep on Lid Close
                  </p>
                  <p className={`text-[10px] font-mono ${textMuted}`}>
                    Mother Brain System Settings · keeps your agent alive with
                    the lid closed
                  </p>
                </div>
              </div>
              {preventSleep === null ? (
                <Loader2 size={16} className="animate-spin text-gray-500" />
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono font-semibold ${preventSleep ? textAccent : textMuted}`}
                  >
                    {preventSleep ? "ON" : "OFF"}
                  </span>
                  {renderToggle(
                    "Prevent Sleep",
                    preventSleep,
                    () => togglePreventSleep(),
                  )}
                </div>
              )}
            </div>
            <p className={`text-[10px] font-mono ${textMuted} mt-2`}>
              {preventSleep
                ? "Your agent stays online when the lid is closed. "
                : "Your laptop sleeping will take your agent offline. "}
              This is the same setting as Mother Brain App Settings → System
              Settings → Prevent Sleep on Lid Close.
            </p>
            {renderAppleSiliconCmd()}
          </div>
        </div>
      ),
    },
    {
      title: "Choose your Sub-Agent",
      desc: "The Sub-Agent IS your A2A Agent. It brings your project's memory, skills, and knowledge to every conversation.",
      body: (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Sub-Agent (Agent Identity)</label>
            <ThemedSelect
              value={settings.botUserId || ""}
              onChange={(v) => handleBotUserSelect(v)}
              options={[
                { value: "", label: "— Select a Sub-Agent —" },
                ...(usersLoading
                  ? [{ value: "", label: "Loading users…", disabled: true }]
                  : []),
                ...projectUsers.map((u) => ({
                  value: u.id,
                  label: `${u.name || u.email} (${u.role})`,
                })),
              ]}
            />
            {settings.botUserId && (
              <p className={`text-[11px] font-mono ${textAccent} mt-1`}>
                Agent identity:{" "}
                <strong>
                  {projectUsers.find((u) => u.id === settings.botUserId)
                    ?.name || settings.botUserEmail}
                </strong>{" "}
                — access token auto-populated
              </p>
            )}
            <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
              Only AI Agent / Sub-Agent users appear here. Their access token
              auto-fills when selected.
            </p>
          </div>
          {settings.botUserId && settings.accessToken && (
            <>
              <div>
                {renderField({
                  label: "User Access Token",
                  type: "password",
                  fieldId: "accessToken",
                  value: settings.accessToken,
                  onChange: (v) => updateField("accessToken", v),
                  placeholder: "Token auto-populated from Sub-Agent",
                  hint: "The Access Token is stored as a Worker secret — never shown in plain text. Use the eye icon to preview it.",
                })}
              </div>
              <div className="flex items-center gap-2">
                <button className={btnCls} onClick={handleRotateToken}>
                  <RefreshCw size={12} /> Rotate token
                </button>
                <span className={`text-[10px] font-mono ${textMuted}`}>
                  Token is stored as a Worker secret — never shown in plain text.
                </span>
              </div>
            </>
          )}
        </div>
      ),
    },
    {
      title: "Name & personality",
      desc: "This is what visitors see and what shapes the agent's voice.",
      body: (
        <div className="space-y-4">
          {renderField({
            label: "Agent Name",
            value: settings.agentName,
            onChange: (v) => updateField("agentName", v),
            placeholder: "e.g. Mother, SupportBot, Ada",
            hint: "Shown in the chat UI and on the agent card.",
          })}
          <div>
            <label className={labelCls}>Agent Description</label>
            <textarea
              className={inputCls}
              style={{ minHeight: 100, resize: "vertical" }}
              value={settings.agentDescription}
              placeholder="What does your agent do? Who is it for?"
              onChange={(e) => updateField("agentDescription", e.target.value)}
            />
            <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
              Feeds the agent card and system prompt. Auto-filled from the
              Sub-Agent's bio when available.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "AI model & response style",
      desc: "Pick the brain, then tune how it talks. These fields belong together.",
      body: (
        <div className="space-y-4">
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
              The model used for agent responses. Populated from your MB App
              Settings.
            </p>
          </div>
          <div>
            <label className={labelCls}>Workers AI Model (fallback)</label>
            <ThemedSelect
              value={settings.cfWorkerModel || "@cf/zai-org/glm-4.7-flash"}
              onChange={(v) => updateField("cfWorkerModel", v)}
              options={CF_MODEL_OPTIONS}
            />
            <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
              Used by the Cloudflare Worker when the Gateway is unreachable.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {renderField({
              label: "Max Tokens",
              type: "number",
              value: String(settings.cfMaxTokens ?? 1024),
              onChange: (v) =>
                updateField("cfMaxTokens", parseInt(v || "0", 10) || 0),
              hint: "Response length (default 1024).",
            })}
            {renderField({
              label: "Temperature",
              type: "number",
              value: String(settings.cfTemperature ?? 0.7),
              onChange: (v) =>
                updateField("cfTemperature", parseFloat(v || "0") || 0),
              hint: "Creativity 0–2 (default 0.7).",
            })}
          </div>
        </div>
      ),
    },
    {
      title: "Skills",
      desc: "What your agent can do — advertised in its agent card.",
      body: renderSkillsSection(),
    },
    {
      title: "Agent Card",
      desc: "The live A2A agent card served at /.well-known/agent.json.",
      body: renderAgentCardSection(),
    },
    {
      title: "MCP Gateway",
      desc: "The Gateway routes your agent's requests to your project's MCP server — the local brain.",
      body: (
        <div className="space-y-4">
          {renderField({
            label: "Gateway URL",
            value: settings.gatewayBaseUrl,
            onChange: (v) => updateField("gatewayBaseUrl", v),
            placeholder: "https://…",
            fetchLabel: "Fetch",
            onFetch: fetchGateway,
            fetching: gatewayFetching,
            hint: "Auto-filled from Mother Brain App Settings when available.",
          })}
          {renderField({
            label: "Gateway Token",
            type: "password",
            fieldId: "gatewayToken",
            value: settings.gatewayToken,
            onChange: (v) => updateField("gatewayToken", v),
            placeholder: "mb_…",
            fetchLabel: "Fetch",
            onFetch: fetchGateway,
            fetching: gatewayFetching,
            hint: "The project API key (Master Key). Auto-filled when available.",
          })}
          {renderInfoCard(
            "What is the Gateway?",
            [
              "It connects your agent to the project's knowledge base, memories, and MCP tools.",
              "Local First: while Mother Brain runs, the local Gateway serves your agent from this machine.",
            ],
          )}
        </div>
      ),
    },
    {
      title: "Projects",
      desc: "Your agent is deployed from the Mother Brain project — the primary project is locked.",
      body: (
        <div className="space-y-4">
          {/* Locked primary project */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className={labelCls + " mb-0!"}>
                Primary Project (locked)
              </label>
              <span className={`text-[10px] font-mono ${textMuted}`}>🔒</span>
            </div>
            <input
              type="text"
              className={inputCls + " opacity-60 cursor-not-allowed"}
              value={settings.primaryProjectId || activeProjectId || ""}
              readOnly
              disabled
              title="Locked — the A2A Agent Invention is deployed from the Mother Brain project"
            />
            <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
              🔒 Locked — the A2A Agent is deployed from the Mother Brain
              project, so its primary project cannot be changed.
            </p>
          </div>

          {/* Additional Context Projects (Brainstorm Mode) */}
          <div>
            <label className={labelCls}>
              Additional Context Projects (Brainstorm Mode)
            </label>
            <div
              className={`space-y-1.5 mt-1 max-h-40 overflow-y-auto p-2 ${cardCls}`}
            >
              {projects.length === 0 && (
                <p className="text-[10px] font-mono text-gray-600">
                  Loading projects...
                </p>
              )}
              {projects.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 px-2 py-1 transition-colors cursor-pointer ${isLightMode ? "hover:bg-gray-100" : "hover:bg-[#13131f]"}`}
                >
                  <input
                    type="checkbox"
                    checked={settings.additionalProjectIds.includes(p.id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...settings.additionalProjectIds, p.id]
                        : settings.additionalProjectIds.filter(
                            (id) => id !== p.id,
                          );
                      updateField("additionalProjectIds", ids);
                    }}
                    className="accent-[#39ff14]"
                  />
                  <span
                    className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}
                  >
                    {p.name}
                  </span>
                  {(settings.primaryProjectId || activeProjectId) === p.id && (
                    <span
                      className={`text-[10px] font-mono ml-auto ${isLightMode ? "text-emerald-600" : "text-[#39ff14]/60"}`}
                    >
                      primary
                    </span>
                  )}
                </label>
              ))}
            </div>
            <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
              Toggle on other projects to stream unified knowledge into your
              agent (Brainstorm Mode).
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Local chat database",
      desc: "Conversations are stored locally on your laptop. Start the database to begin.",
      body: (
        <div className="space-y-4">
          <div className={`p-4 ${cardCls}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database
                  size={16}
                  className={
                    settings.localPgStatus === "running"
                      ? textAccent
                      : textMuted
                  }
                />
                <div>
                  <p className="text-xs font-mono font-semibold">
                    Local Postgres
                  </p>
                  <p
                    className={`text-[10px] font-mono ${
                      settings.localPgStatus === "running"
                        ? textAccent
                        : settings.localPgStatus === "starting"
                          ? "text-yellow-400"
                          : textMuted
                    }`}
                  >
                    {settings.localPgStatus === "running"
                      ? "Running"
                      : settings.localPgStatus === "starting"
                        ? "Starting…"
                        : "Stopped"}
                  </p>
                </div>
              </div>
              <button
                className={btnCls}
                onClick={handleStartDb}
                disabled={dbBusy || settings.localPgStatus === "starting"}
              >
                {dbBusy || settings.localPgStatus === "starting" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : settings.localPgStatus === "running" ? (
                  "Running"
                ) : (
                  "Start database"
                )}
              </button>
            </div>
          </div>
          {/* VoyageAI Vector Embeddings */}
          <div className={`p-4 ${cardCls}`}>
            <div className="flex items-center gap-2 mb-3">
              <Wand2
                size={16}
                className={isLightMode ? "text-purple-600" : "text-purple-400"}
              />
              <p className="text-xs font-mono font-semibold">
                VoyageAI Vector Embeddings
              </p>
            </div>
            <p className={`text-[10px] font-mono ${textMuted} mb-3`}>
              Vector embedding is vital for the performance of the A2A Agent.
              It powers semantic search across chat history and knowledge.
            </p>
            <div className="space-y-3">
              {renderField({
                label: "VoyageAI API Key",
                type: "password",
                fieldId: "voyageApiKey",
                value: settings.voyageApiKey,
                onChange: (v) => updateField("voyageApiKey", v),
                placeholder: "voyage_…",
                hint: "Your VoyageAI API key for generating vector embeddings.",
              })}
              <div>
                <label className={labelCls}>Embedding Model</label>
                <ThemedSelect
                  value={settings.voyageModel || "voyage-3-lite"}
                  onChange={(v) => updateField("voyageModel", v)}
                  options={[
                    { value: "voyage-3-lite", label: "voyage-3-lite (fast, 1024d)" },
                    { value: "voyage-3", label: "voyage-3 (balanced, 1024d)" },
                    { value: "voyage-3-large", label: "voyage-3-large (best, 3072d)" },
                    { value: "voyage-code-3", label: "voyage-code-3 (code, 1024d)" },
                  ]}
                />
                <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                  Higher dimensions = better accuracy but more storage.
                </p>
              </div>
            </div>
          </div>
          {renderInfoCard(
            "Supabase? Not required here.",
            [
              "This minimum-requirements path uses the LOCAL database only.",
              "Add Supabase in Persistent Mode when you want cloud history.",
            ],
          )}
        </div>
      ),
    },
    {
      title: "You're ready 🎉",
      desc: "Your agent has everything it needs to run, locally first.",
      body: (
        <div className="space-y-4">
          <div className={`p-4 ${cardCls} space-y-2.5`}>
            {minChecks.map((c) => renderCheckRow(c.done, c.label))}
          </div>
          <div>
            <p className={`text-[11px] font-mono ${textMuted} mb-2`}>
              Next — deploy your agent anywhere:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={
                  primaryBtnCls + " flex items-center justify-center gap-1.5"
                }
                onClick={() => openNodeModal("website")}
              >
                <Globe size={14} /> Deploy to Website
              </button>
              <button
                type="button"
                className={btnCls + " flex items-center justify-center gap-1.5 py-2"}
                onClick={() => openNodeModal("persistent")}
              >
                <Cloud size={14} /> Persistent Mode
              </button>
              <button
                type="button"
                className={btnCls + " flex items-center justify-center gap-1.5 py-2"}
                onClick={() => openNodeModal("telegram")}
              >
                <Send size={14} /> Telegram
              </button>
              <button
                type="button"
                className={btnCls + " flex items-center justify-center gap-1.5 py-2"}
                onClick={() => openNodeModal("chat")}
              >
                <MessageSquare size={14} /> Chat Widget
              </button>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const websiteSlides = (): Slide[] => [
    {
      title: "How it works",
      desc: "Put your agent on your website with an A2A endpoint.",
      body: (
        <div className="space-y-4">
          {renderInfoCard(
            "The good news",
            [
              "Supabase is NOT required — the local chat database and local MCP power your agent while your laptop is on.",
              "The chat UI is optional (a gift). You can build your own UI and wire it up via the A2A protocol.",
            ],
          )}
          {renderInfoCard(
            "You will need",
            [
              "A Cloudflare account (free) to host the A2A endpoint Worker.",
              "A public HTTPS URL for your endpoint. Webhooks (Telegram, etc.) also require a public domain.",
            ],
            "warn",
          )}
        </div>
      ),
    },
    {
      title: "Your endpoint URL",
      desc: "The public address where your A2A Agent lives.",
      body: (
        <div className="space-y-4">
          {renderField({
            label: "Agent URL",
            value: settings.agentUrl,
            onChange: (v) => updateField("agentUrl", v),
            placeholder: "https://agent.yourdomain.com",
            hint: "Your A2A endpoint (the deployed Worker URL or your custom domain).",
          })}
          {renderInfoCard(
            "Domain note",
            [
              "The Cloudflare Worker gives you a free *.workers.dev URL you can start with.",
              "For production, point your own domain (HTTPS) at the endpoint — this is also required for Telegram webhooks.",
            ],
          )}
        </div>
      ),
    },
    {
      title: "Your website",
      desc: "So links inside chat messages resolve to your real pages.",
      body: (
        <div className="space-y-4">
          {renderField({
            label: "Website URL",
            value: settings.websiteUrl,
            onChange: (v) => updateField("websiteUrl", v),
            placeholder: "https://yourwebsite.com",
            hint: "Used by the chat widget to turn relative links into absolute ones.",
          })}
        </div>
      ),
    },
    {
      title: "Cloudflare account",
      desc: "The Worker that hosts your A2A endpoint, available 24/7.",
      body: (
        <div className="space-y-4">
          {renderField({
            label: "Worker Name",
            value: settings.workerName,
            onChange: (v) => updateField("workerName", v),
            placeholder: "a2a-endpoint",
            hint: "The Cloudflare Worker name for your A2A endpoint.",
          })}
          {renderField({
            label: "Cloudflare Account ID",
            value: settings.cloudflareAccountId,
            onChange: (v) => updateField("cloudflareAccountId", v),
            placeholder: "from Cloudflare Dashboard",
            fetchLabel: "Fetch",
            onFetch: fetchCloudflare,
            fetching: cfFetching,
            hint: "Cloudflare Dashboard → Workers & Pages → Overview.",
          })}
          {renderField({
            label: "Cloudflare API Token",
            type: "password",
            value: settings.cfApiToken,
            onChange: (v) => updateField("cfApiToken", v),
            placeholder: "your API token",
            fetchLabel: "Fetch",
            onFetch: fetchCloudflare,
            fetching: cfFetching,
            hint: "Stored as a secret — never shown in plain text.",
          })}
        </div>
      ),
    },
    {
      title: "Deploy",
      desc: "Save everything and push your agent to Cloudflare.",
      body: (
        <div className="space-y-4">
          <div className={`p-4 ${cardCls} space-y-2`}>
            {renderCheckRow(!!settings.agentUrl, "Endpoint URL", settings.agentUrl || "—")}
            {renderCheckRow(!!settings.workerName, "Worker name", settings.workerName || "—")}
            {renderCheckRow(
              !!(settings.cloudflareAccountId && settings.cfApiToken),
              "Cloudflare credentials",
              settings.cloudflareAccountId ? "Account ID set" : "—",
            )}
          </div>
          <button
            type="button"
            className={
              primaryBtnCls +
              " w-full flex items-center justify-center gap-2"
            }
            onClick={handleDeploy}
            disabled={deploying}
          >
            {deploying ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Deploying…
              </>
            ) : (
              <>
                <Rocket size={16} />
                Deploy to Cloudflare
              </>
            )}
          </button>
          {deployMsg && (
            <p className={`text-[11px] font-mono ${textAccent} text-center`}>
              {deployMsg}
            </p>
          )}
          {deployError && (
            <div
              className={`rounded-lg border p-3 ${isLightMode ? "border-red-300 bg-red-50" : "border-red-500/30 bg-red-500/10"}`}
            >
              <p
                className={`text-[11px] font-mono ${isLightMode ? "text-red-700" : "text-red-400"}`}
              >
                {deployError}
              </p>
            </div>
          )}
          {renderInfoCard(
            "Advanced",
            [
              "For the full deploy options (secrets, direct Cloudflare API push), open Settings → Deploy.",
            ],
          )}
        </div>
      ),
    },
  ];

  const chatSlides = (): Slide[] => {
    const endpoint = settings.agentUrl || "https://a2a.yourdomain.com";
    const agentName = settings.agentName || "AI Assistant";
    const gc1 = settings.heroGradientColor1 || "#00dc82";
    const gc2 = settings.heroGradientColor2 || "#a78bfa";
    const brand = settings.widgetBranding || "";
    const logo = settings.logoUrl || "";
    const embedSnippet = [
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
      '          gradientColor1="' + gc1 + '"',
      '          gradientColor2="' + gc2 + '"',
      '          branding="' + brand + '"',
      "          onSubmit={(q) => { setQuery(q); setChatOpen(true); }}",
      "          onOpenChat={() => setChatOpen(true)}",
      "        />",
      "      )}",
      "      {chatOpen && (",
      "        <ChatApp",
      '          endpoint="' + endpoint + '"',
      '          agentName="' + agentName + '"',
      logo ? '          logoUrl="' + logo + '"' : null,
      "          initialQuery={query}",
      "          onClose={() => setChatOpen(false)}",
      "        />",
      "      )}",
      "    </>",
      "  );",
      "}",
    ].filter(Boolean).join("\n");
    return [
    {
      title: "Chat Widget Bundle",
      desc: "The Hero Search chat widget is a bundle — completely optional.",
      body: (
        <div className="space-y-4">
          {renderInfoCard(
            "Two ways to add chat",
            [
              "1. Use the built-in widget: a drop-in script that turns any search field into the fullscreen A2A chat UI.",
              "2. Build your own UI and talk to your endpoint directly using the A2A protocol (JSON-RPC).",
            ],
          )}
          <p className={`text-[11px] font-mono ${textMuted}`}>
            Either way, your agent endpoint does the thinking — the widget is
            just the face.
          </p>
        </div>
      ),
    },
    {
      title: "Style it",
      desc: "Colors and branding for your chat widget.",
      body: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {renderField({
              label: "Accent Color",
              value: settings.widgetColor,
              onChange: (v) => updateField("widgetColor", v),
            })}
            {renderField({
              label: "Branding",
              value: settings.widgetBranding,
              onChange: (v) => updateField("widgetBranding", v),
              placeholder: "Your Brand",
            })}
            {renderField({
              label: "Hero Gradient 1",
              value: settings.heroGradientColor1,
              onChange: (v) => updateField("heroGradientColor1", v),
            })}
            {renderField({
              label: "Hero Gradient 2",
              value: settings.heroGradientColor2,
              onChange: (v) => updateField("heroGradientColor2", v),
            })}
          </div>
          <div
            className={`p-3 rounded-lg border ${isLightMode ? "border-gray-200 bg-gray-50" : "border-[#1e1e2d] bg-[#0a0a0f]"}`}
            style={{
              background: `linear-gradient(135deg, ${settings.heroGradientColor1}, ${settings.heroGradientColor2})`,
            }}
          >
            <p
              className="text-[10px] font-mono"
              style={{ color: "rgba(0,0,0,0.7)" }}
            >
              Live gradient preview — {settings.heroGradientColor1} →{" "}
              {settings.heroGradientColor2}
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Display Options",
      desc: "Control what visitors see inside the chat widget.",
      body: (
        <div className="space-y-3">
          <label
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer ${isLightMode ? "hover:bg-gray-100" : "hover:bg-[#13131f]"}`}
          >
            <input
              type="checkbox"
              checked={settings.showMcpToolCalls}
              onChange={() => updateField("showMcpToolCalls", !settings.showMcpToolCalls)}
              className="accent-[#39ff14]"
            />
            <span className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
              Show MCP Tool Calls
            </span>
          </label>
          <label
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer ${isLightMode ? "hover:bg-gray-100" : "hover:bg-[#13131f]"}`}
          >
            <input
              type="checkbox"
              checked={settings.showMultiStepThinking}
              onChange={() => updateField("showMultiStepThinking", !settings.showMultiStepThinking)}
              className="accent-[#39ff14]"
            />
            <span className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
              Show Multi-Step Thinking
            </span>
          </label>
          <label
            className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer ${isLightMode ? "hover:bg-gray-100" : "hover:bg-[#13131f]"}`}
          >
            <input
              type="checkbox"
              checked={settings.showReasoningSteps}
              onChange={() => updateField("showReasoningSteps", !settings.showReasoningSteps)}
              className="accent-[#39ff14]"
            />
            <span className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
              Show Reasoning Steps
            </span>
          </label>
          {renderInfoCard(
            "What are Display Options?",
            [
              "Show MCP Tool Calls — visitors see each tool the agent uses (search_codebase, search_memories, etc.).",
              "Show Multi-Step Thinking — visitors see the agent's plan before it acts.",
              "Show Reasoning Steps — visitors see the agent's reasoning chain (can be verbose, so off by default).",
            ],
          )}
        </div>
      ),
    },
    {
      title: "Build Widget",
      desc: "Download the motherbrain-widget.zip source bundle — drop it into your React/Vite/TypeScript project.",
      body: (
        <div className="space-y-4">
          <div
            className={`flex items-start gap-2 p-3 border ${isLightMode ? "bg-gray-50 border-gray-200" : "bg-[#13131f] border-[#1e1e2d]"}`}
          >
            <Info
              size={12}
              className={`mt-0.5 shrink-0 ${isLightMode ? "text-emerald-600" : "text-[#39ff14]/60"}`}
            />
            <p
              className={`text-[11px] font-mono leading-relaxed ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
            >
              Download a{" "}
              <strong
                className={isLightMode ? "text-emerald-700" : "text-[#39ff14]"}
              >
                motherbrain-widget.zip
              </strong>{" "}
              — a ZIP of React/TypeScript source components matching this
              Preview. Includes Hero Search, Chat overlay, markdown renderer,
              and Brain icon. Unzip into your project and import.
            </p>
          </div>

          {/* Build + Download buttons */}
          <div className="flex items-center gap-2">
            <button
              className={primaryBtnCls + " flex items-center gap-2"}
              disabled={isBuildingWidget}
              onClick={handleBuildWidget}
            >
              {isBuildingWidget ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Building...
                </>
              ) : (
                <>
                  <Code2 size={14} />
                  Build Widget
                </>
              )}
            </button>

            {widgetBuildUrl && (
              <button
                className={btnCls + " flex items-center gap-1.5"}
                onClick={handleBuildWidget}
              >
                <Download size={12} />
                Download
              </button>
            )}
          </div>

          {widgetBuildUrl && (
            <>
              <div>
                <label className={labelCls}>Embed Code</label>
                <div
                  className={`p-3 border font-mono text-[11px] leading-relaxed overflow-x-auto ${isLightMode ? "bg-gray-50 border-gray-200 text-gray-700" : "bg-[#0a0a0f] border-[#1e1e2d] text-gray-300"}`}
                >
                  <pre className="whitespace-pre-wrap break-all m-0">
                    {embedSnippet}
                  </pre>
                </div>
                <button
                  className={`${btnCls} mt-1 flex items-center gap-1`}
                  onClick={() => navigator.clipboard.writeText(embedSnippet)}
                >
                  <Copy size={10} />
                  Copy
                </button>
              </div>
            </>
          )}

          {!settings.agentUrl && (
            <p className={`text-[10px] font-mono ${textMuted} text-center`}>
              Tip: set your Agent URL first (Deploy to Website) so the snippet
              is ready to paste.
            </p>
          )}
        </div>
      ),
    },
  ];
  };

  const persistentSlides = (): Slide[] => [
    {
      title: "Why Persistent?",
      desc: "Local First keeps the agent online while your laptop is on. Persistent keeps it online 24/7.",
      body: (
        <div className="space-y-4">
          {renderInfoCard(
            "What Persistent Mode adds",
            [
              "Cloudflare Worker: hosts your A2A endpoint around the clock.",
              "Supabase: stores chat history in the cloud, so conversations survive reboots.",
              "Prevent Sleep stays recommended as a belt-and-braces measure.",
            ],
          )}
          <div className={`p-4 ${cardCls} space-y-2`}>
            {renderCheckRow(
              !!settings.lastDeployedAt || settings.deployStatus === "deployed",
              "Cloudflare Worker deployed",
              settings.lastDeployedAt
                ? `Deployed ${timeAgo(settings.lastDeployedAt)}`
                : "Not deployed yet",
            )}
            {renderCheckRow(
              !!(settings.supabaseUrl && settings.supabaseServiceKey),
              "Supabase chat database",
              settings.supabaseUrl || "Not configured",
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Supabase chat database",
      desc: "Cloud storage for your conversations.",
      body: (
        <div className="space-y-4">
          {renderField({
            label: "Supabase URL",
            value: settings.supabaseUrl,
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
            value: settings.supabaseServiceKey,
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
              value={settings.dbProvider}
              onChange={(v) => updateField("dbProvider", v)}
              options={[
                { value: "local-pg", label: "Local Postgres Only" },
                { value: "supabase", label: "Supabase Only" },
                { value: "both", label: "Both (Local + Remote Sync)" },
              ]}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono">Sync to Supabase</p>
              <p className={`text-[10px] font-mono ${textMuted}`}>
                Mirror local chats to the cloud.
              </p>
            </div>
            {renderToggle(
              "Sync to Supabase",
              !!settings.supabaseSyncEnabled,
              (v) => updateField("supabaseSyncEnabled", v),
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Cloudflare",
      desc: "The Worker keeps your endpoint reachable even when your laptop sleeps.",
      body: (
        <div className="space-y-4">
          {settings.lastDeployedAt || settings.deployStatus === "deployed" ? (
            <div className={`p-4 ${cardCls} space-y-2`}>
              {renderCheckRow(true, "Worker deployed", settings.workerName || "a2a-endpoint")}
              <p className={`text-[10px] font-mono ${textMuted}`}>
                Deployed {timeAgo(settings.lastDeployedAt)} · {settings.agentUrl || "no endpoint URL set"}
              </p>
            </div>
          ) : (
            <>
              {renderInfoCard(
                "Not deployed yet",
                [
                  "Persistent Mode needs your A2A endpoint hosted on Cloudflare.",
                  "Finish the Deploy to Website flow first — it takes 5 minutes.",
                ],
                "warn",
              )}
              <button
                type="button"
                className={
                  primaryBtnCls + " w-full flex items-center justify-center gap-2"
                }
                onClick={() => openNodeModal("website")}
              >
                <Globe size={16} /> Go to Deploy to Website
              </button>
            </>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-mono">Prevent Sleep on Lid Close</p>
              <p className={`text-[10px] font-mono ${textMuted}`}>
                Mother Brain System Settings
              </p>
            </div>
            {preventSleep === null ? (
              <Loader2 size={16} className="animate-spin text-gray-500" />
            ) : (
              renderToggle("Prevent Sleep", preventSleep, () =>
                togglePreventSleep(),
              )
            )}
          </div>
          {renderAppleSiliconCmd()}
        </div>
      ),
    },
    {
      title: "Persistent checklist",
      desc: "Everything needed to keep your agent online 24/7.",
      body: (
        <div className={`p-4 ${cardCls} space-y-2.5`}>
          {renderCheckRow(
            !!(settings.agentUrl && (settings.lastDeployedAt || settings.deployStatus === "deployed")),
            "Cloudflare Worker deployed",
            settings.agentUrl || "Not deployed",
          )}
          {renderCheckRow(
            !!(settings.supabaseUrl && settings.supabaseServiceKey),
            "Supabase chat database",
            settings.supabaseUrl || "Not configured",
          )}
          {renderCheckRow(
            !!settings.primaryProjectId && !!settings.gatewayToken,
            "Gateway + project connected",
            settings.primaryProjectId || "—",
          )}
          {renderCheckRow(preventSleep === true, "Prevent Sleep on Lid Close")}
        </div>
      ),
    },
  ];

  const telegramSlides = (): Slide[] => [
    {
      title: "How Telegram works",
      desc: "Your agent appears as a Telegram bot people can DM.",
      body: (
        <div className="space-y-4">
          {renderInfoCard(
            "Requirements",
            [
              "A bot token from @BotFather (2 minutes, free).",
              "Your A2A endpoint deployed on a public HTTPS domain — Telegram webhooks need it.",
            ],
          )}
          {!settings.agentUrl && (
            <button
              type="button"
              className={
                primaryBtnCls + " w-full flex items-center justify-center gap-2"
              }
              onClick={() => openNodeModal("website")}
            >
              <Globe size={16} /> Deploy your endpoint first
            </button>
          )}
          <p className={`text-[11px] font-mono ${textMuted}`}>
            Note: a custom domain isn't strictly required to run the agent
            locally — it IS required for webhook channels like Telegram.
          </p>
        </div>
      ),
    },
    {
      title: "Create your bot",
      desc: "Get a token from Telegram's BotFather.",
      body: (
        <div className="space-y-4">
          <ol className={`text-[11px] font-mono ${textMuted} space-y-1.5`}>
            <li>1. Open Telegram and message{" "}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                @BotFather
              </a>
            </li>
            <li>2. Send /newbot and follow the prompts</li>
            <li>3. Copy the HTTP API token it gives you (format: 123456:ABC…)</li>
          </ol>
          {renderField({
            label: "Telegram Bot Token",
            type: "password",
            value: settings.telegramBotToken,
            onChange: (v) => updateField("telegramBotToken", v),
            placeholder: "123456789:AA…",
            hint: "Stored as a Worker secret — never shown in plain text.",
          })}
        </div>
      ),
    },
    {
      title: "Register the webhook",
      desc: "Point Telegram at your A2A endpoint.",
      body: (
        <div className="space-y-4">
          <div className={`p-4 ${cardCls}`}>
            <p className={`text-[10px] font-mono ${textMuted}`}>
              Webhook URL (needs your endpoint deployed)
            </p>
            <p className="text-xs font-mono break-all">
              {webhookUrl || "Set your Agent URL in Deploy to Website first."}
            </p>
          </div>
          <button
            type="button"
            className={
              primaryBtnCls +
              " w-full flex items-center justify-center gap-2"
            }
            onClick={registerTelegramWebhook}
            disabled={!settings.telegramBotToken || !webhookUrl}
          >
            {webhookStatus.state === "testing" ||
            webhookStatus.state === "registering" ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {webhookStatus.state === "testing"
                  ? "Verifying token…"
                  : "Registering webhook…"}
              </>
            ) : (
              <>
                <Send size={16} />
                Register Webhook
              </>
            )}
          </button>
          {webhookStatus.message && (
            <p
              className={`text-[11px] font-mono ${
                webhookStatus.state === "success"
                  ? textAccent
                  : webhookStatus.state === "error"
                    ? (isLightMode ? "text-red-700" : "text-red-400")
                    : textMuted
              }`}
            >
              {webhookStatus.message}
            </p>
          )}
        </div>
      ),
    },
    {
      title: "You're live on Telegram 🎉",
      desc: "Try it out.",
      body: (
        <div className="space-y-4">
          {renderInfoCard(
            "Test it",
            [
              "Open Telegram, search for your bot's @username, and send a message.",
              "Your agent answers with the same brain as your website chat.",
              "Group chats and multi-user support are on the roadmap.",
            ],
          )}
          {renderCheckRow(
            !!settings.telegramBotToken,
            "Bot token configured",
          )}
          {renderCheckRow(
            webhookStatus.state === "success",
            "Webhook registered",
            webhookStatus.state === "success"
              ? "Telegram is pointing at your endpoint"
              : "Run the registration step above",
          )}
        </div>
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────

  const nodeMeta: Record<
    NodeId,
    { title: string; blurb: string; icon: React.ElementType }
  > = {
    subagent: {
      title: "Sub-Agent — Minimum Requirements",
      blurb: "Everything your agent needs to run. Local First.",
      icon: Bot,
    },
    website: {
      title: "Deploy to Website",
      blurb: "Put your A2A endpoint on your domain.",
      icon: Globe,
    },
    chat: {
      title: "Chat Widget Bundle",
      blurb: "The drop-in chat UI with Display Options — or build your own.",
      icon: MessageSquare,
    },
    persistent: {
      title: "Persistent Mode",
      blurb: "Keep your agent online 24/7 with Cloudflare + Supabase.",
      icon: Cloud,
    },
    telegram: {
      title: "Telegram",
      blurb: "Chat with your agent through a Telegram bot.",
      icon: Send,
    },
  };

  const slidesFor = (id: NodeId): Slide[] => {
    switch (id) {
      case "subagent":
        return subagentSlides();
      case "website":
        return websiteSlides();
      case "chat":
        return chatSlides();
      case "persistent":
        return persistentSlides();
      case "telegram":
        return telegramSlides();
    }
  };

  const modal = openNode ? (
    <div
      className={
        "fixed inset-0 z-50 flex items-center justify-center p-4" +
        (isLightMode ? " bg-black/20" : " bg-black/60")
      }
      onClick={closeNodeModal}
    >
      <div
        className={`w-full flex flex-col overflow-y-auto rounded-lg border shadow-2xl ${isLightMode ? "border-gray-200 bg-white" : "border-[#1e1e2d] bg-[#0a0a0f]"}`}
        style={{ maxWidth: 640, maxHeight: "92vh" }}
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
              className={btnCls + " hidden sm:flex items-center gap-1"}
              onClick={() => activateInventionTab("Settings")}
              title="Switch to the classic settings screen"
            >
              <Settings size={12} /> Classic Settings
            </button>
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

        {/* Slide track — one field/step per slide, slides right→left */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
            <div
              className="flex h-full transition-transform duration-300 ease-out"
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

          {/* Recipes — inline setup guide */}
          {recipeOpen && (
            <div
              className={`mx-6 mb-3 rounded-lg border p-3 max-h-48 overflow-y-auto ${isLightMode ? "border-gray-200 bg-gray-50" : "border-[#1e1e2d] bg-[#0a0a0f]"}`}
            >
              <p
                className={`text-[10px] font-mono uppercase tracking-wider mb-2 flex items-center gap-1 ${textMuted}`}
              >
                <BookOpen size={11} /> Setup Guide (Mother Brain Recipes)
              </p>
              {recipeLoading ? (
                <p className={`text-[11px] font-mono ${textMuted}`}>
                  Loading guide…
                </p>
              ) : (
                <pre className="text-[10px] font-mono whitespace-pre-wrap text-gray-400">
                  {recipeText}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer — Back / progress / Next */}
        <div
          className={`flex items-center justify-between px-6 py-3.5 border-t shrink-0 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
        >
          <button
            type="button"
            className={btnCls + " flex items-center gap-1"}
            onClick={() => setSlide((s) => Math.max(0, s - 1))}
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
              className={btnCls + " flex items-center gap-1"}
              onClick={toggleRecipe}
              disabled={recipeLoading}
            >
              <BookOpen size={12} />
              {recipeOpen ? "Hide guide" : "Setup guide"}
            </button>
          </div>

          {slide < slidesFor(openNode).length - 1 ? (
            <button
              type="button"
              className={primaryBtnCls + " flex items-center gap-1"}
              onClick={() => setSlide((s) => s + 1)}
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              className={primaryBtnCls + " flex items-center gap-1"}
              onClick={closeNodeModal}
            >
              <Check size={14} /> Finish
            </button>
          )}
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
              <h1 className="text-lg font-mono font-bold">Setup Wizard</h1>
              <p className={`text-[11px] font-mono ${textMuted}`}>
                Get your A2A Agent running in minutes — local first.
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
              Switch to Classic Settings
            </button>
          </div>
        </div>

        {/* Hub & Spoke — pure SVG canvas (matches MB Canvas / MVA screens) */}
        <div className="mx-auto w-full mt-2">
          {renderHubCanvas()}
        </div>

        {/* Legend / quick actions */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2 mb-6">
          <span className={`text-[10px] font-mono ${textMuted}`}>
            Start with the center node — then deploy anywhere:
          </span>
          <button
            type="button"
            className={btnCls + " flex items-center gap-1"}
            onClick={() => openNodeModal("subagent")}
          >
            <Sparkles size={12} /> Start Setup
          </button>
        </div>
      </div>

      {modal}
    </div>
  );
};

export default A2aWizard;
