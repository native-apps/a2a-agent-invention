import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  Env,
  Message,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  SendMessageParams,
  SendMessageResult,
  GetTaskParams,
  GetTaskResult,
  CancelTaskParams,
  GetArtifactsParams,
  GetArtifactsResult,
} from "./types";
import { SupabaseClient } from "./supabase";
import {
  handleTaskMessage,
  getTaskState,
  cancelTask,
  generateVisitorSuggestions,
} from "./task-handler";
import {
  validateMessage,
  checkRateLimit,
  getClientIP,
  validateJsonRpcRequest,
} from "./security";
import { setGatewayUrl, setUserToken } from "./mcp";
import { setWebsiteMcpConfig } from "./website-mcp";
import { setEncoreApiConfig, resolveLicenseKey } from "./license-resolver";
import { setJwtSecret, isJwtSecretConfigured, verifyJwt } from "./jwt-session";
import { setAgentIdentity } from "./knowledge-base";
import agentCard from "./agent-card.json";

// Agent identity — set from Worker env vars on each request.
// When unset, falls back to the static agent-card.json defaults.
let agentName: string | undefined;
let agentDescription: string | undefined;

const app = new Hono<{ Bindings: Env }>();

// Set the gateway URL from env on each request (Cloudflare Workers persists
// module-level state within an isolate, so this is safe).
app.use("*", async (c, next) => {
  if (c.env.GATEWAY_BASE_URL) {
    setGatewayUrl(c.env.GATEWAY_BASE_URL);
  }
  // Sub-Agent token for Zero Trust attribution (X-Mother-Brain-User-Token).
  // Optional: omitted gracefully if the project hasn't created a bot user yet.
  setUserToken(c.env.MOTHER_BRAIN_USER_TOKEN);
  // Website MCP server config (motherbrain.app). Optional: when unset,
  // website tools are not exposed to the LLM (graceful degradation).
  setWebsiteMcpConfig(c.env.MCP_BASE_URL, c.env.MCP_API_KEY);
  // Encore API config for license key → visitor_id resolution.
  // Optional: when unset, license keys fall back to `license:{key}`.
  setEncoreApiConfig(c.env.ENCORE_API_URL, c.env.ENCORE_API_KEY);
  // JWT session token verification secret (Dual-Path Auth).
  // Optional but required for JWT verification. When unset, JWT-bearing
  // requests are rejected with 503 (fail-closed). License-key and
  // anonymous paths work regardless.
  setJwtSecret(c.env.JWT_SECRET);
  // Agent identity from settings (Sub-Agent user selection). Optional:
  // when unset, the static agent-card.json defaults are used.
  agentName = c.env.AGENT_NAME;
  agentDescription = c.env.AGENT_DESCRIPTION;
  // Pass agent identity to the knowledge-base module so buildSystemPrompt()
  // uses the configured name instead of the hardcoded SOUL_MD defaults.
  setAgentIdentity(c.env.AGENT_NAME, c.env.AGENT_DESCRIPTION);
  await next();
});

// ============================================
// Middleware
// ============================================

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Bearer token authentication for A2A endpoints (reserved for future auth middleware)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _authenticate = (authHeader: string | undefined, env: Env): boolean => {
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  // Accept either the gateway token or any valid bearer token
  return match[1] === env.MOTHER_BRAIN_GATEWAY_TOKEN;
};

// ============================================
// Agent Discovery (A2A Spec v1.0: Agent Card)
// ============================================

// Build the agent card dynamically when env vars are set, otherwise
// fall back to the static agent-card.json defaults.
function getAgentCard() {
  if (agentName || agentDescription) {
    return {
      ...agentCard,
      ...(agentName ? { name: agentName } : {}),
      ...(agentDescription ? { description: agentDescription } : {}),
    };
  }
  return agentCard;
}

// v1.0 canonical well-known URI (spec Section 8.2, 14.3)
app.get("/.well-known/agent-card.json", (c) => {
  return c.json(getAgentCard());
});

// Legacy v0.3 well-known URI (backward compat for older SDKs)
app.get("/.well-known/agent.json", (c) => {
  return c.json(getAgentCard());
});

// Also serve at root for convenience
app.get("/agent.json", (c) => {
  return c.json(getAgentCard());
});

// Health check
app.get("/", (c) => {
  return c.json({
    service: "Mother Brain A2A Endpoint",
    version: "1.0.0",
    agentCard: "/.well-known/agent-card.json",
    protocol: "A2A v1.0",
    transport: "JSON-RPC 2.0",
    status: "operational",
  });
});

// ============================================
// A2A JSON-RPC Endpoint
// ============================================

