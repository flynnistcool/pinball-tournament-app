-- 🕹️ Arcade-Modus (Schritt 1): ein Arcade-Lauf ist ein normales Turnier mit diesen Zusatzangaben.
-- Nur NEUE Spalten, alle leer (NULL) – bestehende Turniere/Profile bleiben unverändert.
-- Kann gefahrlos mehrfach ausgeführt werden.

alter table public.tournaments
  -- Modus des Arcade-Laufs: 'easy' | 'normal' | 'hard' | 'expert' | 'insane' | 'classic_rush' | …  (NULL = normales Turnier)
  add column if not exists arcade_mode text,
  -- Leben zu Beginn des Laufs
  add column if not exists arcade_lives integer,
  -- Gegner in Reihenfolge (Profil-IDs der Bots), beim Start festgehalten
  add column if not exists arcade_stages jsonb,
  -- der Spieler, der den Lauf spielt
  add column if not exists arcade_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_tournaments_arcade_mode on public.tournaments(arcade_mode) where arcade_mode is not null;

alter table public.profiles
  -- 🕹️ automatisch für den Arcade-Modus angelegter Bot (z. B. 'pro:1600'); NULL = normal angelegt
  add column if not exists arcade_key text;

create unique index if not exists idx_profiles_arcade_key on public.profiles(arcade_key) where arcade_key is not null;

-- Kontrolle:
-- select column_name from information_schema.columns where table_name = 'tournaments' and column_name like 'arcade%';
