-- 📣 Live-Ticker: Mitteilungen eines Turniers (Highscores, Serien, Gegner-Ereignisse …)
-- Additiv: neue Tabelle, bestehende Tabellen bleiben unverändert.
-- Geschrieben vom Admin-Tablet (über die App, Service-Role), gelesen von TV/Admin/Handy.

create table if not exists public.tournament_feed (
  id bigserial primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  -- eindeutige Kennung des Ereignisses → dieselbe Meldung wird nie doppelt eingetragen
  event_key text not null,
  -- Art der Mitteilung (z. B. record, month, streakBroken …) – passt zu "Meldungen & Sounds"
  kind text not null,
  icon text,
  title text,
  body text,
  created_at timestamptz not null default now(),
  unique (tournament_id, event_key)
);

create index if not exists tournament_feed_tournament_created_idx
  on public.tournament_feed (tournament_id, created_at desc);

-- Zugriff nur über die App (Service-Role); keine direkten Zugriffe mit dem öffentlichen Schlüssel
alter table public.tournament_feed enable row level security;
