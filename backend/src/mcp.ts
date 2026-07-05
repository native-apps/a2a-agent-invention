/**
 * MCP Client — connects to Mother Brain MCP Gateway for tool access.
 *
 * The Gateway exposes:
 *   - AI Router: POST /v1/chat/completions (OpenAI-compatible)
 *   - MCP Server: POST / (JSON-RPC) — tools/list, tools/call, etc.
 *
 * This client handles:
 *   1. Discovering available tools via MCP
 *   2. Converting MCP tools to OpenAI function format
 *   3. Executing tool calls via MCP
 *   4. The agentic loop: AI → tool_calls → execute → AI → response
 */

import {
  callWebsiteMcp,
  getWebsiteTools,
  isWebsiteMcpConfigured,
} from "./website-mcp";

// Gateway URL is set at runtime from the worker env binding (see wrangler.toml [vars]).
let GATEWAY_URL = "";
export function setGatewayUrl(url: string): void {
  GATEWAY_URL = url;
}
export function getGatewayUrl(): string {
  return GATEWAY_URL;
}

// Sub-Agent (bot user) access token — set at runtime from the worker env binding.
// Sent as the X-Mother-Brain-User-Token header on every Gateway/AI Router request
// so the Mother Brain Zero Trust layer can attribute traffic to the A2A Agent's
// bot user (type:"agent"). Optional: when unset, the header is omitted (graceful
// degradation — attribution falls back to "User (unknown)").
let USER_TOKEN = "";
export function setUserToken(token: string | undefined): void {
  USER_TOKEN = token || "";
}
export function getUserToken(): string {
  return USER_TOKEN;
}

/**
 * Build the standard Zero Trust header set for any Gateway/AI Router request.
 *
 * Zero Trust (default-deny) requires the invention to identify itself so the
 * AI Router can look up its declared permissions. ALL four signals matter:
 *   - Authorization:        project access (gateway token = master/project API key)
 *   - X-Mother-Brain-Source: invention detection signal (defense in depth)
 *   - X-Mother-Brain-Invention: identifies WHICH invention (REQUIRED — missing
 *                               triggers a Zero Trust warning + defaults to deny)
 *   - X-Mother-Brain-User-Token: Sub-Agent attribution (when available)
 */
export function buildGatewayHeaders(
  gatewayToken: string,
  source = "a2a-agent",
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${gatewayToken}`,
    "X-Mother-Brain-Source": source,
    "X-Mother-Brain-Invention": "a2a-agent",
  };
  const userToken = getUserToken();
  if (userToken) {
    headers["X-Mother-Brain-User-Token"] = userToken;
  }
  return headers;
}

// ---------- MCP Tool Types ----------

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface OpenAiFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

// ---------- Public Types ----------

export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  resultPreview: string; // First 200 chars of result
  structuredResult?: unknown; // Full parsed result for website.* tools (navigate/highlight actions)
}

export interface AgenticChatResult {
  text: string;
  toolCalls: ToolCallInfo[];
}

// ---------- Cached tools ----------

let cachedTools: OpenAiFunction[] | null = null;
let toolsCacheTime = 0;
const TOOLS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ---------- MCP JSON-RPC helpers ----------

let mcpRequestId = 0;

async function mcpRequest(
  method: string,
  params: Record<string, unknown>,
  token: string,
): Promise<unknown> {
  mcpRequestId++;
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: buildGatewayHeaders(token),
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      id: mcpRequestId,
      params,
    }),
  });

  if (!resp.ok) {
    throw new Error(`MCP ${method} failed: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    result?: unknown;
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`MCP error: ${data.error.message}`);
  }

  return data.result;
}

// ---------- Public API ----------

/**
 * Discover available MCP tools and convert to OpenAI function format.
 * Results are cached for 5 minutes.
 */
