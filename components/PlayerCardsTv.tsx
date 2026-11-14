"use client";

// 🃏 Spieler-Sammelkarten für den Infobildschirm (/s/<code>/tv), dunkler Arcade-Look.
// Lädt /api/public/player-cards (beim Start + alle 5 Minuten) und blättert automatisch:
// 4 Karten je Seite, alle 8 Sekunden die nächste Seite.

import { useEffect, useState } from "react";
import type { BestMachine, PlayerCard } from "@/lib/playerCards";

const REFRESH_MS = 5 * 60_000;
const PAGE_SIZE = 4;
const PAGE_MS = 8000;

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// 🎨 Farben: dunkel (Infobildschirm, Standard) oder hell (Handy-Seite)
type Theme = {
  card: string;
  box: string;
  label: string;
  muted: string;
  faint: string;
  text: string;
  here: string;
  dotOn: string;
  dotOff: string;
  elo: string;
  ring: string;
  pct: string;
  neutralBadge: string;
  initials: string;
  bestLabel: string;
  shimmer: number;
};
const DARK: Theme = {
  card: "bg-gradient-to-b from-slate-800 to-slate-950 text-white",
  box: "bg-white/[0.06] ring-1 ring-white/10",
  label: "text-white/45",
  muted: "text-white/50",
  faint: "text-white/40",
  text: "text-white",
  here: "text-sky-300/80",
  dotOn: "bg-white/80",
  dotOff: "bg-white/20",
  elo: "bg-black/40 text-white/90 ring-1 ring-white/15",
  ring: "ring-white/80",
  pct: "text-emerald-300",
  neutralBadge: "bg-white/15 text-white",
  initials: "text-white/90",
  bestLabel: "text-white/55",
  shimmer: 0.4,
};
const LIGHT: Theme = {
  card: "bg-white text-neutral-900",
  box: "bg-neutral-50 ring-1 ring-neutral-200",
  label: "text-neutral-500",
  muted: "text-neutral-500",
  faint: "text-neutral-400",
  text: "text-neutral-900",
  here: "text-sky-600",
  dotOn: "bg-neutral-700",
  dotOff: "bg-neutral-300",
  elo: "bg-white/80 text-neutral-800 ring-1 ring-neutral-200",
  ring: "ring-white",
  pct: "text-emerald-600",
  neutralBadge: "bg-white/80 text-neutral-700 ring-1 ring-neutral-200",
  initials: "text-white",
  bestLabel: "text-neutral-600",
  shimmer: 0.3,
};

// frame: Rahmenfarbe der Karte (Favorit/Außenseiter wie ihr Abzeichen, sonst Spielerfarbe)
function rankBadge(c: PlayerCard, t: Theme): { text: string; cls: string; frame?: string } | null {
  if (c.eloRank == null || c.eloRankOf < 2) return null;
  if (c.eloRank === 1) return { text: "⭐ Favorit", cls: "bg-amber-300 text-amber-950", frame: "#fcd34d" };
  if (c.eloRankOf >= 3 && c.eloRank === c.eloRankOf)
    return { text: "🎲 Außenseiter", cls: "bg-fuchsia-400 text-fuchsia-950", frame: "#e879f9" };
  return { text: `#${c.eloRank} von ${c.eloRankOf}`, cls: t.neutralBadge };
}

function Stat({ label, value, sub, t }: { label: string; value: string; sub?: string; t: Theme }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${t.box}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.label}`}>{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${t.text}`}>{value}</div>
      {sub ? <div className={`text-xs ${t.muted}`}>{sub}</div> : null}
    </div>
  );
}

const BEST_LABELS = ["🎯 Bester Flipper", "🥈 Zweitbester Flipper", "🥉 Drittbester Flipper"];
const BEST_SWITCH_MS = 5000;

/** Bester / zweit- / drittbester Flipper (Siegquote), wechselt alle 5 s */
/** kleiner Hinweis hinter der Überschrift: Wert gilt nur für die Location des Turniers */
function Here({ on, t }: { on: boolean; t: Theme }) {
  return on ? <span className={`ml-1 normal-case tracking-normal ${t.here}`}>· 📍 hier</span> : null;
}

function BestMachinesBox({ list, local, t }: { list: BestMachine[]; local: boolean; t: Theme }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    if (list.length < 2) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % list.length), BEST_SWITCH_MS);
    return () => window.clearInterval(t);
  }, [list.length]);
  const m = list[idx % Math.max(1, list.length)];

  return (
    <div className={`relative mt-2 rounded-xl px-3 py-2 ${t.box}`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.label}`}>
          {BEST_LABELS[idx] ?? BEST_LABELS[0]}
          <Here on={local} t={t} />
        </div>
        {list.length > 1 ? (
          <div className="flex gap-1">
            {list.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === idx ? t.dotOn : t.dotOff}`} />
            ))}
          </div>
        ) : null}
      </div>
      {m ? (
        <div key={idx} style={{ animation: "bmFade 0.5s ease both" }}>
          <style>{"@keyframes bmFade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}"}</style>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-lg font-bold">
              {m.icon ?? "🎰"} {m.name}
            </span>
            <span className={`shrink-0 text-lg font-extrabold tabular-nums ${t.pct}`}>{m.winrate} %</span>
          </div>
          <div className={`text-xs ${t.muted}`}>
            {m.wins} / {m.matches} Matches gewonnen
          </div>
        </div>
      ) : (
        <div className={`text-lg font-bold ${t.faint}`}>noch keiner</div>
      )}
    </div>
  );
}

