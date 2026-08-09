import type {
  Message,
  TaskState,
  TaskStatus,
  TaskHistoryEvent,
  Artifact,
  Part,
  TextPart,
  Ai,
} from "./types";
import { SupabaseClient } from "./supabase";
import {
  agenticChat,
  buildGatewayHeaders,
  getGatewayUrl,
  type ToolCallInfo,
} from "./mcp";
import { filterResponse } from "./security";
import { buildSystemPrompt, SOUL_MD } from "./knowledge-base";
import {
  callWebsiteMcp,
  isWebsiteMcpConfigured,
  getWebsiteTools,
  discoverWebsiteTools,
  type WebsiteTool,
} from "./website-mcp";
import {
  callCloudMcpTool,
  isCloudMcpConfigured,
  checkCloudMcpHealth,
  getCloudMcpUrl,
  getForceCloudMcp,
} from "./cf-mcp-mirror";

/**
 * Valid skill IDs are now dynamic — any skill ID from the agent card is accepted.
 * Skill IDs are populated at runtime from the AGENT_SKILLS_JSON env var.
 * The system prompt for each skill is built by buildSystemPrompt() in knowledge-base.ts.
 */
const validSkillIds = new Set<string>();

/**
 * Insert a row into a table, degrading gracefully when optional columns are
 * missing (fresh Supabase project with only the base schema).
 *
 * PostgREST rejects INSERTs that reference columns which don't exist on the
 * table. The agent must work for EVERY website out of the box, so optional
 * identity columns (license_key, customer_id) can never block a message:
 *
 *   1. Try with the optional identity columns included (full schema).
 *   2. On failure, retry with only the base + visitor columns.
 *   3. On failure, retry with the absolute base columns only.
 *
 * The column check happens per call (cheap; failures only occur on the first
 * message when the schema is incomplete, and PostgREST caches the schema).
 */
export async function insertResilient<T>(
  db: SupabaseClient,
  table: string,
  fullRow: Record<string, unknown>,
  optionalKeys: string[],
  baseRow?: Record<string, unknown>,
): Promise<T[]> {
  // Attempt 1: full row (all columns, including optional identity columns)
  try {
    return await db.from(table).then((q) => q.insert<T>(fullRow));
  } catch {
    // Attempt 2: strip optional columns (license_key, customer_id, …)
    const withoutOptional: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fullRow)) {
      if (!optionalKeys.includes(k)) withoutOptional[k] = v;
    }
    try {
      return await db.from(table).then((q) => q.insert<T>(withoutOptional));
    } catch {
      // Attempt 3: absolute base columns only (survives a truly minimal DB)
      if (baseRow) {
        return await db.from(table).then((q) => q.insert<T>(baseRow));
      }
      // No base fallback — rethrow the attempt-2 error
      throw new Error(
        `Supabase INSERT failed for ${table} (missing columns or other error)`,
      );
    }
  }
}

/** Register skill IDs from the deployed agent card (called from index.ts middleware). */
export function registerSkillIds(skills: { id: string }[] | undefined) {
  if (!skills) return;
  for (const skill of skills) {
    validSkillIds.add(skill.id);
  }
}

