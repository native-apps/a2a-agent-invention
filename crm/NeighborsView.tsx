// ---------------------------------------------------------------------------
// A2A Agent — Neighbors View (the onchain registry, inside Mother Brain)
// ---------------------------------------------------------------------------
// Shows the LIVE $NEAR Neighbors registry read straight from the blockchain
// (free public FastNEAR RPC — no backend, no keys, 5-min cache). One card per
// agent: name, domain, description, tags + capabilities chips, status, and
// freshness. The entry matching THIS agent's URL gets a "YOU" badge.
//
// This is the same read pattern as docs/NEIGHBORS-WEBSITE-INTEGRATION.md and
// the wizard's onchain check — testnet constants flip to mainnet at
// graduation (rpc.fastnear.com + neighborly.near).
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
  // call_function returns the JSON as a byte array (see gotcha #10 — arg
  // keys and shapes must match the contract exactly; bytes sit at r.result).
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

// ── Component ─────────────────────────────────────────────────────────────

interface NeighborsViewProps {
  invention: {
    id: string;
    settings: Record<string, unknown>;
    projectIds?: string[];
  };
}

export function NeighborsView({ invention }: NeighborsViewProps) {
  const [entries, setEntries] = useState<RegistryAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  // Which registry entry is THIS agent? (match on our deployed agentUrl)
  const myAgentUrl = String(
    invention.settings.agentUrl || "",
  ).replace(/\/+$/, "");

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

  const q = query.trim().toLowerCase();
  const filtered = entries.filter((a) => {
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
        <p className="text-[9px] font-mono text-gray-600">
          source: {NEIGHBORS_CONTRACT} · {NEAR_RPC.replace("https://", "")} ·
          free public read, 5-min cache
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 m-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-xs font-mono text-yellow-400">
            {error} — the registry read failed. Try Refresh; the list also
            falls back on the wizard's Finish & Verify check.
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
      {!loading && !error && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <Network size={24} className="text-gray-700 mb-2" />
          <p className="text-xs font-mono text-gray-600">
            No agents registered yet
          </p>
          <p className="text-[10px] font-mono text-gray-700 mt-1">
            Register via the NEAR Neighbors node in Wizard 2
          </p>
        </div>
      )}

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((a) => {
            const isMe =
              myAgentUrl && a.agent_url?.replace(/\/+$/, "") === myAgentUrl;
            const active = a.status === 0;
            return (
              <div
                key={a.domain + a.name}
                className={`rounded-lg border p-3 space-y-2 ${
                  isMe
                    ? "border-[#38bdf8]/40 bg-[#38bdf8]/5"
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
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 ${
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

                {a.description && (
                  <p className="text-[10px] font-mono text-gray-400 leading-relaxed line-clamp-3">
                    {a.description}
                  </p>
                )}

                {(a.capabilities?.length || 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(a.capabilities || []).slice(0, 5).map((c) => (
                      <span
                        key={c}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#38bdf8]/10 text-[#38bdf8]"
                      >
                        {c}
                      </span>
                    ))}
                    {(a.capabilities?.length || 0) > 5 && (
                      <span className="text-[9px] font-mono text-gray-600">
                        +{(a.capabilities || []).length - 5}
                      </span>
                    )}
                  </div>
                )}

                {(a.tags?.length || 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(a.tags || []).slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a]">
                  <span className="text-[9px] font-mono text-gray-600">
                    since {nsToDate(a.registered_at)} · upd{" "}
                    {nsToDate(a.updated_at)}
                  </span>
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
