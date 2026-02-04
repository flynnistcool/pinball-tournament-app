"use client";

import React from "react";

type Props = {
  visible: boolean;
  speaking: boolean;
};

export default function AnnouncerAvatar({ visible, speaking }: Props) {
  return (
    <div
      className={
        "pointer-events-none fixed bottom-4 right-4 z-[70] transition-all duration-200 " +
        (visible ? " opacity-100 translate-y-0" : " opacity-0 translate-y-2")
      }
      aria-hidden
    >
      <div className="rounded-2xl bg-black/40 backdrop-blur-md shadow-xl border border-white/10 p-3">
        <div className="flex items-center gap-3">
          {/* Avatar bubble */}
          <div className="relative h-16 w-16 shrink-0 rounded-2xl overflow-hidden bg-gradient-to-br from-sky-400/40 via-fuchsia-400/30 to-emerald-400/30 border border-white/10">
            <svg
              viewBox="0 0 64 64"
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label="Announcer avatar"
            >
              {/* glow */}
              <defs>
                <radialGradient id="g" cx="50%" cy="35%" r="70%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
                  <stop offset="60%" stopColor="rgba(255,255,255,0.25)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.0)" />
                </radialGradient>
              </defs>

              {/* head */}
              <circle cx="32" cy="30" r="18" fill="rgba(0,0,0,0.25)" />
              <circle cx="32" cy="28" r="18" fill="url(#g)" opacity="0.35" />

              {/* eyes */}
              <circle cx="26" cy="26" r="2.2" fill="rgba(255,255,255,0.85)" />
              <circle cx="38" cy="26" r="2.2" fill="rgba(255,255,255,0.85)" />

              {/* mouth */}
              <rect
                x="26"
                y={speaking ? 35 : 37}
                width="12"
                height={speaking ? 6 : 2.5}
                rx="2"
                fill="rgba(255,255,255,0.85)"
                className={speaking ? "ann-mouth" : ""}
              />

              {/* neck / shoulders */}
              <path
                d="M16 54c3-10 29-10 32 0"
                fill="rgba(0,0,0,0.25)"
              />
            </svg>
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

      <style jsx>{`
        @keyframes mouth {
          0% {
            transform: scaleY(0.7);
            opacity: 0.85;
          }
          50% {
            transform: scaleY(1.2);
            opacity: 1;
          }
          100% {
            transform: scaleY(0.7);
            opacity: 0.85;
          }
        }
        .ann-mouth {
          transform-origin: center;
          animation: mouth 180ms infinite;
        }
      `}</style>
    </div>
  );
}
