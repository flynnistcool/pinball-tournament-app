-- 🤖 KI-Bots: Rechenzettel (Plan: KI-Bots, Schritt 1)
-- Speichert zu jedem Bot-Score, WIE er berechnet wurde (Datenbasis, Elo-Nachbarn,
-- Bereich, Würfel …), damit der Admin das im ℹ️-Fenster nachlesen kann.
-- Nur eine NEUE, leere Spalte – bestehende Daten bleiben unverändert (bei Menschen immer leer).
-- Kann gefahrlos mehrfach ausgeführt werden (if not exists).

alter table public.match_players
  add column if not exists bot_calc jsonb;
