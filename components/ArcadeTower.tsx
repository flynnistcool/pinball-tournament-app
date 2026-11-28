"use client";

// 🗼 Arcade-Turm (Admin-Turnier): unten die erste Stufe, oben der Endboss. Geschaffte Stufen ✅,
// aktuelle leuchtet, kommende abgedunkelt; Leben als ❤️. Knopf "▶ Nächste Stufe" legt das nächste Duell an.
// Stand: lib/arcade.ts (arcadeState) aus den Runden des Turniers.

import { arcadeDuelWon, arcadeKindIcon, arcadeModeDef, arcadeState, type ArcadeDuel, type ArcadeState } from "@/lib/arcade";

type TData = {
  tournament?: {
    status?: string | null;
    arcade_mode?: string | null;
    arcade_lives?: number | null;
    arcade_stages?: string[] | null;
    arcade_profile_id?: string | null;
  } | null;
  players?: readonly { id: string; profile_id?: string | null }[];
  rounds?: readonly { id: string; number?: number | null }[];
  matches?: readonly { id: string; round_id: string }[];
  match_players?: readonly { match_id: string; player_id: string; position: number | null; score: number | string | null }[];
};

export type ArcadeView = { state: ArcadeState; stages: string[] } | null;

/** Stand eines Arcade-Laufs aus den Turnierdaten (null = kein Arcade-Lauf) */
export function arcadeViewOf(data: TData | null | undefined): ArcadeView {
  const t = data?.tournament;
  if (!t?.arcade_mode || !Array.isArray(t.arcade_stages) || !t.arcade_stages.length) return null;
  const me = (data?.players ?? []).find((p) => String(p.profile_id) === String(t.arcade_profile_id));
  const roundNo = new Map((data?.rounds ?? []).map((r) => [String(r.id), Number(r.number ?? 0)]));
  const duels: ArcadeDuel[] = (data?.matches ?? []).map((m) => {
    const rows = (data?.match_players ?? []).filter((x) => String(x.match_id) === String(m.id));
    const mine = me ? rows.find((x) => String(x.player_id) === String(me.id)) : undefined;
    const bot = me ? rows.find((x) => String(x.player_id) !== String(me.id)) : undefined;
    const v = (x?: { position: number | null; score: number | string | null }) => ({
      position: x?.position ?? null,
      score: x?.score != null && x.score !== "" ? Number(x.score) : null,
    });
    return { roundNumber: roundNo.get(String(m.round_id)) ?? 0, won: mine && bot ? arcadeDuelWon(v(mine), v(bot)) : null };
  });
  return { state: arcadeState(t.arcade_stages.length, Number(t.arcade_lives ?? 1), duels), stages: t.arcade_stages.map(String) };
}

export default function ArcadeTower({
  data,
  profilesById,
  onNext,
  busy,
}: {
  data: TData | null;
  profilesById: Record<string, { name?: string | null; rating?: number | null; bot_kind?: string | null }>;
  /** fehlt = reine Anzeige (TV/Handy), ohne Knopf */
  onNext?: () => void;
  busy?: boolean;
}) {
  const view = arcadeViewOf(data);
  const def = arcadeModeDef(data?.tournament?.arcade_mode);
  if (!view || !def) return null;
  const { state, stages } = view;
  const finished = data?.tournament?.status === "finished";
  const canNext = !finished && state.status === "playing" && !state.open;

  return (
    <div className="mb-4 rounded-2xl border-2 border-fuchsia-300 bg-gradient-to-b from-neutral-900 to-neutral-800 p-4 text-white shadow">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-fuchsia-300">🕹️ Arcade</div>
          <div className="text-xl font-black">
            {def.icon} {def.label}
            <span className="ml-2 text-sm font-semibold text-white/60">
              Stufe {Math.min(state.wins + (state.status === "playing" ? 1 : 0), state.stagesTotal)}/{state.stagesTotal}
            </span>
          </div>
        </div>
        <div className="text-2xl tracking-widest" title={`${state.livesLeft} von ${state.livesStart} Leben`}>
          {"❤️".repeat(state.livesLeft)}
          <span className="opacity-30">{"🖤".repeat(Math.max(0, state.livesStart - state.livesLeft))}</span>
        </div>
      </div>

      {/* Turm: oben der Endboss */}
      <div className="mt-3 flex flex-col-reverse gap-1.5">
        {stages.map((pid, i) => {
          const p = profilesById[pid];
          const att = state.attempts[i];
          const done = att?.won;
          const current = state.status === "playing" && i === state.wins;
          const boss = i === stages.length - 1;
          return (
            <div
              key={`${pid}-${i}`}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2 transition " +
                (current
                  ? "bg-fuchsia-600 shadow-lg shadow-fuchsia-500/40 ring-2 ring-fuchsia-300"
                  : done
                  ? "bg-emerald-700/40"
                  : state.status === "gameover" && i === state.wins
                  ? "bg-red-800/60 ring-2 ring-red-400"
                  : "bg-white/5 opacity-60")
              }
            >
              <span className="w-7 text-center font-mono text-sm text-white/60">{i + 1}</span>
              <span className="text-xl">{boss ? "☠️" : arcadeKindIcon(p?.bot_kind)}</span>
              <span className="min-w-0 flex-1 truncate font-bold">
                {p?.name ?? "?"}
                {boss ? <span className="ml-2 text-xs font-semibold text-amber-300">ENDBOSS</span> : null}
              </span>
              <span className="text-xs text-white/60">
                {p?.bot_kind === "champion" ? "👑" : typeof p?.rating === "number" ? Math.round(p.rating) : ""}
              </span>
              <span className="w-24 text-right text-sm">
                {done ? "✅ besiegt" : current ? (state.open ? "⚔️ läuft" : "▶ dran") : ""}
                {att?.losses ? <span className="ml-1 text-red-300">{"💔".repeat(att.losses)}</span> : null}
              </span>
            </div>
          );
        })}
      </div>

      {state.status === "cleared" ? (
        <div className="mt-3 rounded-xl bg-amber-400 px-4 py-3 text-center text-lg font-black text-neutral-900">
          🏆 GESCHAFFT! Alle {state.stagesTotal} Gegner besiegt{finished ? "" : " – Lauf wird abgeschlossen …"}
        </div>
      ) : state.status === "gameover" ? (
        <div className="mt-3 rounded-xl bg-red-600 px-4 py-3 text-center text-lg font-black">
          💀 GAME OVER – Stufe {state.wins + 1} von {state.stagesTotal}
          {finished ? "" : " – Lauf wird abgeschlossen …"}
        </div>
      ) : !onNext ? null : (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!canNext || busy}
            onClick={onNext}
            className="rounded-xl bg-fuchsia-500 px-5 py-2.5 text-base font-black shadow hover:bg-fuchsia-400 disabled:opacity-40"
            title={state.open ? "Erst das laufende Duell zu Ende spielen" : "Nächstes Duell anlegen"}
          >
            {state.open ? "⚔️ Duell läuft …" : state.wins === 0 && state.losses === 0 ? "▶ Los geht's – Stufe 1" : "▶ Nächste Stufe"}
          </button>
        </div>
      )}
    </div>
  );
}
