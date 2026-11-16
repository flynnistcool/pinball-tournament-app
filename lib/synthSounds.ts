// 🔊 Selbst erzeugte Töne (Web Audio, ohne Datei) – gemeinsam genutzt von Einblendungen und Sound-Auswahl.
// Klang unverändert übernommen aus RecordCelebration (Ding) und RivalryEvents (Gegner-Ereignisse).

type Ctx = AudioContext;

function makeCtx(): Ctx | null {
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return C ? new C() : null;
}

/** kurzes "Ding" (zwei Töne) – volume 1 = wie bisher */
export function playDing(volume = 1) {
  try {
    const ctx = makeCtx();
    if (!ctx) return;
    const notes = [880, 1318.5];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.25 * volume), t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.5);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* ohne Ton weiter */
  }
}

export type SynthEventKind = "streakBroken" | "nemesisBeaten" | "jubilee" | "leadChange";

const EVENT_SOUND: Record<SynthEventKind, { notes: number[]; step: number; type: OscillatorType }> = {
  // 💥 Serie gerissen: absteigend, etwas "kaputt" klingend
  streakBroken: { notes: [784, 622, 523, 392], step: 0.12, type: "triangle" },
  // 😈 Erzfeind besiegt: aufsteigender Triumph
  nemesisBeaten: { notes: [523, 659, 784, 1047], step: 0.11, type: "square" },
  // ⚖️ Führungswechsel: Wippe (auf und ab, dann hoch)
  leadChange: { notes: [659, 523, 659, 880], step: 0.13, type: "triangle" },
  // 🤝 Jubiläum: freundliches Glockenspiel
  jubilee: { notes: [659, 988, 1319], step: 0.16, type: "sine" },
};

/** Klang der Gegner-Ereignisse – volume 1 = wie bisher */
export function playEventSound(kind: SynthEventKind, volume = 1) {
  try {
    const ctx = makeCtx();
    if (!ctx) return;
    const { notes, step, type } = EVENT_SOUND[kind];
    const vol = Math.max(0.0002, (type === "square" ? 0.08 : 0.22) * volume); // Rechteck klingt lauter
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * step;
      const last = i === notes.length - 1;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (last ? 0.7 : 0.25));
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + (last ? 0.75 : 0.3));
    });
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch {
    /* ohne Ton weiter */
  }
}
