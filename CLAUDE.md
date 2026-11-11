# CLAUDE.md – Pinball-Turnier-App

Turnierverwaltung für Flipper-Turniere (iPad-optimierte PWA). Sprache der UI und Kommunikation: **Deutsch**.

## Stack
Next.js 14 (App Router) · React 18 · TypeScript (strict, aber viele Dateien `@ts-nocheck`) · Tailwind 3 · Supabase (Postgres, Auth, Storage `avatars`) · recharts · @dnd-kit · qrcode · Google Vision REST (OCR) · Hosting: Vercel (Push auf `main` = Deploy) · Repo: GitHub.

## Befehle
- `npm run dev` – lokal auf http://localhost:3000 (Achtung: `.env.local` zeigt i. d. R. auf die **Produktions-DB**)
- `npx tsc --noEmit --incremental false` – Typprüfung (Pflicht nach jeder Änderung)
- `npm run build` – Build-Gate vor jedem Push
- Keine Tests vorhanden; ESLint nicht konfiguriert.

## Env-Variablen (Werte nie lesen/ausgeben)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (nur Server), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_CLOUD_VISION_API_KEY`, `LIVE_ELO_ENABLED` (Altcode).

## Architektur
- Client-Komponenten rufen `fetch('/api/...')`; Route-Handler nutzen `supabaseAdmin()` aus `lib/supabaseServer.ts` (Service-Role → **RLS greift nicht**, Autorisierung liegt allein bei `middleware.ts`).
- `middleware.ts`: öffentlich sind `/`, `/login`, `/public`, `/p`, `/s`, `/api/public`, `/api/health`, `/api/ocr`; alles andere braucht eine Supabase-Session.
- Kein Realtime – Polling (Dashboard 16 s, Stats 8 s).
- Hauptdateien:
  - `app/t/page.tsx` (~13k Zeilen): `AdminHome` (Tabs) → `Dashboard` (Live-Turnier) → `RoundMatchesCard` (Score-Eingabe, OCR, Startreihenfolge), `LeaderboardsTab`, Timer/Overlays, Speech/Announcer.
  - `app/t/PlayersTab.tsx` (Profile, Statistiken, Single Play), `app/t/LocationsTab.tsx` (Locations, Maschinen, Tasks).
  - Öffentlich: `app/s/[code]` (Turnier), `app/p/[id]` (Profil), `app/public` (Übersicht).
  - Logik: `app/api/rounds/create/route.ts` (Paarungen aller Formate), `app/api/match_players/set-score|set-position` (Ergebnis, Match-/Rundenabschluss, Elimination), `app/api/tournaments/recalc-elo` (Elo-Engine), `app/api/tournaments/finish` (tournament_results), `lib/finals.ts` + `app/api/finals/*` (Super-Finale).
- Formate: matchplay, timeplay, swiss, round_robin, dyp_round_robin, elimination, rotation.

## Datenbank
- Tabellen: tournaments, players, machines, rounds, matches, match_players, profiles, locations, location_machines, machine_tasks, tournament_ratings (Elo-Snapshot vor Turnier), tournament_results, finales, final_players, final_games, filter_presets, profile_links, single_play_runs, single_play_ball_events.
- **Die `supabase_*.sql`-Dateien im Root sind veraltet** – das Live-Schema hat mehr Tabellen/Spalten. Vor Schema-Annahmen nachfragen bzw. Live-Schema prüfen.
- Schemaänderungen: als neue SQL-Datei im Repo ablegen, **nie selbst ausführen** – der Nutzer führt sie im Supabase SQL-Editor aus. Nur additive, rückwärtskompatible Änderungen (Spalten mit Default/NULL), da die laufende Produktion dieselbe DB nutzt.

## Bekannte Fallstricke (nicht „nebenbei“ ändern – erst besprechen)
- Punkteberechnung ist an mehreren Stellen unterschiedlich implementiert (stats, finish, rounds/create, standings, finals/start, season). Bei Änderungen alle Stellen prüfen.
- Elo existiert in `recalc-elo` (maßgeblich), `matches/submit` (Altcode) und `finals/add-game` (+8). `recalc-elo` überschreibt Ratings absolut.
- Task-Felder an `matches`: `task_text` (rounds/create, load) vs. `task_title/description/difficulty` (set-machine).
- Match-Status: `open`/`finished` (set-score schreibt teils `complete`).
- Keine Transaktionen, keine Pagination (Supabase-Limit 1000 Zeilen).
- `/t/<code>` leitet auf `/t` um; die öffentliche Turnierseite ist `/s/<code>`.
- Tote Dateien (nicht bearbeiten, nicht als Vorlage nutzen): `app/t/test*.tsx`, `pageon.tsx`, `page - *.tsx`, `page copy.tsx`, `page_Sicherung.tsx`, `*Kopie*`, `route - *.ts`, `lib/logic.ts`, `components/{RoundMatches,RoutePill,HeaderLogout,DrainPieChart,test}.tsx`, `app/settings/*`, `public/page.tsx`.

## Arbeitsregeln für Claude
- Vor jeder Dateiänderung, Paketinstallation, DB-Änderung, Commit oder Push um Erlaubnis fragen. Keine `.env*`-Inhalte lesen.
- Änderungen klein und lokal halten; bestehendes Verhalten nicht verändern, außer es ist ausdrücklich gewünscht.
- Vor Änderungen an einer API-Route alle Aufrufer suchen (`grep "/api/<pfad>"` in `app/`), vor Änderungen an DB-Spalten alle `.from("<tabelle>")`-Stellen.
- Neue Logik möglichst als reine Funktionen in `lib/` (testbar), neue UI als eigene Komponente statt weiterer Code in `page.tsx`.
- Neue Dateien ohne `@ts-nocheck`; API-Antworten einheitlich `{ ok: true, ... }` / `{ ok: false, error }` mit passendem HTTP-Status.
- Nach jeder Änderung: `npx tsc --noEmit --incremental false`; bei größeren Änderungen `npm run build` und Hinweis auf manuelle Testschritte.
- Git: Feature-Branch, aussagekräftige Commit-Messages (nicht „page“), nie direkt auf `main` pushen ohne Zustimmung.
