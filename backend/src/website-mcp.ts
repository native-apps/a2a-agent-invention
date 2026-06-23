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

export function setWebsiteMcpConfig(
  baseUrl?: string,
  apiKey?: string,
): void {
  if (baseUrl) MCP_BASE_URL = baseUrl.replace(/\/$/, ""); // strip trailing slash
  if (apiKey) MCP_API_KEY = apiKey;
}

export function isWebsiteMcpConfigured(): boolean {
  return MCP_BASE_URL.length > 0 && MCP_API_KEY.length > 0;
}

// ---------- Tool Catalog (static — sourced from GET /mcp/tools) ----------
// These are the 13 tools the website MCP server exposes. Defined statically
// (rather than discovered at runtime) to avoid an extra network round-trip
// on every Worker cold start. If the website MCP server adds/removes tools,
// update this list AND verify via `curl {MCP_BASE_URL}/mcp/tools`.

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
          description: "The page slug (e.g., 'features', 'pricing', 'test-page')",
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
    description:
      "Delete a generated page. System pages cannot be deleted.",
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
    description:
      "List all available inventions from the Mother Brain registry.",
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
 * Returns the 13 website tools in OpenAI function format.
 * Used by agenticChat() to expose website tools to the LLM alongside
 * project tools.
 */
export function getWebsiteTools(): WebsiteTool[] {
  return WEBSITE_TOOLS;
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
export async function callWebsiteMcp(
  tool: string,
  args: Record<string, unknown>,
  visitorId?: string,
  userToken?: string,
): Promise<string> {
  if (!isWebsiteMcpConfigured()) {
    return "Tool error: Website MCP server is not configured (MCP_BASE_URL or MCP_API_KEY is unset).";
  }

  try {
    const response = await fetch(`${MCP_BASE_URL}/mcp/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mother-Brain-Invention": "a2a-agent",
        "X-Mother-Brain-Source": "a2a-agent",
        Authorization: `Bearer ${MCP_API_KEY}`,
        // Sub-Agent token for Zero Trust attribution — conditional,
        // omitted gracefully if the project hasn't created a bot user yet.
        ...(userToken ? { "X-Mother-Brain-User-Token": userToken } : {}),
      },
      body: JSON.stringify({
        apiKey: MCP_API_KEY, // legacy auth (harmless if also in header)
        tool,
        args,
        ...(visitorId ? { visitorId } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return `Tool error: Website MCP ${tool} returned ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`;
    }

    const data = (await response.json()) as {
      success?: boolean;
      result?: unknown;
      error?: { message?: string } | string;
    };

    // Error payload from the MCP server
    if (data.success === false || data.error) {
      const errMsg =
        typeof data.error === "string"
          ? data.error
          : data.error?.message || "Unknown MCP error";
      return `Tool error: Website MCP ${tool} failed: ${errMsg}`;
    }

    // Result — normalize to string for the agentic loop
    if (data.result === undefined) {
      return JSON.stringify(data);
    }
    if (typeof data.result === "string") {
      return data.result;
    }
    return JSON.stringify(data.result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Website MCP ${tool} failed: ${msg}`);
    return `Tool error: Website MCP ${tool} unreachable — ${msg}`;
  }
}
