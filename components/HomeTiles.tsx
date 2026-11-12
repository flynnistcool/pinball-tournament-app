"use client";

// 🏠 Startseiten-Kacheln unter dem Willkommensbild:
// „Läuft gerade“ · „Letzter Sieger“ · „Höchster Score der Woche“.
// Daten aus /api/home/summary (beim Start + jede Minute). Bei Fehlern bleibt der alte Stand.

import { useEffect, useState, type ReactNode } from "react";

type Running = { code: string; name: string | null; format: string | null; round: number; location: string | null };
type LastWinner = {
  names: string[];
  viaSuperFinal: boolean;
  tournamentName: string | null;
  code: string;
  date: string | null;
  location: string | null;
};
type WeekTop = {
  score: number;
  playerName: string | null;
  machineName: string | null;
  machineIcon: string | null;
  tournamentName: string | null;
  code: string | null;
  date: string | null;
};
type Summary = { running: Running[]; lastWinner: LastWinner | null; weekTop: WeekTop | null };

const REFRESH_MS = 60_000;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

function Tile({
  icon,
  title,
  tone,
  onClick,
  children,
}: {
  icon: string;
  title: string;
  tone: "emerald" | "amber" | "indigo";
  onClick?: () => void;
  children: ReactNode;
}) {
  const tones = {
    emerald: "from-emerald-50 to-white border-emerald-200",
    amber: "from-amber-50 to-white border-amber-200",
    indigo: "from-indigo-50 to-white border-indigo-200",
  } as const;
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={
        "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-gradient-to-br p-4 shadow-sm transition " +
        tones[tone] +
        (clickable ? " cursor-pointer hover:shadow-md active:scale-[0.99]" : "")
      }
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <span className="text-base leading-none">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function HomeTiles({ onOpenTournament }: { onOpenTournament?: (code: string) => void }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const res = await fetch(`/api/home/summary?ts=${Date.now()}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) return; // alten Stand behalten
        if (!disposed) setData({ running: j.running ?? [], lastWinner: j.lastWinner ?? null, weekTop: j.weekTop ?? null });
      } catch {
        // offline o. Ä.
      } finally {
        if (!disposed) setLoaded(true);
      }
    }
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!loaded) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border bg-neutral-100" />
        ))}
      </div>
    );
  }
  if (!data) return null; // Fehler beim ersten Laden: Kacheln einfach weglassen

  const live = data.running[0] ?? null;
  const w = data.lastWinner;
  const top = data.weekTop;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {/* 1) Läuft gerade */}
      <Tile
        icon="🟢"
        title="Läuft gerade"
        tone="emerald"
        onClick={live && onOpenTournament ? () => onOpenTournament(live.code) : undefined}
      >
        {live ? (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="truncate text-xl font-bold text-neutral-900">{live.name ?? live.code}</span>
            </div>
            <div className="truncate text-sm text-neutral-600">
              {live.round > 0 ? `Runde ${live.round}` : "Noch keine Runde"}
              {live.location ? ` · 📍 ${live.location}` : ""}
            </div>
            <div className="mt-auto flex items-center gap-2 pt-1">
              <span className="text-xs font-medium text-emerald-700">Antippen zum Öffnen</span>
              <a
                href={`/s/${encodeURIComponent(live.code)}/tv`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Infobildschirm (TV) in neuem Tab öffnen"
                className="ml-auto rounded-full border-2 border-sky-400 bg-white px-2 py-0.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
              >
                📺 TV
              </a>
            </div>
            {data.running.length > 1 ? (
              <div className="text-xs text-neutral-500">+ {data.running.length - 1} weitere laufend</div>
            ) : null}
          </>
        ) : (
          <>
            <div className="text-xl font-bold text-neutral-400">Gerade Pause</div>
            <div className="text-sm text-neutral-500">Kein Turnier läuft – Zeit für ein neues? 🎱</div>
          </>
        )}
      </Tile>

      {/* 2) Letzter Sieger */}
      <Tile
        icon="🏆"
        title="Letzter Sieger"
        tone="amber"
        onClick={w && onOpenTournament ? () => onOpenTournament(w.code) : undefined}
      >
        {w ? (
          <>
            <div className="truncate text-xl font-bold text-neutral-900" title={w.names.join(", ")}>
              {w.names.join(" & ")}
            </div>
            <div className="truncate text-sm text-neutral-600">
              {w.tournamentName ?? w.code}
              {w.date ? ` · ${fmtDate(w.date)}` : ""}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
              {w.viaSuperFinal ? (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                  🔥 Superfinale
                </span>
              ) : null}
              {w.location ? <span className="truncate text-xs text-neutral-500">📍 {w.location}</span> : null}
            </div>
          </>
        ) : (
          <div className="text-sm text-neutral-500">Noch kein beendetes Turnier.</div>
        )}
      </Tile>

      {/* 3) Höchster Score der Woche */}
      <Tile
        icon="🔥"
        title="Höchster Score der Woche"
        tone="indigo"
        onClick={top?.code && onOpenTournament ? () => onOpenTournament(top.code as string) : undefined}
      >
        {top ? (
          <>
            <div className="truncate font-mono text-2xl font-extrabold tabular-nums text-indigo-700">
              {top.score.toLocaleString("de-DE")}
            </div>
            <div className="truncate text-sm font-semibold text-neutral-800">
              {top.playerName ?? "Unbekannt"}
              {top.machineName ? (
                <span className="font-normal text-neutral-600">
                  {" "}
                  · {top.machineIcon ?? "🎰"} {top.machineName}
                </span>
              ) : null}
            </div>
            <div className="mt-auto truncate pt-1 text-xs text-neutral-500">
              {top.tournamentName ?? ""}
              {top.date ? ` · ${fmtDate(top.date)}` : ""}
            </div>
          </>
        ) : (
          <>
            <div className="text-xl font-bold text-neutral-400">Noch offen</div>
            <div className="text-sm text-neutral-500">Diese Woche wurde noch kein Score eingetragen.</div>
          </>
        )}
      </Tile>
    </div>
  );
}
