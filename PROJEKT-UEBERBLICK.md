# Projekt-Überblick – Pinball-Turnier-App

> Einstiegsdokument für einen neuen Claude-Chat. Stand: **2026-11-20 (spät)**, letzte Live-Deploys siehe Abschnitt 6.
> Ergänzt die `CLAUDE.md` (technische Regeln). Bei Widerspruch gilt: aktuelle Nutzer-Anweisung > CLAUDE.md > dieses Dokument.

---

## 1. Was die App macht und für wen

Turnierverwaltung für **Flipper-Turniere** einer kleinen Flipper-Community (u. a. „Fun-Flipper-Liga“). Bedient wird sie vor Ort:

| Gerät | Wer | Was |
|---|---|---|
| **iPad / Laptop (Admin)** – `/t` | Turnierleiter (Nutzer = einziger Admin) | Turnier anlegen, Spieler & Flipper wählen, Runden erzeugen, Plätze/Scores eintragen, Elo, Superfinale, Statistiken |
| **TV / Infobildschirm** – `/s/<CODE>/tv` | alle im Raum | Live-Tabelle, aktuelle Matches, Verlauf, Spielerkarten, Highscore-Jubel, Live-Ticker, Sounds |
| **Handy der Spieler** – `/s/<CODE>/spieler/<token>` (per QR) | Spieler | eigenes Match sehen, Platz/Score selbst eintragen, Turnier-Infos, persönliche Meldungen |
| **Öffentlich** – `/s/<CODE>`, `/p/<id>`, `/public` | ohne Login | Turnierseite, Spielerprofil, Übersicht |

Kernfunktionen: 7 Turnierformate, Elo-Rating (Mehrspieler als Einzelduelle), Turnierpunkte/Serie, Allzeit-/30-Tage-/persönliche Highscores je Flipper & Location, Live-Ticker mit vielen Meldungsarten („On fire“, Favoritensturz, Auf Messers Schneide …), Superfinale, KI-Bots, Single Play (Trainings-Läufe), OCR für Score-Fotos (Google Vision), dunkler Modus (nur `/t`).

---

## 2. Technik-Stack, Hosting, Deployment

- **Next.js 14.2 (App Router)**, React 18, TypeScript (strict, aber `app/t/page.tsx`, `PlayersTab.tsx` und viele Routen mit `@ts-nocheck`), Tailwind 3, recharts, @dnd-kit, qrcode.
- **Supabase**: Postgres + Auth + Storage-Bucket `avatars`. Region eu-west-1.
- **Vercel**: Push auf `main` = automatischer Deploy. Function Region **dub1** (Dublin, nah an Supabase – ca. 30 % schneller).
- **Kein Realtime** – Polling (Admin 16 s mit Countdown-Knopf, Handy 10 s, TV/Stats 8 s). Versteckter Admin-Tab pausiert das Polling.
- Lokal: `npm run dev` → http://localhost:3000. **`.env.local` zeigt auf die Produktions-DB!** Lokales Testen verändert echte Daten.
- Keine Tests, kein ESLint. `gh` CLI ist nicht installiert.
- Windows 11, Shell PowerShell / Git Bash.

### Ablauf Commit & Hochladen (wenn der Nutzer „hochladen“ sagt)
Gearbeitet wird auf einem Feature-Branch (aktuell **`fix/handy-lesbarkeit`**). Ablauf:

1. `npx tsc --noEmit --incremental false` muss fehlerfrei sein.
2. **Nur gewollte Dateien einzeln stagen** – nie `git add -A` (siehe Abschnitt 6 „nicht hochladen“).
3. Commit mit deutscher, aussagekräftiger Nachricht (Datei im Scratchpad, `git commit -F`), endet mit
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
4. **Build-Check in sauberer Kopie** (damit lokaler Datei-Müll den Build nicht verfälscht):
   ```powershell
   git worktree add <scratchpad>\wt-build <commit>
   New-Item -ItemType Junction -Path <wt>\node_modules -Target C:\pinball\pinball-tournament-app2\node_modules
   # Platzhalter-Env setzen: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
   npm run build
   (Get-Item <wt>\node_modules).Delete()   # Junction entfernen, NICHT rekursiv löschen!
   git worktree remove --force <wt>
   ```
   (`cmd /c mklink` hat nicht funktioniert → PowerShell-Junction.)
