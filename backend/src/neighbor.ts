/**
 * Neighbors — the public face of an A2A Agent.
 *
 * Every deployed agent gets a PUBLIC, no-auth neighbor identity:
 *   GET  /neighbor          → public Neighbor agent card (discovery)
 *   POST /neighbor          → receive a "knock" from another agent
 *   GET  /neighbor/registry → the Neighbors Network this agent knows
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
import { SupabaseClient } from "./supabase";
import type { Env, Message } from "./types";
// Cycle note: task-handler imports neighbor for the tools; neighbor imports
// task-handler for the LLM knock pipeline. Both are runtime-only (hoisted
// function declarations) — safe under esbuild/wrangler bundling (verified
// via wrangler deploy --dry-run).
import { handleTaskMessage } from "./task-handler";

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
let cfgCurator = "";

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
  curator?: string;
}) {
  cfgAgentUrl = opts.agentUrl || "";
  cfgName = opts.name || "";
  cfgDescription = opts.description || "";
  cfgWebsiteUrl = opts.websiteUrl || "";
  cfgNeighborsRpcUrl = opts.rpcUrl || "";
  cfgNeighborsContract = opts.contract || "";
  cfgCurator = (opts.curator || "").trim().toLowerCase();
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
async function neighborsViewCall<T>(
  method: string,
  args: Record<string, unknown>,
): Promise<T | null> {
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
          method_name: method,
          args_base64: btoa(JSON.stringify(args)),
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const json = (await res.json()) as { result?: { result?: number[] } };
    const bytes = json.result?.result;
    if (!Array.isArray(bytes)) throw new Error("unexpected RPC response shape");
    return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
  } catch (err) {
    console.warn(
      `[neighbor] view call ${method} failed: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

async function fetchOnchainRegistry(): Promise<NeighborEntry[] | null> {
  const parsed = await neighborsViewCall<OnchainAgentOut[]>("get_agents", {
    from_index: 0,
    limit: 100,
  });
  if (!parsed) return null;
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

// ============================================
// Approved neighbors (v1.2.211) — the owner's
// published named lists, read onchain. The ONLY
// neighbors the agent may mention or recommend.
// FAIL-CLOSED: when the chain can't be read the
// approved set is "unavailable" — it is NEVER
// widened to the raw registry (competitor guard).
// ============================================

interface NamedListSummary {
  slug: string;
  title: string;
  description: string;
  member_count: number;
  updated_at: number;
}

interface NamedListRow {
  account: string;
  tier: number; // 0 = listed, 1 = partner ★
  name: string;
  domain: string;
  agent_url: string;
  description: string;
  tags?: string[];
  category?: string;
  capabilities?: string[];
  status?: number;
}

interface NamedListOut {
  slug: string;
  title: string;
  updated_at: number;
  members: NamedListRow[];
}

export interface ApprovedNeighbor extends NeighborEntry {
  account: string;
  tier: number;
  lists: string[]; // slugs this neighbor appears on
}

export interface ApprovedSnapshot {
  state: "ok" | "no-curator" | "unreadable";
  entries: ApprovedNeighbor[];
  lists: string[]; // published slugs
  error?: string;
}

let approvedCache: { snap: ApprovedSnapshot; at: number } | null = null;
const APPROVED_FAIL_TTL = 30_000; // retry failed reads sooner than the 5-min TTL

/**
 * The union of THIS agent's own named-list members — its APPROVED neighbors
 * (what the owner published to the website). Cached 5 min; failures cached
 * 30 s. Partial reads stay "ok": every returned entry is individually
 * approved, a missing list only means fewer referrals — but a failed INDEX
 * read is "unreadable" (fail-closed: recommend nobody).
 */
