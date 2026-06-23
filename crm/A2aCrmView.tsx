// ---------------------------------------------------------------------------
// A2A Agent — CRM Conversations View
// ---------------------------------------------------------------------------
// Skeleton CRM for managing A2A visitor conversations. Fetches from the
// Mother Brain server API endpoints for conversations and messages.
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  MessageSquare,
  User,
  Bot,
  AlertCircle,
  Loader2,
  Clock,
  Hash,
} from "lucide-react";
import FastMarkdown from "../../../components/FastMarkdown";
import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseCreds } from "../shared/supabaseConfig";

// ── Types ────────────────────────────────────────────────────────────────

interface A2aCrmViewProps {
  invention: {
    id: string;
    settings: Record<string, unknown>;
  };
}

interface Conversation {
  taskId: string;
  visitorId: string;
  firstMessage: string;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  skillUsed?: string;
}

interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  resultPreview?: string;
}

interface ConversationMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
  toolCalls?: ToolCallInfo[];
}

// ── Component ────────────────────────────────────────────────────────────

const CRM_MSG_INITIAL_LIMIT = 20;
const CRM_MSG_LOAD_MORE = 20;

const A2aCrmView: React.FC<A2aCrmViewProps> = ({ invention }) => {
  const [sortMode, setSortMode] = useState<"newest" | "visitor">("newest");
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const realtimeRef = useRef<ReturnType<typeof createClient> | null>(null);
  const viewedConversationsRef = useRef<Set<string>>(new Set());
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const oldestMsgTimestamp = useRef<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  // Get active project ID from MB server (NOT localStorage)
  const [activeProjectId, setActiveProjectId] = useState(
    invention.projectIds?.[0] || "",
  );
  useEffect(() => {
    fetch("/api/active-project")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.activeProjectId) {
          setActiveProjectId(data.activeProjectId);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch conversations list
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { url: supabaseUrl, serviceKey: supabaseKey } =
        resolveSupabaseCreds(invention.settings, activeProjectId);
      if (!supabaseUrl || !supabaseKey) {
        setError("Configure Supabase URL and service key in Settings.");
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch tasks (conversations)
      // Note: tasks table has no project_id column — the A2A endpoint is
      // single-tenant (one Supabase DB per deployment), so all conversations
      // belong to the same project.
      const { data: rawTasks, error: taskError } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (taskError) throw new Error(taskError.message);

      // Batch-fetch messages for firstMessage + messageCount
      const taskIds = (rawTasks || []).map((t: any) => t.id);
      let msgsByTask: Record<string, any[]> = {};
      if (taskIds.length > 0) {
        const { data: allMsgs } = await supabase
          .from("task_messages")
          .select("task_id, role, content, parts, created_at")
          .in("task_id", taskIds)
          .order("created_at", { ascending: true });
        for (const msg of allMsgs || []) {
          const tid = msg.task_id;
          if (!msgsByTask[tid]) msgsByTask[tid] = [];
          msgsByTask[tid].push(msg);
        }
      }

      // ── Helper: extract text from a message stored in any format ──
      // The A2A endpoint stores messages with varying shapes:
      //   content: "ping"                      (plain string)
      //   content: null, parts: [{text:"ping"}]  (jsonb array)
      //   parts: '[{"text":"ping"}]'            (JSON string, not array)
      //   content: '[{"text":"ping"}]'          (JSON string in content)
      const extractText = (msg: any): string => {
        if (!msg) return "";
        let text = "";
        // 1. Try content field
        if (msg.content != null && msg.content !== "") {
          text =
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content);
        }
        // 2. If content looks like a JSON parts array, unwrap it
        if (text.trim().startsWith("[")) {
          try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              text = parsed
                .map((p: any) => (typeof p === "string" ? p : p?.text || ""))
                .join("");
            }
          } catch {
            /* not JSON */
          }
        }
        // 3. If still empty, try parts field
        if (!text.trim() && msg.parts != null) {
          if (Array.isArray(msg.parts)) {
            text = msg.parts
              .map((p: any) => (typeof p === "string" ? p : p?.text || ""))
              .join("");
          } else if (typeof msg.parts === "string") {
            text = msg.parts;
            if (text.trim().startsWith("[")) {
              try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) {
                  text = parsed
                    .map((p: any) =>
                      typeof p === "string" ? p : p?.text || "",
                    )
                    .join("");
                }
              } catch {
                /* not JSON */
              }
            }
          }
        }
        return text;
      };

      const mapped = (rawTasks || [])
        .map((item: any) => {
          const taskMsgs = msgsByTask[item.id] || [];
          const firstUserMsg = taskMsgs.find((m: any) => m.role === "user");
          const firstMessage = extractText(firstUserMsg);

          // Filter out A2A health-check test conversations.
          // The "Test A2A Endpoint" button sends metadata.source = "connection-test"
          // and the message text is "ping" / response "Pong...".
          // We check multiple signals to be bulletproof across storage formats.
          let isTest = false;

          // Signal 1: task metadata marks it as a connection test
          if (item.metadata) {
            try {
              const meta =
                typeof item.metadata === "string"
                  ? JSON.parse(item.metadata)
                  : item.metadata;
              if (
                meta?.source === "connection-test" ||
                meta?.source === "health-check"
              ) {
                isTest = true;
              }
            } catch {
              /* not JSON */
            }
          }

          // Signal 2: any message in a short conversation (≤4 msgs) is ping/pong
          if (!isTest && taskMsgs.length <= 4) {
            isTest = taskMsgs.some((m) => {
              const t = extractText(m).trim().toLowerCase();
              return (
                t === "ping" ||
                t === "pong" ||
                t === "ping..." ||
                t === "pong..." ||
                t.startsWith("pong")
              );
            });
          }

          if (isTest) return null;
          return {
            taskId: item.id || item.taskId,
            visitorId: item.visitor_id || item.visitorId || "anonymous",
            firstMessage,
            status: item.status || "unknown",
            messageCount: taskMsgs.length,
            createdAt: item.created_at || item.createdAt,
            updatedAt: item.updated_at || item.updatedAt,
            skillUsed: item.skill_id || item.skillUsed,
          };
        })
        .filter(Boolean) as Conversation[];

      // ── Group by visitor_id: one conversation per visitor, always. ──
      // Policy: All messages between a visitor and the AI agent are ONE
      // persistent conversation. Never split by task_id.
      const byVisitor: Map<string, Conversation> = new Map();
      for (const conv of mapped) {
        const existing = byVisitor.get(conv.visitorId);
        if (existing) {
          // Merge into existing — keep earliest firstMessage, latest updatedAt
          existing.messageCount += conv.messageCount;
          if (conv.updatedAt > existing.updatedAt) {
            existing.updatedAt = conv.updatedAt;
            existing.taskId = conv.taskId;
            existing.status = conv.status;
          }
          if (conv.createdAt < existing.createdAt) {
            existing.createdAt = conv.createdAt;
          }
        } else {
          byVisitor.set(conv.visitorId, { ...conv });
        }
      }
      const grouped = Array.from(byVisitor.values());

      setConversations(grouped);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (
        message.includes("Failed to fetch") ||
        message.includes("NetworkError")
      ) {
        setError("Start the chat database to view conversations");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, invention.settings]);

  // Fetch messages for selected conversation (by visitor_id — one persistent dialogue)
  const fetchMessages = useCallback(
    async (visitorId: string) => {
      setLoadingMessages(true);
      try {
        const { url: supabaseUrl, serviceKey: supabaseKey } =
          resolveSupabaseCreds(invention.settings, activeProjectId);
        if (!supabaseUrl || !supabaseKey) {
          setMessages([]);
          return;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fetch ALL messages for this visitor (across all tasks — one conversation)
        // Fetch limit+1 to detect if there are more messages.
        const { data: msgData, error: msgError } = await supabase
          .from("task_messages")
          .select("*")
          .eq("visitor_id", visitorId)
          .order("created_at", { ascending: false })
          .limit(CRM_MSG_INITIAL_LIMIT + 1);
        if (msgError) throw new Error(msgError.message);

        const hasMore = (msgData || []).length > CRM_MSG_INITIAL_LIMIT;
        const rawMsgs: any[] = (msgData || [])
          .slice(0, CRM_MSG_INITIAL_LIMIT)
          .reverse();

        setHasMoreMessages(hasMore);
        if (rawMsgs.length > 0) {
          oldestMsgTimestamp.current =
            rawMsgs[0].created_at || rawMsgs[0].createdAt;
        } else {
          oldestMsgTimestamp.current = null;
        }

        // Fetch artifacts for all task_ids in this visitor's messages
        const taskIds = [
          ...new Set(rawMsgs.map((m: any) => m.task_id).filter(Boolean)),
        ];
        let rawArtifacts: any[] = [];
        if (taskIds.length > 0) {
          const { data: artData } = await supabase
            .from("artifacts")
            .select("*")
            .in("task_id", taskIds)
            .order("created_at", { ascending: true });
          rawArtifacts = artData || [];
        }

        // Extract tool calls from artifacts metadata
        const allToolCalls: ToolCallInfo[] = [];
        for (const art of rawArtifacts) {
          const tc = art.metadata?.toolCalls;
          if (Array.isArray(tc)) {
            for (const call of tc) {
              allToolCalls.push({
                name: call.name || call.toolName || "unknown",
                args: call.args || call.arguments || {},
                resultPreview: call.resultPreview
                  ? call.resultPreview
                  : call.result
                    ? typeof call.result === "string"
                      ? call.result.slice(0, 500)
                      : JSON.stringify(call.result).slice(0, 500)
                    : undefined,
              });
            }
          }
        }

        // Find the last agent message index
        let lastAgentIdx = -1;
        for (let j = rawMsgs.length - 1; j >= 0; j--) {
          if (rawMsgs[j].role === "agent") {
            lastAgentIdx = j;
            break;
          }
        }

        const mappedMsgs = rawMsgs.map((m: any, i: number) => {
          const isLastAgentMsg = m.role === "agent" && i === lastAgentIdx;
          return {
            id: m.id,
            role: m.role === "agent" ? "agent" : "user",
            content:
              m.content ||
              (Array.isArray(m.parts)
                ? m.parts.map((p: any) => p.text || "").join("")
                : typeof m.parts === "string"
                  ? m.parts
                  : ""),
            createdAt: m.created_at || m.createdAt || new Date().toISOString(),
            toolCalls:
              isLastAgentMsg && allToolCalls.length > 0
                ? allToolCalls
                : undefined,
          };
        });
        setMessages(mappedMsgs);

        // Auto-scroll to bottom so the most recent message is visible
        requestAnimationFrame(() => {
          if (messagesScrollRef.current) {
            messagesScrollRef.current.scrollTop =
              messagesScrollRef.current.scrollHeight;
          }
        });
      } catch (err: unknown) {
        console.error("[crm] Failed to load messages:", err);
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [invention.settings],
  );

  // Load older messages on scroll-up (lazy pagination)
  const loadMoreMessages = useCallback(async () => {
    if (loadingMoreMessages || !hasMoreMessages || !selectedId) return;
    if (!oldestMsgTimestamp.current) return;
    setLoadingMoreMessages(true);

    const prevScrollHeight = messagesScrollRef.current?.scrollHeight || 0;

    try {
      const { url: supabaseUrl, serviceKey: supabaseKey } =
        resolveSupabaseCreds(invention.settings, activeProjectId);
      if (!supabaseUrl || !supabaseKey) return;

      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: olderData } = await supabase
        .from("task_messages")
        .select("*")
        .eq("visitor_id", selectedId)
        .lt("created_at", oldestMsgTimestamp.current)
        .order("created_at", { ascending: false })
        .limit(CRM_MSG_LOAD_MORE + 1);

      const moreAvailable = (olderData || []).length > CRM_MSG_LOAD_MORE;
      const olderMsgs: any[] = (olderData || [])
        .slice(0, CRM_MSG_LOAD_MORE)
        .reverse();

      if (olderMsgs.length > 0) {
        const mappedOlder: ConversationMessage[] = olderMsgs.map((m: any) => ({
          id: m.id,
          role: (m.role === "agent" ? "agent" : "user") as "user" | "agent",
          content:
            m.content ||
            (Array.isArray(m.parts)
              ? m.parts.map((p: any) => p.text || "").join("")
              : typeof m.parts === "string"
                ? m.parts
                : ""),
          createdAt: m.created_at || m.createdAt || new Date().toISOString(),
        }));

        setMessages((prev) => [...mappedOlder, ...prev]);
        oldestMsgTimestamp.current =
          olderMsgs[0].created_at || olderMsgs[0].createdAt;
        setHasMoreMessages(moreAvailable);

        // Preserve scroll position after prepending older messages
        requestAnimationFrame(() => {
          const container = messagesScrollRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeight;
          }
        });
      } else {
        setHasMoreMessages(false);
      }
    } catch {
      /* silently fail */
    } finally {
      setLoadingMoreMessages(false);
    }
  }, [
    loadingMoreMessages,
    hasMoreMessages,
    selectedId,
    activeProjectId,
    invention.settings,
  ]);

  const handleMessagesScroll = () => {
    const container = messagesScrollRef.current;
    if (!container || loadingMoreMessages || !hasMoreMessages) return;
    if (container.scrollTop < 50) {
      loadMoreMessages();
    }
  };

  // ── Initial fetch ──
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId);
      // Mark conversation as viewed
      viewedConversationsRef.current.add(selectedId);
      // Mark as read (remove from unread set)
      setUnreadIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedId);
        return next;
      });
    } else {
      setMessages([]);
    }
  }, [selectedId, fetchMessages]);

  // ── Supabase Real-time subscription ──
  // Listens for new messages and new/updated tasks.
  // Automatically refreshes conversations and appends messages to active view.
  useEffect(() => {
    const { url: supabaseUrl, serviceKey: supabaseKey } = resolveSupabaseCreds(
      invention.settings,
      activeProjectId,
    );
    if (!supabaseUrl || !supabaseKey) return;

    let supabase;
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (err) {
      console.warn("[crm] Failed to create Supabase client:", err);
      return;
    }
    realtimeRef.current = supabase;

    const channel = supabase
      .channel("a2a-crm-realtime")

      // New message inserted → refresh conversation list + append to active view
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_messages" },
        (payload) => {
          const newMsg = payload.new as Record<string, unknown>;
          const msgVisitorId =
            (newMsg.visitor_id as string) || (newMsg.visitorId as string);

          // Refresh conversation list (updates message counts, timestamps)
          fetchConversations();

          // Mark as unread if not currently viewing this conversation
          if (msgVisitorId && selectedId !== msgVisitorId) {
            setUnreadIds((prev) => new Set(prev).add(msgVisitorId));
          }

          // If viewing this conversation, append the message live
          if (msgVisitorId && selectedId === msgVisitorId) {
            const role = newMsg.role === "agent" ? "agent" : "user";
            const parts = newMsg.parts;
            let content = "";
            if (typeof parts === "string") {
              content = parts;
            } else if (Array.isArray(parts)) {
              content = parts
                .filter((p: any) => p.type === "text")
                .map((p: any) => p.text || "")
                .join("");
            } else if (typeof newMsg.content === "string") {
              content = newMsg.content;
            }

            setMessages((prev) => [
              ...prev,
              {
                id: (newMsg.id as string) || `rt-${Date.now()}`,
                role: role as "user" | "agent",
                content,
                createdAt:
                  (newMsg.created_at as string) ||
                  (newMsg.createdAt as string) ||
                  new Date().toISOString(),
              },
            ]);

            // Auto-scroll to bottom on new realtime message
            requestAnimationFrame(() => {
              if (messagesScrollRef.current) {
                messagesScrollRef.current.scrollTop =
                  messagesScrollRef.current.scrollHeight;
              }
            });
          }
        },
      )

      // New task (conversation) created → refresh list
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        () => {
          fetchConversations();
        },
      )

      // Task status updated (completed, failed, etc.) → refresh list
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tasks" },
        () => {
          fetchConversations();
        },
      )

      .subscribe((status) => {
        console.log("[crm-realtime] Subscription status:", status);
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      channel.unsubscribe();
      realtimeRef.current = null;
      setIsLive(false);
    };
  }, [
    invention.settings.supabaseUrl,
    invention.settings.supabaseServiceKey,
    fetchConversations,
    selectedId,
  ]);

  const selectedConv = conversations.find((c) => c.visitorId === selectedId);

  // Sort conversations based on sortMode
  const sortedConversations = [...conversations].sort((a, b) => {
    if (sortMode === "visitor") {
      // Group by visitor, then by newest within each visitor
      if (a.visitorId !== b.visitorId)
        return a.visitorId.localeCompare(b.visitorId);
    }
    // Both modes: sort by most recent first
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="flex h-full min-h-[500px]">
      {/* Left column — Conversation list */}
      <div className="w-[300px] border-r border-[#1a1a1a] flex flex-col">
        {/* List header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
              Conversations
            </span>
            {isLive && (
              <span className="flex items-center gap-1 text-[9px] font-mono text-[#00dc82]/70">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00dc82] animate-pulse" />
                live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Sort filter */}
            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value as "newest" | "visitor")
              }
              className="text-[9px] font-mono bg-[#0a0a0a] text-gray-500 border border-[#1a1a1a] rounded px-1.5 py-0.5 focus:outline-none focus:border-[#00dc82]/30"
            >
              <option value="newest">Newest</option>
              <option value="visitor">Visitor</option>
            </select>
            <button
              onClick={fetchConversations}
              disabled={loading}
              className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="p-4 m-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-start gap-2">
              <AlertCircle
                size={14}
                className="text-yellow-500 flex-shrink-0 mt-0.5"
              />
              <p className="text-xs font-mono text-yellow-400">{error}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && conversations.length === 0 && (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={16} className="animate-spin text-gray-600" />
            <span className="ml-2 text-xs font-mono text-gray-500">
              Loading...
            </span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <MessageSquare size={24} className="text-gray-700 mb-2" />
            <p className="text-xs font-mono text-gray-600">
              No conversations yet
            </p>
            <p className="text-[10px] font-mono text-gray-700 mt-1">
              Conversations will appear here when visitors chat with your agent
            </p>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {sortedConversations.map((conv) => {
            const isUnread = unreadIds.has(conv.visitorId);
            const isSelected = selectedId === conv.visitorId;
            return (
              <button
                key={conv.visitorId}
                onClick={() => setSelectedId(conv.visitorId)}
                className={`w-full text-left px-4 py-3 border-b border-[#1a1a1a] transition-colors relative ${
                  isSelected
                    ? "bg-[#00dc82]/5 border-l-2 border-l-[#00dc82]"
                    : isUnread
                      ? "bg-[#00dc82]/[0.03] border-l-2 border-l-[#00dc82]/40 hover:bg-[#00dc82]/[0.06]"
                      : "hover:bg-[#0a0a0a] border-l-2 border-l-transparent"
                }`}
              >
                {/* Unread LED */}
                {isUnread && !isSelected && (
                  <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[#00dc82]" />
                )}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[10px] font-mono truncate max-w-[160px] ${
                      isUnread ? "text-[#00dc82]/80" : "text-gray-500"
                    }`}
                  >
                    {conv.visitorId}
                  </span>
                  <span className="text-[9px] font-mono text-gray-600">
                    {new Date(conv.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p
                  className={`text-xs font-mono truncate ${
                    isUnread ? "text-gray-300" : "text-gray-400"
                  }`}
                >
                  {conv.firstMessage || `${conv.skillUsed || "conversation"}…`}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                      conv.status === "completed"
                        ? "bg-[#00dc82]/10 text-[#00dc82]"
                        : conv.status === "running"
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-gray-500/10 text-gray-500"
                    }`}
                  >
                    {conv.status}
                  </span>
                  <span className="text-[9px] font-mono text-gray-600">
                    {conv.messageCount} msg{conv.messageCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right column — Conversation detail */}
      <div className="flex-1 flex flex-col">
        {selectedConv ? (
          <>
            {/* Conversation header */}
            <div className="px-4 py-3 border-b border-[#1a1a1a]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono text-gray-300">
                    {selectedConv.visitorId}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                        selectedConv.status === "completed"
                          ? "bg-[#00dc82]/10 text-[#00dc82]"
                          : selectedConv.status === "running"
                            ? "bg-blue-500/10 text-blue-400"
                            : "bg-gray-500/10 text-gray-500"
                      }`}
                    >
                      {selectedConv.status}
                    </span>
                    {selectedConv.skillUsed && (
                      <span className="text-[9px] font-mono text-gray-500 flex items-center gap-1">
                        <Hash size={9} />
                        {selectedConv.skillUsed}
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-gray-600 flex items-center gap-1">
                      <Clock size={9} />
                      {new Date(selectedConv.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <span className="text-[9px] font-mono text-gray-600">
                  {selectedConv.messageCount} messages
                </span>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={messagesScrollRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3"
            >
              {loadingMoreMessages && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 size={12} className="animate-spin text-gray-600" />
                  <span className="ml-2 text-[10px] font-mono text-gray-600">
                    Loading more...
                  </span>
                </div>
              )}
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={16} className="animate-spin text-gray-600" />
                  <span className="ml-2 text-xs font-mono text-gray-500">
                    Loading messages...
                  </span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <p className="text-xs font-mono text-gray-600">
                    No messages found
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex min-w-0 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] min-w-0 flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      {/* Avatar */}
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === "user"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-[#00dc82]/10 text-[#00dc82]"
                        }`}
                      >
                        {msg.role === "user" ? (
                          <User size={11} />
                        ) : (
                          <Bot size={11} />
                        )}
                      </div>

                      {/* Bubble */}
                      <div
                        className={`min-w-0 overflow-hidden rounded-xl px-3 py-2 ${
                          msg.role === "user"
                            ? "bg-blue-500/10 border border-blue-500/20 rounded-br-sm"
                            : "bg-[#161616] border border-[#1a1a1a] rounded-bl-sm"
                        }`}
                      >
                        {msg.role === "agent" ? (
                          <FastMarkdown content={msg.content} variant="chat" />
                        ) : (
                          <div style={{ whiteSpace: "pre-wrap" }}>
                            <p className="text-xs font-mono text-gray-300 leading-relaxed">
                              {msg.content}
                            </p>
                          </div>
                        )}
                        <p className="text-[9px] font-mono text-gray-600 mt-1">
                          {new Date(msg.createdAt).toLocaleTimeString()}
                        </p>

                        {/* Tool Calls */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {msg.toolCalls.map((tc, ti) => (
                              <details
                                key={ti}
                                className="border border-[#1e1e2d] rounded bg-[#0a0a0f]/50"
                              >
                                <summary className="flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[10px] font-mono text-[#00dc82] hover:bg-[#1e1e2d]/50 rounded">
                                  <span>⟡</span>
                                  <span className="font-semibold">
                                    {tc.name}
                                  </span>
                                  <span className="text-gray-600 truncate ml-1">
                                    {Object.entries(tc.args)
                                      .map(
                                        ([k, v]) =>
                                          `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
                                      )
                                      .join(", ")
                                      .slice(0, 120)}
                                  </span>
                                </summary>
                                {tc.resultPreview && (
                                  <div className="px-2 py-1.5 border-t border-[#1e1e2d]">
                                    <span className="text-[9px] font-mono text-[#ff5500]">
                                      Result:
                                    </span>
                                    <pre className="text-[9px] font-mono text-gray-400 whitespace-pre-wrap break-words mt-0.5">
                                      {tc.resultPreview}
                                    </pre>
                                  </div>
                                )}
                              </details>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          /* No conversation selected */
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare size={32} className="text-gray-700 mb-3" />
            <p className="text-xs font-mono text-gray-500 mb-1">
              Select a conversation
            </p>
            <p className="text-[10px] font-mono text-gray-700 max-w-[200px]">
              Choose a conversation from the list to view its messages
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default A2aCrmView;
