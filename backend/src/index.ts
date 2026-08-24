import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  Env,
  Message,
  TaskState,
  TaskStatus,
  Part,
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
  generateVisitorSuggestions,
  generateSkillSuggestions,
  registerSkillIds,
  insertResilient,
} from "./task-handler";
import {
  validateMessage,
  checkRateLimit,
  getClientIP,
  validateJsonRpcRequest,
} from "./security";
import { setGatewayUrl, setUserToken } from "./mcp";
import {
  setWebsiteMcpConfig,
  isWebsiteMcpConfigured,
  getWebsiteTools,
  discoverWebsiteTools,
  getRuntimeWebsiteTools,
} from "./website-mcp";
import { setEncoreApiConfig, resolveLicenseKey } from "./license-resolver";
import {
  setCloudMcpConfig,
  isCloudMcpConfigured,
  getCloudMcpUrl,
  getForceCloudMcp,
  checkCloudMcpHealth,
} from "./cf-mcp-mirror";
import { setJwtSecret, setJwtIssuer, isJwtSecretConfigured, verifyJwt } from "./jwt-session";
import { setDeviceResolverConfig, resolveVisitorIds } from "./device-resolver";
import { setAgentIdentity, buildSystemPrompt } from "./knowledge-base";
import { setWebsiteUrlForLinks } from "./security";
import { setTelegramBotToken, isTelegramConfigured, handleTelegramWebhook } from "./telegram";
import {
  setNeighborConfig,
  buildNeighborCard,
  handleNeighborKnock,
  getNeighborRegistry,
} from "./neighbor";
import agentCard from "./agent-card.json";

// Agent identity — set from Worker env vars on each request.
let agentName: string | undefined;
let agentDescription: string | undefined;
let agentSkills: unknown[] | undefined;
let agentProvider: string | undefined;
let agentUrl: string | undefined;

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
  // Website URL for link absolutization in filterResponse
  setWebsiteUrlForLinks(c.env.WEBSITE_URL);
  // Cloudflare MCP Mirror URL — MCP tools hosted in the cloud.
  // Optional: when unset, the Worker falls through normally.
  setCloudMcpConfig(c.env.MCP_CLOUD_URL, c.env.FORCE_CLOUD_MCP === "true", c.env.MOTHER_BRAIN_USER_TOKEN);
  if (c.env.MCP_CLOUD_URL) {
    console.log(`[cf-mcp-mirror] Mirror URL configured: ${c.env.MCP_CLOUD_URL.slice(0, 40)}...`);
  }
  // Encore API config for license key → visitor_id resolution.
  // Optional: when unset, license keys fall back to `license:{key}`.
  setEncoreApiConfig(c.env.ENCORE_API_URL, c.env.ENCORE_API_KEY);
  // Device resolver config (cross-device chat). Shares the same Encore API
  // URL + key as the license resolver.
  setDeviceResolverConfig(c.env.ENCORE_API_URL, c.env.ENCORE_API_KEY);
  // JWT session token verification secret (Dual-Path Auth).
  // Optional but required for JWT verification. When unset, JWT-bearing
  // requests are rejected with 503 (fail-closed). License-key and
  // anonymous paths work regardless.
  setJwtSecret(c.env.JWT_SECRET);
  setJwtIssuer(c.env.JWT_ISSUER);
  // Telegram bot token. Optional: when unset, the /webhook/telegram
  // endpoint returns 503 (graceful degradation).
  setTelegramBotToken(c.env.TELEGRAM_BOT_TOKEN);
  // Agent identity from settings (Sub-Agent user selection). Optional:
  // when unset, the static agent-card.json defaults are used.
  agentName = c.env.AGENT_NAME;
  agentDescription = c.env.AGENT_DESCRIPTION;
  // Agent skills (JSON string deployed from settings)
  try {
    agentSkills = c.env.AGENT_SKILLS_JSON
      ? JSON.parse(c.env.AGENT_SKILLS_JSON)
      : undefined;
  } catch {
    agentSkills = undefined;
  }
  // Register dynamic skill IDs from the deployed agent card so the
  // task handler accepts user-defined skills (not just hardcoded ones).
  if (agentSkills) registerSkillIds(agentSkills as { id: string }[]);
  agentProvider = c.env.AGENT_PROVIDER;
  // Agent URL — derive from request if not explicitly set
  agentUrl = c.env.AGENT_URL || new URL(c.req.url).origin;
  // Pass agent identity to the knowledge-base module so buildSystemPrompt()
  // uses the configured name instead of the hardcoded SOUL_MD defaults.
  setAgentIdentity(c.env.AGENT_NAME, c.env.AGENT_DESCRIPTION);
  // Neighbors — public identity config for the /neighbor endpoints
  // (card, knock handling, and the agent's neighbor tools).
  setNeighborConfig({
    agentUrl,
    name: c.env.AGENT_NAME,
    description: c.env.AGENT_DESCRIPTION,
    websiteUrl: c.env.WEBSITE_URL,
  });
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

