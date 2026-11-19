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
import { parseUpsetBody } from "@/lib/upsetText";
import { closeChancesOf } from "@/lib/closeMatch";

const FOR_ALL = new Set(["record", "month", "flawless"]);
const FOR_ME = new Set(["scoreForm", "personal", "wins", "streak", "streakEnd", "unbeaten", "unbeatenEnd", "leader", "upset", "photo", "blowout", "revenge", "premiere", "premiereWin", "eloMark", "closeMatch"]);

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
  leader: "border-yellow-300 bg-yellow-50 text-amber-900",
  upset: "border-cyan-200 bg-cyan-50 text-cyan-900",
  photo: "border-slate-300 bg-slate-50 text-slate-900",
  blowout: "border-orange-200 bg-orange-50 text-orange-900",
  revenge: "border-violet-200 bg-violet-50 text-violet-900",
  premiere: "border-pink-200 bg-pink-50 text-pink-900",
  premiereWin: "border-amber-200 bg-gradient-to-r from-fuchsia-50 to-amber-50 text-amber-900",
  eloMark: "border-emerald-200 bg-emerald-50 text-emerald-900",
  scoreForm: "border-indigo-200 bg-indigo-50 text-indigo-900",
  closeMatch: "border-amber-200 bg-amber-50 text-amber-900",
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
    case "leader":
      return { title: "Du führst! 👑", text: d.points != null ? `Du bist allein an der Spitze – ${d.points} Punkte.` : x.body };
    case "upset":
      return {
        title: "Favoritensturz! 🧊",
        text:
          d.other != null && d.winnerChance != null
            ? `Mit nur ${d.winnerChance} % Siegchance hast du Favorit ${d.other} geschlagen – stark!`
            : d.other != null && d.loserElo != null
            ? `Du hast Favorit ${d.other} (${Math.round(Number(d.loserElo))} Elo) geschlagen – stark!`
            : x.body,
      };
    case "photo":
      return {
        title: "Fotofinish! 📸",
        text: d.other != null && d.gapPct != null ? `Hauchdünn gegen ${d.other} gewonnen – nur ${String(d.gapPct).replace(".", ",")} % Vorsprung.` : x.body,
      };
    case "blowout":
      return {
        title: "Kantersieg! 💣",
        text: d.other != null && d.factor != null ? `${String(d.factor).replace(".", ",")}× so viele Punkte wie ${d.other}.` : x.body,
      };
    case "revenge":
      return {
        title: "Revanche geglückt! 🔄",
        text: d.other != null ? `Diesmal hast du ${d.other} geschlagen${d.prevRound ? ` – in Runde ${d.prevRound} lief es noch andersrum` : ""}.` : x.body,
      };
    case "premiere":
      return {
        title: "Flipper-Premiere! 🎰",
        text: d.machine != null ? `Dein erstes Spiel an ${machine} – viel Glück! 🍀` : x.body,
      };
    case "premiereWin":
      return {
        title: "Premieren-Sieg! 🌟",
        text:
          d.machine != null
            ? d.score != null
              ? `Erstes Spiel an ${machine} und gleich gewonnen – mit ${fmt(d.score)} Punkten!`
              : `Erstes Spiel an ${machine} und gleich gewonnen!`
            : x.body,
      };
    case "eloMark":
      return {
        title: d.again ? "Marke erneut geknackt! 📈" : "Elo-Meilenstein! 📈",
        text: d.mark != null ? `Du hast ${d.again ? "erneut " : ""}die ${d.mark} geknackt – jetzt ${d.elo} Elo.` : x.body,
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
    case "scoreForm":
      return {
        title: d.score != null ? `Dein Score an ${machine}: ${fmt(d.score)}` : x.title,
        text: typeof d.line === "string" ? d.line : x.body,
      };
    case "closeMatch": {
      // ⚖️ Auf Messers Schneide (Du-Form; Balken + Zeilen siehe CloseCard)
      const m = d.machine != null ? ` an ${d.machineIcon ? `${String(d.machineIcon)} ` : ""}${machine}` : "";
      if (typeof d.countered === "boolean" && me) {
        return d.countered
          ? { title: "Gekontert! ⚖️", text: `Du konterst${m}: ${fmt(d.winnerScore)} gegen ${fmt(d.loserScore)} von ${String(d.other ?? "?")}!` }
          : { title: "Gehalten! ⚖️", text: `Du hältst stand${m}: ${fmt(d.winnerScore)} – ${String(d.other ?? "?")} bleibt bei ${fmt(d.loserScore)}.` };
      }
      return { title: me ? "Auf Messers Schneide! ⚖️" : x.title, text: x.body };
    }
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
  // 🧊 Favoritensturz mit Balken (nur für den Sieger selbst und nur, wenn der Text lesbar ist)
  const up = x.kind === "upset" && me ? parseUpsetBody(x.body) : null;
  const upset = up && up.winnerPct != null && up.loserPct != null ? up : null;
  // ⚖️ Auf Messers Schneide mit Balken (nur Beteiligte, nur neue Meldungen mit Spieler-Kennungen)
  const closeRows = x.kind === "closeMatch" && me ? closeChancesOf(x.data) : [];
  const closeMine = closeRows.length >= 2 && closeRows.some((r) => r.id === String(meId)) ? closeRows : null;
  const close = () => setQueue((q) => q.slice(1));
  return (
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[70]">
      <button
        type="button"
        onClick={close}
        className={"flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-xl " + (TONE[x.kind] ?? TONE.personal)}
      >
        <span className="text-4xl leading-none">{x.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-black">{t.title}</span>
            <ScopeChip kind={x.kind} />
          </span>
          {upset ? (
            // 🧊 wie Ticker/Einblendung: Siegchancen-Balken, Du-Form
            <span className="mt-0.5 block text-sm">
              <span className="block opacity-75">
                {upset.machine ? `Siegchancen im ${upset.machine}-Match` : "Siegchancen vor dem Match"}
              </span>
              <span className="mt-1 flex items-baseline justify-between gap-2 tabular-nums">
                <span>
                  <b>Du</b> <span className="font-semibold text-sky-600">{upset.winnerPct} %</span>
                </span>
                <span>
                  <span className="text-neutral-600">{upset.loserPct} %</span> <b>{upset.loser}</b>
                </span>
              </span>
              <span className="mt-0.5 flex h-2.5 overflow-hidden rounded-full bg-neutral-200">
                <span className="bg-sky-500" style={{ width: `${upset.winnerPct}%` }} />
                <span className="bg-neutral-400" style={{ width: `${upset.loserPct}%` }} />
              </span>
              <span className="mt-1 block">
                Du schlägst den Favoriten <b>{upset.loser}</b> – wow!
              </span>
            </span>
          ) : closeMine ? (
            <CloseCard x={x} rows={closeMine} meId={String(meId)} />
          ) : (
            <span className="block text-sm">{t.text}</span>
          )}
          <span className="mt-0.5 block text-[10px] opacity-60">
            Antippen zum Schließen{queue.length > 1 ? ` · noch ${queue.length - 1} weitere` : ""}
          </span>
        </span>
      </button>
    </div>
  );
}

/** ⚖️ Auf Messers Schneide am Handy: Siegchancen-Balken, ich als "Du" zuerst */
function CloseCard({ x, rows, meId }: { x: FeedItem; rows: { name: string; pct: number; id?: string }[]; meId: string }) {
  const d = (x.data ?? {}) as Record<string, unknown>;
  const machine = d.machine != null ? `${d.machineIcon ? `${String(d.machineIcon)} ` : ""}${String(d.machine)}` : "";
  const mine = rows.find((r) => r.id === meId)!;
  const others = rows.filter((r) => r.id !== meId);
  const ordered = [mine, ...others];
  const COLORS = ["bg-amber-500", "bg-neutral-400", "bg-teal-400", "bg-rose-300"];
  const rtp = d.rtp === true;
  const other = others[0]?.name ?? "?";
  const line = rtp
    ? String(d.firstId ?? "") === meId
      ? <>Du legst <b>{fmt(d.score)}</b> vor – <b>{other}</b> ist gleich stark. Hält dein Score?</>
      : <><b>{String(d.player ?? other)}</b> legt <b>{fmt(d.score)}</b> vor – kannst <b>du</b> kontern?</>
    : <>Völlig offen – zeig, was du kannst! 💪</>;
  return (
    <span className="mt-0.5 block text-sm">
      <span className="block opacity-75">
        {rtp ? (machine ? `Siegchancen der Favoriten an ${machine}` : "Siegchancen der Favoriten") : machine ? `Siegchancen im ${machine}-Match` : "Siegchancen vor dem Match"}
      </span>
      {ordered.length === 2 ? (
        <span className="mt-1 flex items-baseline justify-between gap-2 tabular-nums">
          <span>
            <b>Du</b> <span className="font-semibold text-amber-700">{mine.pct} %</span>
          </span>
          <span>
            <span className="text-neutral-600">{others[0].pct} %</span> <b>{others[0].name}</b>
          </span>
        </span>
      ) : (
        <span className="mt-1 flex flex-wrap gap-x-3 tabular-nums">
          {ordered.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className={"inline-block h-2 w-2 rounded-full " + COLORS[i % COLORS.length]} />
              <b>{r === mine ? "Du" : r.name}</b> <span className="text-neutral-600">{r.pct} %</span>
            </span>
          ))}
        </span>
      )}
      <span className="mt-0.5 flex h-2.5 overflow-hidden rounded-full bg-neutral-200">
        {ordered.map((r, i) => (
          <span key={i} className={COLORS[i % COLORS.length]} style={{ width: `${r.pct}%` }} />
        ))}
      </span>
      <span className="mt-1 block">{line}</span>
    </span>
  );
}
