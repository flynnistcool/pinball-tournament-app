"use client";

// ☀️ Bildschirm wach halten (Infobildschirm auf dem TV-Browser).
//
// Android-/Google-TV startet den Bildschirmschoner, wenn eine Weile keine Taste gedrückt wird.
// Zwei Wege dagegen:
// 1) Screen Wake Lock API (navigator.wakeLock) – moderne Browser; wird nach Tab-Wechsel neu angefordert.
// 2) Ersatz: ein winziges, stummes, laufendes Video (aus einer Zeichenfläche erzeugt, keine Datei).
//    Solange ein Video läuft, starten viele TV-Systeme den Schoner nicht.
// 3) Ersatz für einfache TV-Browser (kein captureStream): echte Mini-Videodatei
//    public/sounds/keepawake.mp4 (schwarz, 64×64, stumm, 2 KB, Dauerschleife; /sounds/ ist ohne Login frei).
//
// Browser erlauben manches erst nach einer Berührung/Klick → beim ersten Klick/Tastendruck
// irgendwo auf der Seite wird alles (erneut) gestartet.

import { useEffect, useRef, useState } from "react";

type Status = {
  wakeLock: "aktiv" | "aus" | "nicht unterstützt";
  video: "läuft" | "aus" | "nicht unterstützt";
  file: "läuft" | "aus" | "blockiert";
};

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void>; addEventListener?: (t: string, cb: () => void) => void };

export default function KeepAwake() {
  const [status, setStatus] = useState<Status>({ wakeLock: "aus", video: "aus", file: "aus" });
  const lockRef = useRef<WakeLockSentinelLike | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamStartedRef = useRef(false);
  // für den Knopf (Fernbedienung): alles erneut starten
  const startAllRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let drawTimer: number | null = null;

    const setPart = (p: Partial<Status>) => {
      if (!disposed) setStatus((s) => ({ ...s, ...p }));
    };

    // ── 1) Wake Lock ─────────────────────────────────────────────
    async function requestWakeLock() {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock;
      if (!wl) {
        setPart({ wakeLock: "nicht unterstützt" });
        return;
      }
      if (lockRef.current && !lockRef.current.released) return;
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await wl.request("screen");
        lockRef.current = lock;
        setPart({ wakeLock: "aktiv" });
        lock.addEventListener?.("release", () => setPart({ wakeLock: "aus" }));
      } catch {
        setPart({ wakeLock: "aus" });
      }
    }

    // ── 2) Mini-Video aus Zeichenfläche ──────────────────────────
    async function startVideo() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const capture = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream;
      if (typeof capture !== "function") {
        setPart({ video: "nicht unterstützt" });
        return;
      }
      if (!streamStartedRef.current) {
        const ctx = canvas.getContext("2d");
        // jede Sekunde ein Pixel ändern, damit der Stream "lebt"
        let tick = 0;
        const draw = () => {
          if (!ctx) return;
          tick = (tick + 1) % 2;
          ctx.fillStyle = tick ? "#000001" : "#000000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        };
        draw();
        drawTimer = window.setInterval(draw, 1000);
        video.srcObject = capture.call(canvas, 1);
        streamStartedRef.current = true;
      }
      try {
        await video.play();
        setPart({ video: "läuft" });
      } catch {
        setPart({ video: "aus" });
      }
    }

    // ── 3) echte Mini-Videodatei ─────────────────────────────────
    async function startFileVideo() {
      const v = fileVideoRef.current;
      if (!v) return;
      if (!v.paused && !v.ended) {
        setPart({ file: "läuft" });
        return;
      }
      try {
        v.muted = true;
        await v.play();
        setPart({ file: "läuft" });
      } catch {
        setPart({ file: "blockiert" });
      }
    }

    const startAll = () => {
      void requestWakeLock();
      void startVideo();
      void startFileVideo();
    };
    startAllRef.current = startAll;

    const onVisible = () => {
      if (document.visibilityState === "visible") startAll();
    };

    startAll();
    document.addEventListener("visibilitychange", onVisible);
    // nach einer Berührung/Taste erneut versuchen (Browser-Vorgabe)
    document.addEventListener("pointerdown", startAll);
    document.addEventListener("keydown", startAll);
    // gelegentlich prüfen (manche TV-Browser geben die Sperre still wieder frei)
    const recheck = window.setInterval(startAll, 60_000);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", startAll);
      document.removeEventListener("keydown", startAll);
      window.clearInterval(recheck);
      if (drawTimer) window.clearInterval(drawTimer);
      void lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      const v = videoRef.current;
      const stream = v?.srcObject as MediaStream | null | undefined;
      stream?.getTracks().forEach((t) => t.stop());
      if (v) v.srcObject = null;
    };
  }, []);

  const awake = status.wakeLock === "aktiv" || status.video === "läuft" || status.file === "läuft";
  // Kurzdiagnose direkt auf dem Knopf (auf dem TV gibt es kein Maus-Darüberfahren)
  const mark = (ok: boolean, no: boolean) => (ok ? "✓" : no ? "–" : "✗");
  const diag =
    "WL " + mark(status.wakeLock === "aktiv", status.wakeLock === "nicht unterstützt") +
    " · Video " + mark(status.video === "läuft", status.video === "nicht unterstützt") +
    " · Datei " + mark(status.file === "läuft", false);

  return (
    <>
      {/* unsichtbar, aber "sichtbar" genug, dass der Browser das Video als laufend zählt */}
      <canvas ref={canvasRef} width={16} height={16} style={{ display: "none" }} />
      <video
        ref={videoRef}
        muted
        playsInline
        loop
        aria-hidden="true"
        style={{ position: "fixed", right: 0, bottom: 0, width: 16, height: 16, opacity: 0.01, pointerEvents: "none" }}
      />
      <video
        ref={fileVideoRef}
        src="/sounds/keepawake.mp4"
        muted
        playsInline
        loop
        autoPlay
        preload="auto"
        aria-hidden="true"
        onPlaying={() => setStatus((s) => ({ ...s, file: "läuft" }))}
        onPause={() => setStatus((s) => ({ ...s, file: "aus" }))}
        style={{ position: "fixed", right: 16, bottom: 0, width: 16, height: 16, opacity: 0.01, pointerEvents: "none" }}
      />
      <button
        type="button"
        onClick={() => startAllRef.current()}
        className={
          "rounded-full px-3 py-1 text-xs font-semibold ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-white " +
          (awake
            ? "bg-sky-400/10 text-sky-300/80 ring-sky-300/30 hover:bg-sky-400/20"
            : "animate-pulse bg-amber-400/15 text-amber-300 ring-amber-300/50 hover:bg-amber-400/25")
        }
        title={`Bildschirm wach halten – Wake Lock: ${status.wakeLock}, Video: ${status.video}, Datei: ${status.file}`}
      >
        {awake ? "☀️ bleibt an" : "☀️ einmal tippen"}
        <span className="ml-1.5 opacity-70">{diag}</span>
      </button>
    </>
  );
}
