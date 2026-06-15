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
  VOYAGE_API_KEY: string;
  EMBEDDING_MODEL?: string; // defaults to "voyage-4-large"
  AI_MODEL?: string; // defaults to "default" (MB Gateway routes to user's active LLM)
}
