# MB-Coder Report — Invention Per-Project Config Seeding Bug

**From:** A2A Agent Invention coder
**To:** Mother Brain app coder
**Date:** 2026-08-07
**Status:** Open — needs MB app-side fix
**Severity:** HIGH (cross-project data leak + secret exposure)

---

## Summary

When a project enables an invention for the first time, Mother Brain creates the per-project config by **copying the invention's base config settings** — including anything another project left there. This caused the A2A Agent invention to show `the_mother_brain`'s agent ("Mother"), users, and **secrets** (CF API token, JWT secret, Telegram bot token, gateway tokens) inside the `anakimota` project's settings window.

## Files & Functions

All in `~/Native Apps Dev/mother-brain/Mother-Brain/lib/inventions-store.ts`:

### 1. `ensureProjectInventionDir()` (~line 740) — THE SEEDING BUG

```ts
// Initialize project config if it doesn't exist
if (!fs.existsSync(projConfigPath)) {
  const baseConfig = getInvention(inventionId);
  const projConfig: ProjectInventionConfig = {
    inventionId,
    projectId,
    settings: baseConfig?.settings ? { ...baseConfig.settings } : {},  // ← POLLUTED SEED
    ...
  };
```

**Problem:** A brand-new project's config is seeded from `baseConfig.settings`. The base config is the *global* invention config — it is not guaranteed to hold clean defaults. In practice it accumulates project-specific values (any save that doesn't carry a `projectId` writes there), so new projects inherit another project's identity, tokens, and secrets.

**Observed:** Enabling the A2A Agent for `anakimota` created `~/.mother-brain/inventions/a2a-agent/projects/anakimota/config.json` containing `the_mother_brain`'s full settings, including `cfApiToken`, `jwtSecret`, `telegramBotToken`, `gatewayToken`, `accessToken`, `botUserId` (Mother), `agentUrl` (`https://a2a.motherbrain.app`), etc.

**Fix request:** Seed from a *clean defaults* source instead of the live base config. Options:
- Use the invention template's `defaultSettings` (`BUILT_IN_TEMPLATES`), or
- Use an empty `{}` settings object and let the invention's settings component populate defaults on first load (the code comment even says "Start with empty settings — the invention's settings component will populate defaults on first load" — the implementation contradicts the comment).

### 2. `getInventionForProject()` (~line 833) — THE FALLBACK

```ts
// No project-specific config yet — return base
return { ...base, enabledForProject: ... };
```

**Problem:** When a project is enabled but has no per-project config, the merged settings fall back to `base.settings` — the same possibly-polluted global settings. This is what made the settings window for `anakimota` show `the_mother_brain` data even before the seeding bug created a config.

**Fix request:** When no per-project config exists, return the base config with **clean/default settings** (or an explicit `configured: false` flag) rather than raw `base.settings`, so a polluted base can never leak into another project.

### 3. `deepMergeSettings()` + `updateInvention()` (~line 215) — THE PERSISTENCE

```ts
// Existing value takes priority (including arrays, strings, numbers, booleans)
result[key] = existingVal;
```

**Problem:** Registry updates deep-merge with existing values taking priority. Once the base config is polluted, **no invention update can clean it** — the polluted values survive every tarball reinstall. (We cleaned the installed config manually as a one-off; there is no app-side path to reset invention settings.)

**Fix request (nice-to-have):** Consider an explicit "reset settings to defaults" action for inventions, or make `updateInvention` treat empty-string/empty-array values as resets for keys that are known project-scoped fields.

---

## Reproduction

1. Configure the A2A Agent invention in project A (e.g. `the_mother_brain`). Its settings land in the base config and/or project A's config.
2. In project B (e.g. `anakimota`), toggle the A2A Agent invention ON.
3. `setInventionEnabledForProject()` → `ensureProjectInventionDir()` creates `projects/anakimota/config.json` seeded from `baseConfig.settings`.
4. Open the invention settings in project B → shows project A's agent name, bot user, users, and secrets.

## Impact

- **Wrong-project data leak:** Settings window shows another project's agent identity, users, endpoint, and deploy state.
- **Secret exposure:** Another project's `cfApiToken`, `jwtSecret`, `telegramBotToken`, `gatewayToken`, `accessToken` copied into a project's config file on disk (and editable/savable from that project's settings UI).
- **Deploy risk:** A user in project B could hit Deploy and push project A's secrets/identity to project B's Worker.

## Invention-Side Mitigation (already applied in the A2A Agent v1.2.120 dev workspace)

While we wait for the MB-side fix, the A2A Agent invention now defends itself:
- `primaryProjectId` is **locked to the active project** (not user-changeable) — the field that previously let users point the invention at another project is now a read-only display.
- All identity lookups, users, health checks, DB actions, and deploys scope to the **active project** from `/api/active-project` — never to a stale `primaryProjectId` in config.
- Saves **refuse to write** when no project scope is resolved (no more base-config pollution from the settings UI).
- An identity-safety guard blanks a configured bot user that isn't a user of the active project.

## Requested Action

1. **`ensureProjectInventionDir()`**: seed new per-project configs from clean defaults (template `defaultSettings` or `{}`), not from live `baseConfig.settings`. **Required — this is the root cause.**
2. **`getInventionForProject()`**: when no per-project config exists, don't return raw polluted `base.settings` — return clean defaults or an explicit "unconfigured" signal.
3. (Nice-to-have) Provide an app-side way to reset an invention's settings to defaults.

---

## UPDATE (2026-08-07 evening) — URGENT: this wipes USER DATA on EVERY update

**Verified in BOTH the MB app source (`~/Native Apps Dev/mother-brain/Mother-Brain/lib/inventions-store.ts`) AND the production bundle (`server.bundle.cjs`): `installFromTarball()` deletes the ENTIRE invention directory on every update and ONLY preserves `config.json` — there is NO `projects/` preservation anywhere.**

This means every update **silently deletes**:
- `projects/{projectId}/config.json` — each project's A2A Agent settings
- `projects/{projectId}/pgdata` — each project's local Postgres database (chat data!)

**Impact (observed repeatedly 2026-08-07):** Updating the A2A Agent invention from v1.2.121 → v1.2.125 → v1.2.126 wiped `~/.mother-brain/inventions/a2a-agent/projects/` every single time, destroying `the_mother_brain` and `anakimota` per-project configs AND their pgdata databases. Data had to be restored from manual backups each time.

**Requested fix (BLOCKER):** In `installFromTarball()`, before the delete loop, move `projects/` to a temp location and restore it after the tarball copy. This is a ~5-line change:
```ts
// Before deleting the invention dir:
const projectsDir = path.join(targetDir, "projects");
const projectsBackup = path.join(tmpDir, "projects-preserved");
if (fs.existsSync(projectsDir)) {
  fs.renameSync(projectsDir, projectsBackup);
}
// ... delete + copy tarball ...
// After copying:
if (fs.existsSync(projectsBackup)) {
  fs.renameSync(projectsBackup, path.join(targetDir, "projects"));
}
```

**Interim mitigation (invention side, already shipped):** `scripts/protect-a2a-projects.sh` + a launchd agent (`com.nativeapps.a2a-project-protect`, every 2 min) that snapshots `projects/` and auto-restores if the update wipes it. This prevents data LOSS but is not a substitute for the real fix.
