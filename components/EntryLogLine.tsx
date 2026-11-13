"use client";

// 📝 Kleine Zeile UNTER den Spielern eines Matches (Admin): wer hat Score/Platz gespeichert.
//   "📝 📱 Flo - sportyflo 14:32 → 🖥️ Admin 14:35"   – antippen klappt die Einzelheiten auf.
// Änderungen aller Spieler des Matches werden zusammengefasst (gleiche Person + kurz hintereinander = ein Eintrag).
// Daten: /api/match_players/entry-log (ein gemeinsamer Abruf pro Turnier für alle Zeilen).
// Neu geladen wird nur, wenn sich bei irgendeinem Spieler Score/Platz ändert (kein eigenes Polling).

import { useEffect, useState, useSyncExternalStore } from "react";
import type { EntryLogItem } from "@/lib/entryLog";

type Store = {
  logs: Record<string, EntryLogItem[]>;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  loaded: boolean;
};

const stores = new Map<string, Store>();

function storeFor(code: string): Store {
  let s = stores.get(code);
  if (!s) {
    s = { logs: {}, listeners: new Set(), timer: null, loaded: false };
    stores.set(code, s);
  }
  return s;
}

async function fetchLogs(code: string) {
  const s = storeFor(code);
  try {
    const res = await fetch(`/api/match_players/entry-log?code=${encodeURIComponent(code)}&_ts=${Date.now()}`, {
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) return;
    s.logs = (j.logs ?? {}) as Record<string, EntryLogItem[]>;
    s.loaded = true;
    s.listeners.forEach((l) => l());
  } catch {
    /* beim nächsten Anlass erneut */
  }
}

/** viele Zeilen melden gleichzeitig "neu laden" → nur EIN Abruf (kurz gesammelt) */
function requestRefresh(code: string, delayMs = 1200) {
  const s = storeFor(code);
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    s.timer = null;
    void fetchLogs(code);
  }, delayMs);
}

const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const numFmt = new Intl.NumberFormat("de-DE");

function icon(it: { src: EntryLogItem["src"] }) {
  return it.src === "phone" ? "📱" : "🖥️";
}

function val(v: number | null, kind: "score" | "pos") {
  if (v == null) return "–";
  return kind === "pos" ? `${v}.` : numFmt.format(v);
}

type Change = { playerName: string; score?: EntryLogItem["score"]; pos?: EntryLogItem["pos"] };
type Group = { at: string; by: string; src: EntryLogItem["src"]; changes: Change[] };

/** Einträge aller Spieler eines Matches zu "Speichervorgängen" zusammenfassen */
function groupMatchLog(players: { id: string; name: string }[], logs: Record<string, EntryLogItem[]>, matchId: string): Group[] {
  const events: (EntryLogItem & { playerName: string })[] = [];
  for (const p of players) {
    for (const it of logs[`${matchId}|${p.id}`] ?? []) events.push({ ...it, playerName: p.name });
  }
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const groups: Group[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    const change: Change = { playerName: e.playerName, score: e.score, pos: e.pos };
    if (last && last.by === e.by && last.src === e.src && Date.parse(e.at) - Date.parse(last.at) < 60_000) {
      last.changes.push(change);
    } else {
      groups.push({ at: e.at, by: e.by, src: e.src, changes: [change] });
    }
  }
  return groups;
}

export default function EntryLogMatchLine({
  code,
  matchId,
  players,
  sig,
  resetKey,
  className = "",
}: {
  code: string;
  matchId: string;
  /** Spieler des Matches (Reihenfolge = Anzeige in den Einzelheiten) */
  players: { id: string; name: string }[];
  /** ändert sich, wenn sich Score/Platz im Match ändert → Verlauf neu laden */
  sig: string;
  /** ändert sich z. B. beim Auf-/Zuklappen der Runde → Einzelheiten wieder einklappen */
  resetKey?: string | number | boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [resetKey]);
  const s = storeFor(code);
  const logs = useSyncExternalStore(
    (cb) => {
      s.listeners.add(cb);
      return () => {
        s.listeners.delete(cb);
      };
    },
    () => s.logs,
    () => s.logs
  );

  useEffect(() => {
    requestRefresh(code);
  }, [code, sig]);

  const groups = groupMatchLog(players, logs, matchId);
  if (!groups.length) return null;

  const shown = groups.slice(-3);
  return (
    <div className={"px-1 text-[11px] leading-snug text-neutral-400 " + className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="max-w-full truncate text-left hover:text-neutral-600"
        title="Wer hat gespeichert? (antippen für Einzelheiten)"
      >
        📝 {groups.length > shown.length ? "… → " : ""}
        {shown.map((g, i) => (
          <span key={g.at + i}>
            {i > 0 ? " → " : ""}
            {icon(g)} {g.by} {timeFmt.format(new Date(g.at))}
          </span>
        ))}
        <span className="ml-1">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="mt-1 space-y-1 rounded-lg bg-neutral-50 px-3 py-2 text-[12px] text-neutral-600">
          {groups.map((g, i) => (
            <div key={g.at + i}>
              <span className="tabular-nums text-neutral-400">{timeFmt.format(new Date(g.at))}</span> · {icon(g)}{" "}
              <b>{g.by}</b>
              <span className="text-neutral-400">:</span>{" "}
              {g.changes.map((c, k) => (
                <span key={k}>
                  {k > 0 ? <span className="text-neutral-300"> | </span> : null}
                  {c.playerName}
                  {c.score ? (
                    <>
                      {" "}
                      Score {val(c.score[0], "score")} → <b>{val(c.score[1], "score")}</b>
                    </>
                  ) : null}
                  {c.pos ? (
                    <>
                      {c.score ? "," : ""} Platz {val(c.pos[0], "pos")} → <b>{val(c.pos[1], "pos")}</b>
                    </>
                  ) : null}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
