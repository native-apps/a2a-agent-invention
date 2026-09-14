// ── Redeploy indicator (shared) ── These settings ship to the Cloudflare
// Worker as secrets (config.json actions.deploy.secrets — keep in sync).
// Changing ANY of them (or updating the invention's code) means the deployed
// worker is stale until the next Deploy. Both the Wizard banner and the
// Neighbors screen banner fingerprint these and show "Redeploy needed"
// when they drift.
//
// Keys 1-23: worker/wizard-owned settings (original list).
// Keys 24-32: CRM-owned settings (Neighbors + Conversations screens) that
// also deploy as secrets but were missing from the original list — without
// them, CRM changes (goals, targets, heartbeat, SOPs, relay dials, autonomy,
// standing instructions, NEAR curator) never tripped the banner.
export const DEPLOY_AFFECTING_SETTINGS = [
  "embeddingApiKey",
  "supabaseUrl",
  "supabaseServiceKey",
  "mbSupabaseUrl",
  "mbSupabaseServiceKey",
  "mbProjectId",
  "gatewayToken",
  "gatewayBaseUrl",
  "agentName",
  "agentDescription",
  "agentUrl",
  "agentSkillsJson",
  "agentProvider",
  "accessToken",
  "mcpBaseUrl",
  "mcpApiKey",
  "websiteUrl",
  "encoreApiUrl",
  "encoreApiKey",
  "jwtSecret",
  "telegramBotToken",
  "mcpCloudUrl",
  "forceCloudMcp",
  // CRM-owned (Neighbors / Conversations):
  "neighborGoalsJson",
  "neighborTargetsJson",
  "heartbeatEnabled",
  "heartbeatScheduleJson",
  "neighborSopsJson",
  "relaySettingsJson",
  "neighborAutonomy",
  "neighborInstructionsJson",
  "nearAccountId",
  // v1.2.306 — SOPs folder architecture: folder selection + active-file
  // toggles bake into the worker at deploy — changes must trip the banner
  "kbFolder",
  "kbActiveFiles",
];

/** Settings owned by the CRM screens (Neighbors + Conversations). The
 *  Wizard never edits these — on deploy it must preserve the SERVER's
 *  values for them (read-modify-write) and its drift check must source
 *  them from the server, or the two writers fight: each deploy writes a
 *  different serialization of these keys and the redeploy banner never
 *  settles (v1.2.262 loop fix). nearAccountId is NOT here — the Wizard's
 *  NEAR slides own it. */
export const CRM_OWNED_SETTINGS = [
  "neighborGoalsJson",
  "neighborTargetsJson",
  "heartbeatEnabled",
  "heartbeatScheduleJson",
  "neighborSopsJson",
  "relaySettingsJson",
  "neighborAutonomy",
  "neighborInstructionsJson",
] as const;

// ── Stale-snapshot guard (v1.2.267) ── The MB app's settings GET can briefly
// serve PRE-deploy data right after a deploy PATCH lands (debounced
// persistence — the app-memory quirk from the Supabase saga). The post-deploy
// refetch was overwriting the fresh baseline with that stale snapshot,
// resurrecting the redeploy banner until a later navigation re-fetched the
// settled state. Screens record every deploy's timestamp here (module-level,
// survives tab switches) and ignore any fetched snapshot older than it.
const lastKnownDeploys = new Map<string, string>();

export function noteDeployedAt(projectId: string, ts: string): void {
  const cur = lastKnownDeploys.get(projectId);
  if (!cur || ts > cur) lastKnownDeploys.set(projectId, ts);
}

export function isStaleSnapshot(
  projectId: string,
  snapshotLastDeployedAt?: string,
): boolean {
  const known = lastKnownDeploys.get(projectId);
  return !!(known && (!snapshotLastDeployedAt || snapshotLastDeployedAt < known));
}

/** Stable fingerprint (FNV-1a x2) of the deploy-affecting settings. */
export function deployFingerprint(s: Record<string, unknown>): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const key of DEPLOY_AFFECTING_SETTINGS) {
    const str = key + "=" + String(s[key] ?? "") + "\u0001";
    for (let i = 0; i < str.length; i++) {
      h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
      h2 = (h2 + str.charCodeAt(i) * (i + 7)) >>> 0;
    }
  }
  return h1.toString(36) + "-" + h2.toString(36);
}


// ── v1.2.339: SOP-folder drift ── Settings drift can't see FILE edits:
// editing/adding/deleting a SOP markdown file in the kbFolder changes nothing
// in settings, so the banner never tripped. This check compares the LIVE
// folder files (name+size via the app files API) against the DEPLOYED
// worker's baked SOPs (/debug/sops — v1.2.301+ workers) — any difference
// means the deployed worker is stale. Size is the edit signal (same-size
// rewrites are theoretically missed — acceptable heuristic, documented).
export interface SopFolderDrift {
  drifted: boolean;
  reason?: string;
}

