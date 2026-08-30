-- 016_realtime_publication.sql
-- Realtime publication membership — self-healing, re-runs on every provision
-- and migration (Provision and Push / Full Migration both apply all files here).
--
-- Why a separate file: 004_realtime.sql uses plain ALTER PUBLICATION lines,
-- which fail as "already member" on re-runs and can be swallowed by the
-- provisioner's duplicate tolerance — observed 2026-08-30 when a freshly
-- provisioned project ended up with an EMPTY supabase_realtime publication
-- and the Conversations screen got no live messages.
--
-- This block is fully idempotent AND no-ops safely on databases without the
-- publication (the local embedded Postgres) so local starts stay clean.

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tasks') then
      alter publication supabase_realtime add table tasks;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'task_messages') then
      alter publication supabase_realtime add table task_messages;
    end if;
  end if;
end $$;