export async function getApprovedNeighbors(): Promise<ApprovedSnapshot> {
  const now = Date.now();
  if (
    approvedCache &&
    now - approvedCache.at <
      (approvedCache.snap.state === "ok" ? NEIGHBORS_CACHE_TTL : APPROVED_FAIL_TTL)
  ) {
    return approvedCache.snap;
  }
  if (!cfgCurator) {
    const snap: ApprovedSnapshot = { state: "no-curator", entries: [], lists: [] };
    approvedCache = { snap, at: now };
    return snap;
  }
  const summaries = await neighborsViewCall<NamedListSummary[]>("get_named_lists", {
    curator: cfgCurator,
  });
  if (!summaries) {
    const snap: ApprovedSnapshot = {
      state: "unreadable",
      entries: [],
      lists: [],
      error: "get_named_lists read failed",
    };
    approvedCache = { snap, at: now };
    return snap;
  }
  const lists = summaries.map((s) => s.slug).slice(0, 20); // contract cap
  const outs = await Promise.all(
    lists.map((slug) =>
      neighborsViewCall<NamedListOut | null>("get_named_list", {
        curator: cfgCurator,
        slug,
      }),
    ),
  );
  const byAccount = new Map<string, ApprovedNeighbor>();
  for (let i = 0; i < outs.length; i++) {
    const out = outs[i];
    if (!out || !Array.isArray(out.members)) continue;
    for (const m of out.members) {
      if (!m || !m.account || !m.agent_url) continue;
      // Paused members are not discoverable — not recommendable either.
      if (m.status !== undefined && m.status !== 0) continue;
      const key = m.account.toLowerCase();
      const existing = byAccount.get(key);
      if (existing) {
        if (!existing.lists.includes(lists[i])) existing.lists.push(lists[i]);
        if ((m.tier || 0) > existing.tier) existing.tier = m.tier || 0;
      } else {
        byAccount.set(key, {
          account: m.account,
          tier: m.tier || 0,
          lists: [lists[i]],
          name: m.name,
          domain: m.domain,
          agentUrl: m.agent_url,
          description: m.description || "",
          tags: m.tags || [],
          category: m.category || "startup",
          capabilities: m.capabilities || [],
        });
      }
    }
  }
  const snap: ApprovedSnapshot = { state: "ok", entries: [...byAccount.values()], lists };
  approvedCache = { snap, at: now };
  console.log(
    `[neighbor] approved: ${snap.entries.length} neighbor(s) across ${lists.length} list(s) for ${cfgCurator}`,
  );
  return snap;
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
/** Find or create the persistent neighbor task (telegram pattern).
 *  Returns the taskId, or null when storage is unavailable. */
async function findOrCreateNeighborTask(params: {
  domain: string;
  name: string;
  agentUrl?: string;
}): Promise<string | null> {
  if (!cfgDb) return null;
  const visitorId = `neighbor:${params.domain}`;
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
  return taskId || null;
}

/** Mark the task completed (green CRM chip) — cosmetic, never throws. */
async function markNeighborTaskCompleted(taskId: string): Promise<void> {
  try {
    await cfgDb
      ?.from("tasks")
      .then((q) => q.eq("id", taskId).update({ status: "completed" }));
  } catch {
    /* cosmetic */
  }
}

/** The neighbor as an ai_agent entity (powers the Entities screen). */
async function upsertNeighborEntity(params: {
  domain: string;
  name: string;
  agentUrl?: string;
}): Promise<void> {
  if (!cfgDb) return;
  const visitorId = `neighbor:${params.domain}`;
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
}

export async function storeNeighborExchange(params: {
  direction: "inbound" | "outbound";
  domain: string;
  name: string;
  agentUrl?: string;
  skill?: string;
  /** Message kind marker — "knick-notify" flags Discovery notifications
   *  (feeds GET /neighbor/notifications). */
  kind?: string;
  knockText: string;
  replyText: string;
}): Promise<void> {
  if (!cfgDb) return;
  const visitorId = `neighbor:${params.domain}`;
  try {
    // 1. Find or create the persistent neighbor task
    const taskId = await findOrCreateNeighborTask(params);
    if (!taskId) return;

    // 2. Store the exchange — knock first, reply second (chronological)
    const msgMeta: Record<string, unknown> = {
      source: "neighbor",
      direction: params.direction,
      ...(params.kind ? { kind: params.kind } : {}),
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
    await markNeighborTaskCompleted(taskId);

    // 4. Entity
    await upsertNeighborEntity(params);
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
// Thread consolidation — one neighbor, ONE thread, forever
// ============================================

/**
 * Merge duplicate neighbor threads/entities created BEFORE registry-unified
 * identity (v1.2.171, 2026-08-25). Legacy keys used the agentUrl hostname
 * (neighbor:a2a.agentext.pro) while canonical keys use the registry domain
 * (neighbor:agentext.pro) — one neighbor could show as two Conversations
 * threads + two entities. This re-points everything to the canonical key:
 *   1. Group all neighbor:* tasks by canonical registry domain
 *   2. Survivor = earliest-created task; duplicates' messages move to it,
 *      duplicate task rows are deleted
 *   3. Legacy-keyed tasks/messages rename to the canonical visitor_id
 *   4. Legacy entity rows merge into the canonical entity (upsert + delete)
 * Idempotent — safe to re-run. Fail-open per item.
 */
export interface ConsolidateStats {
  neighbors: number;
  tasksMerged: number;
  tasksRenamed: number;
  messagesMoved: number;
  messagesRenamed: number;
  entitiesMerged: number;
}

export async function consolidateNeighborThreads(
  env: Env,
): Promise<ConsolidateStats> {
  const stats: ConsolidateStats = {
    neighbors: 0,
    tasksMerged: 0,
    tasksRenamed: 0,
    messagesMoved: 0,
    messagesRenamed: 0,
    entitiesMerged: 0,
  };

  const db = new SupabaseClient(env);
  try {
    setNeighborStore(db);
  } catch {
    /* consolidation uses `db` directly */
  }
  setNeighborConfig({
    agentUrl: env.AGENT_URL,
    name: env.AGENT_NAME,
    description: env.AGENT_DESCRIPTION,
    websiteUrl: env.WEBSITE_URL,
    rpcUrl: env.NEIGHBORS_RPC_URL,
    contract: env.NEIGHBORS_CONTRACT,
    curator: env.NEIGHBORS_CURATOR,
  });

  // host → canonical registry domain (both domain-key and agentUrl hostname)
  const registry = await getRegistry();
  const hostToDomain = new Map<string, string>();
  for (const n of registry) {
    hostToDomain.set(n.domain.toLowerCase(), n.domain);
    try {
      const u = new URL(n.agentUrl);
      hostToDomain.set(u.hostname.toLowerCase(), n.domain);
    } catch {
      /* bad agentUrl in registry — skip */
    }
  }

  // All neighbor tasks, oldest first
  const all = await db
    .from("tasks")
    .then((q) =>
      q
        .select("id, visitor_id, created_at")
        .order("created_at", true)
        .limit(500)
        .get<{ id: string; visitor_id?: string; created_at?: string }>(),
    );
  const nbTasks = (all || []).filter((t) =>
    (t.visitor_id || "").startsWith("neighbor:"),
  );

  // Group by canonical domain
  const families = new Map<
    string,
    Array<{ id: string; visitorId: string; created: string }>
  >();
  for (const t of nbTasks) {
    const host = (t.visitor_id || "").slice("neighbor:".length);
    const canonical = hostToDomain.get(host.toLowerCase()) || host;
    const arr = families.get(canonical) || [];
    arr.push({
      id: t.id,
      visitorId: t.visitor_id || "",
      created: t.created_at || "",
    });
    families.set(canonical, arr);
  }
  stats.neighbors = families.size;

  for (const [canonical, tasks] of families) {
    const canonicalVid = `neighbor:${canonical}`;
    const sorted = [...tasks].sort((a, b) =>
      a.created < b.created ? -1 : a.created > b.created ? 1 : 0,
    );
    const survivor = sorted[0];

    // 1+2. Merge duplicate tasks into the survivor (oldest keeps its date)
    for (const t of sorted.slice(1)) {
      try {
        const moved = await db.from("task_messages").then((q) =>
          q.eq("task_id", t.id).update<{ id: string }>({ task_id: survivor.id }),
        );
        stats.messagesMoved += (moved || []).length;
        await db.from("tasks").then((q) => q.eq("id", t.id).delete());
        stats.tasksMerged++;
      } catch {
        /* fail-open per task */
      }
    }

    // 3. Rename legacy-keyed survivor + all its messages to canonical
    const legacyKeys = new Set(
      tasks.map((t) => t.visitorId).filter((v) => v && v !== canonicalVid),
    );
    if (survivor.visitorId !== canonicalVid) {
      try {
        await db
          .from("tasks")
          .then((q) => q.eq("id", survivor.id).update({ visitor_id: canonicalVid }));
        stats.tasksRenamed++;
      } catch {
        /* fail-open */
      }
    }
    for (const legacy of legacyKeys) {
      try {
        const upd = await db.from("task_messages").then((q) =>
          q
            .eq("visitor_id", legacy)
            .update<{ id: string }>({ visitor_id: canonicalVid }),
        );
        stats.messagesRenamed += (upd || []).length;

        // 4. Merge entity: upsert canonical, delete legacy rows
        const entry = registry.find((n) => n.domain === canonical);
        try {
          await upsertNeighborEntity({
            domain: canonical,
            name: entry?.name || canonical,
            agentUrl: entry?.agentUrl,
          });
        } catch {
          /* entity upsert is best-effort */
        }
        try {
          await db.from("entities").then((q) => q.eq("visitor_id", legacy).delete());
          stats.entitiesMerged++;
        } catch {
          /* fail-open */
        }
      } catch {
        /* fail-open per legacy key */
      }
    }
  }
  return stats;
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
  /** Knock type — "knick-notify" = a Discovery notification (Knick found +
   * added this agent); NOT a conversation. Stored without LLM processing. */
  type?: string;
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
/** Discovery notifications for the 📬 inbox — recent knick-notify knocks
 *  received (inbound only), newest first. Reads the same neighbor threads
 *  the Conversations screen uses; matches on the metadata kind flag with a
 *  message-prefix fallback for robustness. */
export interface NeighborNotification {
  domain: string;
  name: string;
  text: string;
  createdAt: string;
}

export async function getNeighborNotifications(
  limit = 25,
): Promise<NeighborNotification[]> {
  if (!cfgDb) return [];
  try {
    const rows = (await cfgDb.from("task_messages").then((q) =>
      q
        .select("visitor_id, role, parts, metadata, created_at")
        .order("created_at", false)
        .limit(250),
    )) as Array<{
      visitor_id?: string;
      role?: string;
      parts?: Array<{ type?: string; text?: string }>;
      metadata?: Record<string, unknown> | null;
      created_at?: string;
    }>;
    let names = new Map<string, string>();
    try {
      const registry = await getRegistry();
      names = new Map(registry.map((n) => [n.domain, n.name]));
    } catch {
      /* names resolve to domains */
    }
    const out: NeighborNotification[] = [];
    for (const m of rows || []) {
      if (!(m.visitor_id || "").startsWith("neighbor:")) continue;
      if ((m.role || "") !== "user") continue; // inbound knock, not our ack
      const text = (m.parts || [])
        .filter((p) => p?.type === "text")
        .map((p) => p.text || "")
        .join("\n");
      const isNotify =
        m.metadata?.kind === "knick-notify" ||
        text.startsWith("📮 Discovery notification");
      if (!isNotify) continue;
      const domain = String(m.visitor_id || "").slice("neighbor:".length);
      if (!domain) continue;
      out.push({
        domain,
        name: names.get(domain) || domain,
        text: text.slice(0, 400),
        createdAt: String(m.created_at || ""),
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function handleNeighborKnock(
  request: Request,
  env?: Env,
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

  // Resolve the sender through the REGISTRY first so inbound threads use
  // the same identity key as outbound ones (registry domain). Without this,
  // inbound used the agentUrl hostname (a2a.x.com) vs outbound's registry
  // domain (x.com) — splitting one neighbor into two Conversations threads.
  // (Caught live 2026-08-25 during the Phase B knock test.)
  let knockDomain = parseKnockDomain(from, fromUrl);
  let knockName = parseKnockName(from, fromName, knockDomain);
  let knockAgentUrl = fromUrl || undefined;
  try {
    const registry = await getRegistry();
    const entry =
      (fromUrl && registry.find((n) => n.agentUrl === fromUrl)) ||
      registry.find(
        (n) =>
          n.domain === knockDomain ||
          n.agentUrl.toLowerCase().includes(`://${knockDomain}`),
      );
    if (entry) {
      knockDomain = entry.domain;
      knockName = entry.name;
      knockAgentUrl = entry.agentUrl;
    }
  } catch {
    /* registry unavailable — hostname identity is fine */
  }

  // ── Typed knock: knick-notify — a Discovery notification, not a
  // conversation. The sender's owner added this agent to THEIR Neighbors
  // Network; Knick pinged us to say hello. Store it in the neighbor thread
  // WITHOUT the LLM pipeline (no auto-reply burn) and ack statically. The
  // receiving owner sees it in Conversations + the 📬 inbox badge
  // (GET /neighbor/notifications).
  if (String(payload.type || "") === "knick-notify") {
    const ack =
      "[notification received] The owner will see this in their 📬 inbox — thanks for the hello!";
    await storeNeighborExchange({
      direction: "inbound",
      domain: knockDomain,
      name: knockName,
      agentUrl: knockAgentUrl,
      kind: "knick-notify",
      knockText: message || "(knick-notify)",
      replyText: ack,
    });
    return {
      status: 200,
      body: {
        ok: true,
        protocol: "neighbors/0.1",
        neighbor: cfgName || "neighbor-agent",
        mode: "notify",
        reply: ack,
      },
    };
  }

  if (skill) {
    const reply = answerSkill(skill);
    await storeNeighborExchange({
      direction: "inbound",
      domain: knockDomain,
      name: knockName,
      agentUrl: knockAgentUrl,
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

  // ── Free-text knock: REAL conversation (2026-08-25, F11 evolved) ──
  // Route through the agent's full pipeline — LLM + MCP tools + knowledge
  // base + thread memory (the persistent neighbor task) — the same brain
  // website visitors get. Falls back to the static intro only when the
  // pipeline is unavailable or fails. Skill knocks above stay static
  // (factual, instant, free — keeps Finish & Verify cheap).
  let pipelineRan = false;
  if (cfgDb && env && message.trim()) {
    try {
      const visitorId = `neighbor:${knockDomain}`;
      const taskId = await findOrCreateNeighborTask({
        domain: knockDomain,
        name: knockName,
        agentUrl: knockAgentUrl,
      });
      if (taskId) {
        await upsertNeighborEntity({
          domain: knockDomain,
          name: knockName,
          agentUrl: knockAgentUrl,
        });
        const knockMsg: Message = {
          role: "user",
          parts: [
            {
              type: "text",
              text: `[Neighbor knock from ${from}] ${message}`,
            },
          ],
        };
        pipelineRan = true;
        await handleTaskMessage(
          taskId,
          knockMsg,
          undefined, // skillId — default prompt; identity + tools + KB apply
          cfgDb,
          env.MOTHER_BRAIN_GATEWAY_TOKEN,
          visitorId,
          env.VOYAGE_API_KEY,
          env.EMBEDDING_MODEL,
          env.AI_MODEL,
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
            cfMaxTokens: env.CF_MAX_TOKENS
              ? parseInt(env.CF_MAX_TOKENS, 10)
              : undefined,
            cfTemperature: env.CF_TEMPERATURE
              ? parseFloat(env.CF_TEMPERATURE)
              : undefined,
          },
          undefined, // licenseKey — neighbors don't use license keys
          undefined, // customerId
          env.CF_WORKER_MODEL,
          env.FORCE_CF_WORKER === "true",
          env.WEBSITE_URL || cfgAgentUrl,
        );
        // Reply = the agent's latest message in the thread (the pipeline
        // stored both sides) — same fetch pattern as the Telegram handler.
        const msgs = await cfgDb.from("task_messages").then((q) =>
          q
            .select("role, parts, created_at")
            .eq("task_id", taskId)
            .order("created_at", false)
            .limit(5)
            .get<{
              role: string;
              parts: Array<{ type: string; text?: string }>;
              created_at: string;
            }>(),
        );
        const agentMsg = (msgs || []).find((m) => m.role === "agent");
        const replyText = agentMsg
          ? agentMsg.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text || "")
              .join("")
          : "";
        if (replyText.trim()) {
          await markNeighborTaskCompleted(taskId);
          console.log(
            `[neighbor] LLM knock reply → ${from} (${knockDomain})`,
          );
          return {
            status: 200,
            body: {
              ok: true,
              protocol: "neighbors/0.1",
              neighbor: cfgName || "neighbor-agent",
              mode: "agent",
              reply: replyText.slice(0, MAX_KNOCK_TEXT),
            },
          };
        }
      }
    } catch (err) {
      console.warn(
        "[neighbor] LLM knock pipeline failed — static fallback:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Static fallback (also the only path without env/db configured). If the
  // pipeline already ran and stored the knock, don't double-store it.
  const freeReply =
    `${answerSkill("site-intro")}\n\n` +
    `Thanks for knocking${from && from !== "unknown-agent" ? `, ${from}` : ""}! ` +
    `Your message was received and logged — it's now visible to our team in ` +
    `their Conversations screen.`;
  if (!pipelineRan) {
    await storeNeighborExchange({
      direction: "inbound",
      domain: knockDomain,
      name: knockName,
      agentUrl: knockAgentUrl,
      knockText: message || "(empty knock)",
      replyText: freeReply,
    });
  }
  return {
    status: 200,
    body: {
      ok: true,
      protocol: "neighbors/0.1",
      neighbor: cfgName || "neighbor-agent",
      skill: "site-intro",
      mode: pipelineRan ? "agent" : "static",
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
          "Search APPROVED neighbors — the curated lists your owner published onchain " +
          "(the same lists shown on your website). Returns name, description, tags, and " +
          "agent endpoint. ONLY neighbors returned by the default scope may be " +
          "mentioned or recommended to anyone. Use scope \"all\" ONLY when the user " +
          "explicitly asks to search the whole Neighbors network — those results are " +
          "directory information and must NOT be recommended. Use neighbors_knock " +
          "afterwards to contact one.",
        parameters: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description:
                "Optional keyword to filter by name, tag, or description. Omit to list all (within the chosen scope).",
            },
            scope: {
              type: "string",
              enum: ["approved", "all"],
              description:
                "\"approved\" (DEFAULT) = your owner's published lists — the only neighbors you may " +
                "mention or recommend. \"all\" = the entire network registry — ONLY when the user " +
                "explicitly asks to search the whole network.",
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
    // DEFAULT scope = "approved" (competitor guard). "all" is a deliberate
    // explicit choice governed by the tool description + system prompt.
    const scope = args.scope === "all" ? "all" : "approved";

    if (scope === "approved") {
      const snap = await getApprovedNeighbors();
      if (snap.state === "no-curator") {
        return (
          `No approved neighbors: this agent has no NEAR account configured, so its owner has ` +
          `no published lists. Do NOT mention or recommend any neighbor in your reply. ` +
          `If the user explicitly asks to search the whole network, you may call this tool ` +
          `again with scope "all" (directory information only — still recommend no one).`
        );
      }
      if (snap.state === "unreadable") {
        return (
          `Tool error: couldn't read your owner's approved lists from the chain ` +
          `(${snap.error || "RPC read failed"}). Do NOT mention or recommend any neighbor ` +
          `right now — answer from your own knowledge instead. If the user explicitly asks, ` +
          `scope "all" searches the whole network (directory information only).`
        );
      }
      const listNote =
        snap.lists.length > 0 ? `#${snap.lists.join(", #")}` : "none yet";
      if (snap.entries.length === 0) {
        return (
          `No approved neighbors yet — your owner's published lists: ${listNote}. ` +
          `Do NOT mention or recommend any neighbor until they publish lists. If the user ` +
          `explicitly asks to search the whole network, you may use scope "all" ` +
          `(directory information only — still recommend no one).`
        );
      }
      const pool = query
        ? snap.entries.filter((n) =>
            [n.name, n.domain, n.description, n.category, ...n.tags, ...(n.capabilities || []), ...n.lists]
              .join(" ")
              .toLowerCase()
              .includes(query),
          )
        : snap.entries;
      if (pool.length === 0) {
        return (
          `No APPROVED neighbor matches "${query}". Your owner's approved neighbors ` +
          `(${snap.entries.length}): ${snap.entries.map((n) => n.name).join(", ")}. ` +
          `Only these may be mentioned or recommended. The whole network (scope "all") ` +
          `may be searched ONLY if the user explicitly asks.`
        );
      }
      return (
        `APPROVED neighbors — your owner's published lists: ${listNote} ` +
        `(${pool.length} of ${snap.entries.length} shown):\n` +
        pool
          .map(
            (n) =>
              `- ${n.name} (${n.domain})${n.tier === 1 ? " ★ partner" : ""} — ${n.description}\n` +
              `  agentUrl: ${n.agentUrl}\n  tags: ${n.tags.join(", ")}\n  on lists: #${n.lists.join(", #")}` +
              (n.capabilities && n.capabilities.length > 0
                ? `\n  capabilities: ${n.capabilities.join(", ")}`
                : ""),
          )
          .join("\n") +
        `\nOnly these neighbors may be mentioned or recommended. ` +
        `Use neighbors_knock with a neighbor's name/domain/agentUrl to contact one.`
      );
    }

    // scope "all" — the ENTIRE registry. The tool description gates this on
    // explicit user request; results carry a do-not-recommend reminder.
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
      `ENTIRE Neighbors Network — scope "all", as the user explicitly requested ` +
      `(${matches.length} match(es), directory information):\n` +
      matches
        .map(
          (n) =>
            `- ${n.name} (${n.domain}) — ${n.description}\n  agentUrl: ${n.agentUrl}\n  tags: ${n.tags.join(", ")}` +
            (n.capabilities && n.capabilities.length > 0
              ? `\n  capabilities: ${n.capabilities.join(", ")}`
              : ""),
        )
        .join("\n") +
      `\nREMINDER: these are NOT approved neighbors — present as directory information ` +
      `only; never recommend or feature a neighbor that is not on your approved list.`
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
        `Tool error: "${target.slice(0, 80)}" is not in the Neighbors Network. ` +
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
        signal: AbortSignal.timeout(25_000), // LLM-backed replies can take a beat
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
