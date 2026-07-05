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
  KeyRound,
  Tag,
  Copy,
  CheckCircle2,
} from "lucide-react";
import FastMarkdown from "../../../components/FastMarkdown";
import ThemedSelect from "../../../components/ThemedSelect";
import { createClient } from "@supabase/supabase-js";

/**
 * Convert relative markdown URLs to absolute using the configured
 * website URL from invention settings (websiteUrl). Falls back to
 * the A2A endpoint's origin if websiteUrl is not set.
 */
function makeAbsolutizer(baseUrl: string): (text: string) => string {
  const base = baseUrl.replace(/\/+$/, ""); // trim trailing slash
  return (text: string) =>
    text.replace(/\]\((?!https?:|mailto:|#)(\/[\w./-]*)\)/g, `](${base}$1)`);
}
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
  licenseKey?: string;
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
  tags?: string[];
}

// ── Component ────────────────────────────────────────────────────────────

const CRM_MSG_INITIAL_LIMIT = 20;
const CRM_MSG_LOAD_MORE = 20;

const A2aCrmView: React.FC<A2aCrmViewProps> = ({ invention }) => {
  // ── Dynamic base URL for link absolutization ──
  // Uses websiteUrl from settings (the customer's own website domain).
  // Falls back to the A2A agent URL's origin, then to empty (no absolutization).
  const baseUrl =
    ((invention.settings as Record<string, unknown>).websiteUrl as string) ||
    (
      ((invention.settings as Record<string, unknown>).agentUrl as string) || ""
    ).replace(/^(https?:\/\/[^/]+).*/, "$1") ||
    "";
  const absolutizeUrls = makeAbsolutizer(baseUrl);

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

  // ── Message Tagging + Context Menu ──
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
  } | null>(null);
  const [tagEditing, setTagEditing] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");

  // ── Multi-Select Messages + Forward ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [forwardLoading, setForwardLoading] = useState(false);

  // ── Conversation context menu (right-click on sidebar items) ──
  const [convContextMenu, setConvContextMenu] = useState<{
    x: number;
    y: number;
    visitorId: string;
  } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("a2a_archived_conversations");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleArchive = (visitorId: string) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      if (next.has(visitorId)) next.delete(visitorId);
      else next.add(visitorId);
      try {
        localStorage.setItem(
          "a2a_archived_conversations",
          JSON.stringify(Array.from(next)),
        );
      } catch {}
      return next;
    });
  };

  const handleDeleteConversation = async (visitorId: string) => {
    if (
      !confirm(
        "Delete this conversation and all its messages? This cannot be undone.",
      )
    )
      return;
    try {
      const { url: supabaseUrl, serviceKey: supabaseKey } =
        resolveSupabaseCreds(invention.settings, activeProjectId);
      if (!supabaseUrl || !supabaseKey) return;
      const client = createClient(supabaseUrl, supabaseKey);
      // Delete messages first (foreign key constraint)
      await client.from("task_messages").delete().eq("visitor_id", visitorId);
      // Then delete tasks
      await client.from("tasks").delete().eq("visitor_id", visitorId);
      // Also delete from entities
      await client.from("entities").delete().eq("visitor_id", visitorId);
      // Refresh
      if (selectedId === visitorId) setSelectedId(null);
      fetchConversations();
    } catch (err) {
      console.error("[crm] Failed to delete conversation:", err);
      alert("Failed to delete. Check console for details.");
    }
  };

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
        .limit(200);
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
            licenseKey: item.license_key || item.licenseKey || undefined,
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
          const rawContent =
            m.content ||
            (Array.isArray(m.parts)
              ? m.parts.map((p: any) => p.text || "").join("")
              : typeof m.parts === "string"
                ? m.parts
                : "");
          return {
            id: m.id,
            role: m.role === "agent" ? "agent" : "user",
            content: absolutizeUrls(rawContent),
            createdAt: m.created_at || m.createdAt || new Date().toISOString(),
            tags: m.tags || [],
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
          content: absolutizeUrls(
            m.content ||
              (Array.isArray(m.parts)
                ? m.parts.map((p: any) => p.text || "").join("")
                : typeof m.parts === "string"
                  ? m.parts
                  : ""),
          ),
          createdAt: m.created_at || m.createdAt || new Date().toISOString(),
          tags: m.tags || [],
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

  // ── Message Tag Management ──

  // ── Forward selected messages to MB Chat Panel or Save as Memory ──
  const handleForwardSelected = async (action: "chat" | "memory") => {
    if (selectedMsgIds.size === 0) return;
    setForwardLoading(true);
    try {
      const selectedMsgs = messages.filter((m) => selectedMsgIds.has(m.id));
      const formatted = selectedMsgs
        .map(
          (m) =>
            `**${m.role === "user" ? "Visitor" : "Agent"}** (${new Date(m.createdAt).toLocaleString()}):\n${m.content}`,
        )
        .join("\n\n---\n\n");
      const visitorLabel = selectedId || "unknown";

      // Generate a UUID (fallback if crypto.randomUUID isn't available)
      const genId = () =>
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Get active project ID
      let projectId = "mother-brain";
      try {
        const projRes = await fetch("/api/active-project");
        if (projRes.ok) {
          const projData = await projRes.json();
          if (projData?.activeProjectId) projectId = projData.activeProjectId;
        }
      } catch {}

      if (action === "chat") {
        const chatContent = `📋 **A2A Conversation Excerpt** (visitor: \`${visitorLabel}\`)\n\n${formatted}\n\n_Please analyze this conversation and help me understand the issue, determine if it's a bug, feature request, or general question._`;

        // 1. Insert into project chat history (HTTP API — works across windows)
        try {
          const res = await fetch("/api/chat-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: genId(),
              projectId,
              topicId: "a2a-support",
              role: "user",
              content: chatContent,
              userName: "A2A Agent CRM",
              userRole: "admin",
              appName: "a2a-crm",
              timestamp: new Date().toISOString(),
            }),
          });
          if (!res.ok) {
            const errText = await res.text();
            console.error(
              "[crm] /api/chat-history failed:",
              res.status,
              errText,
            );
          }
        } catch (err) {
          console.error("[crm] /api/chat-history error:", err);
        }

        // 2. Emit via Tauri inter-window events (crosses Tauri window boundary)
        try {
          const tauri = (window as unknown as Record<string, unknown>)
            .__TAURI__ as
            | { event?: { emit?: (name: string, payload: unknown) => void } }
            | undefined;
          if (tauri?.event?.emit) {
            tauri.event.emit("mb-forward-to-chat", { prompt: chatContent });
          }
        } catch (err) {
          console.warn("[crm] Tauri emit failed:", err);
        }

        // 3. Fallback: local window event (works if same window)
        window.dispatchEvent(
          new CustomEvent("mb-forward-to-chat", {
            detail: { prompt: chatContent, visitorId: visitorLabel },
          }),
        );
      } else if (action === "memory") {
        const memoryContent = `A2A Conversation excerpt (visitor: ${visitorLabel}):\n${formatted}`;
        try {
          const res = await fetch("/api/memories/save-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              memory: {
                id: genId(),
                projectId,
                content: memoryContent,
                type: "fact",
                tags: ["a2a-conversation", "support", visitorLabel],
                created: new Date().toISOString(),
                relevance: 0.5,
                createdBy: "a2a-crm",
              },
            }),
          });
          if (!res.ok) {
            const errText = await res.text();
            console.error(
              "[crm] /api/memories/save-local failed:",
              res.status,
              errText,
            );
            alert(`Failed to save memory (${res.status}). Check console.`);
          }
        } catch (err) {
          console.error("[crm] Memory save error:", err);
          alert("Failed to save memory. Check console.");
        }
      }

      setSelectedMsgIds(new Set());
      setSelectMode(false);
    } catch (err) {
      console.error("[crm] Forward failed:", err);
      alert("Failed to forward. Check console for details.");
    } finally {
      setForwardLoading(false);
    }
  };

  const toggleMsgSelection = (msgId: string) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  // ── Cross-component bridge ──
  useEffect(() => {
    const checkPending = () => {
      try {
        const pending = localStorage.getItem("a2a_select_visitor");
        if (pending) {
          localStorage.removeItem("a2a_select_visitor");
          setSelectedId(pending);
          fetchMessages(pending);
        }
      } catch {}
    };
    // Check on mount (covers tab switch)
    checkPending();
    // Listen for the event (covers same-tab navigation)
    const handler = () => checkPending();
    window.addEventListener("mb-open-conversation", handler);
    return () => window.removeEventListener("mb-open-conversation", handler);
  }, [fetchMessages]);

  const handleMessageTagUpdate = useCallback(
    async (messageId: string, tags: string[]) => {
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, tags } : m)),
      );
      try {
        const { url: supabaseUrl, serviceKey: supabaseKey } =
          resolveSupabaseCreds(invention.settings, activeProjectId);
        if (!supabaseUrl || !supabaseKey) return;
        const client = createClient(supabaseUrl, supabaseKey);
        await client.from("task_messages").update({ tags }).eq("id", messageId);
      } catch (err) {
        console.error("[crm] Failed to update message tags:", err);
      }
    },
    [invention.settings, activeProjectId],
  );

  const handleAddMessageTag = (messageId: string, tag: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (msg && tag && !(msg.tags || []).includes(tag)) {
      handleMessageTagUpdate(messageId, [...(msg.tags || []), tag]);
    }
  };

  const handleRemoveMessageTag = (messageId: string, tag: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (msg) {
      handleMessageTagUpdate(
        messageId,
        (msg.tags || []).filter((t) => t !== tag),
      );
    }
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("contextmenu", (e) => {
      // Only close if the right-click is NOT on a message bubble
      if (!(e.target as HTMLElement).closest("[data-msg-id]")) close();
    });
    return () => {
      document.removeEventListener("click", close);
    };
  }, [contextMenu]);

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
                content: absolutizeUrls(content),
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
    <div className="flex h-full min-h-[500px] overflow-hidden">
      {/* Left column — Conversation list */}
      <div className="w-[300px] border-r border-[#1a1a1a] flex flex-col">
        {/* List header */}
        <div className="px-4 py-3 border-b border-[#1a1a1a] space-y-2">
          {/* Row 1: Title + Live indicator (always visible) + Refresh */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">
                Conversations
              </span>
              <span className="flex items-center gap-1 text-[9px] font-mono">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLive ? "bg-[#00dc82] animate-pulse" : "bg-gray-700"
                  }`}
                />
                <span
                  className={isLive ? "text-[#00dc82]/70" : "text-gray-700"}
                >
                  {isLive ? "live" : "offline"}
                </span>
              </span>
            </div>
            <button
              onClick={fetchConversations}
              disabled={loading}
              className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          {/* Row 2: Sort + Archive toggle */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-[80px]">
              <ThemedSelect
                value={sortMode}
                onChange={(v) => setSortMode(v as "newest" | "visitor")}
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "visitor", label: "Visitor" },
                ]}
              />
            </div>
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={`text-[9px] font-mono px-2 py-1 rounded-lg border transition-colors whitespace-nowrap ${
                showArchived
                  ? "bg-[#00dc82]/10 text-[#00dc82] border-[#00dc82]/20"
                  : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
              }`}
              title="Show/hide archived conversations"
            >
              {showArchived ? "Hide Arch." : "Archived"}
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
          {sortedConversations
            .filter((conv) => showArchived || !archivedIds.has(conv.visitorId))
            .map((conv) => {
              const isUnread = unreadIds.has(conv.visitorId);
              const isSelected = selectedId === conv.visitorId;
              const isArchived = archivedIds.has(conv.visitorId);
              return (
                <button
                  key={conv.visitorId}
                  onClick={() => setSelectedId(conv.visitorId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setConvContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      visitorId: conv.visitorId,
                    });
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-[#1a1a1a] transition-colors relative ${
                    isSelected
                      ? "bg-[#00dc82]/5 border-l-2 border-l-[#00dc82]"
                      : isUnread
                        ? "bg-[#00dc82]/[0.03] border-l-2 border-l-[#00dc82]/40 hover:bg-[#00dc82]/[0.06]"
                        : "hover:bg-[#0a0a0a] border-l-2 border-l-transparent"
                  } ${isArchived ? "opacity-40" : ""}`}
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
                    {conv.firstMessage ||
                      `${conv.skillUsed || "conversation"}…`}
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
                      {conv.messageCount} msg
                      {conv.messageCount !== 1 ? "s" : ""}
                    </span>
                    {conv.licenseKey && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14]">
                        LICENSED
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* Right column — Conversation detail */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {selectedConv ? (
          <>
            {/* Conversation header */}
            <div className="px-4 py-3 border-b border-[#1a1a1a] shrink-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-gray-300 truncate">
                      {selectedConv.visitorId}
                    </p>
                    {selectedConv.licenseKey ? (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#39ff14]/10 text-[#39ff14] flex items-center gap-1 shrink-0">
                        <KeyRound size={8} />
                        {selectedConv.licenseKey}
                      </span>
                    ) : null}
                  </div>
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
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] font-mono text-gray-600">
                    {selectedConv.messageCount} messages
                  </span>
                  {/* Multi-select toggle */}
                  <button
                    onClick={() => {
                      setSelectMode((v) => !v);
                      setSelectedMsgIds(new Set());
                    }}
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-lg border transition-colors ${
                      selectMode
                        ? "bg-[#00dc82]/10 text-[#00dc82] border-[#00dc82]/20"
                        : "bg-[#0a0a0a] text-gray-500 border-[#1a1a1a] hover:text-gray-300"
                    }`}
                    title="Toggle multi-select"
                  >
                    {selectMode ? "Cancel" : "Select"}
                  </button>
                </div>
              </div>
            </div>

            {/* Floating action bar for selected messages */}
            {selectMode && selectedMsgIds.size > 0 && (
              <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#0c0c0c] flex items-center justify-between shrink-0">
                <span className="text-[10px] font-mono text-[#00dc82]">
                  {selectedMsgIds.size} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleForwardSelected("chat")}
                    disabled={forwardLoading}
                    className="text-[10px] font-mono px-2 py-1 rounded-lg bg-[#00dc82]/10 text-[#00dc82] border border-[#00dc82]/20 hover:bg-[#00dc82]/20 transition-colors disabled:opacity-50"
                  >
                    ➤ Forward to Chat
                  </button>
                  <button
                    onClick={() => handleForwardSelected("memory")}
                    disabled={forwardLoading}
                    className="text-[10px] font-mono px-2 py-1 rounded-lg bg-white/5 text-gray-300 border border-[#1a1a1a] hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    🧠 Save as Memory
                  </button>
                </div>
              </div>
            )}

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
                    className={`flex min-w-0 items-start gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {/* Multi-select checkbox */}
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selectedMsgIds.has(msg.id)}
                        onChange={() => toggleMsgSelection(msg.id)}
                        className="mt-2 accent-[#00dc82] cursor-pointer shrink-0"
                      />
                    )}
                    <div
                      className={`${msg.role === "user" ? "max-w-[75%]" : "max-w-[90%]"} min-w-0 flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""} ${
                        selectedMsgIds.has(msg.id)
                          ? "ring-1 ring-[#00dc82]/40 rounded-lg"
                          : ""
                      }`}
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
                        data-msg-id={msg.id}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            messageId: msg.id,
                          });
                        }}
                        className={`min-w-0 overflow-hidden rounded-xl px-3 py-2 cursor-context-menu ${
                          msg.role === "user"
                            ? "bg-blue-500/10 border border-blue-500/20 rounded-br-sm"
                            : "bg-[#161616] border border-[#1a1a1a] rounded-bl-sm"
                        }`}
                      >
                        {msg.role === "agent" ? (
                          <FastMarkdown
                            content={absolutizeUrls(msg.content)}
                            variant="chat"
                          />
                        ) : (
                          <div style={{ whiteSpace: "pre-wrap" }}>
                            <p className="text-xs font-mono text-gray-300 leading-relaxed">
                              {absolutizeUrls(msg.content)}
                            </p>
                          </div>
                        )}
                        <p className="text-[9px] font-mono text-gray-600 mt-1">
                          {new Date(msg.createdAt).toLocaleTimeString()}
                        </p>

                        {/* Message Tags */}
                        {msg.tags && msg.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {msg.tags.map((tag) => (
                              <span
                                n
                                key={tag}
                                className="group/tag flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded-full bg-[#00dc82]/10 text-[#00dc82]"
                              >
                                <Tag size={7} />
                                {tag}
                                <button
                                  onClick={() =>
                                    handleRemoveMessageTag(msg.id, tag)
                                  }
                                  className="opacity-0 group-hover/tag:opacity-100 transition-opacity text-red-400 ml-0.5"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

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

      {/* ── Right-Click Context Menu ── */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-[#0a0a0f] border border-[#1e1e2d] rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 200),
          }}
        >
          {/* Add Tag */}
          <div className="px-3 py-1.5">
            {tagEditing === contextMenu.messageId ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="text"
                  value={tagInputValue}
                  onChange={(e) => setTagInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagInputValue.trim()) {
                      handleAddMessageTag(
                        contextMenu.messageId,
                        tagInputValue.trim().toLowerCase(),
                      );
                      setTagInputValue("");
                      setTagEditing(null);
                      setContextMenu(null);
                    } else if (e.key === "Escape") {
                      setTagEditing(null);
                      setTagInputValue("");
                    }
                  }}
                  placeholder="tag name…"
                  className="w-full text-[10px] px-1.5 py-0.5 rounded border border-[#333] bg-transparent text-gray-300 outline-none"
                />
              </div>
            ) : (
              <button
                onClick={() => {
                  setTagEditing(contextMenu.messageId);
                  setTagInputValue("");
                }}
                className="w-full flex items-center gap-2 text-[10px] font-mono text-gray-400 hover:text-[#00dc82] transition-colors"
              >
                <Tag size={11} />
                Add Tag
              </button>
            )}
          </div>

          {/* Quick Tags */}
          <div className="border-t border-[#1e1e2d] py-1">
            {["bug", "how-to", "pricing", "feature-request", "unresolved"].map(
              (quickTag) => {
                const msg = messages.find(
                  (m) => m.id === contextMenu.messageId,
                );
                const hasTag = msg?.tags?.includes(quickTag);
                return (
                  <button
                    key={quickTag}
                    onClick={() => {
                      if (hasTag) {
                        handleRemoveMessageTag(contextMenu.messageId, quickTag);
                      } else {
                        handleAddMessageTag(contextMenu.messageId, quickTag);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1 text-[10px] font-mono text-gray-500 hover:text-gray-300 hover:bg-[#1e1e2d]/50 transition-colors"
                  >
                    <span className="text-[#00dc82]">
                      {hasTag ? "✓" : "＋"}
                    </span>
                    {quickTag}
                  </button>
                );
              },
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-[#1e1e2d] py-1">
            {/* Copy Text */}
            <button
              onClick={() => {
                const msg = messages.find(
                  (m) => m.id === contextMenu.messageId,
                );
                if (msg) navigator.clipboard.writeText(msg.content);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1 text-[10px] font-mono text-gray-500 hover:text-gray-300 hover:bg-[#1e1e2d]/50 transition-colors"
            >
              <Copy size={11} />
              Copy Text
            </button>
          </div>
        </div>
      )}

      {/* ── Conversation Context Menu (sidebar right-click) ── */}
      {convContextMenu && (
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setConvContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setConvContextMenu(null);
            }}
          />
          <div
            className="fixed z-[9999] bg-[#0a0a0f] border border-[#1f1f1f] rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{
              left: Math.min(convContextMenu.x, window.innerWidth - 180),
              top: Math.min(convContextMenu.y, window.innerHeight - 150),
            }}
          >
            <button
              onClick={() => {
                toggleArchive(convContextMenu.visitorId);
                setConvContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono text-gray-400 hover:text-[#00dc82] hover:bg-[#1a1a1a] transition-colors"
            >
              {archivedIds.has(convContextMenu.visitorId)
                ? "↩ Unarchive"
                : "📦 Archive"}
            </button>
            <div className="border-t border-[#1f1f1f]" />
            <button
              onClick={() => {
                handleDeleteConversation(convContextMenu.visitorId);
                setConvContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              🗑 Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default A2aCrmView;
