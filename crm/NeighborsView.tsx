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

import React, { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import ThemedSelect from "../../../components/ThemedSelect";
import FastMarkdown from "../../../components/FastMarkdown";

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
  created: string; // ISO
}

interface NbPrefs {
  favorites: string[]; // domains
  watched: string[]; // domains
  goals: NbGoal[];
  deals: NbDeal[];
  tags: Record<string, string[]>; // domain → the user's own #tags (curated lists)
}

const EMPTY_PREFS: NbPrefs = {
  favorites: [],
  watched: [],
  goals: [],
  deals: [],
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
    return {
      favorites: Array.isArray(p.favorites) ? p.favorites : [],
      watched: Array.isArray(p.watched) ? p.watched : [],
      goals,
      deals,
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

  const [consoleTab, setConsoleTab] = useState<"goals" | "deals">("goals");
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [dealsTab, setDealsTab] = useState<"edit" | "preview">("edit");

  const [activeTag, setActiveTag] = useState("");
  const [tagEditDomain, setTagEditDomain] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // Which registry entry is THIS agent? (match on our deployed agentUrl)
  const myAgentUrl = String(
    invention.settings.agentUrl || "",
  ).replace(/\/+$/, "");
  const myAgentName = String(invention.settings.agentName || "");
  const knockReady = !!(myAgentUrl && myAgentName);

  useEffect(() => {
    setPrefs(loadPrefs(invention));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      id: `deal-${Date.now()}`,
      title: "",
      body: "",
      created: new Date().toISOString(),
    };
    updatePrefs({ deals: [deal, ...prefs.deals] });
    setDealsTab("edit");
    setEditingDealId(deal.id);
  };

  const updateDeal = (id: string, patch: Partial<NbDeal>): void => {
    updatePrefs({
      deals: prefs.deals.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  };

  const deleteDeal = (id: string): void => {
    updatePrefs({ deals: prefs.deals.filter((d) => d.id !== id) });
    if (editingDealId === id) setEditingDealId(null);
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
    <div className="flex flex-row h-full min-h-[500px] overflow-hidden">
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
                  className={`rounded-lg border p-3 space-y-2 ${
                    isMe
                      ? "border-[#38bdf8]/40 bg-[#38bdf8]/5"
                      : fav
                        ? "border-[#39ff14]/30 bg-[#0d0d14]"
                        : "border-[#1a1a1a] bg-[#0d0d14]"
                  }`}
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
          ] as Array<["goals" | "deals", string]>).map(([tab, label]) => (
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
                <div className="flex items-center justify-end">
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
                      <p className="text-[11px] font-mono text-gray-300 truncate">
                        {d.title || "(untitled deal)"}
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
            <p className="text-[9px] font-mono text-gray-600">
              markdown supported · saved locally for this project (v1) — deals
              start as notes; with owner approval they become plans the agents
              execute.
            </p>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NeighborsView;
