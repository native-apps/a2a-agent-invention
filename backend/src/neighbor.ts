/**
 * Neighbors — the public face of an A2A Agent.
 *
 * Every deployed agent gets a PUBLIC, no-auth neighbor identity:
 *   GET  /neighbor          → public Neighbor agent card (discovery)
 *   POST /neighbor          → receive a "knock" from another agent
 *   GET  /neighbor/registry → the Neighbors registry this agent knows
 *
 * The agent itself also gets two LOCAL tools (neighbors_search,
 * neighbors_knock) so it can discover and contact other agents on its
 * own — this is the "skill every A2A Agent gets" (Decision Log, F14).
 *
 * Step 0 (zero NEAR): the registry is a hardcoded seed with the two test
 * agents (motherbrain.app + agentext.pro). Build order step 1 replaces it
 * with the NEAR onchain registry contract (free public RPC reads,
 * KV-cached) — knocks stay P2P worker→worker HTTP, no gas per message.
 *
 * Security model (docs/Neighbors-Feature-Plan.md):
 *   - No auth (securitySchemes: {}) — public read-only skills only
 *   - Rate limited per IP (in-memory per isolate, same as POST /)
 *   - Input length caps + sanitization (reuse security.ts)
 *   - No memory, no accounts, no write access, static answers only
 */

import { checkRateLimit, getClientIP, sanitizeText } from "./security";
import type { SupabaseClient } from "./supabase";

// ============================================
// Module-level config — set per-request from
// Worker env (same pattern as setGatewayUrl /
// setAgentIdentity in index.ts middleware)
// ============================================

let cfgAgentUrl = "";
let cfgName = "";
let cfgDescription = "";
let cfgWebsiteUrl = "";
let cfgNeighborsRpcUrl = "";
let cfgNeighborsContract = "";

/**
 * Chat-DB client for CRM storage (Phase B). Set once per isolate by the
 * index.ts middleware (same pattern as setNeighborConfig). Stateless —
 * just url+key. When absent (no chat DB configured) knocks are still
 * answered; only CRM storage is skipped (fail-open by design).
 */
let cfgDb: SupabaseClient | null = null;

export function setNeighborStore(db: SupabaseClient | null) {
  cfgDb = db;
}

export function setNeighborConfig(opts: {
  agentUrl?: string;
  name?: string;
  description?: string;
  websiteUrl?: string;
  rpcUrl?: string;
  contract?: string;
}) {
  cfgAgentUrl = opts.agentUrl || "";
  cfgName = opts.name || "";
  cfgDescription = opts.description || "";
  cfgWebsiteUrl = opts.websiteUrl || "";
  cfgNeighborsRpcUrl = opts.rpcUrl || "";
  cfgNeighborsContract = opts.contract || "";
}

// ============================================
// The 4 public, read-only Neighbor skills
// ============================================

export const NEIGHBOR_SKILL_IDS = [
  "site-intro",
  "public-docs",
  "contact-info",
  "capabilities",
] as const;

export type NeighborSkillId = (typeof NEIGHBOR_SKILL_IDS)[number];

const NEIGHBOR_SKILLS: Array<{
  id: NeighborSkillId;
  description: string;
}> = [
  {
    id: "site-intro",
    description: "What is your startup? What do you do?",
  },
  {
    id: "public-docs",
    description: "What docs/pages are publicly available?",
  },
  {
    id: "contact-info",
    description: "How can a human reach you?",
  },
  {
    id: "capabilities",
    description: "What tools/skills does your agent support?",
  },
];

// ============================================
// Neighbor agent card (public identity — no auth)
// ============================================

