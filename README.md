# Pinball Turnier Web-App (iPad-optimiert) – v2.0

## Neu in v0.9 (QR + Filter)
### QR-Code teilen (ohne Login)
Im Admin-Dashboard gibt es einen Button **„QR teilen“**:
- QR für **/t/TOURNIER_CODE** (read-only Turnieransicht)
- QR für **/public** (read-only Gesamtübersicht)

Hinweis: Dafür wurde die npm-Dependency **qrcode** ergänzt (läuft automatisch über `npm install`).

### /public Filter
Auf **/public** gibt es Filter:
- Kategorie: Alle / Normal / Liga
- Jahr (Season, nur Liga-Jahre die vorkommen)
- Suche nach Turniername

Die Rangliste passt sich den Filtern an (Top 50 über die gefilterten Turniere).

## Supabase Setup
1) SQL Editor:
- `supabase_schema.sql`
- `supabase_profiles_migration.sql`
- `supabase_league_migration.sql`

2) Storage:
- Bucket **avatars** anlegen und auf **public** stellen

## Start
```bash
npm install
cp .env.example .env.local
npm run dev
```


## Neu in v0.9 (Best-of)
- Pro Turnier einstellbar: **Best-of-1 / Best-of-3 / Best-of-5**
- Bei Best-of > 1 werden pro Paarung/Gruppe mehrere Spiele erzeugt (als Serie), jeweils mit eigener Maschine.
- Migration: `supabase_bestof_migration.sql`


## Neu in v1.1 (Spaß + Saisonwertung + Profile + Elo)
- Neue Turnierkategorie: **Spaß** (wird nicht in Elo gewertet)
- **Normal** kann wie Liga eine **Saison (Jahr)** haben und bekommt eine **Jahreswertung** (mit Best-X, Streichergebnisse, Teilnahmebonus, Modus).
- Öffentliche Spielerprofile: **/p/<profileId>** (Turniere, Matches, Siege, Ø-Platz, Winrate, Maschinen-Winrate)
- Simple **Elo**-Zahl pro Profil (Default 1500). Update nach jedem Match (Pairwise Multiplayer-Elo). Migration: `supabase_elo_migration.sql`
- Saisonwertung API: `/api/season/standings` und `/api/season/years`


## Neu in v1.1
- Elo-Anzeige jetzt auch im Admin (Spieler-Liste + Statistik-Tabelle).
- `/api/profiles/list` und Stats liefern Rating-Feld mit aus.


## Admin-Login (v1.2)
1) Supabase → Authentication → Users → **Add user**
2) Trage deine **Admin E-Mail + Passwort** ein
3) In Vercel zusätzlich setzen:
- NEXT_PUBLIC_SUPABASE_URL (gleich SUPABASE_URL)
- NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase → Settings → API → anon/public)

Ohne Login sind nur die Read-only Seiten verfügbar: `/public`, `/t/CODE`, `/p/PROFILE`.

## Maschinenliste wiederverwenden
Beim Turnier erstellen kannst du **„Maschinen übernehmen“** wählen. Dann werden die Flipper aus einem alten Turnier ins neue kopiert.


## Locations (v1.3)
Migration: `supabase_locations_migration.sql`
- Admin: `/settings/locations` → Locations anlegen + Flipper-Liste pflegen
- Beim Turnier erstellen: Location wählen → Maschinen werden automatisch übernommen (wenn keine Turnier-Vorlage gewählt ist)


## Spieler pro Match (v1.5)
Migration: `supabase_matchsize_migration.sql`
- Beim Turnier-Erstellen wählbar: 2 / 3 / 4 Spieler pro Match
- Punktesystem pro Match ist linear: 1. = N Punkte, 2. = N-1, ... letzter = 1


## Neu in v1.6
- Aktuelle Runde wird angezeigt (Admin + Public Turnieransicht).
- Admin: zusätzliches **Runden-Protokoll** (Liste aller erstellten Runden mit Status & Spielanzahl).


## Neu in v1.7
- Admin: **Turnier-Archiv** (Tab), um abgelaufene Turniere per Klick wieder zu öffnen und alle Runden/Ergebnisse/Ranglisten zu sehen.
- Ergebnisse werden ohnehin dauerhaft in der DB gespeichert (Runden, Matches, Platzierungen, Maschinen) und sind jederzeit wieder abrufbar.


## Neu in v1.8
- Turnier-Status: `open` / `finished` (Button **Turnier abschließen** im Admin).
- Admin-Archiv: Filter **nur abgeschlossene**.
- Neue Read-only Seite **/s/CODE**: schöne Turnier-Zusammenfassung (Final Ranking + Top Charts + Match-Log) + Drucken/PDF.
- Migration: `supabase_tournament_status_migration.sql`


## Neu in v1.9 (Start-Elo + Provisional)
- Profile haben Start-Elo (Standard 1500, einstellbar 800–3000)
- Provisional Rating: erste N Matches (Standard 10) nutzen höheren K-Faktor
- Admin-Seite: `/settings/profiles` zum Anlegen/Anpassen (Elo + Provisional-Matches + Reset)
- Migration: `supabase_provisional_migration.sql`


## Neu in v2.0
- Anti-cheat: Start-Elo kann nur geändert werden, solange **matches_played = 0**.
- Profil-Anlage: Start-Elo Feld ist standardmäßig **1500**, Range **800–3000**.
Trigger redeploy
