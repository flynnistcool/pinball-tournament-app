"use client";

// Punkte-Eingabe mit Tausender-Trennzeichen schon WÄHREND des Tippens
// + große Vorschau-Blase ("≈ 91 Mio.") solange das Feld aktiv ist.
// Gespeichert/weitergegeben wird immer nur die reine Ziffernfolge (onDigitsChange).

import { useLayoutEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";

// gleiche Schreibweise wie überall bei Scores (3.300.000.000 – wie am Flipper)
const fmt = new Intl.NumberFormat("de-DE");

function formatDigits(digits: string) {
  if (!digits) return "";
  // ohne führende Nullen formatieren, aber "0" erlauben
  const n = Number(digits);
  return Number.isFinite(n) ? fmt.format(n) : digits;
}

/** grobe Größenordnung zum Gegenprüfen: "≈ 91 Mio." */
export function scoreMagnitude(digits: string): string | null {
  const n = Number(digits);
  if (!digits || !Number.isFinite(n) || n < 1000) return null;
  const units: [number, string][] = [
    [1e12, "Billionen"],
    [1e9, "Mrd."],
    [1e6, "Mio."],
    [1e3, "Tsd."],
  ];
  for (const [base, label] of units) {
    if (n >= base) {
      const v = n / base;
      const txt = v >= 100 ? Math.round(v).toString() : v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
      return `≈ ${txt} ${label}`;
    }
  }
  return null;
}

export default function ScoreInput({
  digits,
  onDigitsChange,
  onFocus,
  onBlur,
  onKeyDown,
  disabled,
  placeholder = "0",
  className = "",
}: {
  /** aktueller Wert als reine Ziffern ("90989099") */
  digits: string;
  onDigitsChange: (digits: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  // Cursor nach dem Formatieren wieder an die richtige Stelle setzen:
  // gemerkt wird "wie viele Ziffern stehen links vom Cursor"
  const pendingCaretDigits = useRef<number | null>(null);

  const display = formatDigits(digits);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const want = pendingCaretDigits.current;
    if (!el || want == null) return;
    pendingCaretDigits.current = null;
    let pos = 0;
    let seen = 0;
    while (pos < display.length && seen < want) {
      if (/[0-9]/.test(display[pos])) seen++;
      pos++;
    }
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* manche Browser erlauben das bei inputMode=numeric nicht – egal */
    }
  }); // nach jedem Rendern (auch wenn sich die Anzeige nicht geändert hat)

  const magnitude = scoreMagnitude(digits);

  return (
    <span className="relative inline-block">
      {/* Große Vorschau über dem Feld – nur beim Tippen */}
      {focused && digits ? (
        <span
          className="pointer-events-none absolute bottom-full right-0 z-40 mb-2 whitespace-nowrap rounded-xl bg-neutral-900 px-3 py-1.5 text-right text-white shadow-xl"
          aria-hidden="true"
        >
          <span className="block font-mono text-xl font-bold tabular-nums tracking-wide">{display}</span>
          {magnitude ? <span className="block text-xs font-semibold text-amber-300">{magnitude}</span> : null}
          <span className="absolute -bottom-1 right-6 h-2 w-2 rotate-45 bg-neutral-900" />
        </span>
      ) : null}

      <input
        ref={inputRef}
        value={display}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        disabled={disabled}
        className={
          "w-full rounded-xl border px-4 py-3 text-base tabular-nums outline-none focus:ring-2 focus:ring-black/10 " +
          className
        }
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const raw = e.target.value;
          const caret = e.target.selectionStart ?? raw.length;
          // Ziffern links vom Cursor zählen (Trennzeichen ignorieren)
          const digitsLeft = raw.slice(0, caret).replace(/[^0-9]/g, "").length;
          let cleaned = raw.replace(/[^0-9]/g, "");
          let left = digitsLeft;
          // Rücktaste/Entf auf einem Trennzeichen: Ziffern unverändert → die Ziffer davor löschen
          if (cleaned === digits && raw.length < display.length && left > 0) {
            cleaned = cleaned.slice(0, left - 1) + cleaned.slice(left);
            left -= 1;
          }
          // führende Nullen weg (aber eine einzelne "0" bleibt)
          const stripped = cleaned.replace(/^0+(?=\d)/, "");
          const removedLead = cleaned.length - stripped.length;
          cleaned = stripped;
          pendingCaretDigits.current = Math.max(0, left - removedLead);
          onDigitsChange(cleaned);
        }}
      />
    </span>
  );
}
