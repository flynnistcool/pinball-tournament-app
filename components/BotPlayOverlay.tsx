"use client";

// 🎱 "Bot spielt" als kleine Show (Nutzer 2026-11-28): während der Server würfelt, spielt der Bot sichtbar
// seine 3 Kugeln – Flipper-Display (orange Punktmatrix) mit rasenden Ziffern, springende Kugel, Bumper-Blitze.
// Danach zählt das Display auf den echten Score hoch, die Einstufung (👍/😖 …) erscheint, und erst dann
// wird gespeichert (onDone). "⏩ Überspringen" kürzt ab. Schließt nie von selbst bei Fehlern ohne Hinweis.

import { useEffect, useRef, useState } from "react";
import type { BotCalc } from "@/lib/botScore";
import { botDiffText, rateBotScore } from "@/lib/botScoreRating";

const BALL_MS = 1100; // je Kugel
const BALLS = 3;
const COUNT_MS = 1100; // Hochzählen auf den echten Score
const SHOW_MS = 1700; // Ergebnis stehen lassen

const KEYFRAMES = `
@keyframes bpIn { 0% { opacity: 0 } 100% { opacity: 1 } }
@keyframes bpCard { 0% { opacity: 0; transform: translateY(16px) scale(.96) } 100% { opacity: 1; transform: none } }
@keyframes bpBounce { 0% { transform: translate(0, 0) } 20% { transform: translate(70px, -60px) } 40% { transform: translate(140px, 0) } 60% { transform: translate(70px, -80px) } 80% { transform: translate(10px, -30px) } 100% { transform: translate(0, 0) } }
@keyframes bpBump { 0%,100% { transform: scale(1); filter: none } 50% { transform: scale(1.35); filter: brightness(1.8) drop-shadow(0 0 8px #fbbf24) } }
@keyframes bpSlam { 0% { transform: scale(1.8); opacity: 0 } 60% { transform: scale(.95); opacity: 1 } 100% { transform: scale(1) } }
@keyframes bpFade { 0% { opacity: 0; transform: translateY(6px) } 100% { opacity: 1; transform: none } }
`;

type Result = { ok: true; score: number; calc: BotCalc | null } | { ok: false; error: string; calc?: BotCalc | null };

function fmt(n: number) {
  return Math.round(n).toLocaleString("de-DE");
}

