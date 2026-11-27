-- 👻 Ghost-Bot + ⚡ Form-Bot (KI-Bots): neue Bot-Arten erlauben
-- profiles.bot_kind durfte bisher nur 'fixed' (feste Elo) oder 'rival' sein.
-- Neu zusätzlich:
--   'ghost' = spielt wie ein bestimmter Spieler (alle seine Scores am Flipper)
--   'form'  = folgt der aktuellen Form eines Spielers (seine letzten 2 Scores am Flipper)
-- Der Spieler, dem der Bot folgt, steht in der vorhandenen Spalte profiles.bot_owner_profile_id.
--
-- Nur die Prüfregel wird erweitert – keine neue Spalte, keine Daten werden geändert.
-- Bestehende Bots bleiben 'fixed'. Kann gefahrlos mehrfach ausgeführt werden.

do $$
declare
  c record;
begin
  -- alte Prüfregel(n) auf bot_kind entfernen (Name wurde automatisch vergeben)
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%bot_kind%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_bot_kind_check
  check (bot_kind is null or bot_kind in ('fixed', 'rival', 'ghost', 'form'));

-- Kontrolle (sollte eine Zeile mit allen vier Arten zeigen):
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_bot_kind_check';
