"use client";

// 🧾 Rechenzettel eines Bot-Scores (nur Admin): Schritt für Schritt, wie der Bot gerechnet hat.

import { botDiffText, rateBotScore } from "@/lib/botScoreRating";
import type { BotCalc } from "@/lib/botScore";

const nf = new Intl.NumberFormat("de-DE");
const fmtScore = (n: number | null | undefined) => (n == null ? "–" : nf.format(Math.round(n)));
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("de-DE") : "–");

const FORMAT_LABEL: Record<string, string> = {
  matchplay: "Matchplay",
  swiss: "Swiss",
  round_robin: "Round Robin",
  rotation: "Round the Pinball",
  elimination: "Elimination",
  timeplay: "Timeplay",
  dyp_round_robin: "DYP",
};
export const fmtLabel = (f: string | null) => FORMAT_LABEL[String(f ?? "")] ?? String(f ?? "–");

const K_LABEL: Record<string, string> = {
  k16: "K16 fest",
  k24: "K24 ziemlich sicher",
  k32: "K32 neu",
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-neutral-800">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
          {n}
        </span>
        {title}
      </div>
      <div className="space-y-1 text-[13px] text-neutral-700">{children}</div>
    </div>
  );
}

/** Rechenzettel-Inhalt (auch im Bot-Labor genutzt) */
export function BotCalcView({
  calc,
  error,
  currentScore,
}: {
  calc: BotCalc | null;
  error?: string | null;
  currentScore?: number | null;
}) {
  const c = calc;
  const S = c?.settings;
  const changedByHand = !!c?.ok && currentScore != null && c.score != null && Math.round(currentScore) !== c.score;
  return (
    <>
    {!c ? (
      <div className="rounded-xl bg-white p-4 text-sm text-neutral-600">{error ?? "Lade Rechenzettel …"}</div>
    ) : (
      <div className="space-y-2">
        {c.ok ? (
          <div className="rounded-xl bg-violet-600 px-4 py-3 text-white">
            <div className="text-xs uppercase tracking-widest text-white/70">Ergebnis</div>
            <div className="text-2xl font-black tabular-nums">{fmtScore(c.score)}</div>
            <div className="text-xs text-white/70">gewürfelt am {new Date(c.at).toLocaleString("de-DE")}</div>
          </div>
        ) : (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">⚠️ {c.error}</div>
        )}
        {(() => {
          // 🤖 Einstufung: war das für IHN ein gutes Spiel? (lib/botScoreRating.ts)
          const r = rateBotScore(c, currentScore ?? c.score);
          if (!r) return null;
          return (
            <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">
              <div className="font-semibold">
                {r.emoji} {r.label} · {botDiffText(r.diffPct)}
              </div>
              <div className="text-xs text-violet-800/80">
                Besser als {String(r.rank).replace(".", ",")} % seiner eigenen Würfe an diesem Flipper · typisch {fmtScore(r.typical)} ·
                schlecht (10 %) {fmtScore(r.bad)} · gut (90 %) {fmtScore(r.good)}
              </div>
            </div>
          );
        })()}
        {changedByHand ? (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ✏️ Der Score wurde danach von Hand geändert: jetzt {fmtScore(currentScore)}.
          </div>
        ) : null}

        <Step n={1} title="Datenbasis">
          <div>
            <b>{c.data.found}</b> Scores an „{c.machine}“ in dieser Location gefunden (beendete Turniere).
          </div>
          {c.data.removedBots ? <div>− {c.data.removedBots} aussortiert: von Bots</div> : null}
          {c.data.removedPlaceholder ? <div>− {c.data.removedPlaceholder} aussortiert: Platzhalter-/Testprofile</div> : null}
          {c.data.removedIgnored ? <div>− {c.data.removedIgnored} aussortiert: als falsch markierte Scores</div> : null}
          {c.data.removedFormat ? <div>− {c.data.removedFormat} aussortiert: Timeplay / DYP</div> : null}
          {c.data.removedNoElo ? <div>− {c.data.removedNoElo} aussortiert: Elo des Spielers damals unbekannt</div> : null}
          <div>
            = <b>{c.data.usable}</b> verwendbar · davon {c.data.sameLevel} auf gleichem Punkteniveau (
            {c.tournament.level === "high" ? "hoch / Extraball" : "normal"}), {c.data.sameLevelSameMode} im gleichen
            Modus, {c.data.otherLevel} auf anderem Niveau
          </div>
        </Step>

        {c.data.usable ? (
          <Step n={2} title="Datentopf">
            <div>
              Genommen: <b>{c.pool.label}</b> ({c.pool.count} Scores)
            </div>
            <div className="text-xs text-neutral-500">
              Gleicher Modus wird nur genommen, wenn es mindestens {S?.minSameMode} Scores gibt. Anderes Niveau wird
              umgerechnet (Faktor {S?.levelFactor}).
            </div>
          </Step>
        ) : null}

        {c.windows.length || c.extrapolation ? (
          <Step n={3} title="Elo-Nachbarn">
            {c.windows.map((w, i) => (
              <div key={i}>
                ±{w.window} Elo → {w.count} Scores {w.ok ? "✓" : `(zu wenig, mind. ${S?.minScores})`}
                {w.ok && w.withK32 ? " – inkl. neuer Spieler (K32), sonst zu wenig" : ""}
              </div>
            ))}
            {c.extrapolation ? (
              <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-900">
                Keine passenden Nachbarn → nächstgelegene Spieler (Ø Elo {c.extrapolation.refElo}) genommen.
                Unterschied {c.extrapolation.diff > 0 ? "+" : ""}
                {c.extrapolation.diff} Elo → Scores × {String(c.extrapolation.factor).replace(".", ",")} (
                {Math.round(((S?.extrapolatePer100 ?? 0.1) * 100))} % je 100 Elo)
              </div>
            ) : null}
          </Step>
        ) : null}

        {c.samples.length ? (
          <Step n={4} title={`Genutzte Scores (${c.samples.length})`}>
            <div className="text-xs text-neutral-500">
              Elo-Sicherheit damals: {c.kCounts.k16}× K16 (voll), {c.kCounts.k24}× K24 (Gewicht {String(S?.kWeights.k24 ?? "").replace(".", ",")}), {c.kCounts.k32}× K32 (
              {c.kCounts.k32Used ? "mitgenommen, sonst zu wenig" : "aussortiert"}). Nähere Elo zählt stärker.
            </div>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-neutral-500">
                  <tr>
                    <th className="py-1 pr-2">Spieler</th>
                    <th className="py-1 pr-2">Elo damals</th>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1 pr-2 text-right">Score</th>
                    <th className="py-1 pr-2 text-right">gerechnet mit</th>
                    <th className="py-1 pr-2 text-right">Gewicht</th>
                    <th className="py-1">Turnier</th>
                  </tr>
                </thead>
                <tbody>
                  {c.samples.map((s, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1 pr-2 font-medium">{s.player}</td>
                      <td className="py-1 pr-2 tabular-nums">{s.elo}</td>
                      <td className="py-1 pr-2">{K_LABEL[s.k] ?? s.k}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmtScore(s.score)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {s.converted ? <span className="text-amber-700">{fmtScore(s.used)}</span> : "="}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{String(s.weight).replace(".", ",")}</td>
                      <td className="py-1 text-neutral-500">
                        {s.tournament} · {fmtLabel(s.format)} · {fmtDate(s.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.dataOutliers.length ? (
              <div className="mt-1 text-xs text-neutral-500">
                Aussortiert als Ausreißer (einzelnes Wahnsinns- oder Pechspiel):{" "}
                {c.dataOutliers.map((o) => `${o.player} (${o.elo}) ${fmtScore(o.score)}`).join(" · ")}
              </div>
            ) : null}
          </Step>
        ) : null}

        {c.range ? (
          <Step n={5} title={`Bereich (mittlere ${(S?.rangeHighPct ?? 90) - (S?.rangeLowPct ?? 10)} %)`}>
            <div>
              <b>{fmtScore(c.range.low)}</b> bis <b>{fmtScore(c.range.high)}</b> · Mitte {fmtScore(c.range.median)}
            </div>
          </Step>
        ) : null}

        {c.roll ? (
          <Step n={6} title="Würfel">
            {c.roll.kind === "normal" ? (
              <div>
                🎲 Normales Spiel (Chance {100 - Math.round((S?.outlierChance ?? 0.1) * 100)} %): bei {String(c.roll.pct).replace(".", ",")} % des
                Bereichs gelandet.
              </div>
            ) : c.roll.kind === "outlier_high" ? (
              <div>
                🍀 Ausreißer nach oben (Chance {Math.round((S?.outlierChance ?? 0.1) * 100)} %): {String(c.roll.pct).replace(".", ",")} % über
                dem Bereich.
              </div>
            ) : (
              <div>
                😬 Ausreißer nach unten (Chance {Math.round((S?.outlierChance ?? 0.1) * 100)} %): {String(c.roll.pct).replace(".", ",")} % unter
                dem Bereich.
              </div>
            )}
            <div>
              = <b>{fmtScore(c.score)}</b> (auf 10 gerundet)
            </div>
          </Step>
        ) : null}
      </div>
    )}
    </>
  );
}

export default function BotCalcDialog({
  calc,
  error,
  currentScore,
  onClose,
}: {
  calc: BotCalc | null;
  error?: string | null;
  currentScore?: number | null;
  onClose: () => void;
}) {
  const c = calc;
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-neutral-50 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">🧾 Rechenzettel</div>
            {c ? (
              <div className="text-sm text-neutral-600">
                🤖 <b>{c.bot.name}</b> ({c.bot.elo}) · {c.machine}
                {c.location ? ` · 📍 ${c.location}` : ""} · {fmtLabel(c.tournament.format)}
                {c.tournament.extraball ? " · 🎱 mit Extraball" : ""}
              </div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-200">
            ✕
          </button>
        </div>
        <BotCalcView calc={calc} error={error} currentScore={currentScore} />
      </div>
    </div>
  );
}
