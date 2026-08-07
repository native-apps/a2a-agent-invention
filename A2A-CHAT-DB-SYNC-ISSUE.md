# A2A Agent Chat DB — Supabase → Local Sync Broken

**Created:** 2026-08-04
**Author:** A2A Agent Coder (for review by Mother Brain App Coder)
**Status:** ⚠️ BROKEN — local chat database is not being populated from Supabase

---

## 1. The Problem

The A2A Agent Invention's **Chat Database** feature (Settings screen) is set to:

- **Database Provider:** `both` (Local + Remote Sync)
- **Supabase URL:** `https://bhzdihdwkandbzdunonu.supabase.co`
- **Supabase Service Key:** (set)
- **Sync local → Supabase:** `supabaseSyncEnabled: true`
- **Local Postgres:** shows `Running`

**Expected behavior:** The local chat database is created AND populated from the Supabase database, so the local Postgres data directory appears at:

```
~/.mother-brain/inventions/a2a-agent/projects/{project_id}/pgdata
```

**Actual behavior:** The local database exists and reports `running`, but it is **EMPTY**:

```
status action output:
{
  "dbRunning": true,
  "conversationCount": 0,
  "messageCount": 0
}
```

The `pgdata` directory at `~/.mother-brain/inventions/a2a-agent/projects/{project_id}/pgdata` does **not** exist.

This used to work. It stopped working at some point.

---

## 2. What the User Confirmed

- The A2A Agent Invention chat database belongs in the **invention's own data directory**:
  `~/.mother-brain/inventions/a2a-agent/projects/{project_id}/pgdata`
- The Supabase database it syncs to is `https://bhzdihdwkandbzdunonu.supabase.co` (the A2A chat DB).
- The `~/.mother-brain/projects/...` directory is the **Mother Brain project knowledge base** — completely separate, NOT the A2A chat DB. Ignore it for this issue.
- This feature worked ~2 months ago (June 2026). It used the existing Settings screen (NOT the new Wizard).

---

## 3. What the A2A Agent Coder Verified (invention repo only)

### Settings screen (`settings/A2aAgentSettings.tsx` — `renderDatabase()`, ~L1796-1919)
The "Chat Database" section is **intact** and matches the UI:
- Local Postgres status + **Start/Stop** button → calls `POST /api/inventions/a2a-agent/action/start-db` (or `stop-db`)
- Database Provider dropdown: `local-pg` / `supabase` / `both`
- Supabase URL + Service Key inputs
- "Sync local → Supabase" toggle → sets `supabaseSyncEnabled`

**No sync execution code exists in this section.** It only stores config and calls `start-db`/`stop-db`.

### Settings save flow (`saveToServer` / `handleExplicitSave`, ~L849-933)
Only PATCHes settings to the server + saves Supabase creds to localStorage. **No sync triggered on save.**

### Wizard (`settings/A2aWizard.tsx` — `handleStartDb`, ~L1094-1111)
Calls the same `start-db` action. **No sync.**

### `config.json` actions
```
['deploy', 'provision-db', 'start-db', 'stop-db', 'health-check', 'test-connection', 'status']
```
- `start-db`: type `embedded-pg-start`, collection `a2a_agent_chat`, schemaDir `backend/schema/`
- `status`: type `status`, counts `tasks` / `task_messages`
- **There is NO `sync` action.** The MB backend confirmed: `Action "sync" not declared by invention "a2a-agent"`

### Full git history (invention repo only)
- `supabaseSyncEnabled` — present since **initial commit** (June 10, 2026). Never removed.
- `dbProvider` — present since initial commit. Never removed.
- The 7 actions above — present since initial commit. Never removed.
- Searched every commit for sync/backfill/import/pull code (`syncToLocal`, `pullFromSupabase`, `importFromSupabase`, `backfillLocal`, `syncChat`, etc.) — **none ever existed in this repo.**

### What works
- `start-db` action runs successfully:
  ```
  {"status":"running","message":"a2a_agent_chat database started","migrations":"9/13 applied"}
  ```
- It creates the local DB and runs schema migrations from `backend/schema/*.sql` (13 files).
- `status` action works and reports the (empty) local DB.

---

## 4. Conclusion (A2A Agent Coder)

The sync execution code (moving rows between Supabase and the local embedded Postgres) is **NOT in the a2a-agent-invention codebase** — not in the current code, and not in any point of its git history. It lives in the **Mother Brain app backend** (`embedded-pg-start` action handler and/or a sync routine).

The A2A Agent Coder is **not permitted** to touch the Mother Brain app code. That's why this document is being written for the MB App Coder.

---

## 5. Questions for the MB App Coder

1. **Where does `embedded-pg-start` create the pgdata directory?** The invention expects it at:
   `~/.mother-brain/inventions/a2a-agent/projects/{project_id}/pgdata`
   Does the MB backend currently create it there, or somewhere else (e.g. keyed by collection name)?

2. **Does `embedded-pg-start` (or anything else in the MB backend) pull data from Supabase into the local embedded Postgres?** The invention's settings provide `supabaseUrl`, `supabaseServiceKey`, `dbProvider: "both"`, and `supabaseSyncEnabled: true`. Is there a code path in the MB app that reads `supabaseSyncEnabled` / `dbProvider` and performs the local ←→ Supabase sync?

3. **When did the sync stop working?** Was there a change to the MB app's `embedded-pg-start` handler or a sync routine that removed or broke the Supabase → local pull? (e.g., the R11 `installFromTarball` rmSync change, or a rewrite of the embedded PG layer.)

4. **What is the correct local pgdata path the MB app should use for an invention's chat DB?** Should it be under `inventions/a2a-agent/projects/{project_id}/pgdata`? If the MB app moved it, that's the regression.

5. **Is there an existing sync action/endpoint in the MB app** that the invention can call (or that should be wired to the `start-db` flow) to pull Supabase rows into local? If so, what's its contract?

6. **What does the MB app do with `database.collection: "a2a_agent_chat"`** from the invention's `config.json` when starting the DB? Does it use the collection name for the data directory, and if so, why isn't it under the invention's projects path?

7. **Can the MB App Coder restore the sync behavior** so that when `dbProvider: "both"` and `supabaseSyncEnabled: true`, the local chat DB at `~/.mother-brain/inventions/a2a-agent/projects/{project_id}/pgdata` is created AND populated from `https://bhzdihdwkandbzdunonu.supabase.co`?

---

## 6. Evidence Summary

| Check | Result |
|---|---|
| Settings UI (Chat Database section) | ✅ Intact — matches screenshot |
| `dbProvider: "both"` in saved settings | ✅ Set |
| `supabaseSyncEnabled: true` in saved settings | ✅ Set |
| `supabaseUrl` = bhzdihdwkandbzdunonu | ✅ Set |
| `start-db` action | ✅ Runs, migrations applied |
| `status` action (local DB) | ⚠️ Running but EMPTY (0/0) |
| Local pgdata at invention path | ❌ Missing |
| Sync code in invention repo (current + git history) | ❌ Never existed |
| `sync` action in invention config.json | ❌ Not declared |
