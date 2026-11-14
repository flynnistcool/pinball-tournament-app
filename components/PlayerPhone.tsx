"use client";

// 📱 Handy-Seite eines Spielers (/s/<CODE>/spieler/<token>), erreichbar per QR-Code aus der Spielerliste.
// Reiter 1 "Mein Match": aktuelles Match + Eintragen (Regeln siehe lib/myMatch.ts → entryMode)
// Reiter 2 "Turnier-Infos": Abschnitte untereinander zum Scrollen – Leaderboard (gleiche Rechnung wie der
//   Infobildschirm), Spielerkarten zum Wischen, später weitere. Die Reiter-Leiste bleibt oben kleben.
// Aktualisiert sich alle paar Sekunden selbst (nur solange die Seite sichtbar ist).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScoreInput from "@/components/ScoreInput";
import StreakFire from "@/components/StreakFire";
import PlayerCardsSwipe from "@/components/PlayerCardsSwipe";
import PhoneTournamentInfo from "@/components/PhoneTournamentInfo";
import PhoneMatchInsights from "@/components/PhoneMatchInsights";
import { RoundPointsBars } from "@/components/charts";
import {
  entryMode,
  findMyMatch,
  positionsFromScores,
  liveLeaderboard,
  toScore,
  type MmData,
  type MyMatchInfo,
} from "@/lib/myMatch";
import { computeStreaks, streakMode } from "@/lib/winStreaks";

const POLL_MS = 6000;
/** nach dem Speichern so lange Pause (Admin-Seite aktualisiert alle 16 s → danach haben es alle gesehen) */
const SAVE_COOLDOWN_MS = 20_000;
const fmt = new Intl.NumberFormat("de-DE");

type Me = { playerId: string; name: string };
type Draft = { score?: string; position?: number | null };
type Seen = { score: number | null; position: number | null };
type Conflict = { player_id: string; field: "score" | "position"; current: number | null };

export default function PlayerPhone({ code, token }: { code: string; token: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [data, setData] = useState<MmData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTabState] = useState<"match" | "board">("match");
  // Reiter wechseln → nach oben springen (falls man in den Turnier-Infos weit unten war)
  const setTab = (t: "match" | "board") => {
    setTabState(t);
    if (typeof window !== "undefined" && window.scrollY > 0) window.scrollTo({ top: 0 });
  };

  // Prüfen, wer ich bin
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/me?code=${encodeURIComponent(code)}&t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok) setMe({ playerId: String(j.playerId), name: String(j.name ?? "?") });
        else setMeError(String(j?.error ?? "QR-Code ungültig"));
      })
      .catch(() => alive && setMeError("Keine Verbindung"));
    return () => {
      alive = false;
    };
  }, [code, token]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/tournament?code=${encodeURIComponent(code)}&_ts=${Date.now()}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.tournament) {
        setLoadError(String(j?.error ?? "Laden fehlgeschlagen"));
        return; // alte Daten behalten
      }
      setLoadError(null);
      setData(j as MmData);
    } catch {
      setLoadError("Keine Verbindung – versuche es gleich wieder");
    }
  }, [code]);

  useEffect(() => {
    if (!me) return;
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [me, load]);

  if (meError) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-4xl">🤔</div>
          <div className="mt-2 font-semibold">{meError}</div>
          <div className="mt-1 text-sm text-neutral-500">Bitte den QR-Code beim Turnier-Admin neu scannen.</div>
        </div>
      </Shell>
    );
  }
  if (!me || !data) {
    return (
      <Shell>
        <div className="py-16 text-center text-neutral-500">Lade …</div>
      </Shell>
    );
  }

  const finished = String(data.tournament?.status ?? "") === "finished";

  return (
    <Shell>
      <header className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {data.tournament?.name ?? "Turnier"}
        </div>
        <div className="text-2xl font-black">Hallo {me.name} 👋</div>
      </header>

      <div className="sticky top-[env(safe-area-inset-top,0px)] z-20 mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-neutral-200/80 p-1 backdrop-blur">
        <TabBtn active={tab === "match"} onClick={() => setTab("match")}>
          🕹️ Mein Match
        </TabBtn>
        <TabBtn active={tab === "board"} onClick={() => setTab("board")}>
          📊 Turnier-Infos
        </TabBtn>
      </div>

      {loadError ? (
        <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{loadError}</div>
      ) : null}

      {tab === "match" ? (
        finished ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <div className="text-4xl">🏁</div>
            <div className="mt-2 text-lg font-bold">Das Turnier ist beendet</div>
            <div className="mt-1 text-sm text-neutral-500">Den Endstand siehst du unter „Turnier-Infos“.</div>
          </div>
        ) : (
          <MatchTab code={code} token={token} me={me} data={data} reload={load} />
        )
      ) : (
        <InfoTab code={code} data={data} meId={me.playerId} />
      )}

      <div className="mt-6 text-center text-[11px] text-neutral-400">aktualisiert sich automatisch</div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <div className="mx-auto max-w-md px-4 pb-10 pt-4">{children}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl px-3 py-2 text-sm font-bold transition " +
        (active ? "bg-white text-neutral-900 shadow" : "text-neutral-600")
      }
    >
      {children}
    </button>
  );
}

