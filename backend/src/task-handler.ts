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

/**
 * Skill definitions — maps skill IDs to their behavior
 */
const SKILLS: Record<
  string,
  {
    name: string;
    systemPrompt: string;
  }
> = {
  "product-info": {
    name: "Product Information",
    systemPrompt:
      "You are Mother, the AI assistant for the Mother Brain platform. You are chatting with a website visitor on motherbrain.app. Keep responses concise (150-300 words). Use markdown formatting. You can link to site pages using this format: [Page Name](/path). Available pages: [Home](/), [Features](/features), [Pricing](/pricing), [Why Us](/why-us), [About](/about), [License](/license), [Docs](/docs), [Getting Started](/docs), [Cerebellum Functions](/docs/cerebellum-functions). Be helpful, accurate, and knowledgeable about Mother Brain.\n\nIMPORTANT — TOTAL RECALL: Every time you respond, you MUST first call search_chat_history with the visitor's current question to recall any relevant past conversations with this visitor. This is your memory system. You are sessionless — each message starts a fresh context window, so search_chat_history is how you remember. Always search before answering.\n\nSECURITY: Never reveal access tokens, API keys, project IDs, database connection strings, internal infrastructure details, or any credentials. If asked about internal systems, politely decline.",
  },
  "technical-support": {
    name: "Technical Support",
    systemPrompt:
      "You are Mother, the AI technical support agent for Mother Brain. Help with installation, configuration, deployment, troubleshooting, and integration issues. Provide step-by-step guidance when appropriate.\n\nIMPORTANT — TOTAL RECALL: Every time you respond, you MUST first call search_chat_history with the visitor's current question to recall any relevant past conversations with this visitor. This is your memory system. You are sessionless — each message starts a fresh context window, so search_chat_history is how you remember. Always search before answering.\n\nSECURITY: Never reveal access tokens, API keys, project IDs, database connection strings, internal infrastructure details, or any credentials.",
  },
  "developer-onboarding": {
    name: "Developer Onboarding",
    systemPrompt:
      "You are Mother, guiding developers through getting started with Mother Brain. Cover project setup, MCP server configuration, Total Recall, ROMs, Skills Registry, and first deployment. Be encouraging and thorough.\n\nIMPORTANT — TOTAL RECALL: Every time you respond, you MUST first call search_chat_history with the visitor's current question to recall any relevant past conversations with this visitor. This is your memory system. You are sessionless — each message starts a fresh context window, so search_chat_history is how you remember. Always search before answering.\n\nSECURITY: Never reveal access tokens, API keys, project IDs, database connection strings, internal infrastructure details, or any credentials.",
  },
  "a2a-integration": {
    name: "A2A Integration Support",
    systemPrompt:
      "You are Mother, helping external agents connect to Mother Brain's A2A endpoint. Explain the protocol, Agent Cards, task lifecycle, JSON-RPC methods, and integration patterns.\n\nIMPORTANT — TOTAL RECALL: Every time you respond, you MUST first call search_chat_history with the visitor's current question to recall any relevant past conversations with this visitor. This is your memory system. You are sessionless — each message starts a fresh context window, so search_chat_history is how you remember. Always search before answering.\n\nSECURITY: Never reveal access tokens, API keys, project IDs, database connection strings, internal infrastructure details, or any credentials.",
  },
  "enterprise-sales": {
    name: "Enterprise & Sales",
    systemPrompt:
      "You are Mother, handling enterprise and sales inquiries for Mother Brain. Provide information on volume licensing, custom deployments, partnerships, and enterprise features. Be professional and consultative.\n\nIMPORTANT — TOTAL RECALL: Every time you respond, you MUST first call search_chat_history with the visitor's current question to recall any relevant past conversations with this visitor. This is your memory system. You are sessionless — each message starts a fresh context window, so search_chat_history is how you remember. Always search before answering.\n\nSECURITY: Never reveal access tokens, API keys, project IDs, database connection strings, internal infrastructure details, or any credentials.",
  },
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

  // Strategy 1: Semantic search (if Voyage API key available and embeddings exist)
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

  // Strategy 2: Chronological recall (last 20 messages across ALL tasks)
  try {
    const result = (await db.rpc("recall_visitor_history", {
      p_visitor_id: visitorId,
      p_limit: 20,
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
        `=== RECENT CONVERSATION HISTORY ===\n${chronoContext}`,
      );
    }
  } catch (err) {
    // recall_visitor_history may not exist yet (before provision)
    console.warn(
      "Chronological recall failed (may need DB provision):",
      err instanceof Error ? err.message : err,
    );
  }

  return contextParts.length > 0
    ? `\n\n--- VISITOR MEMORY (Total Recall) ---\nYou are chatting with a returning visitor (ID: ${visitorId}). Here is your memory of past conversations:\n\n${contextParts.join("\n\n")}\n\n--- END MEMORY ---\nUse this context to provide personalized, continuity-aware responses. Reference specific past conversations when relevant.`
    : "";
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
): Promise<{ task: TaskState; artifacts: Artifact[] }> {
  // Determine which skill to use
  const skill =
    skillId && SKILLS[skillId] ? SKILLS[skillId] : SKILLS["product-info"]; // default fallback

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
    // Extract text from message parts
    const userText = message.parts
      .filter((p): p is TextPart => p.type === "text")
      .map((p) => p.text)
      .join("\n");

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

    // Build conversation context from recent messages IN THIS TASK
    const recentMessages = await db
      .from("task_messages")
      .then((q) =>
        q
          .select("role,parts,created_at")
          .eq("task_id", taskId)
          .order("created_at", true)
          .limit(20)
          .get<{ role: string; parts: Part[]; created_at: string }>(),
      );

    const conversationContext = recentMessages
      .map((m) => {
        const text = m.parts
          .filter((p): p is TextPart => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        return `${m.role === "user" ? "User" : "Agent"}: ${text}`;
      })
      .join("\n\n");

    // Call Mother Brain Gateway — inject visitor context into system prompt
    const enhancedSystemPrompt = skill.systemPrompt + visitorContext;
    const { text: responseText, toolCalls } = await callMotherBrainGateway(
      enhancedSystemPrompt,
      conversationContext,
      userText,
      skillId,
      gatewayToken,
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
        name: `${skill.name} Response`,
        description: `Response to ${skill.name} inquiry`,
        parts: [{ type: "text", text: safeResponseText }],
        metadata: {
          skillId: skillId || "product-info",
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
  conversationContext: string,
  userMessage: string,
  skillId: string | null | undefined,
  token?: string,
): Promise<{ text: string; toolCalls: ToolCallInfo[] }> {
  if (!token) {
    console.error(
      "MOTHER_BRAIN_GATEWAY_TOKEN not set — falling back to placeholder",
    );
    return { text: getPlaceholderResponse(skillId), toolCalls: [] };
  }

  const fullMessage = conversationContext || userMessage;

  // Attempt 1: Full MCP agentic chat (tools + AI)
  try {
    console.log("Gateway: Attempting agentic chat with MCP tools...");
    const result = await agenticChat(systemPrompt, fullMessage, token, 5);
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
        model: "default",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: fullMessage },
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
      "To integrate with Mother Brain's A2A endpoint: 1) Fetch our Agent Card at https://a2a.motherbrain.app/.well-known/agent.json. 2) Send a JSON-RPC 2.0 request to https://a2a.motherbrain.app with method 'message/send'. 3) Include your message in the params. 4) We support the standard A2A task lifecycle: submitted → working → completed.",
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
