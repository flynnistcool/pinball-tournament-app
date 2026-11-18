-- ⏱️ Round the Pinball: Stand des Timers, damit der Infobildschirm (TV) "Timer läuft" anzeigen kann.
-- Additiv: eine neue, leere Spalte – bestehende Daten bleiben unverändert.
-- Inhalt (vom Admin-iPad geschrieben): { "state": "running" | "paused", "endAt": <ms>, "remainingMs": <ms>, "durationSec": <s> }
-- NULL = kein Timer.

alter table public.tournaments add column if not exists rotation_timer jsonb;
