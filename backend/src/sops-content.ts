/**
 * SOP Files — generated at deploy time by the MB app from the owner's
 * "CF Worker Files Folder" (kbFolder). This DEFAULT (empty) version ships
 * in the public tarball — the Mother Brain app replaces it with the owner's
 * actual file content during the deploy pipeline (lib/invention-actions.ts,
 * cloudflare-deploy action, "bake sops content" step).
 *
 * File format: each SopFile carries the raw markdown (frontmatter + body)
 * plus its folder-relative path. The frontmatter is parsed at RUNTIME by
 * knowledge-base.ts (buildSystemPrompt) so scopes/toggles can change
 * without regenerating this module.
 *
 * Identity files (SOUL.md, SECURITY.md, SKILLS.md) are NOT stored here —
 * they patch knowledge-base.ts constants directly at deploy (they're
 * structural, not SOP content).
 */

export interface SopFile {
  /** Folder-relative path, e.g. "public-support-intake.sop.md" or "sales/SOP-001-intake.md" */
  path: string;
  /** Raw markdown content: frontmatter (--- title/scope/enabled ---) + body */
  content: string;
  /** From the "Activate Files" tree toggles at deploy time */
  active: boolean;
  /** Content size in bytes (for the UI budget warning) */
  size: number;
}

/**
 * The deployed SOP files. Empty in the public tarball (no owner content);
 * populated by the MB app's deploy pipeline from the kbFolder.
 */
export const SOP_FILES: SopFile[] = [];

/** Parsed frontmatter from a SOP file */
export interface SopFrontmatter {
  title: string;
  scope: "all" | "neighbor";
  enabled: boolean;
  source?: string;
}

/** Parse YAML-ish frontmatter from markdown content */
export function parseSopFrontmatter(content: string): SopFrontmatter {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { title: "", scope: "all", enabled: true };
  }
  const fm = fmMatch[1];
  const title = fm.match(/^title:\s*"?([^"\n]+)"?/m)?.[1]?.trim() || "";
  const scopeMatch = fm.match(/^scope:\s*(\w+)/m)?.[1]?.toLowerCase();
  const enabledMatch = fm.match(/^enabled:\s*(true|false)/m)?.[1];
  return {
    title,
    scope: scopeMatch === "neighbor" ? "neighbor" : "all",
    enabled: enabledMatch !== "false",
    source: fm.match(/^source:\s*(.+)/m)?.[1]?.trim(),
  };
}

/** Get active SOP files (deployed + toggled on in the tree UI) */
export function getActiveSopFiles(): SopFile[] {
  return SOP_FILES.filter((f) => f.active);
}

/** Get active SOPs filtered by scope, with parsed frontmatter */
export function getSopsByScope(scope: "all" | "neighbor"): Array<SopFile & { frontmatter: SopFrontmatter }> {
  return getActiveSopFiles()
    .map((f) => ({ ...f, frontmatter: parseSopFrontmatter(f.content) }))
    .filter((f) => f.frontmatter.enabled && f.frontmatter.scope === scope);
}

/** Render scope-"all" SOPs as markdown for the system prompt */
export function renderAllChatsSops(): string {
  const sops = getSopsByScope("all");
  if (sops.length === 0) return "";
  return sops
    .map(
      (s, i) =>
        `### SOP ${i + 1}: ${(s.frontmatter.title || s.path).slice(0, 120)}\n` +
        `*Source: ${s.path}*\n\n` +
        s.content
          .replace(/^---[\s\S]*?---\n?/, "") // strip frontmatter from the prompt
          .slice(0, 2000), // per-SOP budget in the prompt
    )
    .join("\n\n");
}

/** Render scope-"neighbor" SOPs as markdown for B2B conversations */
export function renderNeighborSops(): string {
  const sops = getSopsByScope("neighbor");
  if (sops.length === 0) return "";
  return sops
    .map(
      (s, i) =>
        `### SOP ${i + 1}: ${(s.frontmatter.title || s.path).slice(0, 120)}\n` +
        `*Source: ${s.path}*\n\n` +
        s.content
          .replace(/^---[\s\S]*?---\n?/, "")
          .slice(0, 2000),
    )
    .join("\n\n");
}

/** Total deployed content size (for UI budget display) */
export function getSopContentBytes(): number {
  return SOP_FILES.reduce((sum, f) => sum + f.size, 0);
}
