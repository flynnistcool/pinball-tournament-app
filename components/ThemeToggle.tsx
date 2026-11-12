"use client";

// ☀️/🌙 Schalter für den dunklen Modus im Admin-Programm.
// - setzt/entfernt die Klasse "pb-dark" an <html> (Farben: app/dark-mode.css)
// - merkt sich die Wahl pro Gerät (localStorage "pb_theme")
// - beim Verlassen des Admin-Programms wird die Klasse wieder entfernt
//   (TV-Seite und öffentliche Seiten bleiben immer wie sie sind)
// Startwert vor dem ersten Zeichnen: kleines Skript in app/layout.tsx (kein Aufblitzen).

import { useEffect, useState } from "react";

const STORAGE_KEY = "pb_theme";
const DARK_CLASS = "pb-dark";

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark";
  } catch {
    return false;
  }
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const d = readStored();
    setDark(d);
    document.documentElement.classList.toggle(DARK_CLASS, d);
    return () => document.documentElement.classList.remove(DARK_CLASS);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle(DARK_CLASS, next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* ohne Speichern weiter */
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      title={dark ? "Heller Modus" : "Dunkler Modus"}
      aria-label="Dunkler Modus"
      className="inline-flex items-center gap-1.5 rounded-lg border bg-white/60 px-2 py-1 text-xs shadow-sm"
    >
      <span className={dark ? "opacity-40" : ""}>☀️</span>
      <span
        className={
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
          (dark ? "bg-indigo-500" : "bg-neutral-300")
        }
      >
        <span
          className={
            "absolute h-4 w-4 rounded-full bg-white shadow transition-transform " +
            (dark ? "translate-x-[18px]" : "translate-x-0.5")
          }
          style={{ backgroundColor: "#ffffff" }}
        />
      </span>
      <span className={dark ? "" : "opacity-40"}>🌙</span>
    </button>
  );
}
