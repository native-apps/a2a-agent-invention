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
  Network,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import FastMarkdown from "../../../components/FastMarkdown";
import ThemedSelect from "../../../components/ThemedSelect";
import { saveSupabaseCreds } from "../shared/supabaseConfig";
import {
  NEAR_RPC_TESTNET,
  NEIGHBORS_CONTRACT_TESTNET,
  WALLET_PRESETS,
  buildWalletLoginUrl,
  buildNeighborRegisterArgs,
  generateNeighborKey,
  neighborKeyPermissionIssue,
  registerOrUpdateOnchain,
  verifyNeighborKeyOnAccount,
  webcryptoEd25519Available,
} from "./near-wallet";

// ── Redeploy indicator ── The settings below ship to the Cloudflare Worker
// as secrets (config.json actions.deploy.secrets — keep in sync). Changing
// ANY of them (or updating the invention's code) means the deployed worker
// is stale until the next Deploy. The wizard fingerprints these at deploy
// time and shows a persistent "Redeploy needed" banner when they drift.
const DEPLOY_AFFECTING_SETTINGS = [
  "embeddingApiKey",
  "supabaseUrl",
  "supabaseServiceKey",
  "mbSupabaseUrl",
  "mbSupabaseServiceKey",
  "mbProjectId",
  "gatewayToken",
  "gatewayBaseUrl",
  "agentName",
  "agentDescription",
  "agentUrl",
  "agentSkillsJson",
  "agentProvider",
  "accessToken",
  "mcpBaseUrl",
  "mcpApiKey",
  "websiteUrl",
  "encoreApiUrl",
  "encoreApiKey",
  "jwtSecret",
  "telegramBotToken",
  "mcpCloudUrl",
  "forceCloudMcp",
];

/** Stable fingerprint (FNV-1a x2) of the deploy-affecting settings. */
function deployFingerprint(s: Record<string, unknown>): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const key of DEPLOY_AFFECTING_SETTINGS) {
    const str = key + "=" + String(s[key] ?? "") + "\u0001";
    for (let i = 0; i < str.length; i++) {
      h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
      h2 = (h2 + str.charCodeAt(i) * (i + 7)) >>> 0;
    }
  }
  return h1.toString(36) + "-" + h2.toString(36);
}

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
  mcpBaseUrl: string;
  mcpApiKey: string;
  websiteUrl: string;
  telegramBotToken: string;
  jwtSecret: string;
  encoreApiUrl: string;
  encoreApiKey: string;
  // ── NEAR Neighbors (public agent-to-agent network) ──
  neighborsEnabled: boolean;
  neighborTags: string; // comma-separated: "ai, devtools, saas"
  neighborCategory: string; // startup | freelancer | business
  neighborCapabilities: string; // comma-separated: "ai-memory, website-builder"
  neighborPartnerNote: string;
  nearAccountId: string; // the NEAR account that registered this agent
  neighborKeyPublic: string; // "ED25519:..." — scoped function-call key (wallet-connect)
  neighborKeySecret: string; // base64 PKCS#8 — scoped to registry register/update/heartbeat only
  neighborWalletUrl: string; // wallet login URL preset (Meteor default; editable)
  kbFolder: string;
  kbIncludeFiles: Record<string, boolean>;
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
  lastDeployFingerprint: string;
  lastDeployVersion: string;
  lastEndpointPingAt: string | null;
  lastEndpointPingOk: boolean;
  lastCfCheckAt?: string | null;
  lastCfDeployedAt?: string | null;
  lastCheckupAt?: string | null;
  lastCheckupIssues?: number;
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

type NodeId =
  | "identity"
  | "website"
  | "cloudmirror"
  | "mcpserver"
  | "telegram"
  | "jwtauth"
  | "license"
  | "neighbors"; // Wizard 2 grows node-by-node.

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
  kind?: "text" | "number" | "array" | "select" | "botuser" | "addSkill";
}

// ── AI Assistant field editing — per-slide allowlists (phase 1: Agent
//    Identity). Each entry declares a field the assistant may pre-fill on
//    THAT slide via [[SET:field=value]] Apply buttons. Secrets, locked
//    fields, and the skills ARRAY are excluded by design: tokens/keys are
//    fetched with their own buttons, the primary project is locked, and
//    skills are added whole via the ADD_SKILL tag. ──
interface EditableFieldDef {
  field: string;
  label: string;
  kind?: "text" | "number" | "array" | "select" | "botuser" | "addSkill";
  promptHint?: string; // extra guidance for the system prompt
}

const IDENTITY_SLIDE_FIELDS: Record<string, EditableFieldDef[]> = {
  "Choose the Bot User": [
    {
      field: "botUserId",
      label: "Bot User",
      kind: "botuser",
      promptHint: "value must be one of the listed agent user IDs",
    },
  ],
  "Describe Your Agent": [
    { field: "agentDescription", label: "Agent Description" },
  ],
  "Organization / Provider": [
    { field: "agentProvider", label: "Organization / Provider" },
  ],
  "Access Token": [], // secret — assistant guides to Rotate Token, never sets it
  "AI Model": [
    {
      field: "aiModel",
      label: "AI Model",
      kind: "select",
      promptHint: "value must be one of the listed model IDs",
    },
  ],
  "Response Settings": [
    {
      field: "cfMaxTokens",
      label: "Max Tokens",
      kind: "number",
      promptHint: "128–8192",
    },
    {
      field: "cfTemperature",
      label: "Temperature",
      kind: "number",
      promptHint: "0–2",
    },
  ],
  "Vectorization": [
    {
      field: "embeddingProvider",
      label: "Embedding Provider",
      kind: "select",
      promptHint: "voyage-ai or openai",
    },
    { field: "embeddingModel", label: "Embedding Model" },
    {
      field: "embeddingDimensions",
      label: "Vector Dimensions",
      kind: "number",
      promptHint: "must match the DB column (1024 for voyage-4-large)",
    },
    // embeddingApiKey excluded — use the Fetch button
  ],
  "Agent Skills": [
    {
      field: "__addSkill",
      label: "Add Skill",
      kind: "addSkill",
      promptHint:
        "use [[ADD_SKILL:{\"name\":\"…\",\"description\":\"…\",\"tags\":[…],\"examples\":[…]}]]",
    },
  ],
  "Project Access": [
    {
      field: "additionalProjectIds",
      label: "Additional Context Projects",
      kind: "array",
      promptHint: "comma-separated project IDs from the listed projects",
    },
    // primaryProjectId excluded — locked
  ],
  "Agent Card & Review": [
    { field: "agentUrl", label: "Agent URL (A2A endpoint)" },
  ],
  "Finish & Verify": [], // diagnostics — nothing to edit
};

// Resolve the editable fields for the CURRENT node+slide (phase 1: identity).
function editableFieldsFor(node: NodeId, slideTitle: string): EditableFieldDef[] {
  if (node === "identity") return IDENTITY_SLIDE_FIELDS[slideTitle] || [];
  return [];
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
  lastDeployFingerprint: "",
  lastDeployVersion: "",
  lastCheckupAt: null,
  lastCheckupIssues: 0,
  mcpCloudUrl: "",
  forceCloudMcp: false,
  mcpBaseUrl: "",
  mcpApiKey: "",
  websiteUrl: "",
  telegramBotToken: "",
  jwtSecret: "",
  encoreApiUrl: "",
  encoreApiKey: "",
  neighborsEnabled: false,
  neighborTags: "",
  neighborCategory: "startup",
  neighborCapabilities: "",
  neighborPartnerNote: "",
  nearAccountId: "",
  neighborKeyPublic: "",
  neighborKeySecret: "",
  neighborWalletUrl: "",
  kbFolder: "",
  kbIncludeFiles: {
    "SOUL.md": true,
    "SECURITY.md": true,
    "SKILLS.md": true,
  },
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
  server: () => (
    <>
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </>
  ),
  // Official Telegram logo glyph (filled) — circle + plane, rendered via
  // fill="currentColor" (the icon wrapper sets `color` to the stroke color).
  telegram: () => (
    <path
      d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      fill="currentColor"
      stroke="none"
    />
  ),
  key: () => (
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
  ),
  award: () => (
    <>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </>
  ),
  network: () => (
    <>
      <rect height="8" width="8" x="2" y="2" rx="1" />
      <rect height="8" width="8" x="14" y="2" rx="1" />
      <rect height="8" width="8" x="2" y="14" rx="1" />
      <path d="M14 6h-4v12" />
      <path d="M10 18h4" />
    </>
  ),
};



// Knowledge Base Packing — files the Cloudflare Worker bundles (same list as
// the classic Settings screen and scripts/pack-knowledge-base.cjs).
const EXPECTED_KB_FILES = ["SOUL.md", "SECURITY.md", "SKILLS.md"];

// Worker Name derivation — slugify the Agent Name into a valid Cloudflare
// Worker name (lowercase alphanumerics + hyphens) for the {agent-name}-a2a
// auto-fill on the Deploy slide.
const slugifyAgentName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// Fields the AI assistant is allowed to pre-fill, resolved per current slide
// (phase 1: Agent Identity). Labels for Apply buttons come from the defs.
const SUGGESTABLE_FIELDS: Record<string, string> = {
  agentDescription: "Agent Description",
  agentProvider: "Provider",
};

/** Extract [[SET:field=value]] and [[ADD_SKILL:{json}]] suggestions from an
 *  assistant message. Fields not on ANY allowlist are dropped here; the
 *  current-slide filter happens at render/apply time (one slide at a time). */
function parseSuggestions(content: string): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  const re = /\[\[SET:([a-zA-Z]+)=([^\]]*)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const known =
      SUGGESTABLE_FIELDS[m[1]] ||
      Object.values(IDENTITY_SLIDE_FIELDS)
        .flat()
        .some((d) => d.field === m[1]);
    if (known) out.push({ field: m[1], value: m[2] });
  }
  const reAdd = /\[\[ADD_SKILL:(\{.*?\})\]\]/g;
  while ((m = reAdd.exec(content)) !== null) {
    try {
      JSON.parse(m[1]); // validate now; parse again on apply
      out.push({ field: "__addSkill", value: m[1], kind: "addSkill" });
    } catch {
      // malformed JSON — skip
    }
  }
  return out;
}