// Build the agent card dynamically from env vars when set, otherwise
// fall back to the static agent-card.json defaults.
function getAgentCard() {
  const hasOverrides =
    agentName || agentDescription || agentSkills || agentUrl || agentProvider;
  if (!hasOverrides) return agentCard;
  return {
    ...agentCard,
    ...(agentName ? { name: agentName } : {}),
    ...(agentDescription ? { description: agentDescription } : {}),
    ...(agentUrl ? { url: agentUrl } : {}),
    ...(agentSkills ? { skills: agentSkills } : {}),
    ...(agentProvider
      ? { provider: { organization: agentProvider, url: agentUrl || "" } }
      : {}),
  };
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

// ============================================
// Neighbors — public agent-to-agent endpoint
// (no auth; rate-limited; read-only skills)
// ============================================

// Public Neighbor agent card — the no-auth identity other agents
// discover before knocking (Decision Log: same worker, F1).
app.get("/neighbor", (c) => {
  return c.json(buildNeighborCard());
});

// Knock — receive a message from another agent. Static answers for the
// 4 public skills; rate limited per IP; size-capped (F11: static-first).
app.post("/neighbor", async (c) => {
  const result = await handleNeighborKnock(c.req.raw);
  return c.json(result.body, result.status as 200 | 400 | 413 | 429);
});

// Registry — Step 0: seed entries (motherbrain.app + agentext.pro).
// Step 1 swaps this for NEAR onchain registry reads.
app.get("/neighbor/registry", (c) => {
  const neighbors = getNeighborRegistry();
  return c.json({
    protocol: "neighbors/0.1",
    count: neighbors.length,
    neighbors,
  });
});

// Health check
app.get("/", (c) => {
  return c.json({
    service: "A2A Endpoint",
    version: "1.0.0",
    agentCard: "/.well-known/agent-card.json",
    protocol: "A2A v1.0",
    transport: "JSON-RPC 2.0",
    status: "operational",
  });
});

// ============================================
// Telegram Webhook Endpoint
// ============================================
// Receives incoming messages from Telegram Bot API. Processes them through
// the same A2A pipeline as website messages (Gateway → AI → MCP tools) and
// sends the AI response back via Telegram's sendMessage API.
// Only active when TELEGRAM_BOT_TOKEN is configured.
app.post("/webhook/telegram", async (c) => {
  return handleTelegramWebhook(c.req.raw, c.env);
});

// Telegram bot info endpoint (used by Settings UI to verify the token)
app.get("/webhook/telegram/info", async (c) => {
  if (!isTelegramConfigured()) {
    return c.json({ ok: false, error: "Telegram bot token not configured" }, 503);
  }
  const { getTelegramBotInfo } = await import("./telegram");
  const info = await getTelegramBotInfo();
  return c.json(info);
});

/**
 * GET /website-mcp/tools — discover and return the website's MCP tools.
 * Used by the Settings UI to display available website tools.
 *
 * When the Website MCP Integration is blank (MCP_BASE_URL/MCP_API_KEY unset),
 * returns an empty list — the static website.* catalog is NEVER advertised
 * for a site that has no Website MCP server configured.
 */
app.get("/website-mcp/tools", async (c) => {
  if (!isWebsiteMcpConfigured()) {
    return c.json({
      configured: false,
      tools: [],
      message: "Website MCP Integration is not configured — no website tools are available.",
    });
  }
  try {
    // Dynamic discovery from the live MCP server (may differ per website).
    // HONEST RESULTS ONLY: whatever the server actually reports is what the
    // user sees. The static website.* catalog is NEVER returned here — a
    // mismatched/typo'd URL must surface as an error, not as a fake list of
    // tools from another website.
    const discovered = await discoverWebsiteTools();
    if (Array.isArray(discovered) && discovered.length > 0) {
      return c.json({ configured: true, tools: discovered });
    }
    return c.json({
      configured: true,
      tools: [],
      message: `No tools discovered from the MCP server. Check the MCP Server URL — discovery tried JSON-RPC tools/list and GET /mcp/tools against it and got nothing back.`,
    });
  } catch (err) {
    console.error("[website-mcp] Discovery failed:", err instanceof Error ? err.message : err);
    return c.json({
      configured: true,
      tools: [],
      message: `Discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

/**
 * GET /debug/mcp — diagnostic endpoint to check MCP env vars at runtime.
 */
app.get("/debug/mcp", async (c) => {
  const mcpBaseUrl = c.env.MCP_BASE_URL ?? "";
  const mcpApiKey = c.env.MCP_API_KEY ?? "";
  return c.json({
    mcpBaseUrl: { defined: !!mcpBaseUrl, length: mcpBaseUrl.length, value: mcpBaseUrl.slice(0, 30) },
    mcpApiKey: { defined: !!mcpApiKey, length: mcpApiKey.length, value: mcpApiKey.slice(0, 10) + "..." },
    configured: isWebsiteMcpConfigured(),
    gatewayUrl: c.env.GATEWAY_BASE_URL || "",
  });
});

/**
 * GET /debug/chat-test — end-to-end diagnostic for the Workers AI tool-calling path.
 *
 * Tests whether the configured Workers AI model actually returns `tool_calls`
 * when given the website MCP tools as function definitions. This isolates the
 * #1 suspected root cause: the model silently ignoring the tools parameter.
 *
 * Query params:
 *   ?message=... — the test message to send (default: "List all pages on the site.")
 *
 * Returns:
 *   - config:      current env vars and runtime state
 *   - tools:       how many website tools were prepared
 *   - pathAnalysis: which code path would be taken in callMotherBrainGateway
 *   - aiResponse:  the raw Workers AI response (keys, tool_calls presence, full result)
 *   - aiError:     any error from the Workers AI call
 */
app.get("/debug/chat-test", async (c) => {
  const userMessage = c.req.query("message") || "List all pages on the site.";
  const env = c.env;

  // Build website tools in OpenAI function format
  const websiteTools = getWebsiteTools();
  const cfTools = websiteTools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));

  const workersModel = env.CF_WORKER_MODEL || "@cf/zai-org/glm-4.7-flash";

  // Diagnostic payload (built incrementally)
  const diag: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    config: {
      mcpConfigured: isWebsiteMcpConfigured(),
      mcpBaseUrl: (env.MCP_BASE_URL || "").slice(0, 30) + "...",
      mcpApiKeyLength: (env.MCP_API_KEY || "").length,
      gatewayUrl: env.GATEWAY_BASE_URL || "not set",
      gatewayTokenLength: (env.MOTHER_BRAIN_GATEWAY_TOKEN || "").length,
      aiBindingAvailable: !!env.AI,
      cfWorkerModel: env.CF_WORKER_MODEL || "(defaults to @cf/zai-org/glm-4.7-flash)",
      forceCfWorker: env.FORCE_CF_WORKER || "false",
    },
    tools: {
      count: websiteTools.length,
      names: websiteTools.map((t) => t.name),
    },
    pathAnalysis: {
      // 1. forceCfWorker path — skips Gateway entirely
      pathForceCfWorker:
        env.FORCE_CF_WORKER === "true" && !!env.AI,
      // 2. No Gateway token path — uses Workers AI
      pathNoGatewayToken: !env.MOTHER_BRAIN_GATEWAY_TOKEN,
      // 3. Website MCP configured path — Workers AI with website tools
      pathWorkersAIWithWebsiteTools:
        isWebsiteMcpConfigured() && !!env.AI && !!env.MOTHER_BRAIN_GATEWAY_TOKEN,
      // 4. Gateway MCP path — falls through to Gateway (tools may be stripped)
      pathGatewayMCP:
        !isWebsiteMcpConfigured() && !!env.MOTHER_BRAIN_GATEWAY_TOKEN,
    },
  };

  // Test: Direct Workers AI call with website tools → does it return tool_calls?
  if (env.AI) {
    try {
      console.log(
        `[debug/chat-test] Calling Workers AI "${workersModel}" with ${cfTools.length} tools`,
      );
      const aiResult = await env.AI.run(workersModel, {
        messages: [
          {
            role: "system",
            content:
              "You are a helpful website assistant. You have access to website tools. " +
              "When the user asks about pages or content, call the appropriate tool.",
          },
          { role: "user", content: userMessage },
        ],
        max_tokens: 1024,
        tools: cfTools,
      });

      const resultObj = aiResult as Record<string, unknown>;
      diag.aiResponse = {
        model: workersModel,
        rawKeys: Object.keys(resultObj),
        hasToolCalls: "tool_calls" in resultObj,
        hasResponse: "response" in resultObj,
        result: aiResult,
      };

      console.log(
        `[debug/chat-test] ✅ Workers AI responded. Keys: [${Object.keys(resultObj).join(", ")}]`,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[debug/chat-test] ❌ Workers AI call failed: ${errMsg}`);
      diag.aiError = errMsg;
    }
  } else {
    diag.aiError = "AI binding not available (env.AI is undefined)";
  }

  return c.json(diag);
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
        let customerId: string | null = null;
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
              customerId = claims.sub;
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
          }
        }

        // 2.5 Generic "logged-in visitor" metadata — vendor-neutral.
        // Any website with its own auth can tell the agent this visitor is a
        // registered user WITHOUT Mother Brain licenses or Encore. The site
        // sends metadata: { authenticated: true, user_id: "...", email: "..." }.
        // The user_id is stored as customer_id (generic — never tied to license
        // semantics). For higher security, websites should ALSO send a session
        // token (verified via JWT_SECRET above); this path trusts the site's
        // own auth layer for the convenience case.
        const metaAuthenticated = !!params.metadata?.authenticated;
        const metaUserId = (params.metadata?.user_id as string) || undefined;
        if (!customerId && metaAuthenticated && metaUserId) {
          customerId = metaUserId;
          if (!visitorId) visitorId = metaUserId;
          console.log(
            `[auth] Authenticated metadata → customerId ${customerId} (generic logged-in visitor)`,
          );
        }

        // 3. Neither JWT, license key, nor authenticated metadata → anonymous
        //    (visitorId only, customerId null)

        // ── Smart Backfill: Claim anonymous messages for this customer ──
        // When a customer is identified (via JWT or license key), claim any
        // unclaimed anonymous messages on this device. Only updates rows
        // where customer_id IS NULL — messages already owned by another
        // customer are NOT touched (prevents cross-account contamination
        // on shared computers).
        if (customerId && visitorId) {
          try {
            const claimed = (await db.rpc("claim_anonymous_messages", {
              p_visitor_id: visitorId,
              p_customer_id: customerId,
            })) as number;
            if (claimed > 0) {
              console.log(
                `[auth] Smart backfill: claimed ${claimed} anonymous messages for visitor ${visitorId} → customer ${customerId}`,
              );
            }
          } catch (backfillErr) {
            console.warn(
              "[auth] Smart backfill failed:",
              backfillErr instanceof Error ? backfillErr.message : backfillErr,
            );
          }
        }

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

        // --- Task Reuse: find the requester's existing conversation ---
        // Priority: customer_id (logged-in, guaranteed unique) > visitor_id (anonymous nonce) >
        // task_messages.customer_id (cross-browser for pre-migration tasks).
        //
        // SECURITY (2026-07-17): Previously resolved ONLY by visitor_id, which was
        // a Broprint.js fingerprint. Two browsers with the same rendering engine
        // collided, merging their chat sessions and leaking private history.
        // Now: logged-in users resolve by customer_id (unique per account);
        // anonymous users resolve by visitor_id (crypto.randomUUID() nonce).
        if (!taskId) {
          // Priority 1: Logged-in user — resolve by customer_id
          if (customerId) {
            try {
              const tasksByCustomer = await db
                .from("tasks")
                .then((q) =>
                  q
                    .select("id")
                    .eq("customer_id", customerId)
                    .order("created_at", false)
                    .limit(1)
                    .get<{ id: string }>(),
                );
              if (tasksByCustomer && tasksByCustomer.length > 0) {
                taskId = tasksByCustomer[0].id;
              }
            } catch {
              // DB error — fall through to visitor_id lookup
            }
          }

          // Priority 2: Resolve by visitor_id (anonymous nonce, OR logged-in
          // user whose task was created before they logged in — migration case)
          if (!taskId && visitorId) {
            try {
              const tasksByVisitor = await db
                .from("tasks")
                .then((q) =>
                  q
                    .select("id")
                    .eq("visitor_id", visitorId)
                    .order("created_at", false)
                    .limit(1)
                    .get<{ id: string }>(),
                );
              if (tasksByVisitor && tasksByVisitor.length > 0) {
                taskId = tasksByVisitor[0].id;

                // Migration: if logged-in but task has no customer_id, backfill it.
                // This links the anonymous task to the customer account so future
                // lookups by customer_id find it directly.
                if (customerId) {
                  await db
                    .from("tasks")
                    .then((q) => q.eq("id", taskId).update({ customer_id: customerId }));
                  console.log(
                    `[visitor] Task ${taskId}: migrated visitor_id → customer_id for ${customerId}`,
                  );
                }
              }
            } catch {
              // DB error — fall through to Priority 3
            }
          }

          // Priority 3: Logged-in user on a NEW browser — find their task via
          // task_messages.customer_id. This handles the case where the user's
          // existing task was created before migration 006 (no customer_id on
          // the task row), and they're now on a different browser (different
          // visitor_id). We look up which task has their messages, adopt it,
          // and backfill customer_id.
          if (!taskId && customerId) {
            try {
              const tasksByMsg = await db
                .from("task_messages")
                .then((q) =>
                  q
                    .select("task_id")
                    .eq("customer_id", customerId)
                    .order("created_at", false)
                    .limit(1)
                    .get<{ task_id: string }>(),
                );
              if (tasksByMsg && tasksByMsg.length > 0) {
                taskId = tasksByMsg[0].task_id;
                // Backfill customer_id on the task for future direct lookups
                await db
                  .from("tasks")
                  .then((q) => q.eq("id", taskId).update({ customer_id: customerId }));
                console.log(
                  `[visitor] Task ${taskId}: found via task_messages, backfilled customer_id for ${customerId}`,
                );
              }
            } catch {
              // DB error — create new task below
            }
          }
        }

        // Still no taskId — create a new task (first-time visitor).
        // Uses upsert with a pre-generated UUID to prevent duplicate tasks
        // from concurrent requests (the SELECT-then-INSERT race condition).
        // Resilient: license_key / customer_id columns are optional (later
        // migrations) — a fresh Supabase project with only the base schema
        // still works (identity columns degrade gracefully).
        if (!taskId) {
          const newTaskId = crypto.randomUUID();
          const newTasks = await insertResilient(
            db,
            "tasks",
            {
              id: newTaskId,
              status: "submitted",
              skill_id: params.skillId || null,
              visitor_id: visitorId || null,
              license_key: licenseKey || null,
              customer_id: customerId,
              metadata: params.metadata || {},
              history: [],
            },
            ["license_key", "customer_id"],
            {
              id: newTaskId,
              status: "submitted",
              skill_id: params.skillId || null,
              visitor_id: visitorId || null,
              metadata: params.metadata || {},
              history: [],
            },
          );
          const newTask = Array.isArray(newTasks) ? newTasks[0] : null;
          taskId = (newTask as { id?: string } | null)?.id;

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
            ai: env.AI,
            cfWorkerModel: env.CF_WORKER_MODEL,
            mcpCloudUrl: env.MCP_CLOUD_URL,
            forceCloudMcp: env.FORCE_CLOUD_MCP === "true",
            cfMaxTokens: env.CF_MAX_TOKENS ? parseInt(env.CF_MAX_TOKENS) : undefined,
            cfTemperature: env.CF_TEMPERATURE ? parseFloat(env.CF_TEMPERATURE) : undefined,
          },
          licenseKey,
          customerId,
          env.CF_WORKER_MODEL,
          env.FORCE_CF_WORKER === "true",
          env.WEBSITE_URL || agentUrl,
        );

        // ── Entity Tracking ──
        // Auto-detect entity type and source, then upsert into entities table.
        // This powers the Entities screen in the CRM view.
        if (visitorId) {
          // Detect source: in-app support messages have license_key or come
          // from the MB app; website messages have visitor_id from Broprint.js
          const entitySource = licenseKey ? "in-app" : "website";

          // Detect entity type:
          // - customer: has customer_id (JWT or license key resolved)
          // - ai_bot: A2A request from another agent (has agent card headers)
          // - visitor: anonymous website visitor
          const agentCardHeader = c.req.header("X-A2A-Agent-Card");
          const entityType = agentCardHeader
            ? "ai_bot"
            : customerId
              ? "customer"
              : "visitor";

          try {
            await db.rpc("upsert_entity", {
              p_visitor_id: visitorId,
              p_customer_id: customerId ?? undefined,
              p_entity_type: entityType,
              p_source: entitySource,
              p_agent_card: agentCardHeader || undefined,
            });
          } catch (entityErr) {
            console.warn(
              "[entity] Failed to upsert entity:",
              entityErr instanceof Error ? entityErr.message : entityErr,
            );
          }
        }

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

        // ── Authorization: verify the caller owns this task ──
        const taskRows = await db
          .from("tasks")
          .then((q) =>
            q
              .select("visitor_id, customer_id")
              .eq("id", params.taskId)
              .limit(1)
              .get<{ visitor_id: string | null; customer_id: string | null }>(),
          );

        if (!taskRows || taskRows.length === 0) {
          return c.json(jsonRpcError(-32001, "Task not found", body.id!));
        }

        const taskOwner = taskRows[0];

        // Resolve caller identity from JWT (same pattern as message/send)
        let callerCustomerId: string | null = null;
        let callerVisitorId: string | null = null;

        const cancelAuthHeader = c.req.header("Authorization");
        const jwtToken = cancelAuthHeader?.startsWith("Bearer ")
          ? cancelAuthHeader.slice(7).trim()
          : undefined;

        if (jwtToken && isJwtSecretConfigured()) {
          try {
            const claims = await verifyJwt(jwtToken);
            if (claims?.sub) callerCustomerId = String(claims.sub);
            if (claims?.vid) callerVisitorId = claims.vid as string;
          } catch {
            // JWT invalid — deny below
          }
        }

        // Ownership check: customer_id (strongest) or visitor_id (anonymous)
        const isOwner =
          (callerCustomerId &&
            taskOwner.customer_id &&
            callerCustomerId === String(taskOwner.customer_id)) ||
          (callerVisitorId &&
            taskOwner.visitor_id &&
            callerVisitorId === taskOwner.visitor_id);

        if (!isOwner) {
          return c.json(
            jsonRpcError(
              -32000,
              "Forbidden: you do not own this task",
              body.id!,
            ),
            403,
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

        // ── Cross-Device Chat ──
        // If the request has a valid JWT, resolve ALL visitor_ids for the
        // customer (primary device + paired devices). Query history across
        // all of them so the user sees the same conversation on any device.
        let historyVisitorIds: string[] = [params.visitor_id];

        const authHeader = c.req.header("Authorization");
        const jwtToken = authHeader?.startsWith("Bearer ")
          ? authHeader.slice(7).trim()
          : undefined;

        if (jwtToken && isJwtSecretConfigured()) {
          try {
            const claims = await verifyJwt(jwtToken);
            if (claims) {
              const cid = Number(claims.sub);
              const resolution = await resolveVisitorIds(
                cid,
                params.visitor_id,
              );
              if (resolution.visitorIds.length > 0) {
                historyVisitorIds = resolution.visitorIds;
                console.log(
                  `[history] Cross-device: querying ${historyVisitorIds.length} visitor_ids for customer ${cid}`,
                );
              }
            }
          } catch (err) {
            console.warn(
              "[history] JWT verification failed, using single visitor_id:",
              err instanceof Error ? err.message : err,
            );
          }
        }

        // Fetch recent tasks across ALL visitor_ids for this customer
        // (or just the current visitor_id if no JWT / single device).
        // When a customer_id is known (JWT present), filter by it to prevent
        // cross-account contamination on shared computers.
        let historyCustomerId: number | null = null;
        if (jwtToken && isJwtSecretConfigured()) {
          try {
            const claims = await verifyJwt(jwtToken);
            if (claims) {
              historyCustomerId = Number(claims.sub);
            }
          } catch {
            // already logged above
          }
        }

        let recentTasks;
        if (historyCustomerId) {
          // Authenticated: query tasks for this customer only (prevents
          // shared-computer cross-contamination)
          recentTasks = await db
            .from("tasks")
            .then((q) =>
              q
                .select("id,status,created_at")
                .in("visitor_id", historyVisitorIds)
                .eq("customer_id", String(historyCustomerId))
                .order("created_at", false)
                .limit(limit)
                .get<{ id: string; status: string; created_at: string }>(),
            );
        } else {
          // Anonymous: query by visitor_id only
          recentTasks = await db
            .from("tasks")
            .then((q) =>
              q
                .select("id,status,created_at")
                .in("visitor_id", historyVisitorIds)
                .order("created_at", false)
                .limit(limit)
                .get<{ id: string; status: string; created_at: string }>(),
            );
        }

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
          allVisitorIds: historyVisitorIds,
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
      // Agent Skill Suggestions (AI-generated)
      // ============================================

      case "agent/suggest-skills": {
        const params = body.params as {
          currentSkills?: { id: string; name: string; description: string }[];
          agentDescription?: string;
        };

        // Build website tools list — only tools actually discovered from
        // the configured website's MCP server (honest; never the static
        // motherbrain.app catalog).
        const websiteTools: { name: string; description: string }[] = [];
        if (isWebsiteMcpConfigured()) {
          const tools = await getRuntimeWebsiteTools();
          for (const t of tools) {
            websiteTools.push({
              name: t.name,
              description: t.description || "",
            });
          }
        }

        const suggestions = await generateSkillSuggestions(
          params?.currentSkills || [],
          params?.agentDescription || "",
          websiteTools,
          env.MOTHER_BRAIN_GATEWAY_TOKEN,
          env.AI_MODEL || "default",
        );

        result = { suggestions };
        break;
      }

      // ============================================
      // Entity Management (CRM / Entities screen)
      // ============================================

      case "entities/list": {
        const params = body.params as {
          entity_type?: string;
          source?: string;
          status?: string;
          tag?: string;
          sort?: string; // "name" | "date" | "status"
          limit?: number;
          offset?: number;
        };

        const entLimit = Math.min(params?.limit || 50, 200);
        const entOffset = params?.offset || 0;
        const sortOrder =
          params?.sort === "name"
            ? "entity_name"
            : params?.sort === "status"
              ? "status"
              : "last_active";

        const entities = await db.from("entities").then((q) => {
          let qb = q.select(
            "visitor_id,customer_id,entity_name,entity_type,source,agent_card,first_seen,last_active,message_count,tags,status",
          );
          if (params?.entity_type)
            qb = qb.eq("entity_type", params.entity_type);
          if (params?.source) qb = qb.eq("source", params.source);
          if (params?.status) qb = qb.eq("status", params.status);
          return qb
            .order(sortOrder, params?.sort === "name")
            .limit(entLimit)
            .get<Record<string, unknown>[]>();
        });

        // Note: tag filtering would need .contains() which our client doesn't support yet.
        // For now, filter tags client-side in the UI.

        result = { entities: entities || [], offset: entOffset };
        break;
      }

      case "entities/update_tags": {
        const params = body.params as { visitor_id?: string; tags?: string[] };
        if (!params?.visitor_id) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: visitor_id is required",
              body.id!,
            ),
          );
        }
        await db.rpc("update_entity_tags", {
          p_visitor_id: params.visitor_id,
          p_tags: params.tags || [],
        });
        result = { success: true };
        break;
      }

      case "entities/update_status": {
        const params = body.params as { visitor_id?: string; status?: string };
        if (!params?.visitor_id || !params?.status) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: visitor_id and status are required",
              body.id!,
            ),
          );
        }
        await db.rpc("update_entity_status", {
          p_visitor_id: params.visitor_id,
          p_status: params.status,
        });
        result = { success: true };
        break;
      }

      case "entities/update_name": {
        const params = body.params as { visitor_id?: string; name?: string };
        if (!params?.visitor_id || !params?.name) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: visitor_id and name are required",
              body.id!,
            ),
          );
        }
        await db.rpc("update_entity_name", {
          p_visitor_id: params.visitor_id,
          p_name: params.name,
        });
        result = { success: true };
        break;
      }

      // ============================================
      // Message Tagging
      // ============================================

      case "messages/update_tags": {
        const params = body.params as { message_id?: string; tags?: string[] };
        if (!params?.message_id) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: message_id is required",
              body.id!,
            ),
          );
        }
        await db.rpc("update_message_tags", {
          p_message_id: params.message_id,
          p_tags: params.tags || [],
        });
        result = { success: true };
        break;
      }

      case "messages/tagged": {
        const params = body.params as { visitor_id?: string };
        if (!params?.visitor_id) {
          return c.json(
            jsonRpcError(
              -32602,
              "Invalid params: visitor_id is required",
              body.id!,
            ),
          );
        }
        const taggedMsgs = await db.rpc("get_tagged_messages", {
          p_visitor_id: params.visitor_id,
        });
        result = { messages: taggedMsgs || [] };
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
    console.error(
      "A2A handler error:",
      error instanceof Error ? error.message : error,
      error instanceof Error ? error.stack : undefined,
    );
    return c.json(
      jsonRpcError(
        -32603,
        "An internal error occurred. Please try again later.",
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

// ── Task state helpers (moved from task-handler.ts to avoid esbuild parse issues) ──

async function getTaskState(
  taskId: string,
  db: SupabaseClient,
): Promise<TaskState | null> {
  const tasks = await db.from("tasks").then((q) =>
    q.select("*").eq("id", taskId).get<{
      id: string;
      status: TaskStatus;
      history: Array<{ role: string; parts: Part[]; timestamp?: string }>;
      metadata: Record<string, unknown>;
    }>(),
  );
  if (!tasks || tasks.length === 0) return null;
  const task = tasks[0];
  return {
    taskId: task.id,
    status: task.status,
    history: task.history,
    metadata: task.metadata,
  };
}

async function cancelTask(
  taskId: string,
  db: SupabaseClient,
): Promise<TaskState | null> {
  const updated = await db
    .from("tasks")
    .then((q) => q.eq("id", taskId).update({ status: "canceled" }));
  if (!updated || updated.length === 0) return null;
  return {
    taskId: updated[0].id,
    status: "canceled",
    history: updated[0].history,
    metadata: updated[0].metadata,
  };
}

export default app;