export async function getMcpTools(token: string): Promise<OpenAiFunction[]> {
  if (cachedTools && Date.now() - toolsCacheTime < TOOLS_CACHE_TTL) {
    return cachedTools;
  }

  try {
    const result = (await mcpRequest("tools/list", {}, token)) as {
      tools?: McpTool[];
    };

    const tools = (result.tools || []).map(
      (tool): OpenAiFunction => ({
        name: tool.name,
        description: tool.description || `Execute ${tool.name}`,
        parameters: {
          type: "object",
          properties: tool.inputSchema?.properties || {},
          required: tool.inputSchema?.required || [],
        },
      }),
    );

    cachedTools = tools;
    toolsCacheTime = Date.now();
    console.log(`MCP: Discovered ${tools.length} tools`);
    return tools;
  } catch (err) {
    console.error(
      `MCP tools/list failed: ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }
}

/**
 * Execute a single tool call via MCP.
 */
export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>,
  token: string,
): Promise<string> {
  try {
    const result = (await mcpRequest(
      "tools/call",
      { name: toolName, arguments: args },
      token,
    )) as {
      content?: Array<{ type: string; text?: string }>;
    };

    if (result.content) {
      return result.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");
    }

    return JSON.stringify(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`MCP tools/call ${toolName} failed: ${msg}`);
    return `Tool error: ${msg}`;
  }
}

/**
 * Full agentic chat: AI Router with MCP tools.
 * Handles the tool-calling loop automatically.
 *
 * Returns the final assistant response text.
 */
export async function agenticChat(
  systemPrompt: string,
  userMessage: string,
  token: string,
  maxRounds = 5,
  model: string = "default",
  visitorId?: string,
): Promise<AgenticChatResult> {
  // Compose the tool list from BOTH MCP servers:
  //   - Project MCP Gateway tools (search_codebase, search_memories, etc.)
  //   - Website MCP tools (website.read_page, website.navigate, etc.) —
  //     only when configured (graceful degradation when MCP_BASE_URL unset)
  const projectTools = await getMcpTools(token);
  const tools = isWebsiteMcpConfigured()
    ? [...projectTools, ...getWebsiteTools()]
    : projectTools;
  const toolCallTrace: ToolCallInfo[] = [];

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  for (let round = 0; round < maxRounds; round++) {
    // Call AI Router
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2048,
    };

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: "function",
        function: t,
      }));
    }

    const resp = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: buildGatewayHeaders(token),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`AI Router error ${resp.status}: ${errText}`);
    }

    const data = (await resp.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: {
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }[];
        };
        finish_reason?: string;
      }>;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`AI Router API error: ${data.error.message}`);
    }

    const choice = data.choices?.[0];
    if (!choice?.message) {
      throw new Error("AI Router returned empty response");
    }

    const assistantMsg = choice.message;
    const toolCalls = assistantMsg.tool_calls;

    // No tool calls — return the final response
    if (!toolCalls || toolCalls.length === 0) {
      return {
        text: assistantMsg.content || "No response generated.",
        toolCalls: toolCallTrace,
      };
    }

    // Has tool calls — execute them and continue the loop
    console.log(
      `MCP: AI requested ${toolCalls.length} tool calls (round ${round + 1})`,
    );

    // Add assistant message with tool calls to conversation
    messages.push({
      role: "assistant",
      content: assistantMsg.content,
      tool_calls: toolCalls,
    });

    // Execute each tool call — route to the correct MCP server by name prefix.
    // website.* tools → Website MCP server (callWebsiteMcp)
    // all others    → Project MCP Gateway (executeMcpTool)
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let toolArgs: Record<string, unknown>;
      try {
        toolArgs = JSON.parse(tc.function.arguments);
      } catch {
        toolArgs = {};
      }

      const isWebsiteTool = toolName.startsWith("website.");
      console.log(`MCP: Calling tool ${toolName}`);

      const toolResult = isWebsiteTool
        ? await callWebsiteMcp(toolName, toolArgs, visitorId, getUserToken())
        : await executeMcpTool(toolName, toolArgs, token);

      // For website tools, capture the structured result so the widget can
      // render navigate/highlight actions as clickable cards (Phase 3).
      let structuredResult: unknown | undefined;
      if (isWebsiteTool) {
        try {
          structuredResult = JSON.parse(toolResult);
        } catch {
          // Not valid JSON — leave undefined (tool result was a plain string)
        }
      }

      // Track the tool call for display
      toolCallTrace.push({
        name: toolName,
        args: toolArgs,
        resultPreview: toolResult.slice(0, 200),
        ...(structuredResult !== undefined && { structuredResult }),
      });

      // Add tool result to conversation
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  // If we exhausted all rounds, return the last assistant content
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  return {
    text:
      lastAssistant?.content ||
      "I needed more tool calls to answer fully. Please ask again.",
    toolCalls: toolCallTrace,
  };
}
