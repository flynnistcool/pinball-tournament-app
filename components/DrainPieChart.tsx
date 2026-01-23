"use client";

import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

type Row = {
  label: string;
  value: number;
};

export function DrainPieChart({
  rows,
  height = 220,
}: {
  rows: Row[];
  height?: number;
}) {
  // simple, stabile Farben (kannst du später an deine Badge-Farben angleichen)
  const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#64748b"];

  if (!rows || rows.length === 0) return null;

  const total = rows.reduce((acc, r) => acc + (r.value || 0), 0) || 1;

  return (
    <div className="rounded-md border bg-white p-2">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
            >
              {rows.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>

            <Tooltip
              formatter={(value: any, name: any) => {
                const v = Number(value || 0);
                const pct = Math.round((v / total) * 100);
                return [`${v}x • ${pct}%`, String(name)];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* kleine Legende (optional, aber super hilfreich) */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {rows.slice(0, 6).map((r, i) => {
          const pct = Math.round(((r.value || 0) / total) * 100);
          return (
            <div key={r.label} className="flex items-center gap-2 text-[11px] text-neutral-700">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="truncate">{r.label}</span>
              <span className="ml-auto tabular-nums text-neutral-500">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
