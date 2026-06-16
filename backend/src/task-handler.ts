import type {
  Message,
  TaskState,
  TaskStatus,
  Artifact,
  Part,
  TextPart,
} from "./types";
import { SupabaseClient } from "./supabase";
import { agenticChat, getGatewayUrl, type ToolCallInfo } from "./mcp";
import { filterResponse } from "./security";
import { buildSystemPrompt, SOUL_MD } from "./knowledge-base";

/**
 * Valid skill IDs. The actual system prompt for each skill is built by
 * buildSystemPrompt() in knowledge-base.ts, which composes:
 *   SOUL.md (personality) + Security Directives + Skill Role + Tool Guidance + Visitor Context
 *
 * The knowledge base content is packed at build time by scripts/pack-knowledge-base.cjs.
 */
const VALID_SKILLS = new Set([
  "product-info",
  "technical-support",
  "developer-onboarding",
  "a2a-integration",
  "enterprise-sales",
]);

/** Display names for skills (used in logs and metadata) */
const SKILL_NAMES: Record<string, string> = {
  "product-info": "Product Information",
  "technical-support": "Technical Support",
  "developer-onboarding": "Developer Onboarding",
  "a2a-integration": "A2A Integration Support",
  "enterprise-sales": "Enterprise & Sales",
};

/**
 * Embed text via Voyage AI API.
 * Returns a float array (1024 dimensions for voyage-4-large).
 */
async function embedText(
  text: string,
  apiKey: string,
  model: string = "voyage-4-large",
): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [text],
      input_type: "document",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage API error (${response.status}): ${err}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0].embedding;
}

/**
 * Recall visitor's past conversations using two strategies:
 * 1. Semantic search (vector similarity) — finds relevant messages by meaning
 * 2. Chronological recall — gets recent messages for immediate context
 *
 * Returns a formatted context string to inject into the AI prompt.
 */
