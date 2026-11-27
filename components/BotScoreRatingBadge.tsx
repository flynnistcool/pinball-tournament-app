"use client";

// 🤖 Admin: Einstufung eines Bot-Scores neben dem "🤖 Bot · 1500"-Abzeichen
// ("👍 gutes Spiel · 15 % über typisch"). Grundlage: Rechenzettel des Wurfs (/api/bots/calc),
// Rechnung: lib/botScoreRating.ts. Ohne Rechenzettel (Score von Hand ohne Würfeln) → nichts.

import { useEffect, useState } from "react";
import { botDiffText, rateBotScore } from "@/lib/botScoreRating";
import type { BotCalc } from "@/lib/botScore";

const fmt = new Intl.NumberFormat("de-DE");
// Rechenzettel je Match|Spieler (ändert sich nur durch neues Würfeln)
const cache = new Map<string, Promise<BotCalc | null>>();

function loadCalc(matchId: string, playerId: string, force: boolean): Promise<BotCalc | null> {
  const key = `${matchId}|${playerId}`;
  const hit = cache.get(key);
  if (hit && !force) return hit;
  const p = fetch(`/api/bots/calc?matchId=${encodeURIComponent(matchId)}&playerId=${encodeURIComponent(playerId)}`, {
    cache: "no-store",
  })
    .then((r) => r.json())
    .then((j) => (j?.ok && j.calc ? (j.calc as BotCalc) : null))
    .catch(() => {
      cache.delete(key);
      return null;
    });
  cache.set(key, p);
  return p;
}

export default function BotScoreRatingBadge({
  matchId,
  playerId,
  score,
}: {
  matchId: string;
  playerId: string;
  score: number | null;
}) {
  const [calc, setCalc] = useState<BotCalc | null>(null);
  useEffect(() => {
    if (score == null) {
      setCalc(null);
      return;
    }
    let alive = true;
    // passt der gemerkte Rechenzettel nicht zum Score (gerade neu gewürfelt) → einmal frisch holen;
    // passt er danach immer noch nicht, wurde von Hand geändert → trotzdem gegen seinen Bereich einstufen
    loadCalc(matchId, playerId, false).then((c) => {
      if (!alive) return;
      if (!c || (c.score != null && Math.round(c.score) !== Math.round(score))) {
        loadCalc(matchId, playerId, true).then((c2) => alive && setCalc(c2));
      } else setCalc(c);
    });
    return () => {
      alive = false;
    };
  }, [matchId, playerId, score]);

  const r = rateBotScore(calc, score);
  if (!r) return null;
  const tone =
    r.tier === "top" || r.tier === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : r.tier === "typical"
      ? "border-neutral-200 bg-neutral-50 text-neutral-600"
      : "border-red-200 bg-red-50 text-red-600";
  return (
    <span
      className={"inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[11px] font-semibold " + tone}
      title={`Für seine Verhältnisse an diesem Flipper: besser als ${String(r.rank).replace(".", ",")} % seiner Würfe.\nTypisch: ${fmt.format(r.typical)} · schlecht (10 %): ${fmt.format(r.bad)} · gut (90 %): ${fmt.format(r.good)}`}
    >
      {r.emoji} {r.label}
      <span className="font-normal opacity-80">· {botDiffText(r.diffPct)}</span>
    </span>
  );
}
