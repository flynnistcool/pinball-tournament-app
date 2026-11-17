"use client";

// ⚔️ Gegner-Duell-Hinweis als dezente Zeile/Badge (Admin, TV, Handy).
// Daten: /api/public/rivalry – nur EINMAL pro Runde laden (refreshKey), geteilt zwischen allen Komponenten.

import { useEffect, useState } from "react";
import { insightText, type PairState, type RivalryInsight } from "@/lib/rivalryInsights";
import { useBadgeOn } from "@/components/DisplayDevice";

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
  always = false,
  wrap = false,
}: {
  /** innerhalb von "Duelle des Abends" (hat eigene Einstellung) */
  always?: boolean;
  /** TV: Text darf umbrechen (z. B. in der schmalen Ecke über der Spielerspalte) */
  wrap?: boolean;
  insight: RivalryInsight | null | undefined;
  nameOf: (playerId: string) => string;
  /** light = Admin/Handy, tv = dunkler Infobildschirm */
  variant?: "light" | "tv";
  className?: string;
}) {
  const on = useBadgeOn("badge:rivalry"); // 🏷️ an/aus je Gerät
  if (!insight || (!on && !always)) return null;
  const { icon, text } = insightText(insight, nameOf);
  const style = KIND_STYLE[insight.kind][variant];
  return (
    <div
      className={
        "inline-flex max-w-full items-center gap-1.5 px-2.5 py-0.5 ring-1 " +
        (variant === "tv" ? "rounded-full text-sm font-semibold " : "rounded-xl text-[11px] font-semibold leading-snug ") +
        style +
        " " +
        className
      }
      title={text}
    >
      <span className="shrink-0">{icon}</span>
      {/* TV: eine Zeile; Admin/Handy: Text darf umbrechen (schmale Spalte) */}
      <span className={variant === "tv" && !wrap ? "truncate" : "min-w-0 text-left"}>{text}</span>
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
  /** tvStack = TV, untereinander ohne eigenen Kasten (Ecke über der Spielerspalte) */
  variant?: "light" | "tv" | "tvStack";
  max?: number;
  className?: string;
}) {
  const on = useBadgeOn("badge:rivalryBar"); // 🏷️ an/aus je Gerät
  const top = Object.values(insights)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
  if (!on || !top.length) return null;
  if (variant === "tvStack") {
    return (
      <div className={"flex flex-col items-start gap-1.5 " + className}>
        <span className="text-xs font-bold uppercase tracking-wider text-white/50">⚔️ Duelle des Abends</span>
        {top.map((ins) => (
          <RivalryBadge
            key={ins.a + "|" + ins.b}
            insight={ins}
            nameOf={nameOf}
            variant="tv"
            always
            wrap
            className="!flex w-full !items-start !rounded-xl !py-1 text-left !text-[13px] leading-snug"
          />
        ))}
      </div>
    );
  }
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
        <RivalryBadge key={ins.a + "|" + ins.b} insight={ins} nameOf={nameOf} variant={variant} always />
      ))}
    </div>
  );
}

/** Round the Pinball: alle Runden entstehen auf einmal → stattdessen alle 5 Minuten neu laden */
export function rtpRefreshKey(data?: {
  players?: unknown[] | null;
  match_players?: { score?: number | string | null }[] | null;
} | null): string {
  // alle 5 Minuten – und zusätzlich nach jedem fertigen Durchgang (≈ eingetragene Scores / Spieler)
  const players = data?.players?.length ?? 0;
  const scored = (data?.match_players ?? []).filter((mp) => mp.score != null && mp.score !== "").length;
  const waves = players ? Math.floor(scored / players) : 0;
  return "rtp-" + Math.floor(Date.now() / (5 * 60 * 1000)) + "-" + waves;
}
