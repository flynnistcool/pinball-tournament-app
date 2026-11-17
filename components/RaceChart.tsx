"use client";

// 📈 "Rennen"-Graph für den Infobildschirm (dunkles Design):
// alle Spieler starten bei 0, jede Runde steigt die Linie um die Rundenpunkte.
// Gestrichelte Abschnitte = Runde noch nicht fertig (vorläufig).

import { useEffect, useRef, useState } from "react";
import type { RaceData } from "@/lib/raceChart";
import { solidColor } from "@/lib/playerColor";

export type RacePlayer = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  /** 🤖 KI-Bot: feste Elo (undefined = kein Bot) */
  botElo?: number | null;
};

// gut unterscheidbare Linienfarben (nach Platz vergeben)
const PALETTE = [
  "#facc15", // gelb
  "#38bdf8", // hellblau
  "#f472b6", // pink
  "#4ade80", // grün
  "#fb923c", // orange
  "#a78bfa", // lila
  "#2dd4bf", // türkis
  "#f87171", // rot
  "#e2e8f0", // hellgrau
  "#a3e635", // limette
  "#818cf8", // indigo
  "#fbbf24", // bernstein
];

function niceStep(max: number) {
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const s of candidates) if (max / s <= 6) return s;
  return Math.ceil(max / 6);
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function RaceChart({
  data,
  players,
  width: minWidth,
  height,
  roundLabels,
  roundIcons,
  title = "Verlauf",
}: {
  data: RaceData;
  players: RacePlayer[];
  width: number;
  height: number;
  /** optionale Unterzeile je Rundennummer (z. B. Flippername bei Rotation) */
  roundLabels?: Record<number, string>;
  /** 🎰 statt "R1, R2 …" das Flipper-Icon (Round the Pinball: jede Runde = ein Flipper) */
  roundIcons?: Record<number, string>;
  title?: string;
}) {
  // 📏 so breit wie der Kasten (die TV-Seite kann durch die Kopfzeile breiter sein) – mindestens "width"
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBoxW(el.offsetWidth); // Layout-Breite (unabhängig vom scale() der TV-Seite)
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const width = Math.max(minWidth, boxW);
  const R = data.rounds.length;
  const hasProvisional = data.rounds.some((r) => r.provisional);

  // Spieler nach Endstand sortieren (bestimmt Farbe + Reihenfolge der Beschriftung)
  const ranked = [...players]
    .map((p) => {
      const arr = data.cumulative[p.id] ?? [0];
      return { p, arr, final: arr[arr.length - 1] ?? 0 };
    })
    .sort((a, b) => b.final - a.final || a.p.name.localeCompare(b.p.name));

  const colorOf: Record<string, string> = {};
  ranked.forEach((x, i) => (colorOf[x.p.id] = PALETTE[i % PALETTE.length]));

  // Platz (gleiche Punkte = gleicher Platz) – für dickere Linien bei den Top 3
  const placeOf: Record<string, number> = {};
  ranked.forEach((x, i) => {
    const prev = ranked[i - 1];
    placeOf[x.p.id] = prev && prev.final === x.final ? placeOf[prev.p.id] : i + 1;
  });

  // Geometrie
  const padL = 64;
  // 🤖 mit Bots: rechts so viel Platz wie nötig (Name + Abzeichen "Bot · Elo" + Punktzahl), nicht mehr
  const nameW = (name: string) => Math.min(name.length, 14) * 10; // geschätzt, 18 px fett
  const hasBots = players.some((p) => p.botElo !== undefined);
  // ohne Bots: rechts nur so breit wie der längste Name + Punktzahl direkt dahinter (vorher fest 300 px)
  const maxNameW = Math.max(40, ...players.map((p) => nameW(p.name)));
  // Platz für die Punktzahl (rechtsbündig): je Ziffer ~14 px bei 22 px fett – nach der größten Zahl
  const maxDigits = String(Math.max(0, ...ranked.map((r) => Math.round(r.final)))).length;
  const SCORE_W = maxDigits * 14 + 2;
  const SCORE_GAP = 12; // Abstand Name → Punktzahl
  const padR = hasBots
    ? Math.max(
        220,
        26 + Math.max(...players.map((p) => 36 + nameW(p.name) + (p.botElo !== undefined ? 8 + 116 : 0))) + 66
      )
    : 26 + 36 + maxNameW + SCORE_GAP + SCORE_W + 8;
  const padT = 28;
  const padB = roundLabels ? 78 : 56;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const step = niceStep(Math.max(1, data.maxValue));
  const yMax = Math.max(step, Math.ceil(data.maxValue / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);

  const x = (i: number) => padL + (R === 0 ? 0 : (i / R) * plotW);
  const y = (v: number) => padT + plotH - (v / yMax) * plotH;

  // Beschriftungen rechts: Kollisionen auflösen (Mindestabstand)
  const GAP = Math.min(40, Math.max(26, plotH / Math.max(1, ranked.length)));
  const labels = ranked
    .map((r) => ({ ...r, want: y(r.final), at: y(r.final) }))
    .sort((a, b) => a.want - b.want);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].at - labels[i - 1].at < GAP) labels[i].at = labels[i - 1].at + GAP;
  }
  const bottomLimit = padT + plotH + 10;
  const overflow = labels.length ? labels[labels.length - 1].at - bottomLimit : 0;
  if (overflow > 0) {
    for (const l of labels) l.at -= overflow;
    for (let i = labels.length - 2; i >= 0; i--) {
      if (labels[i + 1].at - labels[i].at < GAP) labels[i].at = labels[i + 1].at - GAP;
    }
  }

  // Zeichnen: zuerst hintere Plätze, Spitzenreiter zuletzt (liegt oben)
  const drawOrder = [...ranked].reverse();

  return (
    <div ref={boxRef} className="overflow-hidden rounded-3xl bg-white/[0.04] shadow-2xl ring-1 ring-white/10">
      <div className="flex items-end justify-between px-6 pb-1 pt-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-widest text-indigo-300/80">📈 {title}</div>
          <div className="text-2xl font-extrabold">Punkte nach jeder Runde</div>
        </div>
        {hasProvisional ? (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <svg width="34" height="6">
              <line x1="0" y1="3" x2="34" y2="3" stroke="white" strokeOpacity="0.6" strokeWidth="3" strokeDasharray="6 5" />
            </svg>
            vorläufig – Runde läuft noch
          </div>
        ) : null}
      </div>

      {R === 0 ? (
        <div className="px-6 pb-10 pt-6 text-xl text-white/40">Noch keine Runde gewertet – der Verlauf startet nach der ersten Runde.</div>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
          {/* Gitter + Y-Achse */}
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={y(v)}
                y2={y(v)}
                stroke="white"
                strokeOpacity={v === 0 ? 0.25 : 0.07}
                strokeWidth={v === 0 ? 1.5 : 1}
              />
              <text x={padL - 14} y={y(v) + 6} textAnchor="end" fill="white" fillOpacity="0.45" fontSize="17" fontWeight="600">
                {v}
              </text>
            </g>
          ))}

          {/* X-Achse: Start, R1, R2 … */}
          {Array.from({ length: R + 1 }, (_, i) => {
            const rd = i > 0 ? data.rounds[i - 1] : null;
            const sub = rd && roundLabels ? roundLabels[rd.no] : undefined;
            return (
              <g key={i}>
                <line x1={x(i)} x2={x(i)} y1={padT} y2={padT + plotH} stroke="white" strokeOpacity="0.05" />
                {i > 0 && rd && roundIcons?.[rd.no] ? (
                  // 🎰 Flipper-Icon (Emoji bzw. Kürzel) statt "R1"
                  <text
                    x={x(i)}
                    y={padT + plotH + 33}
                    textAnchor="middle"
                    fill="white"
                    fillOpacity={rd.provisional ? 0.5 : 0.85}
                    fontSize={[...roundIcons[rd.no]].length <= 2 ? 24 : 16}
                    fontWeight="800"
                  >
                    {roundIcons[rd.no]}
                  </text>
                ) : (
                  <text
                    x={x(i)}
                    y={padT + plotH + 30}
                    textAnchor="middle"
                    fill="white"
                    fillOpacity={rd?.provisional ? 0.4 : 0.6}
                    fontSize="17"
                    fontWeight="700"
                  >
                    {i === 0 ? "Start" : `R${rd?.no}`}
                  </text>
                )}
                {sub ? (
                  <text x={x(i)} y={padT + plotH + 54} textAnchor="middle" fill="white" fillOpacity="0.35" fontSize="14">
                    {sub.length > 16 ? sub.slice(0, 15) + "…" : sub}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Linien */}
          {drawOrder.map(({ p, arr }) => {
            const c = colorOf[p.id];
            const top = (placeOf[p.id] ?? 99) <= 3;
            const w = top ? 5 : 3.5;
            return (
              <g key={p.id} opacity={top ? 1 : 0.85}>
                {arr.slice(1).map((v, i) => {
                  const prov = data.rounds[i]?.provisional;
                  return (
                    <line
                      key={i}
                      x1={x(i)}
                      y1={y(arr[i])}
                      x2={x(i + 1)}
                      y2={y(v)}
                      stroke={c}
                      strokeWidth={w}
                      strokeLinecap="round"
                      strokeDasharray={prov ? "9 8" : undefined}
                      strokeOpacity={prov ? 0.75 : 1}
                      style={{ filter: top ? `drop-shadow(0 0 4px ${c})` : undefined }}
                    />
                  );
                })}
                {arr.map((v, i) => (
                  <circle key={i} cx={x(i)} cy={y(v)} r={top ? 5 : 4} fill={c} stroke="#0b0d1a" strokeWidth="2" />
                ))}
              </g>
            );
          })}

          {/* Beschriftung am Linienende */}
          {labels.map(({ p, final, want, at }) => {
            const c = colorOf[p.id];
            const ex = x(R);
            const lx = padL + plotW + 26;
            const place = placeOf[p.id];
            return (
              <g key={p.id}>
                <path
                  d={`M ${ex + 6} ${want} C ${ex + 16} ${want}, ${lx - 12} ${at}, ${lx - 2} ${at}`}
                  fill="none"
                  stroke={c}
                  strokeOpacity="0.5"
                  strokeWidth="1.5"
                />
                <circle cx={lx + 14} cy={at} r="14" fill={solidColor(p.color) || "#334155"} stroke={c} strokeWidth="2.5" />
                <text x={lx + 14} y={at + 6} textAnchor="middle" fontSize={p.icon ? 16 : 12} fontWeight="800" fill="white">
                  {p.icon || initials(p.name)}
                </text>
                <text x={lx + 36} y={at + 6} fill="white" fontSize="18" fontWeight={place <= 3 ? 800 : 600}>
                  {p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name}
                </text>
                {p.botElo !== undefined ? (
                  // 🤖 Abzeichen wie im Leaderboard – direkt hinter dem Namen
                  // (Textbreite geschätzt: ~11 px je Zeichen bei 18 px fett; nie über die Punktzahl hinaus)
                  <g transform={`translate(${Math.min(lx + 36 + nameW(p.name) + 8, width - 66 - 116) - (width - 66 - 116)}, 0)`}>
                    <rect
                      x={width - 66 - 116}
                      y={at - 13}
                      width={116}
                      height={26}
                      rx={13}
                      fill="rgba(139,92,246,0.25)"
                      stroke="rgba(196,181,253,0.4)"
                      strokeWidth="1"
                    />
                    <text
                      x={width - 66 - 58}
                      y={at + 5}
                      textAnchor="middle"
                      fill="#ede9fe"
                      fontSize="14"
                      fontWeight="700"
                    >
                      🤖 Bot{typeof p.botElo === "number" ? ` · ${Math.round(p.botElo)}` : ""}
                    </text>
                  </g>
                ) : null}
                <text
                  x={hasBots ? width - 14 : lx + 36 + maxNameW + SCORE_GAP + SCORE_W}
                  y={at + 7}
                  textAnchor="end"
                  fill={c}
                  fontSize="22"
                  fontWeight="900"
                >
                  {final}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
