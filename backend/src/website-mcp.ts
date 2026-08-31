/**
 * Website MCP Client — connects to the Mother Brain website MCP server
 * (motherbrain.app) for website content, navigation, and visitor account tools.
 *
 * Endpoint: POST {MCP_BASE_URL}/mcp/invoke
 * Auth:     apiKey field in body (legacy) + Zero Trust headers (belt-and-suspenders)
 *
 * This is SEPARATE from the Project MCP Gateway (mcp.ts), which provides
 * project knowledge tools (search_codebase, etc.). The website MCP server
 * provides tools like website.read_page, website.navigate, website.get_account.
 *
 * Configuration is optional — when MCP_BASE_URL or MCP_API_KEY is unset,
 * website tools are not exposed to the LLM (graceful degradation).
 *
 * Tool catalog (13 tools) last verified via GET /mcp/tools on 2026-06-21.
 * Source: https://api.motherbrain.app/mcp/tools
 */

// Module-level config — set at runtime from worker env (see index.ts middleware).
// Follows the same pattern as GATEWAY_URL/setGatewayUrl in mcp.ts.
let MCP_BASE_URL = "";
let MCP_API_KEY = "";

export function setWebsiteMcpConfig(baseUrl?: string, apiKey?: string): void {
  if (baseUrl) {
    let b = baseUrl.replace(/\/+$/, ""); // strip trailing slash(es)
    // If the operator configured a URL that already carries the MCP route
    // (e.g. "https://host/mcp"), do NOT append "/mcp/..." again later —
    // that produced "https://host/mcp/mcp/tools" (404 → bogus fallback).
    MCP_BASE_URL = b;
  }
  if (apiKey) MCP_API_KEY = apiKey;
}

function hasMcpRoute(): boolean {
  return /\/mcp$/.test(MCP_BASE_URL);
}

export function isWebsiteMcpConfigured(): boolean {
  return MCP_BASE_URL.length > 0 && MCP_API_KEY.length > 0;
}

// ---------- Tool Catalog (default static fallback) ----------
// These are the tools the motherbrain.app website MCP server exposes.
// Defined statically as a fallback when dynamic discovery fails.
// At runtime, discoverWebsiteTools() calls GET {MCP_BASE_URL}/mcp/tools
// to discover the ACTUAL tools available — which may differ per website.

export interface WebsiteTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

