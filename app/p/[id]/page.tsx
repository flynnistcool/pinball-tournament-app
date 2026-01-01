"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import { BarChart } from "@/components/charts";

export default function ProfilePage({ params }: any) {
  const id = String(params?.id ?? "");
  const [data, setData] = useState<any>(null);

  async function load() {
    const res = await fetch(`/api/public/profile?profileId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await res.json();
    setData(j);
  }

  useEffect(() => { load(); }, [id]);

  const p = data?.profile;
  const s = data?.stats;
  const ms = data?.machineStats ?? [];

  const chart = ms.slice(0,8).map((m:any)=>({ label: m.machine, value: m.winrate }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-2xl border bg-neutral-100">
                {p?.avatar_url ? <img src={p.avatar_url} alt={p?.name ?? ""} className="h-full w-full object-cover" /> : null}
              </div>
              <div>
                <div className="text-sm text-neutral-500">Spielerprofil</div>
                <div className="text-lg font-semibold">{p?.name ?? "…"}</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Pill>Read-only</Pill>
                  {typeof p?.rating === "number" ? <Pill>Elo {Math.round(p.rating)}</Pill> : null}
                </div>
              </div>
            </div>
            <a className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200" href="/public">Zur Übersicht</a>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-neutral-500">Turniere</div>
              <div className="text-2xl font-semibold">{s?.tournamentsPlayed ?? 0}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-neutral-500">Matches</div>
              <div className="text-2xl font-semibold">{s?.matches ?? 0}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-neutral-500">Siege</div>
              <div className="text-2xl font-semibold">{s?.wins ?? 0}</div>
            </div>
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-xs text-neutral-500">Winrate / Ø-Platz</div>
              <div className="text-2xl font-semibold">{s?.winrate ?? 0}%</div>
              <div className="mt-1 text-xs text-neutral-500">Ø {s?.avgPos ?? "—"}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <BarChart title="Winrate pro Maschine (Top)" items={chart} valueLabel="%" />

      <Card>
        <CardHeader>Maschinen-Statistik (Top 20 nach Spiele)</CardHeader>
        <CardBody>
          <div className="overflow-hidden rounded-2xl border bg-white">
            <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              <div className="col-span-6">Maschine</div>
              <div className="col-span-2 text-right">Spiele</div>
              <div className="col-span-2 text-right">Siege</div>
              <div className="col-span-2 text-right">Winrate</div>
            </div>
            {ms.map((m:any) => (
              <div key={m.machineId} className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0">
                <div className="col-span-6 font-medium">{m.machine}</div>
                <div className="col-span-2 text-right tabular-nums">{m.plays}</div>
                <div className="col-span-2 text-right tabular-nums">{m.wins}</div>
                <div className="col-span-2 text-right tabular-nums">{m.winrate}%</div>
              </div>
            ))}
            {ms.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">Noch keine Ergebnisse.</div>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
