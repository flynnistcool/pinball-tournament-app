-- Add reusable player profiles (name + avatar) across tournaments.
-- Run after supabase_schema.sql

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table players
  add column if not exists profile_id uuid references profiles(id) on delete set null;

create index if not exists idx_players_profile_id on players(profile_id);

-- NOTE on avatars:
-- Create a Supabase Storage bucket named "avatars" and make it PUBLIC.
-- Upload path: avatars/<profile_id>.<ext>
