"use client";

// 📊 Übergangsphase (Nutzer 2026-11-28): zwei Siegchancen gegen einen Bot nebeneinander –
//   "nach Elo"        = so rechnet die App heute (Balken darüber, Favorit, TV, Handy)
//   "nach Scores"     = in wie vielen deiner letzten Spiele an DIESEM Flipper (diese Location) hättest du diesen Bot
//                       geschlagen? Je Score: Anteil seiner Würfe darunter (lib/botScoreRating botRollCdf), dann Mittelwert.
// Nur Anzeige – noch nicht in der Favoriten-Rechnung. Ab MIN_SCORES eigenen Scores am Flipper.

import { useEffect, useState } from "react";
import { loadBotPreview, type BotPreview } from "@/components/BotPreviewLine";
import { useMachineRecords } from "@/components/MatchRecordsLine";
import { botRollCdf } from "@/lib/botScoreRating";
import { machineKey, personalKey } from "@/lib/recordWatch";

const MIN_SCORES = 5;
const LAST_N = 10;

export default function BotScoreChance({
  code,
  matchId,
  botPlayerId,
  profileId,
  machineName,
  eloChance,
}: {
  code: string;
  matchId: string;
  /** players.id des Bots im Match */
  botPlayerId: string;
  /** Profil des Menschen */
  profileId: string | null;
  machineName: string | null;
  /** Siegchance nach Elo (0..1), wie im Balken */
  eloChance: number | null;
}) {
  const [pv, setPv] = useState<BotPreview | null>(null);
  const loaded = useMachineRecords(code, true, [profileId]);
  const key = `${code}|${matchId}|${botPlayerId}|${machineName ?? ""}`;
  useEffect(() => {
    if (!machineName) return;
    let alive = true;
    loadBotPreview(code, matchId, botPlayerId, key).then((v) => alive && setPv(v));
    return () => {
      alive = false;
    };
  }, [key, code, matchId, botPlayerId, machineName]);

  if (!machineName || !profileId || !pv?.range || !loaded?.enabled) return null;
  const hist = (loaded.personalHistory?.[personalKey(String(profileId), machineKey(machineName))] ?? []).slice(-LAST_N);
  const shape = { low: pv.range.low, high: pv.range.high, outlierChance: pv.settings.outlierChance, outlierMax: pv.settings.outlierMax };
  const scoreChance = hist.length >= MIN_SCORES ? hist.reduce((s, h) => s + botRollCdf(h.score, shape), 0) / hist.length : null;
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const diff = scoreChance != null && eloChance != null ? Math.round((scoreChance - eloChance) * 100) : null;

  return (
    <div
      className="pl-9 flex flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums text-neutral-500"
      title={
        "Übergangsphase – zwei Rechnungen zum Vergleich:\n" +
        "• nach Elo: so rechnet die App heute (Balken, Favorit, TV, Handy).\n" +
        `• nach deinen Scores: In wie vielen deiner letzten ${LAST_N} Spiele an ${machineName} (diese Location) hättest du diesen Bot geschlagen? ` +
        "Für jeden Score zählt, wie viele seiner Würfe darunter liegen – davon der Durchschnitt.\n" +
        `Ab ${MIN_SCORES} Spielen am Flipper. Noch nicht in der Favoriten-Rechnung.`
      }
    >
      <span>📊 Siegchance</span>
      <span>
        nach Elo <b className="text-neutral-700">{eloChance != null ? pct(eloChance) : "–"}</b>
      </span>
      <span>·</span>
      {scoreChance != null ? (
        <span>
          nach deinen Scores hier <b className="text-indigo-700">{pct(scoreChance)}</b>{" "}
          <span className="text-neutral-400">({hist.length} Spiele)</span>
          {diff != null && Math.abs(diff) >= 5 ? (
            <span className={diff > 0 ? "ml-1 text-emerald-600" : "ml-1 text-rose-500"}>
              {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-neutral-400">
          nach deinen Scores: zu wenig Spiele hier ({hist.length}/{MIN_SCORES})
        </span>
      )}
    </div>
  );
}
