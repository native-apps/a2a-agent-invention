/**
 * Telegram Bot API Integration
 *
 * Receives messages from Telegram via webhook, processes them through the
 * same A2A pipeline as website messages (Gateway → AI → MCP tools), and
 * sends the AI response back via Telegram's sendMessage API.
 *
 * Conversations are stored in the same Supabase DB (motherbrain-a2a) as
 * website chats, using visitor_id = 'telegram:<chat_id>'.
 *
 * Identity: Before pairing, Telegram users are anonymous visitors (same as
 * website visitors who haven't logged in). After pairing (via QR code /
 * website link), their chat_id is linked to customer_id for cross-platform
 * conversation continuity.
 */

import type { Env, Message } from "./types";
import { SupabaseClient } from "./supabase";
import { handleTaskMessage, insertResilient } from "./task-handler";
import { validateMessage } from "./security";

// ── Telegram Bot API Types ──────────────────────────────────────────────

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  reply_to_message?: TelegramMessage;
  from?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
  chat: {
    id: number;
    type: string; // "private", "group", "supergroup", "channel"
    title?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  date: number;
  text?: string;
  // Media types — we DON'T support these yet (security: skip media)
  photo?: unknown[];
  document?: unknown;
  sticker?: unknown;
  voice?: unknown;
  video?: unknown;
  audio?: unknown;
  caption?: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

// ── Module State ────────────────────────────────────────────────────────

let botToken: string | undefined;

export function setTelegramBotToken(token: string | undefined) {
  botToken = token;
}

export function isTelegramConfigured(): boolean {
  return !!botToken;
}

// ── Telegram Bot API Client ─────────────────────────────────────────────

const TELEGRAM_API_BASE = "https://api.telegram.org";

async function telegramApi<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  if (!botToken) {
    return { ok: false, description: "Bot token not configured" };
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return (await res.json()) as TelegramApiResponse<T>;
  } catch (err) {
    console.error(
      `[telegram] API error (${method}):`,
      err instanceof Error ? err.message : err,
    );
    return {
      ok: false,
      description: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Send a text message to a Telegram chat. */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyToMessageId?: number,
): Promise<boolean> {
  // Telegram message limit is 4096 chars — split if needed
  const chunks = splitMessage(text, 4096);
  for (const chunk of chunks) {
    const result = await telegramApi("sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: "Markdown",
      reply_to_message_id: replyToMessageId,
    });
    if (!result.ok) {
      // Markdown parse errors are common — retry without formatting
      if (result.description?.includes("can't parse entities")) {
        const fallback = await telegramApi("sendMessage", {
          chat_id: chatId,
          text: stripMarkdown(chunk),
          reply_to_message_id: replyToMessageId,
        });
        if (!fallback.ok) {
          console.error(
            `[telegram] sendMessage failed even without markdown:`,
            fallback.description,
          );
          return false;
        }
      } else {
        console.error(`[telegram] sendMessage failed:`, result.description);
        return false;
      }
    }
  }
  return true;
}

/** Register the webhook URL with Telegram. */
export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  const result = await telegramApi("setWebhook", { url: webhookUrl });
  return result.ok;
}

/** Get current webhook registration info (diagnostics). */
export async function getTelegramWebhookInfo(): Promise<{
  ok: boolean;
  url?: string;
  pending_update_count?: number;
  last_error_message?: string;
}> {
  const result = await telegramApi<{
    url: string;
    pending_update_count: number;
    last_error_message?: string;
  }>("getWebhookInfo", {});
  return {
    ok: result.ok,
    url: result.result?.url,
    pending_update_count: result.result?.pending_update_count,
    last_error_message: result.result?.last_error_message,
  };
}

/**
 * v1.2.335: Self-healing webhook registration. Called lazily on the first
 * request per isolate — if Telegram isn't delivering to THIS origin's
 * /webhook/telegram (never registered, registered elsewhere, or pointing at
 * a stale URL), re-register. Makes Telegram setup "just work" after deploy
 * without any manual step.
 */
