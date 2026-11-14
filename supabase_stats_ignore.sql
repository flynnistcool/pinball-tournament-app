-- 🚫 Platzhalter-Profile und einzelne falsche Scores für Statistiken/KI-Bots ignorieren
-- Nur NEUE Spalten mit Standard "aus" – bestehende Daten bleiben unverändert:
--   * Turnierergebnisse, Plätze, Turnierpunkte bleiben wie sie sind
--   * es wird nur markiert, was Bots (und später Statistiken) NICHT als Grundlage nehmen sollen
-- Kann gefahrlos mehrfach ausgeführt werden (if not exists).

-- Profil ist ein Platzhalter/Testprofil (z. B. test1, Ghost)
alter table public.profiles
  add column if not exists exclude_from_stats boolean not null default false;

-- einzelner Score ist falsch (z. B. Flipper defekt, Ersatzwert eingetragen)
alter table public.match_players
  add column if not exists stats_ignored boolean not null default false;
