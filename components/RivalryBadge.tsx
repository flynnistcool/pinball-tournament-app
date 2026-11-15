"use client";

// ⚔️ Gegner-Duell-Hinweis als dezente Zeile/Badge (Admin, TV, Handy).
// Daten: /api/public/rivalry – nur EINMAL pro Runde laden (refreshKey), geteilt zwischen allen Komponenten.

import { useEffect, useState } from "react";
import { insightText, type PairState, type RivalryInsight } from "@/lib/rivalryInsights";

type Insights = Record<string, RivalryInsight>;
export type RivalryData = { insights: Insights; pairs: Record<string, PairState> };
const EMPTY: RivalryData = { insights: {}, pairs: {} };

const store = new Map<string, { key: string; data: RivalryData | null; promise: Promise<RivalryData> | null }>();

function load(code: string, refreshKey: string): Promise<RivalryData> {
  const cur = store.get(code);
  if (cur && cur.key === refreshKey) {
    if (cur.data) return Promise.resolve(cur.data);
    if (cur.promise) return cur.promise;
  }
  const promise = fetch(`/api/public/rivalry?code=${encodeURIComponent(code)}&ts=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((j): RivalryData => (j?.ok ? { insights: j.insights ?? {}, pairs: j.pairs ?? {} } : EMPTY))
    .catch(() => EMPTY)
    .then((data) => {
      const now = store.get(code);
      if (now && now.key === refreshKey) now.data = data;
      return data;
    });
  store.set(code, { key: refreshKey, data: cur?.key === refreshKey ? cur.data : null, promise });
  return promise;
}

/**
 * Hinweise + Duell-Stand je Paar für ein Turnier. refreshKey = z. B. Zahl der Runden → neu laden nur bei neuer Runde.
 * Bis zum Laden: letzter bekannter Stand (kein Flackern).
 */
export function useRivalryData(code: string | null | undefined, refreshKey: string, enabled = true): RivalryData {
  const [data, setData] = useState<RivalryData>(() => (code ? store.get(code)?.data ?? EMPTY : EMPTY));
  useEffect(() => {
    if (!code || !enabled) return;
    let cancelled = false;
    load(code, refreshKey).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [code, refreshKey, enabled]);
  return data;
}

/** nur die Hinweise (Badges) */
export function useRivalry(code: string | null | undefined, refreshKey: string, enabled = true): Insights {
  return useRivalryData(code, refreshKey, enabled).insights;
}

const KIND_STYLE: Record<RivalryInsight["kind"], { light: string; tv: string }> = {
  streak: { light: "bg-orange-50 text-orange-800 ring-orange-200", tv: "bg-orange-400/15 text-orange-200 ring-orange-300/30" },
  nemesis: { light: "bg-rose-50 text-rose-800 ring-rose-200", tv: "bg-rose-400/15 text-rose-200 ring-rose-300/30" },
  even: { light: "bg-amber-50 text-amber-800 ring-amber-200", tv: "bg-amber-400/15 text-amber-200 ring-amber-300/30" },
  jubilee: { light: "bg-sky-50 text-sky-800 ring-sky-200", tv: "bg-sky-400/15 text-sky-200 ring-sky-300/30" },
};

export default function RivalryBadge({
  insight,
  nameOf,
  variant = "light",
  className = "",
}: {
  insight: RivalryInsight | null | undefined;
  nameOf: (playerId: string) => string;
  /** light = Admin/Handy, tv = dunkler Infobildschirm */
  variant?: "light" | "tv";
  className?: string;
}) {
  if (!insight) return null;
  const { icon, text } = insightText(insight, nameOf);
  const style = KIND_STYLE[insight.kind][variant];
  return (
    <div
      className={
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 ring-1 " +
        (variant === "tv" ? "text-sm font-semibold " : "text-[11px] font-semibold ") +
        style +
        " " +
        className
      }
      title={text}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

/** ⚔️ "Duelle des Abends": die spannendsten Hinweise des ganzen Turniers (für Round the Pinball) */
export function RivalryBar({
  insights,
  nameOf,
  variant = "light",
  max = 3,
  className = "",
}: {
  insights: Record<string, RivalryInsight>;
  nameOf: (playerId: string) => string;
  variant?: "light" | "tv";
  max?: number;
  className?: string;
}) {
  const top = Object.values(insights)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  if (!top.length) return null;
  return (
    <div
      className={
        (variant === "tv"
          ? "flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-2 ring-1 ring-white/10 "
          : "flex flex-wrap items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 ring-1 ring-neutral-200 ") + className
      }
    >
      <span className={variant === "tv" ? "text-sm font-bold text-white/60" : "text-[11px] font-bold text-neutral-500"}>
        ⚔️ Duelle des Abends
      </span>
      {top.map((ins) => (
        <RivalryBadge key={ins.a + "|" + ins.b} insight={ins} nameOf={nameOf} variant={variant} />
      ))}
    </div>
  );
}

/** Round the Pinball: alle Runden entstehen auf einmal → stattdessen alle 5 Minuten neu laden */
export function rtpRefreshKey(): string {
  return "rtp-" + Math.floor(Date.now() / (5 * 60 * 1000));
}