// ───────────────────────── Reiter "Mein Match" ─────────────────────────

function MatchTab({
  code,
  token,
  me,
  data,
  reload,
}: {
  code: string;
  token: string;
  me: Me;
  data: MmData;
  reload: () => Promise<void>;
}) {
  const mode = entryMode(data.tournament?.format);
  const { current, last, waiting, alsoActive } = useMemo(() => findMyMatch(data, me.playerId), [data, me.playerId]);

  // Round the Pinball: gerade an keinem Flipper dran → warten
  if (!current && waiting) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-4xl">⏳</div>
          <div className="mt-2 text-lg font-bold">Gleich bist du dran</div>
          <div className="mt-1 text-sm text-neutral-500">
            Als Nächstes an <b>{waiting.info.machine?.name ?? "deinem nächsten Flipper"}</b>
            {waiting.ahead > 0
              ? ` – noch ${waiting.ahead} Spieler vor dir.`
              : " – sobald alle an den anderen Flippern ihr Spiel eingetragen haben."}
          </div>
          <div className="mt-1 text-xs text-neutral-400">Die Seite springt von selbst um, sobald du dran bist.</div>
        </div>
        <MatchCard info={waiting.info} data={data} meId={me.playerId} title="Dein nächster Flipper" />
        <PhoneMatchInsights code={code} data={data} info={waiting.info} meId={me.playerId} />
      </div>
    );
  }

  if (!current) {
    // Elimination: Letzter (Platz 2) im letzten Match = ausgeschieden
    const out =
      mode === "score" &&
      !!last &&
      Number(last.players.find((x) => String(x.player_id) === String(me.playerId))?.position) === 2;
    if (out) {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <div className="text-4xl">😢</div>
            <div className="mt-2 text-lg font-bold">Du bist ausgeschieden</div>
            <div className="mt-1 text-sm text-neutral-500">Gut gespielt! Unter „Leaderboard“ kannst du weiter mitfiebern.</div>
          </div>
          {last ? <MatchCard info={last} data={data} meId={me.playerId} title="Dein letztes Match" /> : null}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="text-4xl">{last ? "✅" : "⏳"}</div>
          <div className="mt-2 text-lg font-bold">
            {mode === "own" && last ? "Alle Flipper gespielt!" : last ? "Erledigt!" : "Noch kein Match für dich"}
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            {mode === "own" && last
              ? "Du hast an allen Flippern deinen Score eingetragen. Den Stand siehst du unter „Leaderboard“."
              : "Warte auf die nächste Runde – die Seite springt dann von selbst weiter."}
          </div>
        </div>
        {last ? <MatchCard info={last} data={data} meId={me.playerId} title="Dein letztes Match" /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <EntryCard
        key={current.match.id}
        code={code}
        token={token}
        me={me}
        data={data}
        info={current}
        mode={mode}
        reload={reload}
      />
      {alsoActive.length ? (
        <div className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          ℹ️ Danach bist du auch an <b>{alsoActive.map((x) => x.machine?.name ?? "?").join(", ")}</b> dran.
        </div>
      ) : null}
      <PhoneMatchInsights code={code} data={data} info={current} meId={me.playerId} />
    </div>
  );
}

function nameOf(data: MmData, pid: string): string {
  return String(data.players.find((p) => String(p.id) === String(pid))?.name ?? "?");
}

function MatchHead({ info, title }: { info: MyMatchInfo; title?: string }) {
  return (
    <div className="rounded-t-2xl border-b bg-[#f8ecdc] px-4 py-3">
      {title ? <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</div> : null}
      <div className="flex items-center gap-2 text-lg font-black">
        <span>{info.machine?.icon_emoji || "🎰"}</span>
        <span className="truncate">{info.machine?.name ?? "Flipper noch offen"}</span>
      </div>
      <div className="text-xs text-neutral-600">Runde {info.round?.number ?? "?"}</div>
    </div>
  );
}

/** nur anzeigen (letztes Match) */
function MatchCard({ info, data, meId, title }: { info: MyMatchInfo; data: MmData; meId: string; title?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <MatchHead info={info} title={title} />
      <div className="divide-y">
        {info.players.map((mp, i) => {
          const s = toScore(mp.score);
          const isMe = String(mp.player_id) === String(meId);
          return (
            <div key={mp.player_id} className={"flex items-center gap-3 px-4 py-2.5 " + (isMe ? "bg-indigo-50" : "")}>
              <span className="w-5 text-xs text-neutral-400">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {nameOf(data, mp.player_id)}
                {isMe ? <span className="ml-1 text-xs font-normal text-indigo-600">(du)</span> : null}
              </span>
              {s != null ? <span className="tabular-nums text-sm text-neutral-600">{fmt.format(s)}</span> : null}
              {mp.position ? <PosBadge pos={Number(mp.position)} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PosBadge({ pos }: { pos: number }) {
  const cls =
    pos === 1
      ? "bg-amber-400 text-amber-950"
      : pos === 2
      ? "bg-neutral-300 text-neutral-800"
      : pos === 3
      ? "bg-orange-300 text-orange-950"
      : "bg-neutral-100 text-neutral-600";
  return <span className={"rounded-full px-2 py-0.5 text-xs font-black tabular-nums " + cls}>{pos}.</span>;
}

function EntryCard({
  code,
  token,
  me,
  data,
  info,
  mode,
  reload,
}: {
  code: string;
  token: string;
  me: Me;
  data: MmData;
  info: MyMatchInfo;
  mode: ReturnType<typeof entryMode>;
  reload: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const seenRef = useRef<Record<string, Seen>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  // Sperrzeit nach dem Speichern (mit Fortschrittsbalken im Knopf)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (cooldownUntil == null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownUntil) setCooldownUntil(null);
    }, 200);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);
  const cooling = cooldownUntil != null && now < cooldownUntil;
  const coolLeftMs = cooling ? cooldownUntil - now : 0;
  const coolPct = cooling ? Math.min(100, Math.max(0, 100 - (coolLeftMs / SAVE_COOLDOWN_MS) * 100)) : 100;

  const n = info.players.length;
  const canEditRow = (pid: string) =>
    mode === "full" || mode === "score" || (mode === "own" && String(pid) === String(me.playerId));
  const canPositions = mode === "full";

  const savedOf = (pid: string): Seen => {
    const mp = info.players.find((x) => String(x.player_id) === String(pid));
    return { score: toScore(mp?.score), position: mp?.position != null && Number(mp.position) > 0 ? Number(mp.position) : null };
  };

  /** aktuell gewählter Platz (Entwurf, sonst gespeichert) */
  const posOf = (pid: string): number | null => {
    const d = drafts[pid];
    return d?.position !== undefined ? d.position ?? null : savedOf(pid).position;
  };

  /**
   * Automatische Plätze: alle Score-Felder gefüllt (eingetippt oder gespeichert), noch KEIN Platz
   * gespeichert oder angetippt, kein Gleichstand → Plätze nach Score vormarkieren.
   */
  const autoPos: Record<string, number> | null = (() => {
    if (!canPositions) return null;
    const touched = info.players.some((x) => {
      const pid = String(x.player_id);
      return drafts[pid]?.position !== undefined || savedOf(pid).position != null;
    });
    if (touched) return null;
    const rows = info.players.map((x) => {
      const pid = String(x.player_id);
      const d = drafts[pid];
      const sc = d?.score !== undefined ? (d.score === "" ? null : Number(d.score)) : savedOf(pid).score;
      return { player_id: pid, score: sc };
    });
    const r = positionsFromScores(rows, false);
    return r && r !== "tie" ? r : null;
  })();

  /** Entwürfe inkl. automatisch vormarkierter Plätze (die werden mitgespeichert) */
  const effDrafts: Record<string, Draft> = autoPos
    ? Object.fromEntries(
        info.players.map((x) => {
          const pid = String(x.player_id);
          return [pid, { ...drafts[pid], position: autoPos[pid] ?? null }];
        })
      )
    : drafts;

  /** Platz antippen; bei 2 Spielern bekommt der andere automatisch den übrigen Platz */
  function pickPosition(pid: string, p: number) {
    // waren die Plätze nur automatisch vormarkiert → erst übernehmen, dann ändern
    if (autoPos) for (const [q, v] of Object.entries(autoPos)) edit(q, { position: v });
    const current = posOf(pid) ?? autoPos?.[pid] ?? null;
    const next = current === p ? null : p;
    edit(pid, { position: next });
    if (n === 2 && next != null) {
      const other = info.players.find((x) => String(x.player_id) !== String(pid));
      if (other) edit(String(other.player_id), { position: next === 1 ? 2 : 1 });
    }
  }

  function edit(pid: string, patch: Draft) {
    if (!seenRef.current[pid]) seenRef.current[pid] = savedOf(pid); // Stand beim Losschreiben merken
    setDrafts((prev) => ({ ...prev, [pid]: { ...prev[pid], ...patch } }));
    setMsg(null);
    setConflicts(null);
  }

  const changed = Object.entries(effDrafts).filter(([pid, d]) => {
    const saved = savedOf(pid);
    const scoreChanged = d.score !== undefined && (d.score === "" ? null : Number(d.score)) !== saved.score;
    const posChanged = d.position !== undefined && d.position !== saved.position;
    return scoreChanged || posChanged;
  });

  /** Gleichstand: zwei Spieler mit demselben Score (eingetippt oder gespeichert) → nicht speichern */
  const tieNames: string[] = (() => {
    if (mode !== "full" && mode !== "score") return [];
    const byScore = new Map<number, string[]>();
    for (const x of info.players) {
      const pid = String(x.player_id);
      const d = drafts[pid];
      const sc = d?.score !== undefined ? (d.score === "" ? null : Number(d.score)) : savedOf(pid).score;
      if (sc == null) continue;
      byScore.set(sc, [...(byScore.get(sc) ?? []), nameOf(data, pid)]);
    }
    return Array.from(byScore.values()).filter((l) => l.length > 1).flat();
  })();
  const blockedByTie = tieNames.length > 0;

  /** Platz passt nicht zum Score: mehr Punkte, aber schlechterer Platz → nicht speichern */
  const mismatch: { better: string; worse: string } | null = (() => {
    if (!canPositions) return null;
    const rows = info.players
      .map((x) => {
        const pid = String(x.player_id);
        const d = drafts[pid];
        const sc = d?.score !== undefined ? (d.score === "" ? null : Number(d.score)) : savedOf(pid).score;
        const pos = posOf(pid) ?? autoPos?.[pid] ?? null;
        return { name: nameOf(data, pid), sc, pos };
      })
      .filter((r): r is { name: string; sc: number; pos: number } => r.sc != null && r.pos != null);
    for (const a of rows)
      for (const b of rows) if (a.sc > b.sc && a.pos > b.pos) return { better: a.name, worse: b.name };
    return null;
  })();

  async function save(force = false) {
    if (!changed.length || saving || cooling || blockedByTie || mismatch) return;
    const entries = changed.map(([pid, d]) => {
      const saved = savedOf(pid);
      const e: { player_id: string; score?: number | null; position?: number | null } = { player_id: pid };
      if (d.score !== undefined && (d.score === "" ? null : Number(d.score)) !== saved.score)
        e.score = d.score === "" ? null : Number(d.score);
      if (d.position !== undefined && d.position !== saved.position) e.position = d.position;
      return e;
    });
    const expected: Record<string, Seen> = {};
    for (const e of entries) expected[e.player_id] = seenRef.current[e.player_id] ?? savedOf(e.player_id);

    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/public/me/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, t: token, match_id: info.match.id, entries, expected, force }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409 && Array.isArray(j?.conflicts)) {
        setConflicts(j.conflicts as Conflict[]);
        return;
      }
      if (!res.ok || !j?.ok) {
        setMsg({ kind: "err", text: String(j?.error ?? "Speichern fehlgeschlagen") });
        return;
      }
      setDrafts({});
      seenRef.current = {};
      setConflicts(null);
      const t0 = Date.now();
      setNow(t0);
      setCooldownUntil(t0 + SAVE_COOLDOWN_MS);
      if (j.auto === "tie") {
        setMsg({
          kind: "warn",
          text: canPositions
            ? "Gespeichert ✅ – Gleichstand! Bitte die Plätze unten antippen."
            : "Gespeichert ✅ – Gleichstand! Der Admin vergibt die Plätze.",
        });
      } else {
        setMsg({ kind: "ok", text: "Gespeichert ✅" });
      }
      await reload();
    } catch {
      setMsg({ kind: "err", text: "Keine Verbindung – bitte nochmal speichern" });
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setDrafts({});
    seenRef.current = {};
    setConflicts(null);
    setMsg(null);
    reload();
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <MatchHead info={info} />
        <div className="divide-y">
          {info.players.map((mp, i) => {
            const pid = String(mp.player_id);
            const isMe = pid === String(me.playerId);
            const saved = savedOf(pid);
            const d = drafts[pid] ?? {};
            const digits = d.score !== undefined ? d.score : saved.score != null ? String(saved.score) : "";
            const pos = d.position !== undefined ? d.position : saved.position ?? autoPos?.[pid] ?? null;
            const editable = canEditRow(pid);
            return (
              <div key={pid} className={"px-4 py-3 " + (isMe ? "bg-indigo-50" : "")}>
                <div className="flex items-center gap-2">
                  <span className="w-5 text-xs text-neutral-400">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-base font-bold">
                    {nameOf(data, pid)}
                    {isMe ? <span className="ml-1 text-xs font-normal text-indigo-600">(du)</span> : null}
                  </span>
                  {!editable && saved.score != null ? (
                    <span className="tabular-nums text-sm text-neutral-600">{fmt.format(saved.score)}</span>
                  ) : null}
                  {!canPositions && saved.position ? <PosBadge pos={saved.position} /> : null}
                </div>

                {editable ? (
                  <div className="mt-2 pl-7">
                    <ScoreInput
                      digits={digits}
                      onDigitsChange={(v) => edit(pid, { score: v })}
                      placeholder="Score"
                      className="bg-white text-lg font-semibold"
                    />
                  </div>
                ) : null}

                {canPositions ? (
                  <div className="mt-2 flex items-center gap-1.5 pl-7">
                    <span className="mr-1 text-xs text-neutral-500">Platz</span>
                    {Array.from({ length: n }, (_, k) => k + 1).map((p) => {
                      // schon an einen anderen Spieler vergeben → blass anzeigen (antippen geht trotzdem, z. B. Gleichstand)
                      const taken =
                        pos !== p &&
                        info.players.some(
                          (x) =>
                            String(x.player_id) !== pid &&
                            (posOf(String(x.player_id)) ?? autoPos?.[String(x.player_id)] ?? null) === p
                        );
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => pickPosition(pid, p)}
                          title={taken ? "schon vergeben" : undefined}
                          className={
                            "h-9 w-9 rounded-full text-sm font-black tabular-nums transition " +
                            (pos === p
                              ? p === 1
                                ? "bg-amber-400 text-amber-950 shadow"
                                : "bg-neutral-800 text-white shadow"
                              : taken
                              ? "border border-dashed border-neutral-300 bg-transparent text-neutral-300 line-through"
                              : "bg-neutral-100 text-neutral-600")
                          }
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {mode === "none" ? (
        <div className="rounded-xl bg-neutral-200/70 px-3 py-2 text-sm text-neutral-600">
          In diesem Modus trägt (noch) der Admin die Ergebnisse ein.
        </div>
      ) : (
        <div className="rounded-xl bg-white/70 px-3 py-2 text-xs text-neutral-500">
          {mode === "own"
            ? "💡 Trag nach deinem Spiel deinen Score ein."
            : mode === "score"
            ? "💡 Tipp: Der Gewinner trägt die Scores aller Spieler ein. Die Plätze kommen automatisch."
            : "💡 Tipp: Der Gewinner trägt das Ergebnis ein – Scores und/oder Plätze. Sind alle Scores da, kommen die Plätze automatisch."}
        </div>
      )}

      {conflicts ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <div className="font-bold text-amber-900">⚠️ Inzwischen wurde schon eingetragen:</div>
          <ul className="mt-1 list-inside list-disc text-amber-900">
            {conflicts.map((c) => (
              <li key={c.player_id + c.field}>
                {nameOf(data, c.player_id)}: {c.field === "score" ? "Score" : "Platz"}{" "}
                <b>{c.current == null ? "leer" : c.field === "score" ? fmt.format(c.current) : `${c.current}.`}</b>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={discard} className="rounded-xl bg-white px-3 py-2 font-semibold shadow-sm">
              Behalten
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              className="rounded-xl bg-amber-500 px-3 py-2 font-bold text-white shadow-sm"
            >
              Überschreiben
            </button>
          </div>
        </div>
      ) : null}

      {blockedByTie ? (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          ⚠️ Gleicher Score bei {tieNames.join(" und ")} – bitte die Scores prüfen. Speichern geht erst danach.
        </div>
      ) : null}

      {mismatch ? (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          ⚠️ Passt nicht zusammen: {mismatch.better} hat mehr Punkte als {mismatch.worse}, aber einen schlechteren
          Platz. Bitte Scores oder Plätze korrigieren.
        </div>
      ) : null}

      {msg ? (
        <div
          className={
            "rounded-xl px-3 py-2 text-sm font-semibold " +
            (msg.kind === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : msg.kind === "warn"
              ? "bg-amber-50 text-amber-800"
              : "bg-red-50 text-red-700")
          }
        >
          {msg.text}
        </div>
      ) : null}

      {mode !== "none" ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] z-20 flex gap-2">
          {changed.length ? (
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="rounded-2xl bg-white px-4 py-3 font-semibold text-neutral-600 shadow"
            >
              ✕
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => save(false)}
            disabled={!changed.length || saving || !!conflicts || cooling || blockedByTie || !!mismatch}
            className={
              "relative flex-1 overflow-hidden rounded-2xl px-4 py-3 text-lg font-black shadow transition " +
              (changed.length && !conflicts && !cooling && !blockedByTie && !mismatch
                ? "bg-emerald-600 text-white"
                : "bg-neutral-300 text-neutral-500")
            }
          >
            {cooling ? (
              <span
                className="absolute inset-y-0 left-0 bg-emerald-500/35 transition-[width] duration-200 ease-linear"
                style={{ width: `${coolPct}%` }}
                aria-hidden="true"
              />
            ) : null}
            <span className="relative">
              {saving
                ? "Speichere …"
                : cooling
                ? `✅ Gespeichert – wieder in ${Math.ceil(coolLeftMs / 1000)} s`
                : "💾 Speichern"}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────── Reiter "Leaderboard" ─────────────────────────

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const MEDAL: Record<number, { badge: string; row: string; bar: string }> = {
  1: { badge: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow", row: "from-amber-50", bar: "bg-amber-400" },
  2: { badge: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow", row: "from-slate-50", bar: "bg-slate-300" },
  3: { badge: "bg-gradient-to-br from-orange-200 to-orange-400 text-orange-950 shadow", row: "from-orange-50", bar: "bg-orange-300" },
};

function Avatar({ name, icon, color }: { name: string; icon: string | null; color: string | null }) {
  return (
    <span
      className={
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ring-2 ring-white " +
        (color ? "" : "bg-neutral-200")
      }
      style={color ? { backgroundColor: color } : undefined}
    >
      {icon ? icon : <span className="text-[11px] font-bold text-neutral-600">{initials(name)}</span>}
    </span>
  );
}

function EloText({ start, now, eloOn }: { start: number | null; now: number | null; eloOn: boolean }) {
  const s = start != null ? Math.round(start) : null;
  const n = now != null ? Math.round(now) : null;
  const base = s ?? n;
  if (base == null) return null;
  const delta = eloOn && s != null && n != null ? n - s : 0;
  return (
    <div className="text-[11px] font-medium tabular-nums text-neutral-400">
      Elo {base}
      {delta !== 0 ? (
        <>
          <span className="mx-1 text-neutral-300">→</span>
          <span className="text-neutral-600">{n}</span>
          <span className={"ml-1 font-bold " + (delta > 0 ? "text-emerald-600" : "text-rose-500")}>
            ({delta > 0 ? "+" : ""}
            {delta})
          </span>
        </>
      ) : null}
    </div>
  );
}

// ───────────────────────── Reiter "Turnier-Infos" ─────────────────────────
// Neue Abschnitte einfach unten als weitere <InfoSection> anhängen.

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-sm font-black uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function InfoTab({ code, data, meId }: { code: string; data: MmData; meId: string }) {
  const order = useMemo(() => liveLeaderboard(data).rows.map((r) => r.id), [data]);
  return (
    <div>
      <InfoSection title="🏆 Leaderboard">
        <BoardTab data={data} meId={meId} />
      </InfoSection>
      <InfoSection title="🃏 Spielerkarten">
        <PlayerCardsSwipe code={code} meId={meId} order={order} />
      </InfoSection>
      <InfoSection title="ℹ️ Turnier-Info">
        <PhoneTournamentInfo data={data} />
      </InfoSection>
    </div>
  );
}

function BoardTab({ data, meId }: { data: MmData; meId: string }) {
  const { rows, roundPointsMax, eloOn } = useMemo(() => liveLeaderboard(data), [data]);
  const sMode = streakMode(data.tournament?.format);
  const finished = String(data.tournament?.status ?? "") === "finished";
  const streaks = useMemo(
    () => (finished ? {} : computeStreaks(data, sMode)),
    [data, sMode, finished]
  );
  const isRotation = String(data.tournament?.format ?? "").toLowerCase() === "rotation";

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
        <span>Leaderboard</span>
        <span>Pkt</span>
      </div>
      <div>
        {rows.map((r) => {
          const isMe = r.id === String(meId);
          const medal = r.total > 0 ? MEDAL[r.place] : undefined;
          return (
            <div
              key={r.id}
              className={
                "relative flex items-center gap-2.5 border-t border-neutral-100 px-3 py-2 " +
                (medal ? `bg-gradient-to-r ${medal.row} to-transparent` : "")
              }
            >
              {medal ? <span className={"absolute inset-y-1 left-0 w-1 rounded-r " + medal.bar} /> : null}
              <span
                className={
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums " +
                  (medal ? medal.badge : "bg-neutral-100 text-neutral-500")
                }
              >
                {r.place}
              </span>
              <Avatar name={r.name} icon={r.icon} color={r.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={"truncate leading-tight " + (isMe ? "font-black" : "font-bold")}>{r.name}</span>
                  {isMe ? (
                    <span className="shrink-0 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                      du
                    </span>
                  ) : null}
                  <StreakFire n={streaks[r.id]} mode={sMode} />
                </div>
                <EloText start={r.eloStart} now={r.eloNow} eloOn={eloOn} />
              </div>
              <div className="shrink-0" title="Punkte pro Runde">
                <RoundPointsBars items={r.history} scaleMax={roundPointsMax} width={64} height={22} />
              </div>
              <span className="w-9 shrink-0 text-right">
                <span className="text-xl font-black tabular-nums">{r.total}</span>
                {isRotation && r.extra > 0 ? (
                  <span className="block text-[9px] leading-none text-neutral-400">{r.extra} vorl.</span>
                ) : null}
              </span>
            </div>
          );
        })}
        {rows.length === 0 ? <div className="px-4 py-6 text-center text-neutral-500">Noch keine Spieler.</div> : null}
      </div>
    </div>
  );
}
