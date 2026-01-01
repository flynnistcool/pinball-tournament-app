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
        <div className="text-base font-semibold">{title}</div>
        <div className="text-xs text-neutral-500">{valueLabel}</div>
      </div>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-5 truncate text-sm font-medium">{it.label}</div>
            <div className="col-span-6">
              <div className="h-3 w-full rounded-full bg-neutral-100">
                <div className="h-3 rounded-full bg-black" style={{ width: `${(it.value / max) * 100}%` }} />
              </div>
            </div>
            <div className="col-span-1 text-right text-sm font-semibold tabular-nums">{it.value}</div>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm text-neutral-500">Keine Daten.</div>}
      </div>
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const pts = useMemo(() => {
    if (!values.length) return "";
    const w = 120, h = 28, pad = 2;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-9, max - min);
    return values.map((v, i) => {
      const x = pad + (i * (w - pad*2)) / Math.max(1, values.length - 1);
      const y = pad + (h - pad*2) * (1 - (v - min) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [values]);

  return (
    <svg viewBox="0 0 120 28" className="h-7 w-28">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" className="text-black" />
    </svg>
  );
}