export async function ensureTelegramWebhook(
  origin: string,
  secretToken?: string,
): Promise<void> {
  try {
    const target = `${origin.replace(/\/+$/, "")}/webhook/telegram`;
    const current = await getTelegramWebhookInfo();
    if (current.ok && current.url === target) return; // already correct
    const params: Record<string, unknown> = { url: target };
    if (secretToken) params.secret_token = secretToken;
    const result = await telegramApi<{ url: string }>("setWebhook", params);
    console.log(
      `[telegram] webhook ${result.ok ? "ensured" : "ensure FAILED"} → ${target}` +
        (result.ok ? "" : ` (${result.description || "unknown error"})`),
    );
  } catch (e) {
    console.warn("[telegram] webhook ensure error:", e instanceof Error ? e.message : e);
  }
}

/** Get bot info (validates that the token is correct). */
export async function getTelegramBotInfo(): Promise<{
  username?: string;
  first_name?: string;
  ok: boolean;
}> {
  const result = await telegramApi<{
    username: string;
    first_name: string;
    id: number;
  }>("getMe", {});
  return {
    username: result.result?.username,
    first_name: result.result?.first_name,
    ok: result.ok,
  };
}

// ── Owner recognition (v1.2.336) ─────────────────────────────────────────
// The owner is recognized by Telegram user ID. Resolution order:
//   1. module cache (per isolate)
//   2. Cache API (written by /link — survives isolates, best-effort TTL)
//   3. env OWNER_TELEGRAM_ID (durable, set at deploy — authoritative)
let cachedOwnerUserId: number | null = null;

async function storeLinkedOwner(userId: number, agentUrl: string): Promise<void> {
  cachedOwnerUserId = userId;
  try {
    const key = new Request(`https://telegram-owner.internal/${encodeURIComponent(agentUrl.replace(/\/+$/, ""))}`);
    const res = new Response(String(userId), {
      headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=15552000" }, // 180d best-effort
    });
    await (caches as unknown as { default: Cache }).default.put(key, res);
    console.log(`[telegram] owner linked (user ${userId}) and cached`);
  } catch (e) {
    console.warn("[telegram] owner cache write failed:", e instanceof Error ? e.message : e);
  }
}

export async function getLinkedOwnerUserId(agentUrl: string): Promise<number | null> {
  if (cachedOwnerUserId !== null) return cachedOwnerUserId;
  try {
    const key = new Request(`https://telegram-owner.internal/${encodeURIComponent(agentUrl.replace(/\/+$/, ""))}`);
    const cached = await (caches as unknown as { default: Cache }).default.match(key);
    if (cached) {
      const id = parseInt((await cached.text()).trim(), 10);
      if (!Number.isNaN(id)) {
        cachedOwnerUserId = id;
        return id;
      }
    }
  } catch {
    /* cache miss is normal */
  }
  return null;
}

export async function isTelegramOwner(
  fromId: number | undefined,
  env: Env,
  agentUrl: string,
): Promise<boolean> {
  if (!fromId) return false;
  if (cachedOwnerUserId === fromId) return true;
  const envOwner = env.OWNER_TELEGRAM_ID ? parseInt(env.OWNER_TELEGRAM_ID, 10) : NaN;
  if (!Number.isNaN(envOwner) && envOwner === fromId) return true;
  const linked = await getLinkedOwnerUserId(agentUrl);
  return linked === fromId;
}

// Bot username (cached per isolate) for group @mention matching
let cachedBotUsername: string | null = null;
async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername) return cachedBotUsername;
  const info = await getTelegramBotInfo();
  if (info.ok && info.username) {
    cachedBotUsername = info.username;
    return info.username;
  }
  return null;
}

/**
 * v1.2.339: register the bot's command menu (Telegram's "/" autocomplete).
 * GENERIC for every A2A agent — no per-agent hardcoding. Users discover the
 * commands by typing "/" in any chat; Telegram renders the menu button.
 */
