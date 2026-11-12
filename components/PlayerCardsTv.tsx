"use client";

// 🃏 Spieler-Sammelkarten für den Infobildschirm (/s/<code>/tv), dunkler Arcade-Look.
// Lädt /api/public/player-cards (beim Start + alle 5 Minuten) und blättert automatisch:
// 4 Karten je Seite, alle 8 Sekunden die nächste Seite.

import { useEffect, useState } from "react";
import type { PlayerCard } from "@/lib/playerCards";

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

// frame: Rahmenfarbe der Karte (Favorit/Außenseiter wie ihr Abzeichen, sonst Spielerfarbe)
function rankBadge(c: PlayerCard): { text: string; cls: string; frame?: string } | null {
  if (c.eloRank == null || c.eloRankOf < 2) return null;
  if (c.eloRank === 1) return { text: "⭐ Favorit", cls: "bg-amber-300 text-amber-950", frame: "#fcd34d" };
  if (c.eloRankOf >= 3 && c.eloRank === c.eloRankOf)
    return { text: "🎲 Außenseiter", cls: "bg-fuchsia-400 text-fuchsia-950", frame: "#e879f9" };
  return { text: `#${c.eloRank} von ${c.eloRankOf}`, cls: "bg-white/15 text-white" };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums text-white">{value}</div>
      {sub ? <div className="text-xs text-white/50">{sub}</div> : null}
    </div>
  );
}

export function PlayerTradingCard({ card }: { card: PlayerCard }) {
  const accent = card.color || "#818cf8";
  const badge = rankBadge(card);
  const frame = badge?.frame ?? accent;
  return (
    <div
      className="relative flex w-[340px] flex-col overflow-hidden rounded-3xl bg-gradient-to-b from-slate-800 to-slate-950 p-5 text-white"
      style={{ boxShadow: `0 0 0 3px ${frame}, 0 0 36px ${frame}66` }}
    >
      {/* farbiger Schimmer oben */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-40"
        style={{ background: `radial-gradient(120% 100% at 50% 0%, ${accent}, transparent 70%)` }}
      />

      <div className="relative flex items-center justify-between">
        {badge ? (
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${badge.cls}`}>{badge.text}</span>
        ) : (
          <span />
        )}
        <span className="rounded-full bg-black/40 px-3 py-1 font-mono text-sm font-bold text-white/90 ring-1 ring-white/15">
          Elo {card.elo != null ? Math.round(card.elo) : "–"}
        </span>
      </div>

      {/* Avatar */}
      <div className="relative mx-auto mt-4">
        <div
          className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-full text-7xl ring-4 ring-white/80"
          style={{ backgroundColor: accent }}
        >
          {card.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.avatarUrl} alt={card.name} className="h-full w-full object-cover" />
          ) : card.icon ? (
            <span>{card.icon}</span>
          ) : (
            <span className="text-5xl font-black text-white/90">{initials(card.name)}</span>
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
        />
        <Stat
          label="⚔️ Siegquote"
          value={card.winrate != null ? `${card.winrate} %` : "–"}
          sub={`${card.matchWins} / ${card.matches} Matches`}
        />
      </div>

      <div className="relative mt-2 rounded-xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">❤️ Lieblingsflipper</div>
        <div className="truncate text-lg font-bold">
          {card.favoriteMachine ? (
            <>
              {card.favoriteMachine.icon ?? "🎰"} {card.favoriteMachine.name}
              <span className="ml-1.5 text-sm font-normal text-white/50">{card.favoriteMachine.count}×</span>
            </>
          ) : (
            <span className="text-white/40">noch keiner</span>
          )}
        </div>
      </div>

      <div
        className="relative mt-2 rounded-xl px-3 py-2 ring-1"
        style={{ backgroundColor: `${accent}22`, borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}55` }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider text-white/55">🔥 Bestscore</div>
        {card.bestScore ? (
          <>
            <div className="truncate font-mono text-2xl font-extrabold tabular-nums">
              {card.bestScore.score.toLocaleString("de-DE")}
            </div>
            <div className="truncate text-xs text-white/60">
              {card.bestScore.icon ?? "🎰"} {card.bestScore.machine ?? "unbekannter Flipper"}
            </div>
          </>
        ) : (
          <div className="text-lg font-bold text-white/40">noch keiner</div>
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
