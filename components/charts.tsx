"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export function BarChart({
  title,
  items,
  valueLabel = "Wert",
}: {
  title: string;
  items: { label: string; value: number }[];
  valueLabel?: string;
}) {
  const max = useMemo(() => Math.max(1, ...items.map(i => i.value)), [items]);
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-neutral-500">{valueLabel}</div>
      </div>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-5 truncate text-xs font-medium">{it.label}</div>
            <div className="col-span-6">
              <div className="h-2 w-full rounded-full bg-neutral-100">
                <div className="h-2 rounded-full bg-black" style={{ width: `${(it.value / max) * 100}%` }} />
              </div>
            </div>
            <div className="col-span-1 text-right text-xs font-semibold tabular-nums">{it.value}</div>
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-neutral-500">Keine Daten.</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Elo-Verlauf
// - passt sich der verfügbaren Breite an (kein Abschneiden, kein Scrollen)
// - Y-Achse wird pro Spieler aus seinen Werten berechnet ("schöne" Schritte)
// - geglättete Linie + Farbfläche (grün über / rot unter Start-Elo)
// - Start-Linie, Peak-Markierung, aktueller Wert
// - Hover/Antippen: Turnier, Datum, Elo, Veränderung
// ─────────────────────────────────────────────────────────────────────────────

export type EloPointDetail = {
  label?: string | null; // z. B. Turniername
  date?: string | null; // ISO-Datum
};

const ELO_NICE_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** Achsenbereich + Schrittweite: auf "schöne" Werte gerundet, ca. 3–6 Linien. */
function niceEloAxis(min: number, max: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 100, step: 50 };
  if (max - min < 1) {
    // nur ein Wert / keine Bewegung: ±50 um den Wert
    min -= 50;
    max += 50;
  }
  for (const step of ELO_NICE_STEPS) {
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    if ((hi - lo) / step <= 5) return { lo, hi: hi === lo ? lo + step : hi, step };
  }
  const step = Math.ceil((max - min) / 5 / 1000) * 1000;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

/** Geglätteter SVG-Pfad ohne Überschwinger (monotone kubische Interpolation). */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  if (n === 2) return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1));
  }
  const t: number[] = new Array(n);
  t[0] = slope[0];
  t[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / slope[i];
    const b = t[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * slope[i];
      t[i + 1] = k * b * slope[i];
    }
  }

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