/** light = helle Variante für die Handy-Seite (Infobildschirm: dunkel) */
export function PlayerTradingCard({ card, light = false }: { card: PlayerCard; light?: boolean }) {
  const t = light ? LIGHT : DARK;
  const accent = card.color || "#818cf8";
  const badge = rankBadge(card, t);
  const frame = badge?.frame ?? accent;
  return (
    <div
      className={`relative flex w-[340px] max-w-full flex-col overflow-hidden rounded-3xl p-5 ${t.card}`}
      style={{
        boxShadow: light ? `0 0 0 3px ${frame}, 0 6px 20px ${frame}40` : `0 0 0 3px ${frame}, 0 0 36px ${frame}66`,
      }}
    >
      {/* farbiger Schimmer oben */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{ opacity: t.shimmer, background: `radial-gradient(120% 100% at 50% 0%, ${accent}, transparent 70%)` }}
      />

      <div className="relative flex items-center justify-between">
        {badge ? (
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${badge.cls}`}>{badge.text}</span>
        ) : (
          <span />
        )}
        <span className={`rounded-full px-3 py-1 font-mono text-sm font-bold ${t.elo}`}>
          Elo {card.elo != null ? Math.round(card.elo) : "–"}
        </span>
      </div>

      {/* Avatar */}
      <div className="relative mx-auto mt-4">
        <div
          className={`flex h-36 w-36 items-center justify-center overflow-hidden rounded-full text-7xl ring-4 ${t.ring}`}
          style={{ backgroundColor: accent }}
        >
          {card.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.avatarUrl} alt={card.name} className="h-full w-full object-cover" />
          ) : card.icon ? (
            <span>{card.icon}</span>
          ) : (
            <span className={`text-5xl font-black ${t.initials}`}>{initials(card.name)}</span>
          )}
        </div>
      </div>

      <div className="relative mt-3 truncate text-center text-3xl font-black tracking-tight" title={card.name}>
        {card.name}
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2">
        <Stat
          label="🏆 Turniersiege"
          value={String(card.tournamentWins)}
          sub={`${card.tournaments} Turnier${card.tournaments === 1 ? "" : "e"}`}
          t={t}
        />
        <Stat
          label="⚔️ Siegquote"
          value={card.winrate != null ? `${card.winrate} %` : "–"}
          sub={`${card.matchWins} / ${card.matches} Matches`}
          t={t}
        />
      </div>

      <div className={`relative mt-2 rounded-xl px-3 py-2 ${t.box}`}>
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.label}`}>❤️ Lieblingsflipper<Here on={!!card.localScope} t={t} /></div>
        <div className="truncate text-lg font-bold">
          {card.favoriteMachine ? (
            <>
              {card.favoriteMachine.icon ?? "🎰"} {card.favoriteMachine.name}
              <span className={`ml-1.5 text-sm font-normal ${t.muted}`}>{card.favoriteMachine.count}×</span>
            </>
          ) : (
            <span className={t.faint}>noch keiner</span>
          )}
        </div>
      </div>

      <BestMachinesBox list={card.bestMachines ?? []} local={!!card.localScope} t={t} />

      <div
        className="relative mt-2 rounded-xl px-3 py-2 ring-1"
        style={{ backgroundColor: `${accent}22`, borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }}
      >
        <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.bestLabel}`}>🔥 Bestscore<Here on={!!card.localScope} t={t} /></div>
        {card.bestScore ? (
          <>
            <div className="truncate font-mono text-2xl font-extrabold tabular-nums">
              {card.bestScore.score.toLocaleString("de-DE")}
            </div>
            <div className={`truncate text-xs ${t.muted}`}>
              {card.bestScore.icon ?? "🎰"} {card.bestScore.machine ?? "unbekannter Flipper"}
            </div>
          </>
        ) : (
          <div className={`text-lg font-bold ${t.faint}`}>noch keiner</div>
        )}
      </div>
    </div>
  );
}

export default function PlayerCardsTv({ code }: { code: string }) {
  const [cards, setCards] = useState<PlayerCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const res = await fetch(`/api/public/player-cards?code=${encodeURIComponent(code)}&ts=${Date.now()}`, {
          cache: "no-store",
        });
        const j = await res.json().catch(() => null);
        if (disposed) return;
        if (!res.ok || !j?.ok) {
          setError(j?.error ?? `Fehler ${res.status}`);
          return;
        }
        setCards(j.cards ?? []);
        setError(null);
      } catch {
        if (!disposed) setError("Keine Verbindung");
      }
    }
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [code]);

  const pages = cards ? Math.max(1, Math.ceil(cards.length / PAGE_SIZE)) : 1;
  useEffect(() => {
    if (pages < 2) return;
    const t = window.setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => window.clearInterval(t);
  }, [pages]);

  if (!cards) {
    return (
      <div className="w-[1500px] py-24 text-center text-2xl text-white/50">
        {error ? `Spielerkarten nicht verfügbar (${error})` : "Lade Spielerkarten …"}
      </div>
    );
  }
  if (!cards.length) {
    return <div className="w-[1500px] py-24 text-center text-2xl text-white/50">Noch keine Spieler im Turnier.</div>;
  }

  const p = page % pages;
  const visible = cards.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  return (
    <div className="flex w-[1500px] flex-col items-center gap-6 py-4">
      <div key={p} className="flex justify-center gap-8" style={{ animation: "tvFadeIn 0.6s ease both" }}>
        {visible.map((c) => (
          <PlayerTradingCard key={c.playerId} card={c} />
        ))}
      </div>
      {pages > 1 ? (
        <div className="flex gap-2">
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-full ${i === p ? "bg-white" : "bg-white/25"}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
