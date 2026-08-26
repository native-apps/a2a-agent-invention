// ---------------------------------------------------------------------------
// A2A Agent — Neighbors View (the onchain registry, inside Mother Brain)
// ---------------------------------------------------------------------------
// v3 — the console layout (2026-08-25): the registry grid keeps the left
// ~60% (discovery), and a large ~40% SIDEBAR on the right becomes the
// Neighbors console — the owner's control surface:
//   • 🎯 BUSINESS GOALS — a proper markdown editor (Edit / Preview toggle,
//     FastMarkdown render) — this is the search intent the heartbeat and
//     the Spider will use to find matching neighbors.
//   • ★ FAVORITES / 👁 WATCHED — managed lists with counts; click a row to
//     jump the grid to that neighbor.
// v1 persistence: localStorage per project (favorites/watched/goals) —
// graduates to onchain curated lists with the Spider.
//
// Registry cards (left) keep: search, status filter, list pills, full
// capability chips, Knock… composer (real POST to the neighbor's public
// /neighbor endpoint), YOU badge. Data reads the LIVE $NEAR chain via free
// public FastNEAR RPC (5-min cache; testnet constants flip at mainnet).
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  Globe,
  Network,
  Search,
  CircleDot,
  PauseCircle,
  ExternalLink,
  Star,
  Eye,
  Send,
  Target,
  Loader2,
  Pencil,
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import ThemedSelect from "../../../components/ThemedSelect";
import FastMarkdown from "../../../components/FastMarkdown";
import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseCreds } from "../shared/supabaseConfig";

// ── Heartbeat schedule (v1.2.186) ──
interface HbSchedule {
  mode: "interval" | "daily" | "weekly";
  intervalHours: number; // 1-24 (interval mode)
  time: string; // "HH:MM" local to tz (daily/weekly)
  day: number; // 0=Sun..6=Sat (weekly)
  tz: string; // IANA zone
}

const DEFAULT_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
})();

function parseHbSchedule(json?: string): HbSchedule {
  const base: HbSchedule = {
    mode: "interval",
    intervalHours: 6,
    time: "09:00",
    day: 1,
    tz: DEFAULT_TZ,
  };
  if (!json) return base;
  try {
    const p = JSON.parse(json) as Partial<HbSchedule>;
    return {
      mode: p.mode === "daily" || p.mode === "weekly" ? p.mode : "interval",
      intervalHours: Math.min(24, Math.max(1, Number(p.intervalHours) || 6)),
      time: /^\d{1,2}:\d{2}$/.test(String(p.time)) ? String(p.time) : "09:00",
      day: Math.min(6, Math.max(0, Number(p.day) || 0)),
      tz: typeof p.tz === "string" && p.tz ? p.tz : DEFAULT_TZ,
    };
  } catch {
    return base;
  }
}

const TZ_OPTIONS: Array<[string, string]> = [
  ["America/New_York", "Eastern (Miami/NY)"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Los_Angeles", "Pacific"],
  ["UTC", "UTC"],
  ["Europe/London", "London"],
  ["Europe/Berlin", "Berlin/Paris"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"],
];

function hbScheduleLabel(s: HbSchedule): string {
  if (s.mode === "interval") return `every ${s.intervalHours}h`;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (s.mode === "daily") return `daily at ${s.time} (${s.tz})`;
  return `${days[s.day]} ${s.time} (${s.tz})`;
}

// ── Network constants (testnet until mainnet graduation) ──────────────────
const NEAR_RPC = "https://test.rpc.fastnear.com";
const NEIGHBORS_CONTRACT = "neighborly.testnet";
const REGISTRY_CACHE_TTL = 5 * 60_000; // 5 minutes

interface RegistryAgent {
  name: string;
  domain: string;
  agent_url: string;
  website_url?: string;
  description?: string;
  tags?: string[];
  category?: string;
  capabilities?: string[];
  status: number; // 0 = active, 1 = paused
  registered_at?: string; // nanoseconds
  updated_at?: string;
}

// Module-level cache — tab switches don't re-hit the RPC.
let registryCache: { entries: RegistryAgent[]; at: number } | null = null;

async function fetchRegistry(): Promise<RegistryAgent[]> {
  const now = Date.now();
  if (registryCache && now - registryCache.at < REGISTRY_CACHE_TTL) {
    return registryCache.entries;
  }
  const args = btoa(JSON.stringify({ from_index: 0, limit: 100 }));
  const res = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "neighbors-view",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: NEIGHBORS_CONTRACT,
        method_name: "get_agents",
        args_base64: args,
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = (await res.json()) as {
    result?: { result?: number[] };
    error?: { message?: string };
  };
  if (json.error) throw new Error(json.error.message || "RPC error");
  // call_function returns the JSON as a byte array; after the JSON-RPC
  // envelope unwrap the bytes sit at result.result (gotcha #10/#12).
  const bytes = json.result?.result;
  if (!Array.isArray(bytes)) throw new Error("unexpected get_agents shape");
  const entries = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes)),
  ) as RegistryAgent[];
  registryCache = { entries, at: now };
  return entries;
}

const nsToDate = (ns?: string): string => {
  if (!ns) return "—";
  try {
    const d = new Date(Number(ns) / 1e6);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  } catch {
    return "—";
  }
};

// ── Local per-project prefs (v1) — favorites / watched / goals / deals / tags

interface NbGoal {
  id: string;
  title: string;
  body: string; // markdown
  enabled: boolean; // heartbeat/cron + Spider discovery only pick from ENABLED goals
  created: string; // ISO
}

interface NbDeal {
  id: string;
  title: string;
  body: string; // markdown — ideas & potential deals from neighbor conversations
  status: "draft" | "approved" | "done"; // approved = live in the agent's prompt
  created: string; // ISO
}

interface NbSop {
  id: string;
  title: string;
  body: string; // markdown — a B2B playbook
  enabled: boolean; // enabled SOPs inject into neighbor conversations
  created: string; // ISO
}

interface NbPrefs {
  favorites: string[]; // domains
  watched: string[]; // domains
  goals: NbGoal[];
  deals: NbDeal[];
  sops: NbSop[];
  tags: Record<string, string[]>; // domain → the user's own #tags (curated lists)
}

const EMPTY_PREFS: NbPrefs = {
  favorites: [],
  watched: [],
  goals: [],
  deals: [],
  sops: [],
  tags: {},
};

function prefsStorageKey(inv: {
  id: string;
  settings: Record<string, unknown>;
}): string {
  const pid = String(inv.settings.primaryProjectId || "default");
  return `a2a_neighbors_prefs_${inv.id}_${pid}`;
}

function loadPrefs(inv: {
  id: string;
  settings: Record<string, unknown>;
}): NbPrefs {
  try {
    const raw = localStorage.getItem(prefsStorageKey(inv));
    if (!raw) return { ...EMPTY_PREFS };
    const p = JSON.parse(raw) as Partial<NbPrefs> & { goals?: unknown };
    // Goals: array of NbGoal; v1 (single markdown string) migrates to goal #1.
    const goals: NbGoal[] = Array.isArray(p.goals)
      ? (p.goals as Array<Partial<NbGoal>>).map((g, i) => ({
          id: typeof g.id === "string" ? g.id : `goal-${Date.now()}-${i}`,
          title: typeof g.title === "string" ? g.title : `Goal ${i + 1}`,
          body: typeof g.body === "string" ? g.body : "",
          enabled: g.enabled !== false,
          created:
            typeof g.created === "string"
              ? g.created
              : new Date().toISOString(),
        }))
      : typeof p.goals === "string" && p.goals.trim()
        ? [
            {
              id: `goal-migrated-${Date.now()}`,
              title: "Goal 1",
              body: p.goals,
              enabled: true,
              created: new Date().toISOString(),
            },
          ]
        : [];
    const deals: NbDeal[] = Array.isArray(p.deals)
      ? (p.deals as Array<Partial<NbDeal>>).map((d, i) => ({
          id: typeof d.id === "string" ? d.id : `deal-${Date.now()}-${i}`,
          title: typeof d.title === "string" ? d.title : "",
          body: typeof d.body === "string" ? d.body : "",
          status:
            d.status === "approved" || d.status === "done" ? d.status : "draft",
          created:
            typeof d.created === "string"
              ? d.created
              : new Date().toISOString(),
        }))
      : [];
    const tags: Record<string, string[]> =
      p.tags && typeof p.tags === "object" && !Array.isArray(p.tags)
        ? Object.fromEntries(
            Object.entries(p.tags).map(([k, v]) => [
              k,
              Array.isArray(v) ? v.filter((x) => typeof x === "string") : [],
            ]),
          )
        : {};
    const sops: NbSop[] = Array.isArray(p.sops)
      ? (p.sops as Array<Partial<NbSop>>).map((s, i) => ({
          id: typeof s.id === "string" ? s.id : `sop-${Date.now()}-${i}`,
          title: typeof s.title === "string" ? s.title : "",
          body: typeof s.body === "string" ? s.body : "",
          enabled: s.enabled !== false,
          created:
            typeof s.created === "string"
              ? s.created
              : new Date().toISOString(),
        }))
      : [];
    return {
      favorites: Array.isArray(p.favorites) ? p.favorites : [],
      watched: Array.isArray(p.watched) ? p.watched : [],
      goals,
      deals,
      sops,
      tags,
    };
  } catch {
    return { ...EMPTY_PREFS };
  }
}

function savePrefs(
  inv: { id: string; settings: Record<string, unknown> },
  p: NbPrefs,
): void {
  try {
    localStorage.setItem(prefsStorageKey(inv), JSON.stringify(p));
  } catch {
    /* storage blocked — session-only */
  }
}

// ── Component ─────────────────────────────────────────────────────────────

interface NeighborsViewProps {
  invention: {
    id: string;
    settings: Record<string, unknown>;
    projectIds?: string[];
  };
}

type ListMode = "all" | "favorites" | "watched" | "tag";

interface KnockState {
  domain: string;
  message: string;
  busy: boolean;
  reply: string;
  error: string;
}

