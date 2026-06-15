/**
 * A2A Client — connects to Mother AI Agent via JSON-RPC 2.0
 * Endpoint: https://a2a.motherbrain.app
 */

import { getVisitorId } from "./visitor-identity";

const A2A_ENDPOINT =
  "https://a2a.motherbrain.app"; /** Max message length to prevent abuse */
const MAX_MESSAGE_LENGTH = 8000;

export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  resultPreview: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCallInfo[];
}

let requestId = 0;

/**
 * Send a message to Mother via the A2A endpoint.
 * Returns the assistant's response text and any tool calls made.
 */
export async function sendMessageToMother(
  userMessage: string,
  skillId = "product-info",
  taskId?: string,
): Promise<{ text: string; toolCalls: ToolCallInfo[]; taskId?: string }> {
  // Input sanitization — strip HTML tags and limit length
  const sanitizedMessage = userMessage
    .replace(/<[^>]*>/g, "")
    .slice(0, MAX_MESSAGE_LENGTH)
    .trim();

  if (!sanitizedMessage) {
    throw new Error("Message is empty after sanitization");
  }

  // Get visitor fingerprint — never block chat if it fails
  let visitorId: string | undefined;
  try {
    visitorId = await getVisitorId();
  } catch {
    // Fingerprinting failed (browser may block canvas/audio)
    // Chat still works — just no persistent visitor tracking
    console.warn(
      "Visitor fingerprinting failed, proceeding without visitor_id",
    );
  }

  requestId++;
  const id = requestId;

  const response = await fetch(A2A_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "message/send",
      id,
      params: {
        ...(taskId ? { taskId } : {}),
        message: {
          role: "user",
          parts: [{ type: "text", text: sanitizedMessage }],
        },
        skillId,
        metadata: {
          source: "website",
          ...(visitorId ? { visitor_id: visitorId } : {}),
          timestamp: new Date().toISOString(),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`A2A request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "A2A error");
  }

  let responseText = "";
  let toolCalls: ToolCallInfo[] = [];

  const result = data.result;

  // Extract from artifacts (primary)
  if (result?.artifacts?.length) {
    // Take the LAST artifact (latest response) — not the first.
    // The A2A Worker returns all task artifacts, and [0] would always
    // show the oldest response on continued conversations.
    const artifact = result.artifacts[result.artifacts.length - 1];

    // Get tool calls from metadata
    if (artifact.metadata?.toolCalls) {
      toolCalls = artifact.metadata.toolCalls as ToolCallInfo[];
    }

    // Get text from parts
    const textPart = artifact.parts?.find(
      (p: { type: string }) => p.type === "text",
    );
    if (textPart) {
      responseText = textPart.text;
    }
  }

  // Fallback: try extracting from task messages
  if (!responseText && result?.messages?.length) {
    const lastAssistant = [...result.messages]
      .reverse()
      .find((m: { role: string }) => m.role === "assistant");
    if (lastAssistant?.parts?.length) {
      responseText = lastAssistant.parts
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join("");
    }
  }

  // Fallback: status message
  if (!responseText && result?.status?.message) {
    responseText = result.status.message;
  }

  if (!responseText) {
    responseText = "Mother is thinking... but no response was received.";
  }

  return {
    text: responseText,
    toolCalls,
    taskId: result?.task?.taskId,
  };
}

/**
 * Fetch previous conversation history for a visitor.
 * Returns recent tasks and their messages from the A2A backend.
 */
export async function fetchVisitorHistory(
  visitorId: string,
  limit = 5,
): Promise<{
  conversations: Array<{
    taskId: string;
    status: string;
    createdAt: string;
    messages: Array<{ role: string; text: string }>;
  }>;
}> {
  requestId++;
  const id = requestId;

  try {
    const response = await fetch(A2A_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "visitor/history",
        id,
        params: {
          visitor_id: visitorId,
          limit,
        },
      }),
    });

    if (!response.ok) {
      console.warn(`Failed to fetch visitor history: ${response.status}`);
      return { conversations: [] };
    }

    const data = await response.json();

    if (data.error) {
      console.warn(`Visitor history error: ${data.error.message}`);
      return { conversations: [] };
    }

    return {
      conversations: data.result?.conversations || [],
    };
  } catch {
    console.warn("Failed to fetch visitor history");
    return { conversations: [] };
  }
}

// ============================================
// Visitor Prompt Suggestions (AI-generated)
// ============================================

const SUGGESTIONS_CACHE_KEY = "motherbrain_hero_suggestions";

/**
 * Get cached suggestions from sessionStorage (persists across page navigation,
 * cleared when browser tab closes so they regenerate next visit).
 */
export function getCachedSuggestions(): string[] | null {
  try {
    const raw = sessionStorage.getItem(SUGGESTIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Cache suggestions in sessionStorage.
 */
function cacheSuggestions(suggestions: string[]): void {
  try {
    sessionStorage.setItem(SUGGESTIONS_CACHE_KEY, JSON.stringify(suggestions));
  } catch {
    // sessionStorage may be full or blocked — non-critical
  }
}

/**
 * Fetch AI-generated prompt suggestions for the visitor.
 * Uses visitor_id to personalize based on chat history.
 * Falls back to intelligent defaults on any error.
 *
 * Results are cached in sessionStorage so page navigation
 * doesn't trigger regeneration.
 */
export async function getVisitorSuggestions(): Promise<string[]> {
  // Check cache first (sessionStorage = persists across navigation, clears on tab close)
  const cached = getCachedSuggestions();
  if (cached) return cached;

  const DEFAULT_SUGGESTIONS = [
    "What can Mother Brain do for me?",
    "How does the persistent memory work?",
    "What are the pricing plans?",
    "Can Mother Brain integrate with my stack?",
    "How do I deploy an AI agent to my website?",
    "What security certifications does Mother Brain have?",
    "Tell me about the Horizontal-MVA feature",
    "Can I use my own API keys?",
    "What's the difference between local and cloud mode?",
    "How do ROMs work for knowledge building?",
    "Is there a team or enterprise plan?",
    "What can I build with the A2A protocol?",
  ];

  try {
    const visitorId = await getVisitorId();

    requestId++;
    const id = requestId;

    const response = await fetch(A2A_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "visitor/suggestions",
        id,
        params: { visitor_id: visitorId },
      }),
    });

    if (!response.ok) {
      console.warn(`Suggestions: HTTP ${response.status}, using defaults`);
      return DEFAULT_SUGGESTIONS;
    }

    const data = await response.json();

    if (data.error) {
      console.warn(`Suggestions error: ${data.error.message}`);
      return DEFAULT_SUGGESTIONS;
    }

    const suggestions = data.result?.suggestions;
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      cacheSuggestions(suggestions);
      return suggestions;
    }

    return DEFAULT_SUGGESTIONS;
  } catch {
    console.warn("Suggestions: fetch failed, using defaults");
    return DEFAULT_SUGGESTIONS;
  }
}
