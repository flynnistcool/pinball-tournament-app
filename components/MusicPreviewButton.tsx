"use client";

// ▶️ Probehören der Timer-Musik (Round the Pinball): spielt das unten ausgewählte Lied an.
// Zufall → ein zufälliges Lied aus der Auswahl. Nochmal tippen = Stopp, nach 30 s Schluss.
// Wird während des Probehörens ein anderes Lied gewählt, spielt sofort das neue.
// Lautstärke wie beim Timer; iPad/iPhone (Safari ignoriert audio.volume) → über einen GainNode.

import { useEffect, useRef, useState } from "react";
import { pickTrack, type MusicChoice, type RotationTrack } from "@/lib/rotationMusic";

const PREVIEW_MS = 30_000;

export default function MusicPreviewButton({
  choice,
  volume,
  disabled = false,
  className = "",
}: {
  choice: MusicChoice;
  /** 0..1 – wie die Timer-Musik */
  volume: number;
  /** z. B. solange der Timer läuft */
  disabled?: boolean;
  className?: string;
}) {
  const [track, setTrack] = useState<RotationTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const lastIdRef = useRef<string | null>(null);

  const vol = Math.min(1, Math.max(0, volume));

  function stop() {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    const a = audioRef.current;
    if (a) {
      try {
        a.pause();
        a.removeAttribute("src");
        a.load();
      } catch {
        /* ignore */
      }
    }
    audioRef.current = null;
    try {
      void ctxRef.current?.close();
    } catch {
      /* ignore */
    }
    ctxRef.current = null;
    gainRef.current = null;
    setTrack(null);
  }

  function play(c: MusicChoice) {
    stop();
    const t = pickTrack(c, lastIdRef.current);
    if (!t) return;
    lastIdRef.current = t.id;
    const a = new Audio(t.src);
    a.loop = false;
    audioRef.current = a;
    // Lautstärke: GainNode (wirkt auch auf iOS), sonst audio.volume
    try {
      const AC: typeof AudioContext | undefined =
        (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        const src = ctx.createMediaElementSource(a);
        const g = ctx.createGain();
        g.gain.value = vol;
        src.connect(g).connect(ctx.destination);
        ctxRef.current = ctx;
        gainRef.current = g;
        void ctx.resume();
      } else {
        a.volume = vol;
      }
    } catch {
      a.volume = vol;
    }
    a.onended = () => stop();
    a.play().catch(() => stop());
    setTrack(t);
    stopTimerRef.current = window.setTimeout(stop, PREVIEW_MS);
  }

  // anderes Lied gewählt, während es spielt → gleich das neue
  const playingRef = useRef(false);
  playingRef.current = !!track;
  useEffect(() => {
    if (!playingRef.current) return;
    if (choice === "off") stop();
    else play(choice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice]);

  // gesperrt (Timer startet) → aufhören
  useEffect(() => {
    if (disabled && playingRef.current) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  // Lautstärke live nachziehen
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = vol;
    else if (audioRef.current) audioRef.current.volume = vol;
  }, [vol]);

  // beim Verlassen aufräumen
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const off = choice === "off";
  const title = track
    ? `Probehören stoppen (${track.title}${track.artist ? " – " + track.artist : ""})`
    : off
      ? "Musik ist aus"
      : disabled
        ? "Probehören geht nur, solange der Timer nicht läuft"
        : "Ausgewähltes Lied probehören (30 s)";

  return (
    <button
      type="button"
      onClick={() => (track ? stop() : play(choice))}
      disabled={!track && (disabled || off)}
      title={title}
      aria-label={track ? "Probehören stoppen" : "Lied probehören"}
      className={className}
    >
      {track ? "⏹️" : "▶️"}
    </button>
  );
}
