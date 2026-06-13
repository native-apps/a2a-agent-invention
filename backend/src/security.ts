/**
 * Security middleware for the A2A endpoint
 * - Input sanitization (strip HTML, limit length, validate JSON-RPC)
 * - Rate limiting (per visitor_id or IP, via Cloudflare Worker state)
 * - System prompt guardrails (prevent leaking secrets)
 */

// ============================================
// Input Sanitization
// ============================================

/** Max message text length in characters */
const MAX_MESSAGE_LENGTH = 1000;

/** Max number of parts per message */
const MAX_PARTS = 5;

/** Max size of a single text part */
const MAX_PART_LENGTH = 2000;

/**
 * Strip HTML tags and dangerous characters from text
 */
export function sanitizeText(text: string): string {
  return (
    text
      .replace(/<[^>]*>/g, "") // Strip HTML tags
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, "") // Strip control chars
      .trim()
  );
}

/**
 * Validate and sanitize an incoming message.
 * Returns sanitized text or throws an error.
 */
export function validateMessage(message: unknown): {
  role: string;
  parts: Array<{ type: string; text?: string }>;
  metadata?: Record<string, unknown>;
} {
  if (!message || typeof message !== "object") {
    throw new Error("Message must be an object");
  }

  const msg = message as Record<string, unknown>;

  // Validate role
  if (msg.role !== "user" && msg.role !== "agent") {
    throw new Error("Message role must be 'user' or 'agent'");
  }

  // Validate parts
  if (!Array.isArray(msg.parts)) {
    throw new Error("Message parts must be an array");
  }

  if (msg.parts.length === 0) {
    throw new Error("Message must have at least one part");
  }

  if (msg.parts.length > MAX_PARTS) {
    throw new Error(`Message cannot have more than ${MAX_PARTS} parts`);
  }

  // Sanitize text parts
  const sanitizedParts: Array<{ type: string; text?: string }> = msg.parts.map(
    (part: Record<string, unknown>) => {
      if (part.type === "text") {
        const text = String(part.text || "");
        if (text.length > MAX_PART_LENGTH) {
          throw new Error(`Text part exceeds maximum length of ${MAX_PART_LENGTH} characters`);
        }
        return {
          type: "text" as const,
          text: sanitizeText(text),
        };
      }
      return { type: String(part.type || "data") };
    }
  );

  // Check total message length
  const totalLength = sanitizedParts
    .filter((p): p is { type: string; text: string } => p.type === "text" && "text" in p)
    .reduce((sum, p) => sum + p.text.length, 0);

  if (totalLength > MAX_MESSAGE_LENGTH) {
    throw new Error(`Total message length exceeds ${MAX_MESSAGE_LENGTH} characters`);
  }

  if (totalLength === 0) {
    throw new Error("Message text is empty after sanitization");
  }

  return {
    role: msg.role as string,
    parts: sanitizedParts,
    metadata: (msg.metadata as Record<string, unknown>) || {},
  };
}

// ============================================
// Rate Limiting (in-memory per Worker instance)
// ============================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/** In-memory rate limit store (per Worker instance, resets on redeploy) */
const rateLimitStore = new Map<string, RateLimitEntry>();

/** Requests allowed per window */
const RATE_LIMIT_MAX = 20;

/** Window duration in ms (1 minute) */
const RATE_LIMIT_WINDOW = 60_000;

/** Cleanup interval */
const CLEANUP_INTERVAL = 5 * 60_000; // 5 minutes
let lastCleanup = Date.now();

/**
 * Check rate limit for a given identifier (visitor_id or IP).
 * Returns { allowed, remaining, resetAt }
 */
export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();

  // Periodic cleanup
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    for (const [key, entry] of rateLimitStore) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
        rateLimitStore.delete(key);
      }
    }
    lastCleanup = now;
  }

  const entry = rateLimitStore.get(identifier);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    // New window
    rateLimitStore.set(identifier, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX - 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + RATE_LIMIT_WINDOW,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - entry.count,
    resetAt: entry.windowStart + RATE_LIMIT_WINDOW,
  };
}

/**
 * Get client IP from Cloudflare request headers
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// ============================================
// System Prompt Guardrails
// ============================================

/** Patterns that should NEVER appear in responses */
const BLOCKED_PATTERNS = [
  /mb_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, // Mother Brain tokens
  /supabase[_-]?(?:service|anon|key|url)/gi, // Supabase keys
  /MOTHER_BRAIN_GATEWAY_TOKEN/gi,
  /SUPABASE_SERVICE_KEY/gi,
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style keys
  /d1_[a-f0-9]{8}-[a-f0-9]{4}/g, // Cloudflare D1 IDs
];

/**
 * Filter sensitive information from AI responses.
 * Redacts tokens, keys, and internal identifiers.
 */
export function filterResponse(text: string): string {
  let filtered = text;

  for (const pattern of BLOCKED_PATTERNS) {
    filtered = filtered.replace(pattern, "[REDACTED]");
  }

  return filtered;
}

/**
 * Validate that a JSON-RPC request is well-formed
 */
export function validateJsonRpcRequest(body: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const req = body as Record<string, unknown>;

  if (req.jsonrpc !== "2.0") {
    return { valid: false, error: "jsonrpc must be '2.0'" };
  }

  if (typeof req.method !== "string" || !req.method) {
    return { valid: false, error: "method must be a non-empty string" };
  }

  // Validate method is allowed
  const allowedMethods = [
    "message/send",
    "tasks/get",
    "tasks/cancel",
    "tasks/getArtifacts",
    "agent/getCard",
    "visitor/history",
  ];

  if (!allowedMethods.includes(req.method)) {
    return { valid: false, error: `Method not found: ${req.method}` };
  }

  // Validate params if present
  if (req.params !== undefined && (typeof req.params !== "object" || Array.isArray(req.params))) {
    return { valid: false, error: "params must be an object" };
  }

  return { valid: true };
}