export function buildNeighborCard() {
  return {
    schemaVersion: "1.0",
    protocol: "neighbors/0.1",
    name: cfgName || "Neighbor Agent",
    description:
      cfgDescription ||
      "A public neighbor identity for an A2A Agent deployed through Mother Brain.",
    url: cfgAgentUrl,
    websiteUrl: cfgWebsiteUrl || undefined,
    version: "0.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    // Public endpoint: no auth schemes at all (the whole point).
    securitySchemes: {},
    security: [],
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: NEIGHBOR_SKILLS.map((s) => ({
      id: s.id,
      name: s.id,
      description: s.description,
      tags: ["neighbor", "public"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
    })),
    endpoints: {
      knock: cfgAgentUrl ? `${cfgAgentUrl}/neighbor` : "/neighbor",
    },
  };
}

// ============================================
// Registry — Step 0 seed (hardcoded test agents)
// Step 1 replaces this with NEAR onchain reads.
// ============================================

export interface NeighborEntry {
  name: string;
  domain: string;
  agentUrl: string;
  description: string;
  tags: string[];
  category: string;
  /** Structured capability labels ("ai-memory", "website-builder") —
   * powers the "I need an app for X" matching. Present on onchain
   * entries; optional for seed fallback entries. */
  capabilities?: string[];
}

/**
 * Seed registry for the Step 0 test loop (zero NEAR).
 * These are the two Mother Brain ecosystem test agents.
 * Replaced by the NEAR onchain registry contract reads in build step 1.
 */
const SEED_REGISTRY: NeighborEntry[] = [
  {
    name: "Mother Brain",
    domain: "motherbrain.app",
    agentUrl: "https://a2a.motherbrain.app",
    description:
      "Mother Brain — the memory engine for AI agents. Deploy A2A agents to any website.",
    tags: ["ai", "devtools", "saas", "agents"],
    category: "startup",
    capabilities: ["ai-memory", "agent-deploy", "neighbors-registry"],
  },
  {
    name: "Anakimota",
    domain: "agentext.pro",
    agentUrl: "https://a2a.agentext.pro",
    description:
      "Anakimota — the AI agent for AgenText, building intelligent websites.",
    tags: ["ai", "websites", "agents", "saas"],
    category: "startup",
    capabilities: ["website-builder", "context-aware-chat"],
  },
];

// ============================================
// Registry — Step 1b: live NEAR onchain reads
// (free public RPC, cached 5 min, seed fallback).
// ============================================

/// Default RPC + contract for the testnet phase. Overridable via env
/// (NEIGHBORS_RPC_URL / NEIGHBORS_CONTRACT) once the deploy pipeline
/// ships them; at mainnet graduation these defaults flip to mainnet.
const DEFAULT_RPC_URL = "https://test.rpc.fastnear.com";
const DEFAULT_CONTRACT = "neighborly.testnet";

/** Cache TTL — same pattern as the website-mcp discovery cache. */
const NEIGHBORS_CACHE_TTL = 5 * 60_000; // 5 minutes
let registryCache: { entries: NeighborEntry[]; source: "onchain" | "seed"; at: number } | null = null;

interface OnchainAgentOut {
  account: string;
  name: string;
  domain: string;
  agent_url: string;
  website_url: string;
  description: string;
  tags: string[];
  category: string;
  capabilities: string[];
  status: number;
  partner_note: string;
}

/** Free public RPC view call — returns null on ANY failure (callers fall back). */
async function fetchOnchainRegistry(): Promise<NeighborEntry[] | null> {
  const rpcUrl = cfgNeighborsRpcUrl || DEFAULT_RPC_URL;
  const contract = cfgNeighborsContract || DEFAULT_CONTRACT;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "neighbors",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: contract,
          method_name: "get_agents",
          args_base64: btoa('{"from_index":0,"limit":100}'),
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const json = (await res.json()) as { result?: { result?: number[] } };
    const bytes = json.result?.result;
    if (!Array.isArray(bytes)) throw new Error("unexpected RPC response shape");
    const parsed = JSON.parse(
      new TextDecoder().decode(new Uint8Array(bytes)),
    ) as OnchainAgentOut[];
    // Active entries only — status 1 (paused) means the neighbor has
    // temporarily opted out and should not be discovered or knocked.
    return parsed
      .filter((a) => a.status === 0 && a.agent_url)
      .map((a) => ({
        name: a.name,
        domain: a.domain,
        agentUrl: a.agent_url,
        description: a.description,
        tags: a.tags || [],
        category: a.category || "startup",
        capabilities: a.capabilities || [],
      }));
  } catch (err) {
    console.warn(
      `[neighbor] onchain registry read failed: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/**
 * The registry this agent serves: live onchain entries when the read
 * succeeds, the seed list when it fails (or before first success). Never
 * throws — neighbors tools keep working even if the chain is unreachable.
 */
export async function getRegistry(): Promise<NeighborEntry[]> {
  const now = Date.now();
  if (registryCache && now - registryCache.at < NEIGHBORS_CACHE_TTL) {
    return registryCache.entries;
  }
  const onchain = await fetchOnchainRegistry();
  const entries = onchain ?? SEED_REGISTRY;
  registryCache = {
    entries,
    source: onchain ? "onchain" : "seed",
    at: now,
  };
  if (onchain) {
    console.log(
      `[neighbor] registry: ${onchain.length} onchain agent(s) from ${cfgNeighborsContract || DEFAULT_CONTRACT}`,
    );
  } else {
    console.warn("[neighbor] registry: ONCHAIN READ FAILED — serving seed fallback");
  }
  return entries;
}

/** Which source the current cache came from (for the registry endpoint). */
export function getRegistrySource(): "onchain" | "seed" | "none" {
  return registryCache?.source ?? "none";
}

/**
 * Find a neighbor by name, domain, or agent URL substring (case-insensitive).
 * Exact match first, then fuzzy contains — the LLM often passes descriptors
 * like "Mother on motherbrain.app", so a knock never fails on phrasing alone.
 */
export function findNeighborIn(
  list: NeighborEntry[],
  query: string,
): NeighborEntry | undefined {
  const q = query.trim().toLowerCase().replace(/\/+$/, "");
  if (!q) return undefined;
  // Exact match first (name / domain / agentUrl / knock URL)
  const exact = list.find(
    (n) =>
      n.name.toLowerCase() === q ||
      n.domain.toLowerCase() === q ||
      n.agentUrl.toLowerCase() === q ||
      // Also match "https://a2a.agentext.pro/neighbor" style inputs
      `${n.agentUrl.toLowerCase()}/neighbor` === q,
  );
  if (exact) return exact;
  // Fuzzy fallback: match when the query CONTAINS a known name or domain.
  return (
    list.find((n) => q.includes(n.domain.toLowerCase())) ||
    list.find((n) => q.includes(n.name.toLowerCase())) ||
    list.find((n) =>
      q.includes(n.agentUrl.toLowerCase().replace(/^https?:\/\//, "")),
    )
  );
}

// ============================================
// CRM storage (Phase B — build step 3)
// Inbound AND outbound knocks land in the Conversations screen as
// neighbor threads, using the telegram.ts blueprint: one persistent
// task per neighbor, visitor_id = "neighbor:{domain}". Every write is
// fail-open — a DB problem never breaks the knock reply.
// ============================================

/** Extract a stable, human-readable identity key from a knock sender. */
function parseKnockDomain(from: string, fromUrl?: string): string {
  const clean = (u: string): string => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  if (fromUrl) {
    const d = clean(fromUrl);
    if (d) return d;
  }
  // "Name <https://a2a.agentext.pro>" style from-strings
  const m = from.match(/https?:\/\/([^\s>]+)/);
  if (m) {
    const d = clean(m[0]);
    if (d) return d;
  }
  // Bare domain in the from-string
  const bare = from.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
  if (bare) return bare[0].toLowerCase();
  // Last resort: sanitized from-string
  return (
    from
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "unknown"
  );
}

/** Extract a display name from "Name <url>" / structured fields. */
function parseKnockName(
  from: string,
  fromName?: string,
  domain?: string,
): string {
  if (fromName) return fromName;
  if (from.includes("<")) {
    const angle = from.split("<")[0].trim();
    if (angle) return angle;
  }
  return domain || from || "Neighbor";
}

/** Insert with graceful degradation on optional columns (insertResilient
 * pattern, kept local to avoid a circular import with task-handler.ts). */
async function insertRowResilient(
  table: string,
  fullRow: Record<string, unknown>,
  baseRow: Record<string, unknown>,
): Promise<unknown[]> {
  if (!cfgDb) return [];
  try {
    return (await cfgDb.from(table).then((q) =>
      q.insert<unknown>(fullRow),
    )) as unknown[];
  } catch {
    return (await cfgDb.from(table).then((q) =>
      q.insert<unknown>(baseRow),
    )) as unknown[];
  }
}

/**
 * Store a knock exchange (knock + reply) as a neighbor conversation.
 * Roles: the neighbor is the external party — inbound knocks are "user",
 * our replies "agent"; outbound knocks are "agent", their replies "user".
 * One persistent task per neighbor (visitor_id = neighbor:{domain}).
 */
async function storeNeighborExchange(params: {
  direction: "inbound" | "outbound";
  domain: string;
  name: string;
  agentUrl?: string;
  skill?: string;
  knockText: string;
  replyText: string;
}): Promise<void> {
  if (!cfgDb) return;
  const visitorId = `neighbor:${params.domain}`;
  try {
    // 1. Find or create the persistent neighbor task (telegram pattern)
    let taskId: string | undefined;
    try {
      const existing = await cfgDb.from("tasks").then((q) =>
        q
          .select("id")
          .eq("visitor_id", visitorId)
          .order("created_at", false)
          .limit(1)
          .get<{ id: string }>(),
      );
      if (existing && existing.length > 0) taskId = existing[0].id;
    } catch {
      /* fall through to create */
    }
    if (!taskId) {
      const newId = crypto.randomUUID();
      const meta = {
        source: "neighbor",
        neighbor_name: params.name,
        neighbor_domain: params.domain,
        ...(params.agentUrl ? { neighbor_url: params.agentUrl } : {}),
      };
      const rows = await insertRowResilient(
        "tasks",
        {
          id: newId,
          status: "submitted",
          skill_id: null,
          visitor_id: visitorId,
          license_key: null,
          customer_id: null,
          metadata: meta,
          history: [],
        },
        {
          id: newId,
          status: "submitted",
          skill_id: null,
          visitor_id: visitorId,
          metadata: meta,
          history: [],
        },
      );
      taskId =
        (Array.isArray(rows) ? (rows[0] as { id?: string } | undefined) : undefined)
          ?.id || newId;
    }

    // 2. Store the exchange — knock first, reply second (chronological)
    const msgMeta: Record<string, unknown> = {
      source: "neighbor",
      direction: params.direction,
      ...(params.skill ? { skill: params.skill } : {}),
    };
    const knockRole = params.direction === "inbound" ? "user" : "agent";
    const replyRole = knockRole === "user" ? "agent" : "user";
    const knockMsg = {
      task_id: taskId,
      role: knockRole,
      parts: [{ type: "text", text: params.knockText }],
      visitor_id: visitorId,
      license_key: null,
      customer_id: null,
      metadata: msgMeta,
    };
    const knockBase = {
      task_id: taskId,
      role: knockRole,
      parts: [{ type: "text", text: params.knockText }],
      visitor_id: visitorId,
      metadata: msgMeta,
    };
    const replyMsg = {
      task_id: taskId,
      role: replyRole,
      parts: [{ type: "text", text: params.replyText }],
      visitor_id: visitorId,
      license_key: null,
      customer_id: null,
      metadata: msgMeta,
    };
    const replyBase = {
      task_id: taskId,
      role: replyRole,
      parts: [{ type: "text", text: params.replyText }],
      visitor_id: visitorId,
      metadata: msgMeta,
    };
    await insertRowResilient("task_messages", knockMsg, knockBase);
    await insertRowResilient("task_messages", replyMsg, replyBase);

    // 3. Green "completed" chip in the CRM list
    try {
      await cfgDb
        .from("tasks")
        .then((q) => q.eq("id", taskId).update({ status: "completed" }));
    } catch {
      /* cosmetic */
    }

    // 4. Entity — the neighbor as an ai_agent (powers the Entities screen)
    try {
      await cfgDb.rpc("upsert_entity", {
        p_visitor_id: visitorId,
        p_entity_type: "ai_agent",
        p_source: "neighbor",
        p_entity_name: params.name || undefined,
        ...(params.agentUrl
          ? {
              p_agent_card: {
                name: params.name,
                domain: params.domain,
                agent_url: params.agentUrl,
                protocol: "neighbors/0.1",
              },
            }
          : {}),
      });
    } catch (entityErr) {
      console.warn(
        "[neighbor] entity upsert failed:",
        entityErr instanceof Error ? entityErr.message : entityErr,
      );
    }
    console.log(
      `[neighbor] stored ${params.direction} exchange: ${visitorId}`,
    );
  } catch (err) {
    // Fail-open: the knock reply must never break because of storage.
    console.warn(
      "[neighbor] CRM storage failed (knock still answered):",
      err instanceof Error ? err.message : err,
    );
  }
}

// ============================================
// Knock receiving (POST /neighbor)
// ============================================

/** Max knock body size in bytes (plan: 4 KB message; 8 KB body headroom) */
const MAX_KNOCK_BODY_BYTES = 8192;

/** Max knock message text in characters */
const MAX_KNOCK_TEXT = 4000;

interface KnockPayload {
  from?: string;
  /** Structured sender identity (added by our own workers so MB-to-MB
   * knocks identify each other reliably; third parties may omit). */
  from_name?: string;
  from_url?: string;
  skill?: string;
  message?: string;
}

/**
 * Static skill answers (Decision Log F11: static-first for the 4 public
 * skills — no LLM call, no cost, no prompt-injection surface). LLM-backed
 * neighbor conversation arrives with the CRM integration (build step 3).
 */
function answerSkill(skill: NeighborSkillId): string {
  const name = cfgName || "this agent";
  const site = cfgWebsiteUrl || "our website";
  const main = cfgAgentUrl || "the main agent endpoint";
  switch (skill) {
    case "site-intro": {
      // Avoid "I'm Mother — Mother is the AI support agent…" when the
      // description already starts with the agent's own name.
      const desc =
        cfgDescription || "an A2A Agent deployed through Mother Brain";
      const intro =
        cfgName && desc.toLowerCase().startsWith(cfgName.toLowerCase())
          ? `Hi! ${desc}`
          : `Hi! I'm ${name} — ${desc}`;
      return (
        `${intro}. ` +
        `Website: ${site}. This is my public neighbor identity; for full help, ` +
        `chat with my main agent at ${main}.`
      );
    }
    case "public-docs":
      return (
        `Public pages and documentation live on our website: ${site}. ` +
        `My main agent (${main}) can answer detailed questions about our product.`
      );
    case "contact-info":
      return (
        `The best way to reach a human is through our website: ${site}. ` +
        `For anything automated, my main agent is at ${main}.`
      );
    case "capabilities":
      return (
        `My public neighbor skills: ${NEIGHBOR_SKILL_IDS.join(", ")}. ` +
        `My full (private) skill set is listed on my agent card: ${main}/.well-known/agent-card.json.`
      );
  }
}

