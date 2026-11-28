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

        {c.style ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
            {c.style === "gambler" ? "🔴 Gambler-Bot" : "🟣 Pro-Bot"}: eigene Streuung – mittlere{" "}
            {Math.round((c.settings?.rangeHighPct ?? 0) - (c.settings?.rangeLowPct ?? 0))} %,{" "}
            {Math.round((c.settings?.outlierChance ?? 0) * 100)} % Ausreißer bis {Math.round((c.settings?.outlierMax ?? 0) * 100)} %.
          </div>
        ) : null}
        {c.specialist ? (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
            <div className="font-semibold">{c.specialist.character ? "🎭 Charakter-Bot" : "🟠 Specialist-Bot"}</div>
            <div className="text-[13px]">
              Seine Lieblingsflipper in diesem Turnier: <b>{c.specialist.favorites.join(", ") || "–"}</b>
              {c.specialist.character ? (
                <>
                  {" "}
                  · Angstflipper: <b>{(c.specialist.flops ?? []).join(", ") || "–"}</b>
                </>
              ) : null}
              .{" "}
              {c.specialist.isFavorite
                ? `„${c.machine}“ ist ein Liebling (+${c.specialist.bonus} Elo) → gewürfelt wie ${c.specialist.baseElo + c.specialist.bonus} statt ${c.specialist.baseElo}.`
                : c.specialist.isFlop
                ? `„${c.machine}“ ist ein Angstflipper (−${c.specialist.malus ?? 0} Elo) → gewürfelt wie ${Math.max(100, c.specialist.baseElo - (c.specialist.malus ?? 0))} statt ${c.specialist.baseElo}.`
                : `„${c.machine}“ ist ${c.specialist.character ? "weder Liebling noch Angstflipper" : "keiner davon"} → normale Elo ${c.specialist.baseElo}.`}
            </div>
          </div>
        ) : null}
        {/* 🥊 Rivalen-Bot: Stärke aus den Duellen mit seinem Spieler */}
        {c.rival ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
            <div className="font-semibold">🥊 Rivalen-Bot von {c.rival.owner}</div>
            <div className="text-[13px]">
              Start {c.rival.start} · {c.rival.owner} lag {c.rival.wins}× vorne (+{c.rival.step} je Duell), der Rivale {c.rival.losses}× (−
              {c.rival.step}) → Stärke jetzt <b>{c.rival.strength}</b>. Damit wurde gewürfelt (Schritte unten).
            </div>
          </div>
        ) : null}
        {/* 👻/⚡ Ghost-/Form-Bot: eigene Rechnung; bei Ersatz über Elo folgen die normalen Schritte */}
        {c.mirror ? <MirrorSteps c={c} /> : null}
        {c.champion ? <ChampionSteps c={c} /> : null}
        {(c.mirror && !c.mirror.fallback) || c.champion ? null : (
        <>
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
                        {/* ⏱️ andere Spielzeit als dieses Turnier → umgerechnet */}
                        {s.minutes != null && c.tournament.minutes != null && s.minutes !== c.tournament.minutes ? (
                          <span className="ml-1 text-amber-700">· ⏱️ {s.minutes} min</span>
                        ) : null}
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
        </>
        )}
      </div>
    )}
    </>
  );
}

