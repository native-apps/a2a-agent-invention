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

export interface Env {
  ENVIRONMENT: string;
  GATEWAY_BASE_URL: string;
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

  // ── License Key Resolution (Encore Subscriptions API) ──
  // Optional. When set, in-app support messages that include a license_key
  // in metadata are resolved to a visitor_id via the Encore API. This links
  // in-app support chats with the user's web chat history (conversion link).
  // When unset, license keys fall back to `license:{key}` as the visitor_id.
  ENCORE_API_URL?: string; // e.g. https://api.motherbrain.app
  ENCORE_API_KEY?: string; // optional auth for the Encore lookup endpoint
}