async function recallVisitorContext(
  visitorId: string | undefined,
  currentMessage: string,
  db: SupabaseClient,
  voyageApiKey: string | undefined,
  embeddingModel: string = "voyage-4-large",
): Promise<string> {
  if (!visitorId) return ""; // No recall for anonymous visitors

  const contextParts: string[] = [];

  // Strategy 1: Recent conversation history (last 8 messages — newest first priority).
  // Small batch for immediate conversation flow. Vector search handles long-term recall.
  try {
    const result = (await db.rpc("recall_visitor_history", {
      p_visitor_id: visitorId,
      p_limit: 8,
    })) as Array<{
      id: string;
      role: string;
      parts: Array<{ type: string; text?: string }>;
      created_at: string;
    }>;

    if (result && result.length > 0) {
      const chronoContext = result
        .reverse() // chronological order (oldest first)
        .map((r) => {
          const text =
            r.parts
              ?.filter((p) => p.type === "text")
              .map((p) => p.text || "")
              .join("") || "";
          const date = new Date(r.created_at).toLocaleDateString();
          return `[${date}, ${r.role}]: ${text}`;
        })
        .join("\n");
      contextParts.push(
        `=== RECENT CONVERSATION (last ${result.length} messages) ===\n${chronoContext}`,
      );
    }
  } catch (err) {
    // recall_visitor_history may not exist yet (before provision)
    console.warn(
      "Chronological recall failed (may need DB provision):",
      err instanceof Error ? err.message : err,
    );
  }

  // Strategy 2: Semantic vector search — finds relevant messages from ANY time.
  // This is long-term memory: can recall a message from months ago if it's
  // semantically related to the current question.
  if (voyageApiKey) {
    try {
      const queryEmbedding = await embedText(
        currentMessage,
        voyageApiKey,
        embeddingModel,
      );
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      const result = (await db.rpc("match_visitor_messages", {
        query_embedding: embeddingStr,
        p_visitor_id: visitorId,
        p_match_threshold: 0.3,
        p_match_count: 10,
      })) as Array<{
        id: string;
        role: string;
        parts: Array<{ type: string; text?: string }>;
        created_at: string;
        similarity: number;
      }>;

      if (result && result.length > 0) {
        const semanticContext = result
          .map((r) => {
            const text =
              r.parts
                ?.filter((p) => p.type === "text")
                .map((p) => p.text || "")
                .join("") || "";
            const date = new Date(r.created_at).toLocaleDateString();
            return `[${date}, ${r.role}, relevance: ${(r.similarity * 100).toFixed(0)}%]: ${text}`;
          })
          .join("\n");
        contextParts.push(
          `=== SEMANTIC RECALL (relevant past conversations) ===\n${semanticContext}`,
        );
      }
    } catch (err) {
      console.warn(
        "Semantic recall failed (embeddings may not be provisioned yet):",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return contextParts.length > 0
    ? `\n\n--- VISITOR MEMORY (Total Recall) ---\nYou are chatting with a returning visitor (ID: ${visitorId}). Here is your memory of past conversations:\n\n${contextParts.join("\n\n")}\n\n--- END MEMORY ---\nUse this context to provide personalized, continuity-aware responses. Reference specific past conversations when relevant.`
    : "";
}

/**
 * Generate 12 personalized prompt suggestions for a visitor based on their
 * chat history (returning visitors) or the knowledge base (new visitors).
 *
 * Uses glm-5-turbo for fast, cheap generation — no MCP tools needed.
 * Called when a visitor lands on the website, before they open the chat.
 *
 * Returns a JSON string array of 12 one-liner questions.
 */
export async function generateVisitorSuggestions(
  visitorId: string | undefined,
  db: SupabaseClient,
  token: string | undefined,
  model: string = "glm-5-turbo",
): Promise<string[]> {
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

  if (!token) {
    console.warn("Suggestions: No gateway token — returning defaults");
    return DEFAULT_SUGGESTIONS;
  }

  // ── Gather context ──
  let contextBlock = "";
  let isReturning = false;

  if (visitorId) {
    try {
      const history = await db.rpc("recall_visitor_history", {
        p_visitor_id: visitorId,
        p_limit: 30,
      });

      if (history && history.length > 0) {
        isReturning = true;
        const conversationText = (
          history as Array<{
            role: string;
            parts?: Array<{ type: string; text?: string }>;
            created_at: string;
          }>
        )
          .reverse()
          .map((r) => {
            const text =
              r.parts
                ?.filter((p) => p.type === "text")
                .map((p) => p.text || "")
                .join(" ") || "";
            return `${r.role}: ${text.slice(0, 200)}`; // Truncate each message
          })
          .join("\n");
        contextBlock = `=== VISITOR CHAT HISTORY ===\n${conversationText}`;
      }
    } catch {
      // DB may not be provisioned yet — fall through to KB context
    }
  }

  // New visitor — use knowledge base (SOUL_MD has product knowledge)
  if (!isReturning) {
    // Extract key topics from SOUL_MD (first 2000 chars to stay compact)
    const kbSummary = SOUL_MD.slice(0, 2000);
    contextBlock = `=== PRODUCT KNOWLEDGE BASE ===\n${kbSummary}`;
  }

  // ── Build prompt ──
  const systemPrompt = [
    "You are a prompt suggestion generator for a website's AI agent (Mother Brain).",
    "Generate exactly 12 clever, specific one-liner questions that this visitor might ask.",
    "Rules:",
    "- Each prompt must be a realistic question a visitor would type.",
    "- Word them as if spoken BY the visitor (first person).",
    "- Be specific and intelligent — reference real features, pricing, security, integrations.",
    "- Avoid generic filler like 'Ask anything' or 'How does this work?'.",
    "- Keep each prompt under 80 characters.",
    isReturning
      ? "- Base the prompts on the visitor's conversation history below — what they discussed, what they might ask next."
      : "- Base the prompts on the product knowledge below — what would a new visitor want to know?",
    "- Detect and respond in the same language the visitor used in their history.",
    "Return ONLY a JSON array of 12 strings. No markdown, no explanation.",
  ].join("\n");

  const userPrompt = contextBlock;

  // ── Call AI Gateway (straight completion, no tools) ──
  try {
    const gatewayUrl = `${getGatewayUrl()}/v1/chat/completions`;
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Mother-Brain-Source": "a2a-suggestions",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.warn(`Suggestions: Gateway returned ${response.status}`);
      return DEFAULT_SUGGESTIONS;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("Suggestions: Empty response from gateway");
      return DEFAULT_SUGGESTIONS;
    }

    // Parse JSON array from response (handle markdown code fences)
    const jsonStr = content
      .replace(/```json\n?/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.warn("Suggestions: Parsed response is not an array");
      return DEFAULT_SUGGESTIONS;
    }

    // Clean up: ensure strings, trim, filter empties, cap at 12
    const suggestions = parsed
      .map((s) => (typeof s === "string" ? s.trim() : String(s).trim()))
      .filter((s) => s.length > 0)
      .slice(0, 12);

    return suggestions.length > 0 ? suggestions : DEFAULT_SUGGESTIONS;
  } catch (err) {
    console.warn(
      "Suggestions: Generation failed:",
      err instanceof Error ? err.message : err,
    );
    return DEFAULT_SUGGESTIONS;
  }
}

/**
 * Route a message to the appropriate skill and generate a response
 */
export async function handleTaskMessage(
  taskId: string,
  message: Message,
  skillId: string | undefined,
  db: SupabaseClient,
  gatewayToken?: string,
  visitorId?: string,
  voyageApiKey?: string,
  embeddingModel?: string,
  aiModel?: string,
): Promise<{ task: TaskState; artifacts: Artifact[] }> {
  // Validate skill ID (defaults to product-info if unknown)
  const validSkillId =
    skillId && VALID_SKILLS.has(skillId) ? skillId : "product-info";

  // Extract text from message parts (the current user question — #1 priority)
  const userText = message.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  // Store the incoming user message
  const insertedMsgs = await db.from("task_messages").then((q) =>
    q.insert({
      task_id: taskId,
      role: message.role,
      parts: message.parts,
      visitor_id: visitorId || null,
      metadata: message.metadata || {},
    }),
  );
  const messageId = Array.isArray(insertedMsgs)
    ? insertedMsgs[0]?.id
    : undefined;

  // Update task status to working
  await db
    .from("tasks")
    .then((q) => q.eq("id", taskId).update({ status: "working" }));

  try {
    // === TOTAL RECALL: Embed user message ===
    if (voyageApiKey && userText.trim()) {
      try {
        const embedding = await embedText(
          userText,
          voyageApiKey,
          embeddingModel || "voyage-4-large",
        );
        await db
          .from("task_messages")
          .then((q) => q.eq("id", messageId).updateEmbedding(embedding));
        console.log(`[recall] Embedded user message for visitor ${visitorId}`);
      } catch (err) {
        console.warn(
          "[recall] Failed to embed user message:",
          err instanceof Error ? err.message : err,
        );
        // Non-blocking — message is still stored, just without embedding
      }
    }

    // === TOTAL RECALL: Recall visitor's past conversations ===
    const visitorContext = await recallVisitorContext(
      visitorId,
      userText,
      db,
      voyageApiKey,
      embeddingModel,
    );

    // Build the complete system prompt from the packed knowledge base:
    // SOUL.md (personality) + Security Directives + Skill Role + Tool Guidance + Visitor Context
    const enhancedSystemPrompt = buildSystemPrompt(
      validSkillId,
      visitorContext,
    );
    // Pass the current user message directly — it is the #1 priority.
    // Conversation history (recent + semantic) is already in the system prompt
    // via recallVisitorContext → buildSystemPrompt. No redundant context loading.
    const { text: responseText, toolCalls } = await callMotherBrainGateway(
      enhancedSystemPrompt,
      userText,
      skillId,
      gatewayToken,
      aiModel,
    );

    // Apply security guardrails — filter sensitive info from response
    const safeResponseText = filterResponse(responseText);

    // Store agent response message
    const insertedAgentMsgs = await db.from("task_messages").then((q) =>
      q.insert({
        task_id: taskId,
        role: "agent",
        parts: [{ type: "text", text: safeResponseText }],
        visitor_id: visitorId || null,
        metadata: {},
      }),
    );

    // === TOTAL RECALL: Embed agent response ===
    const agentMessageId = Array.isArray(insertedAgentMsgs)
      ? insertedAgentMsgs[0]?.id
      : undefined;
    if (voyageApiKey && safeResponseText.trim() && agentMessageId) {
      try {
        const embedding = await embedText(
          safeResponseText,
          voyageApiKey,
          embeddingModel || "voyage-4-large",
        );
        await db
          .from("task_messages")
          .then((q) => q.eq("id", agentMessageId).updateEmbedding(embedding));
        console.log(
          `[recall] Embedded agent response for visitor ${visitorId}`,
        );
      } catch (err) {
        console.warn(
          "[recall] Failed to embed agent response:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Create artifact with the response + tool calls
    const artifactId = `artifact-${Date.now()}`;
    await db.from("artifacts").then((q) =>
      q.insert({
        task_id: taskId,
        artifact_id: artifactId,
        name: `${SKILL_NAMES[validSkillId] || "Agent"} Response`,
        description: `Response to ${SKILL_NAMES[validSkillId] || "user"} inquiry`,
        parts: [{ type: "text", text: safeResponseText }],
        metadata: {
          skillId: validSkillId,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        },
      }),
    );

    // Update task to completed
    const updatedTasks = await db.from("tasks").then((q) =>
      q.eq("id", taskId).update({
        status: "completed",
        history: [
          {
            role: "user",
            parts: message.parts,
            timestamp: new Date().toISOString(),
          },
          {
            role: "agent",
            parts: [{ type: "text", text: safeResponseText }],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    );

    const task = Array.isArray(updatedTasks) ? updatedTasks[0] : null;

    // Fetch artifacts
    const artifacts = await db
      .from("artifacts")
      .then((q) => q.select("*").eq("task_id", taskId).get<Artifact>());

    return {
      task: {
        taskId: task?.id || taskId,
        status: (task?.status as TaskStatus) || "completed",
        history: task?.history || [],
      },
      artifacts: artifacts.map((a) => ({
        artifactId: a.artifactId || a.artifact_id,
        name: a.name,
        description: a.description,
        parts: a.parts || [],
        metadata: a.metadata,
      })),
    };
  } catch (error) {
    // Update task to failed
    await db.from("tasks").then((q) =>
      q.eq("id", taskId).update({
        status: "failed",
        history: [
          {
            role: "user",
            parts: message.parts,
            timestamp: new Date().toISOString(),
          },
          {
            role: "agent",
            parts: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
              },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    );

    throw error;
  }
}

/**
 * Call Mother Brain with full MCP tool access.
 *
 * Strategy:
 * 1. Try agenticChat (AI Router + MCP tools) — Mother gets search_codebase,
 *    search_memories, get_file_content, and all other MCP tools
 * 2. If MCP fails (MacBook offline, Gateway down), fall back to plain
 *    AI Router chat completion (still uses Supabase-backed knowledge)
 * 3. If everything fails, use placeholder responses
 */
async function callMotherBrainGateway(
  systemPrompt: string,
  userMessage: string,
  skillId: string | null | undefined,
  token?: string,
  model: string = "default",
): Promise<{ text: string; toolCalls: ToolCallInfo[] }> {
  if (!token) {
    console.error(
      "MOTHER_BRAIN_GATEWAY_TOKEN not set — falling back to placeholder",
    );
    return { text: getPlaceholderResponse(skillId), toolCalls: [] };
  }

  // Attempt 1: Full MCP agentic chat (tools + AI)
  try {
    console.log("Gateway: Attempting agentic chat with MCP tools...");
    const result = await agenticChat(
      systemPrompt,
      userMessage,
      token,
      5,
      model,
    );
    return result;
  } catch (mcpError) {
    console.warn(
      `MCP agentic chat failed (${mcpError instanceof Error ? mcpError.message : mcpError}), falling back to plain chat...`,
    );
  }

  // Attempt 2: Plain AI Router chat completion (no tools, just knowledge)
  const gatewayUrl = `${getGatewayUrl()}/v1/chat/completions`;

  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Mother-Brain-Source": "a2a-agent",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Gateway error ${response.status}: ${errorBody}`);
      return { text: getPlaceholderResponse(skillId), toolCalls: [] };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) {
      console.error(`Gateway API error: ${data.error.message}`);
      return { text: getPlaceholderResponse(skillId), toolCalls: [] };
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("Gateway returned empty response");
      return { text: getPlaceholderResponse(skillId), toolCalls: [] };
    }

    return { text: content, toolCalls: [] };
  } catch (error) {
    console.error(
      `Gateway call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return { text: getPlaceholderResponse(skillId), toolCalls: [] };
  }
}

/**
 * Fallback placeholder responses when Gateway is unavailable
 */
function getPlaceholderResponse(skillId?: string | null): string {
  const responses: Record<string, string> = {
    "product-info":
      "Mother Brain is an AI-powered development environment that connects your code, knowledge, and conversations into a unified workspace. It features Total Recall (persistent chat history), ROMs (Read-Only Memory knowledge bases), and a Skills Registry for automated workflows. Pricing starts with a free tier for individual developers, with Pro and Enterprise plans available.",
    "technical-support":
      "For technical support with Mother Brain: 1) Ensure you have the latest version installed. 2) Check that your MCP server configuration is correct in your IDE settings. 3) Verify your Supabase connection is active. 4) Try restarting your IDE. If the issue persists, please describe the specific error you're encountering.",
    "developer-onboarding":
      "Welcome to Mother Brain! To get started: 1) Download and install Mother Brain from our website. 2) Launch the app — all dependencies are bundled, no additional installs needed. 3) Configure your first project and MCP server. 4) Explore Total Recall to see your conversation history. 5) Check out the Skills Registry for automated workflows.",
    "a2a-integration":
      "To integrate with Mother Brain's A2A endpoint: 1) Fetch our Agent Card at https://a2a.motherbrain.app/.well-known/agent-card.json. 2) Send a JSON-RPC 2.0 request to https://a2a.motherbrain.app with method 'message/send'. 3) Include your message in the params. 4) We support the standard A2A task lifecycle: submitted → working → completed.",
    "enterprise-sales":
      "Thank you for your interest in Mother Brain Enterprise. We offer volume licensing, custom deployments, dedicated support, and SLA guarantees. Enterprise features include team collaboration, centralized knowledge management, and priority access to new features. Let us know your team size and requirements for a custom quote.",
  };

  return responses[skillId || "product-info"] || responses["product-info"];
}

/**
 * Get the current state of a task from the database
 */
export async function getTaskState(
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

/**
 * Cancel a task
 */
export async function cancelTask(
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
