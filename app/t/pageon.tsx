// @ts-nocheck
"use client";
import { useEffect, useMemo, useState } from "react";
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
  match_size: number;
  format: "matchplay" | "swiss" | "round_robin";
  status: "open" | "running" | "finished";
  locations?: {
    name: string;
  } | null;
};

type Location = {
  id: string;
  name: string;
  machines_count: number;
};

type Match = {
  id: string;
  round_id: string;
  machine_id: string | null;
  status: string;
  series_id: string | null;
  game_number: number | null;
  created_at: string;
};

type MP = {
  match_id: string;
  player_id: string;
  position: number | null;
  start_position: number | null;
};

type Profile = {
  id: string;
  name: string;
  avatar_url: string | null;
  rating?: number | null;
};

function classNames(...parts: (string | null | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function ShareModal({
  open,
  onClose,
  code,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
}) {
  const [adminUrl, setAdminUrl] = useState("");
  const [scoreUrl, setScoreUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"admin" | "score" | null>(null);

  useEffect(() => {
    if (!open) return;

    const origin = window.location.origin;
    const admin = `${origin}/t/${encodeURIComponent(code)}`;
    const score = `${origin}/s/${encodeURIComponent(code)}`;

    setAdminUrl(admin);
    setScoreUrl(score);

    const urlForQr = score;

    QRCode.toDataURL(
      urlForQr,
      {
        margin: 1,
        width: 320,
        errorCorrectionLevel: "M",
      },
      (err, url) => {
        if (err) {
          console.error("Error generating QR:", err);
          return;
        }
        setQrDataUrl(url);
      }
    );
  }, [open, code]);

  async function copy(text: string, which: "admin" | "score") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {
      console.error("Clipboard error:", e);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Teilen &amp; Anzeigen
            </div>
            <div className="text-lg font-semibold">Turnier-Links &amp; QR-Code</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-200"
          >
            Schließen
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-600">
                Admin-Ansicht (Turnierverwaltung)
              </div>
              <div className="flex gap-2">
                <Input value={adminUrl} readOnly className="text-xs" />
                <Button variant="secondary" onClick={() => copy(adminUrl, "admin")}>
                  Kopieren
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-neutral-600">
                Scoreboard-Ansicht (Anzeige)
              </div>
              <div className="flex gap-2">
                <Input value={scoreUrl} readOnly className="text-xs" />
                <Button variant="secondary" onClick={() => copy(scoreUrl, "score")}>
                  Kopieren
                </Button>
              </div>
            </div>

            {copied && (
              <div className="text-xs text-emerald-600">
                {copied === "admin" ? "Admin-Link" : "Scoreboard-Link"} kopiert ✅
              </div>
            )}

            <div className="mt-4 rounded-2xl bg-neutral-50 p-3 text-xs text-neutral-600">
              <div className="font-semibold text-neutral-700">Tipp für iPad-Bildschirm:</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>
                  <span className="font-medium">Admin-Ansicht</span> auf deinem Gerät lassen.
                </li>
                <li>
                  <span className="font-medium">Scoreboard-Ansicht</span> auf dem iPad öffnen und nur
                  anzeigen lassen.
                </li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              QR-Code für Scoreboard
            </div>
            <div className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Scoreboard-QR-Code"
                  className="h-64 w-64 rounded-2xl bg-white"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center text-xs text-neutral-400">
                  Generiere QR…
                </div>
              )}
            </div>
            <div className="text-center text-[11px] text-neutral-500">
              Zuschauer scannen den QR-Code und sehen das Scoreboard in Echtzeit.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stats({
  code,
  tournamentName,
}: {
  code: string;
  tournamentName: string;
}) {
  const [rows, setRows] = useState<
    {
      player_id: string;
      name: string;
      wins: number;
      points: number;
      matches: number;
      winrate: number;
    }[]
  >([]);

  async function load() {
    try {
      const res = await fetch("/api/standings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await res.json().catch(() => ({}));
      setRows(j.rows ?? []);
    } catch (e) {
      console.error("Standings error:", e);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [code]);

  const topWins = rows
    .slice()
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((r) => ({ label: r.name, value: r.wins }));

  const topPoints = rows
    .slice()
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((r) => ({ label: r.name, value: r.points }));

  const topWinrate = rows
    .filter((r) => r.matches >= 3)
    .slice()
    .sort((a, b) => b.winrate - a.winrate || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map((r) => ({ label: r.name, value: Math.round(r.winrate * 1000) / 10 }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Live-Leaderboard
            </div>
            <div className="text-lg font-semibold">
              {tournamentName || "Turnier"}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {rows.length === 0 ? (
          <div className="text-sm text-neutral-500">
            Noch keine Ergebnisse eingetragen.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <BarChart
              title="Siege"
              items={topWins}
              valueLabel="Siege"
              className="h-40"
            />
            <BarChart
              title="Punkte"
              items={topPoints}
              valueLabel="Punkte"
              className="h-40"
            />
            <BarChart
              title="Winrate (≥3 Matches)"
              items={topWinrate}
              valueLabel="%"
              className="h-40"
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Avatar({
  url,
  name,
}: {
  url: string | null;
  name: string;
}) {
  const initials = (name ?? "")
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials || "?"
      )}
    </div>
  );
}

function AvatarUploader({
  profileId,
  onDone,
  disabled,
}: {
  profileId: string;
  onDone: () => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
        "inline-flex cursor-pointer items-center gap-2 rounded-full border px-2 py-1 text-xs " +
        (isDisabled
          ? "border-neutral-200 bg-neutral-50 text-neutral-400"
          : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400")
      }
    >
      <span>Avatar</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={isDisabled}
        onChange={onChange}
      />
    </label>
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
            {active.length} aktiv • {inactive.length} inaktiv •{" "}
            {machines.length} gesamt
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
            <div className="text-sm text-neutral-500">
              Noch keine Maschinen.
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function PlayersList({
  players,
  profAvatar,
  profRating,
  onReload,
  onToggle,
  busy,
  locked,
}: any) {
  const active = (players ?? []).filter((p: any) => p.active);
  const inactive = (players ?? []).filter((p: any) => !p.active);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>Spieler</div>
          <div className="text-sm text-neutral-500">
            {active.length} aktiv • {inactive.length} inaktiv •{" "}
            {players.length} gesamt
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-2">
          {players.map((p: any) => {
            const url = p.profile_id ? profAvatar[p.profile_id] ?? null : null;
            const rating =
              p.profile_id && typeof profRating[p.profile_id] === "number"
                ? profRating[p.profile_id]
                : null;

            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar url={url} name={p.name} />
                  <div className="text-base">{p.name}</div>
                  {rating != null && (
                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                      Elo{" "}
                      <span className="ml-1 font-semibold tabular-nums">
                        {Math.round(rating)}
                      </span>
                    </span>
                  )}
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
                      "inline-flex items-center rounded-full px-3 py-1 text-sm border transition " +
                      (p.active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-neutral-100 text-neutral-600 border-neutral-200")
                    }
                  >
                    <span
                      className={
                        "mr-2 h-2 w-2 rounded-full " +
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
            <div className="text-sm text-neutral-500">
              Noch keine Spieler.
            </div>
          )}
        </div>
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
  machinesById: Record<string, any>;
  playersById: Record<string, any>;
  onSaved: () => void;
  locked: boolean;
}) {
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const roundsById = useMemo(
    () =>
      Object.fromEntries(
        (rounds ?? []).map((r: any) => [r.id, r])
      ),
    [rounds]
  );

  const matchesByRoundId = useMemo(() => {
    const m: Record<string, Match[]> = {};
    for (const match of matches ?? []) {
      const rid = match.round_id;
      if (!m[rid]) m[rid] = [];
      m[rid].push(match);
    }
    for (const rid of Object.keys(m)) {
      m[rid] = m[rid].slice().sort((a, b) => {
        const ga = Number(a.game_number ?? 0);
        const gb = Number(b.game_number ?? 0);
        if (ga !== gb) return ga - gb;
        return String(a.id).localeCompare(String(b.id));
      });
    }
    return m;
  }, [matches]);

  const matchPlayersByMatchId = useMemo(() => {
    const mp: Record<string, MP[]> = {};
    for (const row of matchPlayers ?? []) {
      const mid = row.match_id;
      if (!mp[mid]) mp[mid] = [];
      mp[mid].push(row);
    }
    return mp;
  }, [matchPlayers]);

  useEffect(() => {
    if (!rounds?.length) {
      setOpenRoundId(null);
      return;
    }
    if (openRoundId && roundsById[openRoundId]) return;

    const open = rounds.find((r: any) => r.status === "open");
    if (open) setOpenRoundId(open.id);
    else setOpenRoundId(rounds[rounds.length - 1].id);
  }, [rounds, openRoundId, roundsById]);

  function isMatchComplete(mid: string) {
    const mps = matchPlayersByMatchId[mid] ?? [];
    if (!mps.length) return false;
    return mps.every((mp) => mp.position != null);
  }

  async function saveResult(
    matchId: string,
    results: { playerId: string; position: number | null }[]
  ) {
    if (locked) return;
    setSaving(true);
    setNotice(null);

    try {
      const res = await fetch("/api/matches/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, matchId, results }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(j.error ?? "Fehler beim Speichern");
        return;
      }
      await onSaved();
    } catch (e) {
      console.error(e);
      setNotice("Netzwerkfehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-lg font-semibold">Runden &amp; Matches</div>
          {notice && (
            <div className="text-xs text-amber-700">
              {notice}
            </div>
          )}
        </div>
      </CardHeader>
      <CardBody>
        {rounds.length === 0 ? (
          <div className="text-sm text-neutral-500">
            Noch keine Runden erzeugt.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {rounds.map((r: any) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setOpenRoundId(r.id)}
                  className={classNames(
                    "rounded-full border px-3 py-1 text-xs",
                    openRoundId === r.id
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
                  )}
                >
                  Runde {r.number} ·{" "}
                  {r.status === "open" ? "offen" : "abgeschlossen"}
                </button>
              ))}
            </div>

            {(rounds ?? [])
              .filter((r: any) => r.id === openRoundId)
              .map((r: any) => {
                const list = matchesByRoundId[r.id] ?? [];
                if (!list.length) {
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-500"
                    >
                      Noch keine Matches in dieser Runde.
                    </div>
                  );
                }

                return (
                  <div
                    key={r.id}
                    className="space-y-2 rounded-xl border bg-neutral-50 p-4"
                  >
                    {list.map((m) => {
                      const mps = (matchPlayersByMatchId[m.id] ?? []).slice();
                      mps.sort(
                        (a: any, b: any) =>
                          (a.start_position ?? 99) - (b.start_position ?? 99)
                      );
                      const complete = isMatchComplete(m.id);

                      return (
                        <div
                          key={m.id}
                          className={classNames(
                            "rounded-xl border px-4 py-3",
                            complete
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-neutral-200 bg-white"
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between text-xs">
                            <div className="font-medium">
                              {machinesById[m.machine_id ?? ""] ??
                                "—"}{" "}
                              <span className="text-[11px] text-neutral-500">
                                (Spiel {m.game_number ?? 1})
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              Status:{" "}
                              <span
                                className={
                                  complete
                                    ? "text-emerald-700"
                                    : "text-amber-700"
                                }
                              >
                                {complete ? "fertig" : "offen"}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-2 md:grid-cols-2">
                            {mps.map((mp) => {
                              const player = playersById[mp.player_id];
                              const maxPlace = mps.length || 4;

                              return (
                                <div
                                  key={mp.player_id}
                                  className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-xs"
                                >
                                  <div>{player ?? "Unbekannt"}</div>
                                  <div className="flex items-center gap-1">
                                    {Array.from(
                                      { length: maxPlace },
                                      (_, i) => i + 1
                                    ).map((pos) => (
                                      <button
                                        key={pos}
                                        type="button"
                                        disabled={saving || locked}
                                        onClick={() =>
                                          saveResult(
                                            m.id,
                                            mps.map((mm) => ({
                                              playerId: mm.player_id,
                                              position:
                                                mm.player_id === mp.player_id
                                                  ? pos
                                                  : mm.position,
                                            }))
                                          )
                                        }
                                        className={classNames(
                                          "flex h-6 w-6 items-center justify-center rounded-full border text-[11px]",
                                          mp.position === pos
                                            ? "border-neutral-900 bg-neutral-900 text-white"
                                            : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
                                        )}
                                      >
                                        {pos}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      disabled={saving || locked}
                                      onClick={() =>
                                        saveResult(
                                          m.id,
                                          mps.map((mm) => ({
                                            playerId: mm.player_id,
                                            position:
                                              mm.player_id === mp.player_id
                                                ? null
                                                : mm.position,
                                          }))
                                        )
                                      }
                                      className="ml-2 text-[11px] text-neutral-400 hover:text-neutral-600"
                                    >
                                      –
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
          </div>
        )}
      </CardBody>
    </Card>
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
  const [finalState, setFinalState] = useState<any | null>(null);

  const isFinished = data?.tournament?.status === "finished";
  const locked = isFinished;

  async function finishTournament() {
    if (
      !confirm(
        "Turnier wirklich beenden? Danach ist nichts mehr änderbar."
      )
    )
      return;
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

  async function deleteTournament() {
    if (
      !confirm(
        "Turnier wirklich endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden."
      )
    )
      return;

    const res = await fetch("/api/tournaments/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error ?? "Fehler beim Löschen");
      return;
    }
    await reloadAll();
    localStorage.removeItem("pb_code");
    location.href = "/t";
  }

  useEffect(() => {
    reload();
    loadProfiles();
    loadFinalState();
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
    const res = await fetch("/api/profiles/list");
    const j = await res.json();
    setProfiles(j.profiles ?? []);
  }

  async function loadFinalState() {
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
    await Promise.all([reload(), loadProfiles(), loadFinalState()]);
  }

  async function addPlayerByName() {
    if (locked) return;
    if (!playerName.trim()) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/players/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: playerName.trim() }),
    });
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

    const res = await fetch("/api/players/addFromProfile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, profileId: selectedProfileId }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler beim Hinzufügen");
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
      setNotice(
        "Netzwerkfehler beim Aktualisieren der Maschine"
      );
    } finally {
      setBusy(false);
    }
  }

  async function startSuperFinal() {
    if (locked) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/finals/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(j.error ?? "Super-Finale konnte nicht gestartet werden");
        return;
      }
      await loadFinalState();
    } catch (e) {
      setNotice("Netzwerkfehler beim Starten des Super-Finales");
    } finally {
      setBusy(false);
    }
  }

  async function registerFinalWin(playerId: string) {
    if (locked) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/finals/add-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, winnerPlayerId: playerId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(j.error ?? "Final-Spiel konnte nicht gespeichert werden");
        return;
      }
      if (j.finished) {
        setShowCelebration(true);
      }
      await reloadAll();
    } catch (e) {
      setNotice(
        "Netzwerkfehler beim Speichern des Final-Spiels"
      );
    } finally {
      setBusy(false);
    }
  }

  async function addMachine() {
    if (locked) return;
    if (!machineName.trim()) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/machines/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: machineName.trim() }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    setMachineName("");
    await reloadAll();
  }

  const currentRoundNumber = data?.tournament?.current_round ?? null;
  const currentRoundObj = useMemo(
    () =>
      (rounds ?? []).find((r: any) => r.number === currentRoundNumber) ??
      null,
    [rounds, currentRoundNumber]
  );

  const currentRoundMatches = useMemo(() => {
    if (!currentRoundObj) return [];
    return (matches ?? []).filter(
      (m: any) => m.round_id === currentRoundObj.id
    );
  }, [matches, currentRoundObj]);

  const hasOpenPositions = useMemo(() => {
    if (!currentRoundMatches.length) return false;
    const matchIds = new Set(currentRoundMatches.map((m: any) => m.id));
    const mps = (matchPlayers ?? []).filter((x: any) =>
      matchIds.has(x.match_id)
    );
    return mps.some((x: any) => x.position == null);
  }, [currentRoundMatches, matchPlayers]);

  async function createRound() {
    if (locked) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/rounds/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    if (j.warnings?.length) setNotice(j.warnings.join(" "));
    await reloadAll();
  }

  const profAvatar = useMemo(
    () =>
      Object.fromEntries(
        profiles.map((p) => [p.id, p.avatar_url ?? null])
      ),
    [profiles]
  );
  const profRating = useMemo(
    () =>
      Object.fromEntries(
        profiles.map((p) => [
          p.id,
          typeof p.rating === "number" ? p.rating : null,
        ])
      ),
    [profiles]
  );

  const cat = data?.tournament?.category ?? "";

  const machinesById = useMemo(
    () =>
      Object.fromEntries(
        (data?.machines ?? []).map((m: any) => [m.id, m.name])
      ),
    [data?.machines]
  );
  const playersById = useMemo(
    () =>
      Object.fromEntries(
        (data?.players ?? []).map((p: any) => [p.id, p.name])
      ),
    [data?.players]
  );

  if (!data)
    return (
      <div className="p-6 text-sm text-neutral-500">
        Lade Turnier…
      </div>
    );

  const tournamentName = tournament?.name ?? name;

  const formatLabel =
    data?.tournament?.format === "swiss"
      ? "Swiss"
      : data?.tournament?.format === "round_robin"
      ? "Round Robin"
      : "Matchplay";

  const totalPlayers = (data?.players ?? []).length;
  const totalMachines = (data?.machines ?? []).length;

  return (
    <div className="space-y-4">
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        code={code}
      />

      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 celebration-overlay">
          <div className="relative z-10 w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
              <div className="confetti-container">
                {Array.from({ length: 18 }).map((_, i) => {
                  const count = 18;
                  const offset = 5 + (i * 90) / (count - 1);
                  const delay = (i % 9) * 0.4;

                  return (
                    <div
                      key={i}
                      className="confetti-piece"
                      style={
                        {
                          "--confetti-left": `${offset}%`,
                          "--confetti-delay": `${delay}s`,
                        } as React.CSSProperties
                      }
                    />
                  );
                })}
              </div>
            </div>

            <div className="relative z-30 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-500">
                    Turnier beendet
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                      Grand Champion
                    </div>
                    <div className="text-lg font-semibold text-neutral-900">
                      {tournamentName || "Turnier"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowCelebration(false)}
                  className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-200"
                >
                  Schließen
                </button>
              </div>

              <div className="relative rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white p-4">
                <div className="absolute -top-3 left-4 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow">
                  Champion
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm text-neutral-600">
                      Offizieller Sieger
                    </div>
                    <div className="text-xl font-bold text-neutral-900">
                      {tournamentName || "Turnier"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
                    <span>🏆</span>
                    <span>Grand Champion</span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-neutral-500">
                Du kannst die Ergebnisse weiterhin in der Admin-Ansicht
                einsehen. Änderungen sind jetzt gesperrt, um das Ergebnis zu
                sichern.
              </div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Turnier-Admin
              </div>
              <div className="text-lg font-semibold">
                {tournamentName || "Unbenanntes Turnier"}
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-600">
                {cat && <Pill>{cat}</Pill>}
                <Pill>
                  Spieler/Maschine{" "}
                  <span className="ml-1 font-semibold">
                    {data?.tournament?.match_size ?? 4}
                  </span>
                </Pill>
                {currentRoundNumber ? (
                  <Pill>
                    Runde{" "}
                    <span className="ml-1 font-semibold">
                      #{currentRoundNumber}
                    </span>
                  </Pill>
                ) : null}
                {data?.tournament?.locations?.name ? (
                  <Pill>📍 {data.tournament.locations.name}</Pill>
                ) : null}
                <Pill>
                  Status:{" "}
                  <span className="ml-2 font-semibold">
                    {data?.tournament?.status ?? "open"}
                  </span>
                </Pill>
                <Pill>
                  Format:{" "}
                  <span className="ml-2 font-semibold">{formatLabel}</span>
                </Pill>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-neutral-500">
                <Pill>
                  Code:{" "}
                  <span className="ml-2 font-semibold">{code}</span>
                </Pill>

                <Button
                  variant="secondary"
                  onClick={() => setShareOpen(true)}
                >
                  QR & Links
                </Button>

                <a
                  className="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium bg-neutral-100 hover:bg-neutral-200"
                  href={`/s/${encodeURIComponent(code)}`}
                  target="_blank"
                >
                  Zusammenfassung
                </a>

                <a
                  className="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-medium bg-neutral-100 hover:bg-neutral-200"
                  href={`/t/${encodeURIComponent(code)}`}
                  target="_blank"
                >
                  Public (/t/[code])
                </a>

                <Button
                  variant="secondary"
                  onClick={async () => {
                    await supabaseBrowser().auth.signOut();
                    localStorage.removeItem("pb_code");
                    location.href = "/t";
                  }}
                >
                  Logout
                </Button>
              </div>

              <div className="text-right text-xs text-neutral-400">
                {totalPlayers} Spieler • {totalMachines} Maschinen
              </div>
            </div>
          </div>
        </CardHeader>

        <CardBody>
          {locked ? (
            <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Dieses Turnier ist beendet. Alles Ändernde ist gesperrt
              (read-only).
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm text-neutral-600">
                    Spieler hinzufügen
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={playerName}
                      onChange={(e) =>
                        setPlayerName(e.target.value)
                      }
                      placeholder="Name (Profil wird gemerkt)"
                      disabled={busy || locked}
                    />
                    <Button
                      disabled={busy || locked}
                      onClick={addPlayerByName}
                    >
                      +
                    </Button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Select
                      value={selectedProfileId}
                      onChange={(e) =>
                        setSelectedProfileId(e.target.value)
                      }
                      disabled={busy || locked}
                    >
                      <option value="">Profil wählen…</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="secondary"
                      disabled={
                        busy || locked || !selectedProfileId
                      }
                      onClick={addPlayerFromProfile}
                    >
                      Hinzufügen
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-sm text-neutral-600">
                    Maschine hinzufügen
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={machineName}
                      onChange={(e) =>
                        setMachineName(e.target.value)
                      }
                      placeholder="z.B. Godzilla"
                      disabled={busy || locked}
                    />
                    <Button
                      disabled={busy || locked}
                      onClick={addMachine}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-neutral-50 px-4 py-3">
                <div className="flex flex-wrap gap-3 text-xs text-neutral-600">
                  <span>
                    Aktuelle Runde:{" "}
                    <span className="font-semibold">
                      {currentRoundNumber
                        ? `#${currentRoundNumber}`
                        : "—"}
                    </span>
                  </span>
                  <span>
                    Offene Matches in aktueller Runde:{" "}
                    <span className="font-semibold">
                      {
                        currentRoundMatches.filter(
                          (m) => m.status !== "done"
                        ).length
                      }
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={busy || hasOpenPositions || locked}
                    onClick={createRound}
                    className="w-full md:w-auto"
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
            </div>
          </div>

          {notice && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {notice}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Runde starten</CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              disabled={busy || hasOpenPositions || locked}
              onClick={createRound}
              className="w-full md:w-auto"
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
            <div className="text-xs text-neutral-500">
              Eine neue Runde kann nur gestartet werden, wenn alle
              Platzierungen der aktuellen Runde gesetzt sind.
            </div>
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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

        {/* Mini-Leaderboard (rechte Seite) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Mini-Leaderboard
                </div>
                <div className="text-sm text-neutral-600">
                  Schnellüberblick
                </div>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <MiniLeaderboard code={code} />
          </CardBody>
        </Card>
      </div>

      {/* Super-Finale */}
      <Card className="mt-4 border-2 border-amber-300 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm text-neutral-500">
                Optional
              </div>
              <div className="flex items-center gap-2 text-lg font-semibold">
                Super-Finale
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                  Top 4 · Ziel: 4 Punkte
                </span>
              </div>
            </div>
            {finalState?.status === "finished" ? (
              <div className="text-sm font-medium text-emerald-700">
                ✅ abgeschlossen
              </div>
            ) : finalState?.exists ? (
              <div className="text-sm font-medium text-amber-700">
                Läuft…
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardBody>
          {!finalState || !finalState.exists ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-neutral-600">
                Hier kannst du ein optionales Super-Finale mit den
                besten 4 Spieler:innen aus dem aktuellen Leaderboard
                starten. Seed 1 beginnt mit 3 Punkten, Seed 2 mit 2,
                Seed 3 mit 1, Seed 4 mit 0. Wer zuerst 4 Punkte
                erreicht, wird <b> Super Grand Champion</b>.
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
                  <div className="col-span-3 text-right">
                    Startpunkte
                  </div>
                  <div className="col-span-3 text-right">
                    Aktuelle Punkte
                  </div>
                </div>
                {(finalState.players ?? []).map((p: any) => (
                  <div
                    key={p.playerId ?? p.player_id}
                    className="grid grid-cols-12 items-center gap-2 px-4 py-2 text-sm"
                  >
                    <div className="col-span-2 font-mono">
                      #{p.seed}
                    </div>
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
                  <div className="mb-2 text-sm text-neutral-600">
                    Wer hat dieses Finalspiel gewonnen?
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(finalState.players ?? []).map((p: any) => (
                      <Button
                        key={p.playerId ?? p.player_id}
                        variant="secondary"
                        disabled={busy || locked}
                        onClick={() =>
                          registerFinalWin(
                            p.playerId ?? p.player_id
                          )
                        }
                      >
                        Sieg: {p.name}
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
                      <div className="col-span-3 text-right">
                        Seed
                      </div>
                      <div className="col-span-3 text-right">
                        Finalpunkte
                      </div>
                    </div>
                    {finalState.ranking.map((r: any) => (
                      <div
                        key={r.playerId}
                        className={
                          "grid grid-cols-12 items-center gap-2 px-4 py-2 text-sm " +
                          (r.rank === 1
                            ? "bg-amber-50 font-semibold"
                            : "")
                        }
                      >
                        <div className="col-span-2">
                          {r.rank === 1
                            ? "🥇"
                            : r.rank === 2
                            ? "🥈"
                            : r.rank === 3
                            ? "🥉"
                            : `${r.rank}.`}
                        </div>
                        <div className="col-span-4">
                          {r.name}
                        </div>
                        <div className="col-span-3 text-right">
                          #{r.seed}
                        </div>
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
      <div className="sticky bottom-0 left-0 right-0 rgb(250 250 250) p-4 flex z-20">
        <Button
          disabled={busy || hasOpenPositions || locked}
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

export default function TournamentPage() {
  const [tab, setTab] = useState<
    "join" | "create" | "locations" | "players"
  >("join");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [matchSize, setMatchSize] = useState(2);
  const [tournamentFormat, setTournamentFormat] =
    useState<"matchplay" | "swiss" | "round_robin">("matchplay");

  const [templateTournamentId, setTemplateTournamentId] =
    useState<string>("");
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
            .filter(
              (c): c is string => !!c && c.trim().length > 0
            )
        )
      ),
    [archive]
  );

  const [locations, setLocations] = useState<Location[]>([]);

  const [openLocationId, setOpenLocationId] = useState<string | null>(
    null
  );

  useEffect(() => {
    const saved = localStorage.getItem("pb_code");
    if (saved) setCode(saved);
    loadArchive();
    loadLocations();
  }, []);

  async function loadArchive() {
    try {
      const res = await fetch("/api/tournaments/list", {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      setArchive(j.tournaments ?? []);
    } catch {
      setArchive([]);
    }
  }

  async function loadLocations() {
    try {
      const res = await fetch("/api/locations/list", {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      setLocations(j.locations ?? []);
    } catch {
      setLocations([]);
    }
  }

  async function createTournament() {
    if (!name.trim()) {
      setMsg("Name fehlt");
      return;
    }

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

    if (!res.ok) {
      setMsg(j.error ?? "Turnier nicht gefunden");
      setJoined(null);
      return;
    }

    setJoined(j.tournament);
    setCode(c);
    localStorage.setItem("pb_code", c);
  }

  if (joined) {
    return <Dashboard code={joined.code} name={joined.name} />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Turnier Wizard
              </div>
              <div className="text-xl font-semibold">
                Turnier auswählen / erstellen
              </div>
            </div>

            <div className="text-xs text-neutral-500">
              Code in diesem Browser:{" "}
              <span className="font-mono">
                {code || "— (noch keiner gespeichert)"}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardBody>
          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTab("join")}
                className={
                  "text-sm " +
                  (tab === "join"
                    ? "font-semibold"
                    : "text-neutral-500")
                }
              >
                Turnier öffnen
              </button>
              <span className="text-neutral-300">|</span>
              <button
                onClick={() => setTab("create")}
                className={
                  "text-sm " +
                  (tab === "create"
                    ? "font-semibold"
                    : "text-neutral-500")
                }
              >
                Neues Turnier
              </button>

              <span className="text-neutral-300">|</span>
              <button
                onClick={() => setTab("locations")}
                className={
                  tab === "locations"
                    ? "font-semibold"
                    : "text-neutral-500"
                }
              >
                Locations
              </button>

              <span className="text-neutral-300">|</span>
              <button
                onClick={() => setTab("players")}
                className={
                  tab === "players"
                    ? "font-semibold"
                    : "text-neutral-500"
                }
              >
                Spieler
              </button>
            </div>
          </div>

          {tab === "join" ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm text-neutral-600">
                  Turnier-Code
                </div>
                <Input
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value)
                  }
                  placeholder="z.B. K3M9QZ"
                />
              </div>
              <Button disabled={busy} onClick={() => joinTournament()}>
                Öffnen
              </Button>
            </div>
          ) : tab === "create" ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm text-neutral-600">
                  Turniername
                </div>
                <Input
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                  placeholder="z.B. Monats-Cup"
                />
              </div>

              <div>
                <div className="mb-1 text-sm text-neutral-600">
                  Kategorie / Serie (frei wählbar)
                </div>
                <Input
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value)
                  }
                  placeholder="z.B. Liga 2025, Flipper-Serie Süd, ..."
                  list="existing-categories"
                />
                <datalist id="existing-categories">
                  {existingCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <div className="mt-1 text-xs text-neutral-500">
                  Du kannst hier frei eintragen, wie diese Serie
                  heißen soll. Gleiche Kategorien kannst du später
                  im großen Serien-Leaderboard zusammenfassen.
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="mb-1 text-sm text-neutral-600">
                    Spieler pro Match
                  </div>
                  <Select
                    value={String(matchSize)}
                    onChange={(e) =>
                      setMatchSize(Number(e.target.value))
                    }
                  >
                    <option value="2">1 vs 1</option>
                    <option value="3">3er-Gruppe</option>
                    <option value="4">4er-Gruppe</option>
                  </Select>
                </div>

                <div>
                  <div className="mb-1 text-sm text-neutral-600">
                    Format
                  </div>
                  <Select
                    value={tournamentFormat}
                    onChange={(e) =>
                      setTournamentFormat(
                        e.target
                          .value as typeof tournamentFormat
                      )
                    }
                  >
                    <option value="matchplay">Matchplay</option>
                    <option value="swiss">Swiss</option>
                    <option value="round_robin">
                      Round Robin
                    </option>
                  </Select>
                  <div className="mt-1 text-xs text-neutral-500">
                    Swiss und Round Robin werden aktuell wie
                    Matchplay ausgelost – die genauere Logik bauen
                    wir später ein.
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-sm text-neutral-600">
                      Maschinen übernehmen aus Turnier
                    </div>
                    <Select
                      value={templateTournamentId}
                      onChange={(e) => {
                        setTemplateTournamentId(
                          e.target.value
                        );
                        if (e.target.value) setLocationId("");
                      }}
                    >
                      <option value="">
                        — (keine Übernahme)
                      </option>
                      {archive.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                    </Select>
                    <div className="mt-1 text-xs text-neutral-500">
                      Kopiert Maschinen + Zuordnung aus einem
                      alten Turnier.
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-sm text-neutral-600">
                      Maschinen importieren aus Location
                    </div>
                    <Select
                      value={locationId}
                      onChange={(e) => {
                        setLocationId(e.target.value);
                        if (e.target.value)
                          setTemplateTournamentId("");
                      }}
                    >
                      <option value="">
                        — (kein Location-Import)
                      </option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                    <div className="mt-1 text-xs text-neutral-500">
                      Importiert Maschinen aus einer Location
                      (z.B. alle Geräte, die dort stehen).
                    </div>
                  </div>
                </div>
              </div>

              <Button disabled={busy} onClick={createTournament}>
                Turnier erstellen
              </Button>

              <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
                <div className="font-semibold text-neutral-700">
                  Hinweis
                </div>
                <div className="mt-1">
                  Du kannst später jederzeit Spieler und Maschinen
                  ergänzen oder deaktivieren. Das Format gilt für
                  das gesamte Turnier.
                </div>
              </div>
            </div>
          ) : tab === "locations" ? (
            <LocationsTab />
          ) : tab === "players" ? (
            <PlayersTab />
          ) : null}

          {msg && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {msg}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-neutral-800">
                Archiv
              </div>
              <div className="text-xs text-neutral-500">
                Vorherige Turniere in diesem Account
              </div>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="overflow-hidden rounded-xl border">
            {archive.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-12 items-center gap-2 border-b px-4 py-2 text-sm last:border-b-0"
              >
                <button
                  className="col-span-5 truncate text-left font-medium hover:underline"
                  onClick={() => joinTournament(t.code)}
                >
                  {t.name}
                </button>
                <div className="col-span-3 truncate text-xs text-neutral-500">
                  {t.category ?? "—"}
                </div>
                <div className="col-span-2 font-mono text-xs text-neutral-500">
                  {t.code}
                </div>

                {/* Datum */}
                <div className="col-span-1 text-left text-xs text-neutral-500">
                  {t.created_at
                    ? new Date(
                        t.created_at
                      ).toLocaleDateString("de-DE")
                    : "—"}
                </div>
              </div>
            ))}

            {archive.length === 0 && (
              <div className="px-4 py-4 text-sm text-neutral-500">
                Noch keine Turniere.
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