let botCommandsEnsured = false;
export async function ensureBotCommands(): Promise<void> {
  if (botCommandsEnsured) return;
  botCommandsEnsured = true;
  try {
    const result = await telegramApi("setMyCommands", {
      commands: [
        { command: "start", description: "Start the conversation" },
        { command: "help", description: "What I can do" },
        { command: "whoami", description: "Show your Telegram user ID (owner setup)" },
        { command: "link", description: "Link yourself as my owner (needs the owner code)" },
      ],
    });
    console.log(`[telegram] command menu ${result.ok ? "registered" : "registration FAILED"}`);
  } catch (e) {
    console.warn("[telegram] setMyCommands error:", e instanceof Error ? e.message : e);
  }
}

// ── Webhook Handler ────────────────────────────────────────────────────

/**
 * Main webhook handler — receives Telegram updates, processes messages
 * through the A2A pipeline, and sends AI responses back.
 *
 * Returns immediately (200 OK) so Telegram doesn't retry. Processing
 * happens inline — Cloudflare Workers can handle this within the
 * request lifecycle.
 */
export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response> {
  if (!isTelegramConfigured()) {
    return new Response("Telegram not configured", { status: 503 });
  }

  // Verify X-Telegram-Bot-Api-Secret-Token if the secret is configured.
  // Per Telegram docs, this header is set on every webhook call and
  // must match the token you provided when calling setWebhook.
  const secretToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.TELEGRAM_SECRET_TOKEN && secretToken !== env.TELEGRAM_SECRET_TOKEN) {
    return new Response("Unauthorized", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // v1.2.336: messages OR channel posts (bots as channel admins receive
  // channel_post updates; groups deliver group messages).
  const msg =
    update.message ||
    update.edited_message ||
    update.channel_post ||
    update.edited_channel_post;
  if (!msg) {
    // Non-message update (poll, etc.) — acknowledge silently
    return new Response("OK", { status: 200 });
  }

  // LOOP PROTECTION: never react to other bots. In channels especially,
  // agent posts would otherwise trigger other agents endlessly.
  if (msg.from?.is_bot) {
    return new Response("OK", { status: 200 });
  }

  const isChannel = msg.chat.type === "channel";
  const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";

  // Channels: human admin posts only (anonymous admins post as ChannelBot —
  // a bot — and are skipped by the is_bot rule above; post as yourself).
  // v1.2.338: channels are broadcast stages — respond ONLY when explicitly
  // called (@mentioned in the post text or a /command). Shared links and
  // announcements are context, never triggers.
  if (isChannel) {
    const cText = msg.text || "";
    const cUsername = await getBotUsername();
    // v1.2.341: case-insensitive — Telegram usernames are canonically lowercase
    // but users type "@Knickknock_bot" with caps.
    const called = cText.startsWith("/") || (!!cUsername && cText.toLowerCase().includes(`@${cUsername.toLowerCase()}`));
    if (!called) {
      return new Response("OK", { status: 200 });
    }
    if (cUsername && msg.text) {
      msg.text = msg.text.replace(new RegExp(`@${cUsername}`, "i"), "").trim();
      if (!msg.text) return new Response("OK", { status: 200 });
    }
  }
  // Groups: only respond when addressed — @mentioned, replied-to, or a command.
  if (isGroup) {
    const text = msg.text || "";
    const isCommand = text.startsWith("/");
    const username = await getBotUsername();
    const mentioned =
      !!username &&
      (text.toLowerCase().includes(`@${username.toLowerCase()}`) ||
        (msg.reply_to_message?.from?.username?.toLowerCase() === username.toLowerCase()));
    if (!isCommand && !mentioned) {
      return new Response("OK", { status: 200 });
    }
    // Strip the mention so the agent processes the actual question
    if (username && msg.text) {
      msg.text = msg.text.replace(new RegExp(`@${username}`, "i"), "").trim();
      if (!msg.text) return new Response("OK", { status: 200 });
    }
  }

  // Security: Skip non-text messages (images, documents, voice, etc.)
  // This prevents processing potentially malicious media.
  if (!msg.text) {
    // Only nudge in DMs — never post "I can only process text" into a
    // public channel or group.
    if (msg.chat.type === "private") {
      if (msg.photo || msg.document || msg.sticker || msg.voice || msg.video || msg.audio) {
        await sendTelegramMessage(
          msg.chat.id,
          "I can only process text messages right now. Please type your question!",
          msg.message_id,
        );
      }
    }
    return new Response("OK", { status: 200 });
  }

  const requestUrl = new URL(request.url);
  const agentUrlFromRequest = `${requestUrl.protocol}//${requestUrl.host}`;

  // ── Owner commands (handled before the AI pipeline) ───────────────────
  const text = msg.text.trim();
  if (text === "/whoami" || text.startsWith("/whoami")) {
    await sendTelegramMessage(
      msg.chat.id,
      `Your Telegram user ID: *${msg.from?.id ?? "unknown"}*\nChat ID: *${msg.chat.id}* (\`${msg.chat.type}\`)\n\nPaste your user ID into the wizard (Telegram → Owner) to make me recognize you as my owner.`,
      msg.message_id,
    );
    return new Response("OK", { status: 200 });
  }
  if (text.startsWith("/link")) {
    const code = text.split("/link")[1]?.trim();
    if (!env.OWNER_LINK_CODE) {
      await sendTelegramMessage(
        msg.chat.id,
        "Linking isn't configured — set an Owner Link Code in the wizard (Telegram → Owner) and deploy, then try again.",
        msg.message_id,
      );
    } else if (code && code === env.OWNER_LINK_CODE) {
      await storeLinkedOwner(msg.from!.id, agentUrlFromRequest);
      const alsoEnv =
        env.OWNER_TELEGRAM_ID && parseInt(env.OWNER_TELEGRAM_ID, 10) === msg.from!.id;
      await sendTelegramMessage(
        msg.chat.id,
        `✅ Linked! You are now my owner${alsoEnv ? " (confirmed by deploy too)" : ""}. From now on I'll treat our chats as owner conversations — full access to goals, deals, and strategy.`,
        msg.message_id,
      );
    } else {
      await sendTelegramMessage(
        msg.chat.id,
        "❌ That code doesn't match. Copy the Owner Link Code from the wizard (Telegram → Owner) and send: /link YOUR-CODE",
        msg.message_id,
      );
    }
    return new Response("OK", { status: 200 });
  }

  // Process the text message asynchronously (return 200 immediately
  // to avoid Telegram webhook timeout, then process)
  //
  // Cloudflare Workers support ctx.waitUntil for background processing,
  // but we're in a Hono handler without direct ctx access here.
  // So we process inline — the Worker has up to 30s on the free plan,
  // which is enough for a Gateway round-trip.
  // (requestUrl / agentUrlFromRequest declared above, before the owner
  // commands — same scope.)
  // v1.2.341: process in the BACKGROUND via waitUntil. Telegram hangs up on
  // webhooks after ~60s and Cloudflare cancels the request context when the
  // caller disconnects — multi-knock turns (2+ neighbors × ~20-25s round
  // trips) died mid-flight: the knocks landed but the relayed reply was
  // never sent. Returning 200 immediately + waitUntil keeps the work (and
  // the final sendMessage) alive well past the disconnect.
  if (ctx) {
    ctx.waitUntil(
      processTelegramMessage(msg, env, agentUrlFromRequest).catch((err) => {
        console.error(
          "[telegram] Background processing error:",
          err instanceof Error ? err.message : err,
        );
      }),
    );
    return new Response("OK", { status: 200 });
  }
  // Legacy inline path (no ctx available)
  try {
    await processTelegramMessage(msg, env, agentUrlFromRequest);
  } catch (err) {
    console.error(
      "[telegram] Error processing message:",
      err instanceof Error ? err.message : err,
    );
    // Send a friendly error to the user
    await sendTelegramMessage(
      msg.chat.id,
      "Sorry, I ran into an issue processing your message. Please try again in a moment.",
      msg.message_id,
    );
  }

  return new Response("OK", { status: 200 });
}

// ── Core Message Processing ────────────────────────────────────────────

async function processTelegramMessage(msg: TelegramMessage, env: Env, requestAgentUrl?: string) {
  const db = new SupabaseClient(env);
  const chatId = msg.chat.id;
  // v1.2.336: owner chats get their own visitor namespace — task-handler
  // injects the OWNER mandate block for telegram-owner:* threads (full
  // autonomy: goals, deals, strategy — not visitor-sales mode).
  const senderIsOwner = requestAgentUrl
    ? await isTelegramOwner(msg.from?.id, env, requestAgentUrl)
    : false;
  const visitorId = senderIsOwner
    ? `telegram-owner:${chatId}`
    : `telegram:${chatId}`;
  const userText = msg.text!.trim();

  // Send "typing" indicator
  await telegramApi("sendChatAction", {
    chat_id: chatId,
    action: "typing",
  });

  // Check if this Telegram user is paired with a customer account
  let customerId: string | null = null;
  try {
    const links = await db
      .from("telegram_links")
      .then((q) =>
        q
          .select("customer_id, visitor_id, paired")
          .eq("telegram_chat_id", chatId)
          .limit(1)
          .get<{ customer_id: string; visitor_id: string; paired: boolean }>(),
      );
    if (links && links.length > 0 && links[0].paired) {
      customerId = links[0].customer_id;
    }
  } catch (err) {
    console.warn("[telegram] telegram_links lookup failed:", err instanceof Error ? err.message : err);
  }

  // Look up or create a task for this Telegram conversation
  // (same pattern as website messages — one persistent conversation per visitor)
  let taskId: string | undefined;

  try {
    const existingTasks = await db
      .from("tasks")
      .then((q) =>
        q
          .select("id")
          .eq("visitor_id", visitorId)
          .order("created_at", false)
          .limit(1)
          .get<{ id: string }>(),
      );
    if (existingTasks && existingTasks.length > 0) {
      taskId = existingTasks[0].id;
    }
  } catch (err) {
    console.warn("[telegram] existing task lookup failed:", err instanceof Error ? err.message : err);
    // Continue to create new task
  }

  if (!taskId) {
    const newTasks = await insertResilient(
      db,
      "tasks",
      {
        id: crypto.randomUUID(),
        status: "submitted",
        skill_id: null,
        visitor_id: visitorId,
        license_key: null,
        customer_id: customerId,
        metadata: {
          source: "telegram",
          telegram_chat_id: chatId,
          telegram_username: msg.from?.username || null,
          telegram_first_name: msg.from?.first_name || null,
        },
        history: [],
      },
      ["license_key", "customer_id"],
      {
        id: crypto.randomUUID(),
        status: "submitted",
        skill_id: null,
        visitor_id: visitorId,
        metadata: {
          source: "telegram",
          telegram_chat_id: chatId,
          telegram_username: msg.from?.username || null,
          telegram_first_name: msg.from?.first_name || null,
        },
        history: [],
      },
    );
    const newTask = Array.isArray(newTasks) ? newTasks[0] : null;
    taskId = (newTask as { id?: string } | null)?.id;
  }

  if (!taskId) {
    await sendTelegramMessage(
      chatId,
      "Sorry, I couldn't start a conversation. Please try again.",
      msg.message_id,
    );
    return;
  }

  // Build the Message object (same format as website messages)
  const message: Message = {
    role: "user",
    parts: [{ type: "text", text: userText }],
  };

  // Validate message
  let sanitizedMessage: Message;
  try {
    const validated = validateMessage(message);
    sanitizedMessage = {
      role: validated.role as "user" | "agent",
      parts: validated.parts as Message["parts"],
      metadata: validated.metadata,
    };
  } catch {
    await sendTelegramMessage(
      chatId,
      "I couldn't process that message. Please try rephrasing.",
      msg.message_id,
    );
    return;
  }

  // Process through the same A2A pipeline as website messages
  // (Gateway → AI → MCP tools → response)
  const { task, artifacts } = await handleTaskMessage(
    taskId,
    sanitizedMessage,
    undefined, // skillId — let the AI pick based on content
    db,
    env.MOTHER_BRAIN_GATEWAY_TOKEN,
    visitorId,
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
      cfMaxTokens: env.CF_MAX_TOKENS ? parseInt(env.CF_MAX_TOKENS) : undefined,
      cfTemperature: env.CF_TEMPERATURE ? parseFloat(env.CF_TEMPERATURE) : undefined,
            toolMaxPerRound: env.CF_MAX_TOOLS_PER_ROUND ? parseInt(env.CF_MAX_TOOLS_PER_ROUND, 10) : undefined,
            toolMaxTotal: env.CF_MAX_TOTAL_TOOLS ? parseInt(env.CF_MAX_TOTAL_TOOLS, 10) : undefined,
    },
    undefined, // licenseKey — Telegram doesn't use license keys
    customerId,
    env.CF_WORKER_MODEL,
    env.FORCE_CF_WORKER === "true",
    env.WEBSITE_URL || requestAgentUrl,
  );

  // Extract the AI response text
  let responseText = "";

  // The AI response is stored in the task messages by handleTaskMessage.
  // We need to fetch the latest agent message from the DB.
  try {
    const messages = await db
      .from("task_messages")
      .then((q) =>
        q
          .select("role, parts, created_at")
          .eq("task_id", taskId)
          .order("created_at", false)
          .limit(5)
          .get<{
            role: string;
            parts: Array<{ type: string; text?: string }>;
            created_at: string;
          }>(),
      );

    // Find the most recent agent message
    for (const m of messages || []) {
      if (m.role === "agent") {
        responseText = (m.parts || [])
          .filter((p) => p.type === "text")
          .map((p) => p.text || "")
          .join("\n");
        break;
      }
    }
  } catch (err) {
    console.warn("[telegram] task messages fetch failed:", err instanceof Error ? err.message : err);
    // Fallback — if DB fetch fails, use task state
  }

  // If we couldn't get a response from the DB, construct a fallback
  if (!responseText) {
    if (task.status === "completed") {
      responseText =
        "I've processed your request, but I'm having trouble displaying the response. Please try asking again.";
    } else {
      responseText =
        "I'm having trouble connecting right now. Please try again in a moment.";
    }
  }

  // Send the AI response back to Telegram
  await sendTelegramMessage(chatId, responseText, msg.message_id);

  // ── Entity Tracking ──
  // Track this Telegram user as an entity (same as website visitors)
  try {
    await db.rpc("upsert_entity", {
      p_visitor_id: visitorId,
      p_customer_id: customerId ?? undefined,
      p_entity_type: customerId ? "customer" : "visitor",
      p_source: "telegram",
    });
  } catch (err) {
    console.warn("[telegram] entity tracking failed:", err instanceof Error ? err.message : err);
    // Non-fatal — entity tracking is optional
  }

  // ── Upsert Telegram Link ──
  // Track the Telegram user info (even before pairing)
  try {
    await db.from("telegram_links").then((q) =>
      q.upsert(
        {
          telegram_chat_id: chatId,
          telegram_username: msg.from?.username || null,
          telegram_first_name: msg.from?.first_name || null,
        },
        "telegram_chat_id",
      ),
    );
  } catch (err) {
    console.warn("[telegram] telegram_links upsert failed:", err instanceof Error ? err.message : err);
    // Table might not exist — non-fatal
  }
}

// ── Utility Functions ──────────────────────────────────────────────────

/**
 * Split a long message into chunks that fit Telegram's 4096 char limit.
 * Tries to split on paragraph breaks, then sentence breaks, then words.
 */
function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to find a paragraph break
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen * 0.3) {
      // Try sentence break
      splitAt = remaining.lastIndexOf(". ", maxLen);
    }
    if (splitAt < maxLen * 0.3) {
      // Try newline
      splitAt = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitAt < maxLen * 0.3) {
      // Try space
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt < maxLen * 0.3) {
      // Hard split
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt + 1).trim());
    remaining = remaining.slice(splitAt + 1).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/** Strip Markdown formatting for fallback plain-text sending. */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/`{3}[\s\S]+?`{3}/g, (m) => m.replace(/`{3}/g, "").trim()) // code blocks
    .replace(/`(.+?)`/g, "$1") // inline code
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)") // links
    .replace(/^#{1,6}\s+/gm, "") // headers
    .replace(/^>\s+/gm, "") // blockquotes
    .replace(/^[-*+]\s+/gm, "• "); // bullet lists
}
