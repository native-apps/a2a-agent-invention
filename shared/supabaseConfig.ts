// ---------------------------------------------------------------------------
// Shared Supabase credential helper
// ---------------------------------------------------------------------------
// The Mother Brain backend strips secrets (like supabaseServiceKey) from
// GET /api/inventions/:id responses for security. This means components that
// need the service key (CRM, ChatPreview) can't rely on invention.settings
// alone — the key is often empty after a page reload.
//
// This module provides a localStorage-backed fallback so the key persists
// across page reloads. When A2aAgentSettings saves credentials, it writes
// them to localStorage. When CRM/ChatPreview need credentials, they check
// invention.settings first, then fall back to localStorage.
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = "a2a_supabase_creds";

function getStorageKey(projectId?: string): string {
  return projectId ? `${STORAGE_KEY_PREFIX}_${projectId}` : STORAGE_KEY_PREFIX;
}

export interface SupabaseCreds {
  url: string;
  serviceKey: string;
}

/**
 * Save Supabase credentials to localStorage (project-scoped).
 * Called by A2aAgentSettings whenever settings are saved.
 */
export function saveSupabaseCreds(
  url: string,
  serviceKey: string,
  projectId?: string,
): void {
  try {
    if (typeof localStorage === "undefined") return;
    const payload = JSON.stringify({ url, serviceKey });
    // SECURITY (2026-09-05): project-scoped ONLY. The old unscoped default
    // key made one project's credentials readable from every other project
    // in the same webview (live incident: a brand-new agent's Neighbors
    // screen showed another project's Deals through the shared fallback).
    if (projectId) {
      localStorage.setItem(getStorageKey(projectId), payload);
    }
  } catch {
    // localStorage might be unavailable (private mode, etc.)
  }
}

/**
 * Read Supabase credentials from localStorage (project-scoped).
 */
export function loadSupabaseCreds(projectId?: string): SupabaseCreds | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const key = getStorageKey(projectId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.url && parsed?.serviceKey) {
      return { url: parsed.url, serviceKey: parsed.serviceKey };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve Supabase credentials with fallback chain:
 * 1. invention.settings (from server — may be stripped)
 * 2. localStorage scoped to project
 * 3. localStorage default (unscoped)
 *
 * Returns empty strings if none of the sources have the credentials.
 */
export function resolveSupabaseCreds(
  settings: Record<string, unknown>,
  projectId?: string,
): SupabaseCreds {
  const settingsUrl = (settings.supabaseUrl as string) || "";
  const settingsKey = (settings.supabaseServiceKey as string) || "";

  // If both are present in settings, use them directly
  if (settingsUrl && settingsKey) {
    return { url: settingsUrl, serviceKey: settingsKey };
  }

  // Fall back to the PROJECT-SCOPED cache only. SECURITY (2026-09-05): the
  // old unscoped-default fallback leaked whichever project saved last into
  // every other project (cross-project data bleed — Deals/CRM/history).
  // Cross-project fallback is intentionally removed.
  const cached = projectId ? loadSupabaseCreds(projectId) : null;
  if (cached) {
    return {
      url: settingsUrl || cached.url,
      serviceKey: settingsKey || cached.serviceKey,
    };
  }

  return { url: settingsUrl, serviceKey: settingsKey };
}
