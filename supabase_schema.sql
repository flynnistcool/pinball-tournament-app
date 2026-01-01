-- Run this SQL in Supabase (SQL Editor) to create tables.
-- Minimal schema for MVP.

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  admin_pin_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create type match_format as enum ('matchplay', 'round_robin', 'swiss');

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  format match_format not null,
  number int not null,
  status text not null default 'open', -- open | running | closed
  created_at timestamptz not null default now(),
  unique(tournament_id, format, number)
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  machine_id uuid references machines(id),
  status text not null default 'open', -- open | running | finished
  created_at timestamptz not null default now()
);

create table if not exists match_players (
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  position int, -- 1..4 (or 1..2)
  primary key (match_id, player_id)
);

-- Helpful view: how often each player played each machine
create or replace view v_player_machine_counts as
select
  mp.player_id,
  m.machine_id,
  count(*)::int as played_count
from match_players mp
join matches m on m.id = mp.match_id
where m.machine_id is not null
group by mp.player_id, m.machine_id;
