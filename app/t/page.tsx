// @ts-nocheck
"use client";

import { useEffect, useMemo, useState, useRef, Fragment  } from "react";
import { Button, Card, CardBody, CardHeader, Input, Pill, Select } from "@/components/ui";
import { BarChart, Sparkline } from "@/components/charts";
import QRCode from "qrcode";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import LocationsTab from "./LocationsTab";
import PlayersTab from "./PlayersTab";
import { ProfilePicker } from "@/components/ProfilePicker";

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

type Profile = {
  id: string;
  name: string;
  avatar_url: string | null;
  rating?: number | null;
  color?: string | null;
  icon?: string | null;
};

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

type PlayerVisual = {
  name: string;
  color?: string | null;
  icon?: string | null;
  avatarUrl?: string | null;
};

type EloLeaderboardEntry = {
  profileId: string;
  name: string;
  avatar_url?: string | null;
  color?: string | null;
  icon?: string | null;
  rating: number;
  matchesPlayed: number;
  tournamentsPlayed: number;
  trendLastN?: number | null;
};

// ⬇️ NEU: Typ für Turnier-Leaderboard
type TournamentLeaderboardEntry = {
  profileId: string;
  name: string;
  avatar_url?: string | null;
  color?: string | null;
  icon?: string | null;
  wins: number;
  podiums: number;
  tournamentsPlayed: number;
  matchesPlayed: number;
};

type TournamentSuccessRow = {
  profileId: string;
  name: string;
  avatar_url?: string | null;
  color?: string | null;
  icon?: string | null;
  tournamentsPlayed: number;
  tournamentsWon: number;
  podiums: number;
  matchesPlayed: number;
};

