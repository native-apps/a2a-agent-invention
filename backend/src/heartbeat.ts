/**
 * NEAR Neighbors — Heartbeat (v1)
 *
 * The owner's automated outreach engine. The cron fires every 30 minutes;
 * the owner's schedule (HEARTBEAT_SCHEDULE_JSON — hourly interval, daily+time,
 * or weekly, timezone-aware) gates each fire. On a run it:
 *   1. Reads the ENABLED goals (AGENT_GOALS_JSON — deployed from the console)
 *   2. Picks one goal (deterministic rotation — every run advances)
 *   3. Picks a target from the owner's curated list (AGENT_NEIGHBOR_TARGETS_JSON
 *      = favorites + tagged domains; Knick discoveries become a target source later)
 *   4. Sends a knock via the same verified outbound path as the chat tool
 *      (registry-membership checked, self-knock guarded, logged to the
 *      neighbor:{domain} thread in Conversations)
 *
 * V1 semantics (deliberate — small network, zero extra cost):
 *   - Knock text is composed from the goal (title + body brief), NOT via an
 *     LLM call. The REPLY side already runs the neighbor's full LLM pipeline
 *     (v1.2.181), so conversation quality lives on their side.
 *   - One knock per run. No Knick yet — targets are who the owner curated.
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
import {
  setBusinessGoals,
  setNeighborB2B,
  getNeighborAutonomyLevel,
} from "./knowledge-base";

interface OwnerGoal {
  id?: string;
  title?: string;
  body?: string;
  enabled?: boolean;
}

export interface HeartbeatSchedule {
  mode: "interval" | "daily" | "weekly";
  intervalHours: number; // 1-24 (interval mode)
  time: string; // "HH:MM" in the schedule's tz (daily/weekly)
  day: number; // 0=Sun..6=Sat (weekly)
  tz: string; // IANA zone, e.g. "America/New_York"
}

function parseSchedule(json?: string): HeartbeatSchedule {
  const base: HeartbeatSchedule = {
    mode: "interval",
    intervalHours: 6,
    time: "09:00",
    day: 1,
    tz: "UTC",
  };
  if (!json) return base;
  try {
    const p = JSON.parse(json) as Partial<HeartbeatSchedule>;
    return {
      mode: p.mode === "daily" || p.mode === "weekly" ? p.mode : "interval",
      intervalHours: Math.min(24, Math.max(1, Number(p.intervalHours) || 6)),
      time: /^\d{1,2}:\d{2}$/.test(String(p.time)) ? String(p.time) : "09:00",
      day: Math.min(6, Math.max(0, Number(p.day) || 0)),
      tz: typeof p.tz === "string" && p.tz ? p.tz : "UTC",
    };
  } catch {
    return base;
  }
}

// True during the first 30 minutes of the schedule window. The cron fires
// at :00 and :30, so exactly one fire lands inside each window (stateless).
export function shouldRunNow(
  s: HeartbeatSchedule,
  now: Date = new Date(),
): boolean {
  if (s.mode === "interval") {
    return Date.now() % (s.intervalHours * 3600_000) < 30 * 60_000;
  }
  // daily / weekly — evaluate local wall-clock time in the target zone
  const [hh, mm] = s.time.split(":").map((x) => parseInt(x, 10));
  const target = (isNaN(hh) ? 9 : hh) * 60 + (isNaN(mm) ? 0 : mm);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: s.tz,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
    const val = (t: string): string =>
      parts.find((p) => p.type === t)?.value || "";
    // en-US 2-digit/24h can yield "24" at midnight — normalize with %24
    const localMin =
      (parseInt(val("hour"), 10) % 24) * 60 + parseInt(val("minute"), 10);
    const inWindow = localMin >= target && localMin < target + 30;
    if (s.mode === "daily") return inWindow;
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return dayMap[val("weekday")] === s.day && inWindow;
  } catch {
    return false; // bad tz string — never fire rather than fire wrong
  }
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

// ── Continue-mode: reply to neighbor threads awaiting our response ──
// Their replies to OUR outbound knocks are stored as role=user in the
// neighbor thread but never answered (the outbound path only stores).
// When the last message in a thread is theirs (role=user), autonomy ≥ 2,
// and the auto-reply budget allows, the agent responds via the full
// pipeline. Stateless budget: if the thread tail already shows ≥ 2
// user→agent auto-exchange rounds, the owner must engage (skip).
async function findAwaitingNeighborThread(
  db: SupabaseClient,
): Promise<{ taskId: string; domain: string } | null> {
  try {
    const msgs = await db
      .from("task_messages")
      .then((q) =>
        q
          .select("task_id, role, visitor_id, created_at")
          .order("created_at", false)
          .limit(120)
          .get<{
            task_id: string;
            role: string;
            visitor_id?: string;
            created_at?: string;
          }>(),
      );
    // group by visitor, find threads whose LATEST message is theirs (user)
    const latestByVisitor = new Map<string, { role: string; taskId: string }>();
    const tasksByVisitor = new Map<string, string>();
    for (const m of msgs || []) {
      const vid = m.visitor_id || "";
      if (!vid.startsWith("neighbor:")) continue;
      if (!latestByVisitor.has(vid)) {
        latestByVisitor.set(vid, { role: m.role, taskId: m.task_id });
      }
      tasksByVisitor.set(vid, m.task_id);
    }
    const awaiting: Array<{ taskId: string; domain: string }> = [];
    for (const [vid, latest] of latestByVisitor) {
      if (latest.role !== "user") continue;
      // budget: count trailing auto-exchange rounds (user→agent pairs)
      const threadMsgs = (msgs || []).filter(
        (m) => m.visitor_id === vid,
      );
      // threadMsgs are newest-first; walk pairs from the end (oldest side)
      const seq = [...threadMsgs].reverse().map((m) => m.role); // oldest→newest
      let autoRounds = 0;
      for (let i = seq.length - 1; i >= 1; i -= 2) {
        if (seq[i] === "user" && seq[i - 1] === "agent") autoRounds++;
        else break;
      }
      if (autoRounds >= 2) continue; // owner engagement required
      awaiting.push({
        taskId: latest.taskId,
        domain: vid.slice("neighbor:".length),
      });
    }
    if (awaiting.length === 0) return null;
    return awaiting[Math.floor(Math.random() * awaiting.length)];
  } catch {
    return null;
  }
}

export async function runHeartbeat(
  env: Env,
  opts?: { ignoreSchedule?: boolean },
): Promise<HeartbeatResult> {
  if (env.HEARTBEAT_ENABLED !== "true") {
    return { ok: false, skipped: "Heartbeat is off (HEARTBEAT_ENABLED != true)" };
  }

  if (!opts?.ignoreSchedule) {
    const schedule = parseSchedule(env.HEARTBEAT_SCHEDULE_JSON);
    if (!shouldRunNow(schedule)) {
      return { ok: false, skipped: "Outside schedule window" };
    }
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
    curator: env.NEIGHBORS_CURATOR,
  });
  try {
    const db = new SupabaseClient(env);
    setNeighborStore(db);
  } catch {
    setNeighborStore(null); // fail-open: knock still sends, just not logged
  }
  // Prompt state for the pipeline (goals + B2B posture + deals context)
  setBusinessGoals(env.AGENT_GOALS_JSON);
  setNeighborB2B({
    autonomy: env.AGENT_NEIGHBOR_AUTONOMY,
    sopsJson: env.AGENT_NEIGHBOR_SOPS_JSON,
    instructionsJson: env.AGENT_NEIGHBOR_INSTRUCTIONS_JSON,
  });

  // ── Continue-mode FIRST: answer a neighbor thread awaiting our reply ──
  if (getNeighborAutonomyLevel() >= 2) {
    try {
      const db2 = new SupabaseClient(env);
      const awaiting = await findAwaitingNeighborThread(db2);
      if (awaiting) {
        const { handleTaskMessage } = await import("./task-handler");
        await handleTaskMessage(
          awaiting.taskId,
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: `[Heartbeat continuation] The neighbor's latest message above awaits your reply. Respond now per your neighbor mandate — do not repeat what you already said.`,
              },
            ],
          },
          undefined,
          db2,
          env.MOTHER_BRAIN_GATEWAY_TOKEN,
          `neighbor:${awaiting.domain}`,
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
          undefined,
          undefined,
          env.CF_WORKER_MODEL,
          env.FORCE_CF_WORKER === "true",
          env.WEBSITE_URL || agentUrl,
        );
        return {
          ok: true,
          goalTitle: "(continuation)",
          target: awaiting.domain,
          detail: `Continued the conversation with ${awaiting.domain} — reply sent via the full pipeline.`,
        };
      }
    } catch {
      /* fall through to new knocks */
    }
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