5. `git checkout main` → `git merge --ff-only fix/handy-lesbarkeit` → `git push origin main fix/handy-lesbarkeit` → zurück auf den Branch.
6. Dem Nutzer kurz auf Deutsch auflisten, was online geht.

### Datenbank-Änderungen
Nie selbst ausführen. SQL als neue Datei `supabase_<thema>.sql` ins Repo legen, der Nutzer führt sie im Supabase SQL-Editor aus. Nur additive Änderungen (neue Spalten mit Default/NULL), weil die laufende Produktion dieselbe DB nutzt.

---

## 3. Aufbau

### Seiten
| Pfad | Datei | Inhalt |
|---|---|---|
| `/t` | `app/t/page.tsx` (~13k+ Zeilen, Monolith) | `AdminHome` (Tabs Start/Erstellen/Archiv/Locations/Spieler/Statistik/Admin) → `Dashboard` (Live-Turnier) → `RoundMatchesCard` (Score-Eingabe, OCR, Startreihenfolge), `LeaderboardsTab`, Timer, Sprachansagen |
| | `app/t/PlayersTab.tsx` | Profile, Statistik, Elo-Verlauf, Head-to-Head, Single Play |
| | `app/t/LocationsTab.tsx` | Locations, Flipper, Machine-Tasks |
| `/t/<code>` | leitet auf `/t` um (öffentlich ist `/s/<code>`) | |
| `/s/[code]` | öffentliche Turnierseite | |
| `/s/[code]/tv` | Infobildschirm (dunkler Arcade-Look, Auto-Tabs) | |
| `/s/[code]/spieler/[token]` | Handy-Ansicht, `components/PlayerPhone.tsx`; Token = HMAC (`lib/playerLink.ts`) | |
| `/p/[id]`, `/public` | öffentliches Profil, Übersicht (Übersicht/Season teils kaputt, s. u.) | |
| `/login`, `/register`, `/wartet` | Login / Registrierung / Warteseite | |

**Neue UI immer als eigene Komponente in `components/`**, nicht noch mehr Code in `page.tsx`. Neue Logik als reine Funktionen in `lib/`.

### API-Routen (`app/api/…`, ~130 Stück)
- **Turnier**: `tournaments/{create,load,list,delete,finish,recalc-elo,update-meta,categories,highscores,rotation-timer,set-speech-round,superfinal-elo}`
- **Runden/Matches**: `rounds/create` (Paarungen aller Formate, ~1,3k Zeilen; 409 wenn schon eine offene Runde existiert), `rounds/{current,set-elo}`, `match_players/{set-score,set-position,set-time,set-start-order,set-stats-ignored,entry-log}`, `matches/{set-machine,set-random-task}` (`matches/submit|result` = Altcode)
- **Finale**: `finals/{start,add-game,state}` + `lib/finals.ts`
- **Spieler/Profile**: `players/*`, `profiles/*`, `profile-links`, `avatars/upload`
- **Statistik**: `leaderboards/*`, `stats`, `standings`, `winrates/machine-location`, `locations/machine-stats`, `export/*.csv`
- **Live-Ticker**: `feed/add`, `feed/hide` (Admin), `public/feed` (GET), `public/feed/sync` (Server-Ticker rechnet Meldungen nach)
- **Öffentlich/Handy** (ohne Login): `public/*` (u. a. `tournament`, `me`, `me/save`, `machine-records`, `player-cards`, `player-wins`, `rivalry`, `series`)
- **Bots**: `bots/{calc,lab,roll,settings}`; **Admin**: `admin/users*`; **Single Play**: `single-play/*`; `ocr`, `health`, `home/summary`, Sound-/Meldungs-Einstellungen