app.post("/", async (c) => {
  const env = c.env;
  let body: JsonRpcRequest;

  // --- Rate Limiting ---
  const clientIP = getClientIP(c.req.raw);
  const rateResult = checkRateLimit(clientIP);
  if (!rateResult.allowed) {
    return c.json(
      jsonRpcError(-32603, "Rate limit exceeded. Please wait a moment.", null),
      429,
      {
        "Retry-After": String(
          Math.ceil((rateResult.resetAt - Date.now()) / 1000),
        ),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(rateResult.resetAt / 1000)),
      },
    );
  }

  try {
    body = await c.req.json<JsonRpcRequest>();
  } catch {
    return c.json(jsonRpcError(-32700, "Parse error: invalid JSON", null), 400);
  }

  // --- JSON-RPC Validation ---
  const rpcValidation = validateJsonRpcRequest(body);
  if (!rpcValidation.valid) {
    return c.json(
      jsonRpcError(
        -32600,
        `Invalid Request: ${rpcValidation.error}`,
        body.id ?? null,
      ),
    );
  }

  // --- Original validation (keep for backward compat) ---
  if (body.jsonrpc !== "2.0") {
    return c.json(
      jsonRpcError(
        -32600,
        "Invalid Request: jsonrpc must be '2.0'",
        body.id ?? null,
      ),
    );
  }

  if (!body.method) {
    return c.json(
      jsonRpcError(
        -32600,
        "Invalid Request: method is required",
        body.id ?? null,
      ),
    );
  }

  // Route to the appropriate handler
  const db = new SupabaseClient(env);

  try {
    let result: unknown;

    switch (body.method) {
      // ============================================
      // Health Check (no DB rows created)
      // ============================================

      case "ping": {
        return c.json({
          jsonrpc: "2.0",
          result: { status: "ok" },
          id: body.id ?? null,
        });
      }

      // ============================================
      // A2A Core Methods
      // ============================================

      case "message/send": {
        const params = body.params as SendMessageParams;
        if (!params?.message) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: message is required",
              body.id!,
            ),
          );
        }

        // --- Input Sanitization ---
        let sanitizedMessage: Message;
        try {
          const validated = validateMessage(params.message);
          sanitizedMessage = {
            role: validated.role as "user" | "agent",
            parts: validated.parts as Message["parts"],
            metadata: validated.metadata,
          };
        } catch (err) {
          return c.json(
            jsonRpcError(
              -32602,
              `Invalid message: ${err instanceof Error ? err.message : "Validation failed"}`,
              body.id!,
            ),
          );
        }

        // --- Dual-Path Authentication Resolution ---
        // Priority 1: JWT session token (website) via Authorization header
        //            or metadata.sessionToken fallback
        // Priority 2: License key in metadata (macOS app) → Encore API
        // Priority 3: Anonymous visitor (visitor_id only)
        let visitorId = (params.metadata?.visitor_id as string) || undefined;
        let customerId: number | null = null;
        let licenseKey: string | undefined;

        // 1. Try JWT (website chat widget)
        const authHeader = c.req.header("Authorization");
        const jwtToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : (params.metadata?.sessionToken as string) || undefined;

        if (jwtToken) {
          // Fail-closed: JWT present but secret not configured → 503
          if (!isJwtSecretConfigured()) {
            return c.json(
              {
                jsonrpc: "2.0",
                error: {
                  code: -32603,
                  message:
                    "Server not configured for session token authentication",
                },
                id: body.id ?? null,
              },
              503,
            );
          }
          try {
            const claims = await verifyJwt(jwtToken);
            if (claims) {
              customerId = Number(claims.sub);
              // JWT vid claim takes priority for chat continuity
              if (claims.vid) visitorId = claims.vid;
              // Extract first license key from JWT claims if present
              if (claims.lic?.length) licenseKey = claims.lic[0];
              console.log(
                `[auth] JWT verified → customerId ${customerId}, visitorId ${visitorId ?? "none"}`,
              );
            } else {
              // JWT present but invalid/expired — treat as anonymous.
              // Chat continues via visitor_id; customer linkage is lost.
              console.warn(
                "[auth] JWT present but invalid/expired — treating as anonymous",
              );
            }
          } catch (err) {
            // verifyJwt threw (e.g., secret issue) — fail-closed
            console.error(
              "[auth] JWT verification error:",
              err instanceof Error ? err.message : err,
            );
            return c.json(
              {
                jsonrpc: "2.0",
                error: {
                  code: -32603,
                  message: "Session token verification failed",
                },
                id: body.id ?? null,
              },
              503,
            );
          }
        }

        // 2. No JWT (or JWT failed) — try license key in metadata (macOS app)
        const metadataLicenseKey =
          (params.metadata?.license_key as string) || undefined;
        if (!customerId && metadataLicenseKey) {
          licenseKey = metadataLicenseKey;
          try {
            const resolution = await resolveLicenseKey(metadataLicenseKey);
            if (resolution.visitorId) {
              if (!visitorId) visitorId = resolution.visitorId;
              if (resolution.customerId) customerId = resolution.customerId;
              console.log(
                `[auth] License key resolved → visitorId ${resolution.visitorId}, customerId ${resolution.customerId ?? "none"}`,
              );

              // Retroactively populate license_key + customer_id on all
              // existing messages/tasks for this visitor. Links the
              // customer identity to the visitor's entire chat history.
              try {
                const backfillData: Record<string, unknown> = {
                  license_key: licenseKey,
                };
                if (customerId) {
                  backfillData.customer_id = customerId;
                }
                await db
                  .from("task_messages")
                  .then((q) =>
                    q
                      .eq("visitor_id", resolution.visitorId!)
                      .update(backfillData),
                  );
                await db
                  .from("tasks")
                  .then((q) =>
                    q
                      .eq("visitor_id", resolution.visitorId!)
                      .update(backfillData),
                  );
                console.log(
                  `[auth] Backfilled license_key${customerId ? " + customer_id" : ""} to existing history for visitor ${resolution.visitorId}`,
                );
              } catch (upsertErr) {
                console.warn(
                  "[auth] Failed to backfill to history:",
                  upsertErr instanceof Error ? upsertErr.message : upsertErr,
                );
              }
            } else {
              console.warn(
                "[auth] License key resolution returned null visitorId — message will be stored anonymous",
              );
            }
          } catch (err) {
            console.warn(
              "[auth] Failed to resolve license key:",
              err instanceof Error ? err.message : err,
            );
            // Do NOT generate a fallback visitor_id. Leave it undefined
            // so the message is stored with visitor_id = null. The
            // license_key is still recorded for later linking.
          }
        }

        // 3. Neither JWT nor license key → anonymous (visitorId only, customerId null)

        // --- Visitor Rate Limiting (per visitor_id) ---
        if (visitorId) {
          const visitorRate = checkRateLimit(`visitor:${visitorId}`);
          if (!visitorRate.allowed) {
            return c.json(
              jsonRpcError(
                -32603,
                "Rate limit exceeded. Please wait a moment.",
                body.id!,
              ),
              429,
              {
                "Retry-After": String(
                  Math.ceil((visitorRate.resetAt - Date.now()) / 1000),
                ),
              },
            );
          }
        }

        let taskId = params.taskId;

        // No taskId provided — try to reuse the visitor's existing task.
        // This ensures all messages from a visitor stay in ONE persistent
        // conversation (one task), not split into separate tasks per message.
        if (!taskId && visitorId) {
          try {
            const existingTasks = await db
              .from("tasks")
              .then((q) =>
                q
                  .select("id")
                  .eq("visitor_id", visitorId)
                  .order("created_at", false)
                  .limit(1)
                  .get<{ id: string }>(),
              );
            if (existingTasks && existingTasks.length > 0) {
              taskId = existingTasks[0].id;
              console.log(
                `[visitor] Reusing task ${taskId} for visitor ${visitorId}`,
              );
            }
          } catch (err) {
            console.warn(
              "Failed to look up existing visitor task:",
              err instanceof Error ? err.message : err,
            );
          }
        }

        // Still no taskId — create a new task (first-time visitor)
        if (!taskId) {
          const newTasks = await db.from("tasks").then((q) =>
            q.insert({
              status: "submitted",
              skill_id: params.skillId || null,
              visitor_id: visitorId || null,
              license_key: licenseKey || null,
              customer_id: customerId,
              metadata: params.metadata || {},
              history: [],
            }),
          );
          const newTask = Array.isArray(newTasks) ? newTasks[0] : null;
          taskId = newTask?.id;

          if (!taskId) {
            return c.json(
              jsonRpcError(-32603, "Failed to create task", body.id!),
            );
          }
        }

        // Process the message (use sanitized version)
        const { task, artifacts } = await handleTaskMessage(
          taskId,
          sanitizedMessage,
          params.skillId,
          db,
          env.MOTHER_BRAIN_GATEWAY_TOKEN,
          visitorId,
          env.VOYAGE_API_KEY,
          env.EMBEDDING_MODEL,
          env.AI_MODEL,
          // Offline fallback config — queries the PROJECT's Supabase directly
          // when the MCP Gateway is unreachable. All optional; if MB_* vars
          // aren't set, the Worker falls through to the placeholder response.
          {
            mbSupabaseUrl: env.MB_SUPABASE_URL,
            mbSupabaseServiceKey: env.MB_SUPABASE_SERVICE_KEY,
            mbProjectId: env.MB_PROJECT_ID,
            voyageApiKey: env.VOYAGE_API_KEY,
            embeddingModel: env.EMBEDDING_MODEL,
          },
          licenseKey,
          customerId,
        );

        result = { task, artifacts } as SendMessageResult;
        break;
      }

      case "tasks/get": {
        const params = body.params as GetTaskParams;
        if (!params?.taskId) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: taskId is required",
              body.id!,
            ),
          );
        }

        const task = await getTaskState(params.taskId, db);
        if (!task) {
          return c.json(jsonRpcError(-32001, "Task not found", body.id!));
        }

        result = { task } as GetTaskResult;
        break;
      }

      case "tasks/cancel": {
        const params = body.params as CancelTaskParams;
        if (!params?.taskId) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: taskId is required",
              body.id!,
            ),
          );
        }

        const task = await cancelTask(params.taskId, db);
        if (!task) {
          return c.json(jsonRpcError(-32001, "Task not found", body.id!));
        }

        result = { task } as import("./types").CancelTaskResult;
        break;
      }

      case "tasks/getArtifacts": {
        const params = body.params as GetArtifactsParams;
        if (!params?.taskId) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: taskId is required",
              body.id!,
            ),
          );
        }

        const artifacts = await db.from("artifacts").then((q) =>
          q
            .select("artifact_id,name,description,parts,metadata")
            .eq("task_id", params.taskId)
            .get<{
              artifact_id: string;
              name: string;
              description: string;
              parts: unknown[];
              metadata: Record<string, unknown>;
            }>(),
        );

        result = {
          artifacts: artifacts.map((a) => ({
            artifactId: a.artifact_id,
            name: a.name,
            description: a.description,
            parts: a.parts,
            metadata: a.metadata,
          })),
        } as GetArtifactsResult;
        break;
      }

      // ============================================
      // Agent Discovery Methods
      // ============================================

      case "agent/getCard": {
        result = agentCard;
        break;
      }

      // ============================================
      // Visitor Session Persistence
      // ============================================

      case "visitor/history": {
        const params = body.params as { visitor_id?: string; limit?: number };
        if (!params?.visitor_id) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: visitor_id is required",
              body.id!,
            ),
          );
        }

        const limit = Math.min(params.limit || 5, 20); // Cap at 20

        // Fetch recent tasks for this visitor
        const recentTasks = await db
          .from("tasks")
          .then((q) =>
            q
              .select("id,status,created_at")
              .eq("visitor_id", params.visitor_id)
              .order("created_at", false)
              .limit(limit)
              .get<{ id: string; status: string; created_at: string }>(),
          );

        const taskHistories = await Promise.all(
          recentTasks.map(async (task) => {
            const taskMessages = await db.from("task_messages").then((q) =>
              q
                .select("role,parts,created_at")
                .eq("task_id", task.id)
                .order("created_at", true)
                .limit(50)
                .get<{
                  role: string;
                  parts: Array<{ type: string; text?: string }>;
                  created_at: string;
                }>(),
            );

            return {
              taskId: task.id,
              status: task.status,
              createdAt: task.created_at,
              messages: taskMessages.map((m) => ({
                role: m.role,
                text: m.parts
                  .filter((p) => p.type === "text")
                  .map((p) => p.text || "")
                  .join(""),
              })),
            };
          }),
        );

        result = {
          visitorId: params.visitor_id,
          conversations: taskHistories,
        };
        break;
      }

      // ============================================
      // Visitor Prompt Suggestions (AI-generated)
      // ============================================

      case "visitor/suggestions": {
        const params = body.params as { visitor_id?: string };

        const suggestions = await generateVisitorSuggestions(
          params?.visitor_id,
          db,
          env.MOTHER_BRAIN_GATEWAY_TOKEN,
        );

        result = { suggestions };
        break;
      }

      // ============================================
      // Method not found
      // ============================================

      default:
        return c.json(
          jsonRpcError(-32601, `Method not found: ${body.method}`, body.id!),
        );
    }

    return c.json({
      jsonrpc: "2.0",
      result,
      id: body.id ?? null,
    } as JsonRpcResponse);
  } catch (error) {
    console.error("A2A handler error:", error);
    return c.json(
      jsonRpcError(
        -32603,
        `Internal error: ${error instanceof Error ? error.message : "Unknown error"}`,
        body.id ?? null,
      ),
    );
  }
});

// ============================================
// Helpers
// ============================================

function jsonRpcError(
  code: number,
  message: string,
  id: string | number | null,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    error: { code, message } as JsonRpcError,
    id,
  };
}

export default app;
