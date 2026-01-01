-- Simple Elo rating for reusable profiles
-- Run after supabase_profiles_migration.sql

alter table profiles
  add column if not exists rating numeric not null default 1500;

create index if not exists idx_profiles_rating on profiles(rating);