Alle Routen nutzen `supabaseAdmin()` (Service-Role → **RLS greift nicht**). Autorisierung nur in `middleware.ts` + `lib/authRoles.ts`.
Antwortformat neu: `{ ok: true, ... }` / `{ ok: false, error }` mit HTTP-Status.
**Neue GET-Routen mit DB-Zugriff** brauchen `export const dynamic = "force-dynamic"; export const revalidate = 0; export const fetchCache = "force-no-store";` – sonst liefert Next alte Daten aus dem Fetch-Cache.

### Wichtige `lib/`-Dateien
`points.ts` (Turnierpunkte – **nicht anfassen**), `pointsDisplay.ts`, `eloCalc.ts` / `eloBooking.ts` / `eloLedger.ts` (Elo), `winStreaks.ts` (On fire), `flawless.ts` (Unbesiegt), `closeMatch.ts` (Auf Messers Schneide), `favorite.ts` (Gewinnchancen), `rotationTurn.ts` / `rotationPlan.ts` (Round the Pinball), `notifications.ts` (Katalog aller Meldungen: Geräte, Dauer, Sound, Badge/Scope), `tickerOrder.ts` (Ticker-Sortierung), `feed.ts` / `feedReplay.ts` (Ticker-Einträge), `scoreNudge*.ts` (Lob fürs Score-Eintragen), `supabaseChunks.ts` (`fetchAllIn` gegen das 1000-Zeilen-Limit), `authRoles.ts`, `playerLink.ts`, `bot*.ts`.

---

## 4. Supabase-Datenbank

> ⚠️ Die `supabase_*.sql`-Dateien im Root sind **nicht vollständig** und teils veraltet. Maßgeblich ist das Live-Schema. Bei Unsicherheit beim Nutzer nachfragen bzw. Fehler sichtbar machen statt verschlucken. Die folgende Liste stammt aus den Abfragen im Code.

### Kerntabellen
| Tabelle | Wichtige Felder | Bemerkung |
|---|---|---|
| **tournaments** | `id, code` (6 Zeichen, z. B. U9PTKV), `name, category, format, match_size, location_id, status` (open/finished), `created_at, speech_lang, speech_round_enabled, rotation_timer` (jsonb), `extraball` (bool) | **`season_year` und `best_of` existieren live NICHT** – nie selektieren |
| **profiles** | `id, name, rating` (Elo, Start 1500), `provisional_matches` (neu 10), `matches_played, icon, color, avatar_url, exclude_from_stats, is_bot, bot_kind, bot_owner_profile_id, bot_strength, created_at` | Die dauerhafte Person/der Spieler |
| **players** | `id, tournament_id, profile_id, name, active` | Teilnahme eines Profils an einem Turnier |
| **machines** | `id, tournament_id, name, icon_emoji, active, created_at` | Flipper **im Turnier** (pro Turnier kopiert) |
| **locations** | `id, name` | Spielorte |
| **location_machines** | `location_id, name, icon_emoji, …` | Flipper-Bestand einer Location |
| **machine_tasks** | `id, title, description, difficulty, …` | Aufgaben (Timeplay) |
| **rounds** | `id, tournament_id, number, format, status, elo_enabled` | |
| **matches** | `id, round_id, machine_id, status` (open/finished, teils „complete“), `series_id, game_number, created_at, task_id, task_text` | |
| **match_players** | `match_id, player_id, position` (Platz 1…99), `score, start_position, time_ms, team` (DYP), `entry_log` (jsonb: wer wann was eingetragen hat, `src` „phone“/„admin“, `by`), `stats_ignored, bot_calc` (jsonb) | **Hier stehen die Scores** |
| **tournament_ratings** | `tournament_id, profile_id, rating_before, provisional_before, matches_before, applied_rating, applied_matches, applied_provisional` | Elo-Foto vor dem Turnier + gebuchter Anteil (Buchungsprinzip) |
| **tournament_results** | `tournament_id, player_id, player_name, final_rank, points, wins, podiums, matches_played, winrate, avg_position, podium_rate, favorite_machine, best_machine, super_final_rank, tournament_points` | Wird von `tournaments/finish` geschrieben (erst danach status = finished) |
| **tournament_feed** | `id, tournament_id, event_key` (eindeutig je Turnier), `kind, icon, title, body, player_ids, data` (jsonb, u. a. `hidden`), `created_at` | Live-Ticker; FK mit ON DELETE CASCADE |
| **tournament_feed_state** | `tournament_id, fingerprint, pending, updated_at` | Zustand des Server-Tickers |

