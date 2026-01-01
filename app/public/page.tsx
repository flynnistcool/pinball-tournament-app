"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, Pill, Select, Input, Button } from "@/components/ui";
import { BarChart } from "@/components/charts";

export default function PublicOverview() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [category, setCategory] = useState<"all"|"normal"|"league"|"fun">("all");
  const [year, setYear] = useState<string>("all");
  const [q, setQ] = useState<string>("");

  async function load() {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (category !== "all") params.set("category", category);
    if (year !== "all") params.set("year", year);
    if (q.trim()) params.set("q", q.trim());

    const res = await fetch(`/api/public/overview?${params.toString()}`, { cache: "no-store" });
    const j = await res.json();
    setTournaments(j.tournaments ?? []);
    setLeaders(j.leaderboard ?? []);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { load(); }, [category, year]);

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const t of tournaments) if (t.season_year) ys.add(t.season_year);
    return Array.from(ys).sort((a,b)=>b-a);
  }, [tournaments]);

  const top = leaders.slice(0, 10).map((r:any)=>({ label: r.name, value: r.points }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-neutral-500">Pinball</div>
              <div className="text-lg font-semibold">Öffentliche Übersicht</div>
              <div className="mt-1 text-sm text-neutral-600">Alle Turniere & Ranglisten (nur lesen).</div>
            </div>
            <div className="flex items-center gap-2">
              <Pill>Read-only</Pill>
              <a className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200" href="/">Admin</a>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <div className="mb-1 text-sm text-neutral-600">Kategorie</div>
              <Select value={category} onChange={(e)=> { setCategory(e.target.value as any); }}>
                <option value="all">Alle</option>
                <option value="normal">Normal</option>
                <option value="league">Liga</option>
                <option value="fun">Spaß</option>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-sm text-neutral-600">Jahr</div>
              <Select value={year} onChange={(e)=> setYear(e.target.value)}>
                <option value="all">Alle</option>
                {years.map((y)=> <option key={y} value={String(y)}>{y}</option>)}
              </Select>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-sm text-neutral-600">Suche</div>
              <div className="flex gap-2">
                <Input value={q} onChange={(e)=> setQ(e.target.value)} placeholder="Turniername…" />
                <Button variant="secondary" onClick={load}>Suchen</Button>
              </div>
            </div>
          </div>

          <div className="mt-3 text-sm text-neutral-600">
            Turnier-Detailansicht: öffne <b>/t/TOURNIER_CODE</b> (oder klicke unten).
          </div>
        </CardBody>
      </Card>

      <BarChart title="Overall Top (Match-Punkte)" items={top} valueLabel="Punkte" />

      <Card>
        <CardHeader>Turniere</CardHeader>
        <CardBody>
          <div className="space-y-2">
            {tournaments.map((t:any) => (
              <a key={t.id} href={`/t/${encodeURIComponent(t.code)}`} className="block rounded-2xl border bg-white px-4 py-3 hover:bg-neutral-50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{t.name}</div>
                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                    {t.category === "league" ? <Pill>Liga {t.season_year ?? ""}</Pill> : <Pill>Normal</Pill>}
                    {t.locations?.name ? <Pill>📍 {t.locations.name}</Pill> : null}
                    <Pill>Code: <span className="ml-2 font-semibold">{t.code}</span></Pill>
                    <Pill>{t.match_size ?? 4} Spieler/Match</Pill>
                  </div>
                </div>
              </a>
            ))}
            {tournaments.length === 0 && <div className="text-sm text-neutral-500">Keine Turniere für diesen Filter.</div>}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Overall Rangliste (Top 50)</CardHeader>
        <CardBody>
          <div className="overflow-hidden rounded-2xl border bg-white">
            <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Spieler</div>
              <div className="col-span-2 text-right">Punkte</div>
              <div className="col-span-2 text-right">Turniere</div>
              <div className="col-span-2 text-right">Winrate</div>
            </div>
            {leaders.map((r:any, idx:number) => (
              <div key={r.key} className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0">
                <div className="col-span-1 text-neutral-500">{idx+1}</div>
                <div className="col-span-5 font-medium">{r.profileId ? <a className="underline decoration-neutral-300 hover:decoration-neutral-600" href={`/p/${encodeURIComponent(r.profileId)}`}>{r.name}</a> : r.name}</div>
                <div className="col-span-2 text-right font-semibold tabular-nums">{r.points}</div>
                <div className="col-span-2 text-right tabular-nums">{r.tournamentsPlayed}</div>
                <div className="col-span-2 text-right tabular-nums">{r.winrate}%</div>
              </div>
            ))}
            {leaders.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">Noch keine Ergebnisse.</div>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
