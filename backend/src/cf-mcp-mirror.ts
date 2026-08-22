/**
 * CF MCP Mirror — Cloudflare-hosted MCP Gateway Proxy.
 *
 * Provides the same Mother Brain MCP tools (search_codebase, search_memories,
 * etc.) hosted on Cloudflare Workers, acting as a cloud-based alternative to
 * the local Mother Brain Gateway.
 *
 * Configuration is optional — when MCP_CLOUD_URL is unset, the Worker
 * ignores this path entirely (graceful degradation — no behavior change).
 *
 * Endpoint: GET {MCP_CLOUD_URL} — returns status + tool list
 * Response format:
 *   {
 *     "status": "ok",
 *     "service": "mother-brain-mcp-cloud",
 *     "version": "1.0.0-beta.8",
 *     "tunnel": "connected",
 *     "tools": ["search_codebase", "search_memories", ...],
 *     "timestamp": "..."
 *   }
 */

// Module-level config — set at runtime from worker env (see index.ts middleware).
let MCP_CLOUD_URL = "";
let FORCE_CLOUD_MCP = false;
// User access token for auth — same mb_ token as MOTHER_BRAIN_USER_TOKEN
let USER_TOKEN = "";

export function setCloudMcpConfig(
  mirrorUrl?: string,
  forceCloudMcp?: boolean,
  userToken?: string,
): void {
  if (mirrorUrl) {
    MCP_CLOUD_URL = mirrorUrl.replace(/\/$/, ""); // strip trailing slash
  }
  if (forceCloudMcp !== undefined) {
    FORCE_CLOUD_MCP = forceCloudMcp;
  }
  if (userToken !== undefined) {
    USER_TOKEN = userToken;
  }
}

export function isCloudMcpConfigured(): boolean {
  return MCP_CLOUD_URL.length > 0;
}

export function getCloudMcpUrl(): string {
  return MCP_CLOUD_URL;
}

export function getForceCloudMcp(): boolean {
  return FORCE_CLOUD_MCP;
}

export interface CfMcpMirrorResponse {
  status: string;
  service: string;
  version: string;
  tunnel: string;
  tools: string[];
  timestamp: string;
}

/**
 * Proactively health-check the CF MCP Mirror.
 * Returns the tools list if reachable, null if unreachable.
 *
 * The mirror exposes two surfaces and we accept EITHER configured URL:
 *   - {root}   → GET returns {status, tools: string[]}          (health/status)
 *   - {root}/mcp → GET returns JSON-RPC {result:{tools:[{name,...}]}} (call surface)
 * If the configured URL returns the wrong shape, we retry the other surface.
 */
export async function checkCloudMcpHealth(): Promise<string[] | null> {
  if (!isCloudMcpConfigured()) return null;

  const base = MCP_CLOUD_URL.replace(/\/$/, "");
  const candidates = base.endsWith("/mcp")
    ? [base, base.replace(/\/mcp$/, "")]
    : [base, `${base}/mcp`];

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) continue;
      const data = await response.json();

      // Format A: root status → { status, tools: string[] }
      if (Array.isArray(data.tools) && data.tools.every((t: unknown) => typeof t === "string")) {
        console.log(
          `[cf-mcp-mirror] ✅ Mirror reachable — ${data.tools.length} tools available (${url})`,
        );
        return data.tools as string[];
      }

      // Format B: JSON-RPC → { result: { tools: [{ name, description, ... }] } }
      const rpcTools = data?.result?.tools;
      if (Array.isArray(rpcTools)) {
        const names = rpcTools
          .map((t: { name?: string }) => t?.name)
          .filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
        if (names.length > 0) {
          console.log(
            `[cf-mcp-mirror] ✅ Mirror reachable — ${names.length} tools available (${url}, JSON-RPC)`,
          );
          return names;
        }
      }
    } catch {
      /* try next candidate */
    }
  }

  console.warn(
    `[cf-mcp-mirror] ⚠️ Mirror health check failed on both ${candidates.join(" | ")}`,
  );
  return null;
}

/**
 * The mirror exposes two surfaces:
 *   - {root}         → GET health/status (has `tools: string[]` for discovery)
 *   - {root}/mcp     → POST JSON-RPC (tools/list, tools/call — real execution)
 *
 * Discovery (checkCloudMcpHealth) must use the root; execution must use /mcp.
 * This helper derives the JSON-RPC surface from the configured mirror URL.
 */
function getMcpRpcUrl(): string {
  const base = MCP_CLOUD_URL.replace(/\/$/, "");
  return base.endsWith("/mcp") ? base : `${base}/mcp`;
}

/**
 * Execute a single MCP tool via the CF MCP Mirror.
 *
 * The mirror acts as a cloud proxy to the Mother Brain Gateway's MCP tools.
 * Tool execution follows the same JSON-RPC pattern as the Gateway:
 *   POST {mirrorUrl}/mcp
 *   Body: { "jsonrpc": "2.0", "method": "tools/call", "params": { name, arguments }, "id": 1 }
 *
 * Returns the tool result as a string (or error message).
 */
export async function callCloudMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (!isCloudMcpConfigured()) {
    return `Tool error: CF MCP Mirror is not configured (MCP_CLOUD_URL is unset).`;
  }

  const rpcUrl = getMcpRpcUrl();

  try {
    // Method 1: Try JSON-RPC tools/call format (same as Gateway)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mother-Brain-Invention": "a2a-agent",
        "X-Mother-Brain-Source": "a2a-agent",
        ...(USER_TOKEN ? { "Authorization": `Bearer ${USER_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: Date.now(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as {
        result?: { content?: Array<{ type: string; text?: string }> };
        error?: { message?: string };
      };

      if (data.error) {
        return `Tool error: CF MCP Mirror ${toolName} failed: ${data.error.message || "Unknown error"}`;
      }

      // Standard MCP result format
      if (data.result?.content) {
        return data.result.content
          .filter((c: { type: string; text?: string }) => c.type === "text" && c.text)
          .map((c: { type: string; text?: string }) => c.text!)
          .join("\n");
      }

      if (data.result) {
        if (typeof data.result === "string") return data.result;
        return JSON.stringify(data.result);
      }

      return JSON.stringify(data);
    }

    // Method 2: Try simple POST format (mirror-specific)
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
    const simpleResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: toolName,
        args,
      }),
      signal: controller2.signal,
    });
    clearTimeout(timeoutId2);

    if (simpleResponse.ok) {
      const simpleData = await simpleResponse.json();
      if (simpleData.result) {
        if (typeof simpleData.result === "string") return simpleData.result;
        return JSON.stringify(simpleData.result);
      }
      return JSON.stringify(simpleData);
    }

    // Try GET — mirror might only support GET with query params
    const controller3 = new AbortController();
    const timeoutId3 = setTimeout(() => controller3.abort(), 5000);
    const getResponse = await fetch(
      `${rpcUrl}?tool=${encodeURIComponent(toolName)}&args=${encodeURIComponent(JSON.stringify(args))}`,
      { signal: controller3.signal },
    );
    clearTimeout(timeoutId3);
    if (getResponse.ok) {
      const text = await getResponse.text();
      try {
        const parsed = JSON.parse(text);
        if (parsed.result) return typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result);
        return JSON.stringify(parsed);
      } catch {
        return text;
      }
    }

    const errText = await response.text().catch(() => "");
    return `Tool error: CF MCP Mirror ${toolName} returned ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[cf-mcp-mirror] ${toolName} failed: ${msg}`);
    return `Tool error: CF MCP Mirror ${toolName} unreachable — ${msg}`;
  }
}
