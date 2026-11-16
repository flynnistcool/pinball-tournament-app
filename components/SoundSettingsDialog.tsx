"use client";

// ⚙️ Sound- & Timer-Einstellungen (global) – Fenster aus der Rotation-Timer-Karte.
// Speichern nur für Admins (POST /api/sound-settings), alle anderen sehen die Werte.

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SOUND_SETTINGS,
  TIMER_MINUTE_OPTIONS,
  normalizeSoundSettings,
  type SoundSettings,
} from "@/lib/soundSettings";
import { pickSpeechVoice, rotationSpeech, SPEECH_LOCALE, type SpeechLang } from "@/lib/speechTexts";
import { ROTATION_TRACKS } from "@/lib/rotationMusic";

const pct = (v: number) => `${Math.round(v * 100)} %`;

function Slider({
  label,
  value,
  onChange,
  disabled,
  min = 0,
  max = 1,
  step = 0.01,
  format = pct,
  onPreview,
  previewLabel = "▶ Probe",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  onPreview?: () => void;
  previewLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="tabular-nums text-neutral-500">{format(value)}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-2 w-full cursor-pointer accent-neutral-900 disabled:cursor-not-allowed"
        />
        {onPreview ? (
          <button
            type="button"
            onClick={onPreview}
            className="shrink-0 rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            {previewLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function SoundSettingsDialog({
  open,
  onClose,
  settings,
  isAdmin,
  lang,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  settings: SoundSettings;
  isAdmin: boolean;
  /** Sprache für die Sprach-Probe (Turnier-Einstellung) */
  lang: SpeechLang;
  onSaved: (s: SoundSettings) => void;
}) {
  const [draft, setDraft] = useState<SoundSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setMsg(null);
    }
  }, [open, settings]);

  function stopPreview() {
    window.clearTimeout(stopTimer.current);
    try {
      audioRef.current?.pause();
    } catch {
      /* ignore */
    }
    audioRef.current = null;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    if (!open) stopPreview();
    return stopPreview;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function playAudio(src: string, volume: number, ms: number) {
    stopPreview();
    const a = new Audio(src);
    a.volume = Math.min(1, Math.max(0, volume));
    audioRef.current = a;
    a.play().catch(() => {});
    stopTimer.current = window.setTimeout(stopPreview, ms);
    return a;
  }

  function speak(text: string) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(text);
    const v = pickSpeechVoice(synth.getVoices?.() ?? [], lang);
    if (v) u.voice = v;
    u.lang = v?.lang || SPEECH_LOCALE[lang];
    u.volume = draft.speechVol;
    u.rate = draft.speechRate;
    synth.cancel();
    synth.speak(u);
  }

  const musicSrc = ROTATION_TRACKS[0]?.src ?? "/sounds/timer.mp3";

  // 🎧 Live-Probe: Lied in Schleife + alle paar Sekunden eine Beispiel-Ansage (Musik wird dabei leiser).
  //    Alle Regler wirken sofort. Lautstärke über einen GainNode (Web Audio) → klappt auch auf iPad/iPhone,
  //    wo audio.volume vom System ignoriert wird.
  const [live, setLive] = useState(false);
  const [liveTrack, setLiveTrack] = useState<string>(ROTATION_TRACKS[0]?.id ?? "");
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const speakingRef = useRef(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null); // Referenz halten: sonst "vergisst" Chrome onend
  const draftRef = useRef(draft);
  draftRef.current = draft;

  function setMusicVolume(v: number) {
    const vol = Math.min(1, Math.max(0, v));
    const g = gainRef.current;
    const ctx = ctxRef.current;
    if (g && ctx) {
      g.gain.setTargetAtTime(vol, ctx.currentTime, 0.05); // weich überblenden
    } else if (liveAudioRef.current) {
      liveAudioRef.current.volume = vol;
    }
  }

  // Regler → sofort hörbar (leiser, solange gerade gesprochen wird)
  useEffect(() => {
    if (!liveAudioRef.current) return;
    setMusicVolume(speakingRef.current ? draft.musicDuckVol : draft.musicVol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.musicVol, draft.musicDuckVol]);

  useEffect(() => {
    if (!live || !open) return;
    stopPreview();
    const track = ROTATION_TRACKS.find((t) => t.id === liveTrack) ?? ROTATION_TRACKS[0];
    const a = new Audio(track?.src ?? musicSrc);
    a.loop = true;
    a.crossOrigin = "anonymous";
    liveAudioRef.current = a;

    // Web Audio: Lautstärke über GainNode
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const src = ctx.createMediaElementSource(a);
        const gain = ctx.createGain();
        gain.gain.value = draftRef.current.musicVol;
        src.connect(gain).connect(ctx.destination);
        ctxRef.current = ctx;
        gainRef.current = gain;
        ctx.resume().catch(() => {});
      } else {
        a.volume = draftRef.current.musicVol;
      }
    } catch {
      a.volume = draftRef.current.musicVol;
    }
    a.play().catch(() => setLive(false));

    const samples = [
      rotationSpeech.getReady(lang),
      rotationSpeech.halftime(lang),
      rotationSpeech.oneMinute(lang),
      "10, 9, 8",
      rotationSpeech.timesUp(lang),
    ];
    let i = 0;
    let restoreTimer: number | undefined;
    const restore = () => {
      window.clearTimeout(restoreTimer);
      speakingRef.current = false;
      setMusicVolume(draftRef.current.musicVol);
    };
    const say = () => {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const d = draftRef.current;
      const text = samples[i++ % samples.length];
      const u = new SpeechSynthesisUtterance(text);
      const v = pickSpeechVoice(synth.getVoices?.() ?? [], lang);
      if (v) u.voice = v;
      u.lang = v?.lang || SPEECH_LOCALE[lang];
      u.volume = d.speechVol;
      u.rate = d.speechRate;
      u.onend = restore;
      u.onerror = restore;
      utterRef.current = u;
      synth.cancel();
      speakingRef.current = true;
      setMusicVolume(d.musicDuckVol);
      synth.speak(u);
      // Sicherheitsnetz: falls onend nicht kommt → nach geschätzter Sprechdauer wieder lauter
      window.clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(restore, (text.length * 75) / (d.speechRate || 1) + 1200);
    };
    const first = window.setTimeout(say, 2500);
    const iv = window.setInterval(say, 8000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(iv);
      window.clearTimeout(restoreTimer);
      speakingRef.current = false;
      try {
        a.pause();
      } catch {
        /* ignore */
      }
      liveAudioRef.current = null;
      gainRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      utterRef.current = null;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, liveTrack, open, lang]);

  useEffect(() => {
    if (!open) setLive(false);
  }, [open]);
  const set = (patch: Partial<SoundSettings>) => setDraft((d) => normalizeSoundSettings({ ...d, ...patch }));
  const setAnn = (k: keyof SoundSettings["announce"], v: boolean) =>
    setDraft((d) => normalizeSoundSettings({ ...d, announce: { ...d.announce, [k]: v } }));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sound-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.error ?? "Speichern fehlgeschlagen" });
        return;
      }
      onSaved(normalizeSoundSettings(j.settings));
      setMsg({ ok: true, text: "Gespeichert – gilt für alle Turniere und Geräte." });
    } catch {
      setMsg({ ok: false, text: "Netzwerkfehler" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const ro = !isAdmin;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-base font-bold">⚙️ Sound & Timer</div>
            <div className="text-[11px] text-neutral-500">Gilt für alle Turniere und Geräte</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-lg text-neutral-500 hover:bg-neutral-100">
            ✕
          </button>
        </div>

        {ro ? (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">🔒 Nur Admins können die Einstellungen ändern.</div>
        ) : null}

        <div className="space-y-3">
          {/* 🎧 Live-Probe */}
          <section className={"space-y-1.5 rounded-xl px-3 py-2 " + (live ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-neutral-50")}>
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <div className="shrink-0 text-sm font-semibold">🎧 Live-Probe</div>
              <select
                value={liveTrack}
                onChange={(e) => setLiveTrack(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded-lg border bg-white px-2 text-xs"
                title="Beispiel-Lied"
              >
                {ROTATION_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    🎵 {t.title}
                    {t.artist ? ` – ${t.artist}` : ""} ({t.category})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setLive((v) => !v)}
                className={
                  "shrink-0 rounded-lg px-3 py-1 text-sm font-semibold " +
                  (live ? "bg-red-600 text-white hover:bg-red-700" : "bg-neutral-900 text-white hover:bg-neutral-800")
                }
              >
                {live ? "⏹ Stopp" : "▶ Start"}
              </button>
            </div>
            <div className="text-[11px] text-neutral-500">
              {live
                ? "Läuft: Musik in Schleife, alle 8 Sekunden eine Beispiel-Ansage (Musik wird dabei leiser). Regler unten wirken sofort."
                : "Spielt ein Lied mit Beispiel-Ansagen ab – so kannst du alles live einstellen."}
            </div>
          </section>

          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          <section className="space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">🔊 Lautstärken</div>
            <Slider
              label="Sprache (Ansagen & Countdown)"
              value={draft.speechVol}
              disabled={ro}
              onChange={(v) => set({ speechVol: v })}
              onPreview={() => speak(rotationSpeech.oneMinute(lang))}
            />
            <Slider
              label="Musik"
              value={draft.musicVol}
              disabled={ro}
              onChange={(v) => set({ musicVol: v })}
              onPreview={live ? undefined : () => playAudio(musicSrc, draft.musicVol, 5000)}
            />
            <Slider
              label="Musik während einer Ansage"
              value={draft.musicDuckVol}
              disabled={ro}
              onChange={(v) => set({ musicDuckVol: v })}
              previewLabel="▶ mit Ansage"
              onPreview={live ? undefined : () => {
                playAudio(musicSrc, draft.musicDuckVol, 6000);
                window.setTimeout(() => speak(rotationSpeech.getReady(lang)), 300);
              }}
            />
            <Slider
              label="End-Ton (Zeit ist um)"
              value={draft.endVol}
              disabled={ro}
              onChange={(v) => set({ endVol: v })}
              onPreview={() => playAudio("/sounds/end.mp3", draft.endVol, 6000)}
            />
          </section>

          <div className="space-y-4">
          <section className="space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">🗣️ Sprache</div>
            <Slider
              label="Sprechtempo"
              value={draft.speechRate}
              min={0.7}
              max={1.3}
              step={0.05}
              disabled={ro}
              format={(v) => (Math.abs(v - 1) < 0.001 ? "normal" : v < 1 ? `langsamer (${v.toFixed(2)}×)` : `schneller (${v.toFixed(2)}×)`)}
              onChange={(v) => set({ speechRate: v })}
              onPreview={() => speak(rotationSpeech.getReady(lang))}
            />
          </section>

          <section className="space-y-2.5">
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">⏱️ Timer</div>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-neutral-700">Standard-Dauer</span>
              <select
                value={draft.defaultMinutes}
                disabled={ro}
                onChange={(e) => set({ defaultMinutes: Number(e.target.value) })}
                className="h-8 rounded-lg border bg-white px-2 text-sm"
              >
                {TIMER_MINUTE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <Slider
              label="Vorlauf vor dem Start"
              value={draft.prestartSec}
              min={5}
              max={30}
              step={1}
              disabled={ro}
              format={(v) => `${v} s`}
              onChange={(v) => set({ prestartSec: v })}
            />
            <div className="grid grid-cols-1 gap-x-3 gap-y-1 rounded-xl bg-neutral-50 px-3 py-2 sm:grid-cols-2">
              <div className="text-xs font-semibold text-neutral-600 sm:col-span-2">Ansagen</div>
              <Toggle label="„Macht euch bereit“" checked={draft.announce.getReady} disabled={ro} onChange={(v) => setAnn("getReady", v)} />
              <Toggle label="Halbzeit" checked={draft.announce.halftime} disabled={ro} onChange={(v) => setAnn("halftime", v)} />
              <Toggle label="„Noch eine Minute“" checked={draft.announce.oneMinute} disabled={ro} onChange={(v) => setAnn("oneMinute", v)} />
              <Toggle label="Countdown (10 s)" checked={draft.announce.countdown} disabled={ro} onChange={(v) => setAnn("countdown", v)} />
              <Toggle label="„Zeit ist um“" checked={draft.announce.timesUp} disabled={ro} onChange={(v) => setAnn("timesUp", v)} />
            </div>
          </section>
          </div>
          </div>
        </div>

        {msg ? (
          <div className={"mt-3 rounded-lg px-3 py-2 text-xs " + (msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
            {msg.ok ? "✅ " : "⚠️ "}
            {msg.text}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={ro}
            onClick={() => setDraft(DEFAULT_SOUND_SETTINGS)}
            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
          >
            ↺ Standard wiederherstellen
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50">
              Schließen
            </button>
            <button
              type="button"
              disabled={ro || busy}
              onClick={save}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              {busy ? "Speichere …" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