/**
 * Handle an inbound knock. Returns { status, body } so the Hono route can
 * respond with c.json(body, status). Rate limited per IP; validates and
 * sanitizes input; answers statically; stores the exchange as a neighbor
 * conversation in the CRM (fail-open — storage errors never break the reply).
 */
export async function handleNeighborKnock(
  request: Request,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // ── Rate limit: per IP (namespace separate from the main endpoint) ──
  const ip = getClientIP(request);
  const rate = checkRateLimit(`neighbor:${ip}`);
  if (!rate.allowed) {
    return {
      status: 429,
      body: {
        ok: false,
        error: "Rate limit exceeded. Please wait a moment.",
        retryAt: new Date(rate.resetAt).toISOString(),
      },
    };
  }

  // ── Body size cap ──
  const raw = await request.text();
  if (raw.length > MAX_KNOCK_BODY_BYTES) {
    return {
      status: 413,
      body: {
        ok: false,
        error: `Knock body too large (max ${MAX_KNOCK_BODY_BYTES} bytes).`,
      },
    };
  }

  // ── Parse + validate payload ──
  let payload: KnockPayload;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    payload = parsed as KnockPayload;
  } catch {
    return {
      status: 400,
      body: { ok: false, error: "Knock body must be a JSON object." },
    };
  }

  const from = sanitizeText(String(payload.from || "unknown-agent")).slice(0, 200);
  const fromName = payload.from_name
    ? sanitizeText(String(payload.from_name)).slice(0, 100)
    : undefined;
  const fromUrl = payload.from_url
    ? sanitizeText(String(payload.from_url)).slice(0, 300)
    : undefined;
  const skillRaw = payload.skill ? String(payload.skill) : "";
  const message = payload.message
    ? sanitizeText(String(payload.message)).slice(0, MAX_KNOCK_TEXT)
    : "";

  const skill: NeighborSkillId | undefined = NEIGHBOR_SKILL_IDS.includes(
    skillRaw as NeighborSkillId,
  )
    ? (skillRaw as NeighborSkillId)
    : undefined;

  if (skillRaw && !skill) {
    return {
      status: 400,
      body: {
        ok: false,
        error: `Unknown skill "${skillRaw.slice(0, 50)}". Available: ${NEIGHBOR_SKILL_IDS.join(", ")}.`,
      },
    };
  }

  // ── Answer (static — see answerSkill) + store the exchange (Phase B) ──
  console.log(
    `[neighbor] Knock from=${from} skill=${skill || "(none)"} messageLen=${message.length}`,
  );

  const knockDomain = parseKnockDomain(from, fromUrl);
  const knockName = parseKnockName(from, fromName, knockDomain);

  if (skill) {
    const reply = answerSkill(skill);
    await storeNeighborExchange({
      direction: "inbound",
      domain: knockDomain,
      name: knockName,
      agentUrl: fromUrl,
      skill,
      knockText: message
        ? `(skill: ${skill}) ${message}`
        : `(skill: ${skill})`,
      replyText: reply,
    });
    return {
      status: 200,
      body: {
        ok: true,
        protocol: "neighbors/0.1",
        neighbor: cfgName || "neighbor-agent",
        skill,
        reply,
      },
    };
  }

  // Free-text knock (no skill): acknowledge + intro + honest follow-up note.
  const freeReply =
    `${answerSkill("site-intro")}\n\n` +
    `Thanks for knocking${from && from !== "unknown-agent" ? `, ${from}` : ""}! ` +
    `Your message was received and logged — it's now visible to our team in ` +
    `their Conversations screen. For quick answers, try one of my skills: ` +
    `${NEIGHBOR_SKILL_IDS.join(", ")}.`;
  await storeNeighborExchange({
    direction: "inbound",
    domain: knockDomain,
    name: knockName,
    agentUrl: fromUrl,
    knockText: message || "(empty knock)",
    replyText: freeReply,
  });
  return {
    status: 200,
    body: {
      ok: true,
      protocol: "neighbors/0.1",
      neighbor: cfgName || "neighbor-agent",
      skill: "site-intro",
      reply: freeReply,
    },
  };
}

