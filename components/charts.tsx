"use client";
import { useMemo } from "react";

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



export function EloSparkline({
  values,
  /** Referenzwert für „grün/rot“ und Baseline. Default: erster Wert. */
  startValue,
  /** Baseline + Label anzeigen. */
  showBaseline = true,
}: {
  values: number[];
  startValue?: number;
  showBaseline?: boolean;
}) {
  const geom = useMemo(() => {
    if (!values.length) {
      return {
        points: [] as { x: number; y: number; v: number }[],
        yStart: null as number | null,
        start: null as number | null,
        maxAbs: 1,
        min: 0,
        max: 0,
        span: 1,
        pad: 2,
        h: 112,
        padTop: 22,
        padBottom: 10,
      };
    }

    const h = 112;
    const pad = 2;

    // ✅ mehr Headroom oben/unten für Labels (damit 1700 "darüber" Platz hat)
    const padTop = 35;
    const padBottom = 10;

    const SHIFT_X = 25;
    const STEP_PX = 28;
    const w = pad * 2 + Math.max(1, values.length - 1) * STEP_PX + SHIFT_X;

    const start = startValue ?? values[0];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-9, max - min);

    const yForLocal = (v: number) =>
      padTop + (h - padTop - padBottom) * (1 - (v - min) / span);

    const points = values.map((v, i) => {
      const x =
        pad +
        SHIFT_X +
        (i * (w - pad * 2 - SHIFT_X)) / Math.max(1, values.length - 1);
      const y = yForLocal(v);
      return { x, y, v };
    });

    const yStart = yForLocal(start);
    const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v - start)));

    return {
      points,
      yStart,
      start,
      maxAbs,
      min,
      max,
      span,
      pad,
      h,
      padTop,
      padBottom,
    };
  }, [values, startValue]);

  if (!values.length) return null;

  const STEP_PX = 28;
  const pad = 2;
  const SHIFT_X = 25;
  const svgW = pad * 2 + Math.max(1, values.length - 1) * STEP_PX + SHIFT_X;

  const STEP_ELO = 100;
  const NEAR_ELO = 50;

  const yFor = (value: number) =>
    geom.padTop +
    (geom.h - geom.padTop - geom.padBottom) *
      (1 - (value - geom.min) / geom.span);

  // ✅ Nur sinnvolle "nächste" 100er Linien anzeigen (max. 2 Schritte hoch/runter)
  const extraLevels: number[] = [];
  if (geom.start != null) {
    const start = geom.start;

    const up1 = start + STEP_ELO;
    if (geom.max >= up1 - NEAR_ELO) extraLevels.push(up1);

    const up2 = start + 2 * STEP_ELO;
    if (geom.max >= up2 - NEAR_ELO) extraLevels.push(up2);

    const down1 = start - STEP_ELO;
    if (geom.min <= down1 + NEAR_ELO) extraLevels.push(down1);

    const down2 = start - 2 * STEP_ELO;
    if (geom.min <= down2 + NEAR_ELO) extraLevels.push(down2);
  }

  // ✅ Labels “stacken”, damit 1700/1600 nicht übereinander kleben
  // Wir positionieren Labels standardmäßig oberhalb der Linie,
  // aber wenn zwei Labels zu nah sind, schieben wir das höhere nochmal weiter nach oben.
  const labelPlacements = useMemo(() => {
    const topClamp = 12;      // nicht über diesen Y-Wert (oben) hinaus
    const baseOffset = 6;     // "oberhalb der Linie"
    const minGap = 12;        // minimaler Abstand zwischen Labeln

    // nur Level, die wir labeln wollen (extraLevels)
    const lvls = [...extraLevels].sort((a, b) => b - a); // höher zuerst (1700 vor 1600)

    const placed = new Map<number, number>();
    let lastY: number | null = null;

    for (const lvl of lvls) {
      const yLine = yFor(lvl);
      let yLabel = yLine - baseOffset;

      if (lastY != null && Math.abs(yLabel - lastY) < minGap) {
        // zu nah -> noch weiter nach oben schieben
        yLabel = lastY - minGap;
      }

      // clamp nach oben
      yLabel = Math.max(topClamp, yLabel);

      placed.set(lvl, yLabel);
      lastY = yLabel;
    }

    return placed;
  }, [extraLevels, geom.h, geom.padTop, geom.padBottom, geom.min, geom.span]);

  return (
    <svg
      viewBox={`0 0 ${svgW} 112`}
      style={{ width: svgW, height: 112 }}
      className="overflow-visible"
    >
      {/* Baseline (Start-Elo) */}
      {showBaseline && geom.yStart != null && geom.start != null && (
        <g>
          <line
            x1={pad}
            y1={geom.yStart}
            x2={svgW - pad}
            y2={geom.yStart}
            stroke="rgba(17,24,39,0.18)"
            strokeWidth={1}
            strokeDasharray="6 6"
          />

          <text
            x={pad}
            y={Math.max(14, geom.yStart - 2)}
            fontSize={10}
            fill="rgba(16, 22, 33, 0.55)"
            dominantBaseline="ideographic"
          >
            {Math.round(geom.start)}
          </text>
        </g>
      )}

      {/* Extra-Baselines */}
      {showBaseline &&
        geom.start != null &&
        extraLevels.map((lvl) => {
          const y = yFor(lvl);
          const labelY = labelPlacements.get(lvl) ?? Math.max(14, y - 6);

          return (
            <g key={lvl}>
              <line
                x1={pad}
                y1={y}
                x2={svgW - pad}
                y2={y}
                stroke="rgba(17,24,39,0.12)"
                strokeWidth={1}
                strokeDasharray="6 6"
              />
              <text
                x={pad}
                y={labelY+4}
                fontSize={10}
                fill="rgba(13, 18, 30, 0.4)"
                dominantBaseline="ideographic"
              >
                {lvl}
              </text>
            </g>
          );
        })}

      {/* Segmente: einheitlich schwarz */}
      {geom.points.map((p, i) => {
        const n = geom.points[i + 1];
        if (!n) return null;

        return (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={n.x}
            y2={n.y}
            stroke="rgba(0,0,0,0.9)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}
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