/** Display names for skills (used in logs and metadata). Falls back to the skill ID itself. */
export function getSkillName(skillId: string): string {
  const names: Record<string, string> = {
    general: "General",
    "general-support": "General Support",
    "product-info": "Product Information",
    "technical-support": "Technical Support",
    "developer-onboarding": "Developer Onboarding",
    "a2a-integration": "A2A Integration Support",
    "enterprise-sales": "Enterprise & Sales",
  };
  return (
    names[skillId] ||
    skillId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

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
  visitorIds: string[],
  currentMessage: string,
  db: SupabaseClient,
  voyageApiKey: string | undefined,
  embeddingModel: string = "voyage-4-large",
): Promise<string> {
  if (visitorIds.length === 0) return ""; // No recall for anonymous visitors

  const contextParts: string[] = [];
  const visitorLabel =
    visitorIds.length > 1
      ? `${visitorIds.length} devices (${visitorIds[0]}…)`
      : visitorIds[0];

  // Strategy 1: Recent conversation history (last 8 messages — newest first priority).
  // Queries across ALL visitor_ids (cross-device chat).
  try {
    const result = (await db.rpc("recall_visitor_history", {
      p_visitor_ids: visitorIds,
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
        p_query_embedding: embeddingStr,
        p_visitor_ids: visitorIds,
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
    ? `\n\n--- VISITOR MEMORY (Total Recall) ---\nYou are chatting with a returning visitor (ID: ${visitorLabel}). Here is your memory of past conversations across all their devices:\n\n${contextParts.join("\n\n")}\n\n--- END MEMORY ---\nUse this context to provide personalized, continuity-aware responses. Reference specific past conversations when relevant.`
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
    "What can your AI agent do for me?",
    "How does the persistent memory work?",
    "What are the pricing plans?",
    "Can it integrate with my stack?",
    "How do I deploy an AI agent to my website?",
    "What security features do you have?",
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
    "You are a prompt suggestion generator for a website's AI agent.",
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
      headers: buildGatewayHeaders(token),
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
 * Generate AI-assisted skill suggestions based on the project's Knowledge Base.
 * The Gateway LLM reviews the packed Knowledge Base (SOUL_MD), the agent's
 * existing skills, and optionally the Website MCP tools, then proposes new
 * AgentSkill objects that cover gaps or expand capabilities.
 */
export async function generateSkillSuggestions(
  currentSkills: { id: string; name: string; description: string }[],
  agentDescription: string,
  websiteTools: { name: string; description: string }[],
  token: string | undefined,
  model: string = "default",
): Promise<
  {
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
    inputModes: string[];
    outputModes: string[];
  }[]
> {
  if (!token) {
    console.warn("SkillSuggest: No gateway token");
    return [];
  }

  const contextParts: string[] = [];
  if (agentDescription)
    contextParts.push(`=== AGENT IDENTITY ===\n${agentDescription}`);
  if (currentSkills.length > 0) {
    contextParts.push(
      `=== EXISTING SKILLS (do not duplicate) ===\n` +
        currentSkills
          .map(
            (s, i) =>
              `${i + 1}. id="${s.id}" name="${s.name}" — ${s.description}`,
          )
          .join("\n"),
    );
  }
  if (websiteTools.length > 0) {
    contextParts.push(
      `=== WEBSITE MCP TOOLS ===\n` +
        websiteTools
          .map((t, i) => `${i + 1}. ${t.name} — ${t.description}`)
          .join("\n"),
    );
  }
  contextParts.push(`=== KNOWLEDGE BASE ===\n${SOUL_MD.slice(0, 3000)}`);

  const toolNote =
    websiteTools.length > 0
      ? "- Create skills that leverage both the product knowledge AND website MCP tool capabilities."
      : "- Create skills based on the product knowledge. Focus on what real users would ask about.";

  const systemPrompt = [
    "You are an A2A Protocol skill designer. Propose NEW AgentSkill objects.",
    'AgentSkill fields: id (kebab-case), name, description (1 sentence), tags (2-4 lowercase), examples (2-3 user questions), inputModes: ["text/plain"], outputModes: ["text/plain"]',
    "RULES:",
    toolNote,
    "- DO NOT duplicate any existing skill.",
    "- Each skill should represent a distinct capability.",
    "- Generate 4-6 skills (fewer if the KB doesn't support more).",
    "- Make skills specific and actionable.",
    "Return ONLY a JSON array. No markdown, no explanation.",
    `Example: [{"id":"pricing","name":"Pricing","description":"Answer pricing questions","tags":["pricing"],"examples":["How much?"],"inputModes":["text/plain"],"outputModes":["text/plain"]}]`,
  ].join("\n");

  try {
    const gatewayUrl = `${getGatewayUrl()}/v1/chat/completions`;
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: buildGatewayHeaders(token),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextParts.join("\n\n") },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });
    if (!response.ok) {
      console.warn(`SkillSuggest: Gateway ${response.status}`);
      return [];
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("SkillSuggest: Empty response");
      return [];
    }
    const jsonStr = content
      .replace(/```json\n?/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const existingIds = new Set(currentSkills.map((s) => s.id));
    const suggestions: {
      id: string;
      name: string;
      description: string;
      tags: string[];
      examples: string[];
      inputModes: string[];
      outputModes: string[];
    }[] = [];
    for (const raw of parsed) {
      if (typeof raw !== "object" || !raw || !raw.id || !raw.name) continue;
      if (existingIds.has(String(raw.id))) continue;
      suggestions.push({
        id: String(raw.id).toLowerCase().replace(/\s+/g, "-"),
        name: String(raw.name),
        description: String(raw.description || ""),
        tags: Array.isArray(raw.tags)
          ? raw.tags.map((t: unknown) => String(t).toLowerCase())
          : [],
        examples: Array.isArray(raw.examples)
          ? raw.examples.map((e: unknown) => String(e))
          : [],
        inputModes: Array.isArray(raw.inputModes)
          ? raw.inputModes.map((m: unknown) => String(m))
          : ["text/plain"],
        outputModes: Array.isArray(raw.outputModes)
          ? raw.outputModes.map((m: unknown) => String(m))
          : ["text/plain"],
      });
    }
    console.log(`SkillSuggest: Generated ${suggestions.length} suggestions`);
    return suggestions;
  } catch (err) {
    console.warn(
      "SkillSuggest: Failed:",
      err instanceof Error ? err.message : err,
    );
    return [];
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
  fallbackConfig?: FallbackConfig,
  licenseKey?: string,
  customerId?: string | null,
  cfWorkerModel?: string,
  forceCfWorker?: boolean,
  websiteUrl?: string,
): Promise<{ task: TaskState; artifacts: Artifact[] }> {
  // Validate skill ID — any skill from the agent card is valid.
  // Defaults to "general" if no skillId provided.
  const validSkillId = skillId || "general";

  // Extract text from message parts (the current user question — #1 priority)
  const userText = message.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  // Store the incoming user message
  // Resilient insert: license_key / customer_id columns are optional (added by
  // later migrations). On a fresh Supabase project with only the base schema,
  // the insert degrades to base + visitor columns so the agent still works.
  const insertedMsgs = await insertResilient(
    db,
    "task_messages",
    {
      task_id: taskId,
      role: message.role,
      parts: message.parts,
      visitor_id: visitorId || null,
      license_key: licenseKey || null,
      customer_id: customerId ?? null,
      metadata: message.metadata || {},
    },
    ["license_key", "customer_id"],
    {
      task_id: taskId,
      role: message.role,
      parts: message.parts,
      visitor_id: visitorId || null,
      metadata: message.metadata || {},
    },
  );
  const messageId = Array.isArray(insertedMsgs)
    ? (insertedMsgs[0] as { id?: string })?.id
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
    // Pass visitorId as a single-element array (cross-device resolution
    // happens at the visitor/history level; message recall uses the current
    // device's visitor_id). When customer_id is set, the device resolver
    // at the index.ts level already resolved all visitor_ids.
    const visitorContext = await recallVisitorContext(
      visitorId ? [visitorId] : [],
      userText,
      db,
      voyageApiKey,
      embeddingModel,
    );

    // Build the complete system prompt from the packed knowledge base:
    // SOUL.md (personality) + Security Directives + Skill Role + Tool Guidance + Visitor Context
    // Tool guidance omits website.* tools when the Website MCP Integration is blank.
    const enhancedSystemPrompt = buildSystemPrompt(
      validSkillId,
      visitorContext,
      websiteUrl,
      isWebsiteMcpConfigured(),
    );
    // Pass the current user message directly — it is the #1 priority.
    // Conversation history (recent + semantic) is already in the system prompt
    // via recallVisitorContext → buildSystemPrompt. No redundant context loading.
    // Extract CF MCP Mirror config from fallbackConfig if present
    const mcpCloudUrl = fallbackConfig?.mcpCloudUrl;
    const forceCloudMcp = fallbackConfig?.forceCloudMcp;

    const { text: responseText, toolCalls } = await callMotherBrainGateway(
      enhancedSystemPrompt,
      userText,
      skillId,
      gatewayToken,
      aiModel,
      fallbackConfig,
      visitorId,
      cfWorkerModel,
      forceCfWorker,
      mcpCloudUrl,
      forceCloudMcp,
    );

    // Apply security guardrails — filter sensitive info from response
    const safeResponseText = filterResponse(responseText);

    // Store agent response message
    const insertedAgentMsgs = await insertResilient(
      db,
      "task_messages",
      {
        task_id: taskId,
        role: "agent",
        parts: [{ type: "text", text: safeResponseText }],
        visitor_id: visitorId || null,
        license_key: licenseKey || null,
        customer_id: customerId ?? null,
        metadata: {},
      },
      ["license_key", "customer_id"],
      {
        task_id: taskId,
        role: "agent",
        parts: [{ type: "text", text: safeResponseText }],
        visitor_id: visitorId || null,
        metadata: {},
      },
    );

    // === TOTAL RECALL: Embed agent response ===
    const agentMessageId = Array.isArray(insertedAgentMsgs)
      ? (insertedAgentMsgs[0] as { id?: string })?.id
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
        name: `${getSkillName(validSkillId)} Response`,
        description: `Response to ${getSkillName(validSkillId).toLowerCase()} inquiry`,
        parts: [{ type: "text", text: safeResponseText }],
        metadata: {
          skillId: validSkillId,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        },
      }),
    );

    // Read current history so we can APPEND (not overwrite)
    const existingTask = await db
      .from("tasks")
      .then((q) => q.eq("id", taskId).select("history").get<{ history: TaskHistoryEvent[] }>());
    const existingHistory = existingTask?.[0]?.history || [];

    // Update task to completed — append to existing history
    const updatedTasks = await db.from("tasks").then((q) =>
      q.eq("id", taskId).update({
        status: "completed",
        history: [
          ...existingHistory,
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
    // Read current history so we can APPEND (not overwrite)
    const existingTask = await db
      .from("tasks")
      .then((q) => q.eq("id", taskId).select("history").get<{ history: TaskHistoryEvent[] }>());
    const existingHistory = existingTask?.[0]?.history || [];

    await db.from("tasks").then((q) =>
      q.eq("id", taskId).update({
        status: "failed",
        history: [
          ...existingHistory,
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
 * Configuration for the offline Supabase fallback (Attempt 3 below).
 * When the MCP Gateway is unreachable, the Worker can query the Mother Brain
 * PROJECT's Supabase directly to retrieve stored knowledge. All fields optional —
 * if any required field is missing, the fallback is skipped (graceful degradation).
 */
interface FallbackConfig {
  mbSupabaseUrl?: string;
  mbSupabaseServiceKey?: string;
  mbProjectId?: string;
  voyageApiKey?: string;
  embeddingModel?: string;
  // Cloudflare Workers AI binding — independent LLM for offline fallback.
  // When the Gateway LLM is unreachable, this synthesizes intelligent
  // responses from Supabase-retrieved knowledge without needing the Gateway.
  ai?: Ai;
  // Cloudflare Workers AI model name (e.g. "@cf/zai-org/glm-4.7-flash").
  // Used for the Workers AI binding fallback calls. Falls back to
  // "@cf/zai-org/glm-4.7-flash" if not set.
  cfWorkerModel?: string;
  // Cloudflare MCP Mirror URL — MCP tools hosted in the cloud.
  // Optional: when unset, MCP mirror fallback is skipped.
  mcpCloudUrl?: string;
  	// When true, routes MCP tool calls to the CF MCP Mirror instead of
  	// the local Mother Brain Gateway. Like FORCE_CF_WORKER but for MCP tools.
  	forceCloudMcp?: boolean;
  	// Maximum tokens for Workers AI responses. Controls response length.
  	// Default: 1024. Increase for longer responses, decrease for brevity.
  	cfMaxTokens?: number;
  	// Temperature for Workers AI (0-2). Controls creativity/randomness.
  	// Default: 0.7. Higher = more creative, lower = more deterministic.
  	cfTemperature?: number;
  }

// Ai type imported from ./types directly where needed

/**
 * Query the Mother Brain PROJECT's Supabase directly (offline fallback).
 *
 * Used when the MCP Gateway is unreachable. Retrieves relevant knowledge
 * (memories + code index + chat history) via vector search against the project's
 * Supabase, then generates a response using the Gateway LLM (if still reachable)
 * or returns a formatted context-only answer (still better than the placeholder).
 *
 * Returns null if the fallback is not configured (MB_* env vars unset) or if
 * nothing could be retrieved, so callers can fall through to the placeholder.
 */
async function queryProjectKnowledgeBase(
  userMessage: string,
  systemPrompt: string,
  skillId: string | null | undefined,
  token: string | undefined,
  model: string,
  config: FallbackConfig,
): Promise<string | null> {
  const { mbSupabaseUrl, mbSupabaseServiceKey, mbProjectId } = config;
  if (!mbSupabaseUrl || !mbSupabaseServiceKey || !mbProjectId) {
    return null; // Fallback not configured — caller falls through to placeholder
  }
  if (!config.voyageApiKey) {
    console.warn("[fallback] VOYAGE_API_KEY missing — cannot embed query");
    return null;
  }

  console.log(
    "[fallback] Gateway unreachable — querying project Supabase directly...",
  );

  // Step 1: Embed the user query (required for vector search)
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(
      userMessage,
      config.voyageApiKey,
      config.embeddingModel || "voyage-4-large",
    );
  } catch (err) {
    console.error(
      "[fallback] Embedding failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Direct PostgREST RPC helper for the PROJECT Supabase (different URL/key
  // from the A2A Agent's own chat-history DB).
  const projectRpc = async (
    fn: string,
    params: Record<string, unknown>,
  ): Promise<unknown> => {
    const res = await fetch(`${mbSupabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: mbSupabaseServiceKey,
        Authorization: `Bearer ${mbSupabaseServiceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `Project Supabase RPC ${fn} error (${res.status}): ${err}`,
      );
    }
    return res.json();
  };

  // Step 2: Vector search the project's knowledge tables (RPC pattern: match_{projectId}_{table})
  const contextParts: string[] = [];

  // 2a. Knowledge memory (facts, decisions, summaries)
  try {
    const memories = (await projectRpc(
      `match_${mbProjectId}_knowledge_memory`,
      {
        query_embedding: embeddingStr,
        match_count: 5,
        match_threshold: 0.35,
      },
    )) as Array<{
      content?: string;
      type?: string;
      tags?: string[];
      similarity?: number;
    }>;
    if (Array.isArray(memories) && memories.length > 0) {
      const memCtx = memories
        .map(
          (m) =>
            `[${m.type || "memory"}, relevance: ${((m.similarity || 0) * 100).toFixed(0)}%]: ${m.content || ""}`,
        )
        .join("\n");
      contextParts.push(
        `=== STORED KNOWLEDGE (facts, decisions, summaries) ===\n${memCtx}`,
      );
    }
  } catch (err) {
    console.warn(
      "[fallback] Knowledge memory search failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // 2b. Code index (vectorized source files)
  try {
    const code = (await projectRpc(`match_${mbProjectId}_code_index`, {
      query_embedding: embeddingStr,
      match_count: 5,
      match_threshold: 0.35,
    })) as Array<{
      file_path?: string;
      content?: string;
      symbol_name?: string;
      similarity?: number;
    }>;
    if (Array.isArray(code) && code.length > 0) {
      const codeCtx = code
        .map((c) => {
          const loc = c.symbol_name
            ? `${c.file_path} (${c.symbol_name})`
            : c.file_path || "(unknown)";
          return `[${loc}, relevance: ${((c.similarity || 0) * 100).toFixed(0)}%]: ${(c.content || "").slice(0, 800)}`;
        })
        .join("\n");
      contextParts.push(
        `=== CODE INDEX (relevant source files) ===\n${codeCtx}`,
      );
    }
  } catch (err) {
    console.warn(
      "[fallback] Code index search failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // 2c. Chat history (past conversations about this topic)
  try {
    const history = (await projectRpc(`match_${mbProjectId}_chat_history`, {
      query_embedding: embeddingStr,
      match_count: 3,
      match_threshold: 0.4,
    })) as Array<{
      content?: string;
      role?: string;
      similarity?: number;
    }>;
    if (Array.isArray(history) && history.length > 0) {
      const histCtx = history
        .map(
          (h) =>
            `[${h.role || "unknown"}, relevance: ${((h.similarity || 0) * 100).toFixed(0)}%]: ${(h.content || "").slice(0, 500)}`,
        )
        .join("\n");
      contextParts.push(
        `=== PAST CONVERSATIONS (semantically related) ===\n${histCtx}`,
      );
    }
  } catch (err) {
    console.warn(
      "[fallback] Chat history search failed:",
      err instanceof Error ? err.message : err,
    );
  }

  if (contextParts.length === 0) {
    console.warn("[fallback] No knowledge retrieved from project Supabase");
    return null; // Nothing to work with — let caller use placeholder
  }

  const retrievedKnowledge = contextParts.join("\n\n");
  console.log(
    `[fallback] Retrieved ${contextParts.length} knowledge blocks from project Supabase`,
  );

  // Step 3: Generate a response using an LLM. Try in order:
  //   a) Gateway LLM (if token available and Gateway still reachable for AI)
  //   b) Cloudflare Workers AI (independent of the Gateway — always available)
  //   c) Raw context-only response (last resort)

  // Build the offline system prompt with retrieved knowledge context
  const offlineSystem =
    `${systemPrompt}\n\n--- RETRIEVED KNOWLEDGE BASE (offline fallback mode) ---\n` +
    `The MCP Gateway tools are currently unavailable, but you have direct access\n` +
    `to the project's knowledge base via Supabase. Use ONLY the following retrieved\n` +
    `context to answer. If the context doesn't contain the answer, say so honestly.\n` +
    `Synthesize a helpful, conversational response — do NOT just repeat the raw context.\n\n` +
    `${retrievedKnowledge}\n--- END KNOWLEDGE BASE ---`;

  // Attempt 3a: Gateway LLM (may be reachable for AI even when MCP tools aren't)
  if (token) {
    try {
      const gatewayUrl = `${getGatewayUrl()}/v1/chat/completions`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: buildGatewayHeaders(token),
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: offlineSystem },
            { role: "user", content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          console.log(
            "[fallback] Generated response via Gateway LLM + Supabase context",
          );
          return content;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(
        "[fallback] Gateway LLM call failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Attempt 3b: Cloudflare Workers AI (independent of the Gateway)
  // This is the critical fix — when the Gateway is completely down, Workers AI
  // synthesizes an intelligent response from the retrieved knowledge.
  if (config.ai) {
    try {
      console.log(
        "[fallback] Gateway LLM unreachable — trying Cloudflare Workers AI...",
      );
      const aiResponse = await config.ai.run(
      config.cfWorkerModel || "@cf/zai-org/glm-4.7-flash",
      {
          messages: [
            {
              role: "system",
              content:
                offlineSystem +
                "\n\nIMPORTANT: You are in offline mode. Answer based ONLY on the retrieved knowledge above. " +
                "Be conversational, helpful, and concise (150-300 words). Do not mention that you are an offline mode or raw data.",
            },
            { role: "user", content: userMessage },
          ],
          max_tokens: 1024,
        },
      );
      const aiText = (aiResponse as { response?: string }).response;
      if (aiText && aiText.trim().length > 0) {
        console.log(
          "[fallback] Generated response via Cloudflare Workers AI + Supabase context",
        );
        return aiText.trim();
      }
    } catch (err) {
      console.warn(
        "[fallback] Workers AI call failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Attempt 3c: All LLMs unreachable — return null so the caller can
  // fall through to the placeholder. We intentionally do NOT return the
  // raw retrieved knowledge as text because:
  //   1. It leaks internal documentation to end users (SOUL.md, code, etc.)
  //   2. The raw format is unreadable / confusing for visitors
  //   3. The caller (tryFallbackOrPlaceholder) has its own placeholder fallback
  console.log(
    "[fallback] All LLMs unreachable — returning null (caller will use placeholder)",
  );
  return null;
}

/**
 * Agentic chat loop using Cloudflare Workers AI (instead of the Gateway AI Router).
 *
 * When the Gateway is unreachable, this function:
 * 1. Dynamically discovers the website's MCP tools (from any MCP server)
 * 2. Passes those tools to Workers AI with function calling
 * 3. If Workers AI requests a tool call, executes it and continues the loop
 * 4. Returns the final response
 *
 * This works for ANY website with an MCP server — tools are auto-discovered
 * at runtime, not hardcoded. GLM-5.2 supports function calling.
 */

/**
 * Trim the massive system prompt for Workers AI models.
 * Workers AI has strict input validation — too-large prompts or too many
 * tool definitions trigger error 8001. We keep only the essential parts:
 * core personality, security directives, visitor context, and a note about tools.
 */
function trimSystemPromptForWorkersAI(prompt: string, hasTools: boolean): string {
  // Workers AI needs a concise prompt — the full SOUL.md + security directives +
  // tool guidance + visitor context can easily exceed 10K+ chars. We keep:
  // 1. First 2000 chars of personality (SOUL.md intro)
  // 2. Key security directives (strip markdown headers)
  // 3. Visitor context (if present, marked by "VISITOR CONTEXT" section)
  // 4. Minimal tool note — actual tools are passed inline via the tools param
  const parts: string[] = [];

  // Extract personality core: everything before "SECURITY DIRECTIVES" or first 2500 chars
  const soulEnd = prompt.indexOf("SECURITY DIRECTIVES");
  const soulSection = soulEnd > 0 ? prompt.slice(0, soulEnd).trim() : prompt.slice(0, 2500);
  parts.push(soulSection);

  // Extract visitor context if present
  const visitorStart = prompt.indexOf("VISITOR CONTEXT");
  if (visitorStart > 0) {
    const visitorSection = prompt.slice(visitorStart, visitorStart + 1500);
    parts.push(visitorSection);
  }

  // Add a brief tool note. CRITICAL: when no tools are available (e.g. Website
  // MCP blank AND no MB/mirror tools), do NOT tell the model it has tools — it
  // will hallucinate tool calls, they fail, and the chat ends at the placeholder.
  parts.push(
    hasTools
      ? "You have access to tools (passed inline). Use them when needed. " +
        "If a tool fails, try another approach rather than giving up. " +
        "Be concise and helpful. Do NOT mention that you are in offline mode."
      : "You do NOT have access to any tools on this site. Do not attempt to call " +
        "any tool functions. Answer directly using your knowledge and the visitor " +
        "context above. If you lack specific information, say so honestly and " +
        "offer what you can from your general knowledge. Be concise and helpful.",
  );

  const trimmed = parts.join("\n\n");
  if (trimmed.length < prompt.length) {
    console.log(
      `[workers-ai] Trimmed system prompt from ${prompt.length} to ${trimmed.length} chars`,
    );
  }
  return trimmed;
}

async function agenticChatWithWorkersAI(
  systemPrompt: string,
  userMessage: string,
  skillId: string | null | undefined,
  fallbackConfig: FallbackConfig | undefined,
  workersModel: string,
  visitorId?: string,
): Promise<{ text: string; toolCalls: ToolCallInfo[] }> {
  if (!fallbackConfig?.ai) {
    return { text: getPlaceholderResponse(skillId), toolCalls: [] };
  }

  // ── Step 1: Discover available tools ──
  // When forceCloudMcp is enabled, discover MCP tools from the CF Mirror
  // in addition to (or instead of) website tools.
  const cfMirrorTools: string[] = [];
  const forceCloudMcp = fallbackConfig.forceCloudMcp && !!fallbackConfig.mcpCloudUrl;
  console.log(
    `[workers-ai] forceCloudMcp check: flag=${fallbackConfig.forceCloudMcp}, ` +
    `url_set=${!!fallbackConfig.mcpCloudUrl}, result=${forceCloudMcp}`,
  );
  if (forceCloudMcp) {
    const mirrorTools = await checkCloudMcpHealth();
    if (mirrorTools) {
      cfMirrorTools.push(...mirrorTools);
      console.log(
        `[workers-ai] CF MCP Mirror discovered ${mirrorTools.length} tools: ${mirrorTools.join(", ")}`,
      );
    } else {
      console.warn(
        `[workers-ai] CF MCP Mirror health check returned null — mirror may be unreachable or not configured`,
      );
    }
  } else {
    console.log(
      `[workers-ai] forceCloudMcp skipped — need BOTH forceCloudMcp=true AND mcpCloudUrl set ` +
      `(flag=${fallbackConfig.forceCloudMcp}, url=${fallbackConfig.mcpCloudUrl || "(empty)"})`,
    );
  }

  // Step 2: Discover website MCP tools — merge dynamic + static.
  // Only when the Website MCP Integration is configured (MCP_BASE_URL +
  // MCP_API_KEY set). When it's left blank, NO website.* tools are
  // advertised to the LLM — otherwise the model sees them as callable,
  // tries to call them, and gets "Website MCP server is not configured".
  // Dynamic discovery fetches the actual tools from the MCP server
  // (may differ per website). Static tools fill in gaps for tools
  // the server hasn't fully implemented yet (e.g. website.navigate).
  // Tools with the same name: server-discovered version takes priority
  // (accurate descriptions/params). Tools only in the static list
  // are included too — they may still work via callWebsiteMcp().
  const discoveredTools = isWebsiteMcpConfigured() ? await discoverWebsiteTools() : [];
  const staticTools = isWebsiteMcpConfigured() ? getWebsiteTools() : [];
  const toolMap = new Map<string, WebsiteTool>();
  for (const t of staticTools) toolMap.set(t.name, t);
  for (const t of discoveredTools) toolMap.set(t.name, t); // discovered overrides static
  const websiteTools = Array.from(toolMap.values());

  // Build the combined tool list: website tools + CF Mirror MCP tools
  // Workers AI has limits on total tools per call (error 8001 when too many).
  // Prioritize Mirror tools (knowledge access) then website tools, capping at 10.
  const MAX_TOOLS = 10;
  const allWebsiteTools = websiteTools.map((t: WebsiteTool) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description.slice(0, 200), // trim long descriptions
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
  const allMirrorTools = cfMirrorTools.map((toolName: string) => ({
    type: "function" as const,
    function: {
      name: toolName,
      description: `Tool: ${toolName}.`,
      parameters: {
        type: "object" as const,
        properties: { query: { type: "string", description: "The search query or arguments" } },
        required: [] as string[],
      },
    },
  }));
  // Mirror tools first (knowledge access is critical), then website tools
  const tools = [
    ...allMirrorTools,
    ...allWebsiteTools,
  ].slice(0, MAX_TOOLS);
  if (allMirrorTools.length + allWebsiteTools.length > MAX_TOOLS) {
    console.log(
      `[workers-ai] Capped tools from ${allMirrorTools.length + allWebsiteTools.length} to ${MAX_TOOLS} ` +
      `(${Math.min(allMirrorTools.length, MAX_TOOLS)} Mirror + ${Math.max(0, MAX_TOOLS - allMirrorTools.length)} Website)`,
    );
  }

  const toolCallTrace: ToolCallInfo[] = [];

  // Flexible message type for Workers AI — supports assistant + tool roles
  type ChatMessage = {
    role: string;
    content?: string | null;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: trimSystemPromptForWorkersAI(systemPrompt, tools.length > 0),
    },
    { role: "user", content: userMessage },
  ];

  // Limit tool-calling rounds to prevent excessive MCP tool calls.
  // 8 rounds × ~6 tools/round = 48 tools calls max — burns neurons fast
  // and triggers Cloudflare "maximum tools calls" errors.
  // 4 rounds gives the LLM enough chances while staying reasonable.
  const maxRounds = 4;
  const maxTotalToolCalls = 12;
  const maxToolsPerRound = 6;

  for (let round = 0; round < maxRounds; round++) {
    console.log(
      `[workers-ai] Round ${round + 1}: Calling "${workersModel}" with ${tools.length} tools, ${messages.length} messages`,
    );
    const aiResponse = await fallbackConfig.ai.run(workersModel, {
      messages: messages as Array<{ role: string; content: string }>,
      max_tokens: fallbackConfig?.cfMaxTokens || 1024,
      temperature: fallbackConfig?.cfTemperature ?? 0.7,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Log the raw response shape so we can diagnose model compatibility
    const respKeys = typeof aiResponse === "object" && aiResponse !== null
      ? Object.keys(aiResponse as object)
      : [typeof aiResponse];
    console.log(`[workers-ai] Response keys: [${respKeys.join(", ")}]`);

    const responseObj = aiResponse as {
      response?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };

    const toolCalls = responseObj?.tool_calls || responseObj?.choices?.[0]?.message?.tool_calls;

    // No tool calls — return the AI's text response
    if (!toolCalls || toolCalls.length === 0) {
      const text = responseObj?.response || responseObj?.choices?.[0]?.message?.content || getPlaceholderResponse(skillId);
      if (text) {
        console.log(`[workers-ai] ✅ Model returned text response (${text.length} chars)`);
      } else {
        console.warn(
          `[workers-ai] ⚠️ Model returned NEITHER tool_calls nor response. ` +
          `Keys: [${respKeys.join(", ")}]. Raw: ${JSON.stringify(aiResponse).slice(0, 300)}`,
        );
      }
      return { text: text.trim(), toolCalls: toolCallTrace };
    }

    console.log(
      `[workers-ai] ✅ Model returned ${toolCalls.length} tool call(s) (round ${round + 1})`,
    );

    // Check total tool call limit before executing more
    if (toolCallTrace.length + toolCalls.length > maxTotalToolCalls) {
      console.warn(
        `[workers-ai] ⚠️ Would exceed max tool calls (${maxTotalToolCalls}) — ` +
        `current: ${toolCallTrace.length}, incoming: ${toolCalls.length}. Returning last response.`,
      );
      const lastText = messages
        .filter((m) => m.role === "assistant" && m.content)
        .map((m) => m.content)
        .pop();
      return { text: lastText || getPlaceholderResponse(skillId), toolCalls: toolCallTrace };
    }

    // Has tool calls — execute them via the website MCP server
    console.log(
      `[workers-ai] AI requested ${toolCalls.length} tool calls (round ${round + 1})`,
    );

    // Cap tool calls per round to prevent unbounded inner loop
    const roundToolCalls = toolCalls.slice(0, maxToolsPerRound);
    if (toolCalls.length > maxToolsPerRound) {
      console.warn(
        `[workers-ai] ⚠️ Capping tool calls to ${maxToolsPerRound} this round (received ${toolCalls.length})`,
      );
    }

    messages.push({
      role: "assistant",
      content: null as unknown as string,
      tool_calls: roundToolCalls as unknown as ChatMessage["tool_calls"],
    });

    for (const tc of roundToolCalls) {
      const toolName = tc.function.name;
      let toolArgs: Record<string, unknown>;
      try {
        toolArgs = JSON.parse(tc.function.arguments);
      } catch {
        toolArgs = {};
      }

      console.log(`[workers-ai] Calling tool: ${toolName} (forceCloudMcp=${forceCloudMcp})`);

      // Route tool calls: MF Mirror tools → callCloudMcpTool, website tools → callWebsiteMcp
      const isMirrorTool = forceCloudMcp && cfMirrorTools.includes(toolName);
      const toolResult = isMirrorTool
        ? await callCloudMcpTool(toolName, toolArgs)
        : await callWebsiteMcp(
            toolName,
            toolArgs,
            visitorId,
          );

      toolCallTrace.push({
        name: toolName,
        args: toolArgs,
        resultPreview: toolResult.slice(0, 200),
      });

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  // Exhausted rounds — return last assistant message with actual content
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content);
  return {
    text:
      lastAssistant?.content ||
      getPlaceholderResponse(skillId),
    toolCalls: toolCallTrace,
  };
}

/**
 * Call Mother Brain with full MCP tool access.
 *
 * Strategy:
 * 1. Try agenticChat (AI Router + MCP tools) — Mother gets search_codebase,
 *    search_memories, get_file_content, and all other MCP tools
 * 2. If MCP fails (MacBook offline, Gateway down), fall back to plain
 *    AI Router chat completion (still uses Supabase-backed knowledge)
 * 3. NEW: If the Gateway is completely unreachable, query the PROJECT's Supabase
 *    directly (offline fallback) to retrieve knowledge and generate a response
 * 4. If everything fails (or fallback unconfigured), use placeholder responses
 */
async function callMotherBrainGateway(
  systemPrompt: string,
  userMessage: string,
  skillId: string | null | undefined,
  token?: string,
  model: string = "default",
  fallbackConfig?: FallbackConfig,
  visitorId?: string,
  cfWorkerModel?: string,
  forceCfWorker?: boolean,
  mcpCloudUrl?: string,
  forceCloudMcp?: boolean,
): Promise<{ text: string; toolCalls: ToolCallInfo[] }> {
  const workersModel = cfWorkerModel || "@cf/zai-org/glm-4.7-flash";

  // ── Force Cloudflare Workers AI override ──
  // When enabled, skip the MCP Gateway entirely and route all inference
  // through the Cloudflare Workers AI binding. Useful for cost control,
  // offline mode, or when you want to always use CF's hosted models.
  // R8 BUGFIX: Also handle the case where fallbackConfig?.ai is missing
  // (Workers AI binding not deployed). Return placeholder immediately
  // instead of timing out on the unreachable Gateway.
  if (forceCfWorker) {
    if (!fallbackConfig?.ai) {
      console.log("[force-cf] AI binding not available — returning placeholder");
      return { text: getPlaceholderResponse(skillId), toolCalls: [] };
    }
    console.log("[force-cf] Using Cloudflare Workers AI (forced override)...");
    // 1. Try Workers AI with dynamically discovered website tools
    //    When forced, we skip Gateway entirely but still use website MCP tools.
    try {
      return await agenticChatWithWorkersAI(
        systemPrompt,
        userMessage,
        skillId,
        { ...fallbackConfig, mcpCloudUrl, forceCloudMcp },
        workersModel,
        visitorId,
      );
    } catch (err) {
      console.warn(
        "[force-cf] Workers AI agentic chat failed:",
        err instanceof Error ? err.message : err,
      );
    }
    // 2. Try Supabase knowledge base + Workers AI (rich mode)
    //    Only reached if Workers AI direct failed (unlikely). Provides
    //    knowledge-backed responses as a secondary fallback.
    if (fallbackConfig) {
      // token cleared: FORCE_CF_WORKER skips Gateway to avoid timeout hangs
      const fbText = await queryProjectKnowledgeBase(
        userMessage, systemPrompt, skillId, undefined, model, fallbackConfig,
      );
      if (fbText) return { text: fbText, toolCalls: [] };
    }
    return { text: getPlaceholderResponse(skillId), toolCalls: [] };
  }

  // ── Proactive Offline Detection (Gateway Health Check) ──
  // When token IS present but the Gateway is unreachable (MB app local server
  // offline, tunnel down, etc.), proactively detect this and clear the token
  // so the !token fallback chain below immediately routes to Workers AI.
  //
  // This avoids wasting 10-30+ seconds on Gateway timeouts from agenticChat()
  // or the plain Gateway chat attempts. Without this probe, each Gateway
  // fetch could hang waiting for the upstream MB app proxy to timeout.
  //
  // When FORCE_CF_WORKER=true, the force block above already handles this.
  // This check covers the FORCE_CF_WORKER=false case when Gateway is down.
  // Health check uses a short 2-second timeout; if the probe fails quickly,
  // we immediately route to Workers AI via the !token fallback chain below.
  if (token && fallbackConfig?.ai) {
    try {
      const probeUrl = `${getGatewayUrl()}/`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const probe = await fetch(probeUrl, {
        method: "GET",
        headers: buildGatewayHeaders(token),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (probe.ok) {
        console.log(
          "[gateway-health] Gateway is reachable, proceeding normally...",
        );
      } else {
        console.warn(
          `[gateway-health] Gateway returned ${probe.status} — clearing token for Workers AI fallback`,
        );
        token = undefined;
      }
    } catch {
      console.log(
        "[gateway-health] Gateway unreachable — clearing token for Workers AI fallback",
      );
      token = undefined;
    }
  }

  // ── Force Cloudflare MCP Mirror override ──
  // When enabled, route MCP tool calls to the CF MCP Mirror instead of
  // the local Gateway. This is checked BEFORE the Gateway health probe
  // so that a forced mirror takes immediate effect.
  //
  // BUGFIX R8: This block was a no-op — it only logged and fell through.
  // Now it clears the token so the `if (!token)` fallback chain below
  // (line ~1427) activates, which has the actual FORCE_CLOUD_MCP logic.
  if (forceCloudMcp && mcpCloudUrl) {
    console.log(
      "[force-cf-mcp] FORCE_CLOUD_MCP enabled — clearing token for Workers AI + Mirror fallback chain...",
    );
    console.log("[force-cf-mcp] Mirror URL:", mcpCloudUrl);
    // Clear token so the fallback chain at `if (!token)` activates.
    // The actual FORCE_CLOUD_MCP handling (Workers AI + Mirror tools)
    // is implemented at lines 1427-1443 inside the !token block.
    token = undefined;
  }

  if (!token) {
    console.error(
      "MOTHER_BRAIN_GATEWAY_TOKEN not set — trying offline fallback chain",
    );
    // 0. Try CF MCP Mirror if configured (MCP tools in the cloud)
    //    Only used for tool execution — LLM still comes from Workers AI.
    if (forceCloudMcp && mcpCloudUrl && fallbackConfig?.ai) {
      try {
        console.log("[no-token] FORCE_CLOUD_MCP enabled — using CF Mirror for tools + Workers AI for LLM");
        return await agenticChatWithWorkersAI(
          systemPrompt,
          userMessage,
          skillId,
          { ...fallbackConfig, mcpCloudUrl, forceCloudMcp },
          workersModel,
          visitorId,
        );
      } catch (err) {
        console.warn(
          "[no-token] FORCE_CLOUD_MCP Workers AI chat failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    // 1. Try Workers AI with dynamically discovered website tools
    //    Even without a Gateway token, website MCP tools are available.
    if (fallbackConfig?.ai) {
      try {
        return await agenticChatWithWorkersAI(
          systemPrompt,
          userMessage,
          skillId,
          fallbackConfig,
          workersModel,
          visitorId,
        );
      } catch (err) {
        console.warn(
          "[no-token] Workers AI agentic chat failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    // 2. Try Supabase knowledge base fallback (if configured)
    //    Only reached if Workers AI direct failed (unlikely). Provides
    //    knowledge-backed responses as a secondary fallback.
    if (fallbackConfig) {
      const fallbackText = await queryProjectKnowledgeBase(
        userMessage,
        systemPrompt,
        skillId,
        token,
        model,
        fallbackConfig,
      );
      if (fallbackText) return { text: fallbackText, toolCalls: [] };
    }
    return { text: getPlaceholderResponse(skillId), toolCalls: [] };
  }

  // Attempt 1: Website MCP agentic chat (Workers AI — bypasses Gateway)
  // When website MCP tools are configured, use Workers AI directly instead of
  // sending tools through the Gateway AI Router. The Gateway strips unrecognized
  // function definitions (like website.*), so website tools would be silently
  // removed. Workers AI passes all function definitions through untouched.
  if (isWebsiteMcpConfigured() && fallbackConfig?.ai) {
    try {
      console.log("Gateway: Using Workers AI with website MCP tools (bypassing Gateway)...");
      return await agenticChatWithWorkersAI(
        systemPrompt,
        userMessage,
        skillId,
        fallbackConfig,
        workersModel,
        visitorId,
      );
    } catch (err) {
      const _errMsg = err instanceof Error ? err.message : String(err);
      const _errStack = err instanceof Error ? err.stack?.slice(0, 400) : "";
      console.error(
        `[workers-ai] ❌ Website MCP chat failed with model "${workersModel}": ${_errMsg}`,
      );
      if (_errStack) console.error(`[workers-ai] Stack: ${_errStack}`);
    }
  }

  // Attempt 2: Full MCP agentic chat (Gateway tools only — no website tools)
  // Website tools are excluded because the Gateway AI Router strips them.
  try {
    console.log("Gateway: Attempting agentic chat with MCP tools...");
    const result = await agenticChat(
      systemPrompt,
      userMessage,
      token,
      5,
      model,
      visitorId,
    );
    return result;
  } catch (mcpError) {
    console.warn(
      `MCP agentic chat failed (${mcpError instanceof Error ? mcpError.message : mcpError}), falling back to plain chat...`,
    );
  }

  // Attempt 3: Plain AI Router chat completion (no tools, just knowledge)
  const gatewayUrl = `${getGatewayUrl()}/v1/chat/completions`;

  // Helper: try the offline Supabase fallback before resorting to the placeholder.
  // Returns the fallback text if configured & successful, else the placeholder.
  const tryFallbackOrPlaceholder = async (): Promise<{
    text: string;
    toolCalls: ToolCallInfo[];
  }> => {
    // 0. Try CF MCP Mirror if configured (when Gateway is down but mirror is up)
    //    Uses the mirror's MCP tools for tool execution, with Workers AI for LLM.
    if (mcpCloudUrl && fallbackConfig?.ai) {
      try {
        console.log(
          "[gateway-down] Gateway unreachable — trying CF MCP Mirror with Workers AI...",
        );
        return await agenticChatWithWorkersAI(
          systemPrompt,
          userMessage,
          skillId,
          { ...fallbackConfig, mcpCloudUrl, forceCloudMcp: true },
          workersModel,
          visitorId,
        );
      } catch (err) {
        console.warn(
          "[gateway-down] CF MCP Mirror + Workers AI chat failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    // 1. Try Workers AI with dynamically discovered website tools
    //    Uses agenticChatWithWorkersAI which:
    //    a. Dynamically discovers the website's MCP tools at runtime
    //    b. Passes them to Workers AI with function calling (GLM-4.7-Flash supports it)
    //    c. If AI requests a tool call, executes it via the website MCP server
    //    d. Continues the loop until the AI generates a final response
    if (fallbackConfig?.ai) {
      try {
        console.log(
          "[gateway-down] Trying Workers AI with dynamically discovered website tools...",
        );
        return await agenticChatWithWorkersAI(
          systemPrompt,
          userMessage,
          skillId,
          fallbackConfig,
          workersModel,
          visitorId,
        );
      } catch (err) {
        console.warn(
          "[gateway-down] Workers AI agentic chat failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    // 2. Try Supabase knowledge base + Workers AI (rich offline mode)
    //    Only reached if Workers AI direct failed (unlikely). Provides
    //    knowledge-backed responses or the raw-knowledge dump as secondary fallback.
    if (fallbackConfig) {
      const fallbackText = await queryProjectKnowledgeBase(
        userMessage,
        systemPrompt,
        skillId,
        token,
        model,
        fallbackConfig,
      );
      if (fallbackText) return { text: fallbackText, toolCalls: [] };
    }
    // 3. Last resort: static placeholder
    return { text: getPlaceholderResponse(skillId), toolCalls: [] };
  };

  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: buildGatewayHeaders(token),
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
      return tryFallbackOrPlaceholder();
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (data.error) {
      console.error(`Gateway API error: ${data.error.message}`);
      return tryFallbackOrPlaceholder();
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("Gateway returned empty response");
      return tryFallbackOrPlaceholder();
    }

    return { text: content, toolCalls: [] };
  } catch (error) {
    console.error(
      `Gateway call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return tryFallbackOrPlaceholder();
  }
}

/**
 * Fallback placeholder responses when Gateway is unavailable
 */
function getPlaceholderResponse(skillId?: string | null): string {
  const responses: Record<string, string> = {
    "product-info":
      "I'd be happy to help you learn about our product! However, I'm currently in offline mode and can't access the full knowledge base. Please try again in a moment, or contact us directly for immediate assistance.",
    "technical-support":
      "I'm here to help with technical support! However, I'm currently in offline mode and can't access the full knowledge base. Please describe your issue and I'll do my best to help, or try again in a moment.",
    general:
      "I'd love to help with that! I'm currently in offline mode and can't access the full knowledge base. Please try again in a moment, or rephrase your question and I'll do my best to assist.",
    "developer-onboarding":
      "Welcome! I'm currently in offline mode and can't access the full getting started guide. Please try again in a moment for complete setup instructions.",
    "enterprise-sales":
      "I'd be happy to help with enterprise sales inquiries! However, I'm currently in offline mode and can't access the full knowledge base. Please try again in a moment, or contact our sales team directly.",
    "a2a-integration":
      "I can help you with A2A (Agent-to-Agent) integration! I'm currently in offline mode and can't access the full integration guides. Please try again in a moment for complete setup instructions.",
    "website-mcp-tools":
      "I can help you with website MCP tools! I'm currently in offline mode and can't access the tool definitions right now. Please try again in a moment.",
  };

  return responses[skillId || "general"] || responses["general"];
}
