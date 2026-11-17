-- 📡 Live-Ticker über den Server: Merkzettel je Turnier (Fingerabdruck + noch nicht stabile Meldungen)
-- Additiv: neue Tabelle, bestehende Tabellen bleiben unverändert. Wird vom Server (Service-Role) geschrieben.
-- Ohne diese Tabelle läuft der Server-Ticker trotzdem – dann nur ohne 10-s-Tippfehler-Schutz.

create table if not exists public.tournament_feed_state (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  -- Fingerabdruck des zuletzt nachgerechneten Stands (gleich + nichts offen → nichts zu tun)
  fingerprint text,
  -- Meldungen, die erst nach 10 s unverändertem Stand eingetragen werden: { key: { sig, since } }
  pending jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Zugriff nur über die App (Service-Role)
alter table public.tournament_feed_state enable row level security;
