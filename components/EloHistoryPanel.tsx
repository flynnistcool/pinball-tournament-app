"use client";

// 📈 Elo-Verlauf eines Spielers (wie im Spielerprofil "Überblick"): Graph, Trend, Peak & Tiefster.
// Wird z. B. im Elo-Leaderboard beim Aufklappen eines Spielers gezeigt.

import { useEffect, useState } from "react";
import { EloSparkline } from "@/components/charts";

type Point = { tournamentId: string | null; tournamentName: string; created_at: string | null; rating: number };

export default function EloHistoryPanel({ profileId }: { profileId: string }) {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setPoints(null);
    setErr(null);
    fetch("/api/players/elo-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId }),
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) {
          setErr(j?.error ?? "Elo-Verlauf konnte nicht geladen werden.");
          setPoints([]);
          return;
        }
        // gleiche Aufbereitung wie im Spielerprofil: Start-Elo + Elo nach jedem Turnier
        const raw: any[] = j?.history ?? [];
        const out: Point[] = [];
        if (raw.length) {
          const first = raw[0];
          const start =
            typeof first.rating_before === "number"
              ? first.rating_before
              : typeof first.rating_after === "number"
              ? first.rating_after
              : null;
          if (start != null) {
            out.push({ tournamentId: null, tournamentName: "Start-Elo", created_at: first.created_at ?? null, rating: start });
          }
          for (const h of raw) {
            if (typeof h.rating_after !== "number") continue;
            out.push({
              tournamentId: h.tournamentId ?? h.tournament_id ?? null,
              tournamentName: h.tournamentName ?? h.tournament_name ?? h.name ?? "(ohne Name)",
              created_at: h.created_at ?? null,
              rating: h.rating_after,
            });
          }
        }
        setPoints(out);
      })
      .catch(() => {
        if (!alive) return;
        setErr("Netzwerkfehler beim Laden des Elo-Verlaufs.");
        setPoints([]);
      });
    return () => {
      alive = false;
    };
  }, [profileId]);

  if (points == null) return <div className="px-2 py-3 text-sm text-neutral-500">Lade Elo-Verlauf …</div>;
  if (err) return <div className="px-2 py-3 text-sm text-red-600">⚠️ {err}</div>;
  if (points.length < 2) {
    return <div className="px-2 py-3 text-sm text-neutral-500">Noch kein Elo-Verlauf (keine abgeschlossenen Turniere mit Elo).</div>;
  }

  const first = points[0].rating;
  const last = points[points.length - 1].rating;
  const trend = Math.round(last - first);
  const peak = points.reduce((b, c) => (c.rating > b.rating ? c : b), points[0]);
  const low = points.reduce((b, c) => (c.rating < b.rating ? c : b), points[0]);
  const n = points.length - 1;
  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("de-DE") : "");

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-neutral-700">📈 Elo-Verlauf</span>
          <span className="text-[13px] text-neutral-500">
            {n} Turnier{n === 1 ? "" : "e"}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-[2px] text-[13px] font-semibold " +
              (trend > 0 ? "bg-emerald-50 text-emerald-700" : trend < 0 ? "bg-red-50 text-red-700" : "bg-neutral-100 text-neutral-600")
            }
          >
            Trend: {trend > 0 ? "+" : trend < 0 ? "-" : "±"}
            {Math.abs(trend)} Elo
          </span>
          <span className="text-[13px] text-neutral-500">
            Aktuell: <span className="font-semibold tabular-nums">{Math.round(last)}</span>
          </span>
        </div>
      </div>
      <div className="mb-3 mt-2 w-full">
        <EloSparkline
          values={points.map((p) => p.rating)}
          details={points.map((p) => ({ label: p.tournamentName, date: p.created_at }))}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-neutral-700">
        <div>
          <div className="font-semibold">Peak-Elo</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">{Math.round(peak.rating)}</div>
          {peak.tournamentId ? (
            <div className="max-w-[200px] truncate text-[11px] text-neutral-500">
              {peak.tournamentName}
              {peak.created_at ? ` • ${fmtDate(peak.created_at)}` : ""}
            </div>
          ) : null}
        </div>
        <div className="text-right">
          <div className="font-semibold">Tiefster Elo</div>
          <div className="text-base font-semibold tabular-nums text-neutral-900">{Math.round(low.rating)}</div>
          <div className="max-w-[200px] truncate text-[11px] text-neutral-500">
            {low.tournamentId === null ? "Start-Elo" : low.tournamentName}
          </div>
        </div>
      </div>
    </div>
  );
}