export default function BotPlayOverlay({
  botName,
  machineName,
  result,
  onDone,
  onError,
}: {
  botName: string;
  machineName: string | null;
  /** Ergebnis des Würfelns (läuft schon, wenn das Overlay erscheint) */
  result: Promise<Result>;
  /** fertig angezeigt → jetzt speichern */
  onDone: (score: number, calc: BotCalc | null) => void;
  onError: (error: string, calc: BotCalc | null) => void;
}) {
  const [ball, setBall] = useState(1);
  const [res, setRes] = useState<Result | null>(null);
  const [phase, setPhase] = useState<"play" | "count" | "show">("play");
  const [shown, setShown] = useState(0);
  const [noise, setNoise] = useState("000000000");
  const [skip, setSkip] = useState(false);
  const doneRef = useRef(false);

  // Ergebnis abholen
  useEffect(() => {
    let alive = true;
    result.then((r) => alive && setRes(r));
    return () => {
      alive = false;
    };
  }, [result]);

  // Kugeln 1–3 + rasende Ziffern
  useEffect(() => {
    if (phase !== "play") return;
    const t = window.setInterval(() => {
      setNoise(String(Math.floor(Math.random() * 1e9)).padStart(9, "0"));
    }, 70);
    const b = window.setInterval(() => setBall((x) => Math.min(BALLS, x + 1)), BALL_MS);
    return () => {
      window.clearInterval(t);
      window.clearInterval(b);
    };
  }, [phase]);

  // nach der 3. Kugel (oder Überspringen) + Ergebnis da → hochzählen
  useEffect(() => {
    if (phase !== "play" || !res) return;
    if (!res.ok) {
      if (!doneRef.current) {
        doneRef.current = true;
        onError(res.error, res.calc ?? null);
      }
      return;
    }
    const wait = skip ? 0 : Math.max(0, BALLS * BALL_MS - (ball - 1) * BALL_MS);
    const t = window.setTimeout(() => setPhase("count"), wait);
    return () => window.clearTimeout(t);
  }, [res, phase, skip, ball, onError]);

  // Hochzählen auf den echten Score
  useEffect(() => {
    if (phase !== "count" || !res?.ok) return;
    const target = res.score;
    const dur = skip ? 250 : COUNT_MS;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(target * eased);
      if (k < 1) raf = requestAnimationFrame(step);
      else setPhase("show");
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, res, skip]);

  // Ergebnis stehen lassen → speichern
  useEffect(() => {
    if (phase !== "show" || !res?.ok || doneRef.current) return;
    const t = window.setTimeout(
      () => {
        doneRef.current = true;
        onDone(res.score, res.calc);
      },
      skip ? 400 : SHOW_MS
    );
    return () => window.clearTimeout(t);
  }, [phase, res, skip, onDone]);

  const rating = res?.ok && phase !== "play" ? rateBotScore(res.calc, res.score) : null;
  const display = phase === "play" ? noise : fmt(shown).padStart(11, " ");

  return (
    <div className="fixed inset-0 z-[290] flex items-center justify-center bg-neutral-950/85 p-4 text-white" style={{ animation: "bpIn .35s ease-out" }}>
      <style>{KEYFRAMES}</style>
      <div
        className="w-full max-w-md rounded-3xl border-2 border-violet-400/60 bg-gradient-to-b from-neutral-900 to-neutral-800 p-5 text-center shadow-2xl"
        style={{ animation: "bpCard .4s ease-out" }}
      >
        <div className="text-xs uppercase tracking-[0.3em] text-violet-300">🤖 Bot spielt</div>
        <div className="mt-1 truncate text-xl font-black">{botName}</div>
        {machineName ? <div className="text-sm text-white/60">an {machineName}</div> : null}

        {/* kleines Spielfeld: Kugel springt zwischen Bumpern */}
        <div className="relative mx-auto mt-4 h-28 w-56 overflow-hidden rounded-2xl bg-gradient-to-b from-indigo-950 to-neutral-900 ring-1 ring-white/10">
          {phase === "play" ? (
            <>
              {["left-6 top-4", "right-6 top-6", "left-24 top-10"].map((pos, i) => (
                <span
                  key={pos}
                  className={"absolute text-2xl " + pos}
                  style={{ animation: `bpBump .5s ease-in-out ${i * 0.17}s infinite` }}
                >
                  💥
                </span>
              ))}
              <span className="absolute bottom-3 left-6 text-xl" style={{ animation: "bpBounce 1.1s ease-in-out infinite" }}>
                ⚪
              </span>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-4xl" style={{ animation: "bpSlam .45s ease-out" }}>
              {rating ? rating.emoji : "🏁"}
            </div>
          )}
        </div>

        {/* Kugeln */}
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-white/60">
          {Array.from({ length: BALLS }, (_, i) => (
            <span
              key={i}
              className={
                "inline-flex h-6 items-center rounded-full px-2 font-semibold " +
                (phase !== "play" || i + 1 < ball ? "bg-white/10 text-white/40" : i + 1 === ball ? "bg-violet-500 text-white" : "bg-white/5")
              }
            >
              Ball {i + 1}
            </span>
          ))}
        </div>

        {/* Flipper-Display (orange Punktmatrix) */}
        <div className="mx-auto mt-3 rounded-xl border-2 border-neutral-700 bg-black px-3 py-2">
          <div
            className="whitespace-pre font-mono text-3xl font-black tracking-widest text-orange-400"
            style={{ textShadow: "0 0 8px rgba(251,146,60,.8)", filter: phase === "play" ? "blur(.4px)" : undefined }}
          >
            {display}
          </div>
        </div>

        <div className="mt-3 h-12">
          {rating && phase === "show" ? (
            <div style={{ animation: "bpFade .35s ease-out" }}>
              <div className="text-lg font-black">
                {rating.emoji} {rating.label}
              </div>
              <div className="text-xs text-white/60">{botDiffText(rating.diffPct)}</div>
            </div>
          ) : phase === "play" ? (
            <div className="text-sm text-white/50">{res ? "letzte Kugel …" : "spielt …"}</div>
          ) : null}
        </div>

        {phase === "play" || phase === "count" ? (
          <button
            type="button"
            onClick={() => setSkip(true)}
            className="mt-1 rounded-lg border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
          >
            ⏩ Überspringen
          </button>
        ) : null}
      </div>
    </div>
  );
}
