/**
 * A2A Protocol v1.0 — Type definitions
 * Based on Google's Agent-to-Agent Protocol specification
 */

// ============================================
// JSON-RPC 2.0
// ============================================

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: JsonRpcError;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ============================================
// A2A Protocol Types
// ============================================

export type TaskStatus =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

export interface TaskState {
  taskId: string;
  status: TaskStatus;
  history?: TaskHistoryEvent[];
  metadata?: Record<string, unknown>;
}

export interface TaskHistoryEvent {
  role: "user" | "agent";
  parts: Part[];
  timestamp?: string;
}

// ============================================
// Message & Parts
// ============================================

export interface Message {
  role: "user" | "agent";
  parts: Part[];
  metadata?: Record<string, unknown>;
}

export type Part = TextPart | DataPart | FilePart;

export interface TextPart {
  type: "text";
  text: string;
}

export interface DataPart {
  type: "data";
  data: Record<string, unknown>;
}

export interface FilePart {
  type: "file";
  file: {
    name?: string;
    mimeType?: string;
    bytes?: string; // base64 encoded
    uri?: string;
  };
}

// ============================================
// Artifacts
// ============================================

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

// ============================================
// Agent Card
// ============================================

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputModes: string[];
  outputModes: string[];
}

export interface AgentCard {
  schemaVersion: string;
  name: string;
  description: string;
  url: string;
  preferredTransport: string;
  version: string;
  documentationUrl?: string;
  provider: {
    organization: string;
    url: string;
  };
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  authentication: {
    schemes: string[];
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
}

// ============================================
// A2A Method Params & Results
// ============================================

export interface SendMessageParams {
  taskId?: string;
  message: Message;
  skillId?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  task: TaskState;
}

export interface GetTaskParams {
  taskId: string;
  historyLength?: number;
}

export interface GetTaskResult {
  task: TaskState;
}

export interface CancelTaskParams {
  taskId: string;
}

export interface CancelTaskResult {
  task: TaskState;
}

export interface GetArtifactsParams {
  taskId: string;
}

export interface GetArtifactsResult {
  artifacts: Artifact[];
}

// ============================================
// Cloudflare Worker Env
// ============================================

/**
 * Minimal type for the Cloudflare Workers AI binding.
 * The full Ai type comes from @cloudflare/workers-types at runtime.
 * This interface covers the .run() method we use for offline fallback,
 * including function/tool calling support (GLM-4.7-Flash supports it).
 */
export interface Ai {
  run(
    model: string,
    inputs: {
      messages?: Array<{ role: string; content: string }>;
      max_tokens?: number;
      temperature?: number;
      /** Function/tool calling — OpenAI-compatible format. GLM-4.7-Flash supports this. */
      tools?: Array<{
        type: string;
        function: {
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        };
      }>;
    },
  ): Promise<unknown>;
}

export interface Env {
  ENVIRONMENT: string;
  // Cloudflare Workers AI binding — independent LLM used for offline fallback
  // when the MCP Gateway is unreachable. Lets the agent synthesize intelligent
  // responses from Supabase-retrieved knowledge without needing the Gateway.
  AI: Ai;
  // Agent identity — deployed from invention settings (Sub-Agent user selection).
  // When unset, the Worker falls back to the static agent-card.json defaults.
  AGENT_NAME?: string;
  AGENT_DESCRIPTION?: string;
  AGENT_URL?: string;
  AGENT_SKILLS_JSON?: string;
  AGENT_PROVIDER?: string;
  GATEWAY_BASE_URL?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  MOTHER_BRAIN_GATEWAY_TOKEN: string;
  // Sub-Agent (bot user) access token — sent as X-Mother-Brain-User-Token for
  // Zero Trust attribution. Optional: when unset, attribution degrades to
  // "User (unknown)" but requests still process.
  MOTHER_BRAIN_USER_TOKEN?: string;
  VOYAGE_API_KEY: string;
  EMBEDDING_MODEL?: string; // defaults to "voyage-4-large"
  AI_MODEL?: string; // defaults to "default" (MB Gateway routes to user's active LLM)

  // ── Cloudflare Workers AI Model (Offline Fallback) ──
  // The model used by the Cloudflare Workers AI binding when the Gateway is
  // unreachable OR when forceCfWorker is enabled (overriding the Gateway LLM).
  // Defaults to "@cf/zai-org/glm-4.7-flash" (fast, cheap, function calling, free tier).
  // Configured via Settings UI → Deploy → Workers AI Model; deployed as a secret.
  CF_WORKER_MODEL?: string;
  // When "true", skips the MCP Gateway entirely and uses Cloudflare Workers AI
  // for all inference. Useful for cost control or when you want to always use
  // Cloudflare's hosted models instead of the MB Gateway's LLM routing.
  FORCE_CF_WORKER?: string;

