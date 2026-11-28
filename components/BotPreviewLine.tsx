"use client";

// 🤖 Admin: Zeile unter einem Bot im Match – was würde er hier würfeln? "📊 typisch 41,2 Mio · schlecht 28,5 · gut 55,0"
// (statt "💪 Bestwert", den Bots nie haben). Gleiche Rechnung wie "Bot spielt" (/api/bots/preview, speichert nichts);
// schlecht/typisch/gut = 10 % / 50 % / 90 % seiner Würfe (lib/botScoreRating.ts – wie im Bot-Labor).

import { useEffect, useState } from "react";
import { botRollQuantile } from "@/lib/botScoreRating";

export type BotPreview = {
  range: { low: number; high: number } | null;
  settings: { outlierChance: number; outlierMax: number };
  specialist: { isFavorite: boolean; isFlop: boolean } | null;
  fallback: string | null;
};

const cache = new Map<string, Promise<BotPreview | null>>();

export function loadBotPreview(code: string, matchId: string, playerId: string, key: string): Promise<BotPreview | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  const p = fetch(
    `/api/bots/preview?code=${encodeURIComponent(code)}&matchId=${encodeURIComponent(matchId)}&playerId=${encodeURIComponent(playerId)}`,
    { cache: "no-store" }
  )
    .then((r) => r.json())
    .then((j) => (j?.ok ? (j as BotPreview) : null))
    .catch(() => {
      cache.delete(key);
      return null;
    });
  cache.set(key, p);
  return p;
}

function short(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString("de-DE", { maximumFractionDigits: 2 })} Mrd`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio`;
  return Math.round(n).toLocaleString("de-DE");
}

export default function BotPreviewLine({
  code,
  matchId,
  playerId,
  machineName,
  hidden,
}: {
  code: string;
  matchId: string;
  playerId: string;
  /** Flipper des Matches – ändert er sich (umgestellt), neu rechnen */
  machineName: string | null | undefined;
  hidden?: boolean;
}) {
  const [pv, setPv] = useState<BotPreview | null>(null);
  const key = `${code}|${matchId}|${playerId}|${machineName ?? ""}`;
  useEffect(() => {
    if (hidden || !machineName) return;
    let alive = true;
    setPv(null);
    loadBotPreview(code, matchId, playerId, key).then((v) => alive && setPv(v));
    return () => {
      alive = false;
    };
  }, [key, hidden, machineName, code, matchId, playerId]);

  if (hidden || !pv?.range) return null;
  const shape = { low: pv.range.low, high: pv.range.high, outlierChance: pv.settings.outlierChance, outlierMax: pv.settings.outlierMax };
  const typ = botRollQuantile(0.5, shape);
  const bad = botRollQuantile(0.1, shape);
  const good = botRollQuantile(0.9, shape);
  return (
    <div
      className="flex flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums text-neutral-500"
      title={`So würfelt er an diesem Flipper: 10 % seiner Würfe liegen unter „schlecht“, 90 % unter „gut“.${pv.fallback ? `\n${pv.fallback}` : ""}`}
    >
      <span>📊 typisch</span>
      <span className="font-semibold text-violet-700">{short(typ)}</span>
      <span>· schlecht {short(bad)}</span>
      <span>· gut {short(good)}</span>
    </div>
  );
}
