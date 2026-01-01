-- Best-of support (match series)
-- Run after supabase_schema.sql

alter table tournaments
  add column if not exists best_of int not null default 1;

alter table matches
  add column if not exists series_id uuid,
  add column if not exists game_number int;

create index if not exists idx_matches_series_id on matches(series_id);
create index if not exists idx_tournaments_best_of on tournaments(best_of);
