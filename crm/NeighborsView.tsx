// ---------------------------------------------------------------------------
// A2A Agent — Neighbors View (the onchain registry, inside Mother Brain)
// ---------------------------------------------------------------------------
// v2 — the B2B console basics (2026-08-25):
//   • ★ Favorites + 👁 Watched — per-card toggles + filter pills
//   • Full capability chips (no "+N" truncation) — capabilities are the
//     "talking pieces" agents introduce themselves with
//   • Knock… — inline composer that POSTs a real knock to the neighbor's
//     public /neighbor endpoint (with our agent's identity) and shows their
//     reply. Conversation-logging into the CRM arrives with the neighbor
//     dialogue upgrade (see the registry review session).
//   • 🎯 Goals — owner intent ("companies who provide XYZ") — the groundwork
//     for the heartbeat/Spider lead-gen engine.
// Favorites/Watched/Goals persist locally per project for now (v1); they
// graduate to onchain curated lists when the Spider lands.
//
// Registry data reads the LIVE $NEAR chain via free public FastNEAR RPC
// (no backend, no keys, 5-min cache) — same pattern as the website guide and
// the wizard's onchain check. Testnet constants flip at mainnet graduation.
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
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import ThemedSelect from "../../../components/ThemedSelect";

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

// ── Local per-project prefs (v1) — favorites / watched / goals ────────────

interface NbPrefs {
  favorites: string[]; // domains
  watched: string[]; // domains
  goals: string;
}

const EMPTY_PREFS: NbPrefs = { favorites: [], watched: [], goals: "" };

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
    const p = JSON.parse(raw) as Partial<NbPrefs>;
    return {
      favorites: Array.isArray(p.favorites) ? p.favorites : [],
      watched: Array.isArray(p.watched) ? p.watched : [],
      goals: typeof p.goals === "string" ? p.goals : "",
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

type ListMode = "all" | "favorites" | "watched";

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

  // v2 state
  const [prefs, setPrefs] = useState<NbPrefs>({ ...EMPTY_PREFS });
  const [listMode, setListMode] = useState<ListMode>("all");
  const [knock, setKnock] = useState<KnockState | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);

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

  // Send a REAL knock to the neighbor's public endpoint, signed with our
  // agent's identity. Their reply shows inline. (CRM logging arrives with
  // the neighbor-dialogue upgrade — this is the v1 direct path.)
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
        signal: AbortSignal.timeout(15_000),
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

        {/* Row: search + status + list-mode pills */}
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
        <div className="flex items-center gap-2">
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
        </div>

        {/* Goals — owner intent (v1 local; feeds heartbeat/Spider later) */}
        <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d14]">
          <button
            type="button"
            data-a2a-nav
            onClick={() => setGoalsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2.5 py-1.5"
          >
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400">
              <Target size={11} className="text-[#39ff14]" />
              Business goals
              {prefs.goals ? (
                <span className="text-[#39ff14]">• set</span>
              ) : (
                <span className="text-gray-600">• not set</span>
              )}
            </span>
            {goalsOpen ? (
              <ChevronUp size={12} className="text-gray-600" />
            ) : (
              <ChevronDown size={12} className="text-gray-600" />
            )}
          </button>
          {goalsOpen && (
            <div className="px-2.5 pb-2.5 space-y-1.5">
              <textarea
                value={prefs.goals}
                onChange={(e) => updatePrefs({ goals: e.target.value })}
                placeholder="What is your business looking for? e.g. “companies that need websites”, “SaaS founders open to referral swaps”…"
                rows={2}
                className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2 py-1.5 text-[10px] font-mono text-gray-300 outline-none placeholder:text-gray-700 resize-none"
              />
              <p className="text-[9px] font-mono text-gray-600">
                v1 (stored locally for this project) — this becomes the search
                intent your agent’s heartbeat and the Spider use to find
                matching neighbors and bring them to your inbox.
              </p>
            </div>
          )}
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
              : `Nothing in ${listMode} yet — use ★ / 👁 on cards`}
          </p>
        </div>
      )}

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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

                {/* ALL capabilities — the talking pieces (no truncation) */}
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

                {/* Knock — say hello (direct v1 path) */}
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
                            placeholder={`Say hello to ${a.name}… (what should your agent introduce?)`}
                            rows={2}
                            className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-2 py-1.5 text-[10px] font-mono text-gray-300 outline-none placeholder:text-gray-700 resize-none"
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
  );
}

export default NeighborsView;
