-- Optional: Swiss MVP standings (points = sum of (N - position) per match in swiss/matchplay/rr)
-- This is very simple and can be improved later with proper point schema + tiebreakers.

create or replace function swiss_standings_mvp(tournament_uuid uuid)
returns table(player_id uuid, points int)
language sql
as $$
  with mp as (
    select mp.player_id, r.format, mp.position
    from match_players mp
    join matches m on m.id = mp.match_id
    join rounds r on r.id = m.round_id
    where r.tournament_id = tournament_uuid
      and mp.position is not null
  )
  select player_id, sum(case when position is null then 0 else (5 - position) end)::int as points
  from mp
  group by player_id
  order by points desc;
$$;
