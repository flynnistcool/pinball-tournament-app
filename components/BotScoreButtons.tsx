"use client";

// 🤖 Admin: Knopf "Bot spielt" (würfelt den Score über /api/bots/roll) und ℹ️ für den Rechenzettel.
// Das Speichern des Scores übernimmt der Aufrufer (onRolled) – gleicher Weg wie eine Eingabe von Hand.

import { useState } from "react";
import BotCalcDialog from "@/components/BotCalcDialog";
import type { BotCalc } from "@/lib/botScore";

export default function BotScoreButtons({
  code,
  matchId,
  playerId,
  hasScore,
  currentScore,
  disabled,
  onRolled,
}: {
  code: string;
  matchId: string;
  playerId: string;
  hasScore: boolean;
  currentScore: number | null;
  disabled?: boolean;
  onRolled: (score: number) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [calc, setCalc] = useState<BotCalc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function roll() {
    if (busy || disabled) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/bots/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, matchId, playerId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? "Bot konnte nicht spielen");
        if (j?.calc) setCalc(j.calc);
        return;
      }
      setCalc(j.calc ?? null);
      await onRolled(Number(j.score));
    } catch {
      setErr("Netzwerkfehler – Bot konnte nicht spielen");
    } finally {
      setBusy(false);
    }
  }

  async function openCalc() {
    setOpen(true);
    if (calc && calc.score === currentScore) return;
    try {
      const res = await fetch(`/api/bots/calc?matchId=${encodeURIComponent(matchId)}&playerId=${encodeURIComponent(playerId)}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.ok) setCalc(j.calc);
      else if (!calc) setErr(j?.error ?? "Kein Rechenzettel vorhanden");
    } catch {
      if (!calc) setErr("Rechenzettel konnte nicht geladen werden");
    }
  }

  return (
    <>
      {!hasScore ? (
        <button
          type="button"
          onClick={roll}
          disabled={busy || disabled}
          className="ml-1 inline-flex h-7 items-center whitespace-nowrap rounded-md border border-violet-300 bg-violet-50 px-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
          title="Der KI-Bot würfelt seinen Score anhand echter Scores ähnlich starker Spieler"
        >
          {busy ? "🤖 spielt …" : "🤖 Bot spielt"}
        </button>
      ) : null}
      {hasScore || calc ? (
        <button
          type="button"
          onClick={openCalc}
          className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white text-sm hover:bg-neutral-50"
          title="Rechenzettel: so hat der Bot den Score berechnet"
        >
          ℹ️
        </button>
      ) : null}
      {err && !open ? (
        <button
          type="button"
          onClick={() => setErr(null)}
          className="ml-1 max-w-[220px] truncate rounded-md bg-red-50 px-2 py-1 text-left text-[11px] text-red-700"
          title={err}
        >
          ⚠️ {err}
        </button>
      ) : null}
      {open ? (
        <BotCalcDialog
          calc={calc}
          error={calc ? null : err}
          currentScore={currentScore}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
