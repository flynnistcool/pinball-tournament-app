-- 🏁 Wann wurde ein Turnier beendet? (für die Siegerliste am Flipper-Display: 10 Minuten nach dem Ende)
-- Wird von /api/tournaments/finish beim ERSTEN Beenden gesetzt. Additiv, darf leer sein.
-- Im Supabase SQL-Editor ausführen.

alter table tournaments add column if not exists finished_at timestamptz;