function formatDateDe(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

export function EloSparkline({
  values,
  details,
  /** Referenzwert für grün/rot + gestrichelte Start-Linie. Default: erster Wert. */
  startValue,
  /** Start-Linie anzeigen. */
  showBaseline = true,
  height = 200,
}: {
  values: number[];
  details?: EloPointDetail[];
  startValue?: number;
  showBaseline?: boolean;
  height?: number;
}) {
  // Breite des Containers messen -> Graph passt sich immer an
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = height;
  const PAD_L = 44; // Platz für Achsenbeschriftung
  const PAD_R = 58; // Platz für aktuellen Wert rechts
  const PAD_T = 26; // Platz für Peak-Markierung
  const PAD_B = 14;

  const g = useMemo(() => {
    if (!values.length || width <= 0) return null;

    const start = startValue ?? values[0];
    const { lo, hi, step } = niceEloAxis(Math.min(start, ...values), Math.max(start, ...values));
    const innerW = Math.max(10, width - PAD_L - PAD_R);
    const innerH = H - PAD_T - PAD_B;

    const xFor = (i: number) =>
      values.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i * innerW) / (values.length - 1);
    const yFor = (v: number) => PAD_T + innerH * (1 - (v - lo) / (hi - lo));

    const pts = values.map((v, i) => ({ x: xFor(i), y: yFor(v), v }));
    const line = monotonePath(pts);
    const bottom = PAD_T + innerH;
    const area =
      pts.length > 1
        ? `${line}L${pts[pts.length - 1].x},${bottom}L${pts[0].x},${bottom}Z`
        : "";

    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);

    let peakIdx = 0;
    values.forEach((v, i) => {
      if (v >= values[peakIdx]) peakIdx = i; // bei Gleichstand: der spätere
    });

    const last = values[values.length - 1];
    const up = last >= start;

    return { start, lo, hi, ticks, pts, line, area, yStart: yFor(start), peakIdx, up, innerW, bottom };
  }, [values, startValue, width, H]);

  const color = g?.up ? "#059669" : "#e11d48"; // emerald-600 / rose-600
  const gradId = `elo-grad-${useId().replace(/:/g, "")}`;
  const showDots = values.length <= 40;

  const act = active != null && g ? g.pts[active] : null;
  const actDetail = active != null ? details?.[active] : undefined;
  const actDelta = active != null && active > 0 ? values[active] - values[active - 1] : null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full select-none"
      style={{ height: H }}
      onMouseLeave={() => setActive(null)}
    >
      {g ? (
        <svg width={width} height={H} className="block">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Hilfslinien + Achsenbeschriftung */}
          {g.ticks.map((t) => {
            const y = PAD_T + (g.bottom - PAD_T) * (1 - (t - g.lo) / (g.hi - g.lo));
            return (
              <g key={t}>
                <line x1={PAD_L} x2={PAD_L + g.innerW} y1={y} y2={y} stroke="rgba(15,23,42,0.07)" />
                <text
                  x={PAD_L - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="rgba(15,23,42,0.45)"
                  className="tabular-nums"
                >
                  {Math.round(t)}
                </text>
              </g>
            );
          })}

          {/* Start-Elo */}
          {showBaseline ? (
            <g>
              <line
                x1={PAD_L}
                x2={PAD_L + g.innerW}
                y1={g.yStart}
                y2={g.yStart}
                stroke="rgba(15,23,42,0.35)"
                strokeDasharray="5 5"
              />
              <text
                x={PAD_L + g.innerW + 6}
                y={g.yStart}
                dominantBaseline="middle"
                fontSize={10}
                fill="rgba(15,23,42,0.45)"
              >
                Start
              </text>
            </g>
          ) : null}

          {/* Fläche + Linie */}
          {g.area ? <path d={g.area} fill={`url(#${gradId})`} /> : null}
          <path
            d={g.line}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Punkte (bei vielen Turnieren ausgeblendet) */}
          {showDots
            ? g.pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="white" stroke={color} strokeWidth={1.5} />
              ))
            : null}

          {/* Peak */}
          {values.length > 1 ? (
            <g>
              <circle cx={g.pts[g.peakIdx].x} cy={g.pts[g.peakIdx].y} r={4} fill="#f59e0b" stroke="white" strokeWidth={1.5} />
              <text
                x={g.pts[g.peakIdx].x}
                y={g.pts[g.peakIdx].y - 10}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="#b45309"
              >
                ⭐ {Math.round(values[g.peakIdx])}
              </text>
            </g>
          ) : null}

          {/* Aktueller Wert */}
          {(() => {
            const p = g.pts[g.pts.length - 1];
            return (
              <g>
                <circle cx={p.x} cy={p.y} r={8} fill={color} opacity={0.18} />
                <circle cx={p.x} cy={p.y} r={4.5} fill={color} stroke="white" strokeWidth={2} />
                {g.peakIdx !== g.pts.length - 1 ? (
                  <text
                    x={p.x + 10}
                    y={p.y}
                    dominantBaseline="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill={color}
                    className="tabular-nums"
                  >
                    {Math.round(p.v)}
                  </text>
                ) : null}
              </g>
            );
          })()}

          {/* Hover-Markierung */}
          {act ? (
            <g pointerEvents="none">
              <line x1={act.x} x2={act.x} y1={PAD_T - 6} y2={g.bottom} stroke="rgba(15,23,42,0.25)" />
              <circle cx={act.x} cy={act.y} r={5} fill="white" stroke={color} strokeWidth={2.5} />
            </g>
          ) : null}

          {/* Unsichtbare Trefferflächen pro Punkt (Maus + Touch) */}
          {g.pts.map((p, i) => {
            const prevX = i === 0 ? PAD_L : (g.pts[i - 1].x + p.x) / 2;
            const nextX = i === g.pts.length - 1 ? PAD_L + g.innerW : (g.pts[i + 1].x + p.x) / 2;
            return (
              <rect
                key={i}
                x={prevX}
                y={0}
                width={Math.max(1, nextX - prevX)}
                height={H}
                fill="transparent"
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive((cur) => (cur === i ? null : i))}
              />
            );
          })}
          <rect
            x={0}
            y={0}
            width={PAD_L}
            height={H}
            fill="transparent"
            onMouseEnter={() => setActive(null)}
          />
        </svg>
      ) : null}

      {/* Tooltip */}
      {act && g ? (
        <div
          className="pointer-events-none absolute z-10 min-w-[9rem] max-w-[14rem] rounded-xl border bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{
            left: Math.min(Math.max(act.x, 80), width - 80),
            top: Math.max(0, act.y - 78),
            transform: "translateX(-50%)",
          }}
        >
          <div className="truncate font-semibold text-neutral-800">{actDetail?.label || "Turnier"}</div>
          {actDetail?.date ? <div className="text-neutral-500">{formatDateDe(actDetail.date)}</div> : null}
          <div className="mt-1 flex items-baseline gap-2 tabular-nums">
            <span className="text-sm font-bold text-neutral-900">{Math.round(act.v)}</span>
            {actDelta != null && Math.round(actDelta) !== 0 ? (
              <span className={actDelta > 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                {actDelta > 0 ? "+" : ""}
                {Math.round(actDelta)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

    </div>
  );
}




// ─────────────────────────────────────────────────────────────────────────────
// Winrate-Mini-Graph (z. B. pro Flipper in der Spieler-Übersicht)
// - feste Skala 0–100 %, damit Flipper untereinander vergleichbar sind
// - gestrichelte 50-%-Linie als Orientierung
// - geglättete Linie + Farbfläche; Farbe nach aktueller Winrate
//   (≥ 60 % grün, ≥ 40 % amber, sonst rot)
// - Endpunkt markiert
// ─────────────────────────────────────────────────────────────────────────────
export function WinrateSparkline({
  values,
  width = 140,
  height = 34,
}: {
  /** Winrate-Werte 0..1 (ältester zuerst) */
  values: number[];
  width?: number;
  height?: number;
}) {
  const gradId = `wr-grad-${useId().replace(/:/g, "")}`;
  const vals = values.map((v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0));
  if (vals.length < 2) return null;

  const PAD_X = 4;
  const PAD_Y = 4;
  const innerW = width - PAD_X * 2;
  const innerH = height - PAD_Y * 2;
  const pts = vals.map((v, i) => ({
    x: PAD_X + (i * innerW) / (vals.length - 1),
    y: PAD_Y + innerH * (1 - v),
  }));
  const line = monotonePath(pts);
  const bottom = PAD_Y + innerH;
  const area = `${line}L${pts[pts.length - 1].x},${bottom}L${pts[0].x},${bottom}Z`;
  const last = vals[vals.length - 1];
  const color = last >= 0.6 ? "#059669" : last >= 0.4 ? "#d97706" : "#e11d48";
  const end = pts[pts.length - 1];
  const y50 = PAD_Y + innerH * 0.5;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
      role="img"
      aria-label={`Winrate-Verlauf, aktuell ${Math.round(last * 100)} %`}
    >
      <title>{`Winrate-Verlauf (letzte ${vals.length} Matches) – aktuell ${Math.round(last * 100)} %`}</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <line
        x1={PAD_X}
        x2={width - PAD_X}
        y1={y50}
        y2={y50}
        stroke="rgba(15,23,42,0.18)"
        strokeDasharray="3 3"
      />
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={end.x} cy={end.y} r={3} fill={color} stroke="white" strokeWidth={1.5} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini-Balken "Punkte pro Runde" (Turnier-Leaderboard, Spalte "Verlauf")
// - ein Balken je Runde, Höhe = Punkte
// - scaleMax: gemeinsamer Maßstab für alle Spieler (damit Balken vergleichbar sind)
// - Farbe: Höchstpunktzahl grün, sonst Punkte blau, 0 Punkte = dünner grauer Strich
// - Hover: "Runde n: x Punkte"
// ─────────────────────────────────────────────────────────────────────────────
export function RoundPointsBars({
  items,
  scaleMax,
  width = 120,
  height = 30,
}: {
  items: { round: number; points: number }[];
  scaleMax?: number;
  width?: number;
  height?: number;
}) {
  const data = items.filter((it) => Number.isFinite(it.points));
  if (data.length === 0) return null;

  const max = Math.max(1, scaleMax ?? 0, ...data.map((d) => d.points));
  const GAP = data.length > 20 ? 1 : 3;
  const barW = Math.max(2, Math.min(16, (width - GAP * (data.length - 1)) / data.length));
  const usedW = data.length * barW + (data.length - 1) * GAP;
  const x0 = width - usedW; // rechtsbündig
  const BASE = height - 1;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img"
      aria-label="Punkte pro Runde">
      <line x1={x0} x2={width} y1={BASE + 0.5} y2={BASE + 0.5} stroke="rgba(15,23,42,0.12)" />
      {data.map((d, i) => {
        const x = x0 + i * (barW + GAP);
        const isTop = d.points > 0 && d.points >= max;
        const h = d.points > 0 ? Math.max(3, ((height - 3) * d.points) / max) : 2;
        const fill = d.points <= 0 ? "#cbd5e1" : isTop ? "#10b981" : "#6366f1";
        return (
          <rect key={i} x={x} y={BASE - h} width={barW} height={h} rx={Math.min(3, barW / 2)} fill={fill}>
            <title>{`Runde ${d.round}: ${fmt(d.points)} Punkt${d.points === 1 ? "" : "e"}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini-Linie "Gesamtpunkte im Turnierverlauf" (aufsummiert, steigt immer)
// - gemeinsame Skalen für alle Spieler: X = Rundennummer, Y = höchste Gesamtpunktzahl
//   -> Linien verschiedener Spieler sind direkt vergleichbar (wer holt auf?)
// ─────────────────────────────────────────────────────────────────────────────
export function CumulativePointsLine({
  items,
  maxTotal,
  roundMin,
  roundMax,
  width = 120,
  height = 30,
}: {
  items: { round: number; points: number }[];
  maxTotal: number;
  roundMin: number;
  roundMax: number;
  width?: number;
  height?: number;
}) {
  const gradId = `cum-grad-${useId().replace(/:/g, "")}`;
  const data = items
    .filter((it) => Number.isFinite(it.points) && Number.isFinite(it.round))
    .sort((a, b) => a.round - b.round);
  if (data.length === 0) return null;

  const PAD = 3;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;
  const rSpan = Math.max(1, roundMax - roundMin + 1);
  const yMax = Math.max(1, maxTotal);

  // Startpunkt bei 0 vor der ersten Runde, dann aufsummieren
  let sum = 0;
  const pts: { x: number; y: number; round: number; total: number }[] = [
    { x: PAD, y: PAD + innerH, round: roundMin - 1, total: 0 },
  ];
  for (const d of data) {
    sum += d.points;
    const x = PAD + (innerW * (d.round - roundMin + 1)) / rSpan;
    pts.push({ x, y: PAD + innerH * (1 - sum / yMax), round: d.round, total: sum });
  }

  const line = monotonePath(pts);
  const bottom = PAD + innerH;
  const area = `${line}L${pts[pts.length - 1].x},${bottom}L${pts[0].x},${bottom}Z`;
  const end = pts[pts.length - 1];
  const color = "#6366f1"; // indigo

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible"
      role="img" aria-label={`Gesamtpunkte: ${sum}`}>
      <title>
        {pts
          .slice(1)
          .map((p) => `Runde ${p.round}: ${p.total} Pkt gesamt`)
          .join("\n")}
      </title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <line x1={PAD} x2={width - PAD} y1={bottom + 0.5} y2={bottom + 0.5} stroke="rgba(15,23,42,0.12)" />
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={end.x} cy={end.y} r={3} fill={color} stroke="white" strokeWidth={1.5} />
    </svg>
  );
}

export function Sparkline({
  values,
}: {
  values: number[];
}) {
  const points = useMemo(() => {
    if (!values.length) return [];

    const w = 120;
    const h = 28;
    const pad = 2;
    const SHIFT_X = 20;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-9, max - min);

    return values.map((v, i) => {
      const x =
        pad +
        SHIFT_X +
        (i * (w - pad * 2 - SHIFT_X)) /
          Math.max(1, values.length - 1);

      const y =
        pad +
        (h - pad * 2) * (1 - (v - min) / span);

      return `${x},${y}`;
    });
  }, [values]);

  if (!points.length) return null;

  return (
    <svg viewBox="0 0 120 28" className="h-7 w-28">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="rgba(107,114,128,0.9)" // neutral gray
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
