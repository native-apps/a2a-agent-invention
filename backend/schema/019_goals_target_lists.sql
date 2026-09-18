-- Goals target lists (v1.2.346) — per-goal neighbor-list targeting.
-- Owners scope a goal to one or more of their published curated lists
-- (console tags → onchain named lists). The heartbeat then knocks only
-- members of those lists for that goal — irrelevant neighbors stop getting
-- asked. Empty target_lists = current behavior (all approved targets).
-- Idempotent: checks information_schema before altering (re-provisions safe).
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'goals' and column_name = 'target_lists'
  ) then
    alter table goals add column target_lists text not null default '';
    -- comma-separated published list slugs, e.g. 'devtools,top-agents'
  end if;
end $$;
