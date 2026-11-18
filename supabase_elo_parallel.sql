-- 🏦 Elo-Buchungsprinzip: mehrere Turniere gleichzeitig, ohne dass sich die Elo-Werte überschreiben.
-- Rechnung + Prüfskript: lib/eloLedger.ts, scripts/elo-ledger-check.mjs
--
-- Was diese Datei macht (alles additiv – bestehende Daten werden nicht verändert, außer Punkt 4):
--   1) Sicherungskopie aller Elo-Werte (eigene Tabelle, nur lesbar für den Server)
--   2) tournament_ratings: 3 neue Spalten "schon gebucht" (bestehende Zeilen bleiben leer = Altbestand,
--      neue Zeilen starten bei 0)
--   3) Buchungsfunktionen elo_book / elo_unbook (rechnen in EINEM Schritt mit Sperre; nur für den Server aufrufbar)
--   4) Startwert für das laufende Turnier U9PTKV ("MF"): schon gebucht = Profil − Foto
--      (stimmt, weil MF bisher das einzige laufende Turnier war)
--
-- Der bisherige App-Code arbeitet danach unverändert weiter (er kennt die neuen Spalten nicht).
-- Bitte zwischen dem Ausführen dieser Datei und dem Upload der Code-Umstellung keine Runde in MF abschließen.
-- Die Datei kann gefahrlos mehrfach ausgeführt werden.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Sicherungskopie
create table if not exists public.elo_backup_2026_11_18 as
select id, name, rating, matches_played, provisional_matches, now() as saved_at
from public.profiles;

alter table public.elo_backup_2026_11_18 enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Neue Spalten: erst ohne Standardwert anlegen (bestehende Zeilen = NULL = Altbestand),
--    dann Standardwert 0 nur für künftig neu angelegte Zeilen
alter table public.tournament_ratings add column if not exists applied_rating double precision;
alter table public.tournament_ratings add column if not exists applied_matches integer;
alter table public.tournament_ratings add column if not exists applied_provisional integer;

alter table public.tournament_ratings alter column applied_rating set default 0;
alter table public.tournament_ratings alter column applied_matches set default 0;
alter table public.tournament_ratings alter column applied_provisional set default 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a) Buchen: Endstand aus dem Nachspielen eines Turniers → nur der Unterschied kommt ins Profil
--     Rückgabe: 'booked' | 'legacy' (Altbestand, einmal absolut gesetzt) | 'no_snapshot'
create or replace function public.elo_book(
  p_tournament_id public.tournament_ratings.tournament_id%type,
  p_profile_id public.tournament_ratings.profile_id%type,
  p_rating_end double precision,
  p_matches_end integer,
  p_provisional_end integer
) returns text
language plpgsql
as $$
declare
  tr record;
  r_before double precision;
  m_before integer;
  p_before integer;
begin
  -- Foto + "schon gebucht" dieses Turniers sperren
  select rating_before, matches_before, provisional_before, applied_rating, applied_matches, applied_provisional
    into tr
    from public.tournament_ratings
   where tournament_id = p_tournament_id and profile_id = p_profile_id
   for update;
  if not found then
    return 'no_snapshot';
  end if;

  -- Profil sperren: rechnet ein anderes Turnier gerade für denselben Spieler, wartet es hier kurz
  perform 1 from public.profiles where id = p_profile_id for update;

  r_before := tr.rating_before;
  m_before := coalesce(tr.matches_before, 0);
  p_before := coalesce(tr.provisional_before, 0);

  if tr.applied_rating is null then
    -- Altbestand (vor der Umstellung): wie bisher absolut setzen – nur dieses eine Mal
    update public.profiles
       set rating = p_rating_end,
           matches_played = p_matches_end,
           provisional_matches = p_provisional_end
     where id = p_profile_id;
  else
    -- Buchungsprinzip: Profil += (neues Ergebnis − schon gebucht)
    update public.profiles
       set rating = rating + ((p_rating_end - r_before) - tr.applied_rating),
           matches_played = matches_played + ((p_matches_end - m_before) - coalesce(tr.applied_matches, 0)),
           provisional_matches = provisional_matches + ((p_provisional_end - p_before) - coalesce(tr.applied_provisional, 0))
     where id = p_profile_id;
  end if;

  -- jetzt gebucht = neues Ergebnis
  update public.tournament_ratings
     set applied_rating = p_rating_end - r_before,
         applied_matches = p_matches_end - m_before,
         applied_provisional = p_provisional_end - p_before
   where tournament_id = p_tournament_id and profile_id = p_profile_id;

  return case when tr.applied_rating is null then 'legacy' else 'booked' end;
