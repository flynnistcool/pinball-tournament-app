"use client";

// 📟 Notschalter: alle Flipper-LED-Displays zurücksetzen (nicht neu starten).
// Danach vergessen die Displays das gemerkte Turnier und zeigen ihren Allzeit-Highscore
// (mit Maskottchen jede Minute) – bis am iPad wieder ein laufendes Turnier geöffnet / gespielt wird.
// Server: POST /api/display-tournament { reset: true } (lib/displayPinServer.ts resetDisplayPins).

import { useState } from "react";

export default function DisplayResetButton({ className = "" }: { className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function reset() {
    if (state === "busy") return;
    const ok = window.confirm(
      "📟 Alle LED-Displays zurücksetzen?\n\nSie zeigen dann ihren Allzeit-Highscore – bis wieder ein laufendes Turnier geöffnet oder gespielt wird."
    );
    if (!ok) return;
    setState("busy");
    try {
      const res = await fetch("/api/display-tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const j = await res.json().catch(() => ({}));
      setState(res.ok && j?.ok ? "done" : "error");
    } catch {
      setState("error");
    }
    window.setTimeout(() => setState("idle"), 3000);
  }

  const label =
    state === "busy"
      ? "📟 …"
      : state === "done"
        ? "✓ Displays zurückgesetzt"
        : state === "error"
          ? "⚠️ Fehler"
          : "📟 Displays zurücksetzen";

  return (
    <button
      type="button"
      onClick={reset}
      title="Alle Flipper-Displays zeigen wieder ihren Allzeit-Highscore (Notschalter, kein Neustart)"
      className={
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-sm transition " +
        (state === "done"
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : state === "error"
            ? "border-rose-300 bg-rose-50 text-rose-700"
            : "bg-white/60 text-neutral-600 hover:bg-white") +
        (className ? ` ${className}` : "")
      }
    >
      {label}
    </button>
  );
}
