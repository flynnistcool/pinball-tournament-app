-- 📣 Live-Ticker, Ergänzung 2: beteiligte Spieler + Zusatzangaben je Eintrag
-- (für persönliche Einblendungen am Handy: "Dein 50. Matchsieg!", "Du hast den Highscore geknackt!" …)
-- Additiv: nur neue Spalten mit Standardwert, bestehende Einträge bleiben gültig.

alter table public.tournament_feed
  add column if not exists player_ids text[] not null default '{}';

alter table public.tournament_feed
  add column if not exists data jsonb;
