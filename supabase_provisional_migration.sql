-- Provisional rating support
-- Run after supabase_elo_migration.sql

alter table profiles
  add column if not exists provisional_matches int not null default 10,
  add column if not exists matches_played int not null default 0;

create index if not exists idx_profiles_provisional on profiles(provisional_matches, matches_played);
