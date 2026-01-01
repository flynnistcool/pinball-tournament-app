"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Button, Card, CardBody, CardHeader, Input, Pill, Select } from "@/components/ui";
import { BarChart, Sparkline } from "@/components/charts";
import QRCode from "qrcode";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import LocationsTab from "./LocationsTab";
import PlayersTab from "./PlayersTab";

type Tournament = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  category?: string;
  season_year?: number | null;
  match_size?: number | null;
  best_of?: number | null;
  status?: string | null;
  location_id?: string | null;
};

type Profile = { id: string; name: string; avatar_url: string | null; rating?: number | null };

type Match = {
  id: string;
  round_id: string;
  machine_id: string | null;
  status?: string | null;
  series_id?: string | null;
  game_number?: number | null;
};

type MP = {
  match_id: string;
  player_id: string;
  position: number | null;
  start_position?: number | null;
};

type Location = { id: string; name: string };

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="h-10 w-10 overflow-hidden rounded-xl border bg-neutral-100 flex items-center justify-center">
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : <span className="text-sm font-semibold text-neutral-600">{initials || "?"}</span>}
    </div>
  );
}

function AvatarUploader({ profileId, onDone, disabled }: { profileId: string; onDone: () => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function onPick(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.set("profileId", profileId);
    fd.set("file", file);
    const res = await fetch("/api/avatars/upload", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) onDone();
    else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Upload fehlgeschlagen (Bucket 'avatars' public?)");
    }
  }

  const isDisabled = disabled || busy;

  return (
    <label
      className={
        "inline-flex items-center justify-center rounded-xl px-3 py-3 text-sm font-medium border bg-white hover:bg-neutral-50 " +
        (isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer")
      }
    >
      {busy ? "…" : "Foto"}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={isDisabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function ShareModal({ open, onClose, code }: { open: boolean; onClose: () => void; code: string }) {
  const [tQr, setTQr] = useState<string>("");
  const [pQr, setPQr] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const origin = window.location.origin;
    const tUrl = `${origin}/t/${encodeURIComponent(code)}`;
    const pUrl = `${origin}/public`;
    (async () => {
      try {
        setTQr(await QRCode.toDataURL(tUrl, { margin: 1, width: 320 }));
        setPQr(await QRCode.toDataURL(pUrl, { margin: 1, width: 320 }));
      } catch {
        setTQr("");
        setPQr("");
      }
    })();
  }, [open, code]);

  if (!open) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const tUrl = `${origin}/t/${encodeURIComponent(code)}`;
  const pUrl = `${origin}/public`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-3xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="text-lg font-semibold">Teilen (QR-Code)</div>
          <button className="rounded-xl bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200" onClick={onClose}>
            Schließen
          </button>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-semibold">Dieses Turnier (Admin)</div>
            <div className="mt-2 text-xs text-neutral-500 break-all">{tUrl}</div>
            <div className="mt-3 flex justify-center">
              {tQr ? <img src={tQr} alt="QR Turnier" className="h-56 w-56" /> : <div className="text-sm text-neutral-500">QR wird erstellt…</div>}
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-semibold">Gesamtübersicht /public (read-only)</div>
            <div className="mt-2 text-xs text-neutral-500 break-all">{pUrl}</div>
            <div className="mt-3 flex justify-center">
              {pQr ? <img src={pQr} alt="QR Public" className="h-56 w-56" /> : <div className="text-sm text-neutral-500">QR wird erstellt…</div>}
            </div>
          </div>
        </div>
        <div className="border-t px-6 py-4 text-sm text-neutral-600">Tipp: Auf iPhone/iPad Kamera öffnen → QR scannen → Link teilen.</div>
      </div>
    </div>
  );
}

function PlayersList({ players, profAvatar, profRating, onReload, onToggle, busy, locked }: any) {
  const active = (players ?? []).filter((p: any) => p.active);
  const inactive = (players ?? []).filter((p: any) => !p.active);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>Spieler</div>
          <div className="text-sm text-neutral-500">
            {active.length} aktiv • {inactive.length} inaktiv • {players.length} gesamt
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-2">
          {players.map((p: any) => {
            const url = p.profile_id ? (profAvatar[p.profile_id] ?? null) : null;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar url={url} name={p.name} />
                  <div className="text-base">{p.name}</div>
                  {p.profile_id && profRating?.[p.profile_id] != null ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-sm">
                      Elo{" "}
                      <span className="ml-2 font-semibold tabular-nums">
                        {Math.round(profRating[p.profile_id])}
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {p.profile_id ? (
                    <AvatarUploader
                      profileId={p.profile_id}
                      onDone={onReload}
                      disabled={busy || locked}
                    />
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || locked}
                    onClick={() => onToggle(p.id)}
                    className={
                      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium transition " +
                      (p.active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-neutral-100 text-neutral-600")
                    }
                  >
                    <span
                      className={
                        "h-2 w-2 rounded-full " +
                        (p.active ? "bg-emerald-500" : "bg-neutral-400")
                      }
                    />
                    {p.active ? "aktiv" : "inaktiv"}
                  </button>
                </div>
              </div>
            );
          })}
          {players.length === 0 && (
            <div className="text-sm text-neutral-500">Noch keine Spieler.</div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}


function MachinesList({
  machines,
  onToggle,
  busy,
  locked,
}: {
  machines: any[];
  onToggle: (id: string) => void;
  busy: boolean;
  locked: boolean;
}) {
  const active = (machines ?? []).filter((m) => m.active);
  const inactive = (machines ?? []).filter((m) => !m.active);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>Maschinen</div>
          <div className="text-sm text-neutral-500">
            {active.length} aktiv • {inactive.length} inaktiv • {machines.length} gesamt
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-2">
          {(machines ?? []).map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3"
            >
              <div className="text-base font-medium">{m.name}</div>

              <button
                type="button"
                disabled={busy || locked}
                onClick={() => onToggle(m.id)}
                className={
                  "inline-flex items-center rounded-full px-3 py-1 text-sm border transition " +
                  (m.active
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-neutral-100 text-neutral-600 border-neutral-200")
                }
              >
                <span
                  className={
                    "mr-2 h-2 w-2 rounded-full " +
                    (m.active ? "bg-emerald-500" : "bg-neutral-400")
                  }
                />
                {m.active ? "aktiv" : "inaktiv"}
              </button>
            </div>
          ))}

          {(!machines || machines.length === 0) && (
            <div className="text-sm text-neutral-500">Noch keine Maschinen.</div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function Stats({ code, tournamentName }: { code: string; tournamentName: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json();
    setRows(j.stats ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const topWins = rows
    .slice()
    .sort((a: any, b: any) => b.wins - a.wins)
    .slice(0, 8)
    .map((r: any) => ({ label: r.name, value: r.wins }));

  const topPoints = rows
    .slice()
    .sort((a: any, b: any) => b.points - a.points)
    .slice(0, 8)
    .map((r: any) => ({ label: r.name, value: r.points }));

  const topWinrate = rows
    .slice()
    .filter((r: any) => r.matches >= 3)
    .sort((a: any, b: any) => b.winrate - a.winrate)
    .slice(0, 8)
    .map((r: any) => ({ label: r.name, value: Math.round(r.winrate) }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <BarChart title="Siege" items={topWins} valueLabel="Siege" />
        <BarChart title="Punkte" items={topPoints} valueLabel="Punkte" />
        <BarChart title="Winrate (≥3 Matches)" items={topWinrate} valueLabel="%" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Leaderboard – {tournamentName || "Turnier"}</div>
            <div className="flex gap-2">
              <a
                className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                href={`/api/export/standings.csv?code=${encodeURIComponent(code)}`}
              >
                Tabelle CSV
              </a>
              <a
                className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                href={`/api/export/stats.csv?code=${encodeURIComponent(code)}`}
              >
                Stats CSV
              </a>
              <button
                className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                onClick={() => window.print()}
              >
                Drucken/PDF
              </button>
            </div>
          </div>
        </CardHeader>

        <CardBody>
          <div className="overflow-hidden rounded-2xl border bg-white">
            {/* Header mit Medaillen-Spalte */}
            <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              <div className="col-span-1 text-center"> </div> {/* Medaille */}
              <div className="col-span-1 text-right pr-2">Platz</div>
              <div className="col-span-3">Spieler</div>
              <div className="col-span-2 text-right">Punkte</div>
              <div className="col-span-2 text-right">Matches</div>
              <div className="col-span-2 text-right">Winrate</div>
              <div className="col-span-1 text-right">Verlauf</div>
            </div>

            {rows.map((r: any, index: number) => {
              const hist = (r.history ?? []).map((x: any) => x.points);
              const place = index + 1;
              const medal =
                place === 1 ? "🥇" :
                place === 2 ? "🥈" :
                place === 3 ? "🥉" :
                "";
              const medalClass =
                place === 1
                  ? "text-xl leaderboard-glow"
                  : "text-xl";

              return (
                <div key={r.id} className="border-b last:border-b-0">
                  <button
                    className={`w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left hover:bg-neutral-50 ${
                      place === 1 ? "leaderboard-first" : ""
                    }`}
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
                    {/* Medaille vor Platz */}
                    <div className={`col-span-1 text-center ${medalClass}`}>
                      {medal}
                    </div>

                    <div className="col-span-1 text-right pr-2 font-semibold tabular-nums">
                      {place}.
                    </div>

                    <div className="col-span-3 flex items-center gap-3">
                      <div className="h-9 w-9 overflow-hidden rounded-lg border bg-neutral-100">
                        {r.avatarUrl ? (
                          <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="font-medium flex items-center gap-2">
                        {r.name}
                        {place === 1 && (
                          <span className="winner-ribbon">
                            Champion
                          </span>
                        )}
                        {r.elo != null ? (
                          <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
                            Elo{" "}
                            <span className="ml-1 font-semibold tabular-nums">
                              {Math.round(r.elo)}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="col-span-2 text-right font-semibold tabular-nums">
                      {r.points}
                    </div>
                    <div className="col-span-2 text-right tabular-nums">
                      {r.matches}
                    </div>
                    <div className="col-span-2 text-right tabular-nums">
                      {r.winrate}%
                    </div>
                    <div className="col-span-1 flex justify-end text-neutral-900">
                      <Sparkline values={hist} />
                    </div>
                  </button>

                  {openId === r.id && (
                    <div className="px-4 pb-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border bg-white p-4">
                          <div className="text-xs text-neutral-500">
                            Ø-Platzierung
                          </div>
                          <div className="text-2xl font-semibold">
                            {r.avgPos ?? "—"}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            Podium-Rate: {r.podiumRate}%
                          </div>
                        </div>
                        <div className="rounded-2xl border bg-white p-4">
                          <div className="text-xs text-neutral-500">
                            Lieblings-Maschine
                          </div>
                          <div className="text-base font-semibold">
                            {r.favoriteMachine?.machine ?? "—"}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {r.favoriteMachine
                              ? `${r.favoriteMachine.plays}x gespielt`
                              : ""}
                          </div>
                        </div>
                        <div className="rounded-2xl border bg-white p-4">
                          <div className="text-xs text-neutral-500">
                            Beste Maschine
                          </div>
                          <div className="text-base font-semibold">
                            {r.bestMachine?.machine ?? "—"}
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {r.bestMachine
                              ? `Ø ${r.bestMachine.avgPoints} Punkte (${r.bestMachine.plays}x)`
                              : ""}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border bg-white p-4">
                        <div className="mb-2 text-sm font-semibold">
                          Punkte pro Runde
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(r.history ?? []).map((h: any) => (
                            <span
                              key={h.round}
                              className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-sm"
                            >
                              R{h.round}:{" "}
                              <span className="ml-2 font-semibold tabular-nums">
                                {h.points}
                              </span>
                            </span>
                          ))}
                          {(r.history ?? []).length === 0 && (
                            <span className="text-sm text-neutral-500">
                              Noch keine Ergebnisse.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className="px-4 py-4 text-sm text-neutral-500">
                Noch keine Ergebnisse.
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function MiniLeaderboard({ code }: { code: string }) {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const j = await res.json();
        if (!cancelled) {
          setRows(j.stats ?? []);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
        }
      }
    }

    load();
    const t = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [code]);

  const top = rows.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <div className="text-sm font-semibold">Leaderboard (live)</div>
      </CardHeader>
      <CardBody>
        {top.length === 0 ? (
          <div className="text-sm text-neutral-500">
            Noch keine Ergebnisse.
          </div>
        ) : (
          <div className="space-y-1">
            {top.map((r: any, index: number) => (
              <div
                key={r.id ?? r.player_id ?? index}
                className="flex items-center gap-2 text-sm"
              >
                <div className="w-6 text-right tabular-nums text-neutral-500">
                  {index + 1}.
                </div>
                <div className="flex-1 truncate font-medium">
                  {r.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RoundMatchesCard({
  code,
  rounds,
  matches,
  matchPlayers,
  machinesById,
  playersById,
  onSaved,
  locked,
}: {
  code: string;
  rounds: any[];
  matches: Match[];
  matchPlayers: MP[];
  machinesById: Record<string, string>;
  playersById: Record<string, string>;
  onSaved: () => void;
  locked: boolean;
}) {

  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const lastRoundCountRef = useRef<number>(0);

  // Wenn eine neue Runde hinzu kommt, diese automatisch öffnen
  useEffect(() => {
    const count = rounds?.length ?? 0;
    if (!rounds || count === 0) {
      lastRoundCountRef.current = 0;
      return;
    }

    // nur reagieren, wenn die Anzahl der Runden gewachsen ist
    if (count > lastRoundCountRef.current) {
      const sorted = rounds.slice().sort(
        (a: any, b: any) => (a.number ?? 0) - (b.number ?? 0)
      );
      const newest = sorted[sorted.length - 1];
      if (newest?.id) {
        setOpenRoundId(newest.id);
      }
    }

    lastRoundCountRef.current = count;
  }, [rounds]);


  const [posOverride, setPosOverride] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const matchesByRound = useMemo(() => {
    const out: Record<string, Match[]> = {};
    for (const m of matches) {
      out[m.round_id] = out[m.round_id] || [];
      out[m.round_id].push(m);
    }
    for (const rid of Object.keys(out)) {
      out[rid] = out[rid].slice().sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0));
    }
    return out;
  }, [matches]);

  const mpByMatch = useMemo(() => {
    const out: Record<string, MP[]> = {};
    for (const mp of matchPlayers) {
      out[mp.match_id] = out[mp.match_id] || [];
      out[mp.match_id].push(mp);
    }
    return out;
  }, [matchPlayers]);

  function k(matchId: string, playerId: string) {
    return `${matchId}:${playerId}`;
  }
  function getPos(mp: MP) {
    const key = k(mp.match_id, mp.player_id);
    return Object.prototype.hasOwnProperty.call(posOverride, key) ? posOverride[key] : mp.position;
  }

  async function setPosition(matchId: string, playerId: string, position: number | null) {
    if (locked) return;

    const key = k(matchId, playerId);
    setPosOverride((prev) => ({ ...prev, [key]: position }));
    setSaving((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await fetch("/api/match_players/set-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, match_id: matchId, player_id: playerId, position }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPosOverride((prev) => {
          const cp = { ...prev };
          delete cp[key];
          return cp;
        });
        alert(j.error ?? "Speichern fehlgeschlagen");
      } else {
        onSaved();
      }
    } catch {
      setPosOverride((prev) => {
        const cp = { ...prev };
        delete cp[key];
        return cp;
      });
      alert("Speichern fehlgeschlagen (Netzwerk)");
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Runden & Matches</div>
          <div className="text-sm text-neutral-500">
            Zum Öffnen auf eine Runde klicken{locked ? " • Turnier beendet (read-only)" : ""}
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="overflow-hidden rounded-2xl border bg-white">
          <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
            <div className="col-span-2">#</div>
            <div className="col-span-4">Format</div>
            <div className="col-span-3">Status</div>
            <div className="col-span-3 text-right">Spiele</div>
          </div>

          {rounds
            .slice()
            .sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0))
            .map((r: any) => {
              const ms = matchesByRound[r.id] ?? [];
              const isOpen = openRoundId === r.id;

              return (
                <div key={r.id} className="border-b last:border-b-0">
                  <button className="w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left hover:bg-neutral-50" onClick={() => setOpenRoundId(isOpen ? null : r.id)}>
                    <div className="col-span-2 font-semibold tabular-nums">#{r.number}</div>
                    <div className="col-span-4">{r.format}</div>
                    <div className="col-span-3">
                      <span
                        className={
                          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset " +
                          (r.status === "finished"
                            ? "bg-green-50 text-green-700 ring-green-200"
                            : r.status === "open"
                            ? "bg-blue-50 text-blue-700 ring-blue-200"
                            : "bg-neutral-100 text-neutral-600 ring-neutral-200")
                        }
                      >
                        {r.status === "open" ? (
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
                          </span>
                        ) : (
                          <span
                            className={
                              "h-2 w-2 rounded-full " +
                              (r.status === "finished" ? "bg-green-500" : "bg-neutral-400")
                            }
                          />
                        )}

                        {r.status === "open" ? "Aktiv" : r.status === "finished" ? "Finished" : r.status ?? "—"}
                      </span>
                    </div>
                    <div className="col-span-3 text-right tabular-nums">{ms.length}</div>
                  </button>

                  {isOpen && (
                    <div className="border-t bg-neutral-100 px-4 py-4">
                      {ms.length === 0 ? (
                        <div className="text-sm text-neutral-500">Noch keine Matches in dieser Runde.</div>
                      ) : (
                        <div className="space-y-3">
                          {ms.map((m) => {
                            const mps = (mpByMatch[m.id] ?? []).slice();
                            mps.sort((a, b) => {
                              const sa = (a.start_position ?? 999) as number;
                              const sb = (b.start_position ?? 999) as number;
                              if (sa !== sb) return sa - sb;
                              const an = playersById[a.player_id] ?? "";
                              const bn = playersById[b.player_id] ?? "";
                              return an.localeCompare(bn);
                            });

                            const n = Math.max(2, mps.length || 4);

                            return (
                              <div key={m.id} className="rounded-2xl border bg-white">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                                  <div className="font-medium">
                                    {m.machine_id ? machinesById[m.machine_id] : "—"}
                                    {m.game_number ? <span className="text-neutral-500"> • Spiel {m.game_number}</span> : null}
                                  </div>
                                  <div className="text-xs text-neutral-500">Match {m.id.slice(0, 8)}…</div>
                                </div>

                                <div className="p-4 space-y-2">
                                  {mps.map((mp) => {
                                    const pos = getPos(mp);
                                    const isWinner = pos === 1;
                                    const isSaving = saving[k(mp.match_id, mp.player_id)] === true;

                                    return (
                                      <div
                                        key={k(mp.match_id, mp.player_id)}
                                        className={
                                          "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 " +
                                          (isWinner ? "bg-amber-200 border-amber-300" : "bg-white")
                                        }
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="font-medium">{playersById[mp.player_id] ?? "—"}</div>
                                          {pos ? <Pill>#{pos}</Pill> : <Pill>—</Pill>}
                                          {isWinner ? <Pill>🏆 Sieger</Pill> : null}
                                          {isSaving ? <span className="text-xs text-neutral-500">speichere…</span> : null}
                                        </div>

                                        <div className="w-44">
                                          <Select
                                            value={pos ?? ""}
                                            disabled={locked}
                                            onChange={(e) => {
                                              if (locked) return;
                                              const v = e.target.value;
                                              setPosition(m.id, mp.player_id, v === "" ? null : Number(v));
                                            }}
                                          >
                                            <option value="">Platz —</option>
                                            {Array.from({ length: n }, (_, i) => i + 1).map((p) => (
                                              <option key={p} value={p}>
                                                Platz {p}
                                              </option>
                                            ))}
                                          </Select>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          {rounds.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">Noch keine Runden.</div>}
        </div>
      </CardBody>
    </Card>
  );
}

export default function AdminHome() {
  const [tab, setTab] = useState<"join" | "create" | "archive" | "locations" | "players">("join");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [matchSize, setMatchSize] = useState<2 | 3 | 4>(4);

  const [tournamentFormat, setTournamentFormat] =
    useState<"matchplay" | "swiss" | "round_robin">("matchplay");

  const [templateTournamentId, setTemplateTournamentId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [joined, setJoined] = useState<Tournament | null>(null);

  


  const [archive, setArchive] = useState<Tournament[]>([]);
  const existingCategories = useMemo(
    () =>
      Array.from(
        new Set(
          (archive ?? [])
            .map((t) => t.category)
            .filter((c): c is string => !!c && c.trim().length > 0)
        )
      ),
    [archive]
  );

  const [locations, setLocations] = useState<Location[]>([]);

  const [openLocationId, setOpenLocationId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("pb_code");
    if (saved) setCode(saved);
    loadArchive();
    loadLocations();
  }, []);

  async function loadArchive() {
    try {
      const res = await fetch("/api/tournaments/list", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setArchive(j.tournaments ?? []);
    } catch {
      setArchive([]);
    }
  }

  async function loadLocations() {
    try {
      const res = await fetch("/api/locations/list", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setLocations(j.locations ?? []);
    } catch {
      setLocations([]);
    }
  }

  async function createTournament() {
    setBusy(true);
    setMsg(null);

    const res = await fetch("/api/tournaments/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category: category.trim() || null,
        matchSize,
        format: tournamentFormat,
        templateTournamentId: templateTournamentId || null,
        locationId: locationId || null,
      }),
    });

    const j = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) return setMsg(j.error ?? "Fehler");

    setJoined(j.tournament);
    localStorage.setItem("pb_code", j.tournament.code);

    loadArchive();
  }

  async function joinTournament(cOverride?: string) {
    setBusy(true);
    setMsg(null);

    const c = (cOverride ?? code).trim().toUpperCase();

    const res = await fetch("/api/tournaments/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c }),
    });

    const j = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) return setMsg(j.error ?? "Fehler");
    setJoined(j.tournament);
    localStorage.setItem("pb_code", c);
  }

  if (joined) return <Dashboard code={joined.code} name={joined.name} />;

  return (
    <div className="grid gap-4 grid-cols-1">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setTab("join")} className={tab === "join" ? "font-semibold" : "text-neutral-500"}>
              Turnier öffnen
            </button>
            <span className="text-neutral-300">|</span>
            <button onClick={() => setTab("create")} className={tab === "create" ? "font-semibold" : "text-neutral-500"}>
              Turnier Neu anlegen
            </button>
            <span className="text-neutral-300">|</span>
            <button onClick={() => setTab("archive")} className={tab === "archive" ? "font-semibold" : "text-neutral-500"}>
              Turnier-Archiv
            </button>
            <span className="text-neutral-300">|</span>
            <button onClick={() => setTab("locations")} className={tab === "locations" ? "font-semibold" : "text-neutral-500"}>
              Locations
            </button>

            <span className="text-neutral-300">|</span>
            <button onClick={() => setTab("players")} className={tab === "players" ? "font-semibold" : "text-neutral-500"}>
              Spieler
            </button>
          </div>
        </CardHeader>

        <CardBody>
          {tab === "join" ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm text-neutral-600">Turnier-Code</div>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="z.B. K3M9QZ" />
              </div>
              <Button disabled={busy} onClick={() => joinTournament()}>
                Öffnen
              </Button>
            </div>
          ) : tab === "create" ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm text-neutral-600">Turniername</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Monats-Cup" />
              </div>

              <div>
                <div className="mb-1 text-sm text-neutral-600">Kategorie / Serie</div>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="z.B. Liga 2025, Monatsserie, Fun-Cup"
                />

                {existingCategories.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-600">
                    <span className="mr-1 text-neutral-500">Vorhandene Kategorien:</span>
                    {existingCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className="rounded-full bg-neutral-100 px-2 py-1 hover:bg-neutral-200"
                        onClick={() => setCategory(cat)}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1 text-sm text-neutral-600">Format</div>
                <Select
                  value={tournamentFormat}
                  onChange={(e) => setTournamentFormat(e.target.value as any)}
                >
                  <option value="matchplay">Matchplay (Standard)</option>
                  <option value="swiss">Swiss</option>
                  <option value="round_robin">Round Robin (Beta)</option>
                </Select>
                <div className="mt-1 text-xs text-neutral-500">
                  Das Format gilt für das gesamte Turnier.
                </div>
              </div>

              <div>
                <div className="mb-1 text-sm text-neutral-600">Spieler pro Maschine</div>
                <Select value={String(matchSize)} onChange={(e) => setMatchSize(Number(e.target.value) as any)}>
                  <option value="2">1 vs 1 (2 Spieler)</option>
                  <option value="3">3 Spieler (1 vs 1 vs 1)</option>
                  <option value="4">4 Spieler (1 vs 1 vs 1 vs 1)</option>
                </Select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm text-neutral-600">Maschinen übernehmen aus Turnier</div>
                  <Select
                    value={templateTournamentId}
                    onChange={(e) => {
                      setTemplateTournamentId(e.target.value);
                      if (e.target.value) setLocationId("");
                    }}
                  >
                    <option value="">— (keine Übernahme)</option>
                    {archive.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </Select>
                  <div className="mt-1 text-xs text-neutral-500">Kopiert Maschinen + Zuordnung aus einem alten Turnier.</div>
                </div>

                <div>
                  <div className="mb-1 text-sm text-neutral-600">Maschinen importieren aus Location</div>
                  <Select
                    value={locationId}
                    onChange={(e) => {
                      setLocationId(e.target.value);
                      if (e.target.value) setTemplateTournamentId("");
                    }}
                  >
                    <option value="">— (kein Location-Import)</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-1 text-xs text-neutral-500">Importiert Maschinen aus der Location-Datenbank.</div>
                </div>
              </div>

              <Button disabled={busy} onClick={createTournament}>
                Turnier erstellen
              </Button>
            </div>
          ) : tab === "archive" ? (
            <div className="space-y-2">
              <div className="text-sm text-neutral-600">Letzte Turniere (klicken zum Öffnen):</div>
              <div className="overflow-hidden rounded-2xl border bg-white">
                <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                  <div className="col-span-6">Name</div>
                  <div className="col-span-3">Kategorie / Serie</div>
                  <div className="col-span-2">Code</div>
                  <div className="col-span-1">Erstellt</div>
                </div>
                {archive.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => joinTournament(t.code)}
                    className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0 items-center
                              cursor-pointer hover:bg-neutral-50 active:bg-neutral-100 transition"
                  >
                    {/* Name */}
                    <div className="col-span-6 font-medium truncate">
                      {t.name}
                    </div>

                    {/* Kategorie */}
                    <div className="col-span-3">
                      {t.category ? (
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                          {t.category}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </div>

                    {/* Code */}
                    <div className="col-span-2 font-mono text-neutral-500">
                      {t.code}
                    </div>

                    {/* Datum */}
                    <div className="col-span-1 text-left text-xs text-neutral-500">
                      {t.created_at
                        ? new Date(t.created_at).toLocaleDateString("de-DE")
                        : "—"}
                    </div>
                  </div>
                ))}

                {archive.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">Noch keine Turniere.</div>}
              </div>
            </div>
          ) : tab === "locations" ? (
            <LocationsTab />
          ) : tab === "players" ? (
            <PlayersTab />
          ) : null}

          {msg && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}

function Dashboard({ code, name }: { code: string; name: string }) {
  const [data, setData] = useState<any>(null);
  const rounds = data?.rounds ?? [];
  const matches: Match[] = data?.matches ?? [];
  const matchPlayers: MP[] = data?.match_players ?? [];

  const tournament = data?.tournament;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [machineName, setMachineName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  // Startreihenfolge in den Matches: "random" oder "standings_asc"
  const [startOrderMode, setStartOrderMode] = useState<"random" | "standings_asc">("random");

  const [finalState, setFinalState] = useState<any | null>(null);

  const superFinalRunning = !!(finalState && finalState.status !== "finished");

  const isFinished = data?.tournament?.status === "finished";
  const locked = isFinished;

async function finishTournament() {
  if (!confirm("Turnier wirklich beenden? Danach ist nichts mehr änderbar.")) return;

  // 🎺 Fanfare SOFORT im Klick-Kontext starten
  try {
    const audio = new Audio("/sounds/winner-fanfare.mp3");
    audio.volume = 0.7;
    // nicht warten – einfach starten
    audio.play().catch(() => {
      // wird evtl. auf manchen Browsern geblockt – kein Ding
    });
  } catch {
    // falls Audio-Konstruktor fehlschlägt, App soll trotzdem weiterlaufen
  }

  // Danach ganz normal das Turnier beenden
  const res = await fetch("/api/tournaments/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j?.error ?? "Fehler beim Beenden");
    return;
  }

  await reloadAll();
  setShowCelebration(true);
}


  async function startSuperFinal() {
    if (locked) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/finals/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNotice(j.error ?? "Super-Finale konnte nicht gestartet werden");
      return;
    }
    await reloadAll();
  }

  async function registerFinalWin(playerId: string) {
    if (locked) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/finals/add-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, winnerPlayerId: playerId }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNotice(j.error ?? "Final-Spiel konnte nicht gespeichert werden");
      return;
    }

    if (j.finished) {
    // 🎉 auch beim Super-Finale das Sieger-Overlay anzeigen
    setShowCelebration(true);
  }
    
    await reloadAll();
  }



  async function deleteTournament() {
    if (!confirm("⚠️ Turnier wirklich ENDGÜLTIG löschen?")) return;
    const res = await fetch("/api/tournaments/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j.error ?? "Löschen fehlgeschlagen");
      return;
    }
    await reloadAll();
    localStorage.removeItem("pb_code");
    location.href = "/t";
  }

  useEffect(() => {
    reload();
    loadProfiles();
    reloadFinal();
  }, [code]);

  async function reload() {
    const res = await fetch("/api/tournaments/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json();
    setData(j.data ?? j);
  }

async function loadProfiles() {
  try {
    const res = await fetch(`/api/profiles/list?ts=${Date.now()}`, {
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    setProfiles(j.profiles ?? []);
  } catch {
    setProfiles([]);
  }
}


  async function reloadFinal() {
    const res = await fetch("/api/finals/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.exists) {
      setFinalState(null);
      return;
    }
    setFinalState(j);
  }

  async function reloadAll() {
    await Promise.all([reload(), loadProfiles(), reloadFinal()]);
  }

  async function addPlayerByName() {
    if (locked) return;
    if (!playerName.trim()) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/players/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name: playerName.trim() }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    setPlayerName("");
    setSelectedProfileId("");
    await reloadAll();
  }

  async function addPlayerFromProfile() {
    if (locked) return;
    if (!selectedProfileId) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/players/addFromProfile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, profileId: selectedProfileId }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    setSelectedProfileId("");
    await reloadAll();
  }

  async function togglePlayer(id: string) {
    if (locked) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/players/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, playerId: id }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    await reloadAll();
  }

  async function toggleMachine(machineId: string) {
    if (locked) return;
    setBusy(true);
    setNotice(null);

    try {
      const res = await fetch("/api/machines/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, machineId }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(j.error ?? "Fehler beim Aktualisieren der Maschine");
        return;
      }

      await reloadAll();
    } catch (e) {
      setNotice("Netzwerkfehler beim Aktualisieren der Maschine");
    } finally {
      setBusy(false);
    }
  }

  async function addMachine() {
    if (locked) return;
    if (!machineName.trim()) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/machines/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name: machineName.trim() }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    setMachineName("");
    await reloadAll();
  }

  const currentRoundNumber = data?.tournament?.current_round ?? null;
  const currentRoundObj = useMemo(() => (rounds ?? []).find((r: any) => r.number === currentRoundNumber) ?? null, [rounds, currentRoundNumber]);

  const currentRoundMatches = useMemo(() => {
    if (!currentRoundObj) return [];
    return (matches ?? []).filter((m: any) => m.round_id === currentRoundObj.id);
  }, [matches, currentRoundObj]);

  const hasOpenPositions = useMemo(() => {
    if (!currentRoundMatches.length) return false;
    const matchIds = new Set(currentRoundMatches.map((m: any) => m.id));
    const mps = (matchPlayers ?? []).filter((x: any) => matchIds.has(x.match_id));
    return mps.some((x: any) => x.position == null);
  }, [currentRoundMatches, matchPlayers]);

    async function createRound() {
    if (locked) return;

    // ❗ Blockiere neue Runden, wenn ein Super-Finale läuft
    if (finalState && finalState.status !== "finished") {
      setNotice("Es läuft ein Super-Finale – neue Runden können nicht mehr gestartet werden.");
      return;
    }
    setBusy(true);
    setNotice(null);

    const res = await fetch("/api/rounds/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        startOrderMode, // 👈 neues Flag
      }),
    });

    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    if (j.warnings?.length) setNotice(j.warnings.join(" "));
    await reloadAll();
  }


  const profAvatar = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.avatar_url ?? null])), [profiles]);
  const profRating = useMemo(() => Object.fromEntries(profiles.map((p: any) => [p.id, typeof p.rating === "number" ? p.rating : null])), [profiles]);

  const cat = data?.tournament?.category ?? "";

  const machinesById = useMemo(() => Object.fromEntries((data?.machines ?? []).map((m: any) => [m.id, m.name])), [data?.machines]);
  const playersById = useMemo(() => Object.fromEntries((data?.players ?? []).map((p: any) => [p.id, p.name])), [data?.players]);

  if (!data) return <div className="p-6 text-sm text-neutral-500">Lade Turnier…</div>;

  const tournamentName = tournament?.name ?? name;

  const formatLabel =
    data?.tournament?.format === "swiss"
      ? "Swiss"
      : data?.tournament?.format === "round_robin"
      ? "Round Robin"
      : "Matchplay";

  const gamesPlayed =
      (finalState?.players ?? []).reduce((sum: number, p: any) => {
        const base = p.startPoints ?? 0;
        const now = p.points ?? base;
        const extra = Math.max(0, now - base);
        return sum + extra;
      }, 0);

  const nextGameNumber = gamesPlayed + 1;

  return (
    <div className="space-y-4">
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} code={code} />

  {showCelebration && (
  <div className="confetti-overlay">
    <div className="confetti-card">
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 celebration-overlay">
          <div className="relative z-10 w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
            {/* 🎉 Konfetti-Ebene jetzt IN der Card */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
              <div className="confetti-container">
                {Array.from({ length: 18 }).map((_, i) => {
                  const count = 18;
                  const offset = 5 + (i * 90) / (count - 1); // 5% bis 95% über die Kartenbreite
                  const delay = (i % 9) * 0.4;               // leicht versetzte Starts

                  return (
                    <span
                      key={i}
                      className="confetti-piece"
                      style={{ left: `${offset}%`, animationDelay: `${delay}s` }}
                    >
                      🎉
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Inhalt: Überschrift + Stats */}
            <div className="flex items-center justify-between gap-4 mb-4 relative z-10">
              <div>
                <div className="text-sm text-neutral-500">Turnier beendet</div>
                <div className="text-2xl font-bold">Glückwunsch! 🏆</div>
              </div>
              <button
                className="rounded-xl bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200"
                onClick={() => setShowCelebration(false)}
              >
                Schließen
              </button>
            </div>

            <div className="relative z-10">
              <Stats code={code} tournamentName={tournamentName} />
            </div>
          </div>
        </div>
    </div>
   </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-neutral-500">Turnier</div>
              <div className="text-lg font-semibold">{name}</div>
              <div className="mt-1 text-sm text-neutral-600">
                {cat && <Pill>{cat}</Pill>}
                <Pill>Spieler/Maschine {data?.tournament?.match_size ?? 4}</Pill>
                {currentRoundNumber ? (
                  <Pill>
                    Aktuelle Runde <span className="ml-2 font-semibold">#{currentRoundNumber}</span>
                  </Pill>
                ) : (
                  <Pill>Runde: —</Pill>
                )}
                {data?.tournament?.locations?.name ? <Pill>📍 {data.tournament.locations.name}</Pill> : null}
                <Pill>
                  Status: <span className="ml-2 font-semibold">{data?.tournament?.status ?? "open"}</span>
                </Pill>
                <Pill>
                  Format: <span className="ml-2 font-semibold">{formatLabel}</span>
                </Pill>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isFinished ? (
                <Button variant="secondary" onClick={finishTournament} disabled={busy}>
                  Turnier beenden
                </Button>
              ) : (
                <Pill>✅ Turnier beendet</Pill>
              )}

              <Pill>
                Code: <span className="ml-2 font-semibold">{code}</span>
              </Pill>

              <Button variant="secondary" onClick={() => setShareOpen(true)}>
                QR teilen
              </Button>

              <a
                className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                href={`/s/${encodeURIComponent(code)}`}
                target="_blank"
              >
                Zusammenfassung
              </a>

              <a
                className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                href={`/t/${encodeURIComponent(code)}`}
                target="_blank"
              >
                Public (/t/[code])
              </a>

              <Button
                variant="secondary"
                onClick={async () => {
                  await supabaseBrowser().auth.signOut();
                  localStorage.clear();
                  location.href = "/login";
                }}
              >
                Abmelden
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  localStorage.removeItem("pb_code");
                  location.reload();
                }}
              >
                Wechseln
              </Button>

              <Button
                variant="secondary"
                onClick={deleteTournament}
                disabled={busy}
                className="bg-red-50 text-red-700 hover:bg-red-100"
              >
                Turnier löschen
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardBody>
          {locked ? (
            <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Dieses Turnier ist beendet. Alles Ändernde ist gesperrt (read-only).
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                <div className="mb-2 text-lg font-semibold flex items-baseline gap-2">
                  <span>Spieler hinzufügen</span>
                  <span className="text-xs text-neutral-500">
                    ({data.players.length} gesamt)
                  </span>
                </div>
                  <div className="flex gap-2">
                    <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Name (Profil wird gemerkt)" disabled={busy || locked} />
                    <Button disabled={busy || locked} onClick={addPlayerByName}>
                      +
                    </Button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Select value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)} disabled={busy || locked}>
                      <option value="">Profil wählen…</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                    <Button variant="secondary" disabled={busy || locked || !selectedProfileId} onClick={addPlayerFromProfile}>
                      Hinzufügen
                    </Button>
                  </div>
                </div>

                <div>
                      <div className="mb-2 text-lg font-semibold flex items-baseline gap-2">
                        <span>Maschine hinzufügen</span>
                        <span className="text-xs text-neutral-500">
                          ({data.machines.length} gesamt)
                        </span>
                      </div>
                  <div className="flex gap-2">
                    <Input value={machineName} onChange={(e) => setMachineName(e.target.value)} placeholder="z.B. Godzilla" disabled={busy || locked} />
                    <Button disabled={busy || locked} onClick={addMachine}>
                      +
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {notice && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{notice}</div>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Runde starten</div>
        </CardHeader>
  <CardBody>
    <div className="flex flex-col gap-4">
      {/* Zeile: Select + Button nebeneinander ab md */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="md:flex-1">
          <Select
            className="w-full"
            value={startOrderMode}
            onChange={(e) =>
              setStartOrderMode(e.target.value as "random" | "standings_asc")
            }
            disabled={busy || locked}
          >
            <option value="random">Zufällig</option>
            <option value="standings_asc">
              Schlechtester zuerst (nach aktueller Wertung)
            </option>
          </Select>
        </div>


        

        <div className="md:w-auto">
          <Button
            className="w-full md:w-auto px-6 py-3 font-semibold"
            onClick={createRound}
            disabled={busy || hasOpenPositions || locked || superFinalRunning}
            title={
              locked
                ? "Turnier ist beendet"
                : hasOpenPositions
                ? "Erst alle Platzierungen in der aktuellen Runde eintragen"
                : ""
            }
          >
            Runde erzeugen + Maschinen zuweisen
          </Button>
        </div>
      </div>

      <p className="text-sm text-neutral-500 leading-snug">
        Diese Einstellung beeinflusst nur die Reihenfolge{" "}
        <b>innerhalb der Matches</b>, nicht die Gruppenzuordnung.
        Swiss- oder Matchplay-Logik bleiben unverändert.
      </p>
    </div>
  </CardBody>

      </Card>



    


      <MachinesList
        machines={data?.machines ?? []}
        onToggle={toggleMachine}
        busy={busy}
        locked={locked}
      />

      <PlayersList
        players={data?.players ?? []}
        profAvatar={profAvatar}
        profRating={profRating}
        onReload={reloadAll}
        onToggle={togglePlayer}
        busy={busy}
        locked={locked}
      />

      <Stats code={code} tournamentName={tournamentName} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <RoundMatchesCard
          code={code}
          rounds={rounds}
          matches={matches}
          matchPlayers={matchPlayers}
          machinesById={machinesById}
          playersById={playersById}
          onSaved={reloadAll}
          locked={locked}
        />

        <MiniLeaderboard code={code} />
      </div>

      
      {/* Super-Finale */}
      <Card className="border-2 border-amber-300 shadow-sm mt-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm text-neutral-500">Optional</div>
              <div className="text-lg font-semibold flex items-center gap-2">
                Super-Finale
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                  Top 4 • Ziel: 4 Punkte
                </span>
              </div>
            </div>
            {finalState?.status === "finished" ? (
              <div className="text-sm text-emerald-700 font-medium">
                ✅ abgeschlossen
              </div>
            ) : finalState?.exists ? (
              <div className="text-sm text-amber-700 font-medium">
                Läuft…
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardBody>
          {!finalState || !finalState.exists ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-neutral-600">
                Hier kannst du jederzeit ein optionales Super-Finale mit den besten 4
                Spielern aus dem aktuellen Leaderboard starten. Seed 1 beginnt mit 3
                Punkten, Seed 2 mit 2, Seed 3 mit 1, Seed 4 mit 0. Wer zuerst 4 Punkte
                erreicht, wird <b>Super Grand Champion</b>.
              </p>
              <div>
                <Button
                  disabled={busy || locked}
                  onClick={startSuperFinal}
                >
                  Super-Finale starten
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border bg-white">
                <div className="grid grid-cols-12 gap-2 border-b bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
                  <div className="col-span-2">Seed</div>
                  <div className="col-span-4">Spieler</div>
                  <div className="col-span-3 text-right">Startpunkte</div>
                  <div className="col-span-3 text-right">Aktuelle Punkte</div>
                </div>
                {(finalState.players ?? []).map((p: any) => (
                  <div
                    key={p.playerId}
                    className="grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center"
                  >
                    <div className="col-span-2 font-mono">#{p.seed}</div>
                    <div className="col-span-4">{p.name}</div>
                    <div className="col-span-3 text-right tabular-nums">
                      {p.startPoints}
                    </div>
                    <div className="col-span-3 text-right tabular-nums font-semibold">
                      {p.points} / {finalState.target_points}
                    </div>
                  </div>
                ))}
              </div>

             
              

              {finalState.status !== "finished" ? (

                <div>
                  <div className="mb-2 text-sm font-semibold text-neutral-600">
                    
                      Finalspiel {nextGameNumber} - wer hat gewonnen?
                    
                  </div>
                  <div className="mb-2 text-sm italic text-neutral-600">
                    
                      Drücke auf den Gewinner der Runde.
                    
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(finalState.players ?? []).map((p: any) => (
                      <Button
                        key={p.playerId}
                        variant="secondary"
                        disabled={busy || locked}
                        onClick={() => registerFinalWin(p.playerId)}
                      >
                        {p.name}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : finalState.ranking ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">
                    Ergebnis Super-Finale
                  </div>
                  <div className="overflow-hidden rounded-2xl border bg-white">
                    <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-600">
                      <div className="col-span-2">Platz</div>
                      <div className="col-span-4">Spieler</div>
                      <div className="col-span-3 text-right">Seed</div>
                      <div className="col-span-3 text-right">Finalpunkte</div>
                    </div>
                    {finalState.ranking.map((r: any) => (
                      <div
                        key={r.playerId}
                        className={
                          "grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center " +
                          (r.rank === 1 ? "bg-amber-50 font-semibold" : "")
                        }
                      >
                        <div className="col-span-2">
                          {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}.
                        </div>
                        <div className="col-span-4">{r.name}</div>
                        <div className="col-span-3 text-right">#{r.seed}</div>
                        <div className="col-span-3 text-right tabular-nums">
                          {r.points}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>


      {/* Sticky bottom action button */}
      <div className="sticky bottom-0 left-0 right-0 bg-[rgb(250,250,250)] p-4 flex z-20">

        <Button
          disabled={busy || hasOpenPositions || locked || superFinalRunning}
          onClick={createRound}
          className="w-full"
          title={
            locked
              ? "Turnier ist beendet"
              : hasOpenPositions
              ? "Erst alle Platzierungen in der aktuellen Runde eintragen"
              : ""
          }
        >
          Runde erzeugen + Spieler den Maschinen zuweisen
        </Button>
      </div>
    </div>
  );
}
