-- 🤖 KI-Bots + 🎱 Extraball-Schalter (Plan: KI-Bots, Schritt 1)
-- Nur NEUE Spalten mit Standardwerten – bestehende Daten bleiben unverändert:
--   * alle bisherigen Profile gelten als "kein Bot"
--   * alle bisherigen Turniere gelten als "ohne Extraball"
-- Kann gefahrlos mehrfach ausgeführt werden (if not exists).

-- Profile: Bot-Kennzeichnung
alter table public.profiles
  -- true = KI-Bot (feste Elo bzw. Rivale), false = echter Spieler
  add column if not exists is_bot boolean not null default false,
  -- 'fixed' = feste Elo (Schwierigkeitsstufe), 'rival' = Rivalen-Bot, der mit einem Spieler mitwächst
  add column if not exists bot_kind text check (bot_kind is null or bot_kind in ('fixed', 'rival')),
  -- Rivalen-Bot: zu welchem Spieler (Profil) er gehört
  add column if not exists bot_owner_profile_id uuid references public.profiles(id) on delete set null,
  -- Rivalen-Bot: aktuelle Spielstärke (keine echte Elo), z. B. 1640
  add column if not exists bot_strength numeric;

create index if not exists idx_profiles_is_bot on public.profiles(is_bot) where is_bot;
create index if not exists idx_profiles_bot_owner on public.profiles(bot_owner_profile_id) where bot_owner_profile_id is not null;

-- Turniere: mit Extraball gespielt? (Standard: nein)
alter table public.tournaments
  add column if not exists extraball boolean not null default false;