function PlayerPill({ player }: { player: PlayerVisual }) {
  const initials =
    player.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  const emoji = (player.icon ?? "").trim();
  const bgStyle = player.color ? { backgroundColor: player.color } : {};

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
      // Runden Icons
        className="flex h-9 w-9 flex items-center justify-center rounded-full text-xs font-bold"
        style={bgStyle}
      >
        {emoji ? (
          <span className="text-base">{emoji}</span>
        ) : player.avatarUrl ? (
          <img
            src={player.avatarUrl}
            alt={player.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs font-semibold text-neutral-700">
            {initials}
          </span>
        )}
      </div>
      <span className="truncate font-medium   ">{player.name}</span>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="h-10 w-10 overflow-hidden rounded-xl border bg-neutral-100 flex items-center justify-center">
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-sm font-semibold text-neutral-600">
          {initials || "?"}
        </span>
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
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function onPick(file: File) {
    setBusy(true);
    const fd = new FormData();
    fd.set("profileId", profileId);
    fd.set("file", file);
    const res = await fetch("/api/avatars/upload", {
      method: "POST",
      body: fd,
    });
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

function ShareModal({
  open,
  onClose,
  code,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
}) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-3xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="text-lg font-semibold">Teilen (QR-Code)</div>
          <button
            className="rounded-xl bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200"
            onClick={onClose}
          >
            Schließen
          </button>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-semibold">
              Dieses Turnier (Admin)
            </div>
            <div className="mt-2 text-xs text-neutral-500 break-all">
              {tUrl}
            </div>
            <div className="mt-3 flex justify-center">
              {tQr ? (
                <img src={tQr} alt="QR Turnier" className="h-56 w-56" />
              ) : (
                <div className="text-sm text-neutral-500">
                  QR wird erstellt…
                </div>
              )}
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-semibold">
              Gesamtübersicht /public (read-only)
            </div>
            <div className="mt-2 text-xs text-neutral-500 break-all">
              {pUrl}
            </div>
            <div className="mt-3 flex justify-center">
              {pQr ? (
                <img src={pQr} alt="QR Public" className="h-56 w-56" />
              ) : (
                <div className="text-sm text-neutral-500">
                  QR wird erstellt…
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="border-t px-6 py-4 text-sm text-neutral-600">
          Tipp: Auf iPhone/iPad Kamera öffnen → QR scannen → Link teilen.
        </div>
      </div>
    </div>
  );
}

function PlayersList({
  players,
  profAvatar,
  profRating,
  playersById,
  onReload,
  onToggle,
  busy,
  locked,
  eloDeltas,
}: any) {
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
            const pv: PlayerVisual =
              (playersById && playersById[p.id]) ?? {
                name: p.name,
                color: null,
                icon: null,
                avatarUrl: null,
              };

            const delta =
              p.profile_id && eloDeltas ? eloDeltas[p.profile_id] ?? 0 : 0;
            const hasDelta = typeof delta === "number" && delta !== 0;
            const deltaSign = delta > 0 ? "+" : "";
            const deltaClass =
              delta > 0 ? "text-emerald-600" : "text-red-600";

            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <PlayerPill player={pv} />

                  {p.profile_id && profRating?.[p.profile_id] != null ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-sm">
                      Elo{" "}
                      <span className="ml-2 font-semibold tabular-nums">
                        {Math.round(profRating[p.profile_id])}
                      </span>
                      {hasDelta && (
                        <span
                          className={
                            "ml-2 text-xs font-semibold tabular-nums " +
                            deltaClass
                          }
                        >
                          {deltaSign}
                          {Math.round(delta)}
                        </span>
                      )}
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

//Maschinen Icons
function MachineIcon({ name, emoji }: { name: string; emoji?: string | null }) {
  function getColor(name: string) {
    const colors = [
      "bg-emerald-200 text-emerald-800",
      "bg-amber-200 text-amber-800",
      "bg-sky-200 text-sky-800",
      "bg-rose-200 text-rose-800",
      "bg-violet-200 text-violet-800",
      "bg-lime-200 text-lime-800",
      "bg-cyan-200 text-cyan-800",
      "bg-stone-200 text-stone-700",
      "bg-neutral-200 text-neutral-700",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash + name.charCodeAt(i) * (i + 1)) % colors.length;
    }
    return colors[hash];
  }

  function getInitials(name: string) {
    return (
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("") || "?"
    );
  }

  const content = emoji && emoji.trim().length ? emoji : getInitials(name);
  const color = getColor(name);

  return (
    <div
      //className={`h-10 w-10 flex items-center justify-center rounded-full text-ms font-bold border border-white shadow ${color}`}
      className={`h-9 w-9 flex items-center justify-center rounded-full text-ms font-bold bg-transparent`}

    >
      {content}
    </div>
  );
}


function MachinesList({
  machines,
  onToggle,
  busy,
  locked,
  usageCounts = {},
}: {
  machines: any[];
  onToggle: (id: string) => void;
  busy: boolean;
  locked: boolean;
  usageCounts?: Record<string, number>;
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
{(machines ?? []).map((m) => {
  const count = usageCounts[m.id] ?? 0;

  return (
    <div
      key={m.id}
      className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3"
    >
      {/* LINKER TEIL: Icon + Name + Nutzung */}
      <div className="flex items-center gap-3">
        <MachineIcon name={m.name} emoji={m.icon_emoji} />

        <div className="flex flex-col">
          <div className="text-base font-medium">{m.name}</div>
          {count > 0 && (
            <div className="text-xs text-neutral-500">
              {count}× im Turnier verwendet
            </div>
          )}
        </div>
      </div>

      {/* RECHTS: dein bestehender aktiv/inaktiv-Button bleibt unverändert */}
      <button
        type="button"
        disabled={busy || locked}
        onClick={() => onToggle(m.id)}
        className={
          "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
          (m.active
            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
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
  );
})}


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

type MatchPlacementRow = {
  playerId: string;
  profileId: string | null;
  name: string;
  avatar_url: string | null;
  color: string | null;
  icon: string | null;
  matches: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  fourthPlaces: number;
  avgPosition: number | null;
  winrate: number; // in %
};

type SortKey =
  | "matches"
  | "firstPlaces"
  | "secondPlaces"
  | "thirdPlaces"
  | "fourthPlaces"
  | "avgPosition"
  | "winrate";

type SortDir = "asc" | "desc";


// 👇 HIER EINFÜGEN (außerhalb von Funktionen/Komponenten)
type TournamentSortKey =
  | "tournamentsPlayed"
  | "firstPlaces"
  | "secondPlaces"
  | "thirdPlaces"
  | "avgPosition"
  | "tournamentWinrate"
  | "tournamentPoints";


function MatchPlacementLeaderboard() {
  const [rows, setRows] = useState<MatchPlacementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("matches");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 👇 welcher Spieler ist aufgeklappt?
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);

  // 👇 Detaildaten pro Spieler (Key = profileId)
  type MatchByTournamentRow = {
    tournamentId: string;
    tournamentName: string;
    tournamentCode: string | null;
    matches: number;
    firstPlaces: number;
    secondPlaces: number;
    thirdPlaces: number;
    fourthPlaces: number;
    avgPosition: number | null;
    winrate: number; // %
  };

  const [detailsByProfile, setDetailsByProfile] = useState<
    Record<string, MatchByTournamentRow[]>
  >({});

  const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>(
    {}
  );

  const [detailsError, setDetailsError] = useState<Record<string, string | null>>(
    {}
  );

  async function loadDetails(profileId: string) {
  setDetailsLoading((p) => ({ ...p, [profileId]: true }));
  setDetailsError((p) => ({ ...p, [profileId]: null }));

  try {
    const res = await fetch(
      `/api/leaderboards/match-stats-by-tournament?profileId=${encodeURIComponent(
        profileId
      )}&ts=${Date.now()}`,
      { cache: "no-store" }
    );

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = j.error ?? "Konnte Turnier-Details nicht laden.";
      setDetailsError((p) => ({ ...p, [profileId]: msg }));
      setDetailsByProfile((p) => ({ ...p, [profileId]: [] }));
      return;
    }

    setDetailsByProfile((p) => ({ ...p, [profileId]: j.rows ?? [] }));
  } catch {
    setDetailsError((p) => ({
      ...p,
      [profileId]: "Konnte Turnier-Details nicht laden (Netzwerkfehler?).",
    }));
    setDetailsByProfile((p) => ({ ...p, [profileId]: [] }));
  } finally {
    setDetailsLoading((p) => ({ ...p, [profileId]: false }));
  }
}

function toggleOpen(profileId: string) {
  setOpenProfileId((prev) => {
    const next = prev === profileId ? null : profileId;

    // beim Öffnen: Details einmalig laden (wenn noch nicht da)
    if (next && !detailsByProfile[next] && detailsLoading[next] !== true) {
      loadDetails(next);
    }

    return next;
  });
}


  async function load() {
    setLoading(true);
    setError(null);
    setRows([]); // Hard reset

    // Optional: wenn du neu lädst, klappt man besser alles zu
    setOpenProfileId(null);

    try {
      const res = await fetch(`/api/leaderboards/match-stats?ts=${Date.now()}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(j.error ?? "Konnte Match-Statistik nicht laden.");
        setRows([]);
      } else {
        setRows(j.rows ?? []);
      }
    } catch {
      setError("Konnte Match-Statistik nicht laden (Netzwerkfehler?).");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // ✅ NEU: lädt Turnier-Details für genau einen Spieler
  async function fetchDetailsForProfile(profileId: string) {
    // schon geladen? -> nicht nochmal
    if ((detailsByProfile[profileId] ?? []).length > 0) return;

    setDetailsLoading((p) => ({ ...p, [profileId]: true }));
    setDetailsError((p) => ({ ...p, [profileId]: null }));

    try {
      const res = await fetch(
        `/api/leaderboards/match-stats-by-tournament?profileId=${encodeURIComponent(
          profileId
        )}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDetailsError((p) => ({
          ...p,
          [profileId]: j.error ?? "Konnte Turnier-Details nicht laden.",
        }));
        setDetailsByProfile((p) => ({ ...p, [profileId]: [] }));
      } else {
        setDetailsByProfile((p) => ({ ...p, [profileId]: j.rows ?? [] }));
      }
    } catch {
      setDetailsError((p) => ({
        ...p,
        [profileId]: "Netzwerkfehler beim Laden der Turnier-Details.",
      }));
      setDetailsByProfile((p) => ({ ...p, [profileId]: [] }));
    } finally {
      setDetailsLoading((p) => ({ ...p, [profileId]: false }));
    }
  }

  // ✅ NEU: klick handler (auf/zu + ggf. laden)
  async function toggleOpen(profileId: string | null) {
    if (!profileId) return;

    // zuklappen
    if (openProfileId === profileId) {
      setOpenProfileId(null);
      return;
    }

    // aufklappen
    setOpenProfileId(profileId);

    // details laden (nur wenn noch nicht da)
    await fetchDetailsForProfile(profileId);
  }

  function toggleSort(key: SortKey) {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(key === "avgPosition" ? "asc" : "desc");
      return key;
    });
  }

  const sortedRows = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      const getVal = (r: MatchPlacementRow) => {
        switch (sortKey) {
          case "matches":
            return r.matches;
          case "firstPlaces":
            return r.firstPlaces;
          case "secondPlaces":
            return r.secondPlaces;
          case "thirdPlaces":
            return r.thirdPlaces;
          case "fourthPlaces":
            return r.fourthPlaces;
          case "winrate":
            return r.winrate;
          case "avgPosition":
            return r.avgPosition ?? 9999;
          default:
            return 0;
        }
      };

      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function sortLabel(key: SortKey, label: string) {
    const isActive = sortKey === key;
    const arrow = isActive ? (sortDir === "asc" ? "↑" : "↓") : "";
    return (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={
          "inline-flex items-center gap-1" +
          (isActive ? " text-neutral-900 font-semibold" : " text-neutral-600")
        }
      >
        <span>{label}</span>
        {arrow && <span className="text-xs">{arrow}</span>}
      </button>
    );
  }

  return (




    <Card className="mb-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Match-Leistung (global)</div>
            <div className="text-xs text-neutral-500">
              Platzierungen über alle Matches / Turniere. Klick auf einen Spieler
              zeigt Details pro Turnier.
            </div>
          </div>
          <Button className="ml-auto !h-8 !px-2 !text-[11px] !leading-none" variant="secondary" onClick={load} disabled={loading}>
            Neu laden
          </Button>
        </div>
      </CardHeader>

      <CardBody>
        {error && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-neutral-500">Lade Match-Statistik…</div>
        ) : sortedRows.length === 0 ? (
          <div className="text-sm text-neutral-500">
            Noch keine Match-Daten vorhanden.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b">
                  <th className="py-1 pr-2">Platz</th>
                  <th className="py-1 pr-2">Spieler</th>
                  <th className="py-1 pr-2 text-right">
                    {sortLabel("matches", "Matches")}
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {sortLabel("firstPlaces", "1. Platz")}
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {sortLabel("secondPlaces", "2. Platz")}
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {sortLabel("thirdPlaces", "3. Platz")}
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {sortLabel("fourthPlaces", "4. Platz")}
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {sortLabel("avgPosition", "Ø-Platz")}
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {sortLabel("winrate", "Winrate")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedRows.map((row, idx) => {
                  const place = idx + 1;
                  const medal =
                    place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";

                  const id = row.profileId ?? null;
                  const isOpen = !!id && openProfileId === id;

                  const details = id ? detailsByProfile[id] ?? [] : [];
                  const isLoadingDetails = id ? detailsLoading[id] === true : false;
                  const err = id ? detailsError[id] ?? null : null;

                  return (
                    <Fragment key={id ?? row.name + idx}>
                      {/* Hauptzeile */}
                      <tr
                        className={
                          "border-b last:border-0 hover:bg-neutral-50/70 " +
                          (id ? "cursor-pointer" : "cursor-default")
                        }
                        onClick={() => {
                          if (!id) return;
                          toggleOpen(id);
                        }}
                        title={id ? "Klicken für Turnier-Details" : "Kein profileId vorhanden"}
                      >
                        <td className="py-1 pr-2 text-sm tabular-nums text-neutral-500 text-left">
                          {medal ? <span>{medal}</span> : <span>{place}.</span>}
                        </td>

<td className="py-1 pr-2">
  <div className="flex items-center justify-between gap-2 min-w-0">
    <PlayerPill
      player={{
        name: row.name,
        color: row.color ?? null,
        icon: row.icon ?? null,
        avatarUrl: row.avatar_url ?? null,
      }}
    />

    {/* 🔽 Pfeil rechts (nur wenn profileId vorhanden) */}
    {id ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // wichtig: verhindert "Doppelklick-Effekt" über die ganze Zeile
          toggleOpen(id);
        }}
        className={
          "ml-2 inline-flex h-8 w-8 items-center justify-center rounded-md " +
          "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 " +
          "transition-transform duration-200 " +
          (isOpen ? "rotate-180" : "rotate-0")
        }
        aria-label={isOpen ? "Details schließen" : "Details öffnen"}
        title={isOpen ? "Schließen" : "Öffnen"}
      >
        ▾
      </button>
    ) : null}
  </div>
</td>


                        <td className="py-1 pr-2 text-right tabular-nums">{row.matches}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{row.firstPlaces}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{row.secondPlaces}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{row.thirdPlaces}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{row.fourthPlaces}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {row.avgPosition != null ? row.avgPosition.toFixed(2) : "—"}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {row.winrate.toFixed(1)} %
                        </td>
                      </tr>

                      {/* Detailzeile */}
{isOpen && (
  <>
    {/* Status-Zeile (Loading/Error/Empty) */}
    {isLoadingDetails ? (
      <tr className="border-b bg-neutral-50/50">
        <td colSpan={9} className="py-2 px-2 text-sm text-neutral-500">
          Lade Turnier-Details…
        </td>
      </tr>
    ) : err ? (
      <tr className="border-b bg-neutral-50/50">
        <td colSpan={9} className="py-2 px-2 text-sm text-red-600">
          {err}
        </td>
      </tr>
    ) : details.length === 0 ? (
      <tr className="border-b bg-neutral-50/50">
        <td colSpan={9} className="py-2 px-2 text-sm text-neutral-500">
          Keine Turnier-Details vorhanden.
        </td>
      </tr>
    ) : (
      <>
        {/* Detail-Zeilen (WICHTIG: gleiche 9 Spalten wie oben) */}
        {details.map((d: any, i: number) => {
          const catRaw = d.tournamentCategory ?? d.category ?? null;
          const cat =
            catRaw && String(catRaw).trim().length > 0
              ? String(catRaw).trim()
              : null;

          const created = d.tournamentCreatedAt ?? d.created_at ?? null;
          const dt = created ? new Date(created).toLocaleDateString("de-DE") : null;

          return (
            <tr
              key={(d.tournamentId ?? d.tournamentCode ?? i) + "-" + i}
              className="border-b last:border-0 bg-neutral-50 hover:bg-neutral-100 transition-colors"
            >
              {/* Spalte 1 (Platz) leer lassen für Alignment */}
              <td className="py-2 pr-2 text-sm tabular-nums text-neutral-500 text-left" />

              {/* Spalte 2 (Spieler) wird Turniername + Meta */}
              <td className="py-2 pr-2">
                <div className="flex flex-col">
                  <span className="font-medium">{d.tournamentName ?? "Turnier"}</span>
                  <span className="text-[11px] text-neutral-500">
                    {cat ?? "—"}
                    {dt ? ` • ${dt}` : ""}
                  </span>
                </div>
              </td>

              {/* Spalte 3-9 exakt wie Haupttabelle */}
              <td className="py-2 pr-2 text-right tabular-nums">{d.matches ?? 0}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{d.firstPlaces ?? 0}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{d.secondPlaces ?? 0}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{d.thirdPlaces ?? 0}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{d.fourthPlaces ?? 0}</td>
              <td className="py-2 pr-2 text-right tabular-nums">
                {d.avgPosition != null ? Number(d.avgPosition).toFixed(2) : "—"}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">
                {d.winrate != null ? Number(d.winrate).toFixed(1) + " %" : "—"}
              </td>
            </tr>
          );
        })}
      </>
    )}
  </>
)}

                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

    {/* 🎬 Animation für Detailzeilen */}
    <style jsx global>{`
      @keyframes mpDetailIn {
        from {
          opacity: 0;
          transform: translateY(-6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `}</style>

    </Card>
  );
}



function LeaderboardsTab({ isAdmin }: { isAdmin: boolean }) {
  const [subTab, setSubTab] = useState<
    "elo" | "tournaments" | "series" | "matches"
  >("elo");

  // --- Elo ---
  const [eloRows, setEloRows] = useState<EloLeaderboardEntry[]>([]);
  const [eloLoading, setEloLoading] = useState(false);
  const [eloError, setEloError] = useState<string | null>(null);

  // NEU:
const [tournamentSortKey, setTournamentSortKey] =
  useState<TournamentSortKey>("tournamentPoints"); // Standardsortierung
const [tournamentSortDir, setTournamentSortDir] =
  useState<SortDir>("desc");

  // --- Turniererfolge ---
type TournamentSuccessRow = {
  profileId: string | null;
  name: string;
  avatar_url: string | null;
  color: string | null;
  icon: string | null;
  tournamentsPlayed: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
  avgPosition: number | null;      // Ø-Platz Turnier
  tournamentWinrate: number;       // in %
  superFinalWins: number;
  tournamentPoints: number; // 👈 NEU: Turnierpunkte
};

  const [tournamentRows, setTournamentRows] = useState<TournamentSuccessRow[]>(
    []
  );
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [tournamentError, setTournamentError] = useState<string | null>(null);

    // 🔍 Filter-States für Turniererfolge

const [tournamentFilterCategory, setTournamentFilterCategory] = useState("");
const [tournamentFilterName, setTournamentFilterName] = useState("");
const [tournamentFilterFrom, setTournamentFilterFrom] = useState("");
const [tournamentFilterTo, setTournamentFilterTo] = useState("");

type GlobalPreset = {
  id: string;
  context: string;
  label: string;
  category: string;
  name: string;
  date_from: string;
  date_to: string;
  pinned: boolean;
  sort_order: number;
  created_at: string;
};

const GLOBAL_CONTEXT = "tournament_success";

const [globalPresets, setGlobalPresets] = useState<GlobalPreset[]>([]);
const [globalPresetsLoading, setGlobalPresetsLoading] = useState(false);

async function loadGlobalPresets() {
  setGlobalPresetsLoading(true);
  try {
    const res = await fetch(
      `/api/filter-presets/list?context=${encodeURIComponent(GLOBAL_CONTEXT)}&ts=${Date.now()}`,
      { cache: "no-store" }
    );
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("global presets load failed:", j?.error);
      setGlobalPresets([]);
    } else {
      setGlobalPresets(j.presets ?? []);
    }
  } catch (e) {
    console.error("global presets network error:", e);
    setGlobalPresets([]);
  } finally {
    setGlobalPresetsLoading(false);
  }
}

async function deleteGlobalPreset(presetId: string) {
  if (!confirm("Globalen Filter wirklich löschen?")) return;

  try {
    const res = await fetch(`/api/filter-presets/delete?ts=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ presetId }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error ?? "Löschen fehlgeschlagen");
      return;
    }

    // 🔄 neu laden
    await loadGlobalPresets();
  } catch (e) {
    console.error(e);
    alert("Löschen fehlgeschlagen (Netzwerkfehler)");
  }
}


function applyGlobalPreset(p: GlobalPreset) {
  applyTournamentFiltersWith({
    category: p.category || "",
    name: p.name || "",
    from: p.date_from || "",
    to: p.date_to || "",
  });
}

async function saveCurrentFilterAsGlobalPreset() {
  try {
    const payload = {
      context: GLOBAL_CONTEXT,
      category: tournamentFilterCategory.trim(),
      name: tournamentFilterName.trim(),
      date_from: tournamentFilterFrom || "",
      date_to: tournamentFilterTo || "",
      // label optional -> wird serverseitig sinnvoll gebaut
    };

    const res = await fetch(`/api/filter-presets/create?ts=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error ?? "Konnte globales Preset nicht speichern.");
      return;
    }

    // neu laden, damit der Chip direkt erscheint
    await loadGlobalPresets();
  } catch (e) {
    console.error(e);
    alert("Konnte globales Preset nicht speichern (Netzwerkfehler?).");
  }
}


  const hasTournamentFilters =
    tournamentFilterCategory.trim() !== "" ||
    tournamentFilterName.trim() !== "" ||
    tournamentFilterFrom !== "" ||
    tournamentFilterTo !== "";

  function resetTournamentFilters() {
    setTournamentFilterCategory("");
    setTournamentFilterName("");
    setTournamentFilterFrom("");
    setTournamentFilterTo("");

    // zusätzlich:
    setFilterTournamentList(null);
  }

function applyTournamentFiltersWith(filters: {
  category: string;
  name: string;
  from: string;
  to: string;
}) {
  const cat = filters.category.trim();
  const name = filters.name.trim();
  const from = filters.from || "";
  const to = filters.to || "";

  // UI-States setzen (damit Inputs/Chips anzeigen was aktiv ist)
  setTournamentFilterCategory(cat);
  setTournamentFilterName(name);
  setTournamentFilterFrom(from);
  setTournamentFilterTo(to);

  // Hard reset wie gewünscht
  setTournamentRows([]);
  setFilterTournamentList(null);

  // ✅ Wichtig: direkt mit den Werten laden (nicht “aus State lesen”)
  loadTournamentSuccessWith(cat, name, from, to);
  loadFilteredTournamentListWith(cat, name, from, to);
}

async function loadFilteredTournamentListWith(
  category: string,
  search: string,
  from: string,
  to: string
) {
  try {
    const res = await fetch(`/api/tournaments/list?ts=${Date.now()}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    const all: any[] = j.tournaments ?? [];

    let filtered = all.filter((t) => t.status === "finished");

    if (category.trim()) {
      const cat = category.trim().toLowerCase();
      filtered = filtered.filter((t) =>
        (t.category ?? "").toLowerCase().includes(cat)
      );
    }

    if (search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = filtered.filter((t) =>
        (t.name ?? "").toLowerCase().includes(s)
      );
    }

    if (from) {
      const fromDate = new Date(from);
      filtered = filtered.filter((t) => t.created_at && new Date(t.created_at) >= fromDate);
    }

    if (to) {
      const toDate = new Date(to);
      filtered = filtered.filter((t) => t.created_at && new Date(t.created_at) <= toDate);
    }

    setFilterTournamentList(
      filtered.map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        category: t.category ?? null,
        status: t.status ?? null,
        created_at: t.created_at ?? null,
      }))
    );
  } catch (e) {
    console.error("loadFilteredTournamentListWith error:", e);
    setFilterTournamentList([]);
  }
}





  // ---------------- Schnellfilter (Top 10) ----------------
type TournamentFilterPreset = {
  key: string;              // eindeutiger Key aus den Filterwerten
  label: string;            // Anzeige im Chip
  category: string;
  name: string;
  from: string;
  to: string;
  count: number;            // wie oft genutzt
  lastUsed: number;         // timestamp
};

const PRESETS_KEY = "pinball:tournamentFilterPresets:v1";

const [tournamentPresets, setTournamentPresets] = useState<TournamentFilterPreset[]>([]);

useEffect(() => {
  // nur im Browser
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) setTournamentPresets(arr);
  } catch {
    // ignore
  }
}, []);

function formatPresetLabel(cat: string, name: string, from: string, to: string) {
  const parts: string[] = [];
  if (cat.trim()) parts.push(cat.trim());
  if (name.trim()) parts.push(`„${name.trim()}“`);
  if (from || to) parts.push(`${from || "…"} → ${to || "…"}`);
  return parts.length ? parts.join(" · ") : "Alle Turniere";
}

function makePresetKey(cat: string, name: string, from: string, to: string) {
  return `${cat.trim().toLowerCase()}|${name.trim().toLowerCase()}|${from || ""}|${to || ""}`;
}

function savePresets(next: TournamentFilterPreset[]) {
  setTournamentPresets(next);
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function deletePreset(key: string) {
  const next = tournamentPresets.filter((p) => p.key !== key);
  savePresets(next);
}

function presetTooltip(p: any) {
  const cat = (p.category || "").trim();
  const name = (p.name || "").trim();

  // globale Presets: date_from / date_to
  // lokale Presets: from / to
  const from = (p.date_from || p.from || "").trim();
  const to = (p.date_to || p.to || "").trim();

  const lines: string[] = [];

  if (cat) lines.push(`Kategorie: ${cat}`);
  if (name) lines.push(`Name: ${name}`);
  if (from || to) lines.push(`Zeitraum: ${from || "…"} → ${to || "…"}`);

  if (p.count != null) {
    lines.push(`Benutzt: ${p.count}×`);
  }

  if (lines.length === 0) {
    lines.push("Kein Filter (zeigt alles)");
  }

  return lines.join("\n");
}



function recordPresetUse() {
  const cat = tournamentFilterCategory.trim();
  const name = tournamentFilterName.trim();
  const from = tournamentFilterFrom;
  const to = tournamentFilterTo;

  const key = makePresetKey(cat, name, from, to);
  const label = formatPresetLabel(cat, name, from, to);

  const now = Date.now();

  const existing = tournamentPresets.find((p) => p.key === key);

  let next: TournamentFilterPreset[];
  if (existing) {
    next = tournamentPresets.map((p) =>
      p.key === key ? { ...p, count: p.count + 1, lastUsed: now, label } : p
    );
  } else {
    next = [
      { key, label, category: cat, name, from, to, count: 1, lastUsed: now },
      ...tournamentPresets,
    ];
  }

  // Top 10: zuerst nach Häufigkeit, dann nach zuletzt benutzt
  next.sort((a, b) => (b.count - a.count) || (b.lastUsed - a.lastUsed));
  next = next.slice(0, 5);

  savePresets(next);
}

function applyPreset(p: TournamentFilterPreset) {
  applyTournamentFiltersWith({
    category: p.category || "",
    name: p.name || "",
    from: p.from || "",
    to: p.to || "",
  });

  // Nutzung hochzählen (kann bleiben wie es ist)
  const now = Date.now();
  const next = tournamentPresets
    .map((x) => (x.key === p.key ? { ...x, count: x.count + 1, lastUsed: now } : x))
    .sort((a, b) => (b.count - a.count) || (b.lastUsed - a.lastUsed))
    .slice(0, 10);

  savePresets(next);
}




  type FilteredTournamentInfo = {
  id: string;
  name: string;
  code: string;
  category: string | null;
  status: string | null;
  created_at: string | null;
};

const [filterTournamentList, setFilterTournamentList] =
  useState<FilteredTournamentInfo[] | null>(null);


  // --- Match-Historie ---
  type MatchRow = {
    id: string;
    playedAt: string | null;
    tournamentName: string;
    tournamentCode: string;
    roundNumber: number | null;
    machineName: string | null;
    winnerName: string;
  };

  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

{/*
useEffect(() => {
  if (subTab === "elo") {
    loadEloLeaderboard();
  } else if (subTab === "tournaments") {
    loadTournamentSuccess();
  } else if (subTab === "matches") {
    loadMatchHistory();
  }
}, [subTab]);
*/}

useEffect(() => {
  if (subTab === "elo") {
    setEloRows([]);          // HARD RESET
    loadEloLeaderboard();
  } else if (subTab === "tournaments") {
    setTournamentRows([]);   // HARD RESET
    loadTournamentSuccess();
    loadGlobalPresets();
  } else if (subTab === "matches") {
    setMatchRows([]);        // HARD RESET
    loadMatchHistory();
  }
}, [subTab]);


  // ---------------- Elo-Leaderboard ----------------
  async function loadEloLeaderboard() {
    setEloLoading(true);
    setEloError(null);
    setEloRows([]); // Hard reset
    try {
      const res = await fetch(`/api/leaderboards/elo?ts=${Date.now()}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEloError(j.error ?? "Konnte Elo-Leaderboard nicht laden.");
        setEloRows([]);
      } else {
        setEloRows(j.rows ?? []);
      }
    } catch {
      setEloError("Konnte Elo-Leaderboard nicht laden (Netzwerkfehler?).");
      setEloRows([]);
    } finally {
      setEloLoading(false);
    }
  }

  // ---------------- Turniererfolge ----------------
  {/*}
async function loadTournamentSuccess() {
  setTournamentLoading(true);
  setTournamentError(null);

  // Hard Reset – alte Daten weg
  setTournamentRows([]);

  try {
    const res = await fetch(`/api/leaderboards/tournaments?ts=${Date.now()}`, {
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setTournamentError(
        j.error ?? "Konnte Turniererfolge-Leaderboard nicht laden."
      );
      setTournamentRows([]);
    } else {
      // kleine Debug-Hilfe:
      console.log("tournament rows from API:", j.rows?.length, j.rows);
      setTournamentRows(j.rows ?? []);
    }
  } catch {
    setTournamentError(
      "Konnte Turniererfolge-Leaderboard nicht laden (Netzwerkfehler?)."
    );
    setTournamentRows([]);
  } finally {
    setTournamentLoading(false);
  }
}
  */}
    // ---------------- Turniererfolge ----------------
async function loadTournamentSuccess(ignoreFilters = false) {
    setTournamentLoading(true);
    setTournamentError(null);

    // Hard Reset – alte Daten weg
    setTournamentRows([]);

    try {
      // 🔗 Query-Params aufbauen (ts + Filter)
      const params = new URLSearchParams();
      params.set("ts", String(Date.now()));

      // Wenn ignoreFilters = true, werden alle Filter ignoriert
      const cat = ignoreFilters ? "" : tournamentFilterCategory.trim();
      const name = ignoreFilters ? "" : tournamentFilterName.trim();
      const from = ignoreFilters ? "" : tournamentFilterFrom;
      const to = ignoreFilters ? "" : tournamentFilterTo;

      if (cat) {
        params.set("category", cat);
      }
      if (name) {
        params.set("search", name);
      }
      if (from) {
        params.set("from", from);
      }
      if (to) {
        params.set("to", to);
      }

      const url = `/api/leaderboards/tournaments?${params.toString()}`;


      const res = await fetch(url, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setTournamentError(
          j.error ?? "Konnte Turniererfolge-Leaderboard nicht laden."
        );
        setTournamentRows([]);
      } else {
        console.log("tournament rows from API:", j.rows?.length, j.rows);
        setTournamentRows(j.rows ?? []);
      }
    } catch {
      setTournamentError(
        "Konnte Turniererfolge-Leaderboard nicht laden (Netzwerkfehler?)."
      );
      setTournamentRows([]);
    } finally {
      setTournamentLoading(false);
    }
  }

async function loadTournamentSuccessWith(
  category: string,
  search: string,
  from: string,
  to: string
) {
  setTournamentLoading(true);
  setTournamentError(null);
  setTournamentRows([]);

  try {
    const params = new URLSearchParams();
    params.set("ts", String(Date.now()));

    if (category) params.set("category", category);
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const url = `/api/leaderboards/tournaments?${params.toString()}`;

    const res = await fetch(url, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setTournamentError(j.error ?? "Konnte Turniererfolge-Leaderboard nicht laden.");
      setTournamentRows([]);
    } else {
      setTournamentRows(j.rows ?? []);
    }
  } catch {
    setTournamentError("Konnte Turniererfolge-Leaderboard nicht laden (Netzwerkfehler?).");
    setTournamentRows([]);
  } finally {
    setTournamentLoading(false);
  }
}



async function loadFilteredTournamentList(
  catRaw = "",
  nameRaw = "",
  fromRaw = "",
  toRaw = ""
) {
  try {
    const res = await fetch(`/api/tournaments/list?ts=${Date.now()}`, {
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));
    const all: any[] = j.tournaments ?? [];

    // nur beendete Turniere berücksichtigen
    let filtered = all.filter((t) => t.status === "finished");

    const cat = catRaw.trim().toLowerCase();
    const search = nameRaw.trim().toLowerCase();
    const from = fromRaw;
    const to = toRaw;

    if (cat) {
      filtered = filtered.filter((t) =>
        (t.category ?? "").toLowerCase().includes(cat)
      );
    }

    if (search) {
      filtered = filtered.filter((t) =>
        (t.name ?? "").toLowerCase().includes(search)
      );
    }

    if (from) {
      const fromDate = new Date(from);
      filtered = filtered.filter(
        (t) => t.created_at && new Date(t.created_at) >= fromDate
      );
    }

    if (to) {
      const toDate = new Date(to);
      filtered = filtered.filter(
        (t) => t.created_at && new Date(t.created_at) <= toDate
      );
    }

    setFilterTournamentList(
      filtered.map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        category: t.category ?? null,
        status: t.status ?? null,
        created_at: t.created_at ?? null,
      }))
    );
  } catch (e) {
    console.error("loadFilteredTournamentList error:", e);
    setFilterTournamentList([]);
  }
}





function toggleTournamentSort(key: TournamentSortKey) {
  setTournamentSortKey((prevKey) => {
    // Wenn dieselbe Spalte erneut geklickt wird:
    if (prevKey === key) {
      if (key === "avgPosition") {
        // Ø-Platz: IMMER aufsteigend, nie toggeln
        setTournamentSortDir("asc");
      } else {
        // Alle anderen Spalten: Richtung umdrehen
        setTournamentSortDir((prevDir) =>
          prevDir === "asc" ? "desc" : "asc"
        );
      }
      return prevKey;
    }

    // Wenn eine NEUE Spalte ausgewählt wird:
    // Ø-Platz: Standard = aufsteigend
    // alle anderen: Standard = absteigend
    const defaultDir = key === "avgPosition" ? "asc" : "desc";
    setTournamentSortDir(defaultDir);
    return key;
  });
}


function tournamentSortLabel(key: TournamentSortKey, label: string) {
  const isActive = tournamentSortKey === key;
  const arrow = isActive
    ? tournamentSortDir === "asc"
      ? "↑"
      : "↓"
    : "";
  return (
    <button
      type="button"
      onClick={() => toggleTournamentSort(key)}
      className={
        "inline-flex items-center gap-1" +
        (isActive ? " text-neutral-900 font-semibold" : " text-neutral-600")
      }
    >
      <span>{label}</span>
      {arrow && <span className="text-xs">{arrow}</span>}
    </button>
  );
}

const sortedTournamentRows = useMemo(() => {
  const copy = tournamentRows.slice();
  copy.sort((a, b) => {
    const dir = tournamentSortDir === "asc" ? 1 : -1;

    const getVal = (r: TournamentSuccessRow) => {
      switch (tournamentSortKey) {
        case "tournamentsPlayed":
          return r.tournamentsPlayed;
        case "firstPlaces":
          return r.firstPlaces;
        case "secondPlaces":
          return r.secondPlaces;
        case "thirdPlaces":
          return r.thirdPlaces;
        case "tournamentWinrate":
          return r.tournamentWinrate ?? 0;
        case "avgPosition":
          // null nach hinten
          return r.avgPosition ?? 9999;
        case "tournamentPoints":
        default:
          return r.tournamentPoints ?? 0;
      }
    };

    const va = getVal(a);
    const vb = getVal(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.name.localeCompare(b.name);
  });
  return copy;
}, [tournamentRows, tournamentSortKey, tournamentSortDir]);



  // ---------------- Match-Historie ----------------
async function loadMatchHistory() {
  setMatchLoading(true);
  setMatchError(null);

  // Hard Reset – alte Daten weg
  setMatchRows([]);

  try {
    const res = await fetch(`/api/leaderboards/matches?ts=${Date.now()}`, {
      cache: "no-store",
    });
    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMatchError(j.error ?? "Konnte Match-Historie nicht laden.");
      setMatchRows([]);
    } else {
      console.log("match rows from API:", j.rows?.length, j.rows);
      setMatchRows(j.rows ?? []);
    }
  } catch {
    setMatchError("Konnte Match-Historie nicht laden (Netzwerkfehler?).");
    setMatchRows([]);
  } finally {
    setMatchLoading(false);
  }
}


  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Statistiken</div>
            <div className="text-xs text-neutral-500">
              Leaderboards & Rekorde über alle Turniere
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSubTab("elo")}
              className={
                "rounded-full px-3 py-1 border text-xs font-medium " +
                (subTab === "elo"
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50")
              }
            >
              Elo-Leaderboard
            </button>
            <button
              type="button"
              onClick={() => setSubTab("tournaments")}
              className={
                "rounded-full px-3 py-1 border text-xs font-medium " +
                (subTab === "tournaments"
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50")
              }
            >
              Turniererfolge
            </button>
            <button
              type="button"
              onClick={() => setSubTab("matches")}
              className={
                "rounded-full px-3 py-1 border text-xs font-medium " +
                (subTab === "matches"
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50")
              }
            >
              Matches
            </button>
            <button
              type="button"
              onClick={() => setSubTab("series")}
              className={
                "rounded-full px-3 py-1 border text-xs font-medium " +
                (subTab === "series"
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50")
              }
            >
              Serien / Seasons
            </button>
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {/* ---------------- Elo-Tab ---------------- */}
        {subTab === "elo" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-700">
                Elo-Leaderboard (global)
              </div>
              <Button
                className="ml-auto !h-8 !px-2 !text-[11px] !leading-none"
                variant="secondary"
                onClick={loadEloLeaderboard}
                disabled={eloLoading}
              >
                Neu laden
              </Button>
            </div>

            {eloError && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {eloError}
              </div>
            )}

            {eloLoading ? (
              <div className="text-sm text-neutral-500">
                Lade Elo-Leaderboard…
              </div>
            ) : eloRows.length === 0 ? (
              <div className="text-sm text-neutral-500">
                Noch keine Daten verfügbar.{" "}
                <span className="text-xs text-neutral-400">
                  (Backend-Route <code>/api/leaderboards/elo</code> schon
                  implementiert?)
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500 border-b">
                      <th className="py-1 pr-2">Platz</th>
                      <th className="py-1 pr-2">Spieler</th>
                      <th className="py-1 pr-2 text-right">Elo</th>
                      <th className="py-1 pr-2 text-right">Trend</th>
                      <th className="py-1 pr-2 text-right">Turniere</th>
                      <th className="py-1 pr-2 text-right">Matches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eloRows.map((row, idx) => {
                      const place = idx + 1;
                      const medal =
                        place === 1
                          ? "🥇"
                          : place === 2
                          ? "🥈"
                          : place === 3
                          ? "🥉"
                          : "";

                      const trend = row.trendLastN ?? null;
                      const hasTrend =
                        typeof trend === "number" && trend !== 0;
                      const trendClass = hasTrend
                        ? trend > 0
                          ? "text-emerald-600"
                          : "text-red-600"
                        : "text-neutral-400";

                      return (
                        <tr
                          key={row.profileId}
                          className="border-b last:border-0 hover:bg-neutral-50/70"
                        >
      <td className="py-1 pr-2 text-sm tabular-nums text-neutral-500 text-left">
        {medal ? (
          <span>{medal}</span>
        ) : (
          <span>{place}.</span>
        )}
      </td>
                          <td className="py-1 pr-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <PlayerPill
                                player={{
                                  name: row.name,
                                  color: row.color ?? null,
                                  icon: row.icon ?? null,
                                  avatarUrl: row.avatar_url ?? null,
                                }}
                              />
                            </div>
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums font-semibold">
                            {Math.round(row.rating)}
                          </td>
                          <td className="py-1 pr-2 text-right text-xs">
                            {hasTrend ? (
                              <span
                                className={
                                  "tabular-nums font-semibold " + trendClass
                                }
                              >
                                {trend! > 0 ? "+" : ""}
                                {Math.round(trend!)} Elo
                              </span>
                            ) : (
                              <span className="text-neutral-400">–</span>
                            )}
                          </td>
                          <td className="py-1 pr-2 text-right text-xs tabular-nums">
                            {row.tournamentsPlayed}
                          </td>
                          <td className="py-1 pr-2 text-right text-xs tabular-nums">
                            {row.matchesPlayed}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ---------------- Turniererfolge-Tab ---------------- */}
        {subTab === "tournaments" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-neutral-700">
                  Turniererfolge
                </div>
                <div className="text-xs text-neutral-500">
                  Ranking nach Turnierteilnahmen, Siegen & Podien über alle
                  Turniere.
                </div>
              </div>

            </div>






            {tournamentError && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                {tournamentError}
              </div>
            )}

            {tournamentLoading ? (
              <div className="text-sm text-neutral-500">
                Lade Turniererfolge…
              </div>
            ) : tournamentRows.length === 0 && hasTournamentFilters ? (

  <div className="flex items-center gap-3">
    <div className="text-sm text-neutral-500">
      Keine Ergebnisse für die aktuellen Filter.
    </div>

    <Button
      variant="secondary"
      className="h-8 px-2 text-[11px] leading-none"
      onClick={() => {
        resetTournamentFilters();     // Filter-States leeren
        loadTournamentSuccess(true);  // ohne Filter laden
      }}
      disabled={tournamentLoading}
    >
      Neu laden
    </Button>
  </div>


            ) : tournamentRows.length === 0 ? (
              <div className="text-sm text-neutral-500">
                Noch keine Daten verfügbar.{" "}
                <span className="text-xs text-neutral-400">
                  (Backend-Route <code>/api/leaderboards/tournaments</code>{" "}
                  schon implementiert?)
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="max-h-80 overflow-y-auto rounded-2xl  bg-white">


{/* 🌍 Globale Filter (für alle) */}
<div className="mt-3 mb-5 flex flex-wrap items-center gap-2">
  <div className="mr-1 text-[11px] font-semibold text-neutral-600">
    🌍 Globale Filter:
  </div>

  {globalPresetsLoading && (
    <div className="text-[11px] text-neutral-500">lade…</div>
  )}

  {!globalPresetsLoading && globalPresets.length === 0 && (
    <div className="text-[11px] text-neutral-500">keine Presets</div>
  )}

{globalPresets.map((p, idx) => {
  const colors = [
    "bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200",
    "bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200",
    "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200",
    "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200",
    "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200",
    "bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200",
  ];
  const cls = colors[idx % colors.length];

  return (
    <div
      key={p.id}
      className={
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition " +
        cls
      }
      title={presetTooltip(p)}
    >
      {/* Klickbarer Teil */}
      <button
        type="button"
        onClick={() => applyGlobalPreset(p)}
        className="flex items-center gap-2"
      >
        {p.label}
      </button>

      {/* ✕ nur für Admin */}
      {isAdmin && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteGlobalPreset(p.id);
          }}
          className="ml-2 rounded-full px-1 hover:bg-white/40"
          title="Globalen Filter löschen"
        >
          ✕
        </button>
      )}
    </div>
  );
})}


  {/* 🌍 Global speichern (nur Admin) */}
  {isAdmin && (
    <button
      type="button"
      onClick={saveCurrentFilterAsGlobalPreset}
      className="ml-2 inline-flex items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-50"
      title="Aktuellen Filter als globalen Chip speichern"
    >
      🌍 Global speichern
    </button>
  )}
</div>



<div className="mt-1 mb-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
                <table className="w-full text-sm">
<thead>
  <tr className="text-left text-xs text-neutral-500 border-b">
    <th className="py-1 pr-2">Platz</th>
    <th className="py-1 pr-2">Spieler</th>
    <th className="py-1 pr-2 text-right">
      {tournamentSortLabel("tournamentsPlayed", "Turniere")}
    </th>
    <th className="py-1 pr-2 text-right">
      {tournamentSortLabel("firstPlaces", "1. Platz")}
    </th>
    <th className="py-1 pr-2 text-right">
      {tournamentSortLabel("secondPlaces", "2. Platz")}
    </th>
    <th className="py-1 pr-2 text-right">
      {tournamentSortLabel("thirdPlaces", "3. Platz")}
    </th>
    <th className="py-1 pr-2 text-right">
      {tournamentSortLabel("avgPosition", "Ø-Platz")}
    </th>
    <th className="py-1 pr-2 text-right">
      {tournamentSortLabel("tournamentWinrate", "Winrate")}
    </th>
    <th className="py-1 pr-2 text-right">
      {tournamentSortLabel("tournamentPoints", "Turnierpunkte")}
    </th>
  </tr>
</thead>

<tbody>
  {sortedTournamentRows.map((row, idx) => {
    const place = idx + 1;
    const medal =
      place === 1
        ? "🥇"
        : place === 2
        ? "🥈"
        : place === 3
        ? "🥉"
        : "";

    return (
      <tr
        key={row.profileId ?? row.name + idx}
        className="border-b last:border-0 hover:bg-neutral-50/70"
      >
      <td className="py-1 pr-2 text-sm tabular-nums text-neutral-500 text-left">
        {medal ? (
          <span>{medal}</span>
        ) : (
          <span>{place}.</span>
        )}
      </td>
        <td className="py-1 pr-2">
          <div className="flex items-center gap-2 min-w-0">
            <PlayerPill
              player={{
                name: row.name,
                color: row.color,
                icon: row.icon,
                avatarUrl: row.avatar_url,
              }}
            />
          </div>
        </td>
        <td className="py-1 pr-2 text-right tabular-nums">
          {row.tournamentsPlayed}
        </td>
        <td className="py-1 pr-2 text-right tabular-nums">
          {row.firstPlaces}
        </td>
        <td className="py-1 pr-2 text-right tabular-nums">
          {row.secondPlaces}
        </td>
        <td className="py-1 pr-2 text-right tabular-nums">
          {row.thirdPlaces}
        </td>
        <td className="py-1 pr-2 text-right tabular-nums">
          {row.avgPosition != null ? row.avgPosition.toFixed(2) : "—"}
        </td>
        <td className="py-1 pr-2 text-right tabular-nums">
          {row.tournamentWinrate.toFixed(1)} %
        </td>
        <td className="py-1 pr-2 text-right tabular-nums font-semibold text-amber-600">
          {row.tournamentPoints}
        </td>
      </tr>
    );
  })}
</tbody>




                </table>
</div>

                </div>



                

            {/* Filter-Leiste unter der Tabelle */}
            <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
 
{/* Zusatz-Tabelle: berücksichtigte Turniere */}
{filterTournamentList && filterTournamentList.length > 0 && (
  <div className="mt-1 mb-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
    <div className="mb-2 text-xs font-semibold text-neutral-600">
      Berücksichtigte Turniere ({filterTournamentList.length})
    </div>

    <div className="max-h-48 overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-neutral-500 border-b">
            <th className="py-1 pr-2">Name</th>
            <th className="py-1 pr-2">Kategorie</th>
            <th className="py-1 pr-2">Code</th>
            <th className="py-1 pr-2">Status</th>
            <th className="py-1 pr-2">Datum</th>
          </tr>
        </thead>
        <tbody>
          {filterTournamentList.map((t) => (
            <tr
              key={t.id}
              className="border-b last:border-0 hover:bg-neutral-50/70"
            >
              <td className="py-1 pr-2">{t.name}</td>
              <td className="py-1 pr-2 text-neutral-600">
                {t.category || "—"}
              </td>
              <td className="py-1 pr-2 tabular-nums text-neutral-500">
                {t.code}
              </td>
              <td className="py-1 pr-2 text-neutral-500">
                {t.status === "finished" ? "Beendet" : "Laufend"}
              </td>
              <td className="py-1 pr-2 text-neutral-500">
                {t.created_at
                  ? new Date(t.created_at).toLocaleDateString("de-DE")
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)}



 
            {/* 🔍 Filterzeile */}
            <div className="flex flex-wrap items-end gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-neutral-500">
                  Kategorie
                </span>
                <Input
                  value={tournamentFilterCategory}
                  onChange={(e) => setTournamentFilterCategory(e.target.value)}
                  placeholder="z.B. Liga 2025"
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-neutral-500">
                  Turniername enthält
                </span>
                <Input
                  value={tournamentFilterName}
                  onChange={(e) => setTournamentFilterName(e.target.value)}
                  placeholder="z.B. Monatsfinale"
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-neutral-500">Von</span>
                <Input
                  type="date"
                  value={tournamentFilterFrom}
                  onChange={(e) => setTournamentFilterFrom(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-neutral-500">Bis</span>
                <Input
                  type="date"
                  value={tournamentFilterTo}
                  onChange={(e) => setTournamentFilterTo(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <Button
                variant="secondary"
                className="ml-auto !h-8 !px-2 !text-[11px] !leading-none"
                onClick={() => {
                  resetTournamentFilters();      // Filter-States leeren
                  loadTournamentSuccess(true);   // ohne Filter laden
                }}
                disabled={tournamentLoading}
              >
                Neu laden
              </Button>

              <Button
                variant="secondary"
                className="ml-auto !h-8 !px-2 !text-[11px] !leading-none"
                onClick={() => {
                  recordPresetUse();
                  applyTournamentFiltersWith({
                    category: tournamentFilterCategory,
                    name: tournamentFilterName,
                    from: tournamentFilterFrom,
                    to: tournamentFilterTo,
                  });
                }}
                disabled={tournamentLoading}
              >
                Filter anwenden
              </Button>
            </div>









{/* Schnellfilter-Chips (Top 10) */}
{/*}
{tournamentPresets.length > 0 && (
  <div className="mt-3 flex flex-wrap items-center gap-2">
    <div className="mr-1 text-[11px] font-semibold text-neutral-600">
      Schnellfilter:
    </div>

    {tournamentPresets.map((p, idx) => {
      const colors = [
        "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200",
        "bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200",
        "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200",
        "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200",
        "bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200",
        "bg-cyan-100 text-cyan-800 border-cyan-200 hover:bg-cyan-200",
        "bg-lime-100 text-lime-800 border-lime-200 hover:bg-lime-200",
        "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200",
        "bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200",
        "bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200",
      ];
      const cls = colors[idx % colors.length];

return (
  <div
    key={p.key}
    className={
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium transition " +
      cls
    }
    title={presetTooltip(p)}
  >
  
    <button
      type="button"
      onClick={() => applyPreset(p)}
      className="inline-flex items-center gap-2"
    >
      <span className="truncate max-w-[220px]">{p.label}</span>
      <span className="opacity-70 tabular-nums">{p.count}×</span>
    </button>


    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        deletePreset(p.key);
      }}
      className="ml-2 rounded-full px-2 py-0.5 hover:bg-white/40"
      title="Schnellfilter löschen"
    >
      ✕
    </button>
  </div>
);

    })}
  </div>
)}
*/}



            </div>

            {/* Filter-Leiste unter der Tabelle */}
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="flex flex-wrap items-end gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-neutral-500">
                  Turnierpunke
                </span>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-neutral-500">
                 1. Platz - Anzahl Teilnehmer + 2; 2. Platz - Anzahl Teilnehmer; 3. Platz - Anzahl Teilnehmer - 2; danach erhält jede weitere Platzierung einen Punkt weniger
                 <br />
                 Super-Finale Sieg: Anzahl Teilnehmer/2
                </span>
              </div>
              </div>
            </div>
            </div>
                
              </div>
            )}
          </div>
        )}

        {subTab === "matches" && (
          <div className="space-y-6">
            {/* MATCH-LEISTUNG (global) */}
            <MatchPlacementLeaderboard />

            {/* MATCH-HISTORIE – jetzt im Card-Design */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-neutral-700">
                      Match-Historie
                    </div>
                    <div className="text-xs text-neutral-500">
                      Einzelne Matches mit Sieger – quer über alle Turniere.
                    </div>
                  </div>

                  <Button
                    className="ml-auto !h-8 !px-2 !text-[11px] !leading-none"
                    variant="secondary"
                    onClick={loadMatchHistory}
                    disabled={matchLoading}
                  >
                    Neu laden
                  </Button>
                </div>
              </CardHeader>

              <CardBody>
                {/* Fehleranzeige */}
                {matchError && (
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 mb-3">
                    {matchError}
                  </div>
                )}

                {/* Lade-Status */}
                {matchLoading ? (
                  <div className="text-sm text-neutral-500">
                    Lade Match-Historie…
                  </div>
                ) : matchRows.length === 0 ? (
                  <div className="text-sm text-neutral-500">
                    Noch keine Daten verfügbar.{" "}
                    <span className="text-xs text-neutral-400">
                      (Backend-Route <code>/api/leaderboards/matches</code> noch nicht
                      implementiert?)
                    </span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Scroll-Container */}
                    <div className="max-h-[360px] overflow-y-auto rounded-xl border border-neutral-200">
                      <table className="w-full text-sm">
                        <thead className="bg-neutral-50 sticky top-0 z-10">
                          <tr className="text-left text-xs text-neutral-500 border-b">
                            <th className="py-1 pr-2">Datum</th>
                            <th className="py-1 pr-2">Turnier</th>
                            <th className="py-1 pr-2 text-right">Runde</th>
                            <th className="py-1 pr-2">Maschine</th>
                            <th className="py-1 pr-2">Sieger</th>
                          </tr>
                        </thead>

                        <tbody>
                          {(() => {
                            let lastKey = "";
                            let groupIndex = -1;

                            return matchRows.map((row) => {
                              const groupKey =
                                (row as any).tournamentId ||
                                row.tournamentCode ||
                                row.tournamentName;
                              if (groupKey !== lastKey) {
                                groupIndex += 1;
                                lastKey = groupKey;
                              }
                              const isEvenGroup = groupIndex % 2 === 0;

                              return (
                                <tr
                                  key={row.id}
                                  className={
                                    "border-b last:border-0 hover:bg-neutral-100 " +
                                    (isEvenGroup
                                      ? "bg-white"
                                      : "bg-neutral-50")
                                  }
                                >
                                  <td className="py-2 pr-2 text-xs text-neutral-500 whitespace-nowrap">
                                    {row.playedAt
                                      ? new Date(
                                          row.playedAt
                                        ).toLocaleDateString("de-DE")
                                      : "—"}
                                  </td>
                                  <td className="py-2 pr-2">
                                    <div className="flex flex-col">
                                      <span className="font-medium">
                                        {row.tournamentName}
                                      </span>
                                      <span className="text-[11px] text-neutral-500">
                                        {(row as any).tournamentCategory
                                          ? `Kategorie: ${
                                              (row as any)
                                                .tournamentCategory
                                            }`
                                          : row.tournamentCode
                                          ? `Code: ${row.tournamentCode}`
                                          : ""}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 pr-2 text-right tabular-nums">
                                    {row.roundNumber ?? "—"}
                                  </td>
                                  <td className="py-2 pr-2">
                                    {row.machineName ?? "—"}
                                  </td>
                                  <td className="py-2 pr-2">
                                    <span className="font-semibold">
                                      {row.winnerName}
                                    </span>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {/* ---------------- Serien / Seasons Platzhalter ---------------- */}
        {subTab === "series" && (
          <div className="text-sm text-neutral-500">
            Wird noch bearbeitet
          </div>
        )}
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
            <div className="font-semibold">
              Leaderboard – {tournamentName || "Turnier"}
            </div>
            <div className="flex gap-2">
              <a
                className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                href={`/api/export/standings.csv?code=${encodeURIComponent(
                  code
                )}`}
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
  {/* Kopfzeile */}
  <div className="grid grid-cols-12 gap-4 border-b bg-neutral-50 px-2 py-3 text-ms text-neutral-600">
    <div className="col-span-1 text-center">Platz</div>
    <div className="col-span-5">Spieler</div>
    <div className="col-span-2 text-right">Punkte</div>
    <div className="col-span-1 text-right">Matches</div>
    <div className="col-span-1 text-right">Winrate</div>
    <div className="col-span-2 text-right">Verlauf</div>
  </div>

  {rows.map((r: any, index: number) => {
    const hist = (r.history ?? []).map((x: any) => x.points);
    const place = index + 1;

    const medal =
      place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";
    const medalClass =
      place === 1 ? "text-lg leaderboard-glow" : "text-lg";
    const hasMedal = medal !== "";

    return (
      <div key={r.id} className="relative min-w-0 border-b last:border-b-0">
        <button
          className={`w-full grid grid-cols-12 gap-4 px-2 py-3 items-center text-left hover:bg-neutral-50 ${
            place === 1 ? "leaderboard-first" : ""
          }`}
          onClick={() => setOpenId(openId === r.id ? null : r.id)}
        >
          

          
          
          
          {/* Platz-Spalte: Medaille (1–3) oder Platz-Zahl (ab 4) */}
          <div className="col-span-1 flex flex-col items-center justify-center text-xs tabular-nums">
            {hasMedal && <span className={medalClass}>{medal}</span>}
            {!hasMedal && (
              <span className="font-semibold">{place}.</span>
            )}
          </div>

    {/* Badge schwebend */}
    {place === 1 && (
      <span className="absolute -top-3 left-0 winner-ribbon">
        Champion
      </span>
    )}

          {/* Spieler + Elo-Infos */}
          <div className="col-span-5 flex items-center justify-between gap-4 min-w-0">
            <div className="min-w-0">
            <PlayerPill
              player={{
                name: r.name,
                color: r.color ?? null,
                icon: r.icon ?? null,
                avatarUrl: r.avatarUrl ?? null,
              }}
            />
            </div>

<div className="shrink-0 w-fit">
  <div className="grid grid-cols-[auto_auto] gap-3 items-start">
    {/* LEFT: ELO BLOCK */}


  
    <div className="rounded-xl">
      {/* header row */}



      <div className="flex items-center justify-between">
        
        <span className="ml-2 inline-flex  font-semibold items-center rounded-full bg-neutral-100 px-3 py-1 text-xs">
          <span className="text-[14px] mr-2 text-neutral-700">Elo </span> {r.eloEnd != null ? Math.round(r.eloEnd) : "—"}
        </span>
      </div>

      {/* detail row */}
      <div className="mt-0.5 text-[12px] tabular-nums text-neutral-600">
        {r.eloStart != null && r.eloEnd != null ? (
          <>
            {Math.round(r.eloStart)} <span className="mx-1">→</span>{" "}
            {Math.round(r.eloEnd)}
            {(() => {
              const delta = r.eloDelta ?? null;
              if (typeof delta !== "number" || delta === 0) return null;
              const sign = delta > 0 ? "+" : "";
              const cls =
                delta > 0
                  ? "ml-2 font-semibold text-[13px] text-emerald-600"
                  : "ml-2 font-semibold text-[13px] text-red-600";
              return (
                <span className={cls}>
                  ({sign}
                  {Math.round(delta)})
                </span>
              );
            })()}
          </>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </div>
    </div>

    {/* RIGHT: TP BLOCK  inline-flex flex-col rounded-xl border border-amber-200 bg-amber-50 */}
    
    {Number(r.tournamentPoints ?? 0) > 0 && (
      <div className="ml-2 inline-flex font-semibold items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm">
        {/* header row */}
        <div className="justify-between">
          <span className="text-[11px] font-semibold text-amber-800">
            Turnierwertung        
          </span>
        </div>
        <div className="mt-0.5 text-[13px]  text-amber-700 font-semibold">+{Number(r.tournamentPoints ?? 0)} TP</div>

      </div>
    )}





    </div>




</div>


          </div>

          {/* Punkte / Matches / Winrate / Verlauf */}
          <div className="col-span-2 text-right font-semibold tabular-nums">
            {r.points}
          </div>
          <div className="col-span-1 text-right tabular-nums">
            {r.matches}
          </div>
          <div className="col-span-1 text-right tabular-nums">
            {r.winrate}%
          </div>
          <div className="col-span-2 flex justify-end text-neutral-900">
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
                  Häufigste Maschine
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
            {top.map((r: any, index: number) => {
              const emoji = (r.icon ?? "").trim();
              const color = r.color ?? null;
              const initials =
                r.name
                  ?.trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s: string) => s[0]?.toUpperCase())
                  .join("") || "?";

              return (
                <div
                  key={r.id ?? r.player_id ?? index}
                  className="flex items-start gap-2 text-sm"
                >
                  <div className="w-3 text-right tabular-nums text-neutral-500 pt-0.5">
                    {index + 1}.
                  </div>
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-white/70 text-xs mt-0.5"
                      style={color ? { backgroundColor: color } : {}}
                    >
                      {emoji || initials}
                    </span>
                    <span className="truncate font-medium">{r.name}</span>
                  </div>
                  <div className="tabular-nums text-neutral-700 font-semibold pl-2">
                    {r.points ?? "—"}
                  </div>
                </div>
              );
            })}
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
  playersById: Record<string, PlayerVisual>;
  onSaved: () => void;
  locked: boolean;
}) {
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  const lastRoundCountRef = useRef<number>(0);

  useEffect(() => {
    const count = rounds?.length ?? 0;
    if (!rounds || count === 0) {
      lastRoundCountRef.current = 0;
      return;
    }

    if (count > lastRoundCountRef.current) {
      const sorted = rounds
        .slice()
        .sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0));
      const newest = sorted[sorted.length - 1];
      if (newest?.id) {
        setOpenRoundId(newest.id);
      }
    }

    lastRoundCountRef.current = count;
  }, [rounds]);

  const [posOverride, setPosOverride] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const [savingMachine, setSavingMachine] = useState<Record<string, boolean>>({});

  const matchesByRound = useMemo(() => {
    const out: Record<string, Match[]> = {};
    for (const m of matches) {
      out[m.round_id] = out[m.round_id] || [];
      out[m.round_id].push(m);
    }
    for (const rid of Object.keys(out)) {
      out[rid] = out[rid]
        .slice()
        .sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0));
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
    return Object.prototype.hasOwnProperty.call(posOverride, key)
      ? posOverride[key]
      : mp.position;
  }

  async function setPosition(
    matchId: string,
    playerId: string,
    position: number | null
  ) {
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


async function handleChangeMachine(matchId: string, machineId: string | null) {
  if (locked) return;

  // 1) "Speichere…" Flag für dieses Match setzen
  setSavingMachine((prev) => ({ ...prev, [matchId]: true }));

  try {
    const res = await fetch("/api/matches/set-machine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, machineId }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j.error ?? "Konnte Maschine nicht speichern");
      return;
    }

    // 2) Daten neu laden
    onSaved();
  } catch (e) {
    alert("Netzwerkfehler beim Speichern der Maschine");
  } finally {
    // 3) "Speichere…" Flag wieder entfernen
    setSavingMachine((prev) => ({ ...prev, [matchId]: false }));
  }
}



  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Runden & Matches</div>
          <div className="text-sm text-neutral-500">
            Zum Öffnen auf eine Runde klicken
            {locked ? " • Turnier beendet (read-only)" : ""}
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
                  <button
                    className="w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left hover:bg-neutral-50"
                    onClick={() => setOpenRoundId(isOpen ? null : r.id)}
                  >
                    <div className="col-span-2 font-semibold tabular-nums">
                      #{r.number}
                    </div>
                    <div className="col-span-4">{r.format}</div>
                    <div className="col-span-3">
                      <div className="flex flex-wrap items-center gap-2">
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
                                (r.status === "finished"
                                  ? "bg-green-500"
                                  : "bg-neutral-400")
                              }
                            />
                          )}

                          {r.status === "open"
                            ? "Aktiv"
                            : r.status === "finished"
                            ? "Finished"
                            : r.status ?? "—"}
                        </span>

                        <span className="text-xs text-neutral-500">
                          Elo:{" "}
                          {r.elo_enabled ? (
                            <span className="text-emerald-600 font-semibold">
                              aktiv
                            </span>
                          ) : (
                            <span className="text-neutral-500">aus</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="col-span-3 text-right tabular-nums">
                      {ms.length}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t bg-neutral-100 px-4 py-4">
                      {ms.length === 0 ? (
                        <div className="text-sm text-neutral-500">
                          Noch keine Matches in dieser Runde.
                        </div>
                      ) : (
                        <div className="space-y-3">
{ms.map((m) => {
  const mps = (mpByMatch[m.id] ?? []).slice();

  mps.sort((a, b) => {
    const sa = (a.start_position ?? 999) as number;
    const sb = (b.start_position ?? 999) as number;
    if (sa !== sb) return sa - sb;
    const an = playersById[a.player_id]?.name ?? "";
    const bn = playersById[b.player_id]?.name ?? "";
    return an.localeCompare(bn);
  });

  const n = Math.max(2, mps.length || 4);

  // WICHTIG: hier merken, ob schon Ergebnisse gesetzt sind
  {/*const hasResults = mps.some((mp) => mp.position != null);*/}
  const hasResults = mps.some((mp) => getPos(mp) != null);



                            return (
                              <div
                                key={m.id}
                                className="rounded-2xl border bg-white"
                              >



<div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
  {/* Linke Seite: Maschine + Spiel + Hinweis */}
  <div className="flex flex-col gap-1">
    <div className="flex items-center gap-3">
      {/* Maschinen-Dropdown */}
      <Select
        value={m.machine_id ?? ""}
        className="min-w-[230px] max-w-[260px] text-sm"
        disabled={locked || hasResults || savingMachine[m.id]}
        onChange={(e) =>
          handleChangeMachine(
            m.id,
            e.target.value === "" ? null : e.target.value
          )
        }
      >
        <option value="">Maschine wählen…</option>
        {Object.entries(machinesById).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>

      {m.game_number ? (
        <span className="text-neutral-500 whitespace-nowrap">
          • Spiel {m.game_number}
        </span>
      ) : null}
    </div>

    {/* Hinweistext unter dem Dropdown */}
    <div className="text-xs font-normal text-neutral-500">
      {locked
        ? "Turnier ist beendet – Maschine kann nicht mehr geändert werden."
        : hasResults
        ? "Ergebnisse gesetzt – Maschine kann nicht mehr geändert werden."
        : "Solange noch keine Ergebnisse gesetzt sind, kann die Maschine geändert werden."}
    </div>
  </div>

  {/* Rechte Seite: Match-ID / Speichern-Status */}
  <div className="text-xs text-neutral-500">
    {savingMachine[m.id] ? "speichere…" : <>Match {m.id.slice(0, 8)}…</>}
  </div>
</div>




                                <div className="p-4 space-y-2">
                                  {mps.map((mp) => {
                                    const pos = getPos(mp);
                                    const isWinner = pos === 1;
                                    const isSaving =
                                      saving[
                                        k(mp.match_id, mp.player_id)
                                      ] === true;

                                    return (
                                      <div
                                        key={k(mp.match_id, mp.player_id)}
                                        className={
                                          "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 " +
                                          (isWinner
                                            ? "bg-amber-200 border-amber-300"
                                            : "bg-white")
                                        }
                                      >
                                        <div className="flex items-center gap-2">
                                          <PlayerPill
                                            player={
                                              playersById[mp.player_id] ?? {
                                                name: "Unbekannt",
                                              }
                                            }
                                          />
                                        {pos ? (
                                            <Pill>#{pos}</Pill>
                                          ) : (
                                            <Pill>—</Pill>
                                          )}
                                          {isWinner ? (
                                            <Pill>🏆 Sieger</Pill>
                                          ) : null}
                                          {isSaving ? (
                                            <span className="text-xs text-neutral-500">
                                              speichere…
                                            </span>
                                          ) : null}
                                        </div>

                                        <div className="w-44">
                                          <Select
                                            value={pos ?? ""}
                                            disabled={locked}
                                            onChange={(e) => {
                                              if (locked) return;
                                              const v = e.target.value;
                                              setPosition(
                                                m.id,
                                                mp.player_id,
                                                v === ""
                                                  ? null
                                                  : Number(v)
                                              );
                                            }}
                                          >
                                            <option value="">
                                              Platz — 
                                            </option>
                                            {Array.from(
                                              { length: n },
                                              (_, i) => i + 1
                                            ).map((p) => (
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

          {rounds.length === 0 && (
            <div className="px-4 py-4 text-sm text-neutral-500">
              Noch keine Runden.
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function AdminHome() {
  const [tab, setTab] = useState<
    "join" | "create" | "archive" | "elimination" | "locations" | "players" | "stats"
  >("join");

    // ⭐ NEU: Rolle + Mail des aktuellen Users
  const [userRole, setUserRole] = useState<"admin" | "viewer" | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

useEffect(() => {
  async function loadRole() {
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.auth.getUser();

      console.log("getUser result:", { data, error });

      if (error || !data?.user) {
        setUserRole(null);
        setUserEmail(null);
        setRoleLoading(false);
        return;
      }

      const user = data.user;

      setUserEmail(user.email ?? null);

      console.log("app_metadata:", user.app_metadata);
      console.log("user_metadata:", user.user_metadata);

      // 👉 WICHTIG: richtiges Merge statt ||
      const meta = {
        ...(user.app_metadata || {}),
        ...(user.user_metadata || {}),
      };

      console.log("merged meta:", meta, "role:", meta.role);

      const role = meta.role as string | undefined;

      if (role === "admin") {
        setUserRole("admin");
      } else {
        setUserRole("viewer");
      }
    } catch (e) {
      console.error("Fehler beim Laden der Rolle", e);
      setUserRole(null);
      setUserEmail(null);
    } finally {
      setRoleLoading(false);
    }
  }

  loadRole();
}, []);


 const isAdmin = userRole === "admin";

  function handleClickCreateTab() {
  if (hasOpenTournaments) {
    alert("Bitte erst alle laufenden Turniere beenden.");
    return;
  }
  setTab("create");
}

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [matchSize, setMatchSize] = useState<2 | 3 | 4>(4);

  const [tournamentFormat, setTournamentFormat] =
    useState<"matchplay" | "swiss" | "round_robin">("matchplay");

  const [templateTournamentId, setTemplateTournamentId] =
    useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [joined, setJoined] = useState<Tournament | null>(null);

  const [archive, setArchive] = useState<Tournament[]>([]);

  const hasOpenTournaments = useMemo(
  () =>
    (archive ?? []).some(
      (t) => (t.status ?? "open") !== "finished" // null/undefined als "open" behandeln
    ),
  [archive]
);

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

if (joined)
  return (
    <Dashboard
      code={joined.code}
      name={joined.name}
      isAdmin={isAdmin}
    />
  );


  return (
    <div className="grid gap-4 grid-cols-1">

            {/* 🔸 Neuer Header oben rechts mit Logout */}
<div className="flex justify-end">
  <div className="inline-flex items-center gap-2 rounded-lg border px-2 py-1 bg-white/60 text-xs text-neutral-600 shadow-sm">
    <span className="flex items-center gap-1 px-1">
      <span>👤</span>
      <span className="truncate max-w-[160px]">
        {userEmail === "flo.nestmann@gmx.de"
          ? "Admin"
          : userEmail
          ? "Besucher"
          : "…"}
      </span>
    </span>

    <button
      type="button"
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        localStorage.clear();
        location.href = "/login";
      }}
      className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-200 transition"
    >
      Abmelden
    </button>
  </div>
</div>


      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
            <button
              onClick={() => setTab("join")}
              className={tab === "join" ? "font-semibold" : "text-neutral-500"}
            >
              Turnier öffnen
            </button>
             )}
            {isAdmin && (
            <span className="text-neutral-300">|</span>
             )}
            {/*<button
              onClick={() => setTab("create")}
              className={
                tab === "create" ? "font-semibold" : "text-neutral-500"
              }
            >
              Turnier Neu anlegen
            </button>*/}
            {isAdmin && (
            <button
              onClick={handleClickCreateTab}
              className={tab === "create" ? "font-semibold" : "text-neutral-500"}
            >
              Turnier Neu anlegen
            </button>
            )}
            {isAdmin && (
            <span className="text-neutral-300">|</span>
            )}
            
            <button
           
              onClick={() => setTab("archive")}
              className={
                tab === "archive" ? "font-semibold" : "text-neutral-500"
              }
            >
              Turnier-Archiv
            </button>

              {/* 👇 NEU: Elimination-Tab */}
              {isAdmin && (
              <span className="text-neutral-300">|</span>
              )}
              {isAdmin && (
              <button
                onClick={() => setTab("elimination")}
                className={
                  tab === "elimination" ? "font-semibold" : "text-neutral-500"
                }
              >
                Elimination
              </button>
              )}




             {isAdmin && (
            <span className="text-neutral-300">|</span>
            )}




             {isAdmin && (
            <button
              onClick={() => setTab("locations")}
              className={
                tab === "locations" ? "font-semibold" : "text-neutral-500"
              }
            >
              Locations
            </button>
            )}
            <span className="text-neutral-300">|</span>
            <button
              onClick={() => setTab("players")}
              className={
                tab === "players" ? "font-semibold" : "text-neutral-500"
              }
            >
              Spieler
            </button>

            <span className="text-neutral-300">|</span>
            <button
              onClick={() => setTab("stats")}
              className={
                tab === "stats" ? "font-semibold" : "text-neutral-500"
              }
            >
              Statistiken
            </button>
          </div>
        </CardHeader>

        <CardBody>
          {tab === "join" ? (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm text-neutral-600">
                  Turnier-Code
                </div>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
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
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Monats-Cup"
                />
              </div>

              <div>
                <div className="mb-1 text-sm text-neutral-600">
                  Kategorie / Serie
                </div>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="z.B. Liga 2025, Monatsserie, Fun-Cup"
                />

                {existingCategories.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-600">
                    <span className="mr-1 text-neutral-500">
                      Vorhandene Kategorien:
                    </span>
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
                

             
{/* Format + Spieler pro Maschine nebeneinander */}
<div className="grid gap-3 md:grid-cols-2">
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
    <Select
      value={String(matchSize)}
      onChange={(e) => setMatchSize(Number(e.target.value) as any)}
    >
      <option value="2">1 vs 1 (2 Spieler)</option>
      <option value="3">3 Spieler (1 vs 1 vs 1)</option>
      <option value="4">4 Spieler (1 vs 1 vs 1 vs 1)</option>
    </Select>
  </div>
</div>

{/* Maschinen-Import aus Location darunter in voller Breite */}
<div className="mt-3">
  <div className="mb-1 text-sm text-neutral-600">
    Maschinen importieren aus Location
  </div>
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
  <div className="mt-1 text-xs text-neutral-500">
    Importiert Maschinen aus der Location-Datenbank.
  </div>
</div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {/*
                <div>
                  <div className="mb-1 text-sm text-neutral-600">
                    Maschinen übernehmen aus Turnier
                  </div>
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
                  <div className="mt-1 text-xs text-neutral-500">
                    Kopiert Maschinen + Zuordnung aus einem alten Turnier.
                  </div>
                </div>
                 */}


              </div>

              <Button disabled={busy} onClick={createTournament}>
                Turnier erstellen
              </Button>
            </div>
          ) : tab === "archive" ? (
            <div className="space-y-2">
              <div className="text-sm text-neutral-600">
                Letzte Turniere (klicken zum Öffnen):
              </div>
              <div className="overflow-hidden rounded-2xl border bg-white">
                <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                  <div className="col-span-6">Name</div>
                  <div className="col-span-3">Kategorie / Serie</div>
                  <div className="col-span-1">Code</div>
                  <div className="col-span-1">Status</div>
                  <div className="col-span-1">Erstellt</div>
                </div>
                {archive.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => joinTournament(t.code)}
                    className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0 items-center
                              cursor-pointer hover:bg-neutral-50 active:bg-neutral-100 transition"
                  >
                    <div className="col-span-6 font-medium truncate">
                      {t.name}
                    </div>

                    <div className="col-span-3">
                      {t.category ? (
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                          {t.category}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">
                          —
                        </span>
                      )}
                    </div>

                    <div className="col-span-1 font-mono text-neutral-500">
                      {t.code}
                    </div>

                    {/* NEU: Status */}
                    <div className="col-span-1  text-left text-xs text-neutral-500">

  {t.status === "finished" ? (
    <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
      Beendet
    </span>
  ) : (
    <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
      Laufend
    </span>
  )}

                    </div>

                    <div className="col-span-1 text-left text-xs text-neutral-500">
                      {t.created_at
                        ? new Date(t.created_at).toLocaleDateString("de-DE")
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
            </div>
          ) : tab === "elimination" ? (
            // 👇 NEUER Platzhalter für deinen Modus
            <div className="space-y-3">
              <div className="text-sm font-semibold">
                Race-to-the-King-of-the-Hill
              </div>
              <p className="text-sm text-neutral-600">
                Hier kommt bald unser Spezialmodus hin: Spieler können zur nächsten
                Maschine vorlaufen, sobald sie sicher nicht Letzter werden, und legen
                dort schon den nächsten Highscore vor.
              </p>
              <p className="text-xs text-neutral-500">
                Feature ist in Arbeit – der Tab ist schon da, damit die Vorfreude
                steigt. 🙂
              </p>
            </div>
          ) : tab === "locations" ? (
            <LocationsTab />
          ) : tab === "players" ? (
            //<PlayersTab />
            <PlayersTab isAdmin={isAdmin} />
          ) : tab === "stats" ? (
            <LeaderboardsTab isAdmin={isAdmin} />
          ) : null}

          {msg && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {msg}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Dashboard({ code, name, isAdmin }: { code: string; name: string; isAdmin: boolean }) {
  const [data, setData] = useState<any>(null);
  const rounds = data?.rounds ?? [];

  const hasAtLeastOneFinishedRound = rounds.length > 0 && rounds.some((r: any) => r.status === "finished");

  const matches: Match[] = data?.matches ?? [];
  const matchPlayers: MP[] = data?.match_players ?? [];

    const machineUsageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of matches) {
      if (!m.machine_id) continue;
      map[m.machine_id] = (map[m.machine_id] ?? 0) + 1;
    }
    return map;
  }, [matches]);


  const tournament = data?.tournament;

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [machineName, setMachineName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const [superFinalBoostOverlay, setSuperFinalBoostOverlay] = useState<string | null>(null);
  const [superFinalBoostVisible, setSuperFinalBoostVisible] = useState(false);

    // ⭐ NEU: Elo-Toggle nur fürs Super-Finale (Flag aus der DB)
  const [superfinalEloEnabled, setSuperfinalEloEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (data?.tournament?.superfinal_elo_enabled != null) {
      setSuperfinalEloEnabled(!!data.tournament.superfinal_elo_enabled);
    }
  }, [data?.tournament?.superfinal_elo_enabled]);
  // ⭐ ENDE NEU

  // Merkt sich, wie viele fertige Runden wir bereits für Elo berücksichtigt haben
  const finishedRoundsSeenRef = useRef<number | null>(null);

  const [tournamentChampion, setTournamentChampion] = useState<string | null>(
    null
  );
  const [superFinalChampion, setSuperFinalChampion] = useState<string | null>(
    null
  );

  const [startOrderMode, setStartOrderMode] = useState<
    "random" | "standings_asc"
  >("random");

  const [finalState, setFinalState] = useState<any | null>(null);

  const superFinalRunning = !!(finalState && finalState.status !== "finished");

  const [useElo, setUseElo] = useState(true);

  const prevRatingsRef = useRef<Record<string, number>>({});
  const expectEloUpdateRef = useRef(false);
  const [eloDeltas, setEloDeltas] = useState<Record<string, number>>({});   

  // ⭐ NEU: Start-Elo pro Profil (vor diesem Turnier)
  const [tournamentStartRatings, setTournamentStartRatings] = useState<
    Record<string, number>
  >({});

  // ⭐ NEU: Elo-Delta über das GESAMTE Turnier
  const [tournamentEloDeltas, setTournamentEloDeltas] = useState<
    Record<string, number>
  >({});

  const isFinished = data?.tournament?.status === "finished";
  const isViewer = !isAdmin;

  // locked = entweder Turnier beendet ODER Zuschauer
  const locked = isFinished || isViewer;

  function playWinnerSounds() {
    try {
      const drum = new Audio("/sounds/drumroll.mp3");
      drum.volume = 0.8;
      drum.play().catch(() => {});

      setTimeout(() => {
        try {
          const fanfare = new Audio("/sounds/winner-fanfare.mp3");
          fanfare.volume = 0.9;
          fanfare.play().catch(() => {});
        } catch {
          /* ignore */
        }
      }, 2200);
    } catch {
      /* ignore */
    }
  }

  function handleFinalWinClick(p: { playerId: string; name: string }) {
    const gamesCount = finalState?.games?.length ?? 0;
    const nextGameNumber = gamesCount + 1;

    const sicher = window.confirm(
      `Bist du sicher, dass ${p.name} das ${nextGameNumber}. Finalspiel gewonnen hat?`
    );

    if (!sicher) return;

    registerFinalWin(p.playerId, p.name);
  }

  async function finishTournament() {
    if (!confirm("Turnier wirklich beenden? Danach ist nichts mehr änderbar."))
      return;

    playWinnerSounds();

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
    await loadChampions();
    setShowCelebration(true);
  }

  async function startSuperFinal() {
    if (locked) return;

if (!hasAtLeastOneFinishedRound) {
  alert('Super-Finale kann erst gestartet werden, wenn eine Runde "finished" ist.');
  return;
}

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




async function handleToggleSuperfinalElo() {
    if (!isAdmin) return; // Zuschauer dürfen nicht
  const next = !superfinalEloEnabled;
  setSuperfinalEloEnabled(next);

  const res = await fetch("/api/tournaments/superfinal-elo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, enabled: next }),
  });

  if (!res.ok) {
    // Fehler -> zurückspringen
    setSuperfinalEloEnabled(!next);
    alert("Konnte die Elo-Einstellung für das Super-Finale nicht speichern.");
  }
}




async function registerFinalWin(playerId: string, winnerName: string) {
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

  // Finale fertig -> großes Feier-Overlay, KEIN kleines Elo-Overlay
  if (j.finished) {
    playWinnerSounds();

    try {
      await fetch("/api/tournaments/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
    } catch {
      // Ignorieren, Feier trotzdem zeigen
    }

    await reloadAll();
    await loadChampions();
    setShowCelebration(true);
    return;
  }

  // Finale läuft weiter: hier das kleine Super-Final-Elo-Overlay
  if (superfinalEloEnabled) {
    setSuperFinalBoostOverlay(winnerName);
    setSuperFinalBoostVisible(true);

    // nach 4s ausblenden
    setTimeout(() => {
      setSuperFinalBoostVisible(false);
    }, 4000);

    // nach 5s ganz entfernen
    setTimeout(() => {
      setSuperFinalBoostOverlay(null);
    }, 5000);
  }

  await reloadAll();
}



  async function deleteTournament() {
    if (!isAdmin) return; // Safety

    
    const isFinished = data?.tournament?.status === "finished";

    const msg = isFinished
      ? "⚠️ Turnier wirklich ENDGÜLTIG löschen?\n\nHinweis: Das Turnier ist bereits beendet. Elo-Werte der Spieler bleiben unverändert."
      : "⚠️ Turnier wirklich ENDGÜLTIG löschen?\n\nHinweis: Dieses Turnier ist noch nicht beendet. Die Elo-Werte der Spieler werden auf den Stand vor diesem Turnier zurückgesetzt.";

    if (!confirm(msg)) return;

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
    if (!data || locked) return;

    const finishedCount = (rounds ?? []).filter(
      (r: any) => r.status === "finished"
    ).length;

    // Erstes Laden: nur den aktuellen Stand merken, noch nichts tun
    if (finishedRoundsSeenRef.current === null) {
      finishedRoundsSeenRef.current = finishedCount;
      return;
    }

    // Wenn mehr fertige Runden als vorher -> Elo automatisch neu berechnen
    if (finishedCount > finishedRoundsSeenRef.current) {
      finishedRoundsSeenRef.current = finishedCount;
      recalcElo();
    } else {
      // Stand aktualisieren, falls z.B. neu geladen wurde
      finishedRoundsSeenRef.current = finishedCount;
    }
  }, [rounds, data, locked]);


  useEffect(() => {
    reload();
    loadProfiles();
    reloadFinal();
  }, [code]);

  useEffect(() => {
    async function loadTournamentStartRatings() {
      const tournamentId = data?.tournament?.id;
      if (!tournamentId) return;

      try {
        const sb = supabaseBrowser();
        const { data: rows, error } = await sb
          .from("tournament_ratings")
          .select("profile_id, rating_before")
          .eq("tournament_id", tournamentId);

        if (error) {
          console.error(
            "Fehler beim Laden der Turnier-Start-Elo-Werte",
            error
          );
          return;
        }

        const map: Record<string, number> = {};
        for (const row of rows ?? []) {
          const pid = row.profile_id as string | undefined;
          if (pid && typeof row.rating_before === "number") {
            map[pid] = row.rating_before;
          }
        }

        setTournamentStartRatings(map);
      } catch (e) {
        console.error("loadTournamentStartRatings error", e);
      }
    }

    loadTournamentStartRatings();
  }, [data?.tournament?.id]);




  useEffect(() => {
    if (!expectEloUpdateRef.current) return;

    const prev = prevRatingsRef.current;
    if (!prev || Object.keys(prev).length === 0) return;

    const deltas: Record<string, number> = {};
    for (const p of profiles) {
      const before = prev[p.id];
      if (typeof before === "number" && typeof p.rating === "number") {
        const diff = p.rating - before;
        if (diff !== 0) {
          deltas[p.id] = diff;
        }
      }
    }

    setEloDeltas(deltas);
    expectEloUpdateRef.current = false;
  }, [profiles]);


  

 
  // ⭐ NEU: Elo-Delta über das ganze Turnier (Profil-Rating - rating_before)
  useEffect(() => {
    if (!profiles || profiles.length === 0) {
      setTournamentEloDeltas({});
      return;
    }

    if (
      !tournamentStartRatings ||
      Object.keys(tournamentStartRatings).length === 0
    ) {
      setTournamentEloDeltas({});
      return;
    }

    const deltas: Record<string, number> = {};

    for (const p of profiles) {
      const before = tournamentStartRatings[p.id];
      if (typeof before === "number" && typeof p.rating === "number") {
        const diff = p.rating - before;
        if (diff !== 0) {
          deltas[p.id] = diff;
        }
      }
    }

    setTournamentEloDeltas(deltas);
  }, [profiles, tournamentStartRatings]);






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

  async function loadChampions() {
    try {
      const resStats = await fetch("/api/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const jStats = await resStats.json().catch(() => ({}));

      if (resStats.ok && Array.isArray(jStats.stats) && jStats.stats.length > 0) {
        setTournamentChampion(jStats.stats[0].name ?? null);
      } else {
        setTournamentChampion(null);
      }

      const resFinal = await fetch("/api/finals/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const jFinal = await resFinal.json().catch(() => ({}));

      if (
        resFinal.ok &&
        jFinal.exists &&
        jFinal.status === "finished" &&
        Array.isArray(jFinal.ranking) &&
        jFinal.ranking.length > 0
      ) {
        setSuperFinalChampion(jFinal.ranking[0].name ?? null);
      } else {
        setSuperFinalChampion(null);
      }
    } catch {
      setTournamentChampion(null);
      setSuperFinalChampion(null);
    }
  }

  async function reloadAll() {
    await Promise.all([reload(), loadProfiles(), reloadFinal()]);
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

  async function recalcElo() {
    // Stand VOR der Neuberechnung merken
    const prev: Record<string, number> = {};
    for (const p of profiles) {
      if (typeof p.rating === "number") {
        prev[p.id] = p.rating;
      }
    }
    prevRatingsRef.current = prev;
    expectEloUpdateRef.current = true;

    setBusy(true);
    setNotice(null);

    const res = await fetch("/api/tournaments/recalc-elo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const j = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setNotice(j.error ?? "Elo-Neuberechnung fehlgeschlagen");
      return;
    }

    // nach Elo-Update neu laden, damit Ratings sichtbar werden
    await reloadAll();
    setNotice(j.message ?? "Elo wurde neu berechnet");
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
    const res = await fetch("/api/machines/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name: machineName.trim() }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    setMachineName("");
    await reloadAll();
  }

  const currentRoundNumber = data?.tournament?.current_round ?? null;
  const currentRoundObj = useMemo(
    () =>
      (rounds ?? []).find((r: any) => r.number === currentRoundNumber) ?? null,
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

    if (finalState && finalState.status !== "finished") {
      setNotice(
        "Es läuft ein Super-Finale – neue Runden können nicht mehr gestartet werden."
      );
      return;
    }
    setBusy(true);
    setNotice(null);

    const res = await fetch("/api/rounds/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        startOrderMode,
        useElo,      // Elo-Flag für die Runde
      }),
    });

    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    if (j.warnings?.length) setNotice(j.warnings.join(" "));
    await reloadAll();
  }

  const cat = data?.tournament?.category ?? "";

  const profAvatar = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p.avatar_url ?? null])),
    [profiles]
  );

  const profRating = useMemo(
    () =>
      Object.fromEntries(
        profiles.map((p: any) => [
          p.id,
          typeof p.rating === "number" ? p.rating : null,
        ])
      ),
    [profiles]
  );

  const profilesById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p])),
    [profiles]
  );

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
        (data?.players ?? []).map((p: any) => {
          const prof = p.profile_id ? profilesById[p.profile_id] : undefined;

          return [
            p.id,
            {
              name: p.name,
              color: p.color ?? prof?.color ?? null,
              icon: p.icon ?? prof?.icon ?? null,
              avatarUrl: p.avatar_url ?? prof?.avatar_url ?? null,
            } as PlayerVisual,
          ];
        })
      ),
    [data?.players, profilesById]
  );

  if (!data)
    return (
      <div className="p-6 text-sm text-neutral-500">Lade Turnier…</div>
    );

  const tournamentName = tournament?.name ?? name;

  const formatLabel =
    data?.tournament?.format === "swiss"
      ? "Swiss"
      : data?.tournament?.format === "round_robin"
      ? "Round Robin"
      : "Matchplay";

  const gamesPlayed = (finalState?.players ?? []).reduce(
    (sum: number, p: any) => {
      const base = p.startPoints ?? 0;
      const now = p.points ?? base;
      const extra = Math.max(0, now - base);
      return sum + extra;
    },
    0
  );

  const nextGameNumber = gamesPlayed + 1;

  return (
    <div className="space-y-4">

      {/* 🔸 Header oben rechts auch IM Turnier */}
      <div className="flex justify-end">
        <div className="inline-flex items-center gap-2 rounded-lg border px-2 py-1 bg-white/60 text-xs text-neutral-600 shadow-sm">
          <span className="flex items-center gap-1 px-1">
            <span>👤</span>
            <span className="truncate max-w-[160px]">
              {isAdmin ? "Admin" : "Besucher"}
            </span>
          </span>

          <button
            type="button"
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              localStorage.clear();
              location.href = "/login";
            }}
            className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-200 transition"
          >
            Abmelden
          </button>
        </div>
      </div>




      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        code={code}
      />

      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 celebration-overlay">
          <div className="relative z-10 w-full max-w-4xl">
            <div className="rounded-[2rem] bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 p-[2px] shadow-[0_0_25px_rgba(250,204,21,0.7)]">
              <div className="relative rounded-[1.9rem] bg-white p-6 max-h-[90vh] overflow-y-auto">
                <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
                  <div className="confetti-container">
                    {Array.from({ length: 18 }).map((_, i) => {
                      const count = 18;
                      const offset = 5 + (i * 90) / (count - 1);
                      const delay = (i % 9) * 0.4;

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

                {/* Header-Zeile: Text links, Close rechts */}
                <div className="flex items-start justify-between gap-4 mb-3 relative z-10">
                  <div>
                    <div className="text-sm text-neutral-500">
                      Turnier beendet
                    </div>
                    <div className="text-2xl font-bold">
                      Glückwunsch! 🏆
                    </div>
                  </div>

                  <button
                    className="rounded-xl bg-neutral-100 px-3 py-2 text-sm hover:bg-neutral-200"
                    onClick={() => setShowCelebration(false)}
                  >
                    Schließen
                  </button>
                </div>

                {/* Siegerblock */}
                <div className="relative z-10 mt-4 flex flex-col items-center justify-center gap-4 text-center">
                  <div className="flex flex-wrap items-stretch justify-center gap-6">
                    {/* Turniersieger */}
                    <div className="flex flex-col items-center gap-2 min-w-[160px]">
                      <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-amber-700 font-semibold uppercase tracking-wide">
                        <span>🏆</span>
                        <span>Turniersieger</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-amber-50 border border-amber-100 text-sm sm:text-base font-semibold flex items-center gap-2">
                        {(() => {
                          const p = Object.values(playersById).find(
                            (v: any) => v.name === tournamentChampion
                          ) as PlayerVisual | undefined;
                          return (
                            <>
                              {p?.icon ? (
                                <span className="text-base">{p.icon}</span>
                              ) : p?.avatarUrl ? (
                                <img
                                  src={p.avatarUrl}
                                  className="h-6 w-6 rounded-full object-cover"
                                />
                              ) : (
                                <span className="text-base">👤</span>
                              )}
                              <span>{tournamentChampion || "–"}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Super Final Champion */}
                    <div className="flex flex-col items-center gap-2 min-w-[160px]">
                      <div className="inline-flex items-center gap-2 text-xs sm:text-sm text-violet-700 font-semibold uppercase tracking-wide">
                        <span>👑</span>
                        <span>Super Final Champion</span>
                      </div>
                      <div className="px-4 py-1.5 rounded-full bg-violet-50 border border-violet-100 text-sm sm:text-base font-semibold flex items-center gap-2">
                        {(() => {
                          const p = Object.values(playersById).find(
                            (v: any) => v.name === superFinalChampion
                          ) as PlayerVisual | undefined;
                          return (
                            <>
                              {p?.icon ? (
                                <span className="text-base">{p.icon}</span>
                              ) : p?.avatarUrl ? (
                                <img
                                  src={p.avatarUrl}
                                  className="h-6 w-6 rounded-full object-cover"
                                />
                              ) : (
                                <span className="text-base">👤</span>
                              )}
                              <span>{superFinalChampion || "–"}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats + Final-Ranking */}
                <div className="relative z-10 mt-6 space-y-6">
                  <Stats code={code} tournamentName={tournamentName} />

                  {finalState?.exists &&
                    finalState.status === "finished" &&
                    finalState.ranking && (
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">
                          Ergebnis Super-Finale
                        </div>

                        {finalState.ranking?.[0] && (
                          <div className="flex items-center gap-2 text-base font-semibold text-amber-700">
                            <span>👑 Champion:</span>
                            <span className="font-bold">
                              {finalState.ranking[0].name}
                            </span>
                          </div>
                        )}

                        <div className="overflow-hidden rounded-2xl border bg-white">
                          <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-600">
                            <div className="col-span-2">Platz</div>
                            <div className="col-span-4">Spieler</div>
                            <div className="col-span-3 text-right">Seed</div>
                            <div className="col-span-3 text-right">
                              Finalpunkte
                            </div>
                          </div>
                          {finalState.ranking.map((r: any) => (
                            <div
                              key={r.playerId}
                              className={
                                "grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center rounded-md " +
                                (r.rank === 1 ? "final-champion font-semibold" : "")
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
                              <div className="col-span-4">{r.name}</div>
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
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

{superFinalBoostOverlay !== null && (
  <div className="fixed inset-0 z-40 pointer-events-none">
    <div className="mt-20 flex justify-center">
      <div
        className={`pointer-events-auto rounded-2xl bg-black/80 px-4 py-3 text-sm text-white shadow-lg
          transition-opacity duration-500
          ${superFinalBoostVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
      >
        <div className="font-semibold">{superFinalBoostOverlay}</div>
        <div className="text-xs text-emerald-300">
          Super Final Boost +8 Elo
        </div>
      </div>
    </div>
  </div>
)}


      <Card>
        <CardHeader>
{/* ===== TURNIER-HEADER START ===== */}
<div className="mb-4 rounded-xl border border-neutral-200 bg-white/70 p-3 shadow-sm">
  {/* Zeile 1: Name + Status rechts */}
  <div className="flex items-center justify-between gap-4">
    <h2 className="text-2xl font-semibold">
      {data?.tournament?.name}
    </h2>

    <span
      className={
        data?.tournament?.status === "finished"
          ? "px-3 py-1 text-xs rounded-full bg-blue-100 text-blue-700 font-medium"
          : "px-3 py-1 text-xs rounded-full bg-green-100 text-green-700 font-medium"
      }
    >
      {data?.tournament?.status === "finished" ? "Beendet" : "Laufend"}
    </span>
  </div>

  {/* Zeile 2: Meta-Infos als Pills */}
  <div className="mt-2 flex flex-wrap gap-2 text-sm text-neutral-700">
    {cat && <Pill>{cat}</Pill>}

    <Pill>
      Code:
      <span className="ml-2 font-semibold">{code}</span>
    </Pill>

    <Pill>
      Spieler/Maschine {data?.tournament?.match_size ?? 4}
    </Pill>

    {data?.tournament?.locations?.name && (
      <Pill>📍 {data.tournament.locations.name}</Pill>
    )}

    <Pill>
      Format:
      <span className="ml-2 font-semibold">{formatLabel}</span>
    </Pill>

    {currentRoundObj && (
      <Pill>
        Elo in dieser Runde:
        <span className="ml-2 font-semibold">
          {currentRoundObj.elo_enabled ? "aktiv" : "aus"}
        </span>
      </Pill>
    )}
  </div>

  {/* Zeile 3: Aktions-Leiste */}
  <div className="mt-3 flex flex-wrap items-center gap-2">
    {/* Linke Button-Gruppe: hier deine bisherigen „normalen“ Buttons reinkopieren */}
    <div className="flex flex-wrap items-center gap-2">

{!isFinished ? (
  <Button
    variant="secondary"
    onClick={finishTournament}
    disabled={busy || !isAdmin}
    title={!isAdmin ? "Nur Admins können das Turnier beenden" : ""}
  >
    Turnier beenden
  </Button>
) : (
  <Pill>✅ Turnier beendet</Pill>
)}

              <Button
                variant="secondary"
                onClick={() => setShareOpen(true)}
              >
                QR teilen
              </Button>



{/*}
              <Button
                variant="secondary"
                onClick={() => {
                  localStorage.removeItem("pb_code");
                  location.reload();
                }}
              >
                Startseite
              </Button> 
              */}
              </div>

    {/* Rechte Button-Gruppe: Danger-Zone „Turnier löschen“ */}
    <div className="ml-auto flex items-center gap-2">
              <div className="flex flex-col items-end gap-1 ml-auto">
<Button
  variant="secondary"
  onClick={deleteTournament}
  disabled={busy || !isAdmin}
  className="bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
  title={!isAdmin ? "Nur Admins dürfen Turniere löschen" : ""}
>
  Turnier löschen
</Button>

                {!isFinished ? (
                  <div className="text-xs text-amber-700 max-w-xs text-right">
                    Hinweis: Dieses Turnier ist noch nicht beendet. Beim Löschen werden die
                    Elo-Werte der Spieler auf den Stand vor diesem Turnier zurückgesetzt.
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500 max-w-xs text-right">
                    Hinweis: Turnier ist beendet. Elo-Werte bleiben beim Löschen unverändert.
                  </div>
                )}
              </div>    </div>
  </div>
</div>
{/* ===== TURNIER-HEADER END ===== */}

        </CardHeader>

        <CardBody>
{locked && (
  <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
    {isFinished ? (
      <>Dieses Turnier ist beendet. Alles Ändernde ist gesperrt (read-only).</>
    ) : (
      <>Du bist als Zuschauer eingeloggt. Änderungen sind deaktiviert.</>
    )}
  </div>
)}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-lg font-semibold flex items-baseline gap-2">
                    <span>Spieler hinzufügen</span>
                    <span className="text-xs text-neutral-500">
                      {data?.players ? `(${data.players.length} gesamt)` : null}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
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
                  {/*}
                  <div className="mt-2 flex gap-2">
                    <Select
                      value={selectedProfileId}
                      onChange={(e) => setSelectedProfileId(e.target.value)}
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
                      disabled={busy || locked || !selectedProfileId}
                      onClick={addPlayerFromProfile}
                    >
                      Hinzufügen
                    </Button>
                  </div>
                  */}
<div className="mt-2 flex gap-2">
  <ProfilePicker
    profiles={profiles}
    value={selectedProfileId}
    onChange={(id) => setSelectedProfileId(id)}
    disabled={busy || locked}
  />

  <Button
    variant="secondary"
    disabled={busy || locked || !selectedProfileId}
    onClick={addPlayerFromProfile}
    className="h-10 px-3 text-sm"
  >
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
          </div>

          {notice && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              {notice}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-xl font-semibold">Runde starten</div>
        </CardHeader>
        {/*}
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="md:flex-1">
                <Select
                  className="w-full"
                  value={startOrderMode}
                  onChange={(e) =>
                    setStartOrderMode(
                      e.target.value as "random" | "standings_asc"
                    )
                  }
                  disabled={busy || locked}
                >
                  <option value="random">Zufällig</option>
                  <option value="standings_asc">
                    Schlechtester zuerst (nach aktueller Wertung)
                  </option>
                </Select>
                <p className="text-sm text-neutral-500 leading-snug">
                  Diese Einstellung beeinflusst nur die Reihenfolge{" "}
                  <b>innerhalb der Matches</b>, nicht die Gruppenzuordnung.
                  Swiss- oder Matchplay-Logik bleiben unverändert.
                </p>
 


                
                <Button
                  disabled={
                    busy || hasOpenPositions || locked || superFinalRunning
                  }
                  variant="secondary"
                  onClick={recalcElo}
                  //disabled={busy}
                >
                  Elo neu berechnen
                </Button>
              </div>

              <div className="md:w-auto">
                <Button
                  className="w-full md:w-auto px-6 py-3 font-semibold"
                  onClick={createRound}
                  disabled={
                    busy || hasOpenPositions || locked || superFinalRunning
                  }
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
                  <Button
                  disabled={
                    busy || hasOpenPositions || locked || superFinalRunning
                  }
                  variant="secondary"
                  onClick={recalcElo}
                  //disabled={busy}
                >
                  Elo neu berechnen
                </Button>

        
  <div className="mt-2 flex justify-between gap-3 ml-auto">
  <span className="text-sm">
    Elo für diese Runde berechnen
  </span>

  <button
    type="button"
    onClick={() => {
      if (busy || locked) return;
      setUseElo((prev) => !prev);
    }}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition
      ${useElo ? "bg-emerald-500" : "bg-neutral-300"}
      ${busy || locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition
        ${useElo ? "translate-x-4" : "translate-x-1"}`}
    />
  </button>

</div>

            </div>


          </div>
        </CardBody> */}
<CardBody>
  <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start">

    {/* 🔹 LINKER BLOCK — Dropdown + Erklärung */}
    <div className="space-y-3">
      <Select
        className="w-full"
        value={startOrderMode}
        onChange={(e) => setStartOrderMode(e.target.value as any)}
        disabled={busy || locked}
      >
        <option value="random">Zufällig</option>
        <option value="standings_asc">
          Schlechtester zuerst (nach aktueller Wertung)
        </option>
      </Select>

      <p className="text-sm text-neutral-500 leading-snug">
        Diese Einstellung beeinflusst nur die Reihenfolge{" "}
        <b>innerhalb der Matches</b>, nicht die Gruppenzuordnung.
        Swiss- oder Matchplay-Logik bleiben unverändert.
      </p>
    </div>

    {/* 🔹 RECHTER BLOCK — Buttons + Toggle sauber in Leiste */}
    <div className="flex flex-col gap-3 items-end">

      <Button
        className="px-6 py-3 font-semibold"
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
      {/*
      <Button
      
        variant="secondary"
        onClick={recalcElo}
                      disabled={
                    busy || hasOpenPositions || locked || superFinalRunning
                  }
        
      >
        Elo neu berechnen
      </Button>
      */}

      {/* ⭐ Toggle in einer cleanen Zeile */}
      <div className="flex items-center gap-3 text-sm text-neutral-600">
        <span className="whitespace-nowrap">Elo für diese Runde berechnen</span>
        <button
          type="button"
          onClick={() => setUseElo((prev) => !prev)}
          disabled={busy || locked}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition
            ${useElo ? "bg-emerald-500" : "bg-neutral-300"}
            ${(busy || locked) ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition
              ${useElo ? "translate-x-4" : "translate-x-1"}`}
          />
        </button>
      </div>
    </div>
  </div>
</CardBody>



      </Card>

      <MachinesList
        machines={data?.machines ?? []}
        onToggle={toggleMachine}
        busy={busy}
        locked={locked}
        usageCounts={machineUsageCounts}
      />

      <PlayersList
        players={data?.players ?? []}
        profAvatar={profAvatar}
        profRating={profRating}
        playersById={playersById}
        onReload={reloadAll}
        onToggle={togglePlayer}
        busy={busy}
        locked={locked}
        eloDeltas={eloDeltas} 
      />

      <Stats code={code} tournamentName={tournamentName} />

<div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-stretch">
  {/* 🔹 LINKE SEITE */}
  <div className="lg:flex-[3] min-w-0">
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
  </div>

  {/* 🔹 RECHTE SEITE */}
  <div className="lg:flex-[1] min-w-0">
<div className="rounded-2xl border bg-white p-3 h-full flex flex-col">
  <div className="sticky top-4">
    <MiniLeaderboard code={code} />
  </div>
</div>
  </div>
</div>


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
                Hier kannst du jederzeit ein optionales Super-Finale mit den
                besten 4 Spielern aus dem aktuellen Leaderboard starten. Seed 1
                beginnt mit 3 Punkten, Seed 2 mit 2, Seed 3 mit 1, Seed 4 mit 0.
                Wer zuerst 4 Punkte erreicht, wird{" "}
                <b>Super Grand Champion</b>.
              </p>
              <div>
                <Button
                  disabled={busy || locked || !hasAtLeastOneFinishedRound}
                      title={
                  !hasAtLeastOneFinishedRound
                    ? 'Erst eine Runden abschließen (Status "finished")'
                    : ""
                }
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
                  <div className="col-span-3 text-right">
                    Aktuelle Punkte
                  </div>
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
                        onClick={() => handleFinalWinClick(p)}
                      >
                        {p.name}
                      </Button>
                    ))}
                    <div className="mt-4 flex items-center justify-end gap-2 text-xs text-amber-800 ml-auto">
                      <span>Elo-Berechnung im Super-Finale</span>
                      <button
                        type="button"
                        onClick={handleToggleSuperfinalElo}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition
                          ${superfinalEloEnabled ? "bg-emerald-500" : "bg-neutral-300"}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition
                            ${superfinalEloEnabled ? "translate-x-4" : "translate-x-1"}`}
                        />
                      </button>
                    </div>
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
                      <div className="col-span-3 text-right">
                        Finalpunkte
                      </div>
                    </div>
                    {finalState.ranking.map((r: any) => (
                      <div
                        key={r.playerId}
                        className={
                          "grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center " +
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
                            : r.rank}
                          .
                        </div>
                        <div className="col-span-4">{r.name}</div>
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

      <div className="sticky bottom-0 left-0 right-0 bg-[rgb(250,250,250)] p-4 flex z-20">
        <Button
          disabled={
            busy || hasOpenPositions || locked || superFinalRunning
          }
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
