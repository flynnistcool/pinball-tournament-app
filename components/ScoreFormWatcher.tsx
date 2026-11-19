"use client";

// 📊 Score-Form (Turnier-Shortnews): sobald ein Score 10 s lang nicht mehr korrigiert wurde →
// Ticker-Eintrag "Flo · 🦈 Jaws: 3.094.985 – 40.000 unter dem eigenen Schnitt (−1 %) – 😌 Solide. …".
// Vergleich mit dem eigenen Schnitt auf diesem Flipper an dieser Location (gleiches Punkteniveau,
// ab 1 früheren Spiel – lib/scoreForm.ts). Neuer Highscore/Rekord → keine eigene Meldung, der Satz
// hängt dann an der Highscore-Meldung (components/RecordCelebration.tsx).
// Nur die Admin-Seite trägt ein (onFeed). Beim ersten Laden schon vorhandene Scores lösen nichts aus.

import { useEffect, useRef } from "react";
import type { FeedItemInput } from "@/lib/feed";
import type { MmData } from "@/lib/myMatch";
import { useMachineRecords } from "@/components/MatchRecordsLine";
import { evaluateEntry, liveEntriesFrom, personalKey } from "@/lib/recordWatch";
import { scoreForm, scoreFormFeedItem } from "@/lib/scoreForm";

const STABLE_MS = 10_000;
const TICK_MS = 2_000;

export default function ScoreFormWatcher({
  code,
  data,
  onFeed,
}: {
  code: string;
  data: MmData | null | undefined;
  onFeed?: (items: FeedItemInput[]) => void;
}) {
  const finished = String(data?.tournament?.status ?? "") === "finished";
  const loaded = useMachineRecords(
    code,
    !finished,
    (data?.players ?? []).map((p) => (p.profile_id ? String(p.profile_id) : null))
  );
  const dataRef = useRef<MmData | null>(null);
  dataRef.current = data ?? null;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const onFeedRef = useRef(onFeed);
  onFeedRef.current = onFeed;
  /** schon bewertet: key → score */
  const seenRef = useRef<Map<string, number> | null>(null);
  /** frisch eingetragen: seit wann mit welchem Score */
  const pendingRef = useRef<Map<string, { since: number; score: number }>>(new Map());

  useEffect(() => {
    seenRef.current = null;
    pendingRef.current = new Map();
    const check = () => {
      const d = dataRef.current;
      if (!d || !Array.isArray(d.match_players) || !Array.isArray(d.matches)) return;
      const dCode = (d.tournament as { code?: string | null } | null)?.code;
      if (dCode && String(dCode).toUpperCase() !== String(code).toUpperCase()) return;
      const entries = liveEntriesFrom(d);
      if (!seenRef.current) {
        seenRef.current = new Map(entries.map((e) => [e.key, e.score]));
        return;
      }
      const seen = seenRef.current;
      const pend = pendingRef.current;
      const rec = loadedRef.current;
      const now = Date.now();
      const ready: FeedItemInput[] = [];
      const isDone = String(d.tournament?.status ?? "") === "finished";

      const machineOfMatch = new Map(d.matches.map((m) => [String(m.id), String(m.machine_id ?? "")]));
      const iconOfMachine = new Map((d.machines ?? []).map((m) => [String(m.id), String(m.icon_emoji ?? "").trim() || null]));

      for (const e of entries) {
        if (seen.get(e.key) === e.score) {
          pend.delete(e.key);
          continue;
        }
        const p = pend.get(e.key);
        if (!p || p.score !== e.score) {
          pend.set(e.key, { since: now, score: e.score }); // neu oder korrigiert → Zeit neu starten
          continue;
        }
        if (now - p.since < STABLE_MS) continue;
        if (!rec) continue; // Schnitte noch nicht geladen → später bewerten
        pend.delete(e.key);
        seen.set(e.key, e.score);
        if (isDone || !rec.enabled || !e.profileId) continue;
        if ((rec.prior.excludedProfiles ?? []).includes(e.profileId)) continue; // 🤖 Bots
        // neuer Highscore/Rekord → dort wird der Satz angehängt, keine zweite Meldung
        const celeb = evaluateEntry(
          e,
          { records: rec.prior.records, monthly: rec.prior.monthly, personal: rec.personal, excludedProfiles: rec.prior.excludedProfiles },
          entries
        );
        if (celeb) continue;
        const a = rec.personalAvg?.[personalKey(e.profileId, e.machineKey)];
        const form = a ? scoreForm(e.score, a.avg, a.n, `${e.key}|${e.score}`) : null;
        if (!form || !a) continue;
        const matchId = e.key.split("|")[0];
        ready.push(
          scoreFormFeedItem({
            entryKey: e.key,
            playerName: e.playerName,
            machineName: e.machineName ?? "?",
            machineIcon: iconOfMachine.get(machineOfMatch.get(matchId) ?? "") ?? null,
            score: e.score,
            avg: a.avg,
            n: a.n,
            form,
          })
        );
      }
      // gelöschte Scores vergessen
      const live = new Set(entries.map((e) => e.key));
      for (const k of Array.from(pend.keys())) if (!live.has(k)) pend.delete(k);

      if (ready.length && onFeedRef.current) onFeedRef.current(ready);
    };
    check();
    const t = window.setInterval(check, TICK_MS);
    return () => window.clearInterval(t);
  }, [code]);

  return null;
}
