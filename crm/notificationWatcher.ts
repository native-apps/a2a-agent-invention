// ── Always-on notification watcher (notifications handoff #3, tier 2) ──
// ONE module-level Supabase Realtime subscription PER PROJECT, started the
// first time ANY A2A view mounts and NEVER torn down on unmount — it survives
// tab switches within the app window. Covers every project that has A2A
// creds, notifies for EVERY incoming message (visitor, neighbor, telegram…),
// and skips the agent's own replies. The thread you are actively reading is
// muted (setMutedThread) so you don't get banners for the conversation open
// in front of you.
//
// Native delivery goes through window.__MB_NOTIFICATIONS (MB app bridge).
// Tag = visitor_id → the bridge's 10-second dedupe makes multiple watcher
// instances (e.g. two project windows) safe.
//
// NOT covered here (app-side, see HANDOFF-NOTIFICATIONS-TO-MB-CODER.md #3):
// notifications while the A2A window is fully closed, and click-to-open
// routing — the invention has no code running when its windows are closed.

import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseCreds } from "../shared/supabaseConfig";

interface MbNotifications {
  isSupported(): boolean;
  requestPermission(): Promise<"granted" | "denied" | "default">;
  show(n: { title: string; body?: string; tag?: string }): void;
}

function getMbNotifications(): MbNotifications | null {
  const w = window as unknown as { __MB_NOTIFICATIONS?: MbNotifications };
  return w.__MB_NOTIFICATIONS || null;
}

// ── Mute state: the thread currently being read in the Conversations screen ──
let mutedThread: string | null = null;
export function setMutedThread(visitorId: string | null): void {
  mutedThread = visitorId;
}

// ── Singleton state ──
let started = false;
const channels: ReturnType<ReturnType<typeof createClient>["channel"]>[] = [];

function previewFromParts(parts: unknown): string {
  if (Array.isArray(parts)) {
    return parts
      .filter((p) => (p as { type?: string })?.type === "text")
      .map((p) => (p as { text?: string }).text || "")
      .join("")
      .slice(0, 80);
  }
  if (typeof parts === "string") return parts.slice(0, 80);
  return "";
}

function notifyForInsert(
  msg: Record<string, unknown>,
  agentName: string,
): void {
  const visitorId = (msg.visitor_id as string) || (msg.visitorId as string);
  if (!visitorId) return;
  if (msg.role === "agent") return; // our own replies — never notify
  if (mutedThread && mutedThread === visitorId) return; // reading it now

  const mbn = getMbNotifications();
  if (!mbn || !mbn.isSupported()) return;
  mbn
    .requestPermission()
    .then((perm) => {
      if (perm !== "granted") return;
      if (visitorId.startsWith("neighbor:")) {
        const label = visitorId.replace(/^neighbor:/, "");
        mbn.show({
          title: "🚪 Neighbor knock",
          body: `${label} knocked on ${agentName}`,
          tag: visitorId,
        });
      } else {
        const preview = previewFromParts(msg.parts);
        mbn.show({
          title: "💬 New message",
          body: preview ? `${agentName}: "${preview}"` : `${agentName} received a message`,
          tag: visitorId,
        });
      }
    })
    .catch(() => {
      /* permission unavailable — unread badge still marks it */
    });
}

async function subscribeProject(pid: string): Promise<void> {
  try {
    const res = await fetch(
      `/api/inventions/a2a-agent?projectId=${encodeURIComponent(pid)}`,
    );
    if (!res.ok) return;
    const inv = await res.json();
    const settings =
      inv?.settings && typeof inv.settings === "object"
        ? (inv.settings as Record<string, unknown>)
        : null;
    if (!settings) return;
    const { url, serviceKey } = resolveSupabaseCreds(settings, pid);
    if (!url || !serviceKey) return;
    const client = createClient(url, serviceKey);
    const agentName = (settings.agentName as string) || "your agent";
    const channel = client
      .channel(`a2a-notify-${pid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_messages" },
        (payload: { new?: Record<string, unknown> }) => {
          if (payload?.new) notifyForInsert(payload.new, agentName);
        },
      )
      .subscribe();
    channels.push(channel);
  } catch {
    /* project unreachable — skip it, others still subscribe */
  }
}

async function discoverProjects(): Promise<void> {
  try {
    // Drop old subscriptions (creds may have changed after a redeploy).
    for (const ch of channels.splice(0)) void ch.unsubscribe();
    const res = await fetch("/api/projects");
    if (!res.ok) return;
    const projects = (await res.json()) as Array<
      Record<string, unknown>
    >;
    if (!Array.isArray(projects)) return;
    for (const p of projects) {
      const pid = (p.projectId || p.id) as string | undefined;
      if (pid) void subscribeProject(pid);
    }
  } catch {
    /* app API unreachable — next view mount retries */
  }
}

/**
 * Idempotent. Safe to call from every view mount. If the bridge is absent
 * (older app build), it does NOT latch `started` so a later mount retries
 * after an app update. Re-discovers projects after every redeploy so new
 * projects and rotated creds are picked up.
 */
export function ensureNotificationWatcher(): void {
  const mbn = getMbNotifications();
  if (!mbn || !mbn.isSupported()) return; // retry on next mount
  if (started) return;
  started = true;
  // Proactive permission ask — one macOS prompt, early.
  void mbn.requestPermission().catch(() => {});
  void discoverProjects();
  window.addEventListener("a2a-redeployed", () => void discoverProjects());
}