Weitere: `finales, final_players, final_games` (Superfinale), `profile_links` (Login ↔ Profil), `filter_presets`, `single_play_runs, single_play_ball_events`, `app_settings` (u. a. Bot-/Sound-Einstellungen), `elo_backup_2026_11_18` (Sicherung). DB-Funktionen `elo_book` / `elo_unbook` (nur service_role), RPC `bump_daily_activity`.

### Zusammenhänge
- Flipper-Identität für Rekorde/Statistik = **Location + Flipper-Name** (nicht machine.id, da pro Turnier kopiert).
- Allzeit-Rekorde zählen nur beendete Turniere, ohne Timeplay/DYP. „30-Tage-Highscore“ heißt bewusst nicht „des Monats“.
- Turnier löschen löscht alles Zugehörige und bucht die Elo vorher zurück (`elo_unbook`).
- Supabase liefert max. 1000 Zeilen → bei großen Abfragen `fetchAllIn` nutzen.

---

## 5. Wichtige Regeln und Entscheidungen

### Fachlich
- **Formate**: matchplay, timeplay, swiss, round_robin (ist nur Zufalls-Shuffle), dyp_round_robin (2 gegen 2), elimination, **rotation = „Round the Pinball“ (RtP)** (alle spielen alle Flipper, Durchgänge/Wellen, blaue Zeile = wer gerade dran ist, weiße Zeilen gesperrt).
- **Elo**: Mehrspieler-Match = Einzelduelle jeder gegen jeden, jeweils volles K (16, <30 Spiele 24, provisional 32). **Gewollt – nicht dämpfen, nicht erneut vorschlagen.** `recalc-elo` ist maßgeblich und läuft nach jeder fertigen Runde automatisch (nur Admin). Paralleltaugliches **Buchungsprinzip** (Profil += neu − bereits gebucht) seit cde548e; bei Elo-Änderungen `recalc-elo`, `lib/eloCalc.ts`, `lib/eloLedger.ts` gemeinsam prüfen und `node --experimental-strip-types --no-warnings scripts/elo-ledger-check.mjs 50000` laufen lassen. „Da darf wirklich kein Fehler passieren.“
- **`lib/points.ts` nicht ändern** (auch keine „harmlosen“ Funktionen – hat im Dev-Server merkwürdige Abstürze ausgelöst). Neue Punktelogik in eigene Dateien, vorher mit Nutzer reden. Punkteberechnung existiert an mehreren Stellen unterschiedlich – bei Änderungen alle prüfen.
- **On fire 🔥**: Matchplay & Co. ab 3 Siegen in Folge (gewonnenes 4er-Match = 3 Siege), RtP ab 2 gehaltenen Turnier-Highscores; 🔥🔥 ab 5.
- **Auf Messers Schneide ⚖️**: Gewinnchancen höchstens 10 Prozentpunkte auseinander; bei RtP nur die beiden Favoriten an einem Flipper.
- **Bots**: feste Elo, ändern nie Elo von Menschen; mit Bots kein Superfinale; 1 Mensch + Bots = Training ohne Turnierpunkte.
- **Rollen**: Rolle nur aus `app_metadata` (nie `user_metadata`). Ein Admin, sonst Zuschauer (nur lesen). Neue **lesende POST-Route** → in `VIEWER_POST_READS` (`lib/authRoles.ts`) eintragen, sonst 403 für Zuschauer. Middleware: Lesen per `getSession`, Schreiben per `getUser` (getUser bei jedem Aufruf löste Rate-Limit aus). Signups sind aus.

