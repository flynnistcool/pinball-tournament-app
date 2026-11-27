"use client";

// 🏁 Super-Finale als "Race to X": je Spieler ein Balken aus Feldern bis zum Ziel + großer Sieg-Knopf.
// Nur Anzeige – der Knopf ruft denselben Ablauf wie die bisherigen Gewinner-Knöpfe (onWin).

export type RacePlayer = {
  playerId: string;
  name: string;
  seed: number | null;
  startPoints: number;
  points: number;
};

export default function SuperFinalRace({
  players,
  target,
  gamesPlayed,
  disabled,
  onWin,
}: {
  players: readonly RacePlayer[];
  target: number;
  gamesPlayed: number;
  disabled: boolean;
  onWin: (p: RacePlayer) => void;
}) {
  const sorted = [...players].sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || b.points - a.points);
  const goal = Math.max(1, target);
  return (
    <div className="rounded-2xl border bg-white px-4 py-3">
      <div className="border-b pb-2 text-center text-sm text-neutral-500">
        {gamesPlayed} {gamesPlayed === 1 ? "gespieltes Finalspiel" : "gespielte Finalspiele"}
      </div>
      <div className="mt-3 space-y-4">
        {sorted.map((p) => {
          const start = Math.min(goal, Math.max(0, p.startPoints));
          const pts = Math.min(goal, Math.max(0, p.points));
          return (
            <div key={p.playerId}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 truncate text-base font-semibold text-neutral-900">
                  {p.seed != null ? <span className="mr-1.5 font-mono text-sm text-neutral-400">#{p.seed}</span> : null}
                  {p.name}
                </div>
                <div className="shrink-0 text-lg font-bold tabular-nums text-neutral-900">
                  {pts} / {goal}
                </div>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {Array.from({ length: goal }, (_, i) => (
                  <div
                    key={i}
                    className={
                      "h-6 flex-1 rounded-lg " +
                      (i < pts ? (i < start ? "bg-amber-300" : "bg-amber-500") : "bg-neutral-100")
                    }
                    title={i < start ? "Startpunkt (Seed)" : i < pts ? "im Finale gewonnen" : "noch offen"}
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onWin(p)}
                className="mt-1.5 w-full rounded-full border border-neutral-300 bg-white py-1.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 active:scale-[0.99] disabled:opacity-50"
              >
                {p.name} gewinnt das Spiel
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 text-[11px] text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded bg-amber-300" /> Startpunkte (Seed)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 rounded bg-amber-500" /> im Finale gewonnen
        </span>
      </div>
    </div>
  );
}