// ============================================
// Local agent tools (Workers-AI path)
// neighbors_search + neighbors_knock — executed
// in THIS worker, no MCP round-trip.
// ============================================

export function getNeighborToolDefs() {
  return [
    {
      type: "function" as const,
      function: {
        name: "neighbors_search",
        description:
          "Search the Neighbors registry — other A2A agents on the Neighbors network " +
          "that you can contact. Returns their name, description, tags, and agent endpoint. " +
          "Use neighbors_knock afterwards to contact one.",
        parameters: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description:
                "Optional keyword to filter by name, tag, or description. Omit to list all neighbors.",
            },
          },
          required: [] as string[],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "neighbors_knock",
        description:
          "Knock on a neighbor agent's door — send a message to another A2A agent's " +
          "public neighbor endpoint. Use the exact name, domain, or agentUrl from " +
          "neighbors_search. Optionally pick one of their public skills, or send a " +
          "free-text introduction/message.",
        parameters: {
          type: "object" as const,
          properties: {
            neighbor: {
              type: "string",
              description: "The neighbor's name, domain, or agentUrl from neighbors_search.",
            },
            skill: {
              type: "string",
              enum: [...NEIGHBOR_SKILL_IDS],
              description:
                "Optional public skill to request: site-intro, public-docs, contact-info, or capabilities.",
            },
            message: {
              type: "string",
              description:
                "Optional free-text message or introduction for the neighbor (max ~500 chars recommended).",
            },
          },
          required: ["neighbor"] as string[],
        },
      },
    },
  ];
}

