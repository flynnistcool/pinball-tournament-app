"use client";

// 🎱 DYP: Kontrolle – je Spieler, wie oft an Flipper / Arcade / Kicker … (Logik: lib/dypDeviceCounts.ts)

import { useEffect, useMemo, useState } from "react";
import { dypDeviceCounts } from "@/lib/dypDeviceCounts";

const LS_KEY = "pb_open_dyp_devices";

export default function DypDeviceCounts({
  players,
  machines,
  matches,
  matchPlayers,
}: {
  players: any[];
  machines: any[];
  matches: any[];
  matchPlayers: any[];
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v != null) setOpen(v === "1");
    } catch {}
  }, []);
  function toggle() {
    setOpen((v) => {
      try {
        localStorage.setItem(LS_KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  }

  const { cats, rows, totals, machineList } = useMemo(
    () =>
      dypDeviceCounts(
        (players ?? []).filter((p: any) => p?.active !== false),
        machines ?? [],
        matches ?? [],
        matchPlayers ?? []
      ),
    [players, machines, matches, matchPlayers]
  );

  if (!cats.length) return null;

  const line = (counts: Record<string, number>) =>
    cats.map((c, i) => {
      const n = counts[c.key] ?? 0;
      return (
        <span key={c.key} title={c.label} className={n ? "text-gray-700" : "text-neutral-300"}>
          {i ? ", " : ""}
          {n} × {c.short}
        </span>
      );
    });

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className={
          "px-2.5 pt-4 pb-2.5 text-gray-900 text-sm font-semibold flex items-center gap-2 cursor-pointer select-none " +
          (open ? "border-b" : "")
        }
      >
        <span>Geräte je Spieler</span>
        <span className="text-neutral-400 text-xs">{open ? "▾" : "▸"}</span>
      </div>
      {open ? (
        <div className="px-2.5 py-2 text-[13px]">
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id}>
                <div className="font-semibold text-gray-900 truncate">{r.name}</div>
                <div className="text-[12px] tabular-nums leading-snug">{line(r.counts)}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t pt-2">
            <div className="font-semibold text-gray-900">Matches gesamt</div>
            <div className="text-[12px] tabular-nums leading-snug">{line(totals)}</div>
          </div>
          <div className="mt-2 border-t pt-2">
            <div className="font-semibold text-gray-900">Jedes Gerät einzeln</div>
            <div className="mt-0.5 space-y-0.5 text-[12px] leading-snug">
              {/* andere Geräte einzeln, Flipper darunter als Gruppe */}
              {machineList.filter((m) => !m.pinball).map((m) => (
                <div key={m.id} className={"flex items-center justify-between gap-2 " + (m.count ? "text-gray-700" : "text-neutral-300")}>
                  <span className="truncate">{m.name}</span>
                  <span className="shrink-0 tabular-nums">{m.count}×</span>
                </div>
              ))}
              {machineList.some((m) => m.pinball) ? (
                <>
                  <div className="flex items-center justify-between gap-2 pt-1 font-semibold text-gray-800">
                    <span>Flipper ({machineList.filter((m) => m.pinball).length})</span>
                    <span className="shrink-0 tabular-nums">
                      {machineList.filter((m) => m.pinball).reduce((s, m) => s + m.count, 0)}×
                    </span>
                  </div>
                  {machineList.filter((m) => m.pinball).map((m) => (
                    <div
                      key={m.id}
                      className={"flex items-center justify-between gap-2 border-l-2 border-neutral-200 pl-2 " + (m.count ? "text-gray-700" : "text-neutral-300")}
                    >
                      <span className="truncate">{m.name}</span>
                      <span className="shrink-0 tabular-nums">{m.count}×</span>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-2 text-[11px] leading-snug text-neutral-400">
            {cats.map((c) => `${c.short} = ${c.label}`).join(" · ")}
          </div>
        </div>
      ) : null}
    </div>
  );
}
