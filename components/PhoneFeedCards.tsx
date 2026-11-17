"use client";

// 📱 Persönliche Einblendungen am Handy aus dem 📣 Live-Ticker:
// - 🏆 Allzeit- und 🥇 30-Tage-Highscore: für ALLE (beim Aufsteller persönlich formuliert)
// - 🥋 Flawless Victory: für ALLE (beim Gewinner persönlich formuliert)
// - 💪 persönlicher Highscore, 🎉 Matchsieg-Meilenstein, 🔥 On fire, 🧯 Serie beendet, 🛡️ unbesiegt, 💔 Traum gestoppt: nur für den Betroffenen
// Bleibt stehen, bis man draufdrückt. Ein-/ausschaltbar unter 🔔 Meldungen & Sounds (Spalte Handy).
// Beim ersten Laden schon vorhandene Einträge lösen nichts aus.

import { useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/lib/feed";
import { notifSetting } from "@/lib/notifications";
import { useNotificationSettings } from "@/components/useNotificationSettings";
import ScopeChip from "@/components/ScopeChip";

const FOR_ALL = new Set(["record", "month", "flawless"]);
const FOR_ME = new Set(["personal", "wins", "streak", "streakEnd", "unbeaten", "unbeatenEnd"]);

const fmt = (n: unknown) => (typeof n === "number" ? n.toLocaleString("de-DE") : String(n ?? ""));

const TONE: Record<string, string> = {
  record: "border-amber-300 bg-amber-50 text-amber-900",
  month: "border-violet-200 bg-violet-50 text-violet-900",
  personal: "border-sky-200 bg-sky-50 text-sky-900",
  wins: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900",
  streak: "border-orange-200 bg-orange-50 text-orange-900",
  streakEnd: "border-sky-200 bg-sky-50 text-sky-900",
  unbeaten: "border-emerald-200 bg-emerald-50 text-emerald-900",
  unbeatenEnd: "border-rose-200 bg-rose-50 text-rose-900",
  flawless: "border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-100 text-amber-900",
};

/** persönlicher Text (falls Angaben da sind), sonst der Ticker-Text */
function cardText(x: FeedItem, me: boolean): { title: string; text: string } {
  const d = (x.data ?? {}) as Record<string, unknown>;
  const machine = String(d.machine ?? "?");
  switch (x.kind) {
    case "record":
      return me
        ? { title: "Allzeit-Highscore!", text: `Du hast den Allzeit-Highscore an ${machine} geknackt: ${fmt(d.score)}!` }
        : { title: x.title, text: x.body };
    case "month":
      return me
        ? { title: "30-Tage-Highscore!", text: `Du hast den besten Score der letzten 30 Tage an ${machine}: ${fmt(d.score)}!` }
        : { title: x.title, text: x.body };
    case "personal":
      return { title: "Neuer persönlicher Highscore!", text: d.score != null ? `An ${machine}: ${fmt(d.score)}` : x.body };
    case "wins":
      return { title: d.n != null ? `Dein ${d.n}. Matchsieg!` : x.title, text: "Glückwunsch – weiter so!" };
    case "streak":
      return {
        title: "Du bist on fire! 🔥",
        text:
          d.mode === "leads"
            ? `Du hältst ${d.n} Turnier-Highscores.`
            : d.n != null
            ? `${d.n} Siege in Folge im Turnier.`
            : x.body,
      };
    case "unbeaten":
      return {
        title: "Noch unbesiegt! 🛡️",
        text:
          d.mode === "leads"
            ? `Du liegst an allen ${d.n} bisherigen Flippern vorn – zieh es durch!`
            : `${d.n} Siege ohne Niederlage – schaffst du die Flawless Victory?`,
      };
    case "unbeatenEnd":
      return {
        title: "Du hast den Traum gestoppt! 💔",
        text: d.victim != null ? `${d.victim} ist nicht mehr unbesiegt – dank dir.` : x.body,
      };
    case "flawless":
      return me
        ? {
            title: "FLAWLESS VICTORY! 🥋",
            text:
              d.mode === "leads"
                ? `Du warst an allen ${d.n} Flippern vorn – makelloses Turnier!`
                : `${d.beaten ?? d.n} Siege, keine einzige Niederlage – makelloses Turnier!`,
          }
        : { title: x.title, text: x.body };
    case "streakEnd":
      return {
        title: "Serie beendet! 🧯",
        text: d.victim != null && d.n != null ? `Du hast die Siegesserie von ${d.victim} beendet (${d.n} Siege in Folge).` : x.body,
      };
    default:
      return { title: x.title, text: x.body };
  }
}

export default function PhoneFeedCards({
  code,
  meId,
  paused = false,
  refreshMs = 12_000,
}: {
  code: string;
  meId: string;
  /** solange eine andere Einblendung (Gegner-Ereignis) sichtbar ist, warten */
  paused?: boolean;
  refreshMs?: number;
}) {
  const ns = useNotificationSettings();
  const nsRef = useRef(ns);
  nsRef.current = ns;
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const seenRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/public/feed?code=${encodeURIComponent(code)}&ts=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled || !j?.ok) return;
          const list: FeedItem[] = j.items ?? [];
          if (!seenRef.current) {
            seenRef.current = new Set(list.map((x) => x.id)); // Bestand: nichts auslösen
            return;
          }
          const seen = seenRef.current;
          const fresh = list
            .filter((x) => !seen.has(x.id))
            .reverse() // älteste zuerst
            .filter((x) => {
              const mine = (x.players ?? []).includes(String(meId));
              if (!(FOR_ALL.has(x.kind) || (FOR_ME.has(x.kind) && mine))) return false;
              return notifSetting(nsRef.current, x.kind, "phone").enabled;
            });
          list.forEach((x) => seen.add(x.id));
          if (fresh.length) setQueue((q) => [...q, ...fresh]);
        })
        .catch(() => {});
    load();
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      load();
    }, refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [code, meId, refreshMs]);

  const x = queue[0];
  if (!x || paused) return null;
  const me = (x.players ?? []).includes(String(meId));
  const t = cardText(x, me);
  const close = () => setQueue((q) => q.slice(1));
  return (
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[70]">
      <button
        type="button"
        onClick={close}
        className={"flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-xl " + (TONE[x.kind] ?? TONE.personal)}
      >
        <span className="text-4xl leading-none">{x.icon}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-black">{t.title}</span>
            <ScopeChip kind={x.kind} />
          </span>
          <span className="block text-sm">{t.text}</span>
          <span className="mt-0.5 block text-[10px] opacity-60">
            Antippen zum Schließen{queue.length > 1 ? ` · noch ${queue.length - 1} weitere` : ""}
          </span>
        </span>
      </button>
    </div>
  );
}