/**
 * Execute a neighbor tool locally.
 *
 * SSRF note: neighbors_knock only accepts targets that exist in the
 * registry (membership check, not arbitrary URLs) — the agent cannot be
 * tricked into probing internal addresses. When the NEAR registry lands,
 * entries there become knockable the same way.
 */
export async function executeNeighborTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (toolName === "neighbors_search") {
    const query = args.query ? String(args.query).toLowerCase() : "";
    const all = await getRegistry();
    const matches = query
      ? all.filter((n) =>
          [n.name, n.domain, n.description, n.category, ...n.tags, ...(n.capabilities || [])]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : all;
    if (matches.length === 0) {
      return `No neighbors matched "${query}". The registry currently has ${all.length} neighbor(s): ${all
        .map((n) => n.name)
        .join(", ")}.`;
    }
    return (
      `Neighbors registry (${matches.length} match(es)):\n` +
      matches
        .map(
          (n) =>
            `- ${n.name} (${n.domain}) — ${n.description}\n  agentUrl: ${n.agentUrl}\n  tags: ${n.tags.join(", ")}` +
            (n.capabilities && n.capabilities.length > 0
              ? `\n  capabilities: ${n.capabilities.join(", ")}`
              : ""),
        )
        .join("\n") +
      `\nUse neighbors_knock with a neighbor's name/domain/agentUrl to contact them.`
    );
  }

  if (toolName === "neighbors_knock") {
    const target = args.neighbor ? String(args.neighbor) : "";
    if (!target) {
      return "Tool error: neighbors_knock requires a 'neighbor' argument (name, domain, or agentUrl from neighbors_search).";
    }
    // Registry membership only — no arbitrary URLs (SSRF guard).
    const registry = await getRegistry();
    const entry = findNeighborIn(registry, target);
    if (!entry) {
      return (
        `Tool error: "${target.slice(0, 80)}" is not in the Neighbors registry. ` +
        `Run neighbors_search first and use an exact name/domain/agentUrl.`
      );
    }
    // Don't knock on our own door.
    if (cfgAgentUrl && entry.agentUrl === cfgAgentUrl) {
      return "Tool note: that's me — you already have all my knowledge. Pick a different neighbor to knock.";
    }

    const skill = NEIGHBOR_SKILL_IDS.includes(args.skill as NeighborSkillId)
      ? (args.skill as NeighborSkillId)
      : undefined;
    const message = args.message ? sanitizeText(String(args.message)).slice(0, MAX_KNOCK_TEXT) : "";
    const from = cfgName && cfgAgentUrl ? `${cfgName} <${cfgAgentUrl}>` : cfgAgentUrl || "unknown-agent";

    const knockUrl = `${entry.agentUrl}/neighbor`;
    try {
      const res = await fetch(knockUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Structured from_name/from_url let receiving MB agents identify
        // us reliably (Phase B); plain `from` stays for third parties.
        body: JSON.stringify({
          from,
          ...(cfgName ? { from_name: cfgName } : {}),
          ...(cfgAgentUrl ? { from_url: cfgAgentUrl } : {}),
          ...(skill ? { skill } : {}),
          ...(message ? { message } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      let reply = text;
      try {
        const json = JSON.parse(text) as { ok?: boolean; reply?: string; error?: string };
        reply = json.ok && json.reply ? json.reply : json.error || text;
      } catch {
        // Non-JSON reply — return as-is (trimmed)
        reply = text.slice(0, 2000);
      }
      // Log the exchange on OUR side too (plan: "log conversation in CRM") —
      // our knock = agent message, their reply = user message, one thread
      // per neighbor (visitor_id = neighbor:{domain}). Fail-open. Only for
      // delivered knocks — failed deliveries already surface in the tool
      // result inside the user's chat thread.
      if (res.ok) {
        await storeNeighborExchange({
          direction: "outbound",
          domain: entry.domain,
          name: entry.name,
          agentUrl: entry.agentUrl,
          skill,
          knockText: message
            ? `(knock) ${message}`
            : skill
              ? `(knock · skill: ${skill})`
              : "(knock)",
          replyText: reply.slice(0, 2000),
        });
      }
      return `Knock delivered to ${entry.name} (${knockUrl}) — HTTP ${res.status}.\nTheir reply:\n${reply.slice(0, 2000)}`;
    } catch (err) {
      return (
        `Tool error: failed to knock on ${entry.name} (${knockUrl}): ` +
        `${err instanceof Error ? err.message : String(err)}. The neighbor may be offline — try again later.`
      );
    }
  }

  return `Tool error: unknown neighbor tool "${toolName}".`;
}
