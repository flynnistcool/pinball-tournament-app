-- Fixed match size per tournament (players per match)
-- Run after supabase_schema.sql

alter table tournaments
  add column if not exists match_size int not null default 4;

create index if not exists idx_tournaments_match_size on tournaments(match_size);
