"use client";

// ⏱️ Round the Pinball – Timer direkt am TV, Ablauf wie beim Admin-Timer:
// Dauer wählen → Start → Vorlauf (15 s, "Macht euch bereit", 5-4-3-2-1) → Gong + "Los geht's" →
// Haupttimer mit Musik, Halbzeit- und 1-Minuten-Ansage, letzte 10 s runterzählen → Gong + "Zeit ist um".
// Vollbild-Uhr (dieselbe wie im Admin) öffnet beim Start von selbst.
// Läuft NUR auf diesem Gerät (nicht mit dem Admin-iPad geteilt) und übersteht ein Neuladen (localStorage).
// Läuft am TV kein eigener Timer, zeigt das Badge den Timer vom Admin-iPad.

import { useEffect, useRef, useState } from "react";
import RotationTimerBadge, { type RotationTimerState } from "@/components/RotationTimerBadge";
import RotationTimerOverlay from "@/components/RotationTimerOverlay";
import MusicPreviewButton from "@/components/MusicPreviewButton";
import { pickTrack, loadMusicChoice, saveMusicChoice, ROTATION_CATEGORIES, ROTATION_TRACKS, type MusicChoice } from "@/lib/rotationMusic";
import { normalizeSoundSettings, SOUND_SETTINGS_KEY, TIMER_MINUTE_OPTIONS, type SoundSettings } from "@/lib/soundSettings";
import { rotationSpeech, SPEECH_LOCALE, type SpeechLang } from "@/lib/speechTexts";

type Local = {
  phase: "prestart" | "running" | "paused" | "done";
  /** Vorlauf-Ende (nur phase=prestart) */
  prestartEndAt: number | null;
  /** Ende des Haupttimers (nur phase=running) */
  endAt: number | null;
  /** Restzeit (phase=paused) */
  remainingMs: number;
  durationSec: number;
  prestartSec: number;
};

const DONE_SHOW_MS = 15_000; // "Zeit um!" so lange im Kopf stehen lassen

