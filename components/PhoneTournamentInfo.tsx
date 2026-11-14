"use client";

// ℹ️ Turnier-Info für die Handy-Seite (Reiter "Turnier-Infos"): Format, Location, Spieler, Flipper
// und das Punktesystem – vor allem für neue Spieler.
// Daten kommen aus /api/public/tournament (wie der Rest der Handy-Seite), keine eigene Abfrage.
// Punkte-Regeln aus lib/pointsDisplay.ts (NICHT lib/points.ts).

import type { MmData } from "@/lib/myMatch";
import {
  matchPointsScheme,
  tournamentPointsScheme,
  SUPER_FINAL_START_POINTS,
  SUPER_FINAL_TARGET,
  SUPER_FINAL_TP_BONUS_DISPLAY,
} from "@/lib/pointsDisplay";

const FORMAT_INFO: Record<string, { icon: string; label: string; how: string }> = {
  matchplay: {
    icon: "⚔️",
    label: "Matchplay",
    how: "In jeder Runde spielt ihr in kleinen Gruppen an einem Flipper. Wer den höchsten Score hat, wird Erster.",
  },
  timeplay: {
    icon: "⏱️",
    label: "Timeplay",
    how: "Wie Matchplay, aber mit Zeitlimit: Gespielt wird, bis die Zeit abgelaufen ist.",
  },
  swiss: {
    icon: "⚖️",
    label: "Swiss",
    how: "Ab Runde 2 spielen jeweils Spieler mit ähnlich vielen Punkten gegeneinander.",
  },
  round_robin: {
    icon: "🔄",
    label: "Round Robin",
    how: "Die Gruppen werden jede Runde neu gemischt, damit möglichst jeder gegen jeden spielt.",
  },
  rotation: {
    icon: "🎰",
    label: "Round the Pinball",
    how: "Alle spielen jeden Flipper. Pro Flipper gibt es eine Rangliste nach Score – daraus kommen die Punkte. Wer gerade dran ist, siehst du unter „Mein Match“.",
  },
  elimination: {
    icon: "💥",
    label: "Crazy Elimination",
    how: "Alle spielen gegeneinander. Wer in einer Runde den niedrigsten Score hat, scheidet aus – bis einer übrig bleibt.",
  },
  dyp_round_robin: {
    icon: "👥",
    label: "DYP Round Robin",
    how: "2 gegen 2: Die Teams werden jede Runde neu ausgelost. Beide im Siegerteam bekommen die Punkte.",
  },
};

type TournamentExtra = {
  format?: string | null;
  status?: string | null;
  category?: string | null;
  match_size?: number | null;
  created_at?: string | null;
  locations?: { name?: string | null } | { name?: string | null }[] | null;
};

function locationName(t: TournamentExtra): string | null {
  const l = t.locations;
  const one = Array.isArray(l) ? l[0] : l;
  const n = String(one?.name ?? "").trim();
  return n || null;
}

function isActive(x: unknown): boolean {
  return (x as { active?: boolean | null } | null)?.active !== false;
}

function Fact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2 ring-1 ring-neutral-200">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {icon} {label}
      </div>
      <div className="truncate text-base font-bold">{value}</div>
    </div>
  );
}

function PointsRow({ values, unit }: { values: number[]; unit: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v, i) => (
        <div
          key={i}
          className={
            "flex min-w-[3.25rem] flex-col items-center rounded-lg px-2 py-1 ring-1 " +
            (i === 0 ? "bg-amber-50 ring-amber-300" : "bg-white ring-neutral-200")
          }
        >
          <span className="text-[10px] font-medium text-neutral-500">{i + 1}. Platz</span>
          <span className="text-base font-black tabular-nums">
            {v}
            <span className="ml-0.5 text-[10px] font-medium text-neutral-400">{unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PhoneTournamentInfo({ data }: { data: MmData }) {
  const t = (data.tournament ?? {}) as TournamentExtra;
  const format = String(t.format ?? "").toLowerCase();
  const info = FORMAT_INFO[format] ?? { icon: "🎮", label: t.format || "Turnier", how: "" };

  const nPlayers = (data.players ?? []).filter(isActive).length;
  const nMachines = (data.machines ?? []).filter(isActive).length;
  const nRounds = (data.rounds ?? []).length;
  const loc = locationName(t);
  const category = String(t.category ?? "").trim();
  const date = t.created_at ? new Date(t.created_at) : null;
  const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("de-DE") : null;
  const eloOn = (data.rounds ?? []).length === 0 || (data.rounds ?? []).some((r) => r.elo_enabled !== false);

  const mp = matchPointsScheme(format, t.match_size, nPlayers);
  const tp = tournamentPointsScheme(nPlayers);

  const matchHint =
    format === "rotation"
      ? `Pro Flipper nach Platz (alle ${nPlayers} Spieler):`
      : format === "dyp_round_robin"
      ? "Pro Match: Siegerteam bzw. Verliererteam (je Spieler):"
      : `Pro Match mit ${mp.length} Spielern:`;

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
      {/* Format */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-3xl">{info.icon}</span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Format</div>
            <div className="text-lg font-black leading-tight">{info.label}</div>
          </div>
        </div>
        {info.how ? <p className="mt-2 text-sm leading-snug text-neutral-600">{info.how}</p> : null}
      </div>

      {/* Eckdaten */}
      <div className="grid grid-cols-2 gap-2">
        {loc ? <Fact icon="📍" label="Location" value={loc} /> : null}
        {category ? <Fact icon="🏷️" label="Kategorie" value={category} /> : null}
        <Fact icon="👥" label="Spieler" value={String(nPlayers)} />
        <Fact icon="🎰" label="Flipper" value={String(nMachines)} />
        <Fact icon="🔁" label={format === "rotation" ? "Runden gesamt" : "Runden bisher"} value={String(nRounds)} />
        {dateText ? <Fact icon="📅" label="Datum" value={dateText} /> : null}
        <Fact icon="📈" label="Elo-Wertung" value={eloOn ? "an" : "aus"} />
      </div>

      {/* Punktesystem */}
      {nPlayers >= 2 ? (
        <div className="space-y-3 border-t border-neutral-100 pt-3">
          <div>
            <div className="font-bold">🏅 Matchpunkte</div>
            <div className="mb-1.5 text-xs text-neutral-500">{matchHint}</div>
            <PointsRow values={mp} unit="P" />
            {format !== "rotation" && format !== "dyp_round_robin" ? (
              <div className="mt-1.5 text-xs text-neutral-500">
                Spielen weniger an einem Flipper: 2 Spieler 2 · 0, 3 Spieler 3 · 1 · 0.
              </div>
            ) : null}
            <div className="mt-1 text-xs text-neutral-500">Alle Matchpunkte zusammen ergeben das Leaderboard.</div>
          </div>

          <div>
            <div className="font-bold">🏆 Turnierpunkte (Serie)</div>
            <div className="mb-1.5 text-xs text-neutral-500">
              Nach Turnierende je Endplatz – zählen für die Jahres-/Serienwertung:
            </div>
            <PointsRow values={tp} unit="TP" />
          </div>

          <div>
            <div className="font-bold">🔥 Superfinale (falls gespielt)</div>
            <p className="text-sm leading-snug text-neutral-600">
              Die Top 4 starten mit <b>{SUPER_FINAL_START_POINTS.join(" · ")}</b> Vorpunkten. Jeder Spielsieg = 1 Punkt,
              wer zuerst <b>{SUPER_FINAL_TARGET}</b> hat, gewinnt – und bekommt <b>+{SUPER_FINAL_TP_BONUS_DISPLAY} TP</b>{" "}
              extra.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