const WEBSITE_TOOLS: WebsiteTool[] = [
  {
    name: "website.list_pages",
    description: "List all public pages on motherbrain.app.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "website.read_page",
    description:
      "Read the full markdown content of a page by slug (e.g., 'features', 'pricing', 'docs').",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "The page slug (e.g., 'features', 'pricing', 'test-page')",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "website.create_page",
    description:
      "Create a private page for the current visitor. Stored as markdown, viewable at /p/:slug.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "URL slug" },
        title: { type: "string", description: "Page title" },
        content: {
          type: "string",
          description: "Full page content in Markdown",
        },
        metadata: { type: "string", description: "Optional metadata (JSON)" },
      },
      required: ["slug", "title", "content"],
    },
  },
  {
    name: "website.edit_page",
    description: "Update a generated page. System pages are read-only.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The page slug to edit" },
        title: { type: "string", description: "New title" },
        content: { type: "string", description: "New markdown content" },
        metadata: { type: "string", description: "Metadata to merge" },
      },
      required: ["slug"],
    },
  },
  {
    name: "website.delete_page",
    description: "Delete a generated page. System pages cannot be deleted.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The page slug to delete" },
      },
      required: ["slug"],
    },
  },
  {
    name: "website.navigate",
    description:
      "Generate a navigation action — returns a URL for the chat to render as a clickable link. Use when Mother wants to guide the visitor to a specific page.",
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description:
            "The route to navigate to (e.g., '/features', '/pricing', '/dashboard')",
        },
        label: {
          type: "string",
          description: "Display label for the link (e.g., 'View Features')",
        },
      },
      required: ["route"],
    },
  },
  {
    name: "website.highlight",
    description:
      "Find a heading on a page and return its DOM selector for scroll-to-highlight. Mother reads the page content, identifies the section, and the chat UI scrolls to it with a visual pulse. If no target is given, returns all available headings.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The page slug (e.g., 'features')",
        },
        target: {
          type: "string",
          description:
            "The heading text to find (e.g., 'AI Memory'). Fuzzy matched against heading text.",
        },
        navigate: {
          type: "boolean",
          description:
            "If true (default), also navigates to the page before highlighting",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "website.get_visitor_status",
    description:
      "Check if a visitor is a customer. Returns customer status, plan, license info. Call this at conversation start to personalize.",
    parameters: {
      type: "object",
      properties: {
        visitorId: {
          type: "string",
          description: "The Broprint.js visitor ID (vid_xxx)",
        },
      },
      required: ["visitorId"],
    },
  },
  {
    name: "website.get_account",
    description:
      "Get full account details: licenses, subscription, email. Only for linked customers.",
    parameters: {
      type: "object",
      properties: {
        visitorId: {
          type: "string",
          description: "The Broprint.js visitor ID",
        },
      },
      required: ["visitorId"],
    },
  },
  {
    name: "website.update_account",
    description:
      "Update customer account fields. Currently supports updating name. Email changes require Stripe billing portal.",
    parameters: {
      type: "object",
      properties: {
        visitorId: {
          type: "string",
          description: "The Broprint.js visitor ID",
        },
        name: { type: "string", description: "New display name" },
      },
      required: ["visitorId"],
    },
  },
  {
    name: "website.get_referrals",
    description:
      "Get referral code, sign-up count, and commission info for a customer.",
    parameters: {
      type: "object",
      properties: {
        visitorId: {
          type: "string",
          description: "The Broprint.js visitor ID",
        },
      },
      required: ["visitorId"],
    },
  },
  {
    name: "website.list_inventions",
    description: "List all available content from the website registry.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "website.analytics",
    description:
      "View page view analytics. Returns total views, unique visitors, and top pages. Optionally filter by slug and time period.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Filter to a specific page slug",
        },
        days: {
          type: "number",
          description: "Time period in days (default 30, max 365)",
        },
      },
      required: [],
    },
  },
];

/**
 * Returns the fallback website tools in OpenAI function format.
 * Used when dynamic discovery fails or the MCP server is unreachable.
 */
export function getWebsiteTools(): WebsiteTool[] {
  return WEBSITE_TOOLS;
}

// ---------- Runtime tool resolution (honest + cached) ----------
// Chat paths need a fast list, but discovery is network-bound. Cache the
// DISCOVERED tools (never the static fallback) for a short TTL; failures
// cache an empty list so the LLM simply gets no website tools rather than
// tools from the wrong website.
let runtimeToolsCache: WebsiteTool[] = [];
let runtimeToolsCachedAt = 0;
const RUNTIME_TOOLS_TTL = 5 * 60 * 1000;

export async function getRuntimeWebsiteTools(): Promise<WebsiteTool[]> {
  if (!isWebsiteMcpConfigured()) return [];
  if (Date.now() - runtimeToolsCachedAt < RUNTIME_TOOLS_TTL) {
    return runtimeToolsCache;
  }
  const raw = await discoverWebsiteTools(); // [] on failure — by design
  // Normalize to the OpenAI function-calling shape the LLM paths expect:
  // standard MCP servers report `inputSchema`, but tool definitions sent to
  // the model must carry `parameters`. Without this the router drops or
  // mangles the tool (source-of-truth bug #3).
  const tools: WebsiteTool[] = raw.map((t) => ({
    name: t.name,
    description: t.description || "",
    parameters: {
      type: "object",
      properties: (t as { inputSchema?: { properties?: Record<string, unknown> } }).inputSchema?.properties || (t.parameters as { properties?: Record<string, unknown> })?.properties || {},
      required: (t as { inputSchema?: { required?: string[] } }).inputSchema?.required || (t.parameters as { required?: string[] })?.required || [],
    },
  }));
  runtimeToolsCache = tools;
  runtimeToolsCachedAt = Date.now();
  return tools;
}

/**
 * Dynamically discover website MCP tools at runtime.
 *
 * Calls GET {MCP_BASE_URL}/mcp/tools to discover the actual tools the
 * website's MCP server exposes. Falls back to the hardcoded tool list
 * if the discovery endpoint is unreachable.
 *
 * This is the PRIMARY source of tools — the hardcoded list is only a
 * fallback cache for when the MCP server can't be reached. Each website
 * may have different tools depending on their MCP server
 * implementation.
 *
 * Returns the discovered tools (or fallback defaults).
 */