function loadLocal(key: string): Local | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (v && ["prestart", "running", "paused", "done"].includes(v.phase)) return v as Local;
  } catch {
    /* ignore */
  }
  return null;
}
function saveLocal(key: string, v: Local | null) {
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v));
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
function loadSettings(): SoundSettings {
  try {
    return normalizeSoundSettings(JSON.parse(window.localStorage.getItem(SOUND_SETTINGS_KEY) ?? "null"));
  } catch {
    return normalizeSoundSettings(null);
  }
}
function fmt(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function TvRotationTimer({
  code,
  adminTimer,
  offsetMs = 0,
  speechLang = "en",
}: {
  code: string;
  /** Timer vom Admin-iPad (nur Anzeige) */
  adminTimer: RotationTimerState | null | undefined;
  offsetMs?: number;
  /** Sprache der Ansagen (tournaments.speech_lang) */
  speechLang?: SpeechLang;
}) {
  const key = `pb_tvTimer_${String(code).toUpperCase()}`;
  const [local, setLocal] = useState<Local | null>(null);
  const [panel, setPanel] = useState(false);
  const [full, setFull] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettings] = useState<SoundSettings>(() => normalizeSoundSettings(null));
  const [minutes, setMinutes] = useState(10);
  const [music, setMusic] = useState<MusicChoice>("random");

  const musicRef = useRef<HTMLAudioElement | null>(null);
  const lastTrackRef = useRef<string | null>(null);
  const spokenRef = useRef<Set<string>>(new Set());
  const langRef = useRef(speechLang);
  langRef.current = speechLang;

  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setMinutes(s.defaultMinutes);
    setMusic(loadMusicChoice());
    const l = loadLocal(key);
    // nach Neuladen: schon vergangene Ansagen nicht wiederholen
    if (l?.phase === "running" && l.endAt != null) {
      const left = l.endAt - Date.now();
      spokenRef.current = new Set(["ready", "go", "pre1", "pre2", "pre3", "pre4", "pre5"]);
      if (left <= (l.durationSec * 1000) / 2) spokenRef.current.add("half");
      if (left <= 60_000) spokenRef.current.add("min");
    } else if (l?.phase === "paused" || l?.phase === "done") {
      spokenRef.current = new Set(["ready", "go", "half", "min", "end"]);
    }
    setLocal(l);
  }, [key]);

  const update = (v: Local | null) => {
    setLocal(v);
    saveLocal(key, v);
  };

  // ── Ton: Musik, Gong, Sprache ──
  const musicVol = (v: number) => {
    if (musicRef.current) musicRef.current.volume = Math.max(0, Math.min(1, v));
  };
  const musicStart = () => {
    if (music === "off") return;
    if (!musicRef.current) {
      const t = pickTrack(music, lastTrackRef.current);
      if (!t) return;
      lastTrackRef.current = t.id;
      const a = new Audio(t.src);
      a.loop = true;
      a.volume = settings.musicVol;
      musicRef.current = a;
    }
    musicRef.current.play().catch(() => {});
  };
  const musicPause = () => musicRef.current?.pause();
  const musicStop = () => {
    const a = musicRef.current;
    if (!a) return;
    a.pause();
    musicRef.current = null; // nächster Start: neues Lied
  };
  const gong = () => {
    try {
      const a = new Audio("/sounds/end.mp3");
      a.volume = settings.endVol;
      a.play().catch(() => {});
    } catch {
      /* ignore */
    }
  };
  const speak = (text: string) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return;
    try {
      musicVol(settings.musicDuckVol); // Musik leiser, solange gesprochen wird
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LOCALE[langRef.current];
      const voice = synth.getVoices().find((v) => v.lang?.startsWith(SPEECH_LOCALE[langRef.current].slice(0, 2)));
      if (voice) u.voice = voice;
      u.volume = settings.speechVol;
      u.rate = settings.speechRate;
      const restore = () => musicVol(settings.musicVol);
      u.onend = restore;
      u.onerror = restore;
      window.setTimeout(restore, 4000);
      synth.speak(u);
    } catch {
      musicVol(settings.musicVol);
    }
  };
  const once = (id: string, fn: () => void) => {
    if (spokenRef.current.has(id)) return;
    spokenRef.current.add(id);
    fn();
  };

  // ── Ablauf: jede Viertelsekunde prüfen ──
  useEffect(() => {
    if (!local || local.phase === "paused") return;
    const tick = () => {
      const n = Date.now();
      setNow(n);
      const a = settings.announce;
      if (local.phase === "prestart" && local.prestartEndAt != null) {
        const left = local.prestartEndAt - n;
        const sec = Math.ceil(left / 1000);
        if (sec <= 10) once("ready", () => a.getReady && speak(rotationSpeech.getReady(langRef.current)));
        if (sec <= 5 && sec > 0) once(`pre${sec}`, () => speak(String(sec)));
        if (left <= 0) {
          once("go", () => {
            gong();
            speak(rotationSpeech.letsGo(langRef.current));
          });
          update({ ...local, phase: "running", prestartEndAt: null, endAt: n + local.durationSec * 1000, remainingMs: local.durationSec * 1000 });
        }
      } else if (local.phase === "running" && local.endAt != null) {
        const left = local.endAt - n;
        const sec = Math.ceil(left / 1000);
        if (left <= (local.durationSec * 1000) / 2) once("half", () => a.halftime && speak(rotationSpeech.halftime(langRef.current)));
        if (left <= 60_000) once("min", () => a.oneMinute && speak(rotationSpeech.oneMinute(langRef.current)));
        if (sec <= 10 && sec > 1) once(`cd${sec}`, () => a.countdown && speak(String(sec)));
        if (left <= 0) {
          once("end", () => {
            musicStop();
            gong();
            if (a.timesUp) window.setTimeout(() => speak(rotationSpeech.timesUp(langRef.current)), 1200);
          });
          update({ ...local, phase: "done", endAt: n, remainingMs: 0 });
        }
      } else if (local.phase === "done" && local.endAt != null && n >= local.endAt + DONE_SHOW_MS) {
        update(null);
      }
    };
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, settings]);

  // Musik passend zum Zustand (auch nach Neuladen, sobald der Browser Ton erlaubt)
  useEffect(() => {
    if (local && (local.phase === "prestart" || local.phase === "running")) musicStart();
    else if (local?.phase === "paused") musicPause();
    else musicStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local?.phase]);
  useEffect(() => () => musicStop(), []); // Seite verlassen → Musik aus

  // ── Bedienung ──
  const start = () => {
    spokenRef.current = new Set();
    musicStop();
    // Ton im Antippen freischalten (Browser-Vorgabe), Musik startet im Vorlauf
    try {
      window.speechSynthesis?.getVoices();
    } catch {
      /* ignore */
    }
    const s = loadSettings();
    setSettings(s);
    update({
      phase: "prestart",
      prestartEndAt: Date.now() + s.prestartSec * 1000,
      endAt: null,
      remainingMs: minutes * 60_000,
      durationSec: minutes * 60,
      prestartSec: s.prestartSec,
    });
    setPanel(false);
    setFull(true);
  };
  const pauseToggle = () => {
    if (!local) return;
    if (local.phase === "running" && local.endAt != null) {
      update({ ...local, phase: "paused", endAt: null, remainingMs: Math.max(0, local.endAt - Date.now()) });
    } else if (local.phase === "paused") {
      update({ ...local, phase: "running", endAt: Date.now() + local.remainingMs });
    }
  };
  const reset = () => {
    musicStop();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    update(null);
    setFull(false);
  };

  // ── Anzeige-Werte ──
  const prestart = local?.phase === "prestart";
  const running = local?.phase === "running" || prestart;
  const paused = local?.phase === "paused";
  const leftMs = !local
    ? null
    : prestart
      ? Math.max(0, (local.prestartEndAt ?? now) - now)
      : local.phase === "running"
        ? Math.max(0, (local.endAt ?? now) - now)
        : local.phase === "paused"
          ? local.remainingMs
          : 0;
  const totalMs = prestart ? (local?.prestartSec ?? 15) * 1000 : (local?.durationSec ?? minutes * 60) * 1000;

  // Farbe der Zeit wie im Admin: grün → orange ab Halbzeit → rot in der letzten Minute
  const timeClass =
    leftMs == null
      ? "bg-white/10 text-white/80 ring-white/15"
      : prestart
        ? "bg-gradient-to-br from-sky-400 to-cyan-600 text-white ring-white/25"
        : leftMs <= 60_000
          ? "bg-gradient-to-br from-rose-500 via-red-600 to-red-800 text-white ring-white/25"
          : leftMs <= totalMs / 2
            ? "bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white ring-white/25"
            : "bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 text-white ring-white/25";

  const small = "rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-white/15 transition hover:bg-white/10 disabled:opacity-40";
  const select = "h-7 rounded-lg bg-[#0b1020] px-2 text-xs text-white/90 ring-1 ring-white/20 disabled:opacity-40";

  return (
    <span className="relative inline-flex items-center gap-1.5">
      {/* Kopf: eigener Timer (klickbar) bzw. Admin-Timer + Knopf */}
      {local ? (
        local.phase === "done" ? (
          <button
            type="button"
            onClick={() => setPanel((p) => !p)}
            className="animate-pulse rounded-full bg-rose-500/25 px-3 py-0.5 font-semibold text-rose-200 ring-1 ring-rose-300/60"
          >
            ⏰ Zeit um!
          </button>
        ) : (
          <button type="button" onClick={() => setPanel((p) => !p)} title="Timer bedienen">
            {prestart ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/15 px-3 py-0.5 font-semibold tabular-nums text-sky-200 ring-1 ring-sky-300/40">
                ⏱️ gleich geht's los · {fmt(leftMs ?? 0)}
              </span>
            ) : (
              <RotationTimerBadge
                timer={{ state: paused ? "paused" : "running", endAt: local.endAt, remainingMs: local.remainingMs }}
              />
            )}
          </button>
        )
      ) : (
        <>
          <RotationTimerBadge timer={adminTimer} offsetMs={offsetMs} />
          <button
            type="button"
            onClick={() => setPanel((p) => !p)}
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white/60 ring-1 ring-white/15 transition hover:bg-white/10"
            title="Timer hier am TV starten (läuft nur auf diesem Bildschirm)"
          >
            ⏱️ Timer
          </button>
        </>
      )}

      {/* Bedienfeld wie die Admin-Karte "Rotation Timer" */}
      {panel ? (
        <span className="absolute right-0 top-full z-50 mt-2 block w-[300px] whitespace-normal rounded-2xl bg-[#0b1020] p-3 text-left text-white shadow-2xl ring-1 ring-white/20">
          <span className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">Rotation Timer (TV)</span>
            <span className="flex items-center gap-1">
              <MusicPreviewButton
                choice={music}
                volume={settings.musicVol}
                disabled={running || paused}
                className="rounded-lg px-1.5 text-base text-white/60 hover:bg-white/10 disabled:opacity-40"
              />
              <button type="button" onClick={() => setFull(true)} disabled={!local} className="rounded-lg px-1.5 text-base text-white/60 hover:bg-white/10 disabled:opacity-40" title="Timer groß anzeigen (Vollbild)">
                ⛶
              </button>
              <button type="button" onClick={() => setPanel(false)} className="rounded-lg px-1.5 text-sm text-white/60 hover:bg-white/10" title="Schließen">
                ✕
              </button>
            </span>
          </span>
          {/* Dauer + Zeit */}
          <span className="grid grid-cols-2 items-center gap-1.5">
            <select
              value={String(minutes)}
              onChange={(e) => setMinutes(Number(e.target.value) || 10)}
              disabled={!!local && local.phase !== "done"}
              className={select}
              title="Dauer (Minuten)"
            >
              {TIMER_MINUTE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <span className={"flex h-7 items-center justify-center rounded-full text-lg font-semibold tabular-nums ring-1 " + timeClass}>
              {fmt(leftMs ?? minutes * 60_000)}
            </span>
          </span>
          {/* Start · Pause · Reset */}
          <span className="mt-1.5 grid grid-cols-3 gap-1.5">
            <button type="button" onClick={start} disabled={running || paused} className={small}>
              Start
            </button>
            <button type="button" onClick={pauseToggle} disabled={!(local?.phase === "running" || paused)} className={small}>
              {paused ? "Weiter" : "Pause"}
            </button>
            <button type="button" onClick={reset} disabled={!local} className={small}>
              Reset
            </button>
          </span>
          {/* 🎵 Musik */}
          <select
            value={music}
            onChange={(e) => {
              setMusic(e.target.value);
              saveMusicChoice(e.target.value);
              if (e.target.value === "off") musicStop();
            }}
            className={select + " mt-1.5 w-full"}
            title="Hintergrundmusik – gilt ab dem nächsten Start (Aus sofort)"
          >
            <option value="random">🎲 Musik: Zufall (alle)</option>
            <optgroup label="🎲 Zufall aus einer Art">
              {ROTATION_CATEGORIES.map((c) => (
                <option key={"cat:" + c} value={"cat:" + c}>
                  🎲 Zufall: {c}
                </option>
              ))}
            </optgroup>
            {ROTATION_CATEGORIES.map((c) => (
              <optgroup key={c} label={"🎵 " + c}>
                {ROTATION_TRACKS.filter((t) => t.category === c).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.artist ? ` – ${t.artist}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="off">🔇 Musik: Aus</option>
          </select>
          <span className="mt-2 block text-[11px] leading-snug text-white/40">
            Läuft nur auf diesem Bildschirm. Ansagen, Musik und Gong wie beim Admin-Timer.
          </span>
        </span>
      ) : null}

      {/* Vollbild-Uhr – dieselbe wie im Admin */}
      <RotationTimerOverlay
        open={full && !!local}
        onClose={() => setFull(false)}
        timeLeftLabel={fmt(leftMs ?? 0)}
        timeLeftMs={leftMs}
        durationSec={prestart ? local?.prestartSec ?? 15 : local?.durationSec ?? 600}
        running={!!running}
        paused={!!paused}
        prestart={prestart}
        locked={false}
        onPauseToggle={pauseToggle}
        onReset={reset}
      />
    </span>
  );
}