/** Strip the [[SET:…]] tags for display. */
function stripSuggestions(content: string): string {
  return content
    .replace(/\[\[SET:[^\]]+\]\]/g, "")
    .replace(/\[\[ADD_SKILL:\{.*?\}\]\]/g, "")
    .trim();
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your A2A setup assistant. Ask me about any field on this step, or tell me what you want and I'll fill it in for you — my suggestions appear as **Apply** buttons that write straight into your settings (the Agent Name comes automatically from your Sub-Agent).",
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
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNeighborCmd, setCopiedNeighborCmd] = useState(false);
  const [copiedNeighborPrompt, setCopiedNeighborPrompt] = useState(false);
  const [copiedNeighborUpdate, setCopiedNeighborUpdate] = useState(false);

  // ── Wallet-connect (scoped access key) — Option B, 2026-08-25. The wizard
  // generates an ed25519 keypair; the user adds the PUBLIC key as a
  // function-call key via their wallet's login URL (scoped to the neighbors
  // registry contract); the wizard then signs register/update locally. No
  // terminal, no seed phrases — and the key later enables worker heartbeat.
  const [nbWalletBusy, setNbWalletBusy] = useState<"" | "key" | "verify" | "tx">("");
  const [nbWalletMsg, setNbWalletMsg] = useState("");
  const [nbWalletOk, setNbWalletOk] = useState(false);
  const [nbWalletLinkCopied, setNbWalletLinkCopied] = useState(false);

  /** Wallet-connect steps (scoped access key — Option B). Every step is
   *  defensive: no account set, no key, unsupported webview — clear message,
   * never a crash. */
  const runNbWalletStep = async (step: "key" | "verify" | "tx") => {
    const account = (settings.nearAccountId || "").trim();
    setNbWalletOk(false);
    setNbWalletMsg("");
    try {
      if (step === "key") {
        setNbWalletBusy("key");
        if (!(await webcryptoEd25519Available())) {
          setNbWalletMsg(
            "This system can't generate keys in-app (needs macOS 14+/Safari 17+ Web Crypto). Use the CLI command path above instead.",
          );
          return;
        }
        const key = await generateNeighborKey();
        updateField("neighborKeyPublic", key.publicKey);
        updateField("neighborKeySecret", key.secret);
        setNbWalletMsg(
          `Neighbor key generated (${key.publicKey.slice(0, 28)}…) — scoped: it can ONLY call register/update/heartbeat on the Neighbors registry, nothing else. Next: approve it in your wallet (step 2).`,
        );
        return;
      }
      if (!settings.neighborKeyPublic || !settings.neighborKeySecret) {
        setNbWalletMsg("Generate your neighbor key first (step 1).");
        return;
      }
      if (!account) {
        setNbWalletMsg("Set your NEAR account above first.");
        return;
      }
      if (step === "verify") {
        setNbWalletBusy("verify");
        const v = await verifyNeighborKeyOnAccount(
          NEAR_RPC_TESTNET,
          account,
          settings.neighborKeyPublic,
        );
        if (v.found) {
          const issue = neighborKeyPermissionIssue(
            v.permission,
            NEIGHBORS_CONTRACT_TESTNET,
          );
          if (issue) {
            setNbWalletMsg(`⚠ Key found on ${account}, but ${issue}`);
          } else {
            setNbWalletOk(true);
            setNbWalletMsg(
              `✓ Key connected to ${account} (limited: registry only) — the account can now sign registry transactions from this wizard.`,
            );
          }
        } else {
          setNbWalletMsg(
            `Key not on ${account} yet — open the wallet link (step 2) in any browser, approve the access key, then retry. TIP: your wallet must be signed in as ${account} — check the account shown in your wallet before approving.`,
          );
        }
        return;
      }
      // step === "tx" — register or update (detected live from the registry)
      setNbWalletBusy("tx");
      const res = await registerOrUpdateOnchain({
        rpcUrl: NEAR_RPC_TESTNET,
        contract: NEIGHBORS_CONTRACT_TESTNET,
        account,
        key: {
          publicKey: settings.neighborKeyPublic,
          secret: settings.neighborKeySecret,
        },
        args: buildNeighborRegisterArgs(settings),
      });
      if (res.ok) {
        setNbWalletOk(true);
        setNbWalletMsg(
          `✓ ${res.action === "register" ? "Registered" : "Entry updated"} onchain${res.txHash ? ` (tx ${res.txHash.slice(0, 20)}…)` : ""} — Finish & Verify's onchain check should now pass.`,
        );
      } else {
        setNbWalletMsg(res.error || "Transaction failed.");
      }
    } catch (err) {
      setNbWalletMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setNbWalletBusy("");
    }
  };

  // ── Knowledge Base Packing (Cloudflare Worker Model slide) — same sources
  //    as the classic Settings screen's Knowledge Base Packing section ──
  const [projectSubdirs, setProjectSubdirs] = useState<
    { name: string; path: string }[]
  >([]);
  const [kbFoundFiles, setKbFoundFiles] = useState<Set<string>>(new Set());

  // ── Deployed Worker verification (Mirror Checklist slide) ──
  const [workerTestRunning, setWorkerTestRunning] = useState(false);
  const [workerTestDone, setWorkerTestDone] = useState(false);
  const [workerTestResults, setWorkerTestResults] = useState<{
    reachable: boolean | null;
    cardName: string | null;
    cardNameMatches: boolean | null;
    cardProvider: string | null;
    gatewayUrl: string | null;
    mcpConfigured: boolean | null;
    cfLastModified: string | null;
  } | null>(null);

  // ── Finish & Verify slide (appended to every node) — REAL diagnostics ──
  const [finishChecks, setFinishChecks] = useState<
    {
      key: string;
      label: string;
      status: "pending" | "running" | "ok" | "fail";
      detail: string;
    }[]
  >([]);
  const [finishRunning, setFinishRunning] = useState(false);
  const [finishRan, setFinishRan] = useState(false);
  const [finishSaved, setFinishSaved] = useState(false);
  // Worker Name unlock (Deploy slide) — session-only; resets when the modal
  // closes so the safety lock re-engages by default.
  const [workerNameUnlocked, setWorkerNameUnlocked] = useState(false);

  // ── MCP Server node — tool discovery (mirrors the classic Website MCP
  //    Integration section's Discover Tools flow) ──
  const [discovering, setDiscovering] = useState(false);
  const [discoveredError, setDiscoveredError] = useState<string | null>(null);
  const [discoveredTools, setDiscoveredTools] = useState<
    { name?: string; description?: string }[]
  >([]);

  // ── Telegram node — webhook test/register (mirrors the classic Telegram
  //    Integration section's two-step flow) ──
  const [webhookStatus, setWebhookStatus] = useState<{
    state: "idle" | "testing" | "registering" | "success" | "error";
    message: string;
  }>({ state: "idle", message: "" });

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

  // ── Redeploy indicator: the INSTALLED invention's version (read once from
  // the invention's own config.json via the resource endpoint). Compared
  // against lastDeployVersion — a mismatch means newer worker code exists
  // than what's deployed. Fails silently on older MB builds (settings-only
  // check still applies).
  const inventionVersionRef = useRef("");
  useEffect(() => {
    const pid = settings.primaryProjectId || activeProjectId;
    fetch(
      `/api/inventions/${invention.id}/resource/config.json${
        pid ? `?projectId=${encodeURIComponent(pid)}` : ""
      }`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { version?: string } | null) => {
        if (c?.version) inventionVersionRef.current = c.version;
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Agent Name is AUTOMATIC: it mirrors the selected Sub-Agent's name from
  //    the project's Users screen (the source of truth — the Wizard has no
  //    Name field). Whenever the users list loads and a bot user is selected,
  //    agentName follows the bot user's current name. ──
  useEffect(() => {
    if (!settings.botUserId) return;
    const u = projectUsers.find((p) => p.id === settings.botUserId);
    if (u?.name && u.name !== settings.agentName) {
      updateField("agentName", u.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectUsers, settings.botUserId]);

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

  // ── KB Packing: project sub-folders for the CF Worker Files Folder select
  //    (same /api/files listing the classic Settings screen uses) ──
  useEffect(() => {
    const pid = settings.primaryProjectId || activeProjectId;
    if (!pid) return;
    fetch(`/api/projects/${encodeURIComponent(pid)}/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((config) => {
        const rootPath = config?.indexing?.rootPath || config?.rootPath;
        if (!rootPath) return null;
        return fetch(`/api/files?root=${encodeURIComponent(rootPath)}`).then(
          (r) => (r.ok ? r.json() : []),
        );
      })
      .then((data) => {
        if (!data || !Array.isArray(data)) return;
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

  // ── KB Packing: scan the chosen folder for the expected files ──
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

  // ── Worker Name auto-fill: derives {agent-name}-a2a from the Agent Name
  //    while the field is untouched AND the Worker isn't deployed yet. A
  //    manual edit (anything non-empty that isn't the derived value) stops
  //    the auto-fill; clearing the field completely resumes it. ──
  const workerNameAutoRef = useRef<boolean>(
    (() => {
      const wn = propsSettings.workerName || "";
      const deployed =
        propsSettings.deployStatus === "deployed" ||
        !!propsSettings.lastDeployedAt ||
        !!propsSettings.lastCfDeployedAt;
      if (deployed) return false;
      if (!wn || wn === "a2a-endpoint") return true;
      return wn === `${slugifyAgentName(propsSettings.agentName || "")}-a2a`;
    })(),
  );
  useEffect(() => {
    if (!workerNameAutoRef.current) return;
    const deployed =
      settings.deployStatus === "deployed" ||
      !!settings.lastDeployedAt ||
      !!settings.lastCfDeployedAt;
    if (deployed) return;
    const slug = slugifyAgentName(settings.agentName || "");
    if (!slug) return;
    const derived = `${slug}-a2a`;
    if ((settings.workerName || "") !== derived) {
      updateField("workerName", derived);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.agentName, settings.workerName, settings.deployStatus, settings.lastDeployedAt, settings.lastCfDeployedAt]);

  // ── Mirror Checklist: verify the DEPLOYED Worker — browser-side, zero new
  //    backend. Combines the MB-side health-check action (reachability + CF
  //    last-modified) with the Worker's CORS-enabled surfaces: the Agent Card
  //    (identity verification vs settings) and /debug/mcp (runtime MCP env). ──
  const runWorkerTest = async () => {
    if (workerTestRunning) return;
    setWorkerTestRunning(true);
    setWorkerTestDone(false);
    const endpoint = (settings.agentUrl || "").replace(/\/+$/, "");
    const out = {
      reachable: null as boolean | null,
      cardName: null as string | null,
      cardNameMatches: null as boolean | null,
      cardProvider: null as string | null,
      gatewayUrl: null as string | null,
      mcpConfigured: null as boolean | null,
      cfLastModified: null as string | null,
    };
    try {
      // 1. MB-side health check (endpoint reachability + Cloudflare last-modified)
      const pid = settings.primaryProjectId || activeProjectId;
      try {
        const r = await fetch(
          `/api/inventions/a2a-agent/action/health-check${pid ? `?projectId=${pid}` : ""}`,
        );
        if (r.ok) {
          const d = await r.json();
          out.reachable = !!d.endpointReachable;
          out.cfLastModified = d.cloudflareLastModified || null;
        }
      } catch {}
      // Action returned no timestamp (known MB-app bug — wrong CF endpoint) →
      // fall back to a direct versions-API lookup.
      if (!out.cfLastModified) {
        out.cfLastModified = await cfLastModifiedFallback();
      }

      // 2 + 3. Live Agent Card + runtime MCP config from the deployed Worker
      if (endpoint) {
        try {
          const r = await fetch(`${endpoint}/.well-known/agent-card.json`);
          if (r.ok) {
            const card = await r.json();
            out.cardName = card?.name || null;
            out.cardProvider = card?.provider?.organization || null;
            if (settings.agentName) {
              out.cardNameMatches = card?.name === settings.agentName;
            }
          }
        } catch {}
        try {
          const r = await fetch(`${endpoint}/debug/mcp`);
          if (r.ok) {
            const d = await r.json();
            out.gatewayUrl = d?.gatewayUrl || null;
            out.mcpConfigured =
              typeof d?.configured === "boolean" ? d.configured : null;
          }
        } catch {}
      }
      setWorkerTestResults(out);
      setWorkerTestDone(true);

      // Persist ping state exactly like runHealthCheck does
      if (out.reachable !== null) {
        const updates: Partial<Wizard2Settings> = {
          lastEndpointPingAt: new Date().toISOString(),
          lastEndpointPingOk: out.reachable,
          lastCfCheckAt: new Date().toISOString(),
        };
        if (out.cfLastModified) updates.lastCfDeployedAt = out.cfLastModified;
        applyAndSave(updates);
      }
    } finally {
      setWorkerTestRunning(false);
    }
  };

  // ── Finish & Verify — real check helpers ──
  const isValidUrl = (s: string): boolean => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  };

  const pingUrl = async (
    url: string,
    init?: RequestInit,
    ms = 8000,
  ): Promise<{ ok: boolean; detail: string }> => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(t);
      return { ok: res.ok, detail: res.ok ? "reachable" : `HTTP ${res.status}` };
    } catch (e) {
      return {
        ok: false,
        detail: (e as Error).name === "AbortError" ? "timeout" : "unreachable",
      };
    }
  };

  // Live Supabase REST ping — verifies URL AND key actually work.
  const supabasePing = async (
    url: string,
    key: string,
  ): Promise<{ ok: boolean; detail: string }> => {
    if (!url || !key) return { ok: false, detail: "URL or service key not set" };
    const r = await pingUrl(`${url.replace(/\/+$/, "")}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return r.ok
      ? { ok: true, detail: "live — REST API answered with the key" }
      : { ok: false, detail: `${r.detail} — check the URL/key in Project Settings` };
  };

  const callHealthAction = async (): Promise<{
    endpointReachable?: boolean;
    cloudflareLastModified?: string;
  } | null> => {
    try {
      const pid = settings.primaryProjectId || activeProjectId;
      const r = await fetch(
        `/api/inventions/a2a-agent/action/health-check${pid ? `?projectId=${pid}` : ""}`,
      );
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };

  // Fallback timestamp lookup: query Cloudflare's versions API directly from
  // the browser (same direct-CF-API pattern the classic Settings screen uses
  // for secrets). Needed because the MB-side health-check action hits
  // /workers/scripts/{name} — which returns the raw script SOURCE (multipart),
  // not JSON metadata — so its cloudflareLastModified is always null. See
  // HANDOFF-TO-MB-CODER.md Part 19 for the MB-app-side fix.
  const cfLastModifiedFallback = async (): Promise<string | null> => {
    const acct = settings.cloudflareAccountId;
    const token = settings.cfApiToken;
    const name = settings.workerName;
    if (!acct || !token || !name) return null;
    try {
      const r = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${acct}/workers/scripts/${name}/versions`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) return null;
      const d = await r.json();
      const item = d?.result?.items?.[0];
      return item?.metadata?.created_on || item?.metadata?.modified_on || null;
    } catch {
      return null;
    }
  };

  const agentCardCheck = async (): Promise<{ ok: boolean; detail: string }> => {
    const endpoint = (settings.agentUrl || "").replace(/\/+$/, "");
    if (!endpoint) return { ok: false, detail: "endpoint not set" };
    try {
      const r = await fetch(`${endpoint}/.well-known/agent-card.json`);
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const card = await r.json();
      return card?.name
        ? { ok: true, detail: `serving “${card.name}”` }
        : { ok: false, detail: "card served but has no name" };
    } catch {
      return { ok: false, detail: "unreachable" };
    }
  };

  // Runs the node's REAL diagnostics sequentially — each row animates in as
  // its check executes (presence checks against live settings, network checks
  // against live endpoints). Results are never faked.
  const runFinishChecks = async (node: NodeId) => {
    const defs: {
      key: string;
      label: string;
      run: () => Promise<{ ok: boolean; detail: string }>;
    }[] = [];

    if (node === "identity") {
      defs.push(
        {
          key: "botuser",
          label: "Bot user chosen (exists in this project)",
          run: async () => {
            const u = projectUsers.find((p) => p.id === settings.botUserId);
            return {
              ok: !!u,
              detail: u
                ? u.name || u.email || "selected"
                : settings.botUserId
                  ? "saved ID not in this project's agent users"
                  : "no bot user selected",
            };
          },
        },
        {
          key: "token",
          label: "Access token present",
          run: async () => ({
            ok: !!settings.accessToken,
            detail: settings.accessToken
              ? "set (masked)"
              : "missing — re-select the bot user or rotate the token",
          }),
        },
        {
          key: "name",
          label: "Agent name (automatic from the bot user)",
          run: async () => ({
            ok: !!settings.agentName?.trim(),
            detail:
              settings.agentName?.trim() ||
              "empty — set the Sub-Agent's name in the project's Users screen",
          }),
        },
        {
          key: "desc",
          label: "Agent description",
          run: async () => ({
            ok: !!settings.agentDescription?.trim(),
            detail: settings.agentDescription?.trim() ? "set" : "empty",
          }),
        },
        {
          key: "gateway",
          label: "MCP Gateway connection",
          run: async () => ({
            ok: !!settings.gatewayBaseUrl,
            detail: settings.gatewayBaseUrl || "missing — from MB App Settings",
          }),
        },
        {
          key: "embedding",
          label: "Embeddings configured (Total Recall)",
          run: async () => ({
            ok: !!settings.embeddingApiKey,
            detail: settings.embeddingApiKey
              ? "API key set"
              : "no API key — Fetch from the project's embedding config",
          }),
        },
      );
    } else if (node === "website") {
      defs.push(
        {
          key: "endpoint",
          label: "A2A endpoint set (valid URL)",
          run: async () => ({
            ok: isValidUrl(settings.agentUrl || ""),
            detail: settings.agentUrl || "empty — paste it on slide 1",
          }),
        },
        {
          key: "live",
          label: "Endpoint live (real health-check ping)",
          run: async () => {
            const d = await callHealthAction();
            if (!d) return { ok: false, detail: "health-check action unavailable" };
            return {
              ok: !!d.endpointReachable,
              detail: d.endpointReachable ? "reachable" : "no answer from the endpoint",
            };
          },
        },
        {
          key: "card",
          label: "Agent Card served (/.well-known/agent-card.json)",
          run: agentCardCheck,
        },
      );
    } else if (node === "mcpserver") {
      const toolsPing = async (): Promise<{ ok: boolean; detail: string }> => {
        const endpoint = (settings.agentUrl || "").replace(/\/+$/, "");
        if (!endpoint) return { ok: false, detail: "A2A endpoint not set" };
        const r = await pingUrl(`${endpoint}/website-mcp/tools`);
        if (!r.ok) return { ok: false, detail: `${r.detail} — the agent can't reach the MCP server` };
        try {
          const res = await fetch(`${endpoint}/website-mcp/tools`);
          const data = await res.json();
          const tools = Array.isArray(data) ? data : data?.tools || [];
          return tools.length > 0
            ? { ok: true, detail: `${tools.length} tools live (${tools.slice(0, 3).map((t: { name?: string }) => t.name).filter(Boolean).join(", ")}${tools.length > 3 ? "…" : ""})` }
            : { ok: false, detail: "reachable but 0 tools returned" };
        } catch {
          return { ok: false, detail: "non-JSON response from /website-mcp/tools" };
        }
      };
      const runtimeMcpCheck = async (): Promise<{ ok: boolean; detail: string }> => {
        const endpoint = (settings.agentUrl || "").replace(/\/+$/, "");
        if (!endpoint) return { ok: false, detail: "A2A endpoint not set" };
        try {
          const r = await fetch(`${endpoint}/debug/mcp`);
          if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
          const d = await r.json();
          const configured = d?.configured;
          if (typeof configured !== "boolean")
            return { ok: false, detail: "worker /debug/mcp didn't report configured state" };
          return configured
            ? { ok: true, detail: "worker reports website MCP configured" }
            : { ok: false, detail: "worker reports website MCP NOT configured — redeploy after saving" };
        } catch {
          return { ok: false, detail: "unreachable" };
        }
      };
      defs.push(
        {
          key: "mcpurl",
          label: "MCP Server URL set (valid URL)",
          run: async () => ({
            ok: isValidUrl(settings.mcpBaseUrl || ""),
            detail: settings.mcpBaseUrl || "empty — optional, but required for website tools",
          }),
        },
        {
          key: "mcpkey",
          label: "MCP API key present",
          run: async () => ({
            ok: !!settings.mcpApiKey,
            detail: settings.mcpApiKey ? "set (masked)" : "empty — set it on slide 1",
          }),
        },
        {
          key: "siteurl",
          label: "Website URL set (navigate/highlight links)",
          run: async () => ({
            ok: isValidUrl(settings.websiteUrl || ""),
            detail: settings.websiteUrl || "empty — where navigate/highlight links point",
          }),
        },
        {
          key: "tools",
          label: "Website tools discoverable (live /website-mcp/tools ping)",
          run: toolsPing,
        },
        {
          key: "runtime",
          label: "Runtime MCP config (worker /debug/mcp)",
          run: runtimeMcpCheck,
        },
      );
    } else if (node === "telegram") {
      const telegramGetMe = async (): Promise<{
        ok: boolean;
        detail: string;
      }> => {
        if (!settings.telegramBotToken)
          return { ok: false, detail: "no bot token — get one from @BotFather" };
        try {
          const r = await fetch(
            `https://api.telegram.org/bot${settings.telegramBotToken}/getMe`,
          );
          const d = await r.json();
          return d.ok
            ? { ok: true, detail: `@${d.result?.username} verified live` }
            : { ok: false, detail: `Telegram rejected the token: ${d.description || "invalid"}` };
        } catch {
          return { ok: false, detail: "could not reach api.telegram.org" };
        }
      };
      const telegramWebhookCheck = async (): Promise<{
        ok: boolean;
        detail: string;
      }> => {
        if (!settings.telegramBotToken)
          return { ok: false, detail: "no bot token" };
        const expected = settings.agentUrl
          ? `${settings.agentUrl.replace(/\/+$/, "")}/webhook/telegram`
          : "";
        if (!expected)
          return { ok: false, detail: "A2A endpoint not set — webhook has no target" };
        try {
          const r = await fetch(
            `https://api.telegram.org/bot${settings.telegramBotToken}/getWebhookInfo`,
          );
          const d = await r.json();
          if (!d.ok) return { ok: false, detail: `Telegram API error: ${d.description || "unknown"}` };
          const url: string = d.result?.url || "";
          if (!url)
            return { ok: false, detail: "no webhook registered — run Test & Register Webhook (slide 2)" };
          return url === expected
            ? { ok: true, detail: `registered → this agent (${url})` }
            : { ok: false, detail: `registered → ${url} (different target — re-register on slide 2)` };
        } catch {
          return { ok: false, detail: "could not reach api.telegram.org" };
        }
      };
      defs.push(
        {
          key: "tgtoken",
          label: "Bot token present",
          run: async () => ({
            ok: !!settings.telegramBotToken,
            detail: settings.telegramBotToken
              ? "set (masked) — from @BotFather"
              : "empty — optional node; get a token from @BotFather (slide 1)",
          }),
        },
        {
          key: "tgme",
          label: "Bot token valid (live getMe)",
          run: telegramGetMe,
        },
        {
          key: "tgwh",
          label: "Webhook registered to this agent (live)",
          run: telegramWebhookCheck,
        },
      );
    } else if (node === "jwtauth") {
      defs.push(
        {
          key: "jwtsecret",
          label: "JWT secret present",
          run: async () => ({
            ok: !!settings.jwtSecret,
            detail: settings.jwtSecret
              ? "set (masked) — fail-open for verified sessions"
              : "empty — fail-closed (503 for JWT requests). Fine if your site has no logins.",
          }),
        },
        {
          key: "jwtlen",
          label: "JWT secret strength",
          run: async () => {
            const s = settings.jwtSecret || "";
            if (!s) return { ok: false, detail: "no secret set" };
            return s.length >= 32
              ? { ok: true, detail: `${s.length} chars — strong enough for HMAC-SHA256` }
              : { ok: false, detail: `only ${s.length} chars — use the full 64-char base64url JwtSecret` };
          },
        },
        {
          key: "jwtep",
          label: "A2A endpoint set (the verifier)",
          run: async () => ({
            ok: isValidUrl(settings.agentUrl || ""),
            detail: settings.agentUrl || "empty — the deployed Worker is what verifies tokens",
          }),
        },
      );
    } else if (node === "license") {
      defs.push(
        {
          key: "licurl",
          label: "Encore API URL set (valid URL)",
          run: async () => ({
            ok: isValidUrl(settings.encoreApiUrl || ""),
            detail: settings.encoreApiUrl || "empty — optional; license keys fall back to license:{key}",
          }),
        },
        {
          key: "lickey",
          label: "Encore API key (when the endpoint is private)",
          run: async () => ({
            ok: !!settings.encoreApiKey || !settings.encoreApiUrl,
            detail: settings.encoreApiKey
              ? "set (masked)"
              : settings.encoreApiUrl
                ? "no key — only OK if your endpoint is public"
                : "not needed without an API URL",
          }),
        },
        {
          key: "licep",
          label: "A2A endpoint set (the resolver)",
          run: async () => ({
            ok: isValidUrl(settings.agentUrl || ""),
            detail: settings.agentUrl || "empty — the deployed Worker performs the lookups",
          }),
        },
      );
    } else if (node === "neighbors") {
      const neighborCardCheck = async (): Promise<{ ok: boolean; detail: string }> => {
        const endpoint = (settings.agentUrl || "").replace(/\/+$/, "");
        if (!endpoint) return { ok: false, detail: "A2A endpoint not set" };
        try {
          const res = await fetch(`${endpoint}/neighbor`);
          if (!res.ok) return { ok: false, detail: `HTTP ${res.status} — redeploy the agent (v1.2.159+)` };
          const d = await res.json();
          return d?.protocol === "neighbors/0.1"
            ? { ok: true, detail: "public neighbor card served" }
            : { ok: false, detail: "responded without the neighbors protocol — redeploy" };
        } catch {
          return { ok: false, detail: "unreachable — is the agent deployed?" };
        }
      };
      const onchainCheck = async (): Promise<{ ok: boolean; detail: string }> => {
        const account = (settings.nearAccountId || "").trim();
        if (!account) return { ok: false, detail: "no NEAR account set (slide 3)" };
        try {
          // NOTE: the contract's method signature is get_agent(account: AccountId)
          // — the args key MUST be "account" ("account_id" silently fails
          // deserialization and the RPC returns an error object).
          const args = btoa(JSON.stringify({ account }));
          const res = await fetch("https://test.rpc.fastnear.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "wizard-neighbors",
              method: "query",
              params: {
                request_type: "call_function",
                finality: "final",
                account_id: "neighborly.testnet",
                method_name: "get_agent",
                args_base64: args,
              },
            }),
          });
          const json = await res.json();
          const bytes = json?.result?.result;
          if (!Array.isArray(bytes))
            return { ok: false, detail: `not registered as ${account} (or RPC error)` };
          const entry = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
          return entry?.name
            ? { ok: true, detail: `onchain: ${entry.name} (${entry.domain}) — ${entry.status === 0 ? "active" : "paused"}` }
            : { ok: false, detail: `no entry found for ${account}` };
        } catch {
          return { ok: false, detail: "couldn't reach the registry RPC — check nearblocks.io/address/neighborly.testnet" };
        }
      };
      const knockCheck = async (): Promise<{ ok: boolean; detail: string }> => {
        const endpoint = (settings.agentUrl || "").replace(/\/+$/, "");
        if (!endpoint) return { ok: false, detail: "A2A endpoint not set" };
        try {
          const res = await fetch(`${endpoint}/neighbor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: "wizard-check", skill: "site-intro" }),
          });
          const d = await res.json();
          return d?.ok
            ? { ok: true, detail: "knock answered (site-intro reply received)" }
            : { ok: false, detail: "door responded without ok — redeploy" };
        } catch {
          return { ok: false, detail: "knock failed — endpoint unreachable" };
        }
      };
      defs.push(
        {
          key: "nbenable",
          label: "Neighbors activated",
          run: async () => ({
            ok: !!settings.neighborsEnabled,
            detail: settings.neighborsEnabled ? "active" : "toggle it on (slide 1)",
          }),
        },
        {
          key: "nbprofile",
          label: "Public profile complete (tags + capabilities)",
          run: async () => {
            const t = (settings.neighborTags || "").split(",").filter((s) => s.trim()).length;
            const c = (settings.neighborCapabilities || "").split(",").filter((s) => s.trim()).length;
            return {
              ok: t > 0 && c > 0,
              detail: `${t} tag(s), ${c} capabilit${c === 1 ? "y" : "ies"} — fill them on slide 2`,
            };
          },
        },
        {
          key: "nbaccount",
          label: "NEAR account set",
          run: async () => ({
            ok: /^[a-z0-9._-]+\.(testnet|near|betanet)$/i.test((settings.nearAccountId || "").trim()),
            detail: settings.nearAccountId || "empty — the account that signs your registration (slide 3)",
          }),
        },
        {
          key: "nbcard",
          label: "Neighbor card served (live GET /neighbor)",
          run: neighborCardCheck,
        },
        {
          key: "nbonchain",
          label: "Registry entry found onchain (live NEAR RPC)",
          run: onchainCheck,
        },
        {
          key: "nbknock",
          label: "Self-knock round-trip (live POST /neighbor)",
          run: knockCheck,
        },
      );
    } else {
      defs.push(
        {
          key: "mirror",
          label: "MCP Cloud Mirror configured",
          run: async () => ({
            ok: !!settings.mcpCloudUrl,
            detail: settings.mcpCloudUrl || "missing — set it in MB App Settings",
          }),
        },
        {
          key: "kb1",
          label: "Project KB — Supabase #1 (live ping)",
          run: () => supabasePing(settings.mbSupabaseUrl, settings.mbSupabaseServiceKey),
        },
        {
          key: "kb2",
          label: "Chat History DB — Supabase #2 (live ping)",
          run: () => supabasePing(settings.supabaseUrl, settings.supabaseServiceKey),
        },
        {
          key: "cf",
          label: "Cloudflare credentials (Account ID + API token)",
          run: async () => ({
            ok: !!(settings.cloudflareAccountId && settings.cfApiToken),
            detail:
              settings.cloudflareAccountId && settings.cfApiToken
                ? "set (masked)"
                : "Account ID or API token missing",
          }),
        },
        {
          key: "kbfolder",
          label: "Knowledge Base packing (folder + files)",
          run: async () => {
            const found = EXPECTED_KB_FILES.filter((f) => kbFoundFiles.has(f));
            return {
              ok: !!settings.kbFolder && found.length > 0,
              detail: settings.kbFolder
                ? `${found.length}/${EXPECTED_KB_FILES.length} expected files found in folder`
                : "no folder selected (Cloudflare Worker Model slide)",
            };
          },
        },
        {
          key: "deployed",
          label: "Worker deployed (live Cloudflare proof)",
          run: async () => {
            if (settings.deployStatus === "deployed" && settings.lastDeployedAt) {
              return {
                ok: true,
                detail: `deployed ${new Date(settings.lastDeployedAt).toLocaleString()}`,
              };
            }
            const d = await callHealthAction();
            let ts = d?.cloudflareLastModified || null;
            if (!ts) ts = await cfLastModifiedFallback();
            if (ts) {
              // Live CF proof — persist that the Agent IS deployed and the
              // checkup detected it (stored in the shared config).
              applyAndSave({
                deployStatus: "deployed",
                lastCfDeployedAt: ts,
                ...(settings.lastDeployedAt
                  ? {}
                  : { lastDeployedAt: new Date().toISOString() }),
              });
              return {
                ok: true,
                detail: `live on Cloudflare (updated ${new Date(ts).toLocaleString()}) — deployment recorded in config`,
              };
            }
            return {
              ok: false,
              detail: "no live worker found on Cloudflare — run Deploy",
            };
          },
        },
      );
    }

    setFinishChecks(
      defs.map((d) => ({ key: d.key, label: d.label, status: "pending" as const, detail: "" })),
    );
    setFinishRunning(true);
    let checkupFails = 0;
    for (let i = 0; i < defs.length; i++) {
      setFinishChecks((prev) =>
        prev.map((c, idx) => (idx === i ? { ...c, status: "running" } : c)),
      );
      const [result] = await Promise.all([
        defs[i].run(),
        new Promise((res) => setTimeout(res, 250)), // pacing so the sequence is visible
      ]);
      if (!result.ok) checkupFails++;
      setFinishChecks((prev) =>
        prev.map((c, idx) =>
          idx === i
            ? { ...c, status: result.ok ? "ok" : "fail", detail: result.detail }
            : c,
        ),
      );
    }
    setFinishRunning(false);
    // Persist the checkup itself: when it ran and what it found, so the
    // config records that the Agent was verified (and by the deployed check,
    // that it IS deployed).
    applyAndSave({
      lastCheckupAt: new Date().toISOString(),
      lastCheckupIssues: checkupFails,
    });
  };

  // Trigger: entering a node's final (Finish & Verify) slide runs its checks;
  // navigating away resets them so re-entering re-runs fresh.
  useEffect(() => {
    if (!openNode) return;
    const lastIdx = slidesFor(openNode).length - 1;
    if (slide === lastIdx) {
      if (!finishRan && !finishRunning && finishChecks.length === 0) {
        setFinishRan(true);
        runFinishChecks(openNode);
      }
    } else if (finishRan || finishChecks.length > 0) {
      setFinishRan(false);
      setFinishChecks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, openNode]);

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
    // Classic behavior: new skills start collapsed
    setCollapsedSkillIds((prev) => new Set([...prev, skillId]));
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

  // ── Skills editor: expand/collapse + drag-to-reorder — the classic
  //    Settings screen's design, ported (arrows kept as secondary control). ──
  const [collapsedSkillIds, setCollapsedSkillIds] = useState<Set<string>>(
    new Set(),
  );
  const toggleSkillCollapse = (id: string) => {
    setCollapsedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Drag-to-reorder (ref-based — only reorder on drop, not during drag)
  const dragFromRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);
  const handleSkillDragStart = (index: number) => {
    dragFromRef.current = index;
    dragOverRef.current = null;
  };
  const handleSkillDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragFromRef.current === null || dragFromRef.current === index) return;
    dragOverRef.current = index;
  };
  const handleSkillDragEnd = () => {
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
          // Redeploy indicator baseline: what was just pushed to the worker
          lastDeployFingerprint: deployFingerprint(
            merged as unknown as Record<string, unknown>,
          ),
          lastDeployVersion: inventionVersionRef.current || "",
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
    setFinishChecks([]);
    setFinishRan(false);
    setFinishSaved(false);
    setWorkerNameUnlocked(false);
  };
  const closeNodeModal = () => {
    flushSave();
    setOpenNode(null);
    setSlide(0);
    setFinishChecks([]);
    setFinishRan(false);
    setFinishSaved(false);
    setWorkerNameUnlocked(false);
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
    mcpserver:
      identityReady && !!settings.agentUrl, // requires Identity + Website endpoint
    telegram:
      identityReady && !!settings.agentUrl, // requires Identity + Website endpoint
    jwtauth:
      identityReady && !!settings.agentUrl, // requires Identity + Website endpoint
    license:
      identityReady && !!settings.agentUrl, // requires Identity + Website endpoint
    neighbors:
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
    // Perfect-circle layout — Identity at center, seven satellites placed on a
    // TRUE circle (radius 280, 360/7 ≈ 51.43° apart), each sitting ON the dashed
    // orbit ring. No connector arrows — the circle behind the nodes is the link.
    const NODE = { cx: 450, cy: 380, w: 260, h: 180, c: 24 };
    const ORBIT = { r: 280 };
    const WEBSITE = { x: 450, y: 100, w: 250, h: 120, c: 18 }; // top
    const MIRROR = { x: 669, y: 205, w: 250, h: 120, c: 18 }; // top-right
    const TELEGRAM = { x: 723, y: 442, w: 250, h: 120, c: 18 }; // right
    const LICENSE = { x: 571, y: 632, w: 250, h: 120, c: 18 }; // bottom-right
    const JWTAUTH = { x: 329, y: 632, w: 250, h: 120, c: 18 }; // bottom-left
    const NEIGHBORS = { x: 177, y: 442, w: 250, h: 120, c: 18 }; // left
    const MCPSRV = { x: 231, y: 205, w: 250, h: 120, c: 18 }; // top-left
    const websiteDone = !!settings.agentUrl;
    const websiteHovered = hoverNode === "Deploy to Website";
    const websiteActive = websiteHovered || websiteDone;
    const mirrorLocked = !nodeUnlocked.cloudmirror;
    const mirrorDeployed =
      settings.deployStatus === "deployed" || !!settings.lastDeployedAt;
    const mirrorHovered = hoverNode === "Agent Cloud Mirror";
    const mirrorActive = !mirrorLocked && (mirrorHovered || mirrorDeployed);
    const mcpLocked = !nodeUnlocked.mcpserver;
    const mcpConfigured = !!(settings.mcpBaseUrl && settings.mcpApiKey);
    const mcpHovered = hoverNode === "MCP Server";
    const mcpActive = !mcpLocked && (mcpHovered || mcpConfigured);
    const tgLocked = !nodeUnlocked.telegram;
    const tgConfigured = !!settings.telegramBotToken;
    const tgHovered = hoverNode === "Telegram";
    const tgActive = !tgLocked && (tgHovered || tgConfigured);
    const jwtLocked = !nodeUnlocked.jwtauth;
    const jwtConfigured = !!settings.jwtSecret;
    const jwtHovered = hoverNode === "JWT Auth";
    const jwtActive = !jwtLocked && (jwtHovered || jwtConfigured);
    const licLocked = !nodeUnlocked.license;
    const licConfigured = !!settings.encoreApiUrl;
    const licHovered = hoverNode === "License Keys";
    const licActive = !licLocked && (licHovered || licConfigured);
    const nbLocked = !nodeUnlocked.neighbors;
    const nbConfigured = !!settings.nearAccountId;
    const nbHovered = hoverNode === "NEAR Neighbors";
    const nbActive = !nbLocked && (nbHovered || nbConfigured);

    const renderOctNode = (opts: {
      x: number;
      y: number;
      w: number;
      h: number;
      c: number;
      icon: "bot" | "globe" | "cloud" | "server" | "telegram" | "key" | "award" | "network";
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
              style={{ color: strokeColor }}
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
        viewBox="0 0 900 760"
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
        </defs>

        {/* Decorative orbit — a large dashed ellipse wrapping the whole
            constellation (the visual link between identity and satellites) */}
        <circle
          cx={NODE.cx}
          cy={NODE.cy}
          r={ORBIT.r}
          fill="none"
          stroke={GREY}
          strokeWidth={1}
          strokeDasharray="4 7"
          opacity={0.35}
        />
        {[270, 321.43, 12.86, 64.29, 115.71, 167.14, 218.57].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={NODE.cx + ORBIT.r * Math.cos(rad)}
              cy={NODE.cy + ORBIT.r * Math.sin(rad)}
              r={4}
              fill={GREY}
              opacity={0.4}
            />
          );
        })}

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

        {/* Left — MCP Server (dimmed + locked until Identity AND the website
            endpoint are set; optional website-tools connection) */}
        {renderOctNode({
          x: MCPSRV.x,
          y: MCPSRV.y,
          w: MCPSRV.w,
          h: MCPSRV.h,
          c: MCPSRV.c,
          icon: "server",
          iconSize: 22,
          title: "MCP Server",
          titleSize: 13,
          titleY: -22,
          sub: mcpLocked
            ? "🔒 Finish Deploy to Website"
            : mcpConfigured
              ? "✓ Website tools"
              : "Optional — website tools",
          subY: 2,
          subSize: 10,
          pill: mcpLocked
            ? undefined
            : {
                text: mcpConfigured ? "✓ Connected" : "Optional",
                done: mcpConfigured,
              },
          pillY: 30,
          active: mcpActive,
          hovered: !mcpLocked && mcpHovered,
          locked: mcpLocked,
          lockHint:
            'Locked — complete "Agent Identity" and set your A2A endpoint in "Deploy to Website" first',
          onClick: () => openNodeModal("mcpserver"),
        })}

        {/* Bottom — Telegram (dimmed + locked until Identity AND the website
            endpoint are set; optional Telegram bot channel) */}
        {renderOctNode({
          x: TELEGRAM.x,
          y: TELEGRAM.y,
          w: TELEGRAM.w,
          h: TELEGRAM.h,
          c: TELEGRAM.c,
          icon: "telegram",
          iconSize: 22,
          title: "Telegram",
          titleSize: 13,
          titleY: -14,
          sub: tgLocked
            ? "🔒 Finish Deploy to Website"
            : tgConfigured
              ? "✓ Bot connected"
              : "Optional — bot channel",
          subY: 14,
          subSize: 10,
          pill: tgLocked
            ? undefined
            : {
                text: tgConfigured ? "✓ Live" : "Optional",
                done: tgConfigured,
              },
          pillY: 38,
          active: tgActive,
          hovered: !tgLocked && tgHovered,
          locked: tgLocked,
          lockHint:
            'Locked — complete "Agent Identity" and set your A2A endpoint in "Deploy to Website" first',
          onClick: () => openNodeModal("telegram"),
        })}

        {/* Bottom — License Keys (optional: license-key resolution for
            products with in-app support) */}
        {renderOctNode({
          x: LICENSE.x,
          y: LICENSE.y,
          w: LICENSE.w,
          h: LICENSE.h,
          c: LICENSE.c,
          icon: "award",
          iconSize: 22,
          title: "License Keys",
          titleSize: 13,
          titleY: -14,
          sub: licLocked
            ? "🔒 Finish Deploy to Website"
            : licConfigured
              ? "✓ Resolving keys"
              : "Optional — product sites",
          subY: 14,
          subSize: 10,
          pill: licLocked
            ? undefined
            : {
                text: licConfigured ? "✓ Configured" : "Optional",
                done: licConfigured,
              },
          pillY: 38,
          active: licActive,
          hovered: !licLocked && licHovered,
          locked: licLocked,
          lockHint:
            'Locked — complete "Agent Identity" and set your A2A endpoint in "Deploy to Website" first',
          onClick: () => openNodeModal("license"),
        })}

        {/* Bottom-left — JWT Auth (optional: session-token verification for
            websites with a log-in system) */}
        {renderOctNode({
          x: JWTAUTH.x,
          y: JWTAUTH.y,
          w: JWTAUTH.w,
          h: JWTAUTH.h,
          c: JWTAUTH.c,
          icon: "key",
          iconSize: 22,
          title: "JWT Auth",
          titleSize: 13,
          titleY: -14,
          sub: jwtLocked
            ? "🔒 Finish Deploy to Website"
            : jwtConfigured
              ? "✓ Verifying sessions"
              : "Optional — login sites",
          subY: 14,
          subSize: 10,
          pill: jwtLocked
            ? undefined
            : {
                text: jwtConfigured ? "✓ Configured" : "Optional",
                done: jwtConfigured,
              },
          pillY: 38,
          active: jwtActive,
          hovered: !jwtLocked && jwtHovered,
          locked: jwtLocked,
          lockHint:
            'Locked — complete "Agent Identity" and set your A2A endpoint in "Deploy to Website" first',
          onClick: () => openNodeModal("jwtauth"),
        })}

        {/* Left — NEAR Neighbors (optional: join the onchain agent network —
            agents discover and knock on each other via the public registry) */}
        {renderOctNode({
          x: NEIGHBORS.x,
          y: NEIGHBORS.y,
          w: NEIGHBORS.w,
          h: NEIGHBORS.h,
          c: NEIGHBORS.c,
          icon: "network",
          iconSize: 22,
          title: "NEAR Neighbors",
          titleSize: 13,
          titleY: -14,
          sub: nbLocked
            ? "🔒 Finish Deploy to Website"
            : nbConfigured
              ? "✓ Onchain registry"
              : "Optional — agent network",
          subY: 14,
          subSize: 10,
          pill: nbLocked
            ? undefined
            : {
                text: nbConfigured ? "✓ Onchain" : "Optional",
                done: nbConfigured,
              },
          pillY: 38,
          active: nbActive,
          hovered: !nbLocked && nbHovered,
          locked: nbLocked,
          lockHint:
            'Locked — complete "Agent Identity" and set your A2A endpoint in "Deploy to Website" first',
          onClick: () => openNodeModal("neighbors"),
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
    node: NodeId;
    serverSettings: Record<string, unknown> | null;
  }) => {
    const { recipe, slides, slideIndex, node, serverSettings } = opts;
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
    // Per-slide editable fields (phase 1: Agent Identity) + live option lists
    // so the model can only ever suggest valid values for THIS slide.
    const editableFields = editableFieldsFor(node, current?.title || "");
    const slideContextLines: string[] = [];
    if (node === "identity") {
      if (current?.title === "Choose the Bot User") {
        slideContextLines.push(
          "Agent users in this project (id — name):",
          ...(projectUsers.length > 0
            ? projectUsers.map((u) => `- ${u.id} — ${u.name || u.email}`)
            : ["- (none found — the user may need to create one: Project → Users → add AI Agent)"]),
        );
      }
      if (current?.title === "AI Model") {
        slideContextLines.push(
          "Valid aiModel values:",
          "- default (MB Active LLM)",
          ...availableModels.map((m) => `- ${m.model} (${m.label})`),
        );
      }
      if (current?.title === "Vectorization") {
        slideContextLines.push(
          "Valid embeddingProvider values: voyage-ai, openai",
          "Common models: voyage-4-large (1024 dims), text-embedding-3-small (1536 dims)",
        );
      }
      if (current?.title === "Project Access") {
        slideContextLines.push(
          "Available projects (id — name):",
          ...projects.map((p) => `- ${p.id} — ${p.name || p.projectName || "(unnamed)"}`),
        );
      }
    }
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
      node === "website"
        ? "WEBSITE STATUS:"
        : node === "mcpserver"
          ? "MCP SERVER STATUS:"
          : node === "telegram"
            ? "TELEGRAM STATUS:"
            : node === "jwtauth"
              ? "JWT AUTH STATUS:"
              : node === "license"
                ? "LICENSE KEYS STATUS:"
                : node === "neighbors"
                  ? "NEIGHBORS STATUS:"
                  : "IDENTITY CHECKLIST:",
      node === "website"
        ? [
            `- A2A endpoint: ${g("agentUrl")}`,
            `- Endpoint health check: ${
              settings.lastEndpointPingOk
                ? "passed"
                : settings.lastEndpointPingAt
                  ? "failed"
                  : "not run yet"
            }`,
            `- Widget bundle: ${widgetBuildUrl ? "downloaded" : "not downloaded yet"}`,
          ].join("\n")
        : node === "mcpserver"
          ? [
              `- MCP Server URL: ${g("mcpBaseUrl")}`,
              `- MCP API key: ${maskSecret(cfg.mcpApiKey ?? settings.mcpApiKey)}`,
              `- Website URL: ${g("websiteUrl")}`,
              `- A2A endpoint: ${g("agentUrl")}`,
            ].join("\n")
          : node === "telegram"
            ? [
                `- Bot token: ${maskSecret(settings.telegramBotToken)}`,
                `- Webhook URL: ${settings.agentUrl ? `${settings.agentUrl.replace(/\/+$/, "")}/webhook/telegram` : "(no A2A endpoint)"}`,
                `- A2A endpoint: ${g("agentUrl")}`,
              ].join("\n")
            : node === "jwtauth"
              ? [
                  `- JWT secret: ${maskSecret(settings.jwtSecret)}`,
                  `- Mode: ${settings.jwtSecret ? "verifying sessions (fail-open for valid tokens)" : "fail-closed (JWT requests get 503)"}`,
                  `- A2A endpoint: ${g("agentUrl")}`,
                ].join("\n")
              : node === "license"
                ? [
                    `- Encore API URL: ${g("encoreApiUrl")}`,
                    `- Encore API key: ${maskSecret(settings.encoreApiKey)}`,
                    `- Fallback when unset: license:{key}`,
                  ].join("\n")
                : node === "neighbors"
                  ? [
                      `- Neighbors: ${settings.neighborsEnabled ? "activated" : "not activated"}`,
                      `- NEAR account: ${g("nearAccountId") || "(not set — slide 3)"}`,
                      `- Registry: neighborly.testnet (NEAR testnet — protocol over platform)`,
                      `- Tags: ${g("neighborTags") || "(empty)"}`,
                      `- Capabilities: ${g("neighborCapabilities") || "(empty)"}`,
                      `- Public door: ${settings.agentUrl ? `${settings.agentUrl.replace(/\/+$/, "")}/neighbor` : "(no A2A endpoint)"}`,
                    ].join("\n")
                  : checklist,
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
      `- A2A Endpoint: ${g("agentUrl")}`,
      `- MCP Server (website tools): ${g("mcpBaseUrl")}`,
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
      "- FIELD EDITING: you may pre-fill fields, but ONLY the ones listed in FIELD EDITING (current slide) below — one slide at a time. When you propose a concrete value, ALSO emit a line exactly like [[SET:field=value]] on its own line. The wizard turns those tags into one-click Apply buttons; tags are stripped from what the user reads. Follow each field's Value guidance exactly (selects must use a listed option ID).",
      "- For adding a whole skill on the Agent Skills slide, use [[ADD_SKILL:{\"name\":…,\"description\":…,\"tags\":[…],\"examples\":[…]}]] instead of SET.",
      "- NEVER suggest edits to fields not listed for the current slide, never suggest secrets/tokens/keys (guide the user to the Fetch/Rotate buttons instead), and never suggest changing the Agent Name (it mirrors the Sub-Agent from the Users screen).",
      "- Keep the visible sentence natural; the tags are stripped from what the user reads.",
      "- Never output secrets or tokens, never invent API keys.",
      "",
      "FIELD EDITING (current slide only):",
      ...(editableFields.length > 0
        ? editableFields.map(
            (d) =>
              `- ${d.field} (${d.label}${d.kind && d.kind !== "text" ? `, type: ${d.kind}` : ""}) — current: ${
                d.kind === "botuser"
                  ? settings.botUserId || "(none)"
                  : d.kind === "addSkill"
                    ? "appends a new skill"
                    : g(d.field)
              }${d.promptHint ? ` — Value: ${d.promptHint}` : ""}`,
          )
        : [
            "- (none on this slide — answer questions only; do not emit SET/ADD_SKILL tags)",
          ]),
      ...(slideContextLines || []),
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
      // The assistant must describe whichever node modal is open — not always Identity.
      const slides = slidesFor(openNode ?? "identity");
      const idx = Math.min(slide, slides.length - 1);
      const serverSettings = await fetchProjectConfigSnapshot();
      const messagesPayload = [
        {
          role: "system",
          content: buildSystemPrompt({
            recipe,
            slides,
            slideIndex: idx,
            node: openNode ?? "identity",
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
    // One slide at a time: the field must be editable on the CURRENT slide.
    const defs = openNode
      ? editableFieldsFor(openNode, slidesFor(openNode)[Math.min(slide, slidesFor(openNode).length - 1)]?.title || "")
      : [];
    const def = defs.find((d) => d.field === s.field);
    if (!def) return;

    switch (def.kind) {
      case "botuser": {
        if (projectUsers.some((u) => u.id === s.value)) handleBotUserSelect(s.value);
        break;
      }
      case "number": {
        const n = parseFloat(s.value);
        if (!Number.isNaN(n)) updateField(def.field, n);
        break;
      }
      case "array": {
        updateField(
          def.field,
          s.value.split(",").map((v) => v.trim()).filter(Boolean),
        );
        break;
      }
      case "addSkill": {
        try {
          const parsed = JSON.parse(s.value) as {
            name?: string;
            description?: string;
            tags?: string[];
            examples?: string[];
          };
          if (!parsed.name) break;
          const newSkill: Skill = {
            id: `skill-${Date.now()}`,
            name: parsed.name,
            description: parsed.description || "",
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            examples: Array.isArray(parsed.examples) ? parsed.examples : [],
            inputModes: ["text/plain"],
            outputModes: ["text/plain"],
          };
          updateField("skills", [
            ...((settings.skills as Skill[]) || []),
            newSkill,
          ]);
        } catch {
          // malformed — ignore
        }
        break;
      }
      default:
        updateField(def.field, s.value);
    }
    const key = `${msgIndex}:${s.field}`;
    setAppliedSuggestions((prev) => new Set([...prev, key]));
  };

  // Auto-scroll the thread to the latest message.
  useEffect(() => {
    const el = chatThreadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, chatSending, assistantOpen]);

  // Auto-grow the chat composer: height follows content up to 30% of the
  // window, then switches to vertical scrolling inside the textarea.
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    const maxH = Math.round(window.innerHeight * 0.3);
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, maxH) + "px";
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  }, [chatInput, assistantOpen]);

  // ── Keyboard: ←/→ navigate slides while a node modal is open. Ignored while
  //    typing (inputs/textareas/selects keep their caret behavior), and the
  //    right arrow never advances past the final slide — closing the modal
  //    stays a deliberate click on Save & Close. ──
  useEffect(() => {
    if (!openNode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      )
        return;
      const len = slidesFor(openNode).length;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        flushSave();
        setSlide((s) => Math.max(0, s - 1));
      } else if (slide < len - 1) {
        e.preventDefault();
        flushSave();
        setSlide((s) => s + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNode, slide]);

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
      {/* Markdown tables in this panel get their own horizontal scroll and
          never force-wrap cell text (the panel is narrow — without this,
          cells scrunch into vertically stacked text). */}
      <style>{`.a2a-chat-md table{display:block;max-width:100%;overflow-x:auto;white-space:nowrap}.a2a-chat-md th,.a2a-chat-md td{white-space:nowrap}`}</style>
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
          // One slide at a time: only the CURRENT slide's editable fields get
          // Apply buttons (older messages' suggestions for other slides hide).
          const currentDefs = openNode
            ? editableFieldsFor(
                openNode,
                slidesFor(openNode)[
                  Math.min(slide, slidesFor(openNode).length - 1)
                ]?.title || "",
              )
            : [];
          const suggestions =
            m.role === "assistant"
              ? parseSuggestions(m.content).filter((s) =>
                  currentDefs.some((d) => d.field === s.field),
                )
              : [];
          const body = m.role === "assistant" ? stripSuggestions(m.content) : m.content;
          return (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex flex-col gap-2"}>
              <div
                className={
                  m.role === "user"
                    ? `max-w-[85%] rounded-lg px-3 py-2 text-[11px] font-mono ${isLightMode ? "bg-emerald-100 text-gray-900" : "bg-[#39ff14]/10 text-gray-100"}`
                    : `a2a-chat-md rounded-lg px-3 py-2 text-[11px] font-mono leading-relaxed ${isLightMode ? "bg-white border border-gray-200 text-gray-700" : "bg-[#0d0d14] border border-[#1e1e2d] text-gray-300"}`
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
                    const def = currentDefs.find((d) => d.field === s.field);
                    const label = def?.label || s.field;
                    // Friendly value display: bot user → name, addSkill → skill name
                    let display = s.value;
                    if (def?.kind === "botuser") {
                      display =
                        projectUsers.find((u) => u.id === s.value)?.name ||
                        projectUsers.find((u) => u.id === s.value)?.email ||
                        s.value;
                    } else if (def?.kind === "addSkill") {
                      try {
                        display = (JSON.parse(s.value) as { name?: string }).name || s.value;
                      } catch {
                        /* keep raw */
                      }
                    }
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
                        title={`Sets ${label} on this slide's shared settings`}
                      >
                        {applied ? (
                          <>
                            <Check size={10} /> Applied
                          </>
                        ) : (
                          <>
                            <Wand2 size={10} /> Apply {label}: {" "}
                            {display.length > 24 ? display.slice(0, 24) + "…" : display}
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
            ref={chatInputRef}
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
        desc: "The bot user IS your agent's identity — its name, bio, and access token flow into every field below. Stored in the shared invention config.",
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
                token auto-populate the next steps automatically.
                No agent users yet? Create one in Mother Brain under Project → Users.
              </p>
            </div>
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
        desc: "How long and how creative your agent's replies are.",
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
        desc: "Embeddings for the agent's Chat DB — every visitor message is vectorized for eternal conversation recall (Total Recall). Same storage as the invention's shared config.",
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
        desc: "What your agent can do — published in the Agent Card.",
        body: (() => {
          const skillsArr = (settings.skills as Skill[]) || [];
          return (
            <div className="space-y-3">
              {skillsArr.map((skill, i) => {
                const collapsed = collapsedSkillIds.has(skill.id);
                return (
                  <div
                    key={skill.id}
                    className={`border transition-shadow ${isLightMode ? "bg-white border-gray-200 hover:shadow-md" : "bg-[#13131f] border-[#1e1e2d] hover:border-[#39ff14]/30"} ${collapsed ? "" : "p-3 space-y-2"}`}
                  >
                    {/* Header row: click to expand/collapse, drag to reorder */}
                    <div
                      className={`flex items-center justify-between cursor-pointer select-none ${collapsed ? "p-3" : ""}`}
                      onClick={() => toggleSkillCollapse(skill.id)}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        handleSkillDragStart(i);
                      }}
                      onDragOver={(e) => handleSkillDragOver(e, i)}
                      onDragEnd={handleSkillDragEnd}
                      title="Click to expand/collapse — drag to reorder"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-gray-600 shrink-0">
                          {collapsed ? "▶" : "▼"}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 border shrink-0 ${isLightMode ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-[#39ff14]/80 border-[#39ff14]/20 bg-[#39ff14]/5"}`}
                        >
                          {skill.id}
                        </span>
                        <span
                          className={`text-[11px] font-mono font-semibold truncate ${isLightMode ? "text-gray-900" : "text-white"}`}
                        >
                          {skill.name}
                        </span>
                        {collapsed && (
                          <span
                            className={`text-[10px] font-mono truncate ${isLightMode ? "text-gray-400" : "text-gray-500"}`}
                          >
                            {skill.description.slice(0, 50)}
                            {skill.description.length > 50 ? "…" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-a2a-nav
                          className={btnCls}
                          disabled={i === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSkill(i, -1);
                          }}
                          title="Move up"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button
                          type="button"
                          data-a2a-nav
                          className={btnCls}
                          disabled={i === skillsArr.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveSkill(i, 1);
                          }}
                          title="Move down"
                        >
                          <ArrowDown size={10} />
                        </button>
                        <button
                          type="button"
                          data-a2a-nav
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
                    </div>

                    {/* Editable fields — hidden when collapsed (classic design) */}
                    {!collapsed && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}>
                              ID
                            </label>
                            <input
                              type="text"
                              className={inputCls + " text-[11px] py-1"}
                              value={skill.id}
                              onChange={(e) => updateSkill(i, "id", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}>
                              Name
                            </label>
                            <input
                              type="text"
                              className={inputCls + " text-[11px] py-1"}
                              value={skill.name}
                              onChange={(e) => updateSkill(i, "name", e.target.value)}
                            />
                          </div>
                        </div>
                        <div>
                          <label className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}>
                            Description
                          </label>
                          <input
                            type="text"
                            className={inputCls + " text-[11px] py-1"}
                            value={skill.description}
                            onChange={(e) => updateSkill(i, "description", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}>
                            Tags (comma-separated)
                          </label>
                          <input
                            type="text"
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
                          <label className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}>
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
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}>
                              Input Modes (comma-separated)
                            </label>
                            <input
                              type="text"
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
                            <label className={`text-[9px] font-mono ${isLightMode ? "text-gray-500" : "text-gray-600"}`}>
                              Output Modes (comma-separated)
                            </label>
                            <input
                              type="text"
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
                );
              })}
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
                Deployed as AGENT_SKILLS_JSON.
              </p>
            </div>
          );
        })(),
      },
      {
        title: "Project Access",
        desc: "Which Mother Brain projects your agent can read.",
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
              <div className="space-y-1.5 mt-1">
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
        desc: "Make the chat feel native to your site.",
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
        desc: "Two actions: download the React/TypeScript widget bundle, then copy the embedding code + prompt instructions for your website's coding AI.",
        body: (
          <div className="space-y-3">
            <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
              The bundle includes Hero Search (octagonal SVG), the fullscreen chat
              overlay, markdown rendering, and your styling. Button 2 copies the
              embedding snippet plus the coding-agent prompt — hand both to your
              website's coding AI (Cursor, Zed, Claude Code…) and it will
              establish the A2A endpoint and wire the chat into your codebase.
            </p>
            <p className={`text-[10px] font-mono ${settings.agentUrl ? textMuted : "text-yellow-400"}`}>
              Embedding endpoint: {endpoint}
              {!settings.agentUrl && " — not set; set the A2A endpoint on slide 1 first"}
            </p>
            <div className="flex flex-col items-start gap-2">
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
                      <Loader2 size={14} className="animate-spin" /> 1. Building…
                    </>
                  ) : (
                    <>
                      <Code2 size={14} /> 1. Build and Download Widget
                    </>
                  )}
                </button>
                {widgetBuildUrl && (
                  <span className={`text-[11px] font-mono ${textAccent}`}>
                    ✓ motherbrain-widget.zip downloaded
                  </span>
                )}
              </div>
              <button
                type="button"
                data-a2a-nav
                className={primaryBtnCls + " flex items-center gap-2"}
                onClick={() => {
                  navigator.clipboard.writeText(
                    // The React snippet goes out fenced (```jsx) so coding AIs
                    // parse it as code, never as loose markdown text.
                    "```jsx\n" + snippetHtml + "\n```\n\n" + aiAgentPrompt,
                  );
                  setCopiedPrompt(true);
                  setTimeout(() => setCopiedPrompt(false), 2000);
                }}
              >
                {copiedPrompt ? (
                  <><Check size={14} /> 2. Copied!</>
                ) : (
                  <><Copy size={14} /> 2. Copy Embedding Code &amp; Prompt Instructions</>
                )}
              </button>
            </div>
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
            what makes the mirror reachable. Stored in the shared invention config —
            always in sync.
          </p>
        </div>
      ),
    },
    {
      title: "Cloudflare MCP Mirror",
      desc: "The cloud copy of the MCP Gateway — configured in Mother Brain App Settings, mirrored here.",
      body: (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>
              MCP Cloud Mirror URL
              <span className={`ml-2 text-[10px] font-normal ${isLightMode ? "text-gray-400" : "text-white/40"}`}>
                managed by MB App Settings
              </span>
            </label>
            <input
              type="text"
              className={`${inputCls} opacity-60 cursor-not-allowed`}
              value={settings.mcpCloudUrl || ""}
              readOnly
              disabled
              placeholder="auto-populated from MB App Settings"
              title="Locked — configured in Mother Brain App Settings; the value flows into the shared config automatically"
            />
            <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
              Auto-populates from Mother Brain App Settings. Deployed as the
              MCP_CLOUD_URL Worker secret — cloud-hosted MCP tools for fallback
              when the local Gateway is unreachable.
            </p>
          </div>
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
              directly to retrieve stored knowledge and still answer. All values
              below come from your project's settings — locked here; "Fetch from
              Project" re-pulls them. Deployed as Worker secrets: MB_SUPABASE_URL,
              MB_SUPABASE_SERVICE_KEY, MB_PROJECT_ID.
            </p>
            <div>
              <label className={labelCls}>
                Project Supabase URL
                <span className={`ml-2 text-[10px] font-normal ${isLightMode ? "text-gray-400" : "text-white/40"}`}>
                  managed by Project Settings
                </span>
              </label>
              <input
                type="text"
                className={`${inputCls} opacity-60 cursor-not-allowed`}
                value={settings.mbSupabaseUrl || ""}
                readOnly
                disabled
                placeholder="auto-populated from Project Settings"
                title="Locked — set it in Mother Brain Project Settings; 'Fetch from Project' re-pulls it here"
              />
            </div>
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
            <div>
              <label className={labelCls}>
                Supabase Access Token
                <span className={`ml-2 text-[10px] font-normal ${isLightMode ? "text-gray-400" : "text-white/40"}`}>
                  managed by Project Settings
                </span>
              </label>
              <input
                type="password"
                className={`${inputCls} opacity-60 cursor-not-allowed`}
                value={settings.mbSupabaseAccessToken || ""}
                readOnly
                disabled
                placeholder="auto-populated from Project Settings"
                title="Locked — set it in Mother Brain Project Settings; 'Fetch from Project' re-pulls it here"
              />
            </div>
            <div>
              <label className={labelCls}>
                Service Role Key
                <span className={`ml-2 text-[10px] font-normal ${isLightMode ? "text-gray-400" : "text-white/40"}`}>
                  managed by Project Settings
                </span>
              </label>
              <input
                type="password"
                className={`${inputCls} opacity-60 cursor-not-allowed`}
                value={settings.mbSupabaseServiceKey || ""}
                readOnly
                disabled
                placeholder="auto-fetched via the Supabase Management API"
                title="Locked — 'Fetch from Project' re-fetches it via the Supabase Management API"
              />
            </div>
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
      desc: "The Workers AI model for offline fallback (or all inference when forced) — plus Knowledge Base packing for the Worker.",
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

          {/* Knowledge Base Packing — ported from the classic Settings screen */}
          <div
            className={`pt-3 border-t space-y-3 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
          >
            <div>
              <label className={labelCls}>Knowledge Base Packing</label>
              <p className={`text-[10px] font-mono ${textMuted} mt-0.5`}>
                These files get baked into the Cloudflare Worker when you deploy
                (stored in the shared invention config).
              </p>
            </div>
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
            </div>
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
                        type="button"
                        data-a2a-nav
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
                <p className={`text-[10px] font-mono ${textMuted} mt-1`}>
                  Green = found &amp; included. Strikethrough = excluded. Gray =
                  not found in folder. Toggle to include/exclude during deploy.
                </p>
              </div>
            )}
            {!settings.kbFolder && (
              <p className={`text-[10px] font-mono ${textMuted}`}>
                Pick a sub-folder to see which files are found — they get baked
                into the Cloudflare Worker on deploy.
              </p>
            )}
          </div>
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
          {(() => {
            const workerDeployed =
              settings.deployStatus === "deployed" ||
              !!settings.lastDeployedAt ||
              !!settings.lastCfDeployedAt;
            // Not deployed yet: editable, auto-fills {agent-name}-a2a while untouched.
            if (!workerDeployed) {
              return renderField({
                label: "Worker Name",
                value: settings.workerName || "",
                onChange: (v) => {
                  // Clearing the field resumes auto-fill; any other edit stops it.
                  workerNameAutoRef.current = v === "";
                  updateField("workerName", v);
                },
                placeholder: "e.g., my-a2a-endpoint",
                hint: "Auto-fills from your Agent Name ({name}-a2a) until you edit it. Becomes https://{name}.{account}.workers.dev.",
              });
            }
            // Deployed + locked: read-only with explicit Unlock.
            if (!workerNameUnlocked) {
              return (
                <div>
                  <label className={labelCls}>
                    Worker Name
                    <span className={`ml-2 text-[10px] font-normal ${isLightMode ? "text-gray-400" : "text-white/40"}`}>
                      🔒 deployed — unlock to rename
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className={`${inputCls} opacity-60 cursor-not-allowed flex-1`}
                      value={settings.workerName || ""}
                      readOnly
                      disabled
                      title="Locked — this Worker is deployed. Unlock to rename (creates a new Worker)."
                    />
                    <button
                      type="button"
                      data-a2a-nav
                      className={btnCls + " flex items-center gap-1 shrink-0"}
                      onClick={() => setWorkerNameUnlocked(true)}
                      title="Unlock to rename the Worker"
                    >
                      <KeyRound size={11} /> Unlock
                    </button>
                  </div>
                </div>
              );
            }
            // Deployed + unlocked: editable with the rename warning.
            return (
              <div>
                <label className={labelCls}>Worker Name</label>
                <input
                  type="text"
                  className={inputCls}
                  value={settings.workerName || ""}
                  onChange={(e) => {
                    workerNameAutoRef.current = false;
                    updateField("workerName", e.target.value);
                  }}
                  placeholder="e.g., my-a2a-endpoint"
                />
                <div
                  className={`flex items-start gap-2 p-2 mt-1.5 border rounded ${isLightMode ? "bg-red-50 border-red-200" : "bg-[#ff3d7f]/5 border-[#ff3d7f]/30"}`}
                >
                  <span className="text-[11px] font-mono mt-0.5 text-[#ff3d7f]">⚠</span>
                  <p className={`text-[10px] font-mono leading-relaxed ${isLightMode ? "text-red-700" : "text-[#ff3d7f]/90"}`}>
                    Renaming CREATES A NEW Cloudflare Worker — the old one keeps
                    running at the old URL until you delete it in the Cloudflare
                    dashboard. Every website using this Agent must be updated:
                    re-copy the Embedding Code (Deploy to Website → Build the
                    Widget — it bakes in the new endpoint), redeploy your site,
                    and update the A2A endpoint on slide 1 of Deploy to Website.
                  </p>
                </div>
              </div>
            );
          })()}
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

          {/* Deployed Worker verification — pings the live Worker and shows
              what actually shipped (identity + MCP config + CF timestamps). */}
          <div
            className={`mt-3 pt-3 border-t space-y-2 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
          >
            <div className="flex items-center gap-2">
              <label className={labelCls + " mb-0!"}>Test Deployed Worker</label>
              <button
                type="button"
                data-a2a-nav
                className={btnCls + " ml-auto flex items-center gap-1"}
                onClick={runWorkerTest}
                disabled={workerTestRunning || !settings.agentUrl}
                title={
                  settings.agentUrl
                    ? "Ping the deployed Worker and verify what actually shipped"
                    : "Set the A2A endpoint first (Deploy to Website, slide 1)"
                }
              >
                {workerTestRunning ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <CheckCircle size={11} />
                )}
                {workerTestRunning ? "Testing…" : "Run Test"}
              </button>
            </div>
            {workerTestDone && workerTestResults && (
              <div className="space-y-1.5">
                {([
                  {
                    ok: workerTestResults.reachable,
                    label: "Endpoint reachable",
                    sub:
                      workerTestResults.reachable === null
                        ? "not checked (health-check action unavailable)"
                        : settings.agentUrl,
                  },
                  {
                    ok: workerTestResults.cardNameMatches,
                    label: "Agent Card name (deployed identity)",
                    sub: workerTestResults.cardName
                      ? workerTestResults.cardNameMatches
                        ? `“${workerTestResults.cardName}” — matches Agent Identity`
                        : `“${workerTestResults.cardName}” — differs from “${settings.agentName || "(unset)"}” (stale deploy?)`
                      : "card unavailable (Worker offline or route missing)",
                  },
                  {
                    ok: workerTestResults.mcpConfigured,
                    label: "MCP tools (runtime)",
                    sub: workerTestResults.gatewayUrl
                      ? `Gateway: ${workerTestResults.gatewayUrl}`
                      : "gateway URL not exposed at /debug/mcp",
                  },
                  {
                    ok: workerTestResults.cfLastModified ? true : null,
                    label: "Cloudflare last deployed",
                    sub: workerTestResults.cfLastModified
                      ? new Date(workerTestResults.cfLastModified).toLocaleString()
                      : "unknown (no CF timestamp returned)",
                  },
                ] as { ok: boolean | null; label: string; sub: string }[]).map(
                  (row) => (
                    <div key={row.label} className="flex items-start gap-2">
                      <span
                        className={`text-[11px] font-mono mt-0.5 ${
                          row.ok === true
                            ? textAccent
                            : row.ok === false
                              ? "text-[#ff3d7f]"
                              : textMuted
                        }`}
                      >
                        {row.ok === true ? "✓" : row.ok === false ? "✗" : "○"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-mono">{row.label}</p>
                        <p className={`text-[10px] font-mono ${textMuted} break-all`}>
                          {row.sub}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
            <p className={`text-[10px] font-mono ${textMuted}`}>
              Pings the deployed Worker: reachability, the live Agent Card vs your
              Agent Identity, and the runtime MCP config — verification only,
              secrets are never read or shown.
            </p>
          </div>
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
    mcpserver: {
      title: "MCP Server",
      blurb: "Optional: website tools (read pages, navigate, accounts).",
      icon: FileJson,
    },
    telegram: {
      title: "Telegram",
      blurb: "Optional: chat with your agent in Telegram.",
      icon: Send,
    },
    jwtauth: {
      title: "JWT Auth",
      blurb: "Optional: verify logged-in website users (session tokens).",
      icon: KeyRound,
    },
    license: {
      title: "License Keys",
      blurb: "Optional: resolve license keys for in-app support.",
      icon: CheckCircle,
    },
    neighbors: {
      title: "NEAR Neighbors",
      blurb: "Optional: join the onchain agent network — agents find and knock on each other.",
      icon: Network,
    },
  };

  // ── MCP Server slides — mirrors the classic Settings "Website MCP
  //    Integration" section (same fields, same storage, same deploy secrets:
  //    MCP_BASE_URL / MCP_API_KEY / WEBSITE_URL). Optional feature — when
  //    unset, the agent silently runs without website tools. ──
  const mcpServerSlides = (): Slide[] => {
    const isConfigured = !!(settings.mcpBaseUrl && settings.mcpApiKey);
    return [
      {
        title: "Connect Your Website's MCP Server",
        desc: "Optional: lets the agent read pages, navigate visitors, and check accounts on your website. When unset, website tools are simply not exposed (graceful degradation).",
        body: (
          <div className="space-y-3">
            <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
              Connects the agent to a website MCP server. Deployed as Worker
              secrets: MCP_BASE_URL, MCP_API_KEY, WEBSITE_URL — same fields as
              the invention's shared config — always in sync.
            </p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConfigured ? "bg-[#39ff14]" : "bg-gray-600"}`} />
              <span className={`text-xs font-mono ${isConfigured ? textAccent : "text-gray-500"}`}>
                {isConfigured ? "Configured" : "Not configured (optional)"}
              </span>
            </div>
            {renderField({
              label: "MCP Server URL",
              value: settings.mcpBaseUrl || "",
              onChange: (v) => updateField("mcpBaseUrl", v),
              placeholder: "https://your-api.com",
              hint: "The website's MCP endpoint the agent calls for website.* tools.",
            })}
            {renderField({
              label: "MCP API Key",
              type: "password",
              fieldId: "mcpApiKey",
              value: settings.mcpApiKey || "",
              onChange: (v) => updateField("mcpApiKey", v),
              placeholder: "mb_mcp_... (distinct from Gateway Token)",
            })}
            {renderField({
              label: "Website URL",
              value: settings.websiteUrl || "",
              onChange: (v) => updateField("websiteUrl", v),
              placeholder: "https://yourwebsite.com",
              hint: "For navigate/highlight links the agent sends visitors to.",
            })}
          </div>
        ),
      },
      {
        title: "Discover Website Tools",
        desc: "Fetch the live tool list from your MCP server (through the deployed agent) — proof the connection works.",
        body: (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className={labelCls + " mb-0!"}>Discovered Website Tools</label>
              <button
                type="button"
                data-a2a-nav
                className={btnCls + " ml-auto flex items-center gap-1 shrink-0"}
                disabled={discovering || !settings.agentUrl}
                onClick={async () => {
                  if (!settings.agentUrl) {
                    setDiscoveredError(
                      "Agent URL not set — configure the endpoint first (Deploy to Website, slide 1)",
                    );
                    return;
                  }
                  setDiscovering(true);
                  setDiscoveredError(null);
                  setDiscoveredTools([]);
                  try {
                    const url =
                      settings.agentUrl.replace(/\/+$/, "") +
                      "/website-mcp/tools";
                    const res = await fetch(url);
                    if (res.ok) {
                      const data = await res.json();
                      const toolList = Array.isArray(data)
                        ? data
                        : data?.tools || [];
                      if (toolList.length > 0) {
                        setDiscoveredTools(toolList);
                      } else {
                        setDiscoveredError(
                          "No tools returned from the MCP server.",
                        );
                      }
                    } else {
                      const errBody = await res.text().catch(() => "");
                      setDiscoveredError(
                        "Server returned " +
                          res.status +
                          (errBody ? ": " + errBody.slice(0, 200) : ""),
                      );
                    }
                  } catch (err) {
                    setDiscoveredError(
                      "Failed to reach endpoint: " +
                        (err instanceof Error ? err.message : "Network error"),
                    );
                  } finally {
                    setDiscovering(false);
                  }
                }}
                title={
                  settings.agentUrl
                    ? "Fetch the available tools from your MCP server"
                    : "Set the A2A endpoint first (Deploy to Website, slide 1)"
                }
              >
                {discovering ? (
                  <>
                    <Loader2 size={11} className="animate-spin" /> Discovering…
                  </>
                ) : (
                  <>
                    <Sparkles size={11} /> Discover Tools
                  </>
                )}
              </button>
            </div>
            {discovering ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={12} className="animate-spin text-[#39ff14]" />
                <span className={`text-[10px] font-mono ${textMuted}`}>
                  Discovering website MCP tools…
                </span>
              </div>
            ) : discoveredError ? (
              <div
                className={`flex items-start gap-2 p-2 rounded text-[10px] font-mono ${
                  isLightMode ? "bg-red-50 text-red-600" : "bg-red-900/20 text-red-400"
                }`}
              >
                <XCircle size={10} className="mt-0.5 shrink-0" />
                <span>{discoveredError}</span>
              </div>
            ) : discoveredTools.length > 0 ? (
              <div>
                <div className={`text-[10px] font-mono mb-1 ${textMuted}`}>
                  {discoveredTools.length} tool
                  {discoveredTools.length !== 1 ? "s" : ""} discovered
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {discoveredTools.map((tool, i) => (
                    <div
                      key={tool.name || i}
                      className={`p-2 border text-xs font-mono ${cardCls}`}
                    >
                      <div className={`font-semibold ${textAccent}`}>
                        {tool.name}
                      </div>
                      {tool.description && (
                        <div className={`mt-0.5 text-[10px] ${textMuted}`}>
                          {tool.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className={`text-[10px] font-mono ${textMuted}`}>
                Click "Discover Tools" to fetch the available tools from your
                MCP server — auto-discovered at runtime by the agent.
              </p>
            )}
          </div>
        ),
      },
    ];
  };

  // ── Telegram slides — mirrors the classic Settings "Telegram Integration"
  //    section (same storage: telegramBotToken; same deploy secret:
  //    TELEGRAM_BOT_TOKEN; same webhook: {agentUrl}/webhook/telegram).
  //    OPTIONAL — empty token = disabled. ──
  const telegramSlides = (): Slide[] => {
    const isConfigured = !!settings.telegramBotToken;
    const webhookUrl = settings.agentUrl
      ? `${settings.agentUrl.replace(/\/+$/, "")}/webhook/telegram`
      : "";
    return [
      {
        title: "Create Your Bot",
        desc: "Get a token from Telegram's BotFather (2 minutes, free) — how Telegram works is explained below.",
        body: (
          <div className="space-y-3">
            <ol className={`text-[11px] font-mono ${textMuted} space-y-1.5`}>
              <li>
                1. Open Telegram and message{" "}
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
              <li>4. Paste it below — then register the webhook (next slide)</li>
            </ol>
            {renderField({
              label: "Telegram Bot Token",
              type: "password",
              fieldId: "telegramBotToken",
              value: settings.telegramBotToken || "",
              onChange: (v) => updateField("telegramBotToken", v),
              placeholder: "123456789:AA…",
              hint: "Stored as the TELEGRAM_BOT_TOKEN Worker secret — never shown in plain text.",
            })}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConfigured ? "bg-[#39ff14]" : "bg-gray-600"}`} />
              <span className={`text-xs font-mono ${isConfigured ? textAccent : "text-gray-500"}`}>
                {isConfigured ? "Configured" : "Not configured (optional)"}
              </span>
            </div>

            {/* How Telegram works — merged below Create Your Bot */}
            <div className={`pt-3 border-t space-y-2 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}>
              <label className={labelCls}>How Telegram Works</label>
              <div className={`p-3 rounded border text-[11px] leading-relaxed font-mono ${cardCls}`}>
                <div>• Your agent appears as a Telegram bot people can DM.</div>
                <div>• Messages hit /webhook/telegram on your deployed agent — full MCP tool access, same knowledge base, same chat database as your website chat.</div>
                <div>• Text messages only (no images/media, for security).</div>
                <div className="mt-1 font-bold">Requirements:</div>
                <div>• A bot token from @BotFather (2 minutes, free).</div>
                <div>• Your A2A endpoint on a public HTTPS domain — Telegram webhooks need it. (A custom domain isn't required to run locally, but it IS required for webhook channels like Telegram.)</div>
              </div>
            </div>
          </div>
        ),
      },
      {
        title: "Test & Register Webhook",
        desc: "Verifies the bot token with Telegram (getMe) and registers your agent's webhook (setWebhook) — the bot goes live.",
        body: (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-a2a-nav
                className={
                  !settings.telegramBotToken || !webhookUrl || webhookStatus.state === "testing" || webhookStatus.state === "registering"
                    ? primaryBtnCls + " opacity-50 cursor-not-allowed"
                    : primaryBtnCls
                }
                disabled={
                  !settings.telegramBotToken ||
                  !webhookUrl ||
                  webhookStatus.state === "testing" ||
                  webhookStatus.state === "registering"
                }
                onClick={async () => {
                  if (!settings.telegramBotToken || !webhookUrl) return;
                  setWebhookStatus({ state: "testing", message: "Verifying bot token..." });
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
                      message: `Bot verified: @${meData.result.username}. Registering webhook...`,
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
                }}
              >
                {webhookStatus.state === "testing" || webhookStatus.state === "registering" ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {webhookStatus.state === "testing" ? "Verifying…" : "Registering…"}
                  </>
                ) : (
                  <>
                    <Send size={12} /> Test & Register Webhook
                  </>
                )}
              </button>
            </div>
            {webhookStatus.state !== "idle" && (
              <div
                className={`p-2 rounded text-[10px] font-mono flex items-start gap-1.5 ${
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
                {webhookStatus.state === "success" && <CheckCircle size={10} className="mt-0.5 shrink-0" />}
                {webhookStatus.state === "error" && <XCircle size={10} className="mt-0.5 shrink-0" />}
                <span>{webhookStatus.message}</span>
              </div>
            )}
            <p className={`text-[10px] font-mono ${textMuted}`}>
              Step 1 verifies the token with Telegram's getMe API; step 2 points
              the bot at your agent's /webhook/telegram endpoint via setWebhook.
              After deploying the token (Agent Cloud Mirror → Deploy), messages
              flow into the same chat database.
            </p>
          </div>
        ),
      },
    ];
  };

  // ── JWT Auth slides — mirrors the classic Settings "Session Token
  //    Verification" section (same storage: jwtSecret; same deploy secret:
  //    JWT_SECRET). OPTIONAL — for websites with a log-in system. ──
  const jwtAuthSlides = (): Slide[] => {
    const isConfigured = !!settings.jwtSecret;
    return [
      {
        title: "Session Token Verification",
        desc: "For websites with a log-in system: verifies JWT session tokens from the chat widget (dual-path auth). Optional — leave empty when your site has no logins.",
        body: (
          <div className="space-y-3">
            <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
              The website chat widget sends JWT session tokens; the agent
              verifies them (HMAC-SHA256) against this shared secret and links
              the chat to the logged-in user's account. When unset,
              JWT-bearing requests are rejected with 503 (fail-closed) —
              license-key and anonymous visitor paths work regardless. Same
              field in the shared invention config; deployed as the
              JWT_SECRET Worker secret.
            </p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConfigured ? "bg-[#39ff14]" : "bg-gray-600"}`} />
              <span className={`text-xs font-mono ${isConfigured ? textAccent : "text-gray-500"}`}>
                {isConfigured ? "Configured" : "Not configured (fail-closed — fine if your site has no logins)"}
              </span>
            </div>
            {renderField({
              label: "JWT Secret (JwtSecret from Encore)",
              type: "password",
              fieldId: "jwtSecret",
              value: settings.jwtSecret || "",
              onChange: (v) => updateField("jwtSecret", v),
              placeholder: "64-char base64url string (leave empty = fail-closed)",
            })}
            <p className={`text-[10px] font-mono ${textMuted}`}>
              Expected token claims: sub = customer/account ID, vid =
              visitor_id. Only set this if your website issues JWT session
              tokens with the same secret.
            </p>
          </div>
        ),
      },
    ];
  };

  // ── License Keys slides — mirrors the classic Settings "License Key
  //    Integration" section (same storage: encoreApiUrl / encoreApiKey; same
  //    deploy secrets: ENCORE_API_URL / ENCORE_API_KEY). OPTIONAL — for
  //    websites that sell products with in-app support. ──
  const licenseSlides = (): Slide[] => {
    const isConfigured = !!settings.encoreApiUrl;
    return [
      {
        title: "License Key Integration",
        desc: "For product websites: resolves license keys to visitor IDs via your Subscriptions API — links in-app support chats with web chat history. Optional.",
        body: (
          <div className="space-y-3">
            <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
              When a visitor enters a license key in the in-app support chat,
              the agent resolves it to a visitor_id via your API — linking
              in-app support conversations with web chat history. When unset,
              license keys fall back to the literal ID license:{"{key}"}. Same
              fields in the shared invention config; deployed as
              ENCORE_API_URL / ENCORE_API_KEY Worker secrets.
            </p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConfigured ? "bg-[#39ff14]" : "bg-gray-600"}`} />
              <span className={`text-xs font-mono ${isConfigured ? textAccent : "text-gray-500"}`}>
                {isConfigured ? "Configured" : "Not configured (optional)"}
              </span>
            </div>
            {renderField({
              label: "Encore API URL",
              value: settings.encoreApiUrl || "",
              onChange: (v) => updateField("encoreApiUrl", v),
              placeholder: "https://your-api.com",
              hint: "Your Subscriptions API — must accept the license lookup your agent performs.",
            })}
            {renderField({
              label: "Encore API Key (optional)",
              type: "password",
              fieldId: "encoreApiKey",
              value: settings.encoreApiKey || "",
              onChange: (v) => updateField("encoreApiKey", v),
              placeholder: "Leave empty if endpoint is public",
            })}
          </div>
        ),
      },
    ];
  };

  // ── NEAR Neighbors slides — the onchain agent network. The agent's
  //    public door (/neighbor) and knock tools ship automatically with every
  //    deployment (v1.2.159+); this node manages the PUBLIC PROFILE and the
  //    onchain REGISTRATION (neighborly registry contract on NEAR testnet).
  //    Deliverables mirror the Widget finale: copyable registration command
  //    + AI-coder prompt for the website's /neighbors page. ──
  const neighborsSlides = (): Slide[] => {
    const isRegistered = !!settings.nearAccountId;

    // Shared args builder (near-wallet.ts) — the CLI command and the
    // wallet-connect tx use the SAME contract schema, never drifting.
    const registerArgs = buildNeighborRegisterArgs(settings);
    const registerJson = JSON.stringify(registerArgs);
    // update() wraps the same fields in { patch: {...} } — the contract
    // signature is update(patch: EntryPatch), all fields optional.
    const updateJson = JSON.stringify({ patch: registerArgs });
    // Shell-safe for copy-paste: a straight apostrophe inside the JSON
    // (e.g. "Pro's") ends the single-quoted argument early — near-cli then
    // fails with "unexpected argument". The '\'' sequence embeds it safely
    // (bash round-trip verified 2026-08-25; the wallet path needs no shell).
    const shellSafe = (s: string) => s.replace(/'/g, "'\\''");
    const registerCmd =
      `near contract call-function as-transaction neighborly.testnet register json-args '${shellSafe(registerJson)}' ` +
      `prepaid-gas '100.0 Tgas' attached-deposit '0.01 NEAR' ` +
      `sign-as ${settings.nearAccountId || "your-account.testnet"} ` +
      `network-config testnet sign-with-keychain send`;

    // Update variant for ALREADY-REGISTERED accounts (register would fail
    // "already registered — use update()"; update is free — no deposit).
    // Shown once nearAccountId is set (polish-queue item, shipped 1.2.168).
    const updateCmd =
      `near contract call-function as-transaction neighborly.testnet update json-args '${shellSafe(updateJson)}' ` +
      `prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' ` +
      `sign-as ${settings.nearAccountId || "your-account.testnet"} ` +
      `network-config testnet sign-with-keychain send`;

    // Deliverable 2: the AI-coder prompt for the website's /neighbors page
    const neighborSitePrompt =
      `Build a public "\/neighbors" page for our website (${settings.websiteUrl || "https://example.com"}) that lists the AI agents in the NEAR Neighbors onchain registry.\n\n` +
      `HOW TO READ THE REGISTRY (free public NEAR RPC — no backend, no API keys):\n` +
      `\`\`\`js\n` +
      `const NEAR_RPC = "https://test.rpc.fastnear.com";      // mainnet later: "https://rpc.fastnear.com"\n` +
      `const NEIGHBORS_CONTRACT = "neighborly.testnet";        // mainnet later: "neighborly.near"\n` +
      `async function fetchNeighbors() {\n` +
      `  const args = btoa(JSON.stringify({ from_index: 0, limit: 100 }));\n` +
      `  const res = await fetch(NEAR_RPC, { method: "POST", headers: { "Content-Type": "application/json" },\n` +
      `    body: JSON.stringify({ jsonrpc: "2.0", id: "neighbors", method: "query",\n` +
      `      params: { request_type: "call_function", finality: "final", account_id: NEIGHBORS_CONTRACT, method_name: "get_agents", args_base64: args } }) });\n` +
      `  const json = await res.json();\n` +
      `  const agents = JSON.parse(new TextDecoder().decode(new Uint8Array(json.result.result)));\n` +
      `  return agents.filter((a) => a.status === 0); // active entries only\n` +
      `}\n` +
      `\`\`\`\n\n` +
      `PAGE DESIGN:\n` +
      `1. Card grid — one per agent: name, description, tags + capabilities as filter chips, website_url as the primary link.\n` +
      `2. Filter bar by tag / capability (client-side; cache the read for 5 minutes — never per-visitor).\n` +
      `3. Freshness — "Registered {date}" from registered_at (nanoseconds: new Date(Number(registered_at) / 1e6)).\n` +
      `4. Short explainer at top: what the Neighbors network is + explorer link (https://testnet.nearblocks.io/address/neighborly.testnet).\n\n` +
      `Full guide: docs/NEIGHBORS-WEBSITE-INTEGRATION.md in the a2a-agent-invention repo.`;

    return [
      {
        title: "The Neighbors Network",
        desc: "Optional: join the public onchain registry where A2A agents find each other. Your agent already has its public door (/neighbor) and knock tools — this activates and registers it.",
        body: (
          <div className="space-y-3">
            <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
              Every deployed agent can discover and "knock" on other agents —
              agent-to-agent conversations over the A2A protocol, no human
              introduction needed. The registry lives ONCHAIN (NEAR): no
              platform owns it, anyone can read it for free, and your entry is
              provably yours. Currently on NEAR testnet (mainnet at
              graduation — nothing changes for you).
            </p>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${settings.neighborsEnabled ? "bg-[#39ff14]" : "bg-gray-600"}`} />
              <span className={`text-xs font-mono ${settings.neighborsEnabled ? textAccent : "text-gray-500"}`}>
                {settings.neighborsEnabled ? "Neighbors active" : "Not activated (optional)"}
              </span>
            </div>
            <label className={`flex items-start gap-2 cursor-pointer ${isLightMode ? "text-gray-700" : "text-gray-300"}`}>
              <input
                type="checkbox"
                checked={!!settings.neighborsEnabled}
                onChange={(e) => updateField("neighborsEnabled", e.target.checked)}
                className="accent-[#39ff14] w-3.5 h-3.5 mt-0.5"
              />
              <span className="text-[11px] font-mono leading-relaxed">
                Activate Neighbors for this agent — the public /neighbor door
                and knock tools are already deployed with your agent; this
                records your intent and unlocks the registry steps below.
              </span>
            </label>
          </div>
        ),
      },
      {
        title: "Public Profile",
        desc: "How OTHER agents (and neighbor directories) see you onchain. These fields power the \"I need an app for X\" matching — fill them thoughtfully.",
        body: (
          <div className="space-y-3">
            <p className={`text-[11px] font-mono leading-relaxed ${textMuted}`}>
              Your public name is the agent's name ({settings.agentName || "not set"}) and
              your public description mirrors the agent description — set those
              in Agent Identity. Below are the registry-only fields.
            </p>
            {renderField({
              label: "Tags (comma-separated)",
              value: settings.neighborTags,
              onChange: (v) => updateField("neighborTags", v),
              placeholder: "ai, devtools, saas",
              hint: "Up to 8 short labels — how agents browse categories.",
            })}
            <div>
              <label className={labelCls}>Category</label>
              <ThemedSelect
                value={settings.neighborCategory || "startup"}
                onChange={(v) => updateField("neighborCategory", v)}
                options={[
                  { value: "startup", label: "Startup" },
                  { value: "freelancer", label: "Freelancer" },
                  { value: "business", label: "Business" },
                ]}
              />
            </div>
            {renderField({
              label: "Capabilities (comma-separated)",
              value: settings.neighborCapabilities,
              onChange: (v) => updateField("neighborCapabilities", v),
              placeholder: "ai-memory, website-builder, agent-deploy",
              hint: "Up to 8 structured skills — what visitors' agents search for (\"I need an app for AI memory\").",
            })}
            {renderTextarea({
              label: "Partner note",
              value: settings.neighborPartnerNote,
              onChange: (v) => updateField("neighborPartnerNote", v),
              placeholder: "Open to referrals and partnerships.",
              hint: "Up to 200 chars — how other businesses can partner with you.",
            })}
          </div>
        ),
      },
      {
        title: "Join the Onchain Registry",
        desc: "One signed transaction registers your agent onchain — provably yours, readable by anyone, removable anytime (deposit refunded). Copy your ready-made command.",
        body: (
          <div className="space-y-3">
            <p className={`text-[10px] font-mono leading-relaxed ${textMuted}`}>
              PREREQS (one time): a NEAR wallet (Meteor recommended; MyNearWallet
              sunsets Oct 2026) — the registry is onchain, so a NEAR wallet is how
              you own your entry. TWO WAYS TO REGISTER: ① copy the CLI command
              below (classic), or ② connect your NEAR wallet (no terminal) — approve
              once in your wallet, the wizard signs for you.
              Full runbook: docs/Neighbors-Feature-Plan.md.
            </p>
            <div className="flex flex-col items-start gap-2">
              <button
                type="button"
                data-a2a-nav
                className={primaryBtnCls + " flex items-center gap-2"}
                onClick={() => {
                  navigator.clipboard.writeText(registerCmd);
                  setCopiedNeighborCmd(true);
                  setTimeout(() => setCopiedNeighborCmd(false), 2000);
                }}
              >
                {copiedNeighborCmd ? (
                  <><Check size={14} /> 1. Copied!</>
                ) : (
                  <><Copy size={14} /> 1. Copy Registration Command</>
                )}
              </button>
              {isRegistered && (
                <button
                  type="button"
                  data-a2a-nav
                  className={btnCls + " flex items-center gap-2"}
                  onClick={() => {
                    navigator.clipboard.writeText(updateCmd);
                    setCopiedNeighborUpdate(true);
                    setTimeout(() => setCopiedNeighborUpdate(false), 2000);
                  }}
                >
                  {copiedNeighborUpdate ? (
                    <><Check size={14} /> Update Command copied!</>
                  ) : (
                    <>
                      <RefreshCw size={14} /> Copy Update Command (already
                      registered — free, no deposit)
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                data-a2a-nav
                className={btnCls + " flex items-center gap-2"}
                onClick={() => {
                  navigator.clipboard.writeText(neighborSitePrompt);
                  setCopiedNeighborPrompt(true);
                  setTimeout(() => setCopiedNeighborPrompt(false), 2000);
                }}
              >
                {copiedNeighborPrompt ? (
                  <><Check size={14} /> 2. Copied!</>
                ) : (
                  <><Copy size={14} /> 2. Copy /neighbors Page Prompt (optional — for a public listing page)</>
                )}
              </button>
            </div>
            {renderField({
              label: "Your NEAR account (after registering)",
              value: settings.nearAccountId,
              onChange: (v) => updateField("nearAccountId", v.trim()),
              placeholder: "yourname.testnet",
              hint: "The account that signs the registration — proves the entry is yours. Powers the Finish & Verify onchain check.",
            })}

            {/* ── Wallet-connect (scoped access key) — the no-terminal path ── */}
            <div
              className={`rounded border px-2.5 py-2 space-y-2 ${
                isLightMode ? "border-gray-200 bg-gray-50" : "border-[#1e1e2d] bg-[#0d0d14]"
              }`}
            >
              <p className={`text-[10px] font-mono leading-relaxed ${textMuted}`}>
                ② NO TERMINAL? CONNECT NEAR WALLET — you need a NEAR wallet for
                this registry (any NEAR wallet works). The wizard generates a key
                that can ONLY register/update YOUR neighbor entry (scoped access
                key; it can never move funds). Approve it once — the link opens in
                any browser, even your phone.
              </p>
              <button
                type="button"
                data-a2a-nav
                disabled={nbWalletBusy !== ""}
                className={btnCls + " flex items-center gap-2"}
                onClick={() => runNbWalletStep("key")}
              >
                {nbWalletBusy === "key" ? (
                  <><Loader2 size={14} className="animate-spin" /> 1. Generating…</>
                ) : settings.neighborKeyPublic ? (
                  <><Check size={14} /> 1. Neighbor key ✓ — regenerate</>
                ) : (
                  <><KeyRound size={14} /> 1. Generate Neighbor Key</>
                )}
              </button>
              {settings.neighborKeyPublic && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <ThemedSelect
                        value={
                          WALLET_PRESETS.find(
                            (w) => w.loginUrl === settings.neighborWalletUrl,
                          )?.id || ""
                        }
                        onChange={(v) => {
                          const preset = WALLET_PRESETS.find((w) => w.id === v);
                          if (preset) updateField("neighborWalletUrl", preset.loginUrl);
                        }}
                        options={WALLET_PRESETS.map((w) => ({
                          value: w.id,
                          label: w.label,
                        }))}
                      />
                    </div>
                    <button
                      type="button"
                      data-a2a-nav
                      className={btnCls + " flex items-center gap-2 whitespace-nowrap"}
                      onClick={() => {
                        navigator.clipboard.writeText(
                          buildWalletLoginUrl({
                            baseUrl:
                              settings.neighborWalletUrl ||
                              WALLET_PRESETS[0].loginUrl,
                            contract: NEIGHBORS_CONTRACT_TESTNET,
                            publicKey: settings.neighborKeyPublic,
                            title: "NEAR Neighbors",
                          }),
                        );
                        setNbWalletLinkCopied(true);
                        setTimeout(() => setNbWalletLinkCopied(false), 2000);
                      }}
                    >
                      {nbWalletLinkCopied ? (
                        <><Check size={14} /> 2. Copied!</>
                      ) : (
                        <><Copy size={14} /> 2. Copy Wallet Link</>
                      )}
                    </button>
                  </div>
                  <p
                    className={`text-[9px] font-mono break-all ${
                      isLightMode ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    {buildWalletLoginUrl({
                      baseUrl:
                        settings.neighborWalletUrl || WALLET_PRESETS[0].loginUrl,
                      contract: NEIGHBORS_CONTRACT_TESTNET,
                      publicKey: settings.neighborKeyPublic,
                      title: "NEAR Neighbors",
                    })}
                  </p>
                  <p className={`text-[9px] font-mono ${textMuted}`}>
                    Open the link in any browser, sign in to your wallet as{" "}
                    <b>{settings.nearAccountId || "your NEAR account"}</b>, approve
                    “Add access key” keeping the LIMITED access option (never switch
                    to Full Access — this key only needs register/update/heartbeat
                    on the Neighbors contract). Then come back and verify (step 3).
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-a2a-nav
                      disabled={nbWalletBusy !== ""}
                      className={btnCls + " flex items-center gap-2"}
                      onClick={() => runNbWalletStep("verify")}
                    >
                      {nbWalletBusy === "verify" ? (
                        <><Loader2 size={14} className="animate-spin" /> 3. Checking…</>
                      ) : (
                        <><Globe size={14} /> 3. Verify Connection</>
                      )}
                    </button>
                    <button
                      type="button"
                      data-a2a-nav
                      disabled={nbWalletBusy !== ""}
                      className={primaryBtnCls + " flex items-center gap-2"}
                      onClick={() => runNbWalletStep("tx")}
                    >
                      {nbWalletBusy === "tx" ? (
                        <><Loader2 size={14} className="animate-spin" /> 4. Signing…</>
                      ) : (
                        <><CheckCircle size={14} /> 4. Register Onchain (0.01Ⓝ)</>
                      )}
                    </button>
                  </div>
                </>
              )}
              {nbWalletMsg && (
                <p
                  className={`text-[10px] font-mono break-all ${
                    nbWalletOk
                      ? textAccent
                      : isLightMode
                        ? "text-gray-600"
                        : "text-gray-400"
                  }`}
                >
                  {nbWalletMsg}
                </p>
              )}
            </div>
            <div className={`rounded border px-2 py-1.5 ${isLightMode ? "border-gray-200 bg-gray-50" : "border-[#1e1e2d] bg-[#0d0d14]"}`}>
              <p className={`text-[9px] font-mono ${textMuted} mb-1 break-all`}>
                {isRegistered ? "✓ Registered as" : "Command preview (updates live with your profile):"}
              </p>
              <p className={`text-[9px] font-mono break-all ${isLightMode ? "text-gray-600" : "text-gray-400"}`}>
                {registerCmd.slice(0, 220)}
                {registerCmd.length > 220 ? "…" : ""}
              </p>
            </div>
          </div>
        ),
      },
    ];
  };

  // The final slide every node gets — REAL diagnostic verification with
  // animated sequential rows and a confidence SAVE button.
  const finishSlide = (node: NodeId): Slide => ({
    title:
      node === "telegram"
        ? "You're live on Telegram 🎉"
        : "Finish & Verify",
    desc:
      node === "telegram"
        ? "Try it: open Telegram, search your bot's @username, send a message — your agent answers with the same brain as your website chat. First, the real checks:"
        : `Real diagnostics for ${nodeMeta[node].title} — every requirement below is checked live right now, not assumed.`,
    body: (
      <div className="space-y-3">
        <style>{`@keyframes a2aFinishRow{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}.a2a-finish-row{animation:a2aFinishRow .3s ease-out both}`}</style>
        <div className="space-y-1.5">
          {finishChecks.map((c) =>
            c.status === "pending" ? null : (
              <div
                key={c.key}
                className={`a2a-finish-row flex items-start gap-2 rounded px-2 py-1.5 border transition-colors ${
                  c.status === "fail"
                    ? "border-[#ff3d7f]/30 bg-[#ff3d7f]/5"
                    : "border-transparent"
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 ${
                    c.status === "ok"
                      ? textAccent
                      : c.status === "fail"
                        ? "text-[#ff3d7f]"
                        : textMuted
                  }`}
                >
                  {c.status === "ok" ? (
                    <Check size={13} />
                  ) : c.status === "fail" ? (
                    <XCircle size={13} />
                  ) : (
                    <Loader2 size={13} className="animate-spin" />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-xs font-mono ${
                      c.status === "fail" ? "text-[#ff3d7f]" : ""
                    }`}
                  >
                    {c.label}
                  </p>
                  {c.detail && (
                    <p className={`text-[10px] font-mono ${textMuted} break-all`}>
                      {c.detail}
                    </p>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
        {!finishRunning &&
          finishChecks.length > 0 &&
          finishChecks.every((c) => c.status === "ok" || c.status === "fail") && (
            <p
              className={`text-[11px] font-mono ${
                finishChecks.some((c) => c.status === "fail")
                  ? "text-[#ff3d7f]"
                  : textAccent
              }`}
            >
              {finishChecks.some((c) => c.status === "fail")
                ? `${finishChecks.filter((c) => c.status === "fail").length} issue(s) — open the Assistant (below) for help fixing them`
                : "All checks passed ✓"}
            </p>
          )}
        <div
          className={`pt-3 border-t space-y-1.5 ${isLightMode ? "border-gray-200" : "border-[#1e1e2d]"}`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-a2a-nav
              className={primaryBtnCls + " flex items-center gap-2"}
              onClick={() => {
                flushSave();
                setFinishSaved(true);
                setTimeout(() => setFinishSaved(false), 2000);
              }}
            >
              {finishSaved ? (
                <>
                  <CheckCircle size={14} /> Saved!
                </>
              ) : (
                <>
                  <CheckCircle size={14} /> SAVE
                </>
              )}
            </button>
          </div>
          <p className={`text-[10px] font-mono ${textMuted}`}>
            Settings already auto-save on every step — SAVE is a manual
            confirmation that everything you entered is persisted.
          </p>
        </div>
      </div>
    ),
  });

  const slidesFor = (id: NodeId): Slide[] => {
    switch (id) {
      case "identity":
        return [...identitySlides(), finishSlide(id)];
      case "website":
        return [...websiteSlides(), finishSlide(id)];
      case "cloudmirror":
        return [...cloudMirrorSlides(), finishSlide(id)];
      case "mcpserver":
        return [...mcpServerSlides(), finishSlide(id)];
      case "telegram":
        return [...telegramSlides(), finishSlide(id)];
      case "jwtauth":
        return [...jwtAuthSlides(), finishSlide(id)];
      case "license":
        return [...licenseSlides(), finishSlide(id)];
      case "neighbors":
        return [...neighborsSlides(), finishSlide(id)];
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

            {slide < slidesFor(openNode).length - 2 ? (
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
            ) : slide < slidesFor(openNode).length - 1 ? (
              <button
                type="button"
                data-a2a-nav
                className={primaryBtnCls + " flex items-center gap-1"}
                onClick={() => {
                  flushSave();
                  setSlide((s) => s + 1);
                }}
              >
                <Check size={14} /> Finish
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
                <Check size={14} /> Save & Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ── Redeploy indicator: true once deployed AND worker-affecting settings
  // drifted OR the installed invention is newer than the deployed one.
  const settingsFingerprint = deployFingerprint(
    settings as unknown as Record<string, unknown>,
  );
  const versionDrift =
    !!settings.lastDeployVersion &&
    !!inventionVersionRef.current &&
    inventionVersionRef.current !== settings.lastDeployVersion;
  const needsRedeploy =
    (settings.deployStatus === "deployed" || !!settings.lastDeployedAt) &&
    !!settings.lastDeployFingerprint &&
    (settingsFingerprint !== settings.lastDeployFingerprint || versionDrift);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-3xl mx-auto">
        {/* Redeploy banner — always visible on the Wizard tab when the
            deployed worker is stale (settings drift or newer code). */}
        {(needsRedeploy || deploying) && (
          <div
            className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 mb-3 ${
              isLightMode
                ? "border-yellow-500/20 bg-yellow-500/10"
                : "border-yellow-500/30 bg-yellow-500/10"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw
                size={13}
                className={deploying ? "animate-spin text-yellow-500" : "text-yellow-500"}
              />
              <span className="text-[11px] font-mono text-yellow-400 truncate">
                {deploying
                  ? "Deploying to Cloudflare…"
                  : versionDrift && settingsFingerprint !== settings.lastDeployFingerprint
                    ? "Redeploy needed — new settings + updated invention code aren't live on your agent yet"
                    : versionDrift
                      ? "Redeploy needed — updated invention code isn't live on your agent yet"
                      : "Redeploy needed — new settings aren't live on your agent yet"}
              </span>
            </div>
            <button
              type="button"
              data-a2a-nav
              disabled={deploying}
              onClick={handleDeploy}
              className={
                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors whitespace-nowrap " +
                (isLightMode
                  ? "border-yellow-500/20 bg-white text-yellow-500 hover:bg-yellow-500/10 disabled:opacity-50"
                  : "border-yellow-500/20 bg-[#13131f] text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50")
              }
            >
              {deploying ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {deploying ? "Deploying…" : "Redeploy now"}
            </button>
          </div>
        )}
        {(deployMsg || deployError) && !deploying && (
          <div
            className={`text-[10px] font-mono mb-2 px-2 ${
              deployError
                ? "text-[#ff3d7f]"
                : isLightMode
                  ? "text-emerald-700"
                  : "text-[#39ff14]"
            }`}
          >
            {deployError || deployMsg}
          </div>
        )}

        {/* Save indicator only (auto-save feedback) */}
        <div className="flex items-center justify-end min-h-[20px] mb-1">
          {saving && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-gray-500">
              <Loader2 size={11} className="animate-spin" /> Saving…
            </span>
          )}
        </div>

        {/* Canvas — the 6-pointed star */}
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
