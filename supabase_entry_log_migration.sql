-- Verlauf "wer hat Score/Platz gespeichert" pro Spieler und Match (Handy-Eingabe / Admin).
-- Nur eine neue, leere Spalte – bestehende Daten bleiben unverändert, alte Turniere zeigen nichts an.
-- Inhalt: Liste der letzten (max. 10) Änderungen, z. B.
--   [{"at":"2026-11-13T14:32:00Z","by":"Flo - sportyflo","src":"phone","score":[null,55555],"pos":[null,1]}]

alter table public.match_players
  add column if not exists entry_log jsonb;
