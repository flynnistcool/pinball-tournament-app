-- Tournament status (open/finished)
-- Run after supabase_schema.sql

alter table tournaments
  add column if not exists status text not null default 'open';

create index if not exists idx_tournaments_status on tournaments(status);
