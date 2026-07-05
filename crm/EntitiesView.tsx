// ---------------------------------------------------------------------------
// A2A Agent — Entities View
// ---------------------------------------------------------------------------
// Shows all entities (Visitors, Customers, AI Bots) that have interacted
// with the A2A Agent. Supports list + card layouts, filtering by type/source/
// tags/status, and sorting by name/date/status.
//
// Entities are auto-tracked in the `entities` table by the Worker on every
// message/send. This view queries them directly via Supabase.
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  User,
  Bot,
  Globe,
  KeyRound,
  Tag,
  Clock,
  MessageSquare,
  LayoutGrid,
  List,
  Search,
  CircleDot,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseCreds } from "../shared/supabaseConfig";
import ThemedSelect from "../../../components/ThemedSelect";
import FastMarkdown from "../../../components/FastMarkdown";

// ── Theme Constants (matches A2aChatPreview.tsx) ────────────────────────────

const T_DARK = {
  deepVoid: "#0a0a0f",
  darkMatter: "#13131f",
  neuralNode: "#1e1e2d",
  neonGreen: "#39ff14",
  hotPink: "#ff3d7f",
  bloodOrange: "#ff5500",
  electricCyan: "#38bdf8",
  text: "#e2e8f0",
  textMuted: "#64748b",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

const T_LIGHT = {
  deepVoid: "#f9fafb",
  darkMatter: "#ffffff",
  neuralNode: "#e5e7eb",
  neonGreen: "#059669",
  hotPink: "#db2777",
  bloodOrange: "#ea580c",
  electricCyan: "#0284c7",
  text: "#111827",
  textMuted: "#6b7280",
  font: '"Departure Mono", "JetBrains Mono", "Courier New", monospace',
};

// ── Types ────────────────────────────────────────────────────────────────

interface EntitiesViewProps {
  invention: {
    id: string;
    settings: Record<string, unknown>;
    projectIds?: string[];
  };
  onSelectEntity?: (visitorId: string) => void;
}

interface Entity {
  visitor_id: string;
  customer_id: number | null;
  entity_name: string | null;
  entity_type: "visitor" | "customer" | "ai_bot";
  source: "website" | "in-app";
  agent_card: Record<string, unknown> | null;
  first_seen: string;
  last_active: string;
  message_count: number;
  tags: string[];
  status: "open" | "resolved" | "escalated";
  last_message?: string | null;
}

type ViewMode = "list" | "card";
type SortMode = "date" | "name" | "status";

// ── Component ────────────────────────────────────────────────────────────

const EntitiesView: React.FC<EntitiesViewProps> = ({
  invention,
  onSelectEntity,
}) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Entity selection (persists visually until changed) ──
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<string>("");
  const [filterSource, setFilterSource] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterTag, setFilterTag] = useState<string>("");

  // Tag editing
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // ── Light/dark mode detection (matches A2aChatPreview pattern) ──
  const [isLightMode, setIsLightMode] = useState(() => {
    if (
      typeof document !== "undefined" &&
      document.body.classList.contains("light")
    )
      return true;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    )
      return true;
    return false;
  });
  useEffect(() => {
    const check = () => {
      const bodyLight = document.body.classList.contains("light");
      const deviceLight = window.matchMedia(
        "(prefers-color-scheme: light)",
      ).matches;
      setIsLightMode(bodyLight || deviceLight);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    mediaQuery.addEventListener("change", check);
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", check);
    };
  }, []);

  const T = isLightMode ? T_LIGHT : T_DARK;

  // Get active project ID
  const [activeProjectId, setActiveProjectId] = useState(
    invention.projectIds?.[0] || "",
  );
  useEffect(() => {
    fetch("/api/active-project")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.activeProjectId) setActiveProjectId(data.activeProjectId);
      })
      .catch(() => {});
  }, []);

  // Fetch entities
  const fetchEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { url: supabaseUrl, serviceKey: supabaseKey } =
        resolveSupabaseCreds(invention.settings, activeProjectId);
      if (!supabaseUrl || !supabaseKey) {
        setError("Configure Supabase URL and service key in Settings.");
        setLoading(false);
        return;
      }

      const client = createClient(supabaseUrl, supabaseKey);
      let query = client
        .from("entities")
        .select(
          "visitor_id,customer_id,entity_name,entity_type,source,agent_card,first_seen,last_active,message_count,tags,status",
        );

      if (filterType) query = query.eq("entity_type", filterType);
      if (filterSource) query = query.eq("source", filterSource);
      if (filterStatus) query = query.eq("status", filterStatus);

      // Sort
      const sortCol =
        sortMode === "name"
          ? "entity_name"
          : sortMode === "status"
            ? "status"
            : "last_active";
      query = query.order(sortCol, { ascending: sortMode === "name" });

      const { data, error: fetchErr } = await query.limit(200);

      if (fetchErr) throw fetchErr;

      let filtered = (data || []) as Entity[];

      // Fetch last message for each entity (for preview)
      if (filtered.length > 0) {
        const visitorIds = filtered.map((e) => e.visitor_id);
        const { data: lastMsgs } = await client
          .from("task_messages")
          .select("visitor_id,parts,role")
          .in("visitor_id", visitorIds)
          .order("created_at", { ascending: false })
          .limit(500);

        if (lastMsgs) {
          // Build a map of visitor_id → first (most recent) message text
          const lastMsgMap: Record<string, string> = {};
          for (const m of lastMsgs as Array<Record<string, unknown>>) {
            const vid = m.visitor_id as string;
            if (!lastMsgMap[vid]) {
              const parts = m.parts as
                Array<{ type: string; text?: string }> | string;
              const text = Array.isArray(parts)
                ? parts
                    .filter((p) => p.type === "text")
                    .map((p) => p.text || "")
                    .join("")
                : typeof parts === "string"
                  ? parts
                  : "";
              lastMsgMap[vid] = text.slice(0, 120);
            }
          }
          filtered = filtered.map((e) => ({
            ...e,
            last_message: lastMsgMap[e.visitor_id] || null,
          }));
        }
      }

      // Tag filter (client-side)
      if (filterTag) {
        filtered = filtered.filter((e) =>
          e.tags?.some((t) =>
            t.toLowerCase().includes(filterTag.toLowerCase()),
          ),
        );
      }

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.entity_name?.toLowerCase().includes(q) ||
            e.visitor_id.toLowerCase().includes(q) ||
            e.customer_id?.toString().includes(q) ||
            e.tags?.some((t) => t.toLowerCase().includes(q)),
        );
      }

      setEntities(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch entities");
    } finally {
      setLoading(false);
    }
  }, [
    invention,
    activeProjectId,
    filterType,
    filterSource,
    filterStatus,
    filterTag,
    sortMode,
    searchQuery,
  ]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // Update tags
  const handleUpdateTags = useCallback(
    async (visitorId: string, tags: string[]) => {
      try {
        const { url: supabaseUrl, serviceKey: supabaseKey } =
          resolveSupabaseCreds(invention.settings, activeProjectId);
        if (!supabaseUrl || !supabaseKey) return;
        const client = createClient(supabaseUrl, supabaseKey);
        await client
          .from("entities")
          .update({ tags, updated_at: new Date().toISOString() })
          .eq("visitor_id", visitorId);
        setEntities((prev) =>
          prev.map((e) => (e.visitor_id === visitorId ? { ...e, tags } : e)),
        );
      } catch (err) {
        console.error("Failed to update tags:", err);
      }
    },
    [invention, activeProjectId],
  );

  // Update status
  const handleUpdateStatus = useCallback(
    async (visitorId: string, status: string) => {
      try {
        const { url: supabaseUrl, serviceKey: supabaseKey } =
          resolveSupabaseCreds(invention.settings, activeProjectId);
        if (!supabaseUrl || !supabaseKey) return;
        const client = createClient(supabaseUrl, supabaseKey);
        await client
          .from("entities")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("visitor_id", visitorId);
        setEntities((prev) =>
          prev.map((e) =>
            e.visitor_id === visitorId
              ? { ...e, status: status as Entity["status"] }
              : e,
          ),
        );
      } catch (err) {
        console.error("Failed to update status:", err);
      }
    },
    [invention, activeProjectId],
  );

  // ── Entity click: bridge to Conversations tab ──
  // Uses localStorage + custom event so A2aCrmView can pick it up
  // when the user switches to the Conversations tab.
  const handleSelectEntity = useCallback(
    (visitorId: string) => {
      setSelectedEntityId(visitorId);
      try {
        localStorage.setItem("a2a_select_visitor", visitorId);
      } catch {}
      window.dispatchEvent(
        new CustomEvent("mb-open-conversation", {
          detail: { visitorId },
        }),
      );
      onSelectEntity?.(visitorId);
    },
    [onSelectEntity],
  );

  // Add tag
  const handleAddTag = (visitorId: string) => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    const entity = entities.find((e) => e.visitor_id === visitorId);
    if (entity && !entity.tags?.includes(tag)) {
      handleUpdateTags(visitorId, [...(entity.tags || []), tag]);
    }
    setTagInput("");
  };

  // Remove tag
  const handleRemoveTag = (visitorId: string, tag: string) => {
    const entity = entities.find((e) => e.visitor_id === visitorId);
    if (entity) {
      handleUpdateTags(
        visitorId,
        (entity.tags || []).filter((t) => t !== tag),
      );
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "customer":
        return <KeyRound size={14} />;
      case "ai_bot":
        return <Bot size={14} />;
      default:
        return <User size={14} />;
    }
  };

  const getEntityColor = (type: string) => {
    switch (type) {
      case "customer":
        return "#39ff14";
      case "ai_bot":
        return "#a78bfa";
      default:
        return "#00dc82";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "resolved":
        return <CheckCircle2 size={12} />;
      case "escalated":
        return <AlertCircle size={12} />;
      default:
        return <CircleDot size={12} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "resolved":
        return "#39ff14";
      case "escalated":
        return "#ff3d7f";
      default:
        return "#ffaa00";
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString();
  };

  // Collect all unique tags for the tag filter dropdown
  const allTags = Array.from(
    new Set(entities.flatMap((e) => e.tags || [])),
  ).sort();

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1a1a1a] flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entities..."
            className="w-full pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg border border-[#1f1f1f] bg-[#0c0c0c] text-gray-300 outline-none focus:border-[#00dc82]/30"
          />
        </div>

        {/* Filters */}
        <div className="w-32">
          <ThemedSelect
            value={filterType}
            onChange={(v) => setFilterType(v)}
            options={[
              { value: "", label: "All Types" },
              { value: "visitor", label: "Visitors" },
              { value: "customer", label: "Customers" },
              { value: "ai_bot", label: "AI Bots" },
            ]}
          />
        </div>

        <div className="w-32">
          <ThemedSelect
            value={filterSource}
            onChange={(v) => setFilterSource(v)}
            options={[
              { value: "", label: "All Sources" },
              { value: "website", label: "Website" },
              { value: "in-app", label: "In-App" },
            ]}
          />
        </div>

        <div className="w-32">
          <ThemedSelect
            value={filterStatus}
            onChange={(v) => setFilterStatus(v)}
            options={[
              { value: "", label: "All Status" },
              { value: "open", label: "Open" },
              { value: "resolved", label: "Resolved" },
              { value: "escalated", label: "Escalated" },
            ]}
          />
        </div>

        {allTags.length > 0 && (
          <div className="w-32">
            <ThemedSelect
              value={filterTag}
              onChange={(v) => setFilterTag(v)}
              options={[
                { value: "", label: "All Tags" },
                ...allTags.map((tag) => ({ value: tag, label: tag })),
              ]}
            />
          </div>
        )}

        {/* Sort */}
        <div className="w-36">
          <ThemedSelect
            value={sortMode}
            onChange={(v) => setSortMode(v as SortMode)}
            options={[
              { value: "date", label: "Sort: Date" },
              { value: "name", label: "Sort: A-Z" },
              { value: "status", label: "Sort: Status" },
            ]}
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            onClick={() => setViewMode("card")}
            className={`p-1.5 rounded transition-colors ${
              viewMode === "card"
                ? "bg-[#00dc82]/10 text-[#00dc82]"
                : "text-gray-600 hover:text-white"
            }`}
            title="Card view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded transition-colors ${
              viewMode === "list"
                ? "bg-[#00dc82]/10 text-[#00dc82]"
                : "text-gray-600 hover:text-white"
            }`}
            title="List view"
          >
            <List size={14} />
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={fetchEntities}
          className="p-1.5 rounded text-gray-600 hover:text-[#00dc82] transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-500 bg-red-500/5 border-b border-red-500/10">
          {error}
        </div>
      )}

      {/* Entity count */}
      <div className="px-4 py-1.5 text-[10px] font-mono text-gray-500 border-b border-gray-100 dark:border-[#15151f]">
        {entities.length} entit{entities.length === 1 ? "y" : "ies"}
      </div>

      {/* Entities */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && entities.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-xs">
            Loading entities...
          </div>
        ) : entities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-xs gap-2">
            <User size={32} className="opacity-30" />
            <span>
              No entities yet. They appear as visitors chat with the agent.
            </span>
          </div>
        ) : viewMode === "card" ? (
          // ── Card View (MB app design pattern) ──
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {entities.map((entity) => (
              <div
                key={entity.visitor_id}
                onClick={() => handleSelectEntity(entity.visitor_id)}
                className={`group p-4 rounded-lg border transition-all cursor-pointer ${
                  selectedEntityId === entity.visitor_id
                    ? "border-[#00dc82] bg-[#00dc82]/10 ring-1 ring-[#00dc82]/30"
                    : "border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#00dc82]/30 hover:bg-[#00dc82]/5"
                }`}
              >
                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor: `${getEntityColor(entity.entity_type)}15`,
                      color: getEntityColor(entity.entity_type),
                    }}
                  >
                    {getEntityIcon(entity.entity_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-white truncate">
                      {entity.entity_name ||
                        (entity.entity_type === "ai_bot"
                          ? "AI Bot"
                          : entity.visitor_id.slice(0, 16) + "…")}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-600">
                      <span
                        style={{ color: getEntityColor(entity.entity_type) }}
                      >
                        {entity.entity_type}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        {entity.source === "website" ? (
                          <Globe size={9} />
                        ) : (
                          <MessageSquare size={9} />
                        )}
                        {entity.source}
                      </span>
                    </div>
                  </div>
                  {/* Status badge */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const next =
                        entity.status === "open"
                          ? "resolved"
                          : entity.status === "resolved"
                            ? "escalated"
                            : "open";
                      handleUpdateStatus(entity.visitor_id, next);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors"
                    style={{
                      color: getStatusColor(entity.status),
                      borderColor: `${getStatusColor(entity.status)}30`,
                    }}
                    title="Click to cycle status"
                  >
                    {getStatusIcon(entity.status)}
                    {entity.status}
                  </button>
                </div>

                {/* AI Bot Agent Card */}
                {entity.entity_type === "ai_bot" && entity.agent_card && (
                  <div className="text-[10px] font-mono text-gray-500 mb-2 p-1.5 rounded-lg bg-[#0c0c0c] border border-[#1f1f1f]">
                    {((entity.agent_card as Record<string, unknown>)
                      .name as string) || "Unknown Agent"}
                    {(entity.agent_card as Record<string, unknown>).version
                      ? ` v${(entity.agent_card as Record<string, unknown>).version}`
                      : ""}
                  </div>
                )}

                {/* Last Message */}
                {entity.last_message && (
                  <div className="text-[10px] font-mono text-gray-500 mb-2 max-h-[40px] overflow-hidden">
                    <FastMarkdown
                      content={entity.last_message}
                      variant="chat"
                    />
                  </div>
                )}

                {/* Stats row */}
                <div className="flex items-center gap-3 text-[10px] font-mono text-gray-600 mb-2">
                  <span className="flex items-center gap-1">
                    <MessageSquare size={10} />
                    {entity.message_count}
                  </span>
                  {entity.customer_id && (
                    <span className="flex items-center gap-1 text-[#00dc82]">
                      <KeyRound size={9} />#{entity.customer_id}
                    </span>
                  )}
                </div>

                {/* Dates */}
                <div className="flex items-center justify-between text-[9px] font-mono text-gray-700 mb-2">
                  <span>First: {formatDate(entity.first_seen)}</span>
                  <span>Last: {formatDate(entity.last_active)}</span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {(entity.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="group/tag flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-[#00dc82]/10 text-[#00dc82]"
                    >
                      <Tag size={7} />
                      {tag}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTag(entity.visitor_id, tag);
                        }}
                        className="opacity-0 group-hover/tag:opacity-100 transition-opacity text-red-400"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {editingTagsFor === entity.visitor_id ? (
                    <input
                      autoFocus
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAddTag(entity.visitor_id);
                        } else if (e.key === "Escape") {
                          setEditingTagsFor(null);
                          setTagInput("");
                        }
                      }}
                      onBlur={() => {
                        if (tagInput) handleAddTag(entity.visitor_id);
                        setEditingTagsFor(null);
                      }}
                      placeholder="tag…"
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[#333] bg-transparent w-16 outline-none"
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTagsFor(entity.visitor_id);
                        setTagInput("");
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono px-1.5 py-0.5 rounded-full border border-dashed border-[#333] text-gray-500 hover:text-[#00dc82] hover:border-[#00dc82]/30"
                    >
                      + tag
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── List View (MB app table style) ──
          <div className="rounded-lg border border-[#1a1a1a] overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1a1a1a] text-[10px] text-gray-600 bg-[#0c0c0c]">
                  <th className="text-left px-3 py-2 font-medium">Name / ID</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-left px-3 py-2 font-medium">Source</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Tags</th>
                  <th className="text-left px-3 py-2 font-medium">
                    Last Message
                  </th>
                  <th className="text-right px-3 py-2 font-medium">Msgs</th>
                  <th className="text-right px-3 py-2 font-medium">
                    First Seen
                  </th>
                  <th className="text-right px-3 py-2 font-medium">
                    Last Active
                  </th>
                </tr>
              </thead>
              <tbody>
                {entities.map((entity) => (
                  <tr
                    key={entity.visitor_id}
                    onClick={() => handleSelectEntity(entity.visitor_id)}
                    className={`border-b border-[#111] transition-colors cursor-pointer ${
                      selectedEntityId === entity.visitor_id
                        ? "bg-[#00dc82]/10"
                        : "hover:bg-[#00dc82]/5"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          style={{ color: getEntityColor(entity.entity_type) }}
                        >
                          {getEntityIcon(entity.entity_type)}
                        </span>
                        <span className="text-white truncate max-w-[160px]">
                          {entity.entity_name ||
                            (entity.entity_type === "ai_bot"
                              ? "AI Bot"
                              : entity.visitor_id.slice(0, 16) + "…")}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {entity.entity_type}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{entity.source}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const next =
                            entity.status === "open"
                              ? "resolved"
                              : entity.status === "resolved"
                                ? "escalated"
                                : "open";
                          handleUpdateStatus(entity.visitor_id, next);
                        }}
                        className="flex items-center gap-1 text-[10px]"
                        style={{ color: getStatusColor(entity.status) }}
                      >
                        {getStatusIcon(entity.status)}
                        {entity.status}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-0.5">
                        {(entity.tags || []).slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="text-[9px] px-1 py-0.5 rounded bg-[#00dc82]/10 text-[#00dc82]"
                          >
                            {tag}
                          </span>
                        ))}
                        {(entity.tags || []).length > 3 && (
                          <span className="text-[9px] text-gray-600">
                            +{(entity.tags || []).length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-500 truncate max-w-[200px]">
                      {entity.last_message || "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {entity.message_count}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {formatDate(entity.first_seen)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {formatDate(entity.last_active)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EntitiesView;
