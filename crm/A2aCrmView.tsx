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

const A2aCrmView: React.FC<A2aCrmViewProps> = ({ invention }) => {
  const [sortMode, setSortMode] = useState<"newest" | "visitor">("newest");
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const realtimeRef = useRef<ReturnType<typeof createClient> | null>(null);
  const viewedConversationsRef = useRef<Set<string>>(new Set());
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
      const pid = activeProjectId || "";
      const res = await fetch(
        `/api/inventions/a2a-agent/supabase/tasks?select=id,status,skill_id,visitor_id,created_at,updated_at&order=created_at.desc&limit=50${pid ? `&projectId=${pid}` : ""}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const raw = Array.isArray(data) ? data : [];
      const mapped = raw.map((item: any) => ({
        taskId: item.id || item.taskId,
        visitorId: item.visitor_id || item.visitorId || "anonymous",
        firstMessage: "",
        status: item.status || "unknown",
        messageCount: 0,
        createdAt: item.created_at || item.createdAt,
        updatedAt: item.updated_at || item.updatedAt,
        skillUsed: item.skill_id || item.skillUsed,
      }));
      setConversations(mapped);
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
  }, []);

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async (taskId: string) => {
    setLoadingMessages(true);
    try {
      const pid = activeProjectId;
      const pidParam = pid ? `&projectId=${pid}` : "";

      // Fetch task messages
      const msgRes = await fetch(
        `/api/inventions/a2a-agent/supabase/task_messages?task_id=eq.${taskId}&order=created_at.asc&select=id,role,parts,visitor_id,metadata,created_at${pidParam}`,
      );
      if (!msgRes.ok) {
        throw new Error(`HTTP ${msgRes.status}`);
      }
      const rawMsgs: any[] = await msgRes.json();

      // Fetch artifacts
      const artRes = await fetch(
        `/api/inventions/a2a-agent/supabase/artifacts?task_id=eq.${taskId}&order=created_at.asc&select=artifact_id,name,description,parts,metadata${pidParam}`,
      );
      const rawArtifacts: any[] = artRes.ok ? await artRes.json() : [];

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
    } catch (err: unknown) {
      console.error("[crm] Failed to load messages:", err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

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
    const supabaseUrl = (invention.settings.supabaseUrl as string) || "";
    const supabaseKey = (invention.settings.supabaseServiceKey as string) || "";
    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createClient(supabaseUrl, supabaseKey);
    realtimeRef.current = supabase;

    const channel = supabase
      .channel("a2a-crm-realtime")

      // New message inserted → refresh conversation list + append to active view
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_messages" },
        (payload) => {
          const newMsg = payload.new as Record<string, unknown>;
          const taskId =
            (newMsg.task_id as string) || (newMsg.taskId as string);

          // Refresh conversation list (updates message counts, timestamps)
          fetchConversations();

          // Mark as unread if not currently viewing this conversation
          if (taskId && selectedId !== taskId) {
            setUnreadIds((prev) => new Set(prev).add(taskId));
          }

          // If viewing this conversation, append the message live
          if (taskId && selectedId === taskId) {
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

  const selectedConv = conversations.find((c) => c.taskId === selectedId);

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
            const isUnread = unreadIds.has(conv.taskId);
            const isSelected = selectedId === conv.taskId;
            return (
              <button
                key={conv.taskId}
                onClick={() => setSelectedId(conv.taskId)}
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
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
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
                        className={`rounded-xl px-3 py-2 ${
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
