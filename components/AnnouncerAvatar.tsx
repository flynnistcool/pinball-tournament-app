"use client";

import React, { useEffect, useRef } from "react";

type Props = {
  visible: boolean;
  speaking: boolean;

  /**
   * Optional: Pfad/URL zum Video (z.B. "/animation2.mp4")
   * Wenn du nix übergibst, nimmt er "/animation2.mp4"
   */
  videoSrc?: string;
};

export default function AnnouncerAvatar({
  visible,
  speaking,
  videoSrc = "/animation8.mp4",
}: Props) {
  const vidRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;

    const play = async () => {
      try {
        // manche Browser brauchen das nach einem User-Input,
        // aber muted + playsInline erhöht die Chance, dass es klappt
        await v.play();
      } catch {
        // Autoplay kann geblockt werden – dann bleibt es einfach stehen
      }
    };

    if (speaking) {
      // beim Sprechen: abspielen
      play();
    } else {
      // sonst: pausieren + auf Anfang zurück
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        // falls Video-Metadaten noch nicht geladen sind
      }
    }
  }, [speaking]);

  return (
  <div
    className={
      "pointer-events-none fixed bottom-4 right-4 z-[70] transition-all " +
      (visible
        ? "opacity-100 translate-y-0 duration-[2200ms] ease-out"
        : "opacity-0 translate-y-3 duration-[2200] ease-in") +
      " " +
      (speaking ? "scale-100" : "scale-100")
    }
  >
      <div className="rounded-2xl bg-black/40 backdrop-blur-md shadow-xl border border-white/10 p-3">
        <div className="flex items-center gap-3">
          {/* Avatar bubble (VIDEO) */}
          <div className="relative h-60 w-40  shrink-0 rounded-2xl overflow-hidden bg-black/30 border border-white/10">
            <video
              ref={vidRef}
              className={
                "absolute inset-0 h-full w-full object-cover transition-opacity duration-200 " +
                (speaking ? "opacity-100" : "opacity-70")
              }
              src={videoSrc}
              muted
              loop
              playsInline
              preload="auto"
              // KEIN autoPlay hier – wir steuern es per useEffect, je nach speaking
            />

            {/* Optional: leichter Gloss/Overlay, damit es in dein UI passt */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20" />
          </div>

          {/* Label */}
          <div className="min-w-[140px]">
            <div className="text-xs text-white/70">Turnier-Ansage</div>
            <div className="text-sm font-semibold text-white">
              {speaking ? "Spreche…" : "Bereit"}
            </div>

            <div className="mt-1 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className={
                  "h-full rounded-full bg-white/60 transition-all duration-200 " +
                  (speaking ? " w-3/4" : " w-1/4")
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