end;
$$;

-- 3b) Zurückbuchen (laufendes Turnier wird gelöscht): eigenen Anteil vom Profil abziehen
--     Rückgabe: 'unbooked' | 'legacy' (Altbestand → wie bisher aufs Foto zurück) | 'no_snapshot'
create or replace function public.elo_unbook(
  p_tournament_id public.tournament_ratings.tournament_id%type,
  p_profile_id public.tournament_ratings.profile_id%type
) returns text
language plpgsql
as $$
declare
  tr record;
begin
  select rating_before, matches_before, provisional_before, applied_rating, applied_matches, applied_provisional
    into tr
    from public.tournament_ratings
   where tournament_id = p_tournament_id and profile_id = p_profile_id
   for update;
  if not found then
    return 'no_snapshot';
  end if;

  perform 1 from public.profiles where id = p_profile_id for update;

  if tr.applied_rating is null then
    update public.profiles
       set rating = tr.rating_before,
           matches_played = coalesce(tr.matches_before, matches_played),
           provisional_matches = coalesce(tr.provisional_before, provisional_matches)
     where id = p_profile_id;
  else
    update public.profiles
       set rating = rating - tr.applied_rating,
           matches_played = matches_played - coalesce(tr.applied_matches, 0),
           provisional_matches = provisional_matches - coalesce(tr.applied_provisional, 0)
     where id = p_profile_id;
  end if;

  update public.tournament_ratings
     set applied_rating = 0, applied_matches = 0, applied_provisional = 0
   where tournament_id = p_tournament_id and profile_id = p_profile_id;

  return case when tr.applied_rating is null then 'legacy' else 'unbooked' end;
end;
$$;

-- 🔐 Nur der Server (Service-Role) darf buchen – nicht über die öffentliche Supabase-Schnittstelle
revoke all on function public.elo_book from public, anon, authenticated;
revoke all on function public.elo_unbook from public, anon, authenticated;
grant execute on function public.elo_book to service_role;
grant execute on function public.elo_unbook to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Startwert für das laufende Turnier U9PTKV ("MF"): schon gebucht = Profil − Foto
--    (nur Zeilen, die noch leer sind → mehrfaches Ausführen ändert nichts mehr)
update public.tournament_ratings tr
   set applied_rating = p.rating - tr.rating_before,
       applied_matches = coalesce(p.matches_played, 0) - coalesce(tr.matches_before, 0),
       applied_provisional = coalesce(p.provisional_matches, 0) - coalesce(tr.provisional_before, 0)
  from public.profiles p, public.tournaments t
 where tr.profile_id = p.id
   and tr.tournament_id = t.id
   and t.code = 'U9PTKV'
   and t.status is distinct from 'finished'
   and tr.applied_rating is null
   and coalesce(p.is_bot, false) = false;

-- 🤖 Bots: deren Elo rechnet die App nie um → nichts gebucht
update public.tournament_ratings tr
   set applied_rating = 0, applied_matches = 0, applied_provisional = 0
  from public.profiles p, public.tournaments t
 where tr.profile_id = p.id
   and tr.tournament_id = t.id
   and t.code = 'U9PTKV'
   and tr.applied_rating is null
   and coalesce(p.is_bot, false) = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Kontrolle (nur lesen): so sieht MF nach der Umstellung aus
select p.name,
       tr.rating_before as foto,
       p.rating as profil_jetzt,
       tr.applied_rating as schon_gebucht,
       tr.applied_matches as spiele_gebucht,
       tr.applied_provisional as neuling_gebucht
  from public.tournament_ratings tr
  join public.profiles p on p.id = tr.profile_id
  join public.tournaments t on t.id = tr.tournament_id
 where t.code = 'U9PTKV'
 order by p.name;