interface FlatFile {
  path: string; // folder-relative, e.g. "SOP-001-relay.md" or "Brand/voice.md"
  size: number;
}

function walkMdFiles(items: Array<Record<string, unknown>>): FlatFile[] {
  const out: FlatFile[] = [];
  const walk = (nodes: Array<Record<string, unknown>>, prefix: string) => {
    for (const item of nodes) {
      const name = String(item.name || "");
      if (!name || name.startsWith(".")) continue; // .DS_Store, .obsidian…
      const isFolder = item.type === "folder";
      const p = prefix ? `${prefix}/${name}` : name;
      if (isFolder) {
        if (Array.isArray(item.children)) walk(item.children as Array<Record<string, unknown>>, p);
      } else if (/\.md$/i.test(name)) {
        // v1.2.342: identity files bake into constants (SOUL_MD / SECURITY_DIRECTIVES /
        // SKILLS_MD), never SOP_FILES — /debug/sops never lists them, so counting
        // them made the banner read "3 new" forever on Mother + Anakimota.
        const base = name.replace(/\.md$/i, "").toUpperCase();
        if (base === "SOUL" || base === "SECURITY" || base === "SKILLS") continue;
        out.push({ path: p, size: Number(item.size) || 0 });
      }
    }
  };
  walk(items, "");
  return out;
}

function findFolderNode(items: Array<Record<string, unknown>>, folder: string): Array<Record<string, unknown>> | null {
  // folder may be nested ("sop" or "docs/sop") — walk to it
  const parts = folder.split("/").filter(Boolean);
  let nodes = items;
  for (const part of parts) {
    const hit = nodes.find((n) => n.type === "folder" && String(n.name) === part);
    if (!hit || !Array.isArray(hit.children)) return null;
    nodes = hit.children as Array<Record<string, unknown>>;
  }
  return nodes;
}

export async function checkSopFolderDrift(opts: {
  projectId: string;
  kbFolder: string;
  agentUrl: string;
}): Promise<SopFolderDrift> {
  const { projectId, kbFolder, agentUrl } = opts;
  if (!projectId || !kbFolder || !agentUrl) return { drifted: false };
  try {
    // 1) live folder files
    const cfgRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}/config`);
    if (!cfgRes.ok) return { drifted: false };
    const config = await cfgRes.json();
    const rootPath = config?.indexing?.rootPath || config?.rootPath;
    if (!rootPath) return { drifted: false };
    const treeRes = await fetch(`/api/files?root=${encodeURIComponent(rootPath)}`);
    if (!treeRes.ok) return { drifted: false };
    const tree = await treeRes.json();
    if (!Array.isArray(tree)) return { drifted: false };
    const folderNode = findFolderNode(tree, kbFolder);
    if (!folderNode) return { drifted: false };
    const local = walkMdFiles(folderNode);

    // 2) deployed baked SOPs
    const liveRes = await fetch(`${agentUrl.replace(/\/+$/, "")}/debug/sops`);
    if (!liveRes.ok) return { drifted: false }; // pre-301 worker or unreachable — settings drift still covers it
    const live = await liveRes.json();
    const deployed: FlatFile[] = (live?.sops || []).map((s: { path?: string; size?: number }) => ({
      path: String(s.path || ""),
      size: Number(s.size) || 0,
    }));

    // 3) compare — path-primary, size only when the files API provides it
    // (v1.2.340 fix: the /api/files tree reports size 0 for some files, which
    // made every key mismatch and stuck the banner on "5 new, 5 removed"
    // forever even with a perfect deploy).
    const localByPath = new Map(local.map((f) => [f.path, f.size]));
    const deployedByPath = new Map(deployed.map((f) => [f.path, f.size]));
    const added = [...localByPath.keys()].filter((p) => !deployedByPath.has(p));
    const removed = [...deployedByPath.keys()].filter((p) => !localByPath.has(p));
    const changed = [...localByPath.keys()].filter((p) => {
      const ls = localByPath.get(p) || 0;
      const ds = deployedByPath.get(p);
      // Only trust size comparison when the files API gave us a real size.
      return ds !== undefined && ls > 0 && ds > 0 && ls !== ds;
    });
    if (added.length || removed.length || changed.length) {
      const bits: string[] = [];
      if (added.length) bits.push(`${added.length} new`);
      if (removed.length) bits.push(`${removed.length} removed`);
      if (changed.length) bits.push(`${changed.length} changed`);
      return { drifted: true, reason: `SOPs folder changed (${bits.join(", ")}) — redeploy to bake` };
    }
    return { drifted: false };
  } catch {
    return { drifted: false }; // never block the UI on this check
  }
}