  // ── Cloudflare MCP Mirror (CF-hosted MCP Gateway proxy) ──
  // URL of the Cloudflare MCP Mirror — a CF Worker that hosts Mother Brain's
  // MCP tools in the cloud. When the local MCP Gateway is unreachable and this
  // is configured, the A2A Agent Worker falls back to querying the CF MCP Mirror
  // for MCP tool execution instead of falling through to Workers AI / placeholder.
  // Optional: when unset, the Worker ignores this path (graceful degradation).
  // Configured via Settings UI → Deploy → CF MCP Mirror; deployed as a secret.
  MCP_CLOUD_URL?: string; // e.g. https://mother-brain-mcp-cloud.nativeapps-cipher.workers.dev
  // When "true", routes ALL MCP tool calls to the CF MCP Mirror instead of the
  // local Mother Brain Gateway. Useful for testing the CF mirror or as a permanent
  // routing override without waiting for Gateway health checks to fail.
  // Like FORCE_CF_WORKER but for MCP tool execution rather than LLM inference.
  FORCE_CLOUD_MCP?: string;

  // ── Offline Fallback (Project Knowledge Base) ──
  // When the MCP Gateway is unreachable (MacBook offline / Gateway down),
  // the Worker queries the PROJECT's Supabase directly to retrieve stored
  // knowledge (code index, memories, chat history) and generate a response
  // via the Gateway's LLM endpoint (if still reachable) or a direct LLM call.
  // These point at the Mother Brain project's Supabase (NOT the A2A Agent's
  // own chat-history Supabase above). If unset, the Worker falls through to
  // the existing placeholder response (graceful degradation — no behavior change).
  MB_SUPABASE_URL?: string; // e.g. https://your-project-ref.supabase.co
  MB_SUPABASE_SERVICE_KEY?: string; // service_role key for the project Supabase
  MB_PROJECT_ID?: string; // project ID used as table prefix, e.g. "your_project_id"

  // ── Website MCP Server (motherbrain.app) ──
  // Optional. When set, enables website tools (read_page, navigate,
  // get_account, etc.) for the A2A agent. When unset, website tools are
  // not exposed to the LLM (graceful degradation — no behavior change).
  MCP_BASE_URL?: string; // e.g. https://api.motherbrain.app
  MCP_API_KEY?: string; // mb_mcp_<hex> — distinct from MOTHER_BRAIN_GATEWAY_TOKEN
  WEBSITE_URL?: string; // e.g. https://motherbrain.app — used for navigate/highlight links

  // ── NEAR Neighbors Registry (onchain neighbor discovery) ──
  // Optional. When set, the agent's neighbors tools read the live NEAR
  // registry contract instead of the built-in seed list. Reads are free
  // public RPC calls (FastNEAR recommended — the legacy rpc.testnet.near.org
  // is deprecated), cached for 5 minutes with seed-list fallback on failure.
  NEIGHBORS_RPC_URL?: string; // e.g. https://test.rpc.fastnear.com
  NEIGHBORS_CONTRACT?: string; // e.g. neighborly.testnet

  // ── NEAR Neighbors — Goals / Heartbeat (owner intent → agent action) ──
  // Deployed from invention settings (config.json deploy.secrets map):
  // the console's Goals list + curated targets + the heartbeat on/off flag.
  // AGENT_GOALS_JSON powers the "YOUR BUSINESS GOALS" system-prompt block
  // (Bridge 2) and the heartbeat's intent (Bridge: goals → worker).
  AGENT_GOALS_JSON?: string; // JSON [{id,title,body,enabled,created}]
  AGENT_NEIGHBOR_TARGETS_JSON?: string; // JSON ["domain",…] — favorites + tagged
  HEARTBEAT_ENABLED?: string; // "true" | "false" — gates the cron outreach

  // ── License Key Resolution (Encore Subscriptions API) ──
  // Optional. When set, in-app support messages that include a license_key
  // in metadata are resolved to a visitor_id via the Encore API. This links
  // in-app support chats with the user's web chat history (conversion link).
  // When unset, license keys fall back to `license:{key}` as the visitor_id.
  ENCORE_API_URL?: string; // e.g. https://api.motherbrain.app
  ENCORE_API_KEY?: string; // optional auth for the Encore lookup endpoint

  // ── JWT Session Token Verification (Dual-Path Auth) ──
  // Optional but required for JWT verification. When set, JWT session tokens
  // sent by the website chat widget (Authorization: Bearer header) are verified
  // using HMAC-SHA256. The shared secret is the same JwtSecret used by the
  // Encore backend auth system.
  // Fail-closed: if a JWT is sent but this is unset, the Worker returns 503.
  // License-key path (macOS app) and anonymous path work regardless.
  JWT_SECRET?: string; // 64-char base64url string (shared Encore secret)
  // Expected issuer (iss claim) for JWT tokens. When set, tokens whose iss
  // doesn't match are rejected. Optional — when unset, iss is not validated.
  JWT_ISSUER?: string; // e.g. "motherbrain.app"

  // ── Telegram Bot Integration ──
  // Optional. When set, enables the Telegram webhook endpoint at
  // POST /webhook/telegram. Visitors can chat with the agent directly in
  // Telegram. Messages flow through the same A2A pipeline (Gateway → AI →
  // MCP tools) and are stored in the same Supabase chat DB as website chats.
  // When unset, the webhook endpoint returns 503 (graceful degradation).
  TELEGRAM_BOT_TOKEN?: string; // from @BotFather
}