/** 👑 Champion-Bot: Spitzenfeld aller Scores */
function ChampionSteps({ c }: { c: BotCalc }) {
  const ch = c.champion;
  if (!ch) return null;
  const S = c.settings;
  return (
    <>
      <Step n={1} title="👑 Champion-Bot · spielt wie die Besten">
        <div>
          <b>{c.data.usable}</b> verwendbare Scores an „{c.machine}“ in dieser Location (ohne Bots, Platzhalter, falsch markierte,
          Timeplay/DYP) – die Elo der Spieler spielt keine Rolle.
        </div>
        <div>
          Genommen: <b>{c.pool.label}</b> ({ch.poolCount} Scores)
        </div>
        {ch.few ? (
          <div className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
            ⚠️ Nur {ch.poolCount} Scores – „die Besten“ ist hier noch wenig aussagekräftig.
          </div>
        ) : null}
      </Step>
      <Step n={2} title={`Die besten Scores (${c.samples.length})`}>
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-[12px]">
            <tbody>
              {c.samples.map((s, i) => (
                <tr key={i} className="border-t first:border-t-0">
                  <td className="py-0.5 pr-2">{s.player}</td>
                  <td className="py-0.5 pr-2 tabular-nums">{fmtDate(s.date)}</td>
                  <td className="py-0.5 text-right font-semibold tabular-nums">
                    {fmtScore(s.used)}
                    {s.converted ? <span className="ml-1 text-[10px] text-neutral-400">(umgerechnet)</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Step>
      <Step n={3} title="Würfel">
        <div>
          Bereich = zwischen den {Math.round(S?.rangeLowPct ?? 85)} % und {Math.round(S?.rangeHighPct ?? 97)} % besten aller Scores:{" "}
          <b>
            {fmtScore(c.range?.low)} – {fmtScore(c.range?.high)}
          </b>
        </div>
        {c.roll ? (
          <div>
            {c.roll.kind === "normal"
              ? `🎲 Normales Spiel: bei ${String(c.roll.pct).replace(".", ",")} % des Bereichs`
              : c.roll.kind === "outlier_high"
              ? `🍀 Ausreißer nach oben (Chance ${Math.round((S?.outlierChance ?? 0) * 100)} %): ${String(c.roll.pct).replace(".", ",")} % über dem Bereich`
              : `😬 Ausreißer nach unten (Chance ${Math.round((S?.outlierChance ?? 0) * 100)} %): ${String(c.roll.pct).replace(".", ",")} % unter dem Bereich`}
          </div>
        ) : null}
        <div>
          = <b>{fmtScore(c.score)}</b> (auf 10 gerundet)
        </div>
      </Step>
    </>
  );
}

/** 👻 Ghost-Bot / ⚡ Form-Bot: woraus gewürfelt wurde */
function MirrorSteps({ c }: { c: BotCalc }) {
  const m = c.mirror;
  if (!m) return null;
  const ghost = m.kind === "ghost";
  const title = ghost ? `👻 Ghost-Bot · spielt wie ${m.owner}` : `⚡ Form-Bot · folgt der Form von ${m.owner}`;
  return (
    <>
      <Step n={1} title={title}>
        <div>
          <b>{m.found}</b> Scores von {m.owner} an „{c.machine}“ in dieser Location gefunden (beendete Turniere + heute, ohne dieses Match).
        </div>
        <div>Genommen: {m.poolLabel}</div>
        {m.ownerElo != null ? <div>Elo von {m.owner}: {m.ownerElo} (gilt auch als Elo des Bots)</div> : null}
        {m.fallback ? (
          <div className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
            ↪️ {m.fallback} Deshalb Ersatz: gewürfelt wie ein typischer Spieler mit Elo {m.ownerElo ?? "?"} (Schritte unten).
          </div>
        ) : null}
      </Step>
      {!m.fallback ? (
        <>
          <Step n={2} title={ghost ? `Seine Scores (${m.used.length})` : `Seine letzten ${m.used.length === 1 ? "Score" : `${m.used.length} Scores`}`}>
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-[12px]">
                <tbody>
                  {m.used.map((u, i) => (
                    <tr key={i} className="border-t first:border-t-0">
                      <td className="py-0.5 pr-2 tabular-nums">{fmtDate(u.at)}</td>
                      <td className="py-0.5 pr-2">
                        {u.tournament}
                        {u.current ? <span className="ml-1 text-violet-700">(heute)</span> : null}
                      </td>
                      <td className="py-0.5 text-right font-semibold tabular-nums">
                        {fmtScore(u.score)}
                        {u.orig != null && u.minutes != null ? (
                          <span className="block text-[10px] font-normal text-amber-700">
                            ⏱️ {fmtScore(u.orig)} ({u.minutes} min) umgerechnet
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Step>
          <Step n={3} title="Würfel">
            {ghost ? (
              <>
                <div>
                  Bereich = seine mittleren {(c.settings?.rangeHighPct ?? 85) - (c.settings?.rangeLowPct ?? 15)} %:{" "}
                  <b>
                    {fmtScore(c.range?.low)} – {fmtScore(c.range?.high)}
                  </b>{" "}
                  (Mitte {fmtScore(c.range?.median)})
                </div>
                {c.roll ? (
                  <div>
                    {c.roll.kind === "normal"
                      ? `🎲 Normales Spiel: bei ${String(c.roll.pct).replace(".", ",")} % des Bereichs`
                      : c.roll.kind === "outlier_high"
                      ? `🍀 Ausreißer nach oben: ${String(c.roll.pct).replace(".", ",")} % über dem Bereich`
                      : `😬 Ausreißer nach unten: ${String(c.roll.pct).replace(".", ",")} % unter dem Bereich`}
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                Ø {fmtScore(m.avg)} ± {Math.round((m.spreadPct ?? 0) * 100)} % →{" "}
                <b>
                  {fmtScore(c.range?.low)} – {fmtScore(c.range?.high)}
                </b>
                , gleichmäßig gewürfelt
              </div>
            )}
            <div>
              = <b>{fmtScore(c.score)}</b> (auf 10 gerundet)
            </div>
          </Step>
        </>
      ) : null}
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
