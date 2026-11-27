-- 🔴 Gambler / 🟣 Pro (+ vorbereitet: 👑 Champion, 🟠 Specialist): weitere Bot-Arten erlauben
-- profiles.bot_kind durfte bisher 'fixed', 'rival', 'ghost', 'form' sein.
-- Neu zusätzlich:
--   'gambler'    = feste Elo, sehr breite Streuung (mal Pech, mal Wahnsinn)
--   'pro'        = feste Elo, sehr konstant
--   'champion'   = spielt wie die Besten (vorbereitet, noch nicht gebaut)
--   'specialist' = stark an Lieblingsflippern (vorbereitet, noch nicht gebaut)
--
-- Nur die Prüfregel wird erweitert – keine neue Spalte, keine Daten werden geändert.
-- Kann gefahrlos mehrfach ausgeführt werden.

do $$
declare
  c record;
begin
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
  check (
    bot_kind is null
    or bot_kind in ('fixed', 'rival', 'ghost', 'form', 'gambler', 'pro', 'champion', 'specialist')
  );

-- Kontrolle (sollte eine Zeile mit allen acht Arten zeigen):
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_bot_kind_check';