### Live-Ticker & Meldungen
- Katalog in `lib/notifications.ts`: jede Meldungsart mit Geräten (Ticker, TV, Admin, Handy), Dauer, Sound und **Badge/Scope**:
  - 👤 **Spieler** (Sand/Amber): Serien, Momente, Rekorde, Score-Form, Elo-Marke, Messers Schneide …
  - 🏟️ **Turnier**: nur Runde/Durchgang/Superfinale/Turnierende
  - 📰 **Ergebnis** (früher „Shortnews“): Match-Ergebnisse
  - ♾️ **Allzeit · Duell**: Duell-Bilanz über alle Turniere, rosa Verlauf (reines „♾️ Allzeit“ kommt kaum noch vor)
  - 🤝 **Team** (türkis): Lob/Tipp fürs Score-Eintragen
- Reihenfolge im Ticker regelt `lib/tickerOrder.ts` (nur Anzeige): je Match Ergebnis → Sieg → Moment; Serien/Tabellenführung darüber; „Runde abgeschlossen“ darüber; Ankündigungen der neuen Runde über „Runde generiert“; Score-Meldungen (inkl. Elo-Marke) unter „alle Scores“/„geschafft“. Fenster 60 s.
- 10 s „Tippfehler-Schutz“, bevor Meldungen kommen.
- Meldungen werden nicht gelöscht, sondern per `data.hidden` ausgeblendet (🗑️ nur bei Hover, nur Admin) – sonst legt der Server-Ticker sie neu an.
- Server-Ticker auf weitere Meldungsarten ausweiten: **Nutzer will das vorerst nicht** („zu heikel“).
- Einblendungen (Popups) bleiben absichtlich unsortiert.

### Optik
- **Kein 🎯-Icon** in neuer Oberfläche (Alternativen ⚔️ 🕹️ 🎮 🏅).
- **Keine Spieler-Icons vor Namen** in Meldungen; **Flipper-Icons** (`machines.icon_emoji`) vor Flipper-Namen bei Ergebnis-Meldungen ja.
- Namen in Meldungen fett (`lib/momentNames.ts`). Score-Anzeige deutsch mit Tausenderpunkten.
- Admin-Match-Kopf: grün „✓ fertig“, hellblau „● läuft“; Runden-Badges „fertig ✓“ / „läuft“.
- Flipper-Premiere und Premieren-Sieg: Icon 🌟.

### Technische Stolperfallen
- In `@ts-nocheck`-Dateien findet `tsc` **doppelte Namen nicht** (nur der Next-Build). Vor neuen Imports in `page.tsx` per grep prüfen, ggf. mit Alias importieren; bei größeren Änderungen Probe-Build.
- Wenn eine Änderung im Browser nicht ankommt: Dev-Server liefert evtl. alten Chunk → Nutzer bitten, Dev-Server neu zu starten (läuft in seinem Terminal, nicht selbst beenden).
- Reine `lib/`-Dateien testen: in den Scratchpad kopieren und `node --experimental-strip-types --no-warnings` (kein `npx tsx`).
- Tote Dateien nicht bearbeiten/als Vorlage nutzen: `app/t/test*.tsx`, `pageon.tsx`, `page - *.tsx`, `page copy.tsx`, `page_Sicherung.tsx`, `*Kopie*`, `route - *.ts`, `lib/logic.ts`, `components/{RoundMatches,RoutePill,HeaderLogout,DrainPieChart,test}.tsx`, `app/settings/*`, `public/page.tsx`.

