// ---------------------------------------------------------------------------
// A2A Agent Invention — Purpose-Built Settings Screen
// ---------------------------------------------------------------------------
// Replaces the generic JSON config preview in InventionsView with a
// structured form tailored to the A2A Agent plugin.
//
// This component is loaded by InventionsView when invention.type === 'a2a-agent'.
// It is NOT hardcoded into Mother Brain's core — it lives inside the invention.
// ---------------------------------------------------------------------------

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  MessageSquare,
  Globe,
  Shield,
  FolderKanban,
  Database,
  Rocket,
  Cpu,
  ToggleLeft,
  ToggleRight,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Copy,
  FileJson,
  Info,
  Save,
  RefreshCw,
  CheckCircle,
  XCircle,
  Code2,
  Download,
  FileText,
  FolderOpen,
  CloudOff,
  KeyRound,
  Send,
} from "lucide-react";
import ThemedSelect from "../../../components/ThemedSelect";
import { saveSupabaseCreds } from "../shared/supabaseConfig";

// Widget bundles served via MB app /resource/ endpoint

// ── Types ────────────────────────────────────────────────────────────────

interface A2aSettings {
  agentName: string;
  agentDescription: string;
  agentUrl: string;
  agentProvider: string;
  agentSkillsJson: string;
  accessToken: string;
  botUserEmail: string;
  botUserId: string;
  gatewayToken: string;
  // MCP Gateway URL — the Cloudflare Worker that routes AI requests.
  // Optional: when unset, the Worker falls through to offline fallback.
  gatewayBaseUrl: string;
  primaryProjectId: string;
  additionalProjectIds: string[];
  dbProvider: "local-pg" | "supabase" | "both";
  localPgStatus: "stopped" | "starting" | "running";
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseSyncEnabled: boolean;
  // ── Offline Fallback (Project Knowledge Base) ──
  // Points at the Mother Brain PROJECT's Supabase (different from the A2A
  // Agent's own chat-history Supabase above). When the MCP Gateway is
  // unreachable, the Worker queries this DB directly to retrieve knowledge.
  mbSupabaseUrl: string;
  mbSupabaseServiceKey: string;
  mbProjectId: string;
  mbSupabaseAccessToken: string; // used to auto-fetch the service key via Management API
  // ── Website MCP Server (motherbrain.app) ──
  // Optional. When set, exposes website.* tools (read_page, navigate,
  // get_account, etc.) to the A2A agent. When unset, the agent silently
  // operates without website tools (graceful degradation).
  mcpBaseUrl: string;
  mcpApiKey: string;
  websiteUrl: string;
  // License Key Resolution (Encore Subscriptions API)
  // Optional — empty = disabled, license keys fall back to license:{key}
  encoreApiUrl: string;
  encoreApiKey: string;
  // JWT Session Token Verification (Dual-Path Auth)
  // Optional but required for JWT verification. Empty = fail-closed
  // (JWT-bearing requests get 503; license-key + anonymous paths work).
  jwtSecret: string;
  // Telegram Bot Integration
  // Optional. When set, enables the /webhook/telegram endpoint so visitors
  // can chat with the agent in Telegram. Empty = disabled.
  telegramBotToken: string;
  widgetColor: string;
  widgetBranding: string;
  heroGradientColor1: string;
  heroGradientColor2: string;
  cloudflareAccountId: string;
  cfApiToken: string;
  workerName: string;
  deployStatus: "not-deployed" | "deploying" | "deployed" | "failed";
  lastDeployedAt: string | null;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingApiKey: string;
  embeddingDimensions: number;
  skills: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
    inputModes: string[];
    outputModes: string[];
  }[];
  // Display toggles
  showToolCalls: boolean;
  showThinking: boolean;
  showReasoning: boolean;
  logoUrl: string;
  // Health check fields
  lastEndpointPingAt: string | null;
  lastEndpointPingOk: boolean;
  lastCfCheckAt: string | null;
  lastCfDeployedAt: string | null;
  // AI Model selection
  aiModel: string; // LLM model ID from MB App Settings (default: "default")
  // Cloudflare Workers AI Model — used for offline fallback or force-override
  cfWorkerModel: string; // e.g. "@cf/zai-org/glm-4.7-flash"
  // When true, bypasses the MCP Gateway and uses Cloudflare Workers AI for all inference
  forceCfWorker: boolean;
  // Knowledge Base folder selection
  kbFolder: string; // sub-folder path within project root for CF Worker KB files
  kbIncludeFiles: Record<string, boolean>; // toggle: { "SOUL.md": true, "SECURITY.md": true, ... }
}

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

interface A2aAgentSettingsProps {
  invention: InventionConfig;
  onUpdate: (updates: Partial<InventionConfig>) => void;
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
}

// ── Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: A2aSettings = {
  agentName: "AI Assistant",
  agentDescription: "AI assistant",
  agentUrl: "",
  agentProvider: "",
  agentSkillsJson: "",
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
  // Offline fallback defaults (empty — auto-populated from project config)
  mbSupabaseUrl: "",
  mbSupabaseServiceKey: "",
  mbProjectId: "",
  mbSupabaseAccessToken: "",
  // Website MCP Server (optional — empty = disabled, graceful degradation)
  mcpBaseUrl: "",
  mcpApiKey: "",
  websiteUrl: "",
  // License Key Resolution (optional — empty = disabled)
  encoreApiUrl: "",
  encoreApiKey: "",
  // JWT Session Token Verification (optional — empty = fail-closed)
  jwtSecret: "",
  // Telegram Bot Integration (optional — empty = disabled)
  telegramBotToken: "",
  widgetColor: "#39ff14",
  widgetBranding: "",
  heroGradientColor1: "#00dc82",
  heroGradientColor2: "#a78bfa",
  cloudflareAccountId: "",
  cfApiToken: "",
  workerName: "a2a-endpoint",
  deployStatus: "not-deployed",
  lastDeployedAt: null,
  embeddingProvider: "voyage-ai",
  embeddingModel: "voyage-4-large",
  embeddingApiKey: "",
  embeddingDimensions: 1024,
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
  showToolCalls: true,
  showThinking: false,
  showReasoning: false,
  logoUrl: "",
  // Health check defaults
  lastEndpointPingAt: null,
  lastEndpointPingOk: false,
  lastCfCheckAt: null,
  lastCfDeployedAt: null,
  // AI Model — "default" routes to user's active LLM in MB App Settings
  aiModel: "default",
  // Cloudflare Workers AI Model — cheap fallback with function calling
  cfWorkerModel: "@cf/zai-org/glm-4.7-flash",
  // Force Cloudflare Workers AI — skips Gateway entirely
  forceCfWorker: false,
  // Knowledge Base folder — relative to project root
  kbFolder: "",
  kbIncludeFiles: {
    "SOUL.md": true,
    "SECURITY.md": true,
    "SKILLS.md": true,
  },
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

// ── Helpers ──────────────────────────────────────────────────────────────

function getSettings(invention: InventionConfig): A2aSettings {
  const raw = invention.settings || {};
  return { ...DEFAULT_SETTINGS, ...(raw as Partial<A2aSettings>) };
}

// ── Helpers ──────────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────

