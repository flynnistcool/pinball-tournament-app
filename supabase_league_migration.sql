-- League / category support
-- Run after supabase_schema.sql (and after supabase_profiles_migration.sql if you use profiles)

alter table tournaments
  add column if not exists category text not null default 'normal',
  add column if not exists season_year int;

create index if not exists idx_tournaments_category on tournaments(category);
create index if not exists idx_tournaments_season_year on tournaments(season_year);
