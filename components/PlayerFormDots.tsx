"use client";

// 📊 Form eines Spielers (letzte 10 gewertete Matches, alt → neu) – kleine Kreise für den Admin.
// Daten: /api/public/player-cards (gleiche Rechnung wie die Spielerkarten am TV/Handy).

import { useEffect, useState } from "react";

type FormMap = Record<string, boolean[]>;

// mehrere Match-Karten teilen sich denselben Abruf (gleicher Code + gleicher Stand)
const cache = new Map<string, Promise<FormMap>>();

function loadForms(code: string, key: string): Promise<FormMap> {
  const ck = `${code}|${key}`;
  const hit = cache.get(ck);
  if (hit) return hit;
  const p = fetch(`/api/public/player-cards?code=${encodeURIComponent(code)}&ts=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => {
      const out: FormMap = {};
      for (const c of Array.isArray(j?.cards) ? j.cards : []) {
        if (c?.playerId && Array.isArray(c.form)) out[String(c.playerId)] = c.form.map(Boolean);
      }
      return out;
    })
    .catch(() => {
      cache.delete(ck); // beim nächsten Mal neu versuchen
      return {} as FormMap;
    });
  cache.set(ck, p);
  // alte Stände dieses Turniers vergessen
  cache.forEach((_, k) => {
    if (k.startsWith(`${code}|`) && k !== ck) cache.delete(k);
  });
  return p;
}

/** Form je Spieler-ID dieses Turniers; code = null → nichts laden (z. B. ausgeschaltet) */
export function usePlayerForms(code: string | null, refreshKey: string | number): FormMap {
  const [forms, setForms] = useState<FormMap>({});
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    loadForms(code, String(refreshKey)).then((f) => {
      if (!cancelled) setForms(f);
    });
    return () => {
      cancelled = true;
    };
  }, [code, refreshKey]);
  return forms;
}

/** Symbol der Form-Anzeige (überall gleich) */
export const FORM_ICON = "⚡";

/**
 * size "sm" = Admin (schmale Spalte), "md" = Handy (gleiches Muster wie "💪 Bestwert")
 */
export function FormDots({
  form,
  size = "sm",
  className = "",
}: {
  form: readonly boolean[];
  size?: "sm" | "md";
  className?: string;
}) {
  if (!form.length) return null;
  const wins = form.filter(Boolean).length;
  const md = size === "md";
  return (
    <div
      className={(md ? "flex items-center gap-x-1.5 text-xs text-neutral-500 " : "flex items-center gap-1.5 ") + className}
      title={`Form: ${wins} von ${form.length} gewonnen (letzte Matches, alt → neu)`}
    >
      <span className={md ? "" : "text-[10px] text-neutral-400 sm:text-xs"}>{FORM_ICON} Form</span>
      <span className={"flex items-center " + (md ? "gap-1" : "gap-[3px]")}>
        {form.map((w, i) => (
          <span
            key={i}
            className={
              "inline-block rounded-full " +
              (md ? "h-[8px] w-[8px] " : "h-2 w-2 ") +
              (w ? "bg-emerald-500" : "border-[1.5px] border-red-400")
            }
          />
        ))}
      </span>
    </div>
  );
}
