/**
 * NEAR Neighbors — Heartbeat (v1)
 *
 * The owner's automated outreach engine. On each cron run (6-hourly) it:
 *   1. Reads the ENABLED goals (AGENT_GOALS_JSON — deployed from the console)
 *   2. Picks one goal (deterministic rotation — every run advances)
 *   3. Picks a target from the owner's curated list (AGENT_NEIGHBOR_TARGETS_JSON
 *      = favorites + tagged domains; the Spider becomes a target source later)
 *   4. Sends a knock via the same verified outbound path as the chat tool
 *      (registry-membership checked, self-knock guarded, logged to the
 *      neighbor:{domain} thread in Conversations)
 *
 * V1 semantics (deliberate — small network, zero extra cost):
 *   - Knock text is composed from the goal (title + body brief), NOT via an
 *     LLM call. The REPLY side already runs the neighbor's full LLM pipeline
 *     (v1.2.181), so conversation quality lives on their side.
 *   - One knock per run. No Spider yet — targets are who the owner curated.
 */

import { Env } from "./types";
import { SupabaseClient } from "./supabase";
import {
  setNeighborConfig,
  setNeighborStore,
  getRegistry,
  findNeighborIn,
  executeNeighborTool,
} from "./neighbor";

interface OwnerGoal {
  id?: string;
  title?: string;
  body?: string;
  enabled?: boolean;
}

export interface HeartbeatResult {
  ok: boolean;
  skipped?: string; // human-readable reason when no knock was sent
  goalTitle?: string;
  target?: string;
  detail?: string;
}

function parseGoals(json?: string): OwnerGoal[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as OwnerGoal[]).filter(
      (g) => g && g.enabled !== false && (g.title || g.body),
    );
  } catch {
    return [];
  }
}

function parseTargets(json?: string): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((d): d is string => typeof d === "string" && d.length > 0)
      .map((d) => d.toLowerCase());
  } catch {
    return [];
  }
}

function composeHeartbeatKnock(goal: OwnerGoal, agentName: string): string {
  const title = (goal.title || "an open goal").slice(0, 120);
  const body = (goal.body || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .trim()
    .slice(0, 600);
  return [
    `[Heartbeat — automated outreach from ${agentName}]`,
    ``,
    `I'm working on this goal right now:`,
    ``,
    `"${title}"`,
    body ? `\n${body}` : "",
    ``,
    `If this overlaps with anything you're doing — a partnership, a referral swap, a collaboration — I'd love to talk. Does anything come to mind?`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

export async function runHeartbeat(env: Env): Promise<HeartbeatResult> {
  if (env.HEARTBEAT_ENABLED !== "true") {
    return { ok: false, skipped: "Heartbeat is off (HEARTBEAT_ENABLED != true)" };
  }

  const goals = parseGoals(env.AGENT_GOALS_JSON);
  if (goals.length === 0) {
    return { ok: false, skipped: "No enabled goals — enable one in the Neighbors Console" };
  }

  const targetDomains = parseTargets(env.AGENT_NEIGHBOR_TARGETS_JSON);
  if (targetDomains.length === 0) {
    return {
      ok: false,
      skipped: "No targets — ★ favorite or #tag some neighbors first",
    };
  }

  // Wire the neighbor module for the scheduled context (no request init ran).
  const agentUrl = (env.AGENT_URL || "").replace(/\/+$/, "");
  const agentName = env.AGENT_NAME || "your neighbor";
  setNeighborConfig({
    agentUrl,
    name: env.AGENT_NAME,
    description: env.AGENT_DESCRIPTION,
    websiteUrl: env.WEBSITE_URL,
    rpcUrl: env.NEIGHBORS_RPC_URL,
    contract: env.NEIGHBORS_CONTRACT,
  });
  try {
    setNeighborStore(new SupabaseClient(env));
  } catch {
    setNeighborStore(null); // fail-open: knock still sends, just not logged
  }

  // Resolve targets against the live registry (membership = SSRF guard).
  let registry;
  try {
    registry = await getRegistry();
  } catch {
    return { ok: false, skipped: "Registry read failed — try again next run" };
  }
  const candidates = targetDomains
    .map((d) => findNeighborIn(registry, d))
    .filter(
      (n): n is NonNullable<typeof n> =>
        !!n && (!agentUrl || n.agentUrl.replace(/\/+$/, "") !== agentUrl),
    );
  if (candidates.length === 0) {
    return {
      ok: false,
      skipped: "None of your targets are currently in the registry",
    };
  }

  // Deterministic rotation: the 6-hour window index advances every run, so
  // consecutive runs work through goals and targets fairly (stateless).
  const tick = Math.floor(Date.now() / (6 * 3600 * 1000));
  const goal = goals[tick % goals.length];
  const target = candidates[tick % candidates.length];
  const message = composeHeartbeatKnock(goal, agentName);

  const result = await executeNeighborTool("neighbors_knock", {
    neighbor: target.domain,
    message,
  });

  const ok = !result.startsWith("Tool error") && !result.startsWith("Tool note");
  return {
    ok,
    goalTitle: goal.title || "(untitled goal)",
    target: `${target.name} (${target.domain})`,
    detail: result.slice(0, 500),
  };
}
