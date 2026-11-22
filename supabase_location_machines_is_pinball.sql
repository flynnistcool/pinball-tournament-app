-- 🎱 Ist das Gerät einer Location ein Flipper? (Arcade, Kicker & Co. = false)
-- Nicht-Flipper kommen nur in DYP-Turniere; Matchplay, Round the Pinball, Swiss usw. und Single Play
-- bekommen nur Flipper. Standard true = alle bisherigen Geräte bleiben Flipper.
-- Im Supabase SQL-Editor ausführen.

alter table location_machines add column if not exists is_pinball boolean not null default true;