---

## 6. Aktueller Stand

### Zuletzt live
- **2026-11-21**: 📟 Displays – welches Turnier: Liste der am Admin-iPad geöffneten Turniere (`app_settings` „display_tournament:<location>“, `/api/display-tournament`, `lib/displayPinServer.ts`; auch bei Timer-Start, jedem Score – Handy serverseitig – und Knopf „📟 An Displays senden“); jedes Display nimmt das neueste mit SEINEM Flipper. Block-Highscores wenn alle Durchgänge fertig, Siegerliste 10 Min. nach „Turnier beenden“ (neue Spalte `tournaments.finished_at` – `supabase_tournament_finished_at.sql`, vom Nutzer auszuführen; Code läuft auch ohne), Explosion beim Löschen (`deleted`), Flipper-Icon (`icon`) für das Maskottchen. Gerät: `code.py` + `mascots.py`/`mascots_b.py`/`mascots_c.py` (19 Figuren, aufgeteilt wegen Speicher). Übersicht als PDF auf dem Desktop des Nutzers.
- **2026-11-20 (spät)**: 📟 Flipper-Displays mit Animationen (3-2-1-LOS + Rennauto beim Start, „NOCH X S“ in der letzten Minute, Zielflagge/ZEIT!/GAME OVER, Lauflicht-Rahmen „BITTE SCORE EINTRAGEN“, Rückmeldung „PLATZ X“, Rennauto bei neuem Highscore). App liefert dafür `timer`/`active`/`scores` in `/api/public/display`, iPad meldet den 15-s-Countdown („prestart“). Gerätecode liegt NUR auf dem Matrix Portal (`D:\code.py`), nicht im Repo.
- **2026-11-20 (spät)**: 🧱 Round the Pinball – weitere Flipper-Runden nachlegen, wenn alle Durchgänge fertig sind (nicht bei beendetem Turnier). Block = Runden mit gleichem `rounds.created_at`; Durchgänge zählen weiter (`lib/rotationTurn.ts` `rotationBlocksFrom`), Ticker-Kennungen mit Block-Ende, ungespielte Flipper zuerst, Schild „🧱 Block N“ in der Rundenliste.
- **f5b705d** (2026-11-20): Flipper-LED-Display `/api/public/display` (Round the Pinball) + dieser Projekt-Überblick.
- **efb6c92** (2026-11-20): Lob fürs Score-Eintragen am Handy (1/3 nur Handy, ab 5 Ticker/TV/Admin mit Ton), einmaliger Tipp bei Match ohne Scores, Badge 🤝 Team, Ticker-Reihenfolge (Elo-Marke unter Durchgang/Runde fertig), Score-Form-Spruch kursiv, goldene Sterne bei Tabellenführung, RtP weiße Zeilen gesperrt + Sprung zur blauen Zeile.
- **a4b1b02** (2026-11-19): Sperre gegen doppelte Runden, Ticker-Meldungen ausblenden, „Auf Messers Schneide – entschieden!“.
- **ab395dd** (2026-11-19): Auf Messers Schneide, Spieler-Badge, Ticker-Vorschau (unter „Meldungen & Sounds“), Match-Karten fertig/läuft.

### ❌ Bewusst NICHT hochladen (nie stagen)
- `app/api/matches/set-machine/route.ts` – nutzt evtl. nicht existierende Spalten `task_title/description/difficulty`
- `app/api/ocr/route.ts` – nur Leerzeilen-Änderung
- `app/t/test.tsx` – tote Testdatei
- `app/api/single-play/run/abandon/` – unfertig
- alle Backup-/Kopie-Dateien