export function NeighborsView({ invention }: NeighborsViewProps) {
  const [entries, setEntries] = useState<RegistryAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const [prefs, setPrefs] = useState<NbPrefs>({ ...EMPTY_PREFS });
  const [listMode, setListMode] = useState<ListMode>("all");
  const [knock, setKnock] = useState<KnockState | null>(null);
  const [goalsTab, setGoalsTab] = useState<"edit" | "preview">("edit");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const [consoleTab, setConsoleTab] = useState<
    "goals" | "deals" | "sops" | "heartbeat"
  >("goals");
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [dealsTab, setDealsTab] = useState<"edit" | "preview">("edit");
  const [editingSopId, setEditingSopId] = useState<string | null>(null);
  const [sopsTab, setSopsTab] = useState<"edit" | "preview">("edit");
  const [neighborAutonomy, setNeighborAutonomy] = useState<"1" | "2" | "3">(
    invention.settings.neighborAutonomy === "1" ||
      invention.settings.neighborAutonomy === "3"
      ? (invention.settings.neighborAutonomy as "1" | "3")
      : "2",
  );

  const [activeTag, setActiveTag] = useState("");
  const [tagEditDomain, setTagEditDomain] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // ── Heartbeat (v1.2.185) — owner outreach engine ──
  const [heartbeatOn, setHeartbeatOn] = useState(
    invention.settings.heartbeatEnabled === "true",
  );
  const [heartbeatBusy, setHeartbeatBusy] = useState(false);
  const [heartbeatResult, setHeartbeatResult] = useState("");
  const [hbSchedule, setHbSchedule] = useState<HbSchedule>(() =>
    parseHbSchedule(String(invention.settings.heartbeatScheduleJson || "")),
  );
  const [settingsSync, setSettingsSync] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const prefsLoadedRef = useRef(false);
  const gatewayToken = String(invention.settings.gatewayToken || "");

  // Which registry entry is THIS agent? (match on our deployed agentUrl)
  const myAgentUrl = String(
    invention.settings.agentUrl || "",
  ).replace(/\/+$/, "");
  const myAgentName = String(invention.settings.agentName || "");
  const knockReady = !!(myAgentUrl && myAgentName);
  const heartbeatReady = !!(myAgentUrl && gatewayToken);

  // ── Durable Deals (v1.2.189) — the agent's own Supabase is the source of
  // truth; localStorage is cache + offline fallback. Same row id everywhere
  // → no stale duplicates. On mount: pull DB rows (or one-time push local
  // deals up if the table is empty). Fail → “local-only” mode with a hint.
  const prefsRef = useRef<NbPrefs | null>(null);
  const dealsClientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [dealsDb, setDealsDb] = useState<"unknown" | "ok" | "local-only">(
    "unknown",
  );
  const [showRedeployToast, setShowRedeployToast] = useState(false);
  const lastPushedRef = useRef("");

  const dealsClient = async (): Promise<ReturnType<
    typeof createClient
  > | null> => {
    if (dealsClientRef.current) return dealsClientRef.current;
    const creds = await nbCreds();
    if (!creds) return null;
    dealsClientRef.current = createClient(creds.url, creds.serviceKey);
    return dealsClientRef.current;
  };

  const persistDealToDb = async (d: NbDeal): Promise<void> => {
    try {
      const sc = await dealsClient();
      if (!sc) return;
      const { error } = await sc.from("deals").upsert({
        id: d.id,
        title: d.title,
        body: d.body,
        status: d.status || "draft",
        updated_at: new Date().toISOString(),
      });
      if (error) setDealsDb("local-only");
    } catch {
      setDealsDb("local-only");
    }
  };

  const removeDealFromDb = async (id: string): Promise<void> => {
    try {
      const sc = await dealsClient();
      if (sc) await sc.from("deals").delete().eq("id", id);
    } catch {
      /* local-only */
    }
  };

  const [provisioning, setProvisioning] = useState(false);
  const [provisionMsg, setProvisionMsg] = useState("");

  // Runs the app's provision-db action (applies every schema file, all
  // idempotent CREATE ... IF NOT EXISTS — safe on an existing DB), then
  // re-pulls deals so the tab flips out of local-only mode immediately.
  const provisionDealsTable = async (): Promise<void> => {
    if (provisioning) return;
    setProvisioning(true);
    setProvisionMsg("");
    try {
      let pid = "";
      try {
        const r = await fetch("/api/active-project");
        if (r.ok) {
          const d = await r.json();
          pid = d?.activeProjectId || "";
        }
      } catch {
        /* ignore */
      }
      const res = await fetch(
        `/api/inventions/a2a-agent/action/provision-db${pid ? `?projectId=${encodeURIComponent(pid)}` : ""}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setProvisionMsg(`❌ provision failed (HTTP ${res.status}) ${t.slice(0, 120)}`);
        return;
      }
      setProvisionMsg("✅ table created — syncing deals…");
      await syncDealsFromDb();
      setProvisionMsg("");
    } catch (err) {
      setProvisionMsg(
        `❌ ${err instanceof Error ? err.message : "provision failed"}`,
      );
    } finally {
      setProvisioning(false);
    }
  };

  const syncDealsFromDb = async (): Promise<void> => {
      try {
        const sc = await dealsClient();
        if (!sc) {
          setDealsDb("local-only");
          return;
        }
        const { data, error } = await sc
          .from("deals")
          .select("id, title, body, status, created_at")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) {
          setDealsDb("local-only"); // table missing (42P01) or perms
          return;
        }
        setDealsDb("ok");
        const rows = (data || []) as Array<Record<string, unknown>>;
        if (rows.length > 0) {
          const merged: NbDeal[] = rows.map((d) => ({
            id: String(d.id),
            title: String(d.title || ""),
            body: String(d.body || ""),
            status:
              d.status === "approved" || d.status === "done"
                ? (d.status as NbDeal["status"])
                : "draft",
            created: String(d.created_at || new Date().toISOString()),
          }));
          setPrefs((prev) => {
            const p = { ...prev, deals: merged };
            savePrefs(invention, p);
            return p;
          });
        } else if (prefsRef.current?.deals.length) {
          // One-time migration: local deals exist, DB is empty → push up.
          for (const d of prefsRef.current.deals) {
            await sc.from("deals").upsert({
              id: d.id,
              title: d.title,
              body: d.body,
              status: d.status || "draft",
              updated_at: new Date().toISOString(),
            });
          }
        }
      } catch {
        setDealsDb("local-only");
      }
    };

  useEffect(() => {
    const loaded = loadPrefs(invention);
    setPrefs(loaded);
    prefsRef.current = loaded;
    prefsLoadedRef.current = true;
    syncDealsFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bridge 1: goals/targets/heartbeat → invention settings (debounced,
  // read-modify-write PATCH — same path as the Wizard). Values deploy to the
  // worker on the next Redeploy (config.json deploy.secrets map).
  useEffect(() => {
    if (!prefsLoadedRef.current) return;
    const t = window.setTimeout(async () => {
      const targets = Array.from(
        new Set([...prefs.favorites, ...Object.keys(prefs.tags)]),
      );
      const patch: Record<string, string> = {
        neighborGoalsJson: JSON.stringify(prefs.goals),
        neighborTargetsJson: JSON.stringify(targets),
        heartbeatEnabled: heartbeatOn ? "true" : "false",
        heartbeatScheduleJson: JSON.stringify(hbSchedule),
        neighborSopsJson: JSON.stringify(prefs.sops),
        neighborAutonomy,
      };
      const patchStr = JSON.stringify(patch);
      if (patchStr === lastPushedRef.current) return; // nothing changed
      try {
        setSettingsSync("saving");
        const pid = String(invention.settings.primaryProjectId || "");
        if (!pid) {
          setSettingsSync("error");
          return;
        }
        const curRes = await fetch(
          `/api/inventions/${invention.id}?projectId=${encodeURIComponent(pid)}`,
        );
        const curInv = curRes.ok ? await curRes.json() : null;
        const serverSettings =
          curInv?.settings && typeof curInv.settings === "object"
            ? (curInv.settings as Record<string, unknown>)
            : {};
        const res = await fetch(`/api/inventions/${invention.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: { ...serverSettings, ...patch },
            projectId: pid,
          }),
        });
        const firstSync = lastPushedRef.current === "";
        setSettingsSync(res.ok ? "saved" : "error");
        if (res.ok) {
          lastPushedRef.current = patchStr;
          // Real change (not the mount baseline) → the worker copy is now
          // stale until redeploy. Show the redeploy toast.
          if (!firstSync) setShowRedeployToast(true);
        }
      } catch {
        setSettingsSync("error");
      }
    }, 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    prefs.goals,
    prefs.favorites,
    prefs.tags,
    prefs.sops,
    heartbeatOn,
    hbSchedule,
    neighborAutonomy,
  ]);

  // Run the heartbeat now (owner-only — Bearer gateway token; same run the
  // cron fires every 6 hours).
  // Log a UI-initiated outbound knock to OUR worker so our Conversations
  // thread captures it (same storeNeighborExchange path as the heartbeat).
  // Fire-and-forget — the knock already succeeded.
  const logOutboundToWorker = async (
    domain: string,
    name: string,
    agentUrl: string,
    knockText: string,
    replyText: string,
  ): Promise<void> => {
    if (!heartbeatReady) return; // needs agentUrl + gateway token
    try {
      await fetch(`${myAgentUrl}/neighbor/log`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({ domain, name, agentUrl, knockText, replyText }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      /* fire-and-forget */
    }
  };

  // Run the worker-side thread consolidation (merge duplicate neighbor
  // threads/entities from pre-unified identity keys). Idempotent.
  const [consolidateBusy, setConsolidateBusy] = useState(false);
  const [consolidateResult, setConsolidateResult] = useState("");

  const runConsolidate = async (): Promise<void> => {
    if (!heartbeatReady || consolidateBusy) return;
    setConsolidateBusy(true);
    setConsolidateResult("");
    try {
      const res = await fetch(`${myAgentUrl}/neighbor/consolidate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        stats?: {
          neighbors?: number;
          tasksMerged?: number;
          tasksRenamed?: number;
          messagesMoved?: number;
          messagesRenamed?: number;
          entitiesMerged?: number;
        };
      };
      if (j.ok && j.stats) {
        const s = j.stats;
        setConsolidateResult(
          `✅ ${s.neighbors ?? 0} neighbor(s) checked · ${s.tasksMerged ?? 0} duplicate threads merged · ${s.messagesMoved ?? 0} messages moved · ${s.tasksRenamed ?? 0} renamed · ${s.entitiesMerged ?? 0} entities merged`,
        );
      } else {
        setConsolidateResult(`❌ ${j.error || `HTTP ${res.status}`}`);
      }
    } catch (err) {
      setConsolidateResult(
        `❌ ${err instanceof Error ? err.message : "consolidate failed"}`,
      );
    } finally {
      setConsolidateBusy(false);
    }
  };

  const runHeartbeatNow = async (): Promise<void> => {
    if (!heartbeatReady || heartbeatBusy) return;
    setHeartbeatBusy(true);
    setHeartbeatResult("");
    try {
      const res = await fetch(`${myAgentUrl}/heartbeat/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        skipped?: string;
        goalTitle?: string;
        target?: string;
        detail?: string;
        error?: string;
      };
      if (j.error) setHeartbeatResult(`❌ ${j.error}`);
      else if (j.ok)
        setHeartbeatResult(
          `✅ Knocked ${j.target || "a neighbor"}` +
            (j.goalTitle ? ` — goal: “${j.goalTitle}”` : "") +
            (j.detail ? `\n\n${j.detail}` : ""),
        );
      else setHeartbeatResult(`⏸ Skipped: ${j.skipped || "no reason given"}`);
    } catch (err) {
      setHeartbeatResult(
        `❌ ${err instanceof Error ? err.message : "run failed"}`,
      );
    } finally {
      setHeartbeatBusy(false);
    }
  };

  // ── Neighbor detail modal — conversations with one neighbor ──
  interface NbThread {
    id: string;
    status: string | null;
    created_at: string | null;
    visitor_id: string | null;
  }
  interface NbDetail {
    agent: RegistryAgent;
    threads: NbThread[];
    loading: boolean;
    error: string;
  }
  const [nbDetail, setNbDetail] = useState<NbDetail | null>(null);
  const [nbOpenThread, setNbOpenThread] = useState<{
    id: string;
    msgs: Array<{ role: string; text: string; at: string }>;
    loading: boolean;
  } | null>(null);

  // Message text extraction — mirrors the CRM's handling of the varying
  // storage shapes (content string / JSON parts array / parts field).
  const nbExtractText = (m: {
    content?: unknown;
    parts?: unknown;
  }): string => {
    const unwrap = (s: string): string => {
      if (s.trim().startsWith("[")) {
        try {
          const p = JSON.parse(s);
          if (Array.isArray(p))
            return p
              .map((x: unknown) =>
                typeof x === "string" ? x : (x as { text?: string })?.text || "",
              )
              .join("");
        } catch {
          /* not JSON */
        }
      }
      return s;
    };
    let text = "";
    const c = m.content;
    if (c != null && c !== "")
      text = typeof c === "string" ? c : JSON.stringify(c);
    text = unwrap(text);
    if (!text.trim() && m.parts != null) {
      if (Array.isArray(m.parts))
        text = (m.parts as unknown[])
          .map((x) =>
            typeof x === "string" ? x : (x as { text?: string })?.text || "",
          )
          .join("");
      else if (typeof m.parts === "string") text = unwrap(m.parts);
    }
    return text;
  };

  const nbCreds = async (): Promise<{
    url: string;
    serviceKey: string;
  } | null> => {
    let pid = "";
    try {
      const r = await fetch("/api/active-project");
      if (r.ok) {
        const d = await r.json();
        pid = d?.activeProjectId || "";
      }
    } catch {
      /* ignore */
    }
    const { url, serviceKey } = resolveSupabaseCreds(invention.settings, pid);
    return url && serviceKey ? { url, serviceKey } : null;
  };

  const openNbDetail = async (a: RegistryAgent): Promise<void> => {
    setNbOpenThread(null);
    setNbDetail({ agent: a, threads: [], loading: true, error: "" });
    try {
      const creds = await nbCreds();
      if (!creds) {
        setNbDetail({
          agent: a,
          threads: [],
          loading: false,
          error: "Supabase not configured — set URL + service key in Settings.",
        });
        return;
      }
      const supabase = createClient(creds.url, creds.serviceKey);
      const { data, error } = await supabase
        .from("tasks")
        .select("id, status, created_at, visitor_id")
        .eq("visitor_id", `neighbor:${a.domain}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      setNbDetail({
        agent: a,
        threads: (data || []) as NbThread[],
        loading: false,
        error: "",
      });
    } catch (err) {
      setNbDetail({
        agent: a,
        threads: [],
        loading: false,
        error: err instanceof Error ? err.message : "load failed",
      });
    }
  };

  const openNbThread = async (t: NbThread): Promise<void> => {
    if (!nbDetail) return;
    // Hand-off: preselect this thread in the Conversations tab when the
    // user opens it next (A2aCrmView reads + clears this key on load).
    try {
      if (t.visitor_id) sessionStorage.setItem("a2a_open_thread", t.visitor_id);
    } catch {
      /* ignore */
    }
    setNbOpenThread({ id: t.id, msgs: [], loading: true });
    try {
      const creds = await nbCreds();
      if (!creds) {
        setNbOpenThread(null);
        return;
      }
      const supabase = createClient(creds.url, creds.serviceKey);
      // Messages live on the VISITOR dialogue, not one task — the CRM's
      // proven pattern: fetch ALL messages for this visitor_id ("one
      // persistent conversation" across tasks), newest-last.
      const visitorId =
        t.visitor_id || `neighbor:${nbDetail.agent.domain}`;
      // select("*") — the live table has no `content` column (messages live
      // in `parts`); nbExtractText handles every storage shape, like the CRM.
      const { data, error } = await supabase
        .from("task_messages")
        .select("*")
        .eq("visitor_id", visitorId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) {
        setNbOpenThread({
          id: t.id,
          msgs: [{ role: "error", text: error.message, at: "" }],
          loading: false,
        });
        return;
      }
      setNbOpenThread({
        id: t.id,
        msgs: (data || []).map(
          (m: {
            role?: string;
            content?: unknown;
            parts?: unknown;
            created_at?: string;
          }) => ({
            role: String(m.role || ""),
            text: nbExtractText(m),
            at: String(m.created_at || ""),
          }),
        ),
        loading: false,
      });
    } catch (err) {
      setNbOpenThread({
        id: t.id,
        msgs: [
          {
            role: "error",
            text: err instanceof Error ? err.message : "load failed",
            at: "",
          },
        ],
        loading: false,
      });
    }
  };

  // ── Shoot a deal (right-click menu) — send one of your deals to a
  // neighbor as a knock. Same endpoint as the Knock composer; their reply
  // shows inline in the menu.
  const [dealMenu, setDealMenu] = useState<{
    domain: string;
    name: string;
    agentUrl: string;
    x: number;
    y: number;
  } | null>(null);
  const [dealShot, setDealShot] = useState<{
    busy: boolean;
    result: string;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (!dealMenu) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setDealMenu(null);
        setDealShot(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealMenu]);

  const shootDeal = async (deal: NbDeal): Promise<void> => {
    if (!dealMenu || !knockReady || dealShot?.busy) return;
    setDealShot({ busy: true, result: "", error: "" });
    const message =
      `[Deal offer from ${myAgentName}]\n\n` +
      `**${deal.title || "Untitled deal"}**\n\n` +
      `${deal.body}\n\n` +
      `Interested? Let's talk — we can work out the details.`;
    try {
      const res = await fetch(
        `${dealMenu.agentUrl.replace(/\/+$/, "")}/neighbor`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${myAgentName} <${myAgentUrl}>`,
            from_name: myAgentName,
            from_url: myAgentUrl,
            message,
          }),
          signal: AbortSignal.timeout(25_000),
        },
      );
      const text = await res.text();
      let reply = text;
      try {
        const j = JSON.parse(text) as {
          ok?: boolean;
          reply?: string;
          error?: string;
        };
        reply = j.ok && j.reply ? j.reply : j.error || text;
      } catch {
        /* raw text */
      }
      if (res.ok) {
        void logOutboundToWorker(
          dealMenu.domain,
          dealMenu.name,
          dealMenu.agentUrl,
          message,
          reply,
        );
      }
      setDealShot({
        busy: false,
        result: reply.slice(0, 800),
        error: res.ok ? "" : `HTTP ${res.status}`,
      });
    } catch (err) {
      setDealShot({
        busy: false,
        result: "",
        error: err instanceof Error ? err.message : "send failed",
      });
    }
  };

  const updatePrefs = (patch: Partial<NbPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(invention, next);
      return next;
    });
  };

  const toggleDomain = (
    list: "favorites" | "watched",
    domain: string,
  ): void => {
    setPrefs((prev) => {
      const cur = prev[list];
      const next = {
        ...prev,
        [list]: cur.includes(domain)
          ? cur.filter((d) => d !== domain)
          : [...cur, domain],
      };
      savePrefs(invention, next as NbPrefs);
      return next as NbPrefs;
    });
  };

  // ── Goals — a LIST the agent's heartbeat/cron reviews, picking one
  // ENABLED goal to work on per run. Disabled goals are kept but skipped.
  const editingGoal = prefs.goals.find((g) => g.id === editingGoalId) || null;

  const addGoal = (): void => {
    const goal: NbGoal = {
      id: `goal-${Date.now()}`,
      title: "",
      body: "",
      enabled: true,
      created: new Date().toISOString(),
    };
    updatePrefs({ goals: [goal, ...prefs.goals] });
    setGoalsTab("edit");
    setEditingGoalId(goal.id);
  };

  const updateGoal = (id: string, patch: Partial<NbGoal>): void => {
    updatePrefs({
      goals: prefs.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    });
  };

  const deleteGoal = (id: string): void => {
    updatePrefs({ goals: prefs.goals.filter((g) => g.id !== id) });
    if (editingGoalId === id) setEditingGoalId(null);
  };

  // ── Deals — the deal log: ideas & potential deals from neighbor
  // conversations. v1: owner-documented; agents write here themselves once
  // the goals→worker bridge ships.
  const editingDeal = prefs.deals.find((d) => d.id === editingDealId) || null;

  const addDeal = (): void => {
    const deal: NbDeal = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `deal-${Date.now()}`,
      title: "",
      body: "",
      status: "draft",
      created: new Date().toISOString(),
    };
    updatePrefs({ deals: [deal, ...prefs.deals] });
    setDealsTab("edit");
    setEditingDealId(deal.id);
    void persistDealToDb(deal);
  };

  const updateDeal = (id: string, patch: Partial<NbDeal>): void => {
    const next = prefs.deals.find((d) => d.id === id);
    updatePrefs({
      deals: prefs.deals.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
    if (next) void persistDealToDb({ ...next, ...patch });
  };

  const deleteDeal = (id: string): void => {
    updatePrefs({ deals: prefs.deals.filter((d) => d.id !== id) });
    if (editingDealId === id) setEditingDealId(null);
    void removeDealFromDb(id);
  };

  // ── SOPs — B2B playbooks injected into neighbor conversations ──
  const editingSop = prefs.sops.find((s) => s.id === editingSopId) || null;

  const addSop = (): void => {
    const sop: NbSop = {
      id: `sop-${Date.now()}`,
      title: "",
      body: "",
      enabled: true,
      created: new Date().toISOString(),
    };
    updatePrefs({ sops: [sop, ...prefs.sops] });
    setSopsTab("edit");
    setEditingSopId(sop.id);
  };

  const updateSop = (id: string, patch: Partial<NbSop>): void => {
    updatePrefs({
      sops: prefs.sops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const deleteSop = (id: string): void => {
    updatePrefs({ sops: prefs.sops.filter((s) => s.id !== id) });
    if (editingSopId === id) setEditingSopId(null);
  };

  // ── AI SOP generation — reads your Goals + Deals + the Neighbors network
  // context and drafts B2B playbooks. Same LLM path as the Wizard's AI
  // assistant (local app server → localhost → cloud gateway). ──
  const [sopGenerating, setSopGenerating] = useState(false);
  const [sopGenError, setSopGenError] = useState("");

  const aiGenerateSops = async (): Promise<void> => {
    if (sopGenerating) return;
    setSopGenerating(true);
    setSopGenError("");
    try {
      // Master key → local completions endpoint (wizard pattern)
      let masterKey = "";
      try {
        const r = await fetch("/api/settings/global");
        if (r.ok) {
          const g = await r.json();
          masterKey = g.masterApiKey || g.apiKey || "";
        }
      } catch {
        /* ignore */
      }
      let pid = "";
      try {
        const r = await fetch("/api/active-project");
        if (r.ok) {
          const d = await r.json();
          pid = d?.activeProjectId || "";
        }
      } catch {
        /* ignore */
      }
      const gatewayToken = String(invention.settings.gatewayToken || "");
      const gatewayBase = String(
        invention.settings.gatewayBaseUrl || "",
      ).replace(/\/+$/, "");
      const candidates: Array<{
        url: string;
        headers: Record<string, string>;
      }> = [];
      if (masterKey && pid) {
        candidates.push({
          url: "/v1/chat/completions",
          headers: {
            Authorization: `Bearer ${masterKey}`,
            "X-Mother-Brain-Project": pid,
          },
        });
        candidates.push({
          url: "http://localhost:3100/v1/chat/completions",
          headers: {
            Authorization: `Bearer ${masterKey}`,
            "X-Mother-Brain-Project": pid,
          },
        });
      }
      if (gatewayToken && gatewayBase) {
        candidates.push({
          url: `${gatewayBase}/v1/chat/completions`,
          headers: { Authorization: `Bearer ${gatewayToken}` },
        });
      }
      if (candidates.length === 0) {
        setSopGenError(
          "No LLM available — set your Gateway URL + Token in the Wizard.",
        );
        return;
      }

      const goalsSummary = prefs.goals
        .filter((g) => g.enabled)
        .map(
          (g) =>
            `- Goal: ${g.title || "(untitled)"} — ${(g.body || "")
              .replace(/[#*`>]/g, "")
              .trim()
              .slice(0, 300)}`,
        )
        .join("\n");
      const dealsSummary = prefs.deals
        .map(
          (d) =>
            `- Deal (${d.status || "draft"}): ${d.title || "(untitled)"} — ${(
              d.body || ""
            )
              .replace(/[#*`>]/g, "")
              .trim()
              .slice(0, 300)}`,
        )
        .join("\n");
      const existing = prefs.sops
        .map((s) => `- ${s.title || "(untitled)"}`)
        .join("\n");

      const sys = [
        "You draft B2B SOPs (playbooks) for an AI agent on the NEAR Neighbors network — a network of business agents that knock on each other, negotiate partnerships, exchange referrals, and document deals.",
        "Reply with ONLY a JSON array — no prose, no code fences.",
        'Each element: {"title": string, "body": string} where body is a markdown playbook the agent follows in agent-to-agent conversations.',
        "Rules:",
        "- 2-4 SOPs that fit THIS business's goals and deals below.",
        "- Bodies: numbered steps the agent follows, concrete and short (under 120 words each).",
        "- Cover: how to handle inbound partnership offers, how to propose the business's own deals, and what must always escalate to the owner.",
        "- Never invent coupon codes, prices, or terms not present below.",
      ].join("\n");
      const user = [
        `Business agent: ${invention.settings.agentName || "this agent"}`,
        "",
        "CURRENT GOALS:",
        goalsSummary || "(none set)",
        "",
        "CURRENT DEALS:",
        dealsSummary || "(none created)",
        "",
        "EXISTING SOPs (do not duplicate):",
        existing || "(none)",
      ].join("\n");

      let reply = "";
      let lastErr = "";
      for (const c of candidates) {
        try {
          const res = await fetch(c.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...c.headers },
            body: JSON.stringify({
              model: "default",
              messages: [
                { role: "system", content: sys },
                { role: "user", content: user },
              ],
              max_tokens: 1200,
            }),
            signal: AbortSignal.timeout(60_000),
          });
          if (!res.ok) {
            lastErr = `HTTP ${res.status}`;
            continue;
          }
          const data = await res.json();
          const r = data?.choices?.[0]?.message?.content;
          if (!r) {
            lastErr = "empty response";
            continue;
          }
          reply = r as string;
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : "failed";
        }
      }
      if (!reply) {
        setSopGenError(`AI generation failed (${lastErr}) — try again.`);
        return;
      }
      // Parse — three strategies: pure JSON, fence-stripped, then a
      // substring scan (first [ … last ]) which handles prose around the
      // array ("Here are your SOPs:```json[…]```") without corrupting
      // bodies that legitimately contain code fences.
      const parseSopArray = (
        raw: string,
      ): Array<{ title?: string; body?: string }> | null => {
        // 1. Direct parse
        try {
          const j = JSON.parse(raw.trim()) as unknown;
          if (Array.isArray(j)) return j as Array<{ title?: string; body?: string }>;
        } catch {
          /* next */
        }
        // 2. Strip code fences anywhere, then parse
        const stripped = raw.replace(/```(?:json)?/gi, "").trim();
        try {
          const j = JSON.parse(stripped) as unknown;
          if (Array.isArray(j)) return j as Array<{ title?: string; body?: string }>;
        } catch {
          /* next */
        }
        // 3. Substring scan on the RAW text
        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start !== -1 && end > start) {
          try {
            const j = JSON.parse(raw.slice(start, end + 1)) as unknown;
            if (Array.isArray(j))
              return j as Array<{ title?: string; body?: string }>;
          } catch {
            /* give up */
          }
        }
        return null;
      };
      const parsed = parseSopArray(reply);
      if (!parsed || parsed.length === 0) {
        setSopGenError(
          `AI returned unparseable output — try again. (got: ${reply
            .replace(/\s+/g, " ")
            .slice(0, 120)}…)`,
        );
        return;
      }
      const now = new Date().toISOString();
      const drafts: NbSop[] = parsed
        .filter((s) => s && (s.title || s.body))
        .map((s, i) => ({
          id: `sop-ai-${Date.now()}-${i}`,
          title: String(s.title || "AI-drafted SOP").slice(0, 120),
          body: String(s.body || ""),
          enabled: true,
          created: now,
        }));
      updatePrefs({ sops: [...drafts, ...prefs.sops] });
    } catch (err) {
      setSopGenError(
        err instanceof Error ? err.message : "AI generation failed",
      );
    } finally {
      setSopGenerating(false);
    }
  };

  // ── AI write/improve ONE SOP — considers the user's Title + Body draft,
  // the OTHER existing SOPs (complement, never duplicate/contradict), and
  // goals + deals. Writes the result straight into the editor. ──
  const [sopImproving, setSopImproving] = useState(false);
  const [sopImproveError, setSopImproveError] = useState("");

  const aiImproveSop = async (): Promise<void> => {
    if (!editingSop || sopImproving) return;
    setSopImproving(true);
    setSopImproveError("");
    try {
      let masterKey = "";
      try {
        const r = await fetch("/api/settings/global");
        if (r.ok) {
          const g = await r.json();
          masterKey = g.masterApiKey || g.apiKey || "";
        }
      } catch {
        /* ignore */
      }
      let pid = "";
      try {
        const r = await fetch("/api/active-project");
        if (r.ok) {
          const d = await r.json();
          pid = d?.activeProjectId || "";
        }
      } catch {
        /* ignore */
      }
      const gwToken = String(invention.settings.gatewayToken || "");
      const gwBase = String(
        invention.settings.gatewayBaseUrl || "",
      ).replace(/\/+$/, "");
      const candidates: Array<{ url: string; headers: Record<string, string> }> =
        [];
      if (masterKey && pid) {
        candidates.push({
          url: "/v1/chat/completions",
          headers: {
            Authorization: `Bearer ${masterKey}`,
            "X-Mother-Brain-Project": pid,
          },
        });
        candidates.push({
          url: "http://localhost:3100/v1/chat/completions",
          headers: {
            Authorization: `Bearer ${masterKey}`,
            "X-Mother-Brain-Project": pid,
          },
        });
      }
      if (gwToken && gwBase) {
        candidates.push({
          url: `${gwBase}/v1/chat/completions`,
          headers: { Authorization: `Bearer ${gwToken}` },
        });
      }
      if (candidates.length === 0) {
        setSopImproveError(
          "No LLM available — set Gateway URL + Token in the Wizard.",
        );
        return;
      }

      const others = prefs.sops.filter((s) => s.id !== editingSop.id);
      const othersSummary = others
        .map(
          (s) =>
            `- ${s.title || "(untitled)"}: ${(s.body || "")
              .replace(/[#*`>]/g, "")
              .trim()
              .slice(0, 150)}`,
        )
        .join("\n");
      const goalsSummary = prefs.goals
        .filter((g) => g.enabled)
        .map((g) => `- ${(g.title || "").slice(0, 100)}`)
        .join("\n");
      const dealsSummary = prefs.deals
        .map((d) => `- (${d.status || "draft"}) ${(d.title || "").slice(0, 100)}`)
        .join("\n");

      const sys = [
        "You write ONE B2B SOP (playbook) for an AI agent on the NEAR Neighbors network — business agents that knock on each other, negotiate partnerships, exchange referrals, and document deals.",
        'Reply with ONLY a JSON object — no prose, no code fences: {"title": string, "body": string}.',
        "body is markdown with numbered steps the agent follows in agent-to-agent conversations (under 120 words).",
        "Rules:",
        "- The user started a draft (title and/or body below, possibly empty or rough). IMPROVE and COMPLETE it — keep their intent, sharpen the wording, fill in missing steps.",
        "- Do NOT duplicate or contradict the existing SOPs listed below — this one must complement them.",
        "- Ground it in the business's goals and deals where relevant.",
        "- Never invent coupon codes, prices, or terms not provided.",
      ].join("\n");
      const user = [
        `Business agent: ${invention.settings.agentName || "this agent"}`,
        "",
        "USER'S DRAFT TITLE:",
        editingSop.title.trim() || "(empty — propose a clear, specific title)",
        "USER'S DRAFT BODY:",
        (editingSop.body || "(empty)").trim().slice(0, 1000),
        "",
        "EXISTING SOPs (complement, don't duplicate):",
        othersSummary || "(none)",
        "",
        "GOALS:",
        goalsSummary || "(none)",
        "DEALS:",
        dealsSummary || "(none)",
      ].join("\n");

      let reply = "";
      let lastErr = "";
      for (const c of candidates) {
        try {
          const res = await fetch(c.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...c.headers },
            body: JSON.stringify({
              model: "default",
              messages: [
                { role: "system", content: sys },
                { role: "user", content: user },
              ],
              max_tokens: 700,
            }),
            signal: AbortSignal.timeout(60_000),
          });
          if (!res.ok) {
            lastErr = `HTTP ${res.status}`;
            continue;
          }
          const data = await res.json();
          const r = data?.choices?.[0]?.message?.content;
          if (!r) {
            lastErr = "empty response";
            continue;
          }
          reply = r as string;
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : "failed";
        }
      }
      if (!reply) {
        setSopImproveError(`AI failed (${lastErr}) — try again.`);
        return;
      }

      // Parse a single JSON OBJECT — same 3 strategies as the array parser
      const tryParse = (s: string): unknown | null => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      };
      let obj: unknown = tryParse(reply.trim());
      if (obj === null)
        obj = tryParse(reply.replace(/```(?:json)?/gi, "").trim());
      if (obj === null) {
        const sIdx = reply.indexOf("{");
        const eIdx = reply.lastIndexOf("}");
        if (sIdx !== -1 && eIdx > sIdx)
          obj = tryParse(reply.slice(sIdx, eIdx + 1));
      }
      const o = obj as { title?: unknown; body?: unknown } | null;
      if (
        !o ||
        typeof o !== "object" ||
        (typeof o.title !== "string" && typeof o.body !== "string")
      ) {
        setSopImproveError(
          `AI returned unparseable output — try again. (got: ${reply
            .replace(/\s+/g, " ")
            .slice(0, 120)}…)`,
        );
        return;
      }
      updateSop(editingSop.id, {
        ...(typeof o.title === "string" && o.title.trim()
          ? { title: o.title.slice(0, 120) }
          : {}),
        ...(typeof o.body === "string" ? { body: o.body } : {}),
      });
    } catch (err) {
      setSopImproveError(err instanceof Error ? err.message : "AI failed");
    } finally {
      setSopImproving(false);
    }
  };

  // ── Tags — the user's own curated lists (local, per domain). A tag IS a
  // list: filter the registry by #saas and you see your "SaaS" list.
  const allTags = Array.from(
    new Set(Object.values(prefs.tags).flat()),
  ).sort();

  const tagCount = (tag: string): number =>
    Object.values(prefs.tags).filter((list) => list.includes(tag)).length;

  const toggleTag = (domain: string, tag: string): void => {
    setPrefs((prev) => {
      const cur = prev.tags[domain] || [];
      const next = cur.includes(tag)
        ? cur.filter((t) => t !== tag)
        : [...cur, tag];
      const tags = { ...prev.tags };
      if (next.length > 0) tags[domain] = next;
      else delete tags[domain];
      const p = { ...prev, tags };
      savePrefs(invention, p);
      return p;
    });
  };

  const submitTagInput = (domain: string): void => {
    const t = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (t) toggleTag(domain, t);
    setTagInput("");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchRegistry();
      setEntries(list);
      setFetchedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Send a REAL knock to the neighbor's public endpoint with our agent's
  // identity; their reply shows inline. (CRM logging of OUR outbound side
  // arrives with the neighbor-dialogue upgrade.)
  const sendKnock = async (agent: RegistryAgent) => {
    if (!knock || !knockReady) return;
    setKnock({ ...knock, busy: true, reply: "", error: "" });
    try {
      const res = await fetch(`${agent.agent_url.replace(/\/+$/, "")}/neighbor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${myAgentName} <${myAgentUrl}>`,
          from_name: myAgentName,
          from_url: myAgentUrl,
          message: knock.message,
        }),
        signal: AbortSignal.timeout(25_000), // neighbor replies may be LLM-generated
      });
      const text = await res.text();
      let reply = text;
      try {
        const j = JSON.parse(text) as { ok?: boolean; reply?: string; error?: string };
        reply = j.ok && j.reply ? j.reply : j.error || text;
      } catch {
        /* raw text */
      }
      if (res.ok) {
        void logOutboundToWorker(
          agent.domain,
          agent.name || agent.domain,
          agent.agent_url,
          knock.message,
          reply,
        );
      }
      setKnock({
        ...knock,
        busy: false,
        reply: reply.slice(0, 1200),
        error: res.ok ? "" : `HTTP ${res.status}`,
      });
    } catch (err) {
      setKnock({
        ...knock,
        busy: false,
        error: err instanceof Error ? err.message : "knock failed",
      });
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = entries.filter((a) => {
    if (listMode === "favorites" && !prefs.favorites.includes(a.domain))
      return false;
    if (listMode === "watched" && !prefs.watched.includes(a.domain))
      return false;
    if (
      listMode === "tag" &&
      !(prefs.tags[a.domain] || []).includes(activeTag)
    )
      return false;
    if (statusFilter !== "" && String(a.status) !== statusFilter) return false;
    if (!q) return true;
    return [
      a.name,
      a.domain,
      a.description || "",
      a.category || "",
      ...(a.tags || []),
      ...(a.capabilities || []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const activeCount = entries.filter((a) => a.status === 0).length;

  return (
    <div className="flex flex-col h-full min-h-[500px] overflow-hidden">
      {/* Redeploy toast — neighbors settings changed since the last deploy */}
      {showRedeployToast && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 shrink-0">
          <p className="text-[10px] font-mono text-yellow-400 truncate">
            ⚠ Neighbors settings changed (goals / targets / heartbeat) —
            Redeploy your agent in the Wizard to apply them on the worker.
          </p>
          <button
            type="button"
            data-a2a-nav
            onClick={() => setShowRedeployToast(false)}
            className="text-[10px] font-mono text-yellow-400/70 hover:text-yellow-300 shrink-0"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-row flex-1 min-h-0 overflow-hidden">
      {/* ══════════ LEFT — registry grid (discovery) ══════════ */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#1a1a1a] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network size={14} className="text-[#38bdf8]" />
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
                Neighbors Registry
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                ONCHAIN
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-gray-600">
                {fetchedAt ? `read ${fetchedAt.toLocaleTimeString()}` : ""}
              </span>
              <button
                onClick={load}
                disabled={loading}
                className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
                title="Refresh (5-min cache)"
              >
                <RefreshCw
                  size={14}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0 border border-[#1a1a1a] rounded-lg px-2 py-1 bg-[#0a0a0a]">
              <Search size={12} className="text-gray-600 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, domain, tag, capability…"
                className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-gray-300 outline-none placeholder:text-gray-700"
              />
            </div>
            <div className="w-[110px]">
              <ThemedSelect
                value={statusFilter}
                onChange={(v) => setStatusFilter(v)}
                options={[
                  { value: "", label: `All (${entries.length})` },
                  { value: "0", label: `Active (${activeCount})` },
                  { value: "1", label: `Paused (${entries.length - activeCount})` },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              ["all", `All (${entries.length})`],
              ["favorites", `★ Favorites (${prefs.favorites.length})`],
              ["watched", `👁 Watched (${prefs.watched.length})`],
            ] as Array<[ListMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                data-a2a-nav
                onClick={() => setListMode(mode)}
                className={`text-[10px] font-mono px-2 py-1 rounded-lg border transition-colors ${
                  listMode === mode
                    ? "bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30"
                    : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                data-a2a-nav
                onClick={() => {
                  if (listMode === "tag" && activeTag === t) {
                    setListMode("all");
                  } else {
                    setActiveTag(t);
                    setListMode("tag");
                  }
                }}
                className={`text-[10px] font-mono px-2 py-1 rounded-lg border transition-colors ${
                  listMode === "tag" && activeTag === t
                    ? "bg-[#39ff14]/10 text-[#39ff14] border-[#39ff14]/30"
                    : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                }`}
              >
                #{t} ({tagCount(t)})
              </button>
            ))}
          </div>
          <p className="text-[9px] font-mono text-gray-600">
            source: {NEIGHBORS_CONTRACT} · {NEAR_RPC.replace("https://", "")} ·
            free public read, 5-min cache
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 m-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-xs font-mono text-yellow-400">
              {error} — the registry read failed. Try Refresh.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <RefreshCw size={16} className="animate-spin text-gray-600" />
            <span className="ml-2 text-xs font-mono text-gray-500">
              Reading the chain…
            </span>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <Network size={24} className="text-gray-700 mb-2" />
            <p className="text-xs font-mono text-gray-600">
              {listMode === "all"
                ? "No agents registered yet"
                : listMode === "tag"
                  ? `No agents tagged #${activeTag} yet`
                  : `Nothing in ${listMode} yet — use ★ / 👁 on cards`}
            </p>
          </div>
        )}

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filtered.map((a) => {
              const isMe =
                myAgentUrl && a.agent_url?.replace(/\/+$/, "") === myAgentUrl;
              const fav = prefs.favorites.includes(a.domain);
              const watch = prefs.watched.includes(a.domain);
              const active = a.status === 0;
              const knockOpen = knock?.domain === a.domain;
              return (
                <div
                  key={a.domain + a.name}
                  className={`rounded-lg border p-3 space-y-2 cursor-pointer transition-colors hover:border-[#38bdf8]/30 ${
                    isMe
                      ? "border-[#38bdf8]/40 bg-[#38bdf8]/5"
                      : fav
                        ? "border-[#39ff14]/30 bg-[#0d0d14]"
                        : "border-[#1a1a1a] bg-[#0d0d14]"
                  }`}
                  onClick={(e) => {
                    // Whole card opens conversations — but never hijack the
                    // card's own controls (★ / 👁 / site / Knock / inputs).
                    if (
                      (e.target as HTMLElement).closest(
                        "button, a, input, textarea",
                      )
                    )
                      return;
                    openNbDetail(a);
                  }}
                  onContextMenu={(e) => {
                    // Right-click anywhere on the card → shoot-a-deal menu
                    e.preventDefault();
                    setDealShot(null);
                    setDealMenu({
                      domain: a.domain,
                      name: a.name || a.domain,
                      agentUrl: a.agent_url,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  title="Conversations with this neighbor"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-mono text-gray-200 truncate">
                          {a.name || "Unnamed agent"}
                        </p>
                        {isMe && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#38bdf8]/10 text-[#38bdf8] shrink-0">
                            YOU
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-gray-500 truncate">
                        {a.domain}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-a2a-nav
                        onClick={() => toggleDomain("favorites", a.domain)}
                        className={fav ? "text-[#39ff14]" : "text-gray-600 hover:text-gray-400"}
                        title={fav ? "Remove from Favorites" : "Add to Favorites"}
                      >
                        <Star size={13} fill={fav ? "currentColor" : "none"} />
                      </button>
                      <button
                        type="button"
                        data-a2a-nav
                        onClick={() => toggleDomain("watched", a.domain)}
                        className={watch ? "text-[#38bdf8]" : "text-gray-600 hover:text-gray-400"}
                        title={watch ? "Stop Watching" : "Watch (heartbeat keeps an eye)"}
                      >
                        <Eye size={13} />
                      </button>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 ${
                          active
                            ? "bg-[#00dc82]/10 text-[#00dc82]"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {active ? (
                          <CircleDot size={8} />
                        ) : (
                          <PauseCircle size={8} />
                        )}
                        {active ? "ACTIVE" : "PAUSED"}
                      </span>
                    </div>
                  </div>

                  {a.description && (
                    <p className="text-[10px] font-mono text-gray-400 leading-relaxed line-clamp-3">
                      {a.description}
                    </p>
                  )}

                  {/* ALL capabilities — the talking pieces */}
                  {(a.capabilities?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(a.capabilities || []).map((c) => (
                        <span
                          key={c}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#38bdf8]/10 text-[#38bdf8]"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}

                  {(a.tags?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(a.tags || []).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Your #tags — local curated lists (a tag IS a list) */}
                  <div className="flex flex-wrap items-center gap-1">
                    {(prefs.tags[a.domain] || []).map((t) => (
                      <button
                        key={t}
                        type="button"
                        data-a2a-nav
                        onClick={() => toggleTag(a.domain, t)}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] hover:bg-[#ff3d7f]/10 hover:text-[#ff3d7f] transition-colors"
                        title={`Remove #${t}`}
                      >
                        #{t} ✕
                      </button>
                    ))}
                    {tagEditDomain === a.domain ? (
                      <input
                        autoFocus
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            submitTagInput(a.domain);
                            setTagEditDomain(null);
                          }
                          if (e.key === "Escape") setTagEditDomain(null);
                        }}
                        onBlur={() => {
                          submitTagInput(a.domain);
                          setTagEditDomain(null);
                        }}
                        placeholder="tag + Enter (e.g. saas)"
                        className="bg-[#0a0a0a] border border-[#39ff14]/30 rounded px-1.5 py-0.5 text-[9px] font-mono text-gray-300 outline-none w-32"
                      />
                    ) : (
                      <button
                        type="button"
                        data-a2a-nav
                        onClick={() => {
                          setTagEditDomain(a.domain);
                          setTagInput("");
                        }}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-dashed border-[#1a1a1a] text-gray-600 hover:text-[#39ff14] hover:border-[#39ff14]/40 transition-colors"
                        title="Add a #tag — your own curated lists"
                      >
                        + tag
                      </button>
                    )}
                  </div>

                  {/* Knock — say hello */}
                  <div className="pt-1 border-t border-[#1a1a1a] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-gray-600">
                        since {nsToDate(a.registered_at)} · upd{" "}
                        {nsToDate(a.updated_at)}
                      </span>
                      <div className="flex items-center gap-2">
                        {a.website_url && (
                          <a
                            href={a.website_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] font-mono text-gray-500 hover:text-[#38bdf8] flex items-center gap-1"
                          >
                            <Globe size={9} />
                            site
                            <ExternalLink size={8} />
                          </a>
                        )}
                        {!isMe && (
                          <button
                            type="button"
                            data-a2a-nav
                            onClick={() =>
                              setKnock(
                                knockOpen
                                  ? null
                                  : {
                                      domain: a.domain,
                                      message: "",
                                      busy: false,
                                      reply: "",
                                      error: "",
                                    },
                              )
                            }
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#38bdf8]/10 text-[#38bdf8] hover:bg-[#38bdf8]/20 flex items-center gap-1"
                            title={
                              knockReady
                                ? "Send a real knock — a hello message to this agent"
                                : "Set your agent name + URL in the Wizard first"
                            }
                          >
                            <Send size={9} />
                            Knock…
                          </button>
                        )}
                      </div>
                    </div>
                    {knockOpen && (
                      <div className="space-y-1.5">
                        {!knockReady ? (
                          <p className="text-[9px] font-mono text-yellow-400">
                            Set your Agent Name + A2A URL in the Wizard first —
                            knocks identify you by them.
                          </p>
                        ) : (
                          <>
                            <textarea
                              value={knock.message}
                              onChange={(e) =>
                                setKnock({ ...knock, message: e.target.value })
                              }
                              placeholder={`Say hello to ${a.name}…`}
                              rows={2}
                              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2 py-1.5 text-[11px] font-mono text-gray-300 outline-none placeholder:text-gray-700 resize-none"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                data-a2a-nav
                                disabled={knock.busy || !knock.message.trim()}
                                onClick={() => sendKnock(a)}
                                className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30 hover:bg-[#38bdf8]/20 transition-colors disabled:opacity-40"
                              >
                                {knock.busy ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Send size={11} />
                                )}
                                {knock.busy ? "Knocking…" : "Send knock"}
                              </button>
                              {knock.error && (
                                <span className="text-[9px] font-mono text-[#ff3d7f]">
                                  {knock.error}
                                </span>
                              )}
                            </div>
                            {knock.reply && (
                              <div className="rounded-lg bg-[#0a0a0a] border border-[#1e1e2d] px-2 py-1.5">
                                <p className="text-[9px] font-mono text-gray-600 mb-0.5">
                                  {a.name} replied:
                                </p>
                                <p className="text-[10px] font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">
                                  {knock.reply}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════ RIGHT — the Neighbors console sidebar (~40%) ══════════ */}
      <div
        className="border-l border-[#1a1a1a] flex flex-col overflow-hidden bg-[#0a0a0a]"
        style={{ width: "40%", minWidth: 320 }}
      >
        <div className="px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-[#39ff14]" />
            <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
              Neighbors Console
            </span>
          </div>
          <p className="text-[9px] font-mono text-gray-600 mt-1">
            Goals are the intent you send out — Deals are what comes back
          </p>
        </div>

        {/* Horizontal tab switcher — Goals | Deals */}
        <div className="flex items-center gap-1.5 px-4 pt-3">
          {([
            ["goals", `🎯 Goals (${prefs.goals.length})`],
            ["deals", `🤝 Deals (${prefs.deals.length})`],
            ["sops", `📋 SOPs (${prefs.sops.length})`],
            ["heartbeat", "⏱ Heartbeat"],
          ] as Array<["goals" | "deals" | "sops" | "heartbeat", string]>).map(
            ([tab, label]) => (
            <button
              key={tab}
              type="button"
              data-a2a-nav
              onClick={() => setConsoleTab(tab)}
              className={`flex-1 text-[11px] font-mono px-2 py-1.5 rounded-lg border transition-colors ${
                consoleTab === tab
                  ? "bg-[#39ff14]/10 text-[#39ff14] border-[#39ff14]/30"
                  : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-5">
          {/* 🎯 Goals — a LIST; the agent's heartbeat/cron reviews the
              ENABLED goals and picks one to work on per run */}
          {consoleTab === "goals" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-gray-300">
                <Target size={11} className="text-[#39ff14]" />
                Goals ({prefs.goals.length}
                {prefs.goals.length > 0
                  ? ` · ${prefs.goals.filter((g) => g.enabled).length} on`
                  : ""}
                )
              </span>
              <button
                type="button"
                data-a2a-nav
                onClick={addGoal}
                className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border bg-[#39ff14]/10 text-[#39ff14] border-[#39ff14]/30 hover:bg-[#39ff14]/20 transition-colors"
              >
                <Plus size={10} />
                New goal
              </button>
            </div>

            {editingGoal ? (
              /* ── Per-goal editor: title + markdown body + preview ── */
              <div className="space-y-2 rounded-lg border border-[#39ff14]/20 bg-[#0d0d14] p-2.5">
                <input
                  value={editingGoal.title}
                  onChange={(e) =>
                    updateGoal(editingGoal.id, { title: e.target.value })
                  }
                  placeholder="Goal title — e.g. “Find referral partners”"
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2.5 py-1.5 text-xs font-mono text-gray-200 outline-none placeholder:text-gray-700"
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    data-a2a-nav
                    onClick={() =>
                      updateGoal(editingGoal.id, {
                        enabled: !editingGoal.enabled,
                      })
                    }
                    className={`flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                      editingGoal.enabled
                        ? "bg-[#00dc82]/10 text-[#00dc82] border-[#00dc82]/30"
                        : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                    }`}
                    title={
                      editingGoal.enabled
                        ? "Enabled — heartbeat can pick this goal. Click to pause."
                        : "Paused — kept but skipped. Click to enable."
                    }
                  >
                    <CircleDot size={9} />
                    {editingGoal.enabled ? "on — click to pause" : "paused — click to enable"}
                  </button>
                  <div className="flex items-center gap-1">
                    {([
                      ["edit", "Edit", Pencil],
                      ["preview", "Preview", BookOpen],
                    ] as Array<["edit" | "preview", string, typeof Pencil]>).map(
                      ([tab, label, Icon]) => (
                        <button
                          key={tab}
                          type="button"
                          data-a2a-nav
                          onClick={() => setGoalsTab(tab)}
                          className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-colors ${
                            goalsTab === tab
                              ? "bg-[#39ff14]/10 text-[#39ff14] border-[#39ff14]/30"
                              : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                          }`}
                        >
                          <Icon size={10} />
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                {goalsTab === "edit" ? (
                  <textarea
                    value={editingGoal.body}
                    onChange={(e) =>
                      updateGoal(editingGoal.id, { body: e.target.value })
                    }
                    placeholder={
                      "Describe this goal like a brief — who should your agent find, and what should it do when it finds them?\n\n- Companies that need websites\n- SaaS founders open to referral swaps\n- Local service businesses going online"
                    }
                    rows={10}
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2.5 text-xs font-mono text-gray-300 leading-relaxed outline-none placeholder:text-gray-700 resize-y focus:border-[#39ff14]/40"
                  />
                ) : editingGoal.body.trim() ? (
                  <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2.5 min-h-[160px]">
                    <FastMarkdown content={editingGoal.body} variant="chat" />
                  </div>
                ) : (
                  <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-6 text-center">
                    <p className="text-[10px] font-mono text-gray-600">
                      Nothing to preview yet — write this goal in Edit.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a]">
                  <button
                    type="button"
                    data-a2a-nav
                    onClick={() => deleteGoal(editingGoal.id)}
                    className="flex items-center gap-1 text-[10px] font-mono text-gray-600 hover:text-[#ff3d7f] transition-colors"
                    title="Delete this goal"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                  <button
                    type="button"
                    data-a2a-nav
                    onClick={() => setEditingGoalId(null)}
                    className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/30 hover:bg-[#39ff14]/20 transition-colors"
                  >
                    <CheckCircle2 size={11} />
                    Done
                  </button>
                </div>
              </div>
            ) : prefs.goals.length === 0 ? (
              <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14] px-3 py-6 text-center">
                <p className="text-[10px] font-mono text-gray-500">
                  No goals yet — create one.
                </p>
                <p className="text-[9px] font-mono text-gray-600 mt-1">
                  Your agent’s heartbeat reviews enabled goals and picks one to
                  work on each run.
                </p>
              </div>
            ) : (
              /* ── Goal rows ── */
              <div className="space-y-1">
                {prefs.goals.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#1a1a1a] bg-[#0d0d14] px-2 py-1.5"
                  >
                    <button
                      type="button"
                      data-a2a-nav
                      className="min-w-0 text-left flex-1"
                      onClick={() => {
                        setGoalsTab("edit");
                        setEditingGoalId(g.id);
                      }}
                      title="Edit this goal"
                    >
                      <p
                        className={`text-[11px] font-mono truncate ${
                          g.enabled ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {g.title || "(untitled goal)"}
                      </p>
                      <p className="text-[9px] font-mono text-gray-600 truncate">
                        {g.body
                          .replace(/[#*`>\-]/g, "")
                          .trim()
                          .slice(0, 64) || "empty — click to write"}
                      </p>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        data-a2a-nav
                        onClick={() => updateGoal(g.id, { enabled: !g.enabled })}
                        className={
                          g.enabled
                            ? "text-[#00dc82]"
                            : "text-gray-600 hover:text-gray-400"
                        }
                        title={
                          g.enabled
                            ? "Enabled — heartbeat can pick it. Click to pause."
                            : "Paused — click to enable."
                        }
                      >
                        <CircleDot size={12} />
                      </button>
                      <button
                        type="button"
                        data-a2a-nav
                        onClick={() => {
                          setGoalsTab("edit");
                          setEditingGoalId(g.id);
                        }}
                        className="text-gray-500 hover:text-gray-300"
                        title="Edit goal"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[9px] font-mono text-gray-600">
              markdown supported · saved locally for this project (v1) — on each
              heartbeat/cron run the agent reviews ENABLED goals and picks one
              to work on. ENABLED goals are also the intent the NEAR Neighbors
              Spider will use for discovery. Paused goals are kept but skipped.
            </p>
          </div>
          )}

          {/* 🤝 Deals — ideas & potential deals from neighbor conversations */}
          {consoleTab === "deals" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-gray-300">
                🤝 Deals ({prefs.deals.length})
              </span>
              <button
                type="button"
                data-a2a-nav
                onClick={addDeal}
                className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30 hover:bg-[#38bdf8]/20 transition-colors"
              >
                <Plus size={10} />
                New deal
              </button>
            </div>

            {editingDeal ? (
              /* ── Per-deal editor: title + markdown body + preview ── */
              <div className="space-y-2 rounded-lg border border-[#38bdf8]/20 bg-[#0d0d14] p-2.5">
                <input
                  value={editingDeal.title}
                  onChange={(e) =>
                    updateDeal(editingDeal.id, { title: e.target.value })
                  }
                  placeholder="Deal title — e.g. “Referral swap with Mother Brain”"
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2.5 py-1.5 text-xs font-mono text-gray-200 outline-none placeholder:text-gray-700"
                />
                <div className="flex items-center justify-between">
                  <div className="w-28 shrink-0">
                    <ThemedSelect
                      value={editingDeal.status || "draft"}
                      onChange={(v) =>
                        updateDeal(editingDeal.id, {
                          status: v as NbDeal["status"],
                        })
                      }
                      options={[
                        { value: "draft", label: "Draft" },
                        { value: "approved", label: "Approved" },
                        { value: "done", label: "Done" },
                      ]}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {([
                      ["edit", "Edit", Pencil],
                      ["preview", "Preview", BookOpen],
                    ] as Array<["edit" | "preview", string, typeof Pencil]>).map(
                      ([tab, label, Icon]) => (
                        <button
                          key={tab}
                          type="button"
                          data-a2a-nav
                          onClick={() => setDealsTab(tab)}
                          className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-colors ${
                            dealsTab === tab
                              ? "bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30"
                              : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                          }`}
                        >
                          <Icon size={10} />
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                {dealsTab === "edit" ? (
                  <textarea
                    value={editingDeal.body}
                    onChange={(e) =>
                      updateDeal(editingDeal.id, { body: e.target.value })
                    }
                    placeholder={
                      "Document the idea or potential deal — who your agent talked to, the opportunity, the terms, and the next steps.\n\n- Partner: motherbrain.app\n- Offer: 25% partner discount + commission\n- Next: owner approval, then create the code in Stripe"
                    }
                    rows={10}
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2.5 text-xs font-mono text-gray-300 leading-relaxed outline-none placeholder:text-gray-700 resize-y focus:border-[#38bdf8]/40"
                  />
                ) : editingDeal.body.trim() ? (
                  <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2.5 min-h-[160px]">
                    <FastMarkdown content={editingDeal.body} variant="chat" />
                  </div>
                ) : (
                  <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-6 text-center">
                    <p className="text-[10px] font-mono text-gray-600">
                      Nothing to preview yet — write this deal in Edit.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a]">
                  <button
                    type="button"
                    data-a2a-nav
                    onClick={() => deleteDeal(editingDeal.id)}
                    className="flex items-center gap-1 text-[10px] font-mono text-gray-600 hover:text-[#ff3d7f] transition-colors"
                    title="Delete this deal"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                  <button
                    type="button"
                    data-a2a-nav
                    onClick={() => setEditingDealId(null)}
                    className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30 hover:bg-[#38bdf8]/20 transition-colors"
                  >
                    <CheckCircle2 size={11} />
                    Done
                  </button>
                </div>
              </div>
            ) : prefs.deals.length === 0 ? (
              <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14] px-3 py-6 text-center">
                <p className="text-[10px] font-mono text-gray-500">
                  No deals documented yet — create one.
                </p>
                <p className="text-[9px] font-mono text-gray-600 mt-1">
                  This is where ideas and potential deals from neighbor
                  conversations get written down. Agents will document here
                  themselves once the goals→worker bridge ships.
                </p>
              </div>
            ) : (
              /* ── Deal rows ── */
              <div className="space-y-1">
                {prefs.deals.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#1a1a1a] bg-[#0d0d14] px-2 py-1.5"
                  >
                    <button
                      type="button"
                      data-a2a-nav
                      className="min-w-0 text-left flex-1"
                      onClick={() => {
                        setDealsTab("edit");
                        setEditingDealId(d.id);
                      }}
                      title="Edit this deal"
                    >
                      <p className="text-[11px] font-mono text-gray-300 truncate flex items-center gap-1.5">
                        <span
                          className={`text-[8px] font-mono px-1 py-0.5 rounded shrink-0 ${
                            d.status === "approved"
                              ? "bg-[#00dc82]/10 text-[#00dc82]"
                              : d.status === "done"
                                ? "bg-[#38bdf8]/10 text-[#38bdf8]"
                                : "bg-gray-500/10 text-gray-500"
                          }`}
                        >
                          {d.status || "draft"}
                        </span>
                        <span className="truncate">{d.title || "(untitled deal)"}</span>
                      </p>
                      <p className="text-[9px] font-mono text-gray-600 truncate">
                        {d.body
                          .replace(/[#*`>\-]/g, "")
                          .trim()
                          .slice(0, 64) || "empty — click to write"}
                      </p>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        data-a2a-nav
                        onClick={() => {
                          setDealsTab("edit");
                          setEditingDealId(d.id);
                        }}
                        className="text-gray-500 hover:text-gray-300"
                        title="Edit deal"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {dealsDb === "local-only" && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-mono text-yellow-400">
                  Deals are saving locally only — the deals table is missing
                  from your agent's database.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-a2a-nav
                    disabled={provisioning}
                    onClick={provisionDealsTable}
                    className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20 transition-colors disabled:opacity-40"
                  >
                    {provisioning ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Plus size={11} />
                    )}
                    {provisioning ? "Creating table…" : "Create deals table"}
                  </button>
                  {provisionMsg && (
                    <span className="text-[9px] font-mono text-gray-500 truncate">
                      {provisionMsg}
                    </span>
                  )}
                </div>
              </div>
            )}
            <p className="text-[9px] font-mono text-gray-600">
              markdown supported · durable in your agent's database (same row
              everywhere — no stale copies). APPROVED deals go live in your
              agent's conversations immediately — no redeploy needed.
            </p>
          </div>
          )}

          {/* 📋 SOPs — B2B playbooks for neighbor conversations */}
          {consoleTab === "sops" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-gray-300">
                📋 SOPs ({prefs.sops.length}
                {prefs.sops.length > 0
                  ? ` · ${prefs.sops.filter((s) => s.enabled).length} on`
                  : ""}
                )
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-a2a-nav
                  onClick={aiGenerateSops}
                  disabled={sopGenerating}
                  className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border bg-[#a78bfa]/10 text-[#a78bfa] border-[#a78bfa]/30 hover:bg-[#a78bfa]/20 transition-colors disabled:opacity-40"
                  title="Reads your Goals + Deals and drafts B2B playbooks via your LLM"
                >
                  {sopGenerating ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Sparkles size={10} />
                  )}
                  {sopGenerating ? "Generating…" : "AI generate"}
                </button>
                <button
                  type="button"
                  data-a2a-nav
                  onClick={addSop}
                  className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border bg-[#a78bfa]/10 text-[#a78bfa] border-[#a78bfa]/30 hover:bg-[#a78bfa]/20 transition-colors"
                >
                  <Plus size={10} />
                  New SOP
                </button>
              </div>
            </div>
            {sopGenError && (
              <p className="text-[9px] font-mono text-[#ff3d7f]">{sopGenError}</p>
            )}

            {editingSop ? (
              <div className="space-y-2 rounded-lg border border-[#a78bfa]/20 bg-[#0d0d14] p-2.5">
                <input
                  value={editingSop.title}
                  onChange={(e) =>
                    updateSop(editingSop.id, { title: e.target.value })
                  }
                  placeholder="SOP title — e.g. “How to handle inbound partnership offers”"
                  className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2.5 py-1.5 text-xs font-mono text-gray-200 outline-none placeholder:text-gray-700"
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    data-a2a-nav
                    onClick={() =>
                      updateSop(editingSop.id, {
                        enabled: !editingSop.enabled,
                      })
                    }
                    className={`flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                      editingSop.enabled
                        ? "bg-[#00dc82]/10 text-[#00dc82] border-[#00dc82]/30"
                        : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                    }`}
                  >
                    <CircleDot size={9} />
                    {editingSop.enabled ? "on — click to pause" : "paused — click to enable"}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-a2a-nav
                      onClick={aiImproveSop}
                      disabled={sopImproving}
                      className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border bg-[#a78bfa]/10 text-[#a78bfa] border-[#a78bfa]/30 hover:bg-[#a78bfa]/20 transition-colors disabled:opacity-40"
                      title="AI completes this SOP from your Title + Body draft, your other SOPs, goals, and deals"
                    >
                      {sopImproving ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Sparkles size={10} />
                      )}
                      {sopImproving
                        ? "Writing…"
                        : editingSop.title.trim() || editingSop.body.trim()
                          ? "AI improve"
                          : "AI write"}
                    </button>
                    {([
                      ["edit", "Edit", Pencil],
                      ["preview", "Preview", BookOpen],
                    ] as Array<["edit" | "preview", string, typeof Pencil]>).map(
                      ([tab, label, Icon]) => (
                        <button
                          key={tab}
                          type="button"
                          data-a2a-nav
                          onClick={() => setSopsTab(tab)}
                          className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-colors ${
                            sopsTab === tab
                              ? "bg-[#a78bfa]/10 text-[#a78bfa] border-[#a78bfa]/30"
                              : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                          }`}
                        >
                          <Icon size={10} />
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                {sopImproveError && (
                  <p className="text-[9px] font-mono text-[#ff3d7f]">
                    {sopImproveError}
                  </p>
                )}
                {sopsTab === "edit" ? (
                  <textarea
                    value={editingSop.body}
                    onChange={(e) =>
                      updateSop(editingSop.id, { body: e.target.value })
                    }
                    placeholder={
                      "Write this playbook like a brief for your agent — when it applies and exactly what to do.\n\nExample: When another agent offers a partnership:\n1. Thank them and show genuine interest\n2. Ask what they need from our side\n3. Propose: we feature them on our Partners page if they feature us\n4. Never commit pricing — say the owner confirms all terms"
                    }
                    rows={10}
                    className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2.5 text-xs font-mono text-gray-300 leading-relaxed outline-none placeholder:text-gray-700 resize-y focus:border-[#a78bfa]/40"
                  />
                ) : editingSop.body.trim() ? (
                  <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2.5 min-h-[160px]">
                    <FastMarkdown content={editingSop.body} variant="chat" />
                  </div>
                ) : (
                  <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-6 text-center">
                    <p className="text-[10px] font-mono text-gray-600">
                      Nothing to preview yet — write this SOP in Edit.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a]">
                  <button
                    type="button"
                    data-a2a-nav
                    onClick={() => deleteSop(editingSop.id)}
                    className="flex items-center gap-1 text-[10px] font-mono text-gray-600 hover:text-[#ff3d7f] transition-colors"
                    title="Delete this SOP"
                  >
                    <Trash2 size={11} />
                    Delete
                  </button>
                  <button
                    type="button"
                    data-a2a-nav
                    onClick={() => setEditingSopId(null)}
                    className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg bg-[#a78bfa]/10 text-[#a78bfa] border border-[#a78bfa]/30 hover:bg-[#a78bfa]/20 transition-colors"
                  >
                    <CheckCircle2 size={11} />
                    Done
                  </button>
                </div>
              </div>
            ) : prefs.sops.length === 0 ? (
              <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14] px-3 py-6 text-center">
                <p className="text-[10px] font-mono text-gray-500">
                  No SOPs yet — create one.
                </p>
                <p className="text-[9px] font-mono text-gray-600 mt-1">
                  B2B playbooks your agent follows in neighbor conversations —
                  how to handle offers, what to propose, what to escalate.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {prefs.sops.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#1a1a1a] bg-[#0d0d14] px-2 py-1.5"
                  >
                    <button
                      type="button"
                      data-a2a-nav
                      className="min-w-0 text-left flex-1"
                      onClick={() => {
                        setSopsTab("edit");
                        setEditingSopId(s.id);
                      }}
                      title="Edit this SOP"
                    >
                      <p
                        className={`text-[11px] font-mono truncate ${
                          s.enabled ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {s.title || "(untitled SOP)"}
                      </p>
                      <p className="text-[9px] font-mono text-gray-600 truncate">
                        {s.body
                          .replace(/[#*`>\-]/g, "")
                          .trim()
                          .slice(0, 64) || "empty — click to write"}
                      </p>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        data-a2a-nav
                        onClick={() =>
                          updateSop(s.id, { enabled: !s.enabled })
                        }
                        className={
                          s.enabled
                            ? "text-[#00dc82]"
                            : "text-gray-600 hover:text-gray-400"
                        }
                        title={
                          s.enabled
                            ? "Enabled — injected into neighbor chats. Click to pause."
                            : "Paused — click to enable."
                        }
                      >
                        <CircleDot size={12} />
                      </button>
                      <button
                        type="button"
                        data-a2a-nav
                        onClick={() => {
                          setSopsTab("edit");
                          setEditingSopId(s.id);
                        }}
                        className="text-gray-500 hover:text-gray-300"
                        title="Edit SOP"
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[9px] font-mono text-gray-600">
              markdown supported · deployed with your agent (redeploy to apply)
              · ENABLED SOPs are injected into every neighbor conversation as
              B2B playbooks. Different from your website SOPs — these govern
              agent-to-agent talks.
            </p>
          </div>
          )}

          {/* ⏱ Heartbeat — the outreach engine */}
          {consoleTab === "heartbeat" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-gray-300">
                ⏱ Heartbeat
              </span>
              <button
                type="button"
                data-a2a-nav
                onClick={() => setHeartbeatOn((v) => !v)}
                className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  heartbeatOn
                    ? "bg-[#00dc82]/10 text-[#00dc82] border-[#00dc82]/30"
                    : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                }`}
                title={
                  heartbeatOn
                    ? "Enabled — runs on your schedule. Click to pause."
                    : "Paused. Click to enable scheduled outreach."
                }
              >
                <CircleDot size={10} />
                {heartbeatOn ? "on — click to pause" : "paused — click to enable"}
              </button>
            </div>

            {/* Autonomy — the B2B mandate level */}
            <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-gray-600 w-14 shrink-0">
                  Autonomy
                </span>
                <div className="flex-1">
                  <ThemedSelect
                    value={neighborAutonomy}
                    onChange={(v) =>
                      setNeighborAutonomy(v as "1" | "2" | "3")
                    }
                    options={[
                      {
                        value: "1",
                        label: "L1 — Informational (deflect deals)",
                      },
                      {
                        value: "2",
                        label: "L2 — Negotiate + Escalate",
                      },
                      {
                        value: "3",
                        label: "L3 — Autonomous within approved deals",
                      },
                    ]}
                  />
                </div>
              </div>
              <p className="text-[9px] font-mono text-gray-600 leading-relaxed">
                How much authority your agent has in agent-to-agent
                conversations. L2 (recommended): discusses partnerships and
                proposes terms, but the owner confirms everything. Deploy with
                your agent — redeploy to apply.
              </p>
            </div>

            {/* Schedule — interval / daily+time / weekly, timezone-aware */}
            <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-gray-600 w-14 shrink-0">
                  Schedule
                </span>
                <div className="flex-1">
                  <ThemedSelect
                    value={hbSchedule.mode}
                    onChange={(v) =>
                      setHbSchedule((s) => ({
                        ...s,
                        mode: v as HbSchedule["mode"],
                      }))
                    }
                    options={[
                      { value: "interval", label: "Hourly interval" },
                      { value: "daily", label: "Daily at time" },
                      { value: "weekly", label: "Weekly on day" },
                    ]}
                  />
                </div>
              </div>
              {hbSchedule.mode === "interval" ? (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-gray-600 w-14 shrink-0">
                    Every
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={hbSchedule.intervalHours}
                    onChange={(e) =>
                      setHbSchedule((s) => ({
                        ...s,
                        intervalHours: Math.min(
                          24,
                          Math.max(1, Number(e.target.value) || 1),
                        ),
                      }))
                    }
                    className="w-16 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2 py-1 text-[10px] font-mono text-gray-300 outline-none"
                  />
                  <span className="text-[10px] font-mono text-gray-500">hours</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {hbSchedule.mode === "weekly" && (
                    <div className="flex-1">
                      <ThemedSelect
                        value={String(hbSchedule.day)}
                        onChange={(v) =>
                          setHbSchedule((s) => ({ ...s, day: Number(v) }))
                        }
                        options={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                          (d, i) => ({ value: String(i), label: d }),
                        )}
                      />
                    </div>
                  )}
                  <input
                    type="time"
                    value={hbSchedule.time}
                    onChange={(e) =>
                      setHbSchedule((s) => ({
                        ...s,
                        time: e.target.value || "09:00",
                      }))
                    }
                    className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2 py-1 text-[10px] font-mono text-gray-300 outline-none"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-gray-600 w-14 shrink-0">
                  Time zone
                </span>
                <div className="flex-1">
                  <ThemedSelect
                    value={hbSchedule.tz}
                    onChange={(v) => setHbSchedule((s) => ({ ...s, tz: v }))}
                    options={TZ_OPTIONS.map(([v, l]) => ({
                      value: v,
                      label: l,
                    }))}
                  />
                </div>
              </div>
              <p className="text-[9px] font-mono text-gray-600">
                Current: {hbScheduleLabel(hbSchedule)} · the worker checks every
                30 min and runs when your window opens
              </p>
            </div>

            <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14] p-3 space-y-1.5 text-[10px] font-mono text-gray-500">
              <p className="text-gray-400">
                On each run ({hbScheduleLabel(hbSchedule)}), your agent:
              </p>
              <p>
                1. Picks one ENABLED goal ({prefs.goals.filter((g) => g.enabled).length}{" "}
                on)
              </p>
              <p>
                2. Picks a neighbor from your curated targets ({
                  Array.from(
                    new Set([...prefs.favorites, ...Object.keys(prefs.tags)]),
                  ).length
                }{" "}
                = ★ favorites + #tagged)
              </p>
              <p>3. Knocks with a brief built from that goal</p>
              <p className="text-gray-600">
                Their reply lands in Conversations — a real thread you can
                continue. The Spider Agent joins later as a discovery source
                for NEW neighbors; for now it only knocks who you curated.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-a2a-nav
                disabled={!heartbeatReady || heartbeatBusy}
                onClick={runHeartbeatNow}
                className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg bg-[#39ff14]/10 text-[#39ff14] border border-[#39ff14]/30 hover:bg-[#39ff14]/20 transition-colors disabled:opacity-40"
              >
                {heartbeatBusy ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Send size={11} />
                )}
                {heartbeatBusy ? "Running…" : "Run now"}
              </button>
              {settingsSync === "saving" && (
                <span className="text-[9px] font-mono text-gray-600">
                  syncing settings…
                </span>
              )}
              {settingsSync === "saved" && (
                <span className="text-[9px] font-mono text-gray-600">
                  settings synced · redeploy to apply
                </span>
              )}
              {settingsSync === "error" && (
                <span className="text-[9px] font-mono text-[#ff3d7f]">
                  settings sync failed — is a project selected?
                </span>
              )}
            </div>

            {!heartbeatReady && (
              <p className="text-[9px] font-mono text-yellow-400">
                Run now needs your Agent URL + Gateway Token — set them in the
                Wizard first. The cron runs on the deployed worker regardless.
              </p>
            )}

            {heartbeatResult && (
              <div className="rounded-lg bg-[#0a0a0a] border border-[#1e1e2d] px-3 py-2.5">
                <p className="text-[10px] font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {heartbeatResult}
                </p>
              </div>
            )}

            <p className="text-[9px] font-mono text-gray-600">
              Goals, targets, and this toggle deploy with your agent — after
              changing them, Redeploy (Wizard) and the next cron picks them up
              (or Run now to test immediately).
            </p>

            {/* 🧹 Maintenance — one-time thread cleanup */}
            <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14] p-3 space-y-2">
              <p className="text-[10px] font-mono text-gray-400">
                🧹 Maintenance — consolidate threads
              </p>
              <p className="text-[9px] font-mono text-gray-600 leading-relaxed">
                One neighbor = ONE conversation thread + ONE entity, forever.
                Threads created before unified identity (e.g.
                neighbor:a2a.domain vs neighbor:domain) get merged into the
                canonical thread. Safe to re-run.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-a2a-nav
                  disabled={!heartbeatReady || consolidateBusy}
                  onClick={runConsolidate}
                  className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30 hover:bg-[#38bdf8]/20 transition-colors disabled:opacity-40"
                >
                  {consolidateBusy ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <RefreshCw size={11} />
                  )}
                  {consolidateBusy ? "Consolidating…" : "Consolidate threads"}
                </button>
              </div>
              {consolidateResult && (
                <p className="text-[9px] font-mono text-gray-400 leading-relaxed">
                  {consolidateResult}
                </p>
              )}
              {!heartbeatReady && (
                <p className="text-[9px] font-mono text-yellow-400">
                  Needs Agent URL + Gateway Token (Wizard).
                </p>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
      </div>

      {/* ══ Shoot-a-deal context menu (right-click on a card) ══ */}
      {dealMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => {
              setDealMenu(null);
              setDealShot(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setDealMenu(null);
              setDealShot(null);
            }}
          />
          <div
            className="fixed z-50 w-72 rounded-lg border border-[#38bdf8]/30 bg-[#0a0a0a] shadow-xl shadow-black/50 overflow-hidden"
            style={{
              left: Math.min(dealMenu.x, window.innerWidth - 300),
              top: Math.min(dealMenu.y, window.innerHeight - 260),
            }}
          >
            <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between">
              <p className="text-[10px] font-mono text-gray-400 truncate">
                🤝 Shoot a deal → {dealMenu.name}
              </p>
              <button
                type="button"
                data-a2a-nav
                onClick={() => {
                  setDealMenu(null);
                  setDealShot(null);
                }}
                className="text-[10px] font-mono text-gray-600 hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto p-1.5 space-y-1">
              {!knockReady ? (
                <p className="text-[9px] font-mono text-yellow-400 px-2 py-2">
                  Set your Agent Name + A2A URL in the Wizard first — deals
                  identify you by them.
                </p>
              ) : prefs.deals.length === 0 ? (
                <p className="text-[9px] font-mono text-gray-600 px-2 py-2">
                  No deals yet — create one in the Console → 🤝 Deals tab, then
                  right-click any neighbor to send it.
                </p>
              ) : (
                prefs.deals.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    data-a2a-nav
                    disabled={!!dealShot?.busy}
                    onClick={() => shootDeal(d)}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[#38bdf8]/10 transition-colors disabled:opacity-40"
                    title="Send this deal as a knock"
                  >
                    <p className="text-[10px] font-mono text-gray-300 truncate flex items-center gap-1.5">
                      <span
                        className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${
                          d.status === "approved"
                            ? "bg-[#00dc82]/10 text-[#00dc82]"
                            : d.status === "done"
                              ? "bg-[#38bdf8]/10 text-[#38bdf8]"
                              : "bg-gray-500/10 text-gray-500"
                        }`}
                      >
                        {d.status || "draft"}
                      </span>
                      <span className="truncate">
                        {d.title || "(untitled deal)"}
                      </span>
                    </p>
                  </button>
                ))
              )}
            </div>
            {(dealShot?.busy || dealShot?.result || dealShot?.error) && (
              <div className="px-3 py-2 border-t border-[#1a1a1a] space-y-1">
                {dealShot?.busy && (
                  <p className="text-[9px] font-mono text-gray-500 flex items-center gap-1.5">
                    <Loader2 size={10} className="animate-spin" /> Sending to{" "}
                    {dealMenu.name}…
                  </p>
                )}
                {dealShot?.error && (
                  <p className="text-[9px] font-mono text-[#ff3d7f]">
                    ❌ {dealShot.error}
                  </p>
                )}
                {dealShot?.result && (
                  <div>
                    <p className="text-[9px] font-mono text-gray-600 mb-0.5">
                      {dealMenu.name} replied:
                    </p>
                    <p className="text-[9px] font-mono text-gray-300 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">
                      {dealShot.result}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ Neighbor detail modal — conversations with one neighbor ══ */}
      {nbDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => {
            setNbDetail(null);
            setNbOpenThread(null);
          }}
        >
          <div
            className="w-full max-w-xl max-h-[80vh] rounded-xl border border-[#1a1a1a] bg-[#0a0a0a] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
              <div className="min-w-0">
                <p className="text-xs font-mono text-gray-200 truncate">
                  {nbDetail.agent.name || "Unnamed agent"}
                </p>
                <p className="text-[9px] font-mono text-gray-600 truncate">
                  neighbor:{nbDetail.agent.domain} · conversation history
                </p>
              </div>
              <button
                type="button"
                data-a2a-nav
                onClick={() => {
                  setNbDetail(null);
                  setNbOpenThread(null);
                }}
                className="text-[10px] font-mono text-gray-500 hover:text-gray-300 px-2 py-1 shrink-0"
              >
                ✕ close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {nbDetail.loading ? (
                <div className="flex items-center gap-2 py-6 justify-center">
                  <Loader2 size={14} className="animate-spin text-gray-600" />
                  <span className="text-[10px] font-mono text-gray-500">
                    Reading conversations…
                  </span>
                </div>
              ) : nbDetail.error ? (
                <p className="text-[10px] font-mono text-yellow-400 py-4 text-center">
                  {nbDetail.error}
                </p>
              ) : nbDetail.threads.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[10px] font-mono text-gray-500">
                    No conversations with {nbDetail.agent.name || "this neighbor"}{" "}
                    yet.
                  </p>
                  <p className="text-[9px] font-mono text-gray-600 mt-1">
                    Knock… on their card starts the first thread — heartbeat
                    knocks land here too.
                  </p>
                </div>
              ) : (
                nbDetail.threads.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14] overflow-hidden"
                  >
                    <button
                      type="button"
                      data-a2a-nav
                      className="w-full text-left px-3 py-2 hover:bg-[#111118] transition-colors"
                      onClick={() =>
                        nbOpenThread?.id === t.id
                          ? setNbOpenThread(null)
                          : openNbThread(t)
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-mono text-gray-300 truncate">
                          Conversation {t.id.slice(0, 8)}
                        </p>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {t.status && (
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                                t.status === "completed"
                                  ? "bg-[#00dc82]/10 text-[#00dc82]"
                                  : "bg-yellow-500/10 text-yellow-400"
                              }`}
                            >
                              {t.status}
                            </span>
                          )}
                          <span className="text-[9px] font-mono text-gray-600">
                            {t.created_at
                              ? new Date(t.created_at).toLocaleDateString()
                              : ""}
                          </span>
                        </span>
                      </div>
                      <p className="text-[9px] font-mono text-gray-600">
                        click to {nbOpenThread?.id === t.id ? "collapse" : "expand"}{" "}
                        · also preselects this thread in the Conversations tab
                      </p>
                    </button>
                    {nbOpenThread?.id === t.id && (
                      <div className="px-3 pb-3 space-y-2 border-t border-[#1a1a1a] pt-2">
                        {nbOpenThread.loading ? (
                          <p className="text-[9px] font-mono text-gray-600">
                            loading messages…
                          </p>
                        ) : nbOpenThread.msgs.length === 0 ? (
                          <p className="text-[9px] font-mono text-gray-600">
                            no messages found
                          </p>
                        ) : (
                          nbOpenThread.msgs.map((m, i) => (
                            <div
                              key={i}
                              className="rounded-lg bg-[#0a0a0a] border border-[#1e1e2d] px-2.5 py-2"
                            >
                              <p
                                className={`text-[9px] font-mono mb-1 ${
                                  m.role === "agent"
                                    ? "text-[#39ff14]"
                                    : m.role === "error"
                                      ? "text-[#ff3d7f]"
                                      : "text-[#38bdf8]"
                                }`}
                              >
                                {m.role === "agent"
                                  ? myAgentName || "Your agent"
                                  : m.role === "error"
                                    ? "error"
                                    : nbDetail.agent.name || "Neighbor"}
                              </p>
                              <FastMarkdown
                                content={m.text.slice(0, 2000)}
                                variant="chat"
                              />
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NeighborsView;