export async function discoverWebsiteTools(): Promise<WebsiteTool[]> {
  if (!isWebsiteMcpConfigured()) return [];

  // Candidate bases: the configured URL as-is, plus the classic
  // "/mcp"-suffixed form for operators who configured a bare host.
  const bases = hasMcpRoute()
    ? [MCP_BASE_URL, `${MCP_BASE_URL.replace(/\/mcp$/, "")}`]
    : [MCP_BASE_URL, `${MCP_BASE_URL}/mcp`];

  try {
    // Method 1: GET /mcp/tools (motherbrain.app format — direct JSON array)
    for (const base of bases) {
      try {
        const response = await fetch(`${base}/mcp/tools`, {
          method: "GET",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${MCP_API_KEY}`,
            "Content-Type": "application/json",
          },
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data) && data.length > 0) {
            console.log(`[website-mcp] Discovered ${data.length} tools via GET ${base}/mcp/tools`);
            return data as WebsiteTool[];
          }
          if (data && Array.isArray(data.tools) && data.tools.length > 0) {
            console.log(`[website-mcp] Discovered ${data.tools.length} tools via GET ${base}/mcp/tools (wrapped)`);
            return data.tools as WebsiteTool[];
          }
        }
      } catch {}
    }

    // Method 2: POST JSON-RPC tools/list — at the configured URL itself
    // (standard MCP servers serve JSON-RPC at the /mcp route), at /mcp/invoke,
    // and at /mcp (classic form).
    const rpcCandidates = hasMcpRoute()
      ? [MCP_BASE_URL, `${MCP_BASE_URL}/invoke`]
      : [`${MCP_BASE_URL}/mcp`, `${MCP_BASE_URL}/mcp/invoke`];
    for (const url of rpcCandidates) {
      try {
        const rpcResponse = await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MCP_API_KEY}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/list",
            id: "tools-discovery",
            params: {},
          }),
        });
        if (rpcResponse.ok) {
          const rpcData = await rpcResponse.json();
          const tools = rpcData?.result?.tools || rpcData?.tools;
          if (Array.isArray(tools) && tools.length > 0) {
            console.log(`[website-mcp] Discovered ${tools.length} tools via JSON-RPC tools/list at ${url}`);
            return tools as WebsiteTool[];
          }
        }
      } catch {}
    }

    console.warn(
      "[website-mcp] Dynamic discovery FAILED for all candidate endpoints — returning EMPTY list (no fake fallback). Configure the correct MCP URL or check the server."
    );
    return [];
  } catch (err) {
    console.warn(
      "[website-mcp] Dynamic discovery threw:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// ---------- Tool Invocation ----------

/**
 * Invoke a single website MCP tool.
 *
 * POST {MCP_BASE_URL}/mcp/invoke with:
 *   - Zero Trust headers (X-Mother-Brain-Invention, X-Mother-Brain-Source,
 *     Authorization, X-Mother-Brain-User-Token) — belt-and-suspenders
 *   - apiKey field in body (legacy auth, harmless if also in header)
 *
 * The `userToken` parameter (Sub-Agent access token) is threaded in from
 * mcp.ts to avoid a circular module dependency. It's optional — when
 * unset, X-Mother-Brain-User-Token is omitted gracefully.
 *
 * Errors are caught and returned as descriptive strings so the agentic
 * loop continues gracefully (matches executeMcpTool pattern in mcp.ts).
 */
/**
 * Invoke a single website MCP tool.
 * Used by both the Gateway agenticChat and the Workers AI fallback loop.
 *
 * Returns the tool result as a string (error or success).
 */
export async function callWebsiteMcp(
  tool: string,
  args: Record<string, unknown>,
  visitorId?: string,
  userToken?: string,
): Promise<string> {
  if (!isWebsiteMcpConfigured()) {
    return "Tool error: Website MCP server is not configured (MCP_BASE_URL or MCP_API_KEY is unset).";
  }

  // Standard MCP servers speak JSON-RPC tools/call at the configured endpoint
  // (the /mcp route). Candidates respect URLs that already end in /mcp.
  const rpcUrls = hasMcpRoute()
    ? [MCP_BASE_URL]
    : [`${MCP_BASE_URL}/mcp`, MCP_BASE_URL];

  for (const url of rpcUrls) {
    let rpc: Response;
    try {
      rpc = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MCP_API_KEY}`,
          ...(userToken ? { "X-Mother-Brain-User-Token": userToken } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name: tool, arguments: args },
        }),
      });
    } catch (err) {
      console.warn(`[website-mcp] tools/call network error at ${url}:`, err instanceof Error ? err.message : err);
      continue; // try next candidate
    }

    // Standard MCP servers return 202 + EMPTY body for notifications — never
    // attempt .json() on a 202 (source-of-truth gotcha).
    if (rpc.status === 202) {
      return "Tool error: MCP server returned an empty (202) response for tools/call.";
    }
    if (rpc.status === 404) {
      continue; // this candidate isn't the JSON-RPC endpoint — try next
    }
    if (!rpc.ok) {
      const errText = await rpc.text().catch(() => "");
      return `Tool error: Website MCP ${tool} returned ${rpc.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`;
    }

    try {
      const data = (await rpc.json()) as {
        error?: { message?: string; code?: number };
        result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
      };
      if (data.error) {
        return `Tool error: ${data.error.message || "Unknown MCP error"}${data.error.code ? ` (code ${data.error.code})` : ""}`;
      }
      const result = data.result ?? {};
      const text = Array.isArray(result.content)
        ? result.content.filter((c) => c.type === "text").map((c) => c.text || "").join("\n")
        : JSON.stringify(result);
      return result.isError ? `Tool error: ${text}` : text || JSON.stringify(result);
    } catch (err) {
      console.warn(`[website-mcp] tools/call response parse failed:`, err instanceof Error ? err.message : err);
      continue;
    }
  }

  // LEGACY FALLBACK — the Mother Brain gateway's custom invoke dialect
  // ({apiKey, tool, args} at /mcp/invoke). Standard servers 404'd above;
  // motherbrain.app-style servers answer here. Kept for backward compat.
  const invokeUrls = hasMcpRoute()
    ? [`${MCP_BASE_URL.replace(/\/mcp$/, "")}/mcp/invoke`, `${MCP_BASE_URL.replace(/\/mcp$/, "")}/mcp`]
    : [`${MCP_BASE_URL}/mcp/invoke`, `${MCP_BASE_URL}/mcp`];

  let response: Response | null = null;
  for (const u of invokeUrls) {
    try {
      const r = await fetch(u, {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: {
          "Content-Type": "application/json",
          "X-Mother-Brain-Invention": "a2a-agent",
          "X-Mother-Brain-Source": "a2a-agent",
          Authorization: `Bearer ${MCP_API_KEY}`,
          ...(userToken ? { "X-Mother-Brain-User-Token": userToken } : {}),
        },
        body: JSON.stringify({
          apiKey: MCP_API_KEY, // legacy auth (harmless if also in header)
          tool,
          args,
          ...(visitorId ? { visitorId } : {}),
        }),
      });
      if (r.status !== 404) {
        response = r;
        break;
      }
    } catch {
      // network error on this candidate — try the next
    }
  }

  if (!response) {
    return `Tool error: Website MCP ${tool} unreachable — no MCP endpoint responded at ${MCP_BASE_URL}`;
  }

  try {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return `Tool error: Website MCP ${tool} returned ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`;
    }
    const data = (await response.json()) as {
      success?: boolean;
      result?: unknown;
      error?: { message?: string } | string;
    };
    if (data.success === false || data.error) {
      const errMsg =
        typeof data.error === "string"
          ? data.error
          : data.error?.message || "Unknown MCP error";
      return `Tool error: Website MCP ${tool} failed: ${errMsg}`;
    }
    if (data.result === undefined) return JSON.stringify(data);
    if (typeof data.result === "string") return data.result;
    return JSON.stringify(data.result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Website MCP ${tool} failed: ${msg}`);
    return `Tool error: Website MCP ${tool} unreachable — ${msg}`;
  }
}