### Offene Punkte (Nutzer bei Gelegenheit fragen/erinnern)
1. **Runde löschen (Matchplay)**, nur solange das Turnier nicht beendet ist. Offen: nur die letzte Runde? Auch mit Ergebnissen (mit Warnung + Elo-Neuberechnung) oder nur leere Runden?
2. **Elo-Parallel-Test** mit 2 Test-Turnieren + Testprofilen (Testanleitung + Kontroll-Abfrage) – Nutzer sagte „später“, **erinnern**. Danach Teil 2: Anzeigen (Live-Leaderboard, TV, Elo-Verlauf) auf `applied_rating` umstellen.
3. Kleine Fragen: Soll „● läuft“ im Match-Kopf pulsieren? Soll das 🎰-Premiere-Badge am Spielernamen zu 🌟 werden? Sollen andere Handy-Karten bis zum Antippen stehen bleiben? Score-Form-Text bei Highscore-Meldungen auch aufteilen?
4. RtP „Auf Messers Schneide“: Nutzer testet noch – nach Erfahrungen fragen. Format-Bilanz-Gewicht (`lib/favorite.ts` FMT_K = 10) und Favoritensturz-Grenze 30 % irgendwann nochmal fragen.
5. Tempo beim Speichern: (A) Sofort-Anzeige, (C) set-score/set-position straffen – Nutzer will erst live testen, regelmäßig nachfragen.
6. Anmeldeprüfung: einmal kam „Anmeldung konnte gerade nicht geprüft werden (fetch failed)“ → Idee: `getUser` bei Netzwerkfehler einmal wiederholen. Fragen, ob es wieder auftrat.
7. KI-Bots: Stufe 1+2 live; offen: Bot spielt automatisch, Rivalen-Bot, Arcade-Modus.
8. Kaputt/alt: `/public` + `/api/public/overview` + `season/*` (nutzen fehlendes `season_year`); Statistik-Pagination Gruppe B (players/stats, machine-stats, head-to-head, public/profile, winrates, season/standings).
9. Ideen-Liste: Streichergebnisse in der Serie, TV für Elimination/DYP, „Spieler des Abends“-Titel, WhatsApp-Teilen-Bild, weitere Auszeichnungen im Profil, Rückblick als TV-Diashow, Pinball Wrapped, Flipper-Profile, Formkurve, Dunkelmodus-Nachbesserung, „Score-Sammler des Abends“. Eine Ideenliste liegt als PDF auf dem Desktop des Nutzers.

---

## 7. Zusammenarbeit – Vorlieben des Nutzers

- **Sprache: Deutsch**, einfach und ohne Fachchinesisch erklären. Der Nutzer hat lange nicht programmiert (kennt z. B. Browser-DevTools nicht mehr).
- **Kurz und übersichtlich** antworten, gern mit kleinen Listen/Beispielen, wie eine Meldung aussieht. Keine langen Risiko-Listen – das überfordert.
- **Kleine Schritte.** Erst Ursache gezielt finden, dann den kleinsten Fix vorschlagen, mit kurzer Testanleitung.
- **Vor jeder Änderung um Erlaubnis fragen.** Freigabe-Wörter: „einbauen“, „ja“, „mach“, „bauen“. **„hochladen“** = committen + Build-Check + auf `main` pushen (Ablauf oben).
- Nichts „nebenbei“ ändern; bestehendes Verhalten nur ändern, wenn ausdrücklich gewünscht.
- Keine `.env`-Inhalte lesen oder ausgeben. Keine DB-Änderungen selbst ausführen.
- Der Nutzer tippt schnell und mit vielen Tippfehlern – wohlwollend lesen, bei echter Mehrdeutigkeit kurz nachfragen.
- Der Nutzer testet lokal (localhost) und live und schickt oft Screenshots. Klar sagen, ob etwas nur lokal oder schon online ist, und dass lokal dieselbe Produktions-DB benutzt wird.
- Wenn er sagt „merk dir“ oder „später“: notieren und bei passender Gelegenheit von selbst erinnern.
- Er probiert gern Farben/Icons aus und entscheidet nach Ansicht – Varianten kurz beschreiben, nicht alles auf einmal umbauen.
