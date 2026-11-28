-- ⏱️ Spielzeit je Flipper bei Round the Pinball (auch Arcade mit RtP-Spielweise)
-- Neue Spalte tournaments.play_minutes: mit wie vielen Minuten je Flipper gespielt wurde.
-- Wichtig für Ø, Bilanz und alle Bot-Rechnungen (5-Minuten-Scores sind nicht mit 10-Minuten-Scores vergleichbar).
--
-- Bisherige Round-the-Pinball-Turniere wurden laut Nutzer immer mit 10 Minuten gespielt → werden auf 10 gesetzt.
-- Andere Formate bleiben leer (NULL = keine Spielzeit).
-- Nur additiv: neue Spalte + einmaliges Befüllen alter RtP-Turniere. Kann gefahrlos mehrfach ausgeführt werden.

alter table public.tournaments
  add column if not exists play_minutes integer;

-- alte RtP-Turniere: 10 Minuten (nur dort, wo noch nichts eingetragen ist)
update public.tournaments
set play_minutes = 10
where format = 'rotation'
  and play_minutes is null;

-- Kontrolle (sollte nur 10 zeigen):
-- select play_minutes, count(*) from public.tournaments where format = 'rotation' group by play_minutes;