const A2aAgentSettings: React.FC<A2aAgentSettingsProps> = ({
  invention,
  onUpdate,
}) => {
  const propsSettings = getSettings(invention);
  const [localSettings, setLocalSettings] =
    useState<A2aSettings>(propsSettings);
  const savedSnapshotRef = useRef<A2aSettings>(propsSettings);
  const [saving, setSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectUsers, setProjectUsers] = useState<ProjectUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [copiedCard, setCopiedCard] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
    taskId?: string;
  } | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [isBuildingWidget, setIsBuildingWidget] = useState(false);
  const [widgetBuildUrl, setWidgetBuildUrl] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredTools, setDiscoveredTools] = useState<
    Array<{ name: string; description: string; parameters?: Record<string, unknown> }>
  >([]);
  const [discoveredError, setDiscoveredError] = useState<string | null>(null);

  // Refs for deploy/MCP fields — synchronously updated on keystroke.
  // The deploy handler reads from refs to avoid React stale closure
  // (settings state captured at render time may not have latest input).
  const cfApiTokenRef = useRef(localSettings.cfApiToken);
  const cloudflareAccountIdRef = useRef(localSettings.cloudflareAccountId);
  const workerNameRef = useRef(localSettings.workerName);
  const mcpBaseUrlRef = useRef(localSettings.mcpBaseUrl);
  const mcpApiKeyRef = useRef(localSettings.mcpApiKey);
  const websiteUrlRef = useRef(localSettings.websiteUrl);

  const [webhookStatus, setWebhookStatus] = useState<{
    state: "idle" | "testing" | "registering" | "success" | "error";
    message: string;
  }>({ state: "idle", message: "" });

  // AI Models — fetched from MB App Settings global config
  const [availableModels, setAvailableModels] = useState<
    { id: string; label: string; provider: string; model: string }[]
  >([]);

  // Project sub-folders — for KB folder selector
  const [projectSubdirs, setProjectSubdirs] = useState<
    { name: string; path: string }[]
  >([]);
  const [kbFoundFiles, setKbFoundFiles] = useState<Set<string>>(new Set());

  // AI Skill Suggestions modal state
  const [aiSkillSuggestions, setAiSkillSuggestions] = useState<
    {
      id: string;
      name: string;
      description: string;
      tags: string[];
      examples: string[];
      inputModes: string[];
      outputModes: string[];
    }[]
  >([]);
  const [aiSuggestingLoading, setAiSuggestingLoading] = useState(false);
  const [aiSuggestingOpen, setAiSuggestingOpen] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<
    Set<string>
  >(new Set());

  // Collapsed skill cards (all start collapsed by default)
  const [collapsedSkillIds, setCollapsedSkillIds] = useState<Set<string>>(
    () => new Set(propsSettings.skills.map((s) => s.id)),
  );

  const toggleSkillCollapse = (skillId: string) => {
    setCollapsedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };

  // Use localSettings everywhere (alias for readability)
  const settings = localSettings;

  // Sync local state when parent props change (e.g. after external update)
  // Guard: don't override user's unsaved edits with server-pushed changes
  useEffect(() => {
    setLocalSettings((prev) => {
      const current = JSON.stringify(prev);
      const saved = JSON.stringify(savedSnapshotRef.current);
      if (current !== saved) {
        // User has unsaved changes — preserve them
        return prev;
      }
      savedSnapshotRef.current = propsSettings;
      return propsSettings;
    });
  }, [invention.settings]);

  // Dirty check: compare local state vs last saved snapshot
  const isDirty = useMemo(() => {
    const current = JSON.stringify(localSettings);
    const saved = JSON.stringify(savedSnapshotRef.current);
    return current !== saved;
  }, [localSettings]);

  // Light/dark theme detection via MutationObserver on <body> class
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

  // ── Health check on mount + deploy status recovery ──
  // Runs once on mount. Skips if a health check was done within the last 60 seconds.
  useEffect(() => {
    const now = Date.now();
    const lastPing = settings.lastEndpointPingAt
      ? new Date(settings.lastEndpointPingAt).getTime()
      : 0;
    if (now - lastPing < 60_000) return; // recently checked

    const runHealthCheck = async () => {
      if (isDeploying) return; // Don't check while deploying
      setHealthChecking(true);
      const activePid = activeProjectId || settings.primaryProjectId;
      try {
        const r = await fetch(
          `/api/inventions/a2a-agent/action/health-check${activePid ? `?projectId=${activePid}` : ""}`,
        );
        if (r.ok) {
          const data = await r.json();
          const updates: Partial<A2aSettings> = {};
          const nowISO = new Date().toISOString();

          // Endpoint results
          updates.lastEndpointPingAt = nowISO;
          updates.lastEndpointPingOk = data.endpointReachable;

          // Cloudflare results
          updates.lastCfCheckAt = nowISO;
          if (data.cloudflareLastModified) {
            updates.lastCfDeployedAt = data.cloudflareLastModified;
          }

          // Fix stale deploy status
          if (
            settings.deployStatus !== data.suggestedStatus &&
            data.suggestedStatus
          ) {
            updates.deployStatus = data.suggestedStatus;
          }

          if (Object.keys(updates).length > 0) {
            saveToServer(updates as Partial<A2aSettings>);
          }
        } else if (settings.deployStatus === "deploying") {
          // Recovery: server unreachable but status stuck
          updateField("deployStatus", "not-deployed");
        }
      } catch {
        if (settings.deployStatus === "deploying") {
          updateField("deployStatus", "not-deployed");
        }
      } finally {
        setHealthChecking(false);
      }
    };

    runHealthCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual re-check function (called by "Check Now" buttons)
  const runHealthCheck = async () => {
    if (isDeploying) return; // Don't check while deploying
    setHealthChecking(true);
    const activePid = activeProjectId || settings.primaryProjectId;
    try {
      const r = await fetch(
        `/api/inventions/a2a-agent/action/health-check${activePid ? `?projectId=${activePid}` : ""}`,
      );
      if (r.ok) {
        const data = await r.json();
        const updates: Partial<A2aSettings> = {};
        const nowISO = new Date().toISOString();

        updates.lastEndpointPingAt = nowISO;
        updates.lastEndpointPingOk = data.endpointReachable;
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
          saveToServer(updates as Partial<A2aSettings>);
        }
      }
    } catch {
      // silently fail
    } finally {
      setHealthChecking(false);
    }
  };

  // Auto-grab: Set primary project to the active project if not set
  // Auto-grab: MCP Gateway token from global config if not set
  useEffect(() => {
    const autoGrab = async () => {
      const updates: Partial<A2aSettings> = {};

      // 1. Auto-set primary project to active project
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

      // 2. Auto-grab MCP Gateway token + URL from global config
      if (!settings.gatewayToken || !settings.gatewayBaseUrl) {
        try {
          const res = await fetch("/api/settings/global");
          if (res.ok) {
            const globalConfig = await res.json();
            if (!settings.gatewayToken && globalConfig.masterApiKey) {
              updates.gatewayToken = globalConfig.masterApiKey;
            }
            // Auto-populate the MCP Gateway Worker URL. The MB app stores
            // this in global settings alongside the masterApiKey.
            if (!settings.gatewayBaseUrl) {
              const gwUrl =
                globalConfig.gatewayUrl ||
                globalConfig.gatewayWorkerUrl ||
                globalConfig.mcpGatewayUrl;
              if (gwUrl) {
                updates.gatewayBaseUrl = gwUrl;
              }
            }
          }
        } catch {}
      }

      // 3. Auto-grab Supabase credentials from project config
      const projectId = settings.primaryProjectId || updates.primaryProjectId;
      if (
        projectId &&
        (!settings.supabaseUrl || !settings.supabaseServiceKey)
      ) {
        try {
          const res = await fetch(
            `/api/projects/${encodeURIComponent(projectId)}/config`,
          );
          if (res.ok) {
            const projectConfig = await res.json();
            if (!settings.supabaseUrl && projectConfig.supabaseUrl) {
              updates.supabaseUrl = projectConfig.supabaseUrl;
            }
            // Note: We don't auto-grab supabaseServiceKey for security — user must enter it
          }
        } catch {}
      }

      // 4. Auto-grab PROJECT Supabase credentials for the offline fallback.
      //    The project config has supabaseUrl + supabaseAccessToken. We use the
      //    access token to call the Supabase Management API to fetch the
      //    service_role key automatically (no manual entry needed).
      const mbProjectId = settings.primaryProjectId || updates.primaryProjectId;
      if (
        mbProjectId &&
        (!settings.mbSupabaseUrl ||
          !settings.mbProjectId ||
          !settings.mbSupabaseAccessToken ||
          !settings.mbSupabaseServiceKey)
      ) {
        try {
          const res = await fetch(
            `/api/projects/${encodeURIComponent(mbProjectId)}/config`,
          );
          if (res.ok) {
            const projectConfig = await res.json();
            if (!settings.mbProjectId) updates.mbProjectId = mbProjectId;
            if (!settings.mbSupabaseUrl && projectConfig.supabaseUrl) {
              updates.mbSupabaseUrl = projectConfig.supabaseUrl;
            }
            if (
              !settings.mbSupabaseAccessToken &&
              projectConfig.supabaseAccessToken
            ) {
              updates.mbSupabaseAccessToken = projectConfig.supabaseAccessToken;
              // Auto-fetch the service_role key via the Supabase Management API.
              // The access token (sbp_...) grants access to /v1/projects/{ref}/api-keys
              // which returns all keys including service_role.
              if (!settings.mbSupabaseServiceKey) {
                try {
                  const ref = (projectConfig.supabaseUrl || "")
                    .replace(/^https:\/\//, "")
                    .replace(/\.supabase\.co.*$/, "");
                  if (ref) {
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
                      if (serviceKey) updates.mbSupabaseServiceKey = serviceKey;
                    }
                  }
                } catch {
                  // Service key auto-fetch failed — user can enter it manually
                }
              }
            }
          }
        } catch {}
      }

      // Apply any auto-grabbed values
      if (Object.keys(updates).length > 0) {
        saveToServer(updates as Partial<A2aSettings>);
      }
    };
    autoGrab();
    // Only run once on mount (not on every settings change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch projects list
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

  // Fetch project users when primaryProjectId changes
  useEffect(() => {
    const projectId = settings.primaryProjectId || activeProjectId;
    if (!projectId) return;

    setUsersLoading(true);
    fetch(`/api/projects/${projectId}/users`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          // Only show AI Agent / Sub-Agent users, never human users
          const agentsOnly = data.filter(
            (u: Record<string, unknown>) =>
              u.type === "agent" ||
              (typeof u.role === "string" && u.role.includes("agent")),
          );
          setProjectUsers(agentsOnly);
        }
      })
      .catch(() => setProjectUsers([]))
      .finally(() => setUsersLoading(false));
  }, [settings.primaryProjectId]);

  // ── Get active project ID from MB server (NOT localStorage) ──
  // The MB app stores this in ~/.mother-brain/config.json, not browser storage.
  // We fetch it once and cache for the component's lifetime.
  const [activeProjectId, setActiveProjectId] = useState(
    invention.projectIds?.[0] || "",
  );
  useEffect(() => {
    fetch("/api/active-project")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.activeProjectId) {
          setActiveProjectId(data.activeProjectId);
        }
      })
      .catch(() => {});
  }, []);

  // ── Fetch available AI Models from MB App Settings ──
  // The global config contains `llms: LlmConfig[]` and `activeLlmId`
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

  // ── Fetch project sub-folders for KB folder selector ──
  // Uses MB's /api/files?root=<path> endpoint to list directories only
  useEffect(() => {
    const pid = settings.primaryProjectId || activeProjectId;
    if (!pid) return;

    // Fetch project config to get rootPath
    fetch(`/api/projects/${encodeURIComponent(pid)}/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        const rootPath = config?.indexing?.rootPath || config?.rootPath;
        if (!rootPath) return;

        // List files/dirs at the project root
        return fetch(`/api/files?root=${encodeURIComponent(rootPath)}`).then(
          (r) => (r.ok ? r.json() : []),
        );
      })
      .then((data) => {
        if (!data || !Array.isArray(data)) return;
        // Filter to only directories
        const dirs = data
          .filter((item: Record<string, unknown>) => item.type === "folder")
          .map((item: Record<string, unknown>) => ({
            name: item.name as string,
            path: item.path as string,
          }));
        setProjectSubdirs(dirs);
      })
      .catch(() => {});
  }, [settings.primaryProjectId, activeProjectId]);

  // ── Scan KB folder for expected files ──
  // When kbFolder changes, check which expected files exist in it
  useEffect(() => {
    if (!settings.kbFolder) {
      setKbFoundFiles(new Set());
      return;
    }

    const pid = settings.primaryProjectId || activeProjectId;
    if (!pid) return;

    fetch(`/api/projects/${encodeURIComponent(pid)}/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        const rootPath = config?.indexing?.rootPath || config?.rootPath;
        if (!rootPath) return null;

        const fullPath = `${rootPath.replace(/\/$/, "")}/${settings.kbFolder.replace(/^\//, "")}`;
        return fetch(`/api/files?root=${encodeURIComponent(fullPath)}`);
      })
      .then((r) => (r ? (r.ok ? r.json() : []) : null))
      .then((data) => {
        if (!data || !Array.isArray(data)) return;
        const found = new Set<string>();
        for (const item of data as Record<string, unknown>[]) {
          if (item.type === "file" && typeof item.name === "string") {
            found.add(item.name);
          }
        }
        setKbFoundFiles(found);
      })
      .catch(() => {});
  }, [settings.kbFolder, settings.primaryProjectId, activeProjectId]);

  // Update a single field in local state (no auto-save)
  const updateField = useCallback((key: keyof A2aSettings, value: unknown) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // System save: immediately persists to server + updates local state + snapshot
  // Used by health check, auto-grab, token rotation (not user edits)
  const saveToServer = useCallback(
    async (updates: Partial<A2aSettings>) => {
      setLocalSettings((prev) => {
        const merged = { ...prev, ...updates };
        // Sync skills array to JSON string for Worker deployment
        if (merged.skills) {
          merged.agentSkillsJson = JSON.stringify(merged.skills);
        }
        // Sync provider from agentName if not explicitly set
        if (!merged.agentProvider && merged.agentName) {
          merged.agentProvider = merged.agentName;
        }
        // Fire-and-forget server save (project-scoped)
        fetch(`/api/inventions/${invention.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: merged,
            projectId: activeProjectId || settings.primaryProjectId,
          }),
        }).then(() => {
          onUpdate({ settings: merged });
          savedSnapshotRef.current = merged;
          // Persist Supabase creds to localStorage as fallback
          // (MB backend strips secrets from GET responses)
          if (merged.supabaseUrl || merged.supabaseServiceKey) {
            saveSupabaseCreds(
              merged.supabaseUrl,
              merged.supabaseServiceKey,
              activeProjectId || merged.primaryProjectId,
            );
          }
        });
        return merged;
      });
    },
    [invention.id, onUpdate, activeProjectId],
  );

  // Explicit save — saves all local changes to server
  const handleExplicitSave = async () => {
    setSaving(true);
    const startTime = Date.now();
    try {
      const merged = { ...localSettings };
      const res = await fetch(`/api/inventions/${invention.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: merged,
          projectId: activeProjectId || settings.primaryProjectId,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error("[a2a-settings] Save failed:", res.status, errBody);
        setSaveError(errBody.error || `HTTP ${res.status}`);
      } else {
        onUpdate({ settings: merged });
        savedSnapshotRef.current = merged;
        setSaveError(null);
        // Persist Supabase creds to localStorage as fallback
        // (MB backend strips secrets from GET responses)
        if (merged.supabaseUrl || merged.supabaseServiceKey) {
          saveSupabaseCreds(
            merged.supabaseUrl,
            merged.supabaseServiceKey,
            activeProjectId || merged.primaryProjectId,
          );
        }
      }
      // Ensure "Saving..." shows for at least 800ms
      const elapsed = Date.now() - startTime;
      await new Promise((r) => setTimeout(r, Math.max(0, 800 - elapsed)));
      setSaving(false);
      // Show "Saved" flash for 2 seconds
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2000);
    } catch (err) {
      setSaving(false);
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[a2a-settings] Save exception:", msg);
      setSaveError(msg);
    }
  };

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleBotUserSelect = (userId: string) => {
    const user = projectUsers.find((u) => u.id === userId);
    if (user) {
      setLocalSettings((prev) => ({
        ...prev,
        botUserId: user.id,
        botUserEmail: user.email,
        accessToken: user.accessToken || "",
        // Populate agent name from the selected Sub-Agent user.
        // This drives the Agent Card + system prompt on the deployed Worker.
        agentName: user.name || prev.agentName,
        agentProvider: prev.agentProvider || user.name || "",
        // Only update description if the user has a bio. Don't overwrite
        // the existing description with the role (e.g. "developer").
        ...(user.bio ? { agentDescription: user.bio } : {}),
      }));
    }
  };

  const handleRotateToken = async () => {
    if (!settings.botUserId || !settings.primaryProjectId) return;
    setRotatingToken(true);
    try {
      const r = await fetch(
        `/api/projects/${settings.primaryProjectId}/users/${settings.botUserId}/regenerate-token`,
        { method: "POST" },
      );
      if (r.ok) {
        const data = await r.json();
        saveToServer({
          accessToken: data.accessToken || data.token || "",
        });
      }
    } catch {
      // silently fail
    } finally {
      setRotatingToken(false);
    }
  };

  // ── Shared styles (theme-aware) ──
  const inputCls = isLightMode
    ? 'w-full bg-white border border-gray-300 px-3 py-2 text-sm font-["Departure_Mono",monospace] text-gray-900 focus:border-[#00dc82]/60 focus:outline-none transition-colors rounded'
    : 'w-full bg-[#0a0a0f] border border-[#1e1e2d] px-3 py-2 text-sm font-["Departure_Mono",monospace] text-white focus:border-[#39ff14]/40 focus:outline-none transition-colors';
  const labelCls = isLightMode
    ? 'text-xs font-["Departure_Mono",monospace] text-gray-600 mb-1 block'
    : 'text-xs font-["Departure_Mono",monospace] text-gray-500 mb-1 block';
  const sectionCls = isLightMode
    ? "p-4 border border-gray-200 bg-white rounded-lg shadow-sm"
    : "p-4 border border-[#1e1e2d] bg-[#0a0a0f] rounded-lg";
  const btnCls = isLightMode
    ? 'px-3 py-1.5 bg-gray-100 text-gray-700 border border-gray-300 text-xs font-["Departure_Mono",monospace] hover:bg-gray-200 transition-colors disabled:opacity-50 rounded'
    : 'px-3 py-1.5 bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/20 text-xs font-["Departure_Mono",monospace] hover:bg-[#39ff14]/20 transition-colors disabled:opacity-50';
  const primaryBtnCls =
    "px-4 py-2 rounded-lg bg-[#00dc82] text-black text-sm font-mono font-semibold hover:bg-[#00dc82]/90 transition-colors disabled:opacity-50";
  const pinkBtnCls = isLightMode
    ? 'px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs font-["Departure_Mono",monospace] hover:bg-red-100 transition-colors disabled:opacity-50 rounded'
    : 'px-3 py-1.5 bg-[#ff3d7f]/10 text-[#ff3d7f] border border-[#ff3d7f]/20 text-xs font-["Departure_Mono",monospace] hover:bg-[#ff3d7f]/20 transition-colors disabled:opacity-50';

  const sectionHeaderCls = `flex items-center gap-2 select-none`;
  const sectionHeaderIconCls = isLightMode ? "text-gray-400" : "text-gray-500";
  const sectionHeaderTextCls = isLightMode
    ? "text-xs font-mono text-gray-500 uppercase tracking-wider"
    : "text-xs font-mono text-gray-500 uppercase tracking-wider";

  const renderSectionHeader = (icon: React.ElementType, label: string) => {
    const Icon = icon;
    return (
      <div className={sectionHeaderCls}>
        <Icon size={14} className={sectionHeaderIconCls} />
        <span className={sectionHeaderTextCls}>{label}</span>
      </div>
    );
  };

  // ── Identity & Authentication (merged) ──
  const renderIdentity = () => {
    const selectedUser = projectUsers.find((u) => u.id === settings.botUserId);
    return (
      <div className={sectionCls}>
        {renderSectionHeader(Shield, "Agent Identity & Authentication")}
        <div className="mt-4 space-y-3">
          {/* Bot User Selection — determines agent name */}
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
              <p
                className={`text-[11px] font-mono mt-1 ${isLightMode ? "text-emerald-700" : "text-[#39ff14]/70"}`}
              >
                Agent name:{" "}
                <strong>{selectedUser.name || selectedUser.email}</strong>
              </p>
            )}
            <p className="text-[10px] font-mono text-gray-600 mt-1">
              The bot user determines the agent's identity. Select an AI Agent
              user from the project. Their access token auto-populates below.
            </p>
          </div>

          {/* AI Model Selection */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className={labelCls + " mb-0!"}>AI Model</label>
              <span
                className="text-[10px] font-mono text-gray-600 cursor-help"
                title="Select which AI model the A2A Agent uses. Populated from your MB App Settings."
              >
                <Info size={10} className="inline" />
              </span>
            </div>
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
            <p className="text-[10px] font-mono text-gray-600 mt-1">
              The model used by the A2A Agent in Cloudflare Workers. Add models
              in MB App Settings.
            </p>
          </div>

          {/* Cloudflare Worker Model Selection — offline fallback model */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className={labelCls + " mb-0!"}>
                Cloudflare Worker Model
              </label>
              <span
                className="text-[10px] font-mono text-gray-600 cursor-help"
                title="AI model used by the Cloudflare Workers AI binding. Used for offline fallback when the Gateway is unreachable, or for all inference when Force CF Worker is enabled."
              >
                <Info size={10} className="inline" />
              </span>
            </div>
            <ThemedSelect
              value={settings.cfWorkerModel || "@cf/zai-org/glm-4.7-flash"}
              onChange={(v) => updateField("cfWorkerModel", v)}
              options={[
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
                  value: "@cf/qwen/qwen3-30b-a3b-fp8",
                  label: "Qwen3 30B MoE FP8 (Qwen) — Cheap, reasoning",
                },
                {
                  value: "@cf/openai/gpt-oss-20b",
                  label: "GPT-OSS-20B (OpenAI) — Open weights, reasoning",
                },
                {
                  value: "@cf/openai/gpt-oss-120b",
                  label: "GPT-OSS-120B (OpenAI) — Powerful, reasoning",
                },
                {
                  value: "@cf/google/gemma-4-26b-a4b-it",
                  label: "Gemma 4 26B (Google) — Reasoning, vision",
                },
                {
                  value: "@cf/mistralai/mistral-small-3.1-24b-instruct",
                  label: "Mistral Small 3.1 24B (Mistral) — Function calling",
                },
                {
                  value: "@cf/nvidia/nemotron-3-120b-a12b",
                  label: "Nemotron 3 120B (NVIDIA) — Agentic, reasoning",
                },
                {
                  value: "@cf/ibm-granite/granite-4.0-h-micro",
                  label: "Granite 4.0 H-Micro (IBM) — Cheapest, function calling",
                },
                {
                  value: "@cf/moonshotai/kimi-k2.7-code",
                  label: "Kimi K2.7-Code (Moonshot) — 1T param, agentic",
                },
              ]}
            />
            <p className="text-[10px] font-mono text-gray-600 mt-1">
              Model used by the Cloudflare Workers AI binding for offline
              fallback or force-override mode.
            </p>
          </div>

          {/* Force Cloudflare Workers AI Toggle */}
          <div className="flex items-start gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.forceCfWorker}
                onChange={(e) =>
                  updateField("forceCfWorker", e.target.checked)
                }
                className="accent-[#39ff14] w-3.5 h-3.5 mt-0.5"
              />
              <span
                className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}
              >
                Force Cloudflare Worker Model
              </span>
            </label>
            <span
              className="text-[10px] font-mono text-gray-600 cursor-help"
              title="When enabled, bypasses the MCP Gateway entirely and routes ALL inference through Cloudflare Workers AI. No MCP tools will be available. Useful for cost control or testing."
            >
              <Info size={10} className="inline" />
            </span>
          </div>

          {/* Description — deployed as AGENT_DESCRIPTION to the Worker */}
          <div>
            <label className={labelCls}>Agent Description</label>
            <textarea
              className={inputCls + " resize-none"}
              rows={2}
              defaultValue={settings.agentDescription}
              onBlur={(e) => updateField("agentDescription", e.target.value)}
              placeholder="Auto-populated from the bot user. Used in the Agent Card + system prompt."
            />
            <p className="text-[10px] font-mono text-gray-600 mt-1">
              Deployed to the Worker as AGENT_DESCRIPTION. Auto-populated from
              the bot user selection above. Shown in the Agent Card and used in
              the system prompt.
            </p>
          </div>

          {/* Provider / Organization */}
          <div>
            <label className={labelCls}>Organization / Provider</label>
            <input
              type="text"
              className={inputCls}
              defaultValue={settings.agentProvider}
              onBlur={(e) => updateField("agentProvider", e.target.value)}
              placeholder="Your company name"
            />
            <p className="text-[10px] font-mono text-gray-600 mt-1">
              Shown as the provider in the Agent Card. Defaults to the agent
              name.
            </p>
          </div>

          {/* Access Token */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className={labelCls + " mb-0!"}>Access Token</label>
              <span
                className="text-[10px] font-mono text-gray-600 cursor-help"
                title="Bot user's API key for authenticating with the MCP Gateway. Auto-populated from the selected bot user."
              >
                <Info size={10} className="inline" />
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type={showSecrets.accessToken ? "text" : "password"}
                className={inputCls}
                defaultValue={settings.accessToken}
                onBlur={(e) => updateField("accessToken", e.target.value)}
                placeholder="mb_..."
              />
              <button
                className={btnCls + " shrink-0"}
                onClick={() => toggleSecret("accessToken")}
              >
                {showSecrets.accessToken ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
            </div>
          </div>

          {/* Generate / Rotate Token */}
          <div className="flex gap-2">
            <button
              className={pinkBtnCls + " flex items-center gap-1.5"}
              onClick={handleRotateToken}
              disabled={
                !settings.botUserId ||
                !settings.primaryProjectId ||
                rotatingToken
              }
            >
              <RefreshCw
                size={11}
                className={rotatingToken ? "animate-spin" : ""}
              />
              {rotatingToken
                ? "Rotating..."
                : settings.accessToken
                  ? "Rotate Token"
                  : "Generate Token"}
            </button>
            {!settings.botUserId && (
              <span className="text-[10px] font-mono text-gray-600 self-center">
                Select a bot user first
              </span>
            )}
          </div>

          {/* Separator */}
          <div
            className={`border-t pt-3 mt-3 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
          >
            <div className="flex items-start gap-2 mb-3">
              <Info
                size={12}
                className={`mt-0.5 shrink-0 ${isLightMode ? "text-emerald-600" : "text-[#39ff14]/60"}`}
              />
              <p
                className={`text-[10px] font-mono leading-relaxed ${isLightMode ? "text-gray-500" : "text-gray-500"}`}
              >
                <strong
                  className={isLightMode ? "text-gray-700" : "text-gray-400"}
                >
                  Access Token
                </strong>{" "}
                = Bot user's API key (auto-populated).{" "}
                <strong
                  className={isLightMode ? "text-gray-700" : "text-gray-400"}
                >
                  MCP Gateway Token
                </strong>{" "}
                = Bearer token for the Cloudflare MCP Gateway worker.
              </p>
            </div>
          </div>

          {/* MCP Gateway URL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls + " mb-0!"}>MCP Gateway URL</label>
              <button
                className="text-[10px] font-mono px-2 py-1 rounded border flex items-center gap-1 transition-colors shrink-0 hover:opacity-80"
                style={{
                  borderColor: isLightMode ? "#d1d5db" : "#333",
                  color: isLightMode ? "#374151" : "#9ca3af",
                  backgroundColor: isLightMode ? "#f9fafb" : "#111",
                }}
                onClick={async () => {
                  try {
                    const res = await fetch("/api/settings/global");
                    if (res.ok) {
                      const config = await res.json();
                      console.log(
                        "[gateway] Global config keys:",
                        Object.keys(config),
                      );
                      console.log("[gateway] Full config:", config);
                      // Search ALL string values (including nested) for a gateway URL
                      const urlPattern = /workers\.dev|gateway/i;
                      let found: string | null = null;
                      // Check top-level values
                      for (const [key, val] of Object.entries(config)) {
                        if (typeof val === "string" && urlPattern.test(val)) {
                          found = val;
                          break;
                        }
                      }
                      // Check nested objects (one level deep)
                      if (!found) {
                        for (const [key, val] of Object.entries(config)) {
                          if (
                            val &&
                            typeof val === "object" &&
                            !Array.isArray(val)
                          ) {
                            for (const [k2, v2] of Object.entries(
                              val as Record<string, unknown>,
                            )) {
                              if (
                                typeof v2 === "string" &&
                                urlPattern.test(v2)
                              ) {
                                found = v2;
                                break;
                              }
                            }
                          }
                          if (found) break;
                        }
                      }
                      if (found) {
                        updateField("gatewayBaseUrl", found);
                      } else {
                        alert(
                          "No gateway URL found in App Settings.\n\nAvailable keys: " +
                            Object.keys(config).join(", ") +
                            "\n\nCheck the browser console for the full config.",
                        );
                      }
                    } else {
                      alert("App Settings endpoint returned " + res.status);
                    }
                  } catch (err) {
                    alert("Failed to fetch App Settings.");
                  }
                }}
              >
                ↻ Auto-fill
              </button>
            </div>
            <input
              type="text"
              className={inputCls}
              defaultValue={settings.gatewayBaseUrl}
              onBlur={(e) => updateField("gatewayBaseUrl", e.target.value)}
              placeholder="https://your-gateway.workers.dev"
            />
          </div>

          {/* MCP Gateway Token */}
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className={labelCls + " mb-0!"}>MCP Gateway Token</label>
              <span
                className="text-[10px] font-mono text-gray-600 cursor-help"
                title="Bearer token for authenticating with the Cloudflare MCP Gateway worker."
              >
                <Info size={10} className="inline" />
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type={showSecrets.gatewayToken ? "text" : "password"}
                className={inputCls}
                defaultValue={settings.gatewayToken}
                onBlur={(e) => updateField("gatewayToken", e.target.value)}
                placeholder="Bearer token for MCP Gateway"
              />
              <button
                className={btnCls + " shrink-0"}
                onClick={() => toggleSecret("gatewayToken")}
              >
                {showSecrets.gatewayToken ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Endpoint Section ──
  const renderEndpoint = () => {
    // Live status based on health check results
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
      <div className={sectionCls}>
        {renderSectionHeader(Globe, "Endpoint")}
        <div className="mt-4 space-y-3">
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
                className={btnCls + " shrink-0"}
                onClick={() => navigator.clipboard.writeText(settings.agentUrl)}
                title="Copy URL"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
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
          {/* Manual Test Connection button */}
          {settings.agentUrl && (
            <button
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
        </div>
      </div>
    );
  };

  // ── Projects Section ──
  const renderProjects = () => {
    const activeProjectIdForProjects =
      settings.primaryProjectId || activeProjectId;
    return (
      <div className={sectionCls}>
        {renderSectionHeader(FolderKanban, "Project Access")}
        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Primary Knowledge Base Project</label>
            <ThemedSelect
              value={settings.primaryProjectId || activeProjectId}
              onChange={(v) => updateField("primaryProjectId", v)}
              options={[
                { value: "", label: "— Select project —" },
                ...(projects.length === 0
                  ? [
                      {
                        value: "",
                        label: "Loading projects...",
                        disabled: true,
                      },
                    ]
                  : []),
                ...projects.map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
            />
            <p className="text-[10px] font-mono text-gray-600 mt-1">
              The project that serves as the agent's primary knowledge source.
              Defaults to the current viewed project.
            </p>
          </div>
          <div>
            <label className={labelCls}>
              Additional Context Projects (Brainstorm Mode)
            </label>
            <div className="space-y-1.5 mt-1 max-h-40 overflow-y-auto">
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
                  {settings.primaryProjectId === p.id && (
                    <span
                      className={`text-[10px] font-mono ml-auto ${isLightMode ? "text-emerald-600" : "text-[#39ff14]/60"}`}
                    >
                      primary
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Knowledge Base Section ──
  const EXPECTED_KB_FILES = ["SOUL.md", "SECURITY.md", "SKILLS.md"];

  const renderKnowledgeBase = () => (
    <div className={sectionCls}>
      {renderSectionHeader(FolderOpen, "Knowledge Base Packing")}
      <div className="mt-4 space-y-3">
        {/* KB Folder Selector */}
        <div>
          <label className={labelCls}>CF Worker Files Folder</label>
          <ThemedSelect
            value={settings.kbFolder || ""}
            onChange={(v) => updateField("kbFolder", v)}
            options={[
              { value: "", label: "— Select a sub-folder —" },
              ...projectSubdirs.map((d) => ({
                value: d.path,
                label: d.name,
              })),
            ]}
          />
          <p className="text-[10px] font-mono text-gray-600 mt-1">
            Select a sub-folder within your project containing the markdown
            files to pack into the CF Worker at deploy time.
          </p>
        </div>

        {/* File status toggles */}
        {settings.kbFolder && (
          <div>
            <label className={labelCls}>Expected Files</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {EXPECTED_KB_FILES.map((fileName) => {
                const found = kbFoundFiles.has(fileName);
                const included = settings.kbIncludeFiles[fileName] !== false;
                return (
                  <button
                    key={fileName}
                    onClick={() =>
                      updateField("kbIncludeFiles", {
                        ...settings.kbIncludeFiles,
                        [fileName]: !included,
                      })
                    }
                    className={`px-2 py-1 rounded text-[10px] font-mono border flex items-center gap-1 transition-colors ${
                      !found
                        ? isLightMode
                          ? "bg-gray-100 border-gray-300 text-gray-400"
                          : "bg-[#0a0a0f] border-[#1e1e2d] text-gray-600"
                        : included
                          ? isLightMode
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                            : "bg-[#39ff14]/10 border-[#39ff14]/30 text-[#39ff14]"
                          : isLightMode
                            ? "bg-gray-100 border-gray-300 text-gray-400 line-through"
                            : "bg-[#0a0a0f] border-[#1e1e2d] text-gray-600 line-through"
                    }`}
                  >
                    {found ? <Check size={10} /> : <XCircle size={10} />}
                    {fileName}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] font-mono text-gray-600 mt-1">
              Green = found & included. Strikethrough = excluded. Gray = not
              found in folder. Toggle to include/exclude during deploy.
            </p>
          </div>
        )}

        {!settings.kbFolder && (
          <div
            className={`flex items-start gap-2 p-2 border rounded ${isLightMode ? "bg-blue-50 border-blue-200" : "bg-blue-500/5 border-blue-500/20"}`}
          >
            <Info
              size={12}
              className={`mt-0.5 shrink-0 ${isLightMode ? "text-blue-500" : "text-blue-400"}`}
            />
            <p
              className={`text-[10px] font-mono leading-relaxed ${isLightMode ? "text-gray-500" : "text-gray-500"}`}
            >
              Pick a sub-folder to see which files are found. These files get
              baked into the Cloudflare Worker when you deploy.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // ── Database Section ──
  const renderDatabase = () => (
    <div className={sectionCls}>
      {renderSectionHeader(Database, "Chat Database")}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 ${settings.localPgStatus === "running" ? "bg-[#39ff14]" : settings.localPgStatus === "starting" ? "bg-yellow-400 animate-pulse" : "bg-gray-700"}`}
            />
            <span
              className={`text-xs font-mono ${settings.localPgStatus === "running" ? "text-[#39ff14]" : settings.localPgStatus === "starting" ? "text-yellow-400" : "text-gray-500"}`}
            >
              Local Postgres:{" "}
              {settings.localPgStatus === "running"
                ? "Running"
                : settings.localPgStatus === "starting"
                  ? "Starting..."
                  : "Stopped"}
            </span>
          </div>
          <button
            className={btnCls}
            onClick={async () => {
              const action =
                settings.localPgStatus === "running" ? "stop-db" : "start-db";
              try {
                const activePid = activeProjectId || settings.primaryProjectId;
                const r = await fetch(
                  `/api/inventions/a2a-agent/action/${action}${activePid ? `?projectId=${activePid}` : ""}`,
                  {
                    method: "POST",
                  },
                );
                if (r.ok) {
                  const data = await r.json();
                  updateField("localPgStatus", data.status || "running");
                }
              } catch {}
            }}
            disabled={settings.localPgStatus === "starting"}
          >
            {settings.localPgStatus === "running" ? "Stop" : "Start"}
          </button>
        </div>
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
        {(settings.dbProvider === "supabase" ||
          settings.dbProvider === "both") && (
          <>
            <div>
              <label className={labelCls}>Supabase URL</label>
              <input
                type="text"
                className={inputCls}
                defaultValue={settings.supabaseUrl}
                onBlur={(e) => updateField("supabaseUrl", e.target.value)}
                placeholder="https://xxx.supabase.co"
              />
            </div>
            <div>
              <label className={labelCls}>Supabase Service Key</label>
              <div className="flex gap-2">
                <input
                  type={showSecrets.supabaseKey ? "text" : "password"}
                  className={inputCls}
                  defaultValue={settings.supabaseServiceKey}
                  onBlur={(e) =>
                    updateField("supabaseServiceKey", e.target.value)
                  }
                  placeholder="eyJ..."
                />
                <button
                  className={btnCls + " shrink-0"}
                  onClick={() => toggleSecret("supabaseKey")}
                >
                  {showSecrets.supabaseKey ? (
                    <EyeOff size={12} />
                  ) : (
                    <Eye size={12} />
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-gray-400">
                Sync local → Supabase
              </span>
              <button
                onClick={() =>
                  updateField(
                    "supabaseSyncEnabled",
                    !settings.supabaseSyncEnabled,
                  )
                }
                className="font-mono text-sm"
              >
                {settings.supabaseSyncEnabled ? (
                  <ToggleRight
                    size={24}
                    className="text-[#39ff14] hover:text-[#39ff14]/80 transition-colors"
                  />
                ) : (
                  <ToggleLeft
                    size={24}
                    className="text-gray-600 hover:text-gray-400 transition-colors"
                  />
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ── Offline Fallback (Project Knowledge Base) Section ──
  // When the MCP Gateway is unreachable (MacBook offline / Gateway down), the
  // Worker queries the PROJECT's Supabase directly to retrieve stored knowledge.
  // This is SEPARATE from the "Chat Database" above — that's the A2A Agent's own
  // DB for chat history. This box points at the Mother Brain project's knowledge DB.
  const [fetchingMbKey, setFetchingMbKey] = useState(false);
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
              (k: { name?: string; api_key?: string }) =>
                k.name === "service_role",
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

  const renderProjectSupabase = () => {
    const isConfigured =
      settings.mbSupabaseUrl &&
      settings.mbSupabaseServiceKey &&
      settings.mbProjectId;
    return (
      <div className={sectionCls}>
        {renderSectionHeader(CloudOff, "Offline Fallback (Knowledge Base)")}
        <div className="mt-4 space-y-3">
          <div
            className={`flex items-start gap-2 p-2 rounded ${isLightMode ? "bg-blue-50" : "bg-[#39ff14]/5"}`}
          >
            <Info
              size={12}
              className={`mt-0.5 shrink-0 ${isLightMode ? "text-blue-600" : "text-[#39ff14]/60"}`}
            />
            <p
              className={`text-[10px] font-mono leading-relaxed ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
            >
              When the MCP Gateway is down, the Worker queries the project's
              Supabase directly to retrieve stored knowledge (code index,
              memories, chat history) and generates a response. Auto-loads from
              the primary project config. These are deployed as Cloudflare
              Worker secrets: MB_SUPABASE_URL, MB_SUPABASE_SERVICE_KEY,
              MB_PROJECT_ID.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${isConfigured ? "bg-[#39ff14]" : "bg-gray-600"}`}
              />
              <span
                className={`text-xs font-mono ${isConfigured ? "text-[#39ff14]" : "text-gray-500"}`}
              >
                {isConfigured ? "Configured" : "Not configured"}
              </span>
            </div>
          </div>

          <div>
            <label className={labelCls}>Project Supabase URL</label>
            <input
              type="text"
              className={inputCls}
              defaultValue={settings.mbSupabaseUrl}
              onBlur={(e) => updateField("mbSupabaseUrl", e.target.value)}
              placeholder="https://your-project-ref.supabase.co"
            />
          </div>

          <div>
            <label className={labelCls}>
              Project ID (table prefix)
              <span
                className={`ml-2 text-[10px] font-normal ${isLightMode ? "text-gray-400" : "text-white/40"}`}
              >
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

          <div>
            <label className={labelCls}>Supabase Access Token</label>
            <div className="flex gap-2">
              <input
                type={showSecrets.mbAccessToken ? "text" : "password"}
                className={inputCls}
                defaultValue={settings.mbSupabaseAccessToken}
                onBlur={(e) =>
                  updateField("mbSupabaseAccessToken", e.target.value)
                }
                placeholder="sbp_... (auto-loaded from project config)"
              />
              <button
                className={btnCls + " shrink-0"}
                onClick={() => toggleSecret("mbAccessToken")}
              >
                {showSecrets.mbAccessToken ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>Service Role Key</label>
            <div className="flex gap-2">
              <input
                type={showSecrets.mbServiceKey ? "text" : "password"}
                className={inputCls}
                defaultValue={settings.mbSupabaseServiceKey}
                onBlur={(e) =>
                  updateField("mbSupabaseServiceKey", e.target.value)
                }
                placeholder="eyJ... (auto-fetched via Management API)"
              />
              <button
                className={btnCls + " shrink-0"}
                onClick={() => toggleSecret("mbServiceKey")}
              >
                {showSecrets.mbServiceKey ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
              <button
                className={btnCls + " shrink-0 flex items-center gap-1"}
                onClick={handleFetchMbServiceKey}
                disabled={
                  fetchingMbKey ||
                  !settings.mbSupabaseAccessToken ||
                  !settings.mbSupabaseUrl
                }
                title="Re-fetch the service_role key from the Supabase Management API using the access token"
              >
                {fetchingMbKey ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <KeyRound size={12} />
                )}
                {fetchingMbKey ? "Fetching..." : "Fetch"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Website MCP Integration Section ──
  const renderWebsiteMcp = () => {
    const isConfigured = settings.mcpBaseUrl && settings.mcpApiKey;
    return (
      <div className={sectionCls}>
        {renderSectionHeader(Globe, "Website MCP Integration")}
        <div className="mt-4 space-y-3">
          <div
            className={`flex items-start gap-2 p-2 rounded ${isLightMode ? "bg-blue-50" : "bg-[#39ff14]/5"}`}
          >
            <Info
              size={12}
              className={`mt-0.5 shrink-0 ${isLightMode ? "text-blue-600" : "text-[#39ff14]/60"}`}
            />
            <p
              className={`text-[10px] font-mono leading-relaxed ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
            >
              Optional: Connects the agent to a website MCP server so it can
              read pages, navigate visitors, and check accounts. When unset,
              website tools are not exposed (graceful degradation). Deployed as
              Worker secrets: MCP_BASE_URL, MCP_API_KEY, WEBSITE_URL.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${isConfigured ? "bg-[#39ff14]" : "bg-gray-600"}`}
              />
              <span
                className={`text-xs font-mono ${isConfigured ? "text-[#39ff14]" : "text-gray-500"}`}
              >
                {isConfigured ? "Configured" : "Not configured"}
              </span>
            </div>
          </div>

          <div>
            <label className={labelCls}>MCP Server URL</label>
            <input
              type="text"
              className={inputCls}
              defaultValue={settings.mcpBaseUrl}
              onBlur={(e) => updateField("mcpBaseUrl", e.target.value)}
              onChange={(e) => { mcpBaseUrlRef.current = e.target.value; }}
              placeholder="https://your-api.com"
            />
          </div>

          <div>
            <label className={labelCls}>MCP API Key</label>
            <div className="flex gap-2">
              <input
                type={showSecrets.mcpApiKey ? "text" : "password"}
                className={inputCls}
                defaultValue={settings.mcpApiKey}
                onBlur={(e) => updateField("mcpApiKey", e.target.value)}
                onChange={(e) => { mcpApiKeyRef.current = e.target.value; }}
                placeholder="mb_mcp_... (distinct from Gateway Token)"
              />
              <button
                className={btnCls + " shrink-0"}
                onClick={() => toggleSecret("mcpApiKey")}
              >
                {showSecrets.mcpApiKey ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Website URL
              <span
                className={`ml-2 text-[10px] font-normal ${isLightMode ? "text-gray-400" : "text-white/40"}`}
              >
                for navigate/highlight links
              </span>
            </label>
            <input
              type="text"
              className={inputCls}
              defaultValue={settings.websiteUrl}
              onBlur={(e) => updateField("websiteUrl", e.target.value)}
              onChange={(e) => { websiteUrlRef.current = e.target.value; }}
              placeholder="https://yourwebsite.com"
            />
          </div>
          {/* Discovered MCP Tools */}
          {isConfigured && (
            <div className="border-t pt-3" style={{ borderColor: isLightMode ? "#e5e7eb" : "#1e1e2d" }}>
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls}>
                  Discovered Website Tools
                  <span
                    className={`ml-2 text-[10px] font-normal ${isLightMode ? 'text-gray-400' : 'text-white/40'}`}
                  >
                    auto-discovered at runtime by the agent
                  </span>
                </label>
                <button
                  className={`${btnCls} text-[10px] px-2 py-1 inline-flex items-center gap-1`}
                  disabled={discovering}
                  onClick={async () => {
                    if (!settings.agentUrl) {
                      setDiscoveredError('Agent URL not set - configure the endpoint URL first');
                      return;
                    }
                    setDiscovering(true);
                    setDiscoveredError(null);
                    setDiscoveredTools([]);
                    try {
                      const url = settings.agentUrl.replace(/\/$/, '') + '/website-mcp/tools';
                      const res = await fetch(url);
                      if (res.ok) {
                        const data = await res.json();
                        const toolList = Array.isArray(data) ? data : (data?.tools || []);
                        if (toolList.length > 0) {
                          setDiscoveredTools(toolList);
                        } else {
                          setDiscoveredError('No tools returned from the MCP server.');
                        }
                      } else {
                        const errBody = await res.text().catch(() => '');
                        setDiscoveredError(
                          'Server returned ' + res.status + (errBody ? ': ' + errBody.slice(0, 200) : '')
                        );
                      }
                    } catch (err) {
                      setDiscoveredError(
                        'Failed to reach endpoint: ' + (err instanceof Error ? err.message : 'Network error')
                      );
                    } finally {
                      setDiscovering(false);
                    }
                  }}
                >
                  {discovering ? (
                    <>
                      <Loader2 size={10} className="animate-spin" />
                      Discovering...
                    </>
                  ) : (
                    'Discover Tools'
                  )}
                </button>
              </div>
              {discovering ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 size={12} className="animate-spin text-[#39ff14]" />
                  <span className={`text-[10px] font-mono ${isLightMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Discovering website MCP tools...
                  </span>
                </div>
              ) : discoveredError ? (
                <div
                  className={`flex items-start gap-2 p-2 rounded text-[10px] font-mono ${
                    isLightMode ? 'bg-red-50 text-red-600' : 'bg-red-900/20 text-red-400'
                  }`}
                >
                  <XCircle size={10} className="mt-0.5 shrink-0" />
                  <span>{discoveredError}</span>
                </div>
              ) : discoveredTools.length > 0 ? (
                <div>
                  <div className={`text-[10px] font-mono mb-1 ${isLightMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    {discoveredTools.length} tool{discoveredTools.length !== 1 ? 's' : ''} discovered
                  </div>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {discoveredTools.map((tool, i) => (
                      <div
                        key={tool.name || i}
                        className={`p-2 border text-xs font-mono ${isLightMode ? 'bg-white border-gray-200' : 'bg-[#13131f] border-[#1e1e2d]'}`}
                      >
                        <div className={`font-semibold ${isLightMode ? 'text-gray-900' : 'text-[#39ff14]'}`}>
                          {tool.name}
                        </div>
                        <div className={`mt-0.5 text-[10px] ${isLightMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {tool.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className={`text-[10px] font-mono ${isLightMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Click "Discover Tools" to fetch the available tools from your MCP server.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── License Key Resolution Section ──
  const renderLicenseKeys = () => {
    const isConfigured = settings.encoreApiUrl;
    return (
      <div className={sectionCls}>
        {renderSectionHeader(KeyRound, "License Key Integration")}
        <div className="mt-4 space-y-3">
          <div
            className={`flex items-start gap-2 p-2 rounded ${isLightMode ? "bg-blue-50" : "bg-[#39ff14]/5"}`}
          >
            <Info
              size={12}
              className={`mt-0.5 shrink-0 ${isLightMode ? "text-blue-500" : "text-blue-400"}`}
            />
            <p
              className={`text-[11px] ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
            >
              Resolves in-app support messages to a visitor_id via the Encore
              Subscriptions API. Links in-app support chats with web chat
              history. When unset, license keys fall back to{" "}
              <code className="text-[10px]">license:{"{key}"}</code>.
            </p>
          </div>
          <div
            className={`flex items-center gap-2 text-[11px] ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${isConfigured ? "bg-green-500" : "bg-gray-500"}`}
            />
            {isConfigured ? "Configured" : "Not configured"}
          </div>
          <div>
            <label className={`${labelCls} flex items-center gap-1.5`}>
              <Globe size={11} />
              Encore API URL
            </label>
            <input
              type="text"
              className={inputCls}
              defaultValue={settings.encoreApiUrl}
              onBlur={(e) => updateField("encoreApiUrl", e.target.value)}
              placeholder="https://your-api.com"
            />
          </div>
          <div>
            <label className={`${labelCls} flex items-center gap-1.5`}>
              <Shield size={11} />
              Encore API Key{" "}
              <span className="text-[10px] opacity-60">(optional)</span>
            </label>
            <div className="flex gap-1">
              <input
                type={showSecrets.encoreApiKey ? "text" : "password"}
                className={inputCls}
                defaultValue={settings.encoreApiKey}
                onBlur={(e) => updateField("encoreApiKey", e.target.value)}
                placeholder="Leave empty if endpoint is public"
              />
              <button
                className={btnCls + " shrink-0"}
                onClick={() => toggleSecret("encoreApiKey")}
              >
                {showSecrets.encoreApiKey ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Session Token Verification Section (Dual-Path Auth) ──
  const renderSessionTokenVerification = () => {
    const isConfigured = settings.jwtSecret;
    return (
      <div className={sectionCls}>
        {renderSectionHeader(Shield, "Session Token Verification")}
        <div className="mt-4 space-y-3">
          <div
            className={`flex items-start gap-2 p-2 rounded ${isLightMode ? "bg-blue-50" : "bg-[#39ff14]/5"}`}
          >
            <Info
              size={12}
              className={`mt-0.5 shrink-0 ${isLightMode ? "text-blue-500" : "text-blue-400"}`}
            />
            <p
              className={`text-[11px] ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
            >
              Verifies JWT session tokens from the website chat widget (the
              dual-path auth system). Shared{" "}
              <code className="text-[10px]">JwtSecret</code> from the Encore
              backend. When unset, JWT-bearing requests are rejected with 503
              (fail-closed). License-key and anonymous visitor paths work
              regardless.
            </p>
          </div>
          <div
            className={`flex items-center gap-2 text-[11px] ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${isConfigured ? "bg-green-500" : "bg-gray-500"}`}
            />
            {isConfigured ? "Configured" : "Not configured"}
          </div>
          <div>
            <label className={`${labelCls} flex items-center gap-1.5`}>
              <Shield size={11} />
              JWT Secret{" "}
              <span className="text-[10px] opacity-60">
                (JwtSecret from Encore)
              </span>
            </label>
            <div className="flex gap-1">
              <input
                type={showSecrets.jwtSecret ? "text" : "password"}
                className={inputCls}
                defaultValue={settings.jwtSecret}
                onBlur={(e) => updateField("jwtSecret", e.target.value)}
                placeholder="64-char base64url string (leave empty = fail-closed)"
              />
              <button
                className={btnCls + " shrink-0"}
                onClick={() => toggleSecret("jwtSecret")}
              >
                {showSecrets.jwtSecret ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Telegram Integration Section ──
  const renderTelegram = () => {
    const isConfigured = settings.telegramBotToken;
    const webhookUrl = settings.agentUrl
      ? `${settings.agentUrl.replace(/\/+$/, "")}/webhook/telegram`
      : "";

    const handleTestAndRegisterWebhook = async () => {
      if (!settings.telegramBotToken || !webhookUrl) return;
      setWebhookStatus({ state: "testing", message: "Verifying bot token..." });
      try {
        // Step 1: Verify the token via getMe
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
          message: `Bot verified: @${meData.result.username}. Registering webhook...`,
        });
        // Step 2: Register the webhook
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

    return (
      <div className={sectionCls}>
        {renderSectionHeader(Send, "Telegram Integration")}
        <div className="mt-4 space-y-3">
          <div
            className={`flex items-start gap-2 p-2 rounded ${isLightMode ? "bg-blue-50" : "bg-[#39ff14]/5"}`}
          >
            <Info
              size={12}
              className={`mt-0.5 shrink-0 ${isLightMode ? "text-blue-500" : "text-blue-400"}`}
            />
            <p
              className={`text-[11px] ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
            >
              Deploy your agent to Telegram. Visitors chat with your agent
              directly in Telegram — full MCP tool access, same knowledge base
              as your website. Messages are stored in the same chat database.
              Only text messages are supported (no images/media for security).
            </p>
          </div>

          {/* Setup Guide */}
          <div
            className={`p-3 rounded border text-[11px] leading-relaxed font-mono ${
              isLightMode
                ? "bg-gray-50 border-gray-200 text-gray-600"
                : "bg-[#13131f] border-[#1e1e2d] text-gray-400"
            }`}
          >
            <div className="font-bold mb-1">Setup Guide:</div>
            <div>1. Open Telegram → message @BotFather</div>
            <div>2. Send /newbot → choose a name + username</div>
            <div>3. Copy the bot token BotFather gives you</div>
            <div>4. Paste it in the field below</div>
            <div>5. Click "Test & Register Webhook" to verify + activate</div>
            <div>6. Click Deploy to push the token to your Worker</div>
          </div>

          {/* Status indicator */}
          <div
            className={`flex items-center gap-2 text-[11px] ${isLightMode ? "text-gray-600" : "text-gray-400"}`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${isConfigured ? "bg-green-500" : "bg-gray-500"}`}
            />
            {isConfigured ? "Configured" : "Not configured"}
          </div>

          {/* Bot Token Input */}
          <div>
            <label className={`${labelCls} flex items-center gap-1.5`}>
              <Send size={11} />
              Bot Token{" "}
              <span className="text-[10px] opacity-60">
                (from @BotFather)
              </span>
            </label>
            <div className="flex gap-1">
              <input
                type={showSecrets.telegramBotToken ? "text" : "password"}
                className={inputCls}
                value={settings.telegramBotToken}
                onChange={(e) =>
                  updateField("telegramBotToken", e.target.value)
                }
                placeholder="123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              />
              <button
                className={btnCls + " shrink-0"}
                onClick={() => toggleSecret("telegramBotToken")}
              >
                {showSecrets.telegramBotToken ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
            </div>
          </div>

          {/* Test & Register Webhook Button */}
          <div>
            <div className="flex gap-2 items-start">
              <button
                className={`px-3 py-1.5 rounded text-[11px] font-mono flex items-center gap-1.5 transition-colors ${
                  !settings.telegramBotToken || !webhookUrl || webhookStatus.state === "testing" || webhookStatus.state === "registering"
                    ? "opacity-50 cursor-not-allowed bg-[#1f1f1f] text-gray-500"
                    : "bg-[#1f1f1f] hover:bg-[#2a2a2a] text-gray-300 hover:text-white border border-[#333]"
                }`}
                disabled={
                  !settings.telegramBotToken ||
                  !webhookUrl ||
                  webhookStatus.state === "testing" ||
                  webhookStatus.state === "registering"
                }
                onClick={handleTestAndRegisterWebhook}
              >
                {webhookStatus.state === "testing" ||
                webhookStatus.state === "registering" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Globe size={12} />
                )}
                {webhookStatus.state === "testing"
                  ? "Verifying..."
                  : webhookStatus.state === "registering"
                    ? "Registering..."
                    : "Test & Register Webhook"}
              </button>
            </div>

            {/* Webhook status message */}
            {webhookStatus.state !== "idle" && (
              <div
                className={`mt-2 p-2 rounded text-[10px] font-mono ${
                  webhookStatus.state === "success"
                    ? isLightMode
                      ? "bg-green-50 text-green-700"
                      : "bg-[#39ff14]/10 text-[#39ff14]"
                    : webhookStatus.state === "error"
                      ? isLightMode
                        ? "bg-red-50 text-red-700"
                        : "bg-[#ff3d7f]/10 text-[#ff3d7f]"
                      : isLightMode
                        ? "bg-blue-50 text-blue-700"
                        : "bg-blue-500/10 text-blue-400"
                }`}
              >
                {webhookStatus.state === "success" && (
                  <CheckCircle size={10} className="inline mr-1" />
                )}
                {webhookStatus.state === "error" && (
                  <XCircle size={10} className="inline mr-1" />
                )}
                {webhookStatus.message}
              </div>
            )}

            {/* Webhook URL read-only display */}
            <div className="mt-2">
              <div className="flex gap-1">
                <input
                  type="text"
                  readOnly
                  className={inputCls + " opacity-60 text-[10px]"}
                  value={webhookUrl || "Set your Agent URL first"}
                />
                {webhookUrl && (
                  <button
                    className={btnCls + " shrink-0"}
                    onClick={() => {
                      navigator.clipboard?.writeText(webhookUrl);
                    }}
                    title="Copy webhook URL"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Chat UI Section (replaces Widget Settings) ──
  const renderChatUI = () => (
    <div className={sectionCls}>
      {renderSectionHeader(MessageSquare, "Chat UI")}
      <div className="mt-4 space-y-3">
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
            The A2A Agent chat UI is a{" "}
            <strong
              className={isLightMode ? "text-emerald-700" : "text-[#39ff14]"}
            >
              fullscreen overlay
            </strong>{" "}
            that collapses to a full-width bottom bar when closed. It integrates
            with the entire website's UI and pages — it is not a floating
            widget. Messages are initiated by visitors or external agents; no
            welcome message is needed.
          </p>
        </div>
        <div>
          <label className={labelCls}>Primary Color</label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={settings.widgetColor}
              onBlur={(e) => updateField("widgetColor", e.target.value)}
              className={`w-8 h-8 border bg-transparent cursor-pointer ${isLightMode ? "border-gray-300" : "border-[#1e1e2d]"}`}
            />
            <span className="text-xs font-mono text-gray-400">
              {settings.widgetColor}
            </span>
          </div>
        </div>
        <div>
          <label className={labelCls}>Hero Search Gradient</label>
          <p className="text-[10px] font-mono text-gray-600 mt-1 mb-2">
            Two-color gradient for the Hero Search stroke border and brain icon.
          </p>
          <div className="flex gap-4 items-center">
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={settings.heroGradientColor1}
                onChange={(e) =>
                  updateField("heroGradientColor1", e.target.value)
                }
                className={`w-8 h-8 border bg-transparent cursor-pointer ${isLightMode ? "border-gray-300" : "border-[#1e1e2d]"}`}
              />
              <span className="text-xs font-mono text-gray-400">
                {settings.heroGradientColor1}
              </span>
            </div>
            <span className="text-gray-600">→</span>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={settings.heroGradientColor2}
                onChange={(e) =>
                  updateField("heroGradientColor2", e.target.value)
                }
                className={`w-8 h-8 border bg-transparent cursor-pointer ${isLightMode ? "border-gray-300" : "border-[#1e1e2d]"}`}
              />
              <span className="text-xs font-mono text-gray-400">
                {settings.heroGradientColor2}
              </span>
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>Branding Text</label>
          <input
            type="text"
            className={inputCls}
            defaultValue={settings.widgetBranding}
            onBlur={(e) => updateField("widgetBranding", e.target.value)}
            placeholder="Powered by Your Brand"
          />
        </div>

        {/* Agent Logo */}
        <div>
          <label className={labelCls}>Agent Logo</label>
          <p className="text-[10px] font-mono text-gray-600 mt-1 mb-2">
            Upload a logo (SVG, PNG, JPG, ICNS) or enter a URL. Displayed in the
            Chat UI header and bar. Upload your own logo or enter a URL.
          </p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              className={inputCls}
              defaultValue={settings.logoUrl || ""}
              onBlur={(e) => updateField("logoUrl", e.target.value)}
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
                  // For SVG/text files, read as data URL
                  if (
                    file.type === "image/svg+xml" ||
                    file.type.startsWith("text/")
                  ) {
                    const text = await file.text();
                    const encoded = `data:${file.type};utf8,${encodeURIComponent(text)}`;
                    updateField("logoUrl", encoded);
                  } else {
                    // For binary files (PNG, JPG, ICNS), read as base64 data URL
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
          {(settings.logoUrl || "") && (
            <div className="flex items-center gap-2 mt-2">
              {(settings.logoUrl as string) ? (
                <img
                  src={settings.logoUrl as string}
                  alt="Logo preview"
                  width={20}
                  height={20}
                  style={{ objectFit: "contain" }}
                />
              ) : (
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#39ff14"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
                  <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
                  <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
                </svg>
              )}
              <span className="text-[10px] font-mono text-gray-500">
                Preview
              </span>
              <button
                className="text-[10px] font-mono text-[#ff3d7f] hover:text-[#ff3d7f]/80 ml-auto"
                onClick={() => updateField("logoUrl", "")}
              >
                Remove
              </button>
            </div>
          )}
        </div>

        {/* Display Toggles */}
        <div
          className={`border-t pt-3 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
        >
          <label className={labelCls}>Display Options</label>
          <div className="space-y-2 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showToolCalls}
                onChange={(e) => updateField("showToolCalls", e.target.checked)}
                className="accent-[#39ff14]"
              />
              <span
                className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}
              >
                Show MCP Tool Calls
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showThinking}
                onChange={(e) => updateField("showThinking", e.target.checked)}
                className="accent-[#39ff14]"
              />
              <span
                className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}
              >
                Show Multi-Step Thinking
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showReasoning}
                onChange={(e) => updateField("showReasoning", e.target.checked)}
                className="accent-[#39ff14]"
              />
              <span
                className={`text-xs font-mono ${isLightMode ? "text-gray-700" : "text-gray-300"}`}
              >
                Show Reasoning Steps
              </span>
            </label>
          </div>
          <p className="text-[10px] font-mono text-gray-600 mt-2">
            These control what's visible in the Chat UI. The production your
            website currently displays MCP Tool Calls, thinking, and reasoning.
          </p>
        </div>
      </div>
    </div>
  );

  // ── Agent Skills Editor ──
  const addSkill = () => {
    const skillId = `skill-${Date.now()}`;
    setLocalSettings((prev) => ({
      ...prev,
      skills: [
        ...prev.skills,
        {
          id: skillId,
          name: "New Skill",
          description: "Describe what this skill does",
          tags: [],
          examples: [],
          inputModes: ["text/plain"],
          outputModes: ["text/plain"],
        },
      ],
    }));
    setCollapsedSkillIds((prev) => new Set([...prev, skillId]));
  };

  const updateSkill = (
    index: number,
    field: string,
    value: string | string[],
  ) => {
    setLocalSettings((prev) => {
      const skills = [...prev.skills];
      skills[index] = { ...skills[index], [field]: value };
      return { ...prev, skills };
    });
  };

  const removeSkill = (index: number) => {
    setLocalSettings((prev) => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== index),
    }));
  };

  // ── Drag-to-reorder handlers (ref-based — only reorder on drop, not during drag) ──
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
    setLocalSettings((prev) => {
      const skills = [...prev.skills];
      const [dragged] = skills.splice(from, 1);
      skills.splice(to, 0, dragged);
      return { ...prev, skills };
    });
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
            currentSkills: settings.skills,
            agentDescription: settings.agentDescription,
          },
          id: "ai-suggest",
        }),
      });
      if (!res.ok) {
        console.warn("AI Suggest: Worker returned", res.status);
        setAiSkillSuggestions([]);
      } else {
        const data = await res.json();
        setAiSkillSuggestions(data?.result?.suggestions || []);
      }
    } catch (err) {
      console.warn("AI Suggest failed:", err);
      setAiSkillSuggestions([]);
    } finally {
      setAiSuggestingLoading(false);
    }
  };

  const renderSkills = () => (
    <div className={sectionCls}>
      {renderSectionHeader(FileJson, "Agent Skills")}
      <div className="mt-4 space-y-3">
        <p
          className={`text-[11px] font-mono leading-relaxed ${isLightMode ? "text-gray-600" : "text-gray-500"}`}
        >
          Define the skills your agent advertises in its{" "}
          <code className={isLightMode ? "text-emerald-700" : "text-[#39ff14]"}>
            agent-card.json
          </code>
          . Each skill maps to A2A Protocol v1.0{" "}
          <code className="text-[10px]">AgentSkill</code> fields.
        </p>

        {/* Current skills list */}
        {(settings.skills || []).length > 0 ? (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {(settings.skills || []).map((skill, i) => (
              <div
                key={skill.id}
                className={`border transition-shadow ${isLightMode ? "bg-white border-gray-200 hover:shadow-md" : "bg-[#13131f] border-[#1e1e2d] hover:border-[#39ff14]/30"} ${collapsedSkillIds.has(skill.id) ? "" : "p-3 space-y-2"}`}
              >
                {/* Header row: click to expand/collapse, drag handle */}
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
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-600">
                      {collapsedSkillIds.has(skill.id) ? "▶" : "▼"}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 border ${isLightMode ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-[#39ff14]/80 border-[#39ff14]/20 bg-[#39ff14]/5"}`}
                    >
                      {skill.id}
                    </span>
                    <span
                      className={`text-[11px] font-mono font-semibold ${isLightMode ? "text-gray-900" : "text-white"}`}
                    >
                      {skill.name}
                    </span>
                    {collapsedSkillIds.has(skill.id) && (
                      <span
                        className={`text-[10px] font-mono truncate max-w-[200px] ${isLightMode ? "text-gray-400" : "text-gray-500"}`}
                      >
                        {skill.description.slice(0, 50)}
                        {skill.description.length > 50 ? "…" : ""}
                      </span>
                    )}
                  </div>
                  <button
                    className={`p-1 rounded ${isLightMode ? "hover:bg-red-50 text-gray-400 hover:text-red-500" : "hover:bg-[#ff3d7f]/10 text-gray-500 hover:text-[#ff3d7f]"} transition-colors`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSkill(i);
                    }}
                    title="Remove skill"
                  >
                    <XCircle size={12} />
                  </button>
                </div>

                {/* Editable fields — hidden when collapsed */}
                {!collapsedSkillIds.has(skill.id) && (
                  <>
                    {/* Editable fields */}
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
                          onChange={(e) => updateSkill(i, "id", e.target.value)}
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

                    {/* Tags */}
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

                    {/* Examples */}
                    <div>
                      <label
                        className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                      >
                        Examples (one per line)
                      </label>
                      <textarea
                        className={inputCls + " text-[11px] py-1 resize-y"}
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

                    {/* inputModes / outputModes */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}
                        >
                          Input Modes (comma-separated)
                        </label>
                        <input
                          className={inputCls + " text-[11px] py-1"}
                          value={(skill.inputModes || ["text/plain"]).join(
                            ", ",
                          )}
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
                          Output Modes (comma-separated)
                        </label>
                        <input
                          className={inputCls + " text-[11px] py-1"}
                          value={(skill.outputModes || ["text/plain"]).join(
                            ", ",
                          )}
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

        {/* Buttons: Add Skill + AI Suggest */}
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

        {/* ── AI Suggestion Modal ── */}
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
                sectionCls +
                " w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4 shadow-2xl"
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
                          {skill.tags.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {skill.tags.map((tag) => (
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
                        setLocalSettings((prev) => ({
                          ...prev,
                          skills: [...prev.skills, ...toAdd],
                        }));
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
    </div>
  );

  // ── Agent Card Section ──
  const renderAgentCard = () => (
    <div className={sectionCls}>
      {renderSectionHeader(FileJson, "Agent Card")}
      <div className="mt-4 space-y-3">
        <p
          className={`text-[11px] font-mono leading-relaxed ${isLightMode ? "text-gray-600" : "text-gray-500"}`}
        >
          Well-known A2A agent card served at{" "}
          <code className={isLightMode ? "text-emerald-700" : "text-[#39ff14]"}>
            /.well-known/agent.json
          </code>
          . External agents use this to discover your agent's capabilities.
        </p>

        {/* Card Preview */}
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
              Skills ({(settings.skills || AGENT_CARD.skills).length})
            </span>
            <div className="mt-1.5 space-y-1.5">
              {(settings.skills || AGENT_CARD.skills).map((skill) => (
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

        {/* Copy JSON button */}
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
                  skills: settings.skills || AGENT_CARD.skills,
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
    </div>
  );

  // ── Deploy Section ──
  const renderDeploy = () => (
    <div className={sectionCls}>
      {renderSectionHeader(Rocket, "Deploy")}
      <div className="mt-4 space-y-3">
        <div>
          <label className={labelCls}>Cloudflare Account ID</label>
          <input
            type="text"
            className={inputCls}
            defaultValue={settings.cloudflareAccountId}
            onBlur={(e) => updateField("cloudflareAccountId", e.target.value)}
            onChange={(e) => { cloudflareAccountIdRef.current = e.target.value; }}
            placeholder="Your Cloudflare account ID"
          />
        </div>
        <div>
          <label className={`${labelCls} flex items-center gap-1.5`}>
            <KeyRound size={11} />
            Cloudflare API Token
          </label>
          <div className="flex gap-1">
            <input
              type={showSecrets.cfApiToken ? "text" : "password"}
              className={inputCls}
              defaultValue={settings.cfApiToken}
              onBlur={(e) => updateField("cfApiToken", e.target.value)}
              onChange={(e) => { cfApiTokenRef.current = e.target.value; }}
              placeholder="Your Cloudflare API token (Workers:Secrets permission)"
            />
            <button
              className={btnCls + " shrink-0"}
              onClick={() => toggleSecret("cfApiToken")}
            >
              {showSecrets.cfApiToken ? (
                <EyeOff size={12} />
              ) : (
                <Eye size={12} />
              )}
            </button>
          </div>
          <p className="text-[10px] font-mono text-gray-600 mt-1">
            Required to deploy and push secrets to Cloudflare Workers. Get it
            from Cloudflare Dashboard → My Profile → API Tokens. Needs
            Workers:Secrets permission.
          </p>
        </div>
        <div>
          <label className={labelCls}>Worker Name</label>
          <input
            type="text"
            className={inputCls}
            defaultValue={settings.workerName}
            onBlur={(e) => updateField("workerName", e.target.value)}
            onChange={(e) => { workerNameRef.current = e.target.value; }}
            placeholder="e.g., my-a2a-endpoint"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-gray-500">Status:</span>
          {/* Deployed indicator */}
          {settings.deployStatus === "deployed" || settings.lastDeployedAt ? (
            <>
              <span
                className={`w-2 h-2 rounded-full ${settings.lastEndpointPingOk ? "bg-[#39ff14]" : "bg-yellow-400"}`}
              />
              <span
                className={`text-xs font-mono ${settings.lastEndpointPingOk ? "text-[#39ff14]" : "text-yellow-400"}`}
              >
                {settings.lastEndpointPingOk
                  ? "Deployed"
                  : "Deployed (endpoint unreachable)"}
              </span>
            </>
          ) : isDeploying || settings.deployStatus === "deploying" ? (
            <>
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-xs font-mono text-yellow-400">
                Deploying...
              </span>
            </>
          ) : settings.deployStatus === "failed" ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#ff3d7f]" />
              <span className="text-xs font-mono text-[#ff3d7f]">Failed</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-gray-600" />
              <span className="text-xs font-mono text-gray-500">
                Not Deployed
              </span>
            </>
          )}
          {/* Cloudflare Worker confirmation */}
          {settings.lastCfDeployedAt && (
            <span className="text-[10px] font-mono text-[#39ff14]/70 ml-1">
              Worker confirmed on Cloudflare
            </span>
          )}
          {settings.lastDeployedAt && (
            <span className="text-[10px] font-mono text-gray-600 ml-auto">
              deployed {timeAgo(settings.lastDeployedAt)}
            </span>
          )}
          <button
            className="px-2 py-1 bg-[#1f1f1f] hover:bg-[#2a2a2a] disabled:opacity-50 text-gray-400 hover:text-white rounded text-[10px] border border-[#333] flex items-center gap-1 transition-colors"
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
        <button
          className={primaryBtnCls + " flex items-center justify-center gap-2"}
          onClick={async () => {
            if (isDeploying) return;
            setIsDeploying(true);
            setDeployError(null);
            try {
              const activePid = activeProjectId || settings.primaryProjectId;

              // ── Pre-deploy: ensure offline fallback secrets are fresh ──
              // Fetch the latest project config and fetch the service_role key
              // via the Supabase Management API, then persist to server BEFORE
              // triggering the deploy. This guarantees the deploy handler has
              // the correct MB_SUPABASE_URL, MB_SUPABASE_SERVICE_KEY, and
              // MB_PROJECT_ID values when it pushes Worker secrets.
              // ── Read ref values BEFORE the block ──
              // The refs are updated synchronously on every keystroke via onChange,
              // so they always have the latest input values (unlike React state
              // which only updates on onBlur). These are used both inside the
              // pre-deploy PATCH and later for the direct Cloudflare API push.
              const effCfApiToken = cfApiTokenRef.current || settings.cfApiToken;
              const effAccountId = cloudflareAccountIdRef.current || settings.cloudflareAccountId;
              const effWorkerName = workerNameRef.current || settings.workerName;
              const effMcpBaseUrl = mcpBaseUrlRef.current || settings.mcpBaseUrl;
              const effMcpApiKey = mcpApiKeyRef.current || settings.mcpApiKey;
              const effWebsiteUrl = websiteUrlRef.current || settings.websiteUrl;
              let fullSave: any;
              if (activePid) {
                try {
                  const configRes = await fetch(
                    `/api/projects/${encodeURIComponent(activePid)}/config`,
                  );
                  if (configRes.ok) {
                    const projectConfig = await configRes.json();
                    const secretUpdates: Partial<A2aSettings> = {};

                    if (projectConfig.supabaseUrl) {
                      secretUpdates.mbSupabaseUrl = projectConfig.supabaseUrl;
                    }
                    secretUpdates.mbProjectId = activePid;
                    if (
                      projectConfig.supabaseAccessToken &&
                      projectConfig.supabaseUrl
                    ) {
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
                          if (serviceKey)
                            secretUpdates.mbSupabaseServiceKey = serviceKey;
                          if (projectConfig.supabaseAccessToken)
                            secretUpdates.mbSupabaseAccessToken =
                              projectConfig.supabaseAccessToken;
                        }
                      } catch {
                        // Key fetch failed — use whatever is already saved
                      }
                    }
                    // ── Ensure ALL secrets are persisted BEFORE deploy ──
                    // The fire-and-forget saveToServer + 500ms timeout is unreliable
                    // (the PATCH might not complete before the deploy action reads
                    // settings). Instead, do an explicit awaited PATCH with the FULL
                    // settings object so every secret is guaranteed to be on disk
                    // when the deploy action reads the project config.
                    fullSave = {
                      ...settings,
                      ...secretUpdates,
                    };
                    if (settings.telegramBotToken) {
                      fullSave.telegramBotToken = settings.telegramBotToken;
                    }
                    // Override MCP/website values from refs (latest keystroke data,
                    // not stale React state — onBlur may not have fired yet).
                    if (effMcpBaseUrl) fullSave.mcpBaseUrl = effMcpBaseUrl;
                    if (effMcpApiKey) fullSave.mcpApiKey = effMcpApiKey;
                    if (effWebsiteUrl) fullSave.websiteUrl = effWebsiteUrl;
                    // Fire saveToServer for backward compat (updates local state)
                    saveToServer(fullSave);
                    // Then do a CRITICAL awaited PATCH to ensure it lands
                    const saveRes = await fetch(`/api/inventions/${invention.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        settings: fullSave,
                        projectId: activePid,
                      }),
                    });
                    if (!saveRes.ok) {
                      console.warn("[deploy] Pre-deploy PATCH returned", saveRes.status);
                    }
                  }
                } catch {
                  // Config fetch failed — proceed with existing saved values
                }
              }

              // ── Push ALL non-empty secrets via Cloudflare API directly ──
              // If the user has provided a cfApiToken, bypass the MB app's broken
              // wrangler secret put and push all secrets directly via the Cloudflare
              // REST API. This ensures the Worker has every secret it needs even
              // when the MB app's CLOUDFLARE_API_TOKEN lacks Workers:Secrets permission.
              const SECRETS_MAP: Record<string, keyof A2aSettings> = {
                VOYAGE_API_KEY: "embeddingApiKey",
                MB_SUPABASE_URL: "mbSupabaseUrl",
                MB_SUPABASE_SERVICE_KEY: "mbSupabaseServiceKey",
                MB_PROJECT_ID: "mbProjectId",
                MOTHER_BRAIN_GATEWAY_TOKEN: "gatewayToken",
                GATEWAY_BASE_URL: "gatewayBaseUrl",
                AGENT_NAME: "agentName",
                AGENT_DESCRIPTION: "agentDescription",
                AGENT_URL: "agentUrl",
                AGENT_SKILLS_JSON: "agentSkillsJson",
                AGENT_PROVIDER: "agentProvider",
                MOTHER_BRAIN_USER_TOKEN: "accessToken",
                MCP_BASE_URL: "mcpBaseUrl",
                MCP_API_KEY: "mcpApiKey",
                WEBSITE_URL: "websiteUrl",
                ENCORE_API_URL: "encoreApiUrl",
                ENCORE_API_KEY: "encoreApiKey",
                JWT_SECRET: "jwtSecret",
                TELEGRAM_BOT_TOKEN: "telegramBotToken",
                CF_WORKER_MODEL: "cfWorkerModel",
                FORCE_CF_WORKER: "forceCfWorker",
              };

              // Ref values were read earlier (before the pre-deploy PATCH) to
              // ensure the server PATCH had the latest keystroke data. They're
              // reused here for the direct Cloudflare API push below.

              if (effCfApiToken && effAccountId && effWorkerName) {
                let secretsPushed = 0;
                let secretsFailed = 0;
                for (const [secretName, settingsField] of Object.entries(SECRETS_MAP)) {
                  const raw = settings[settingsField];
                  // Use ref value for MCP fields (stale-closure-safe), otherwise use React state
                  const value =
                    settingsField === "mcpBaseUrl" ? effMcpBaseUrl :
                    settingsField === "mcpApiKey" ? effMcpApiKey :
                    settingsField === "websiteUrl" ? effWebsiteUrl :
                    raw;
                  if (!value || (typeof value === "string" && !value.trim())) continue;
                  try {
                    const cfRes = await fetch(
                      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(effAccountId)}/workers/scripts/${encodeURIComponent(effWorkerName)}/secrets`,
                      {
                        method: "PUT",
                        headers: {
                          Authorization: `Bearer ${effCfApiToken}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                          name: secretName,
                          text: String(value),
                          type: "secret_text",
                        }),
                      },
                    );
                    const cfResult = await cfRes.json();
                    if (cfResult.success) {
                      secretsPushed++;
                    } else {
                      secretsFailed++;
                      console.warn(
                        `[deploy] ⚠️ Cloudflare API rejected secret ${secretName}:`,
                        cfResult.errors || cfResult,
                      );
                    }
                  } catch (cfErr) {
                    secretsFailed++;
                    console.error(
                      `[deploy] ❌ Cloudflare API call failed for ${secretName}:`,
                      cfErr instanceof Error ? cfErr.message : cfErr,
                    );
                  }
                }
                console.log(
                  `[deploy] ✅ Secrets pushed: ${secretsPushed} succeeded, ${secretsFailed} failed`,
                );
              }

              const r = await fetch(
                `/api/inventions/a2a-agent/action/deploy${activePid ? `?projectId=${activePid}` : ""}`,
                {
                  method: "POST",
                },
              );
              if (r.ok) {
                const data = await r.json();
                updateField("deployStatus", data.status || "deployed");
                updateField("lastDeployedAt", new Date().toISOString());
                // Run health check after deploy to verify
                setTimeout(() => runHealthCheck(), 2000);
              } else {
                let errMsg = `Deploy failed (HTTP ${r.status})`;
                try {
                  const errData = await r.json();
                  if (errData.error) errMsg = errData.error;
                } catch {}
                // Detect common Cloudflare auth errors and show helpful guidance
                if (
                  errMsg.includes("Invalid access token") ||
                  errMsg.includes("Authentication error")
                ) {
                  errMsg =
                    "The Mother Brain app's Cloudflare API token is invalid or expired. Go to Mother Brain app Settings → Cloudflare and update your API Token. Then try again.";
                }
                setDeployError(errMsg);
              }
            } catch (err) {
              setDeployError(
                err instanceof Error
                  ? err.message
                  : "Network error during deploy",
              );
            } finally {
              setIsDeploying(false);
            }
          }}
          disabled={false}
        >
          {isDeploying ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Deploying...
            </>
          ) : (
            <>
              <Rocket size={14} />
              {settings.deployStatus === "deployed"
                ? "Redeploy to Cloudflare"
                : "Deploy to Cloudflare"}
            </>
          )}
        </button>
        {deployError && (
          <div
            className={`flex items-start gap-2 p-3 border rounded-md ${isLightMode ? "bg-red-50 border-red-300" : "bg-[#ff3d7f]/10 border-[#ff3d7f]/30"}`}
          >
            <XCircle
              size={12}
              className={`mt-0.5 shrink-0 ${isLightMode ? "text-red-600" : "text-[#ff3d7f]"}`}
            />
            <div className="flex-1">
              <p
                className={`text-[11px] font-mono leading-relaxed ${isLightMode ? "text-red-700" : "text-[#ff3d7f]"}`}
              >
                <strong>Deploy failed:</strong> {deployError}
              </p>
              <p
                className={`text-[10px] font-mono mt-2 ${isLightMode ? "text-gray-500" : "text-gray-500"}`}
              >
                If the error mentions "req is not defined", the app's deploy
                route has a bug. You can deploy manually instead:
              </p>
              <pre
                className={`text-[10px] font-mono mt-1.5 p-2 rounded overflow-x-auto ${isLightMode ? "bg-gray-100 text-gray-800" : "bg-[#0a0a0f] text-gray-400"}`}
              >
                <code>{`cd backend\nnpx wrangler deploy`}</code>
              </pre>
            </div>
          </div>
        )}
        {/* Offline fallback status — secrets are auto-deployed via
            config.json → actions.deploy.secrets mapping. No manual setup needed. */}
        {settings.mbSupabaseUrl &&
          settings.mbSupabaseServiceKey &&
          settings.mbProjectId && (
            <div
              className={`mt-3 p-2.5 rounded flex items-center gap-2 ${isLightMode ? "bg-emerald-50 border border-emerald-200" : "bg-[#39ff14]/5 border border-[#39ff14]/20"}`}
            >
              <CheckCircle
                size={12}
                className={`shrink-0 ${isLightMode ? "text-emerald-600" : "text-[#39ff14]"}`}
              />
              <span
                className={`text-[10px] font-mono ${isLightMode ? "text-emerald-700" : "text-[#39ff14]/80"}`}
              >
                Offline fallback enabled — MB_SUPABASE_URL,
                MB_SUPABASE_SERVICE_KEY, and MB_PROJECT_ID are auto-deployed
                with the Worker.
              </span>
            </div>
          )}
        <p className="text-[10px] font-mono text-gray-600 text-center">
          Uses the app's bundled Wrangler CLI to deploy the A2A Worker to your
          Cloudflare account
        </p>
      </div>
    </div>
  );

  // ── Vectorization Section ──
  const renderEmbedding = () => (
    <div className={sectionCls}>
      {renderSectionHeader(Cpu, "Vectorization")}
      <div className="mt-4 space-y-3">
        <div>
          <label className={labelCls}>Embedding Provider</label>
          <ThemedSelect
            value={settings.embeddingProvider}
            onChange={(v) => updateField("embeddingProvider", v)}
            options={[
              { value: "voyage-ai", label: "Voyage AI" },
              { value: "openai", label: "OpenAI" },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>Model</label>
          <input
            type="text"
            className={inputCls}
            defaultValue={settings.embeddingModel}
            onBlur={(e) => updateField("embeddingModel", e.target.value)}
            placeholder="e.g., voyage-4-large"
          />
        </div>
        <div>
          <label className={labelCls}>API Key</label>
          <div className="flex gap-2">
            <input
              type={showSecrets.embeddingKey ? "text" : "password"}
              className={inputCls}
              defaultValue={settings.embeddingApiKey}
              onBlur={(e) => updateField("embeddingApiKey", e.target.value)}
              placeholder="API key for embedding provider"
            />
            <button
              className={btnCls + " shrink-0"}
              onClick={() => toggleSecret("embeddingKey")}
            >
              {showSecrets.embeddingKey ? (
                <EyeOff size={12} />
              ) : (
                <Eye size={12} />
              )}
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Vector Dimensions</label>
          <input
            type="number"
            className={inputCls}
            value={settings.embeddingDimensions}
            onChange={(e) =>
              updateField(
                "embeddingDimensions",
                parseInt(e.target.value, 10) || 1024,
              )
            }
          />
        </div>
      </div>
    </div>
  );

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

  // ── Chat UI Widget Deploy Section ──
  const renderWidgetDeploy = () => {
    const endpoint = settings.agentUrl || "https://a2a.yourdomain.com";
    const agentName = settings.agentName || "AI Assistant";
    const color = settings.widgetColor || "#39ff14";
    const branding = settings.widgetBranding || "";

    const gradColor1 = settings.heroGradientColor1 || "#00dc82";
    const gradColor2 = settings.heroGradientColor2 || "#a78bfa";
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
      "3. Render <ChatWidget endpoint='https://a2a.yourdomain.com' /> — handles everything",
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

    return (
      <div className={sectionCls}>
        {renderSectionHeader(Code2, "Chat UI Widget")}
        <div className="mt-4 space-y-3">
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
              onClick={async () => {
                setIsBuildingWidget(true);
                try {
                  // Fetch all source files from the /resource/ endpoint
                  const basePath =
                    "/api/inventions/a2a-agent/resource/widget-build";
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

                  // Create zip and download
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
              }}
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
                onClick={async () => {
                  try {
                    // Re-download the widget source zip
                    const basePath =
                      "/api/inventions/a2a-agent/resource/widget-build";
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
                        return {
                          name: `motherbrain-widget/${f}`,
                          content: text,
                        };
                      }),
                    );
                    const zipBlob = createZip(fileContents);
                    const zipUrl = URL.createObjectURL(zipBlob);
                    const zipA = document.createElement("a");
                    zipA.href = zipUrl;
                    zipA.download = "motherbrain-widget.zip";
                    document.body.appendChild(zipA);
                    zipA.click();
                    document.body.removeChild(zipA);
                    URL.revokeObjectURL(zipUrl);
                  } catch (err) {
                    console.error("Widget download failed:", err);
                    alert(
                      "Download failed: " +
                        (err instanceof Error ? err.message : "Unknown error"),
                    );
                  }
                }}
              >
                <Download size={12} />
                Download
              </button>
            )}
          </div>

          {/* Post-build content */}
          {widgetBuildUrl && (
            <>
              {/* Embed code */}
              <div>
                <label className={labelCls}>Embed Code</label>
                <div
                  className={`p-3 border font-mono text-[11px] leading-relaxed overflow-x-auto ${isLightMode ? "bg-gray-50 border-gray-200 text-gray-700" : "bg-[#0a0a0f] border-[#1e1e2d] text-gray-300"}`}
                >
                  <pre className="whitespace-pre-wrap break-all m-0">
                    {snippetHtml}
                  </pre>
                </div>
                <button
                  className={`${btnCls} mt-1 flex items-center gap-1`}
                  onClick={() => {
                    navigator.clipboard.writeText(snippetHtml);
                  }}
                >
                  <Copy size={10} />
                  Copy
                </button>
              </div>

              {/* AI Agent prompt */}
              <div>
                <label className={labelCls}>Prompt for your AI Agent</label>
                <div
                  className={`p-3 border font-mono text-[10px] leading-relaxed overflow-x-auto max-h-48 overflow-y-auto ${isLightMode ? "bg-gray-50 border-gray-200 text-gray-600" : "bg-[#0a0a0f] border-[#1e1e2d] text-gray-400"}`}
                >
                  <pre className="whitespace-pre-wrap break-all m-0">
                    {aiAgentPrompt}
                  </pre>
                </div>
                <button
                  className={`${btnCls} mt-1 flex items-center gap-1`}
                  onClick={() => {
                    navigator.clipboard.writeText(aiAgentPrompt);
                  }}
                >
                  <Copy size={10} />
                  Copy Prompt
                </button>
              </div>

              {/* Preview card */}
              <div
                className={`border-t pt-3 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
              >
                <label className={labelCls}>Preview</label>
                <div
                  className={`mt-2 p-3 border rounded ${isLightMode ? "bg-white border-gray-200" : "bg-[#0d0d14] border-[#1e1e2d]"}`}
                >
                  {/* Mini header */}
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center"
                      style={{ backgroundColor: color }}
                    >
                      <span
                        className="text-[8px] font-bold"
                        style={{ color: "#000" }}
                      >
                        {agentName.charAt(0)}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-mono font-semibold ${isLightMode ? "text-gray-900" : "text-white"}`}
                    >
                      {agentName.toUpperCase()}
                    </span>
                  </div>
                  {/* Mini chat bubble */}
                  <div
                    className={`ml-7 p-2 rounded text-[10px] font-mono leading-relaxed ${isLightMode ? "bg-gray-100 text-gray-600" : "bg-[#13131f] text-gray-300"}`}
                  >
                    Hello! I'm {agentName}. How can I help?
                  </div>
                  {/* Mini bar */}
                  <div
                    className={`mt-2 h-6 rounded flex items-center justify-between px-2 ${isLightMode ? "bg-gray-50 border border-gray-200" : "bg-[#0a0a0f] border border-[#1e1e2d]"}`}
                  >
                    <span
                      className={`text-[9px] font-mono ${isLightMode ? "text-gray-400" : "text-gray-600"}`}
                    >
                      Type a message...
                    </span>
                    <span className="text-[9px] font-mono" style={{ color }}>
                      ↵
                    </span>
                  </div>
                  {/* Branding */}
                  <p
                    className={`text-[8px] font-mono mt-1.5 text-center ${isLightMode ? "text-gray-400" : "text-gray-600"}`}
                  >
                    {branding}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Save indicator (top-right, fixed) */}
      <div className="sticky top-0 z-40 flex items-center gap-2 mb-2 -mx-6 px-6 py-2">
        {saving && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md ${isLightMode ? "bg-gray-100 border-gray-300" : "bg-[#13131f] border-[#1e1e2d]"}`}
          >
            <Loader2
              size={12}
              className={`animate-spin ${isLightMode ? "text-gray-500" : "text-gray-400"}`}
            />
            <span
              className={`text-[11px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-400"}`}
            >
              Saving...
            </span>
          </div>
        )}
        {saveFlash && !saving && !isDirty && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md ${isLightMode ? "bg-emerald-50 border-emerald-200" : "bg-[#39ff14]/10 border-[#39ff14]/20"}`}
          >
            <Check
              size={12}
              className={isLightMode ? "text-emerald-600" : "text-[#39ff14]"}
            />
            <span
              className={`text-[11px] font-mono ${isLightMode ? "text-emerald-600" : "text-[#39ff14]"}`}
            >
              Saved
            </span>
          </div>
        )}
        {saveError && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-md ${isLightMode ? "bg-red-50 border-red-300" : "bg-red-500/10 border-red-500/30"}`}
            title={saveError}
          >
            <span
              className={`text-[11px] font-mono ${isLightMode ? "text-red-700" : "text-red-400"}`}
            >
              Save error
            </span>
          </div>
        )}
        {isDirty && !saving && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 border rounded-md ${isLightMode ? "bg-amber-50 border-amber-300" : "bg-amber-500/10 border-amber-500/30"}`}
          >
            <span
              className={`text-[11px] font-mono ${isLightMode ? "text-amber-700" : "text-amber-400"}`}
            >
              Unsaved changes
            </span>
            <button
              onClick={handleExplicitSave}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium ${isLightMode ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-[#39ff14] text-black hover:bg-[#39ff14]/80"} transition-colors`}
            >
              <Save size={10} />
              Save
            </button>
          </div>
        )}
      </div>

      {/* Settings — 2-column layout, explicit grouping */}
      <div className="grid grid-cols-2 gap-4 items-start">
        {/* Left Column — Agent & Chat UI */}
        <div className="space-y-4">
          {renderIdentity()}
          {renderAgentCard()}
          {renderSkills()}
          {renderProjects()}
          {renderKnowledgeBase()}
          {renderChatUI()}
        </div>

        {/* Right Column — Third-party APIs & Infrastructure */}
        <div className="space-y-4">
          {renderEndpoint()}
          {renderEmbedding()}
          {renderDatabase()}
          {renderProjectSupabase()}
          {renderWebsiteMcp()}
          {renderLicenseKeys()}
          {renderSessionTokenVerification()}
          {renderTelegram()}
          {renderDeploy()}
        </div>

        {/* Distribution — full width */}
        <div className="col-span-2">{renderWidgetDeploy()}</div>
      </div>

      {/* Bottom Save Button (mirrors fixed-position for accessibility) */}
      {isDirty && (
        <div className="mt-6 mb-8">
          <button
            className={
              primaryBtnCls + " flex items-center justify-center gap-2 w-full"
            }
            onClick={handleExplicitSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save All Changes
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default A2aAgentSettings;
