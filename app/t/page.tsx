// @ts-nocheck
"use client";

import { useEffect, useMemo, useState, useRef, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { Button, Card, CardBody, CardHeader, Input, Pill, Select } from "@/components/ui";
import { BarChart, Sparkline, RoundPointsBars, CumulativePointsLine } from "@/components/charts";
import QRCode from "qrcode";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import LocationsTab from "./LocationsTab";
import PlayersTab from "./PlayersTab";
import { ProfilePicker } from "@/components/ProfilePicker";
import AdminTab from "./AdminTab";
import Image from "next/image";
import PinballScore from "@/components/PinballScore";
import AnnouncerAvatar from "@/components/AnnouncerAvatar";
import CreateTournamentForm from "@/components/CreateTournamentForm";
import RotationTimerOverlay from "@/components/RotationTimerOverlay";
import ScoreInput from "@/components/ScoreInput";
import { computeProvisionalRotationPoints, SUPER_FINAL_TP_BONUS } from "@/lib/points";
import { PointsSystemButton, PointsSchemeLine, PointsGainBadge } from "@/components/PointsSystemInfo";
import VersionBadge from "@/components/VersionBadge";
import LiveTvButton from "@/components/LiveTvButton";
import HomeTiles from "@/components/HomeTiles";
import ThemeToggle from "@/components/ThemeToggle";
import MatchRecordsLine, { PersonalBestLine } from "@/components/MatchRecordsLine";
import { liveEntriesFrom } from "@/lib/recordWatch";
import RecordCelebration from "@/components/RecordCelebration";
import { matchPointsForDisplay } from "@/lib/pointsDisplay";


function getExpectedPlayersForEliminationRound__DEPRECATED__nested(
  roundNumber: number,
  rounds: any[]
): number | null {
  if (!roundNumber || !Array.isArray(rounds)) return null;

  // erste Runde finden (kleinste Nummer)
  const firstRound = rounds
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number))[0];

  if (!firstRound?.matches) return null;

  // Startspieler = DISTINCT player_id aus Runde 1
  const playerIds = new Set<string>();

  for (const m of firstRound.matches) {
    for (const mp of m.match_players ?? []) {
      if (mp.player_id) {
        playerIds.add(String(mp.player_id));
      }
    }
  }

  const startTotal = playerIds.size;
  if (!startTotal) return null;

  // Elimination: jede Runde -1 Spieler
  return Math.max(2, startTotal - (roundNumber - 1));
}




// ================================
// Hauptrunden-Farben (müssen 1:1 zu MatchplayProgressStack passen)
// ================================
const MAIN_ROUND_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#64748b",
  "#06b6d4",
  "#14b8a6",
  "#db2777",
];

function nCk(n: number, k: number): number {
  // Kombinatorik: "n über k"
  n = Math.max(0, Math.floor(Number(n) || 0));
  k = Math.max(0, Math.floor(Number(k) || 0));
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - k + i)) / i;
  }
  // sollte bei unseren Größen ganzzahlig sein
  return Math.round(res);
}


// Competition Ranking (1,1,1,4 ...) based on equal points (expects rows already sorted DESC)
function computeCompetitionPlaces<T>(rows: T[], getPoints: (r: T) => number) {
  const places: number[] = [];
  let lastPoints: number | null = null;
  let lastPlace = 0;

  for (let i = 0; i < rows.length; i++) {
    const pts = Number(getPoints(rows[i]) ?? 0);
    const place = lastPoints !== null && pts === lastPoints ? lastPlace : i + 1;
    places.push(place);
    lastPoints = pts;
    lastPlace = place;
  }
  return places;
}

function medalForPlace(place: number) {
  return place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";
}

// ✅ Kategorien, die es wirklich gibt (alle Turniere, Schreibweisen zusammengefasst)
type CategoryInfo = { name: string; count: number; finished: number; lastUsed: string | null };
function useExistingCategories(enabled = true) {
  const [cats, setCats] = useState<CategoryInfo[]>([]);
  const [names, setNames] = useState<CategoryInfo[]>([]);
  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/categories?_ts=${Date.now()}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setCats(Array.isArray(j.categories) ? j.categories : []);
        setNames(Array.isArray(j.names) ? j.names : []);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);
  return { cats, names, reload };
}

// Vorschlags-Chips für Kategorien (Klick übernimmt die exakte Schreibweise)
function CategoryChips({
  cats,
  value,
  onPick,
  label = "Vorhandene Kategorien:",
  limit,
}: {
  cats: CategoryInfo[];
  value: string;
  onPick: (c: string) => void;
  label?: string;
  /** nur die ersten N zeigen, Rest per "+ alle anzeigen" */
  limit?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!cats.length) return null;
  const visible = limit && !showAll ? cats.slice(0, limit) : cats;
  const hidden = cats.length - visible.length;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="mr-1 text-neutral-500">{label}</span>
      {visible.map((c) => {
        const active = value.trim().toLowerCase() === c.name.toLowerCase();
        return (
          <button
            key={c.name}
            type="button"
            onClick={() => onPick(c.name)}
            title={`${c.count} Turnier${c.count === 1 ? "" : "e"} (${c.finished} beendet)`}
            className={
              "rounded-full px-2.5 py-1 transition " +
              (active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200")
            }
          >
            {c.name} <span className={active ? "text-white/60" : "text-neutral-400"}>{c.count}</span>
          </button>
        );
      })}
      {limit && cats.length > limit ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="rounded-full px-2.5 py-1 font-medium text-blue-700 hover:bg-blue-50"
        >
          {showAll ? "weniger anzeigen" : `+ alle anzeigen (${hidden})`}
        </button>
      ) : null}
    </div>
  );
}

// ✏️ Dialog: NUR Name + Kategorie eines (beendeten) Turniers ändern
function EditTournamentMetaDialog({
  open,
  code,
  initialName,
  initialCategory,
  onClose,
  onSaved,
}: {
  open: boolean;
  code: string;
  initialName: string;
  initialCategory: string;
  onClose: () => void;
  onSaved: (t: { name: string; category: string | null }) => void;
}) {
  const [name, setName] = useState(initialName);
  const [cat, setCat] = useState(initialCategory);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { cats } = useExistingCategories(open);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setCat(initialCategory);
      setErr(null);
    }
  }, [open, initialName, initialCategory]);

  if (!open) return null;

  const changed = name.trim() !== initialName.trim() || cat.trim() !== initialCategory.trim();
  const catIsNew =
    cat.trim().length > 0 && !cats.some((c) => c.name.toLowerCase() === cat.trim().toLowerCase());

  async function save() {
    if (!name.trim()) {
      setErr("Der Name darf nicht leer sein.");
      return;
    }
    const lines = [];
    if (name.trim() !== initialName.trim()) lines.push(`Name: „${initialName}“ → „${name.trim()}“`);
    if (cat.trim() !== initialCategory.trim())
      lines.push(`Kategorie: „${initialCategory || "—"}“ → „${cat.trim() || "—"}“`);
    if (!confirm(`Turnier ${code} wirklich ändern?\n\n${lines.join("\n")}\n\nErgebnisse, Elo und Turnierpunkte bleiben unverändert.`))
      return;

    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/tournaments/update-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, category: cat }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? "Speichern fehlgeschlagen");
        return;
      }
      onSaved({ name: j.tournament?.name ?? name.trim(), category: j.tournament?.category ?? null });
      onClose();
    } catch {
      setErr("Netzwerkfehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">✏️ Name / Kategorie ändern</div>
            <div className="text-xs text-neutral-500">
              Turnier <span className="font-mono">{code}</span> · Ergebnisse, Elo und Turnierpunkte bleiben unverändert.
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1 text-sm text-neutral-600">Turniername</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-sm text-neutral-600">Kategorie / Serie</div>
            <Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="z.B. Chill-Turnier" />
            <CategoryChips cats={cats} value={cat} onPick={setCat} />
            {catIsNew ? (
              <div className="mt-1.5 text-xs text-amber-700">
                Hinweis: „{cat.trim()}“ ist eine <b>neue</b> Kategorie. Das Turnier zählt dann in einer eigenen Serie.
              </div>
            ) : null}
          </div>
          {err ? <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={saving || !changed}>
            {saving ? "Speichere…" : "Speichern"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ✅ Turnierpunkte aufgeschlüsselt: "6 + 2 🔥" wenn ein Superfinale-Bonus enthalten ist
// tp = gespeicherte Turnierpunkte (inkl. Bonus), bonus = Superfinale-Anteil
function TpWithBonus({ tp, bonus }: { tp: number; bonus: number }) {
  if (!bonus) return <>{tp}</>;
  return (
    <span title={`${tp - bonus} Turnierpunkte + ${bonus} Superfinale-Bonus = ${tp}`}>
      {tp - bonus}
      <span className="ml-1 whitespace-nowrap text-orange-600">+{bonus} 🔥</span>
    </span>
  );
}


function calcRoundsPerCycle(tournament: any, playersCount: number | null | undefined): number | null {
  const n =
    Number(playersCount ?? 0) ||
    Number(tournament?.playersCount ?? 0) ||
    Number(tournament?.players_count ?? 0) ||
    (Array.isArray(tournament?.players) ? tournament.players.length : 0);

  const matchSize = Math.max(2, Number(tournament?.match_size ?? 2) || 2);
  const matchesPerRound = Math.max(1, Math.floor(n / matchSize));

  const formatRaw = String(tournament?.format ?? "").toLowerCase();
  const isDyp =
    formatRaw === "dyp_round_robin" ||
    formatRaw === "dyp round robin" ||
    formatRaw === "dyp" ||
    formatRaw.includes("dyp");

  // ✅ 1vs1: klassische Pairings (jeder gegen jeden)
  if (matchSize === 2) {
    const pairingsPerMatch = 1; // (2 * 1) / 2
    const pairingsPerRound = matchesPerRound * pairingsPerMatch;
    const totalPairings = (n * (n - 1)) / 2;

    if (!Number.isFinite(pairingsPerRound) || pairingsPerRound <= 0) return null;
    if (!Number.isFinite(totalPairings) || totalPairings <= 0) return null;

    return Math.max(1, Math.ceil(totalPairings / pairingsPerRound));
  }

  // ✅ DYP Round Robin (Teams): Match besteht aus 2 Teams (matchSize ist Gesamtspieler pro Match)
  // Beispiel n=4, matchSize=4 → teamSize=2 → mögliche Team-vs-Team-Aufteilungen: 3 (AB vs CD, AC vs BD, AD vs BC)
  // Allgemein:
  // - Auswahl der Spieler fürs Match: C(n, matchSize)
  // - Aufteilungen in 2 Teams gleicher Größe (unordered): C(matchSize, teamSize)*C(matchSize-teamSize, teamSize)/2
  // - Pro Runde gibt es matchesPerRound Matches → combosPerRound = matchesPerRound
  if (isDyp && matchSize >= 4 && matchSize % 2 === 0) {
    const teamSize = matchSize / 2;

    const partitionsInMatch =
      (nCk(matchSize, teamSize) * nCk(matchSize - teamSize, teamSize)) / 2;

    const totalCombos = nCk(n, matchSize) * partitionsInMatch;
    const combosPerRound = matchesPerRound;

    if (!Number.isFinite(partitionsInMatch) || partitionsInMatch <= 0) return null;
    if (!Number.isFinite(totalCombos) || totalCombos <= 0) return null;
    if (!Number.isFinite(combosPerRound) || combosPerRound <= 0) return null;

    return Math.max(1, Math.ceil(totalCombos / combosPerRound));
  }

  // ✅ 3er/4er/...: Hauptrunde = ALLE k-Kombinationen genau einmal (C(n,k))
  // combosPerRound = matchesPerRound (jedes Match ist genau eine k-Kombi)
  const totalCombos = nCk(n, matchSize);
  const combosPerRound = matchesPerRound;

  if (!Number.isFinite(totalCombos) || totalCombos <= 0) return null;
  if (!Number.isFinite(combosPerRound) || combosPerRound <= 0) return null;

  return Math.max(1, Math.ceil(totalCombos / combosPerRound));
}

type Tournament = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  category?: string;
  format?: string | null;          // ← NEU
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
  // 👇 NEU: Flipperpunkte/Score pro Spieler & Match
  score?: number | null;
  // 👇 DYP: Team (1|2)
  team?: number | null;
  // ✅ TIMEPLAY
  time_ms?: number | null;
};

type Location = { id: string; name: string };

type PlayerVisual = {
  name: string;
  profile_id?: string | null;
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

// 🔎 Top-N Details (für "Top-2 je Spieler")
type TournamentTopSelection = {
  profileId: string | null;
  name: string;
  avatar_url: string | null;
  color: string | null;
  icon: string | null;
  totalInFilter: number;
  selected: Array<{
    tournament_id: string;
    tournament_code: string | null;
    tournament_name: string | null;
    tournament_category: string | null;
    created_at: string | null;
    final_rank: number | null;
    tournament_points: number;
  }>;
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
        className="flex h-7 w-7 flex items-center justify-center rounded-full text-xs font-bold"
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

function SortablePlayerRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      disabled,
    });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag Handle links */}
      {!disabled ? (
        <button
          type="button"
          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md border bg-white text-sm hover:bg-neutral-50"
          title="Ziehen zum Umordnen"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
      ) : null}

      <div className={!disabled ? "pl-12" : ""}>{children}</div>
    </div>
  );
}

//Format Mapping Touor
function formatLabel(fmt?: string | null) {
  const v = (fmt ?? "").trim();
  if (!v) return "—";
  const map: Record<string, string> = {
    matchplay: "Matchplay",
    rotation: "Rotation",
    dyp_round_robin: "DYP Round Robin",
    dyp: "DYP",
    round_robin: "Round Robin",
    group_matchplay: "Group Matchplay",
    elimination: "Crazy Elimination",
    rotation: "Round the Pinball",
  };
  return map[v] ?? v.replaceAll("_", " ");
}

function formatStyle(fmt?: string | null) {
  const v = (fmt ?? "").trim();

  const map: Record<string, string> = {
    matchplay: "bg-blue-100 text-blue-800",          // 🟦
    elimination: "bg-red-100 text-red-800",          // 🟥
    swiss: "bg-green-100 text-green-800",            // 🟩
    rotation: "bg-amber-100 text-amber-800",          // 🟨
    dyp: "bg-purple-100 text-purple-800",            // 🟪
    dyp_round_robin: "bg-purple-100 text-purple-800",
    round_robin: "bg-neutral-100 text-neutral-700",
    group_matchplay: "bg-neutral-100 text-neutral-700",
  };

  return map[v] ?? "bg-neutral-100 text-neutral-600";
}

function formatStyleRound(fmt?: string | null) {
  const v = (fmt ?? "").trim();

  const map: Record<string, string> = {
    matchplay: "text-blue-600",          // 🟦
    elimination: "text-red-800",          // 🟥
    swiss: "text-green-600",            // 🟩
    rotation: "text-amber-700",          // 🟨

    dyp: "test-purple-100",            // 🟪
    dyp_round_robin: "text-purple-600",
    round_robin: "bg-neutral-100",
    group_matchplay: "bg-neutral-600",
  };

  return map[v] ?? "bg-neutral-100 text-neutral-600";
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
  profiles,   
  profAvatar,
  profRating,
  playersById,
  onReload,
  onToggle,
  busy,
  locked,
  eloDeltas,
  eloShieldedByProfile, // ✅ NEU
}: any) {
  const active = (players ?? []).filter((p: any) => p.active);
  const inactive = (players ?? []).filter((p: any) => !p.active);
  const profilesById: Record<string, any> = {};
  for (const pr of profiles ?? []) {
    if (pr?.id) profilesById[pr.id] = pr;
  }

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

const prof = p.profile_id ? profilesById[p.profile_id] : null;

const k =
  prof
    ? (Number(prof.provisional_matches ?? 0) > 0
        ? 32
        : Number(prof.matches_played ?? 0) < 30
        ? 24
        : 16)
    : null;

const kBadgeClass =
  k === 32
    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : k === 24
    ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-neutral-600 bg-neutral-50 border-neutral-200";


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
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerPill player={pv} />

                        {typeof k === "number" && (
                          <span
                            className={
                              "shrink-0 rounded-full border px-2 py-[1px] text-[11px] font-bold tabular-nums " +
                              kBadgeClass
                            }
                            title={
                              prof
                                ? `K=${k} • matches_played=${prof.matches_played ?? 0} • provisional=${prof.provisional_matches ?? 0}`
                                : "Kein Profil gefunden"
                            }
                          >
                            K{k}
                          </span>
                        )}
                      </div>


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

                  {hasDelta && eloShieldedByProfile?.[p.profile_id] === true && (
                    <span
                      className="ml-1 text-xs text-sky-700"
                      title="Elo-Schutz aktiv (×0.5 gegen Provisional-Gegner)"
                    >
                      🛡
                    </span>
                  )}

                </div>

                <div className="flex items-center gap-2">

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
  isTimeplayFormat,
  taskDifficulties,
  eligibleMachineIds,
  eligibleMachinesLoading,
}: {
  machines: any[];
  onToggle: (id: string) => void;
  busy: boolean;
  locked: boolean;
  usageCounts?: Record<string, number>;
  isTimeplayFormat: boolean;
  taskDifficulties: string[];
  eligibleMachineIds: string[] | null; // null = nicht relevant (kein Timeplay)
  eligibleMachinesLoading?: boolean;
}) {
  // In Timeplay gilt: "effektiv aktiv" = in DB aktiv UND eligible (hat Tasks in gewählten Difficulties).
  // In allen anderen Formaten: eligible spielt keine Rolle.
  const eligibleSet =
    isTimeplayFormat && Array.isArray(eligibleMachineIds)
      ? new Set((eligibleMachineIds ?? []).map((x) => String(x)))
      : null;

  function isEligible(m: any) {
    if (!isTimeplayFormat) return true;
    if (!eligibleSet) return true; // solange Preview noch nicht da ist, nichts blocken
    return eligibleSet.has(String(m.id));
  }

  const effectiveActive = (machines ?? []).filter((m) => Boolean(m?.active) && isEligible(m));
  const effectiveInactive = (machines ?? []).filter((m) => !Boolean(m?.active) || !isEligible(m));

  // ✅ max Nutzung für Balken-Skalierung (mind. 1, damit wir nicht durch 0 teilen)
  const maxUsedCount = Math.max(
    1,
    ...((machines ?? []).map((m) => usageCounts?.[String(m.id)] ?? 0))
  );

  const diffLabel =
    Array.isArray(taskDifficulties) && taskDifficulties.length
      ? taskDifficulties.join(", ")
      : "—";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>Maschinen</div>

            {isTimeplayFormat && (
              <span className="text-xs text-neutral-500">
                (Timeplay • Tasks: {diffLabel}
                {eligibleMachinesLoading ? " • prüfe…" : ""})
              </span>
            )}
          </div>

          <div className="text-sm text-neutral-500">
            {effectiveActive.length} aktiv • {effectiveInactive.length} inaktiv • {machines.length} gesamt
          </div>
        </div>
      </CardHeader>

      <CardBody>
        <div className="space-y-2">
          {(machines ?? []).map((m) => {
            const count = usageCounts?.[String(m.id)] ?? 0;
            const pct = Math.round((count / maxUsedCount) * 100);

            const eligible = isEligible(m);
            const effectiveIsActive = Boolean(m?.active) && eligible;

            // Timeplay: nicht-eligible Maschinen sollen "inaktiv" wirken und nicht klickbar sein.
            const disableToggle = busy || locked || (isTimeplayFormat && eligibleSet && !eligible);

            return (
              <div
                key={m.id}
                className={
                  "flex items-center justify-between gap-3 rounded-xl border bg-white px-2 py-1 " +
                  (isTimeplayFormat && eligibleSet && !eligible ? "opacity-50" : "")
                }
                title={
                  isTimeplayFormat && eligibleSet && !eligible
                    ? `Keine aktiven Tasks für (${diffLabel})`
                    : undefined
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MachineIcon name={m.name} emoji={m.icon_emoji} />

                  <div className="flex flex-col min-w-0">
                    <div className="text-base font-medium truncate">{m.name}</div>

                    <div className="mt-1 flex items-center gap-2">
                      <div className="text-xs text-neutral-500 whitespace-nowrap">
                        {count}× im Turnier verwendet
                      </div>

                      {isTimeplayFormat && eligibleSet && !eligible && (
                        <div className="text-xs text-neutral-500 truncate">
                          • keine Tasks ({diffLabel})
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="h-2 w-40 rounded-full bg-neutral-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-neutral-400/70"
                      style={{ width: `${pct}%` }}
                      aria-label={`${count}× verwendet`}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={disableToggle}
                  onClick={() => onToggle(m.id)}
                  className={
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                    (disableToggle ? "cursor-not-allowed " : "") +
                    (effectiveIsActive
                      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                      : "bg-neutral-100 text-neutral-600 border-neutral-200")
                  }
                >
                  <span
                    className={
                      "mr-2 h-2 w-2 rounded-full " +
                      (effectiveIsActive ? "bg-emerald-500" : "bg-neutral-400")
                    }
                  />
                  {effectiveIsActive ? "aktiv" : "inaktiv"}
                </button>
              </div>
            );
          })}

          {(!machines || machines.length === 0) && (
            <div className="text-sm text-neutral-500">Noch keine Maschinen.</div>
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

  {/*
  const [sortKey, setSortKey] = useState<SortKey>("matches");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  */}
  const [sortKey, setSortKey] = useState<SortKey>("winrate");
  const [sortDir, setSortDir] = useState<SortDir>("dsc"); // kleiner Ø-Platz = besser

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
  <div className="flex items-center gap-2 min-w-0">


    
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
        title={isOpen ? "Schließen" : "Öffnen der Turniere aus denen die Zeile zusammengesetzt wird"}
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
    "elo" | "tournaments" | "matches" | "highscores"
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

const [tournamentTopN, setTournamentTopN] = useState<number | null>(null);
const [tournamentTopSelection, setTournamentTopSelection] =
  useState<TournamentTopSelection[]>([]);
const [showTournamentTopSelection, setShowTournamentTopSelection] =
  useState(false);
  const topActive = typeof tournamentTopN === "number" && tournamentTopN > 0;
 const [expandedTournamentPlayerKey, setExpandedTournamentPlayerKey] =
  useState<string | null>(null);

  function tournamentPlayerKey(row: { profileId: string | null; name: string }) {
  return row.profileId ? String(row.profileId) : `name:${row.name}`;
}



  type PlayerTournamentDetailRow = {
  tournament_id: string;
  tournament_code: string | null;
  tournament_name: string | null;
  tournament_category: string | null;
  created_at: string | null;
  final_rank: number | null;
  tournament_points: number;
};

const [playerTournamentDetails, setPlayerTournamentDetails] = useState<
  Record<string, PlayerTournamentDetailRow[]>
>({});

const [playerTournamentDetailsLoading, setPlayerTournamentDetailsLoading] =
  useState<Record<string, boolean>>({});



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

function isActiveGlobalPreset(p: GlobalPreset) {
  const cat = (p.category || "").trim();
  const name = (p.name || "").trim();
  const from = p.date_from || "";
  const to = p.date_to || "";

  return (
    tournamentFilterCategory.trim() === cat &&
    tournamentFilterName.trim() === name &&
    (tournamentFilterFrom || "") === from &&
    (tournamentFilterTo || "") === to
  );
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

setExpandedTournamentPlayerKey(null);
setPlayerTournamentDetails({});
setPlayerTournamentDetailsLoading({});

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

function isActivePreset(p: any) {
  return (
    (p.category ?? "") === (tournamentFilterCategory ?? "") &&
    (p.name ?? "") === (tournamentFilterName ?? "")
  );
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

  // --- Highscores (pro Maschine) ---
type HighscoreMachine = {
  key: string;
  name: string;
  icon?: string | null;
  location?: string | null;
  top: Array<{
    score: number;
    player: string;
    tournament: string;
    tournamentCreatedAt?: string | null; // ✅ HIER rein
  }>;
};

const [highscoreMachines, setHighscoreMachines] = useState<HighscoreMachine[]>([]);
const [highscoreLoading, setHighscoreLoading] = useState(false);
const [highscoreError, setHighscoreError] = useState<string | null>(null);

// --- Highscores (global pro Spieler) ---
type HighscorePlayerRow = {
  player: string;
  wins: number;     // 🥇
  podiums: number;  // 🥇+🥈+🥉  ← NEU
  points: number;   // 🥇=3, 🥈=2, 🥉=1
};

const globalHighscorePlayers = useMemo<HighscorePlayerRow[]>(() => {
  const map = new Map<string, HighscorePlayerRow>();

  for (const m of highscoreMachines ?? []) {
    const top = (m.top ?? []).slice(0, 3);

    top.forEach((s, idx) => {
      const name = (s.player ?? "Unbekannt").trim() || "Unbekannt";
      const points = idx === 0 ? 3 : idx === 1 ? 2 : 1;

      if (!map.has(name)) {
        map.set(name, { player: name, wins: 0, podiums: 0, points: 0 });
      }

      const row = map.get(name)!;

      // jeder Top-3 Eintrag ist ein Podium
      row.podiums += 1;

      // Punkte
      row.points += points;

      // Siege
      if (idx === 0) row.wins += 1;

    });
  }

  const arr = Array.from(map.values());
  arr.sort(
  (a, b) =>
    b.points - a.points ||
    b.wins - a.wins ||
    b.podiums - a.podiums ||
    a.player.localeCompare(b.player)
  );

  return arr;
}, [highscoreMachines]);

const top3Global = useMemo(() => globalHighscorePlayers.slice(0, 3), [globalHighscorePlayers]);

function fmtScore(n: any) {
  // 3er-Blöcke mit Punkt wie am Flipper: 5.675.223
  return Number(n ?? 0).toLocaleString("de-DE");
}


async function loadHighscores() {
  setHighscoreMachines([]);        // HARD RESET
  setHighscoreError(null);
  setHighscoreLoading(true);

  try {
    const res = await fetch(`/api/leaderboards/highscores?ts=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setHighscoreError(j.error ?? "Konnte Highscores nicht laden.");
      setHighscoreMachines([]);
      return;
    }

    setHighscoreMachines(j.machines ?? []);
  } catch {
    setHighscoreError("Konnte Highscores nicht laden (Netzwerkfehler?).");
    setHighscoreMachines([]);
  } finally {
    setHighscoreLoading(false);
  }
}


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
    if (!filterTournamentList) {
      loadFilteredTournamentListWith("", "", "", "");
    }
  } else if (subTab === "matches") {
    setMatchRows([]);        // HARD RESET
    loadMatchHistory();
  }
  else if (subTab === "highscores") {
    setHighscoreMachines([]); // HARD RESET
    loadHighscores();
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
async function loadTournamentSuccess(ignoreFilters = false,
  topOverride?: number | null
) {
  const topN = topOverride === null ? null : (topOverride ?? tournamentTopN);
  setTournamentLoading(true);
  setTournamentError(null);

  // Hard Reset – alte Daten weg
  setTournamentRows([]);
  setTournamentTopSelection([]);
  setShowTournamentTopSelection(false);

  try {
    const params = new URLSearchParams();
    params.set("ts", String(Date.now()));

if (typeof topN === "number" && topN > 0) {
  params.set("top", String(topN));
}

    const cat = ignoreFilters ? "" : tournamentFilterCategory.trim();
    const name = ignoreFilters ? "" : tournamentFilterName.trim();
    const from = ignoreFilters ? "" : tournamentFilterFrom;
    const to = ignoreFilters ? "" : tournamentFilterTo;

    if (cat) params.set("category", cat);
    if (name) params.set("search", name);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const url = `/api/leaderboards/tournaments?${params.toString()}`;

    const res = await fetch(url, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setTournamentError(j.error ?? "Konnte Turniererfolge-Leaderboard nicht laden.");
      setTournamentRows([]);
      setTournamentTopSelection([]);
      setShowTournamentTopSelection(false);
      return;
    }

    setTournamentRows(j.rows ?? []);
    setTournamentTopSelection(j.selection ?? []);

{/*
    if (typeof tournamentTopN === "number" && (j.selection?.length ?? 0) > 0) {
  setShowTournamentTopSelection(false); 
} */}
  } catch {
    setTournamentError("Konnte Turniererfolge-Leaderboard nicht laden (Netzwerkfehler?).");
    setTournamentRows([]);
    setTournamentTopSelection([]);
    setShowTournamentTopSelection(false);
  } finally {
    setTournamentLoading(false);
  }
}


async function loadTournamentSuccessWith(
  category: string,
  search: string,
  from: string,
  to: string,
  topOverride?: number | null
) {
 const effectiveTopN = topOverride === null ? null : (topOverride ?? tournamentTopN);

  setTournamentLoading(true);
  setTournamentError(null);

  // Hard Reset – alte Daten weg
  setTournamentRows([]);
  setExpandedTournamentPlayerKey(null);
  setPlayerTournamentDetails({});
  setPlayerTournamentDetailsLoading({});

  setTournamentTopSelection([]);
  setShowTournamentTopSelection(false);

  try {
    const params = new URLSearchParams();
    params.set("ts", String(Date.now()));

    // ✅ WICHTIG: hier top2 benutzen, NICHT tournamentTop2Only
if (typeof effectiveTopN === "number" && effectiveTopN > 0) {
  params.set("top", String(effectiveTopN));
}

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
      setTournamentTopSelection([]);
      setShowTournamentTopSelection(false);
      return;
    }

    setTournamentRows(j.rows ?? []);
    setTournamentTopSelection(j.selection ?? []);


  } catch {
    setTournamentError("Konnte Turniererfolge-Leaderboard nicht laden (Netzwerkfehler?).");
    setTournamentRows([]);
    setTournamentTopSelection([]);
    setShowTournamentTopSelection(false);
  } finally {
    setTournamentLoading(false);
  }
}


async function loadPlayerTournamentDetails(row: {
  profileId: string | null;
  name: string;
}) {
  const key = row.profileId ? String(row.profileId) : `name:${row.name}`;

  // ⛔ schon geladen → nichts tun
  if (playerTournamentDetails[key]) return;

  setPlayerTournamentDetailsLoading((prev) => ({ ...prev, [key]: true }));

  try {
    const params = new URLSearchParams();
    params.set("ts", String(Date.now()));

    if (row.profileId) params.set("profileId", row.profileId);
    else params.set("name", row.name);

    // gleiche Filter wie oben
    if (tournamentFilterCategory) params.set("category", tournamentFilterCategory);
    if (tournamentFilterName) params.set("search", tournamentFilterName);
    if (tournamentFilterFrom) params.set("from", tournamentFilterFrom);
    if (tournamentFilterTo) params.set("to", tournamentFilterTo);

    const res = await fetch(
      `/api/leaderboards/tournaments/player-details?${params.toString()}`,
      { cache: "no-store" }
    );

    const j = await res.json().catch(() => ({}));

    setPlayerTournamentDetails((prev) => ({
      ...prev,
      [key]: j.rows ?? [],
    }));
  } finally {
    setPlayerTournamentDetailsLoading((prev) => ({ ...prev, [key]: false }));
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
              onClick={() => setSubTab("highscores")}
              className={
                "rounded-full px-3 py-1 border text-xs font-medium " +
                (subTab === "highscores"
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50")
              }
            >
              Highscores
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

  const base = colors[idx % colors.length];
  const active = isActiveGlobalPreset(p);

  return (
    <div
      key={p.id}
      className={
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium transition " +
        base +
        (active
          ? " border-2 border-amber-500 ring-2 ring-amber-200 shadow-sm"
          : " border")
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
          className="ml-2 rounded-full px-2 py-0.5 text-[11px] text-neutral-700 hover:bg-white/60"
          title="Preset löschen"
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


                
                <div className="max-h-80 overflow-y-auto rounded-2xl  bg-white">






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
      place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "";

    const playerKey = row.profileId ?? row.name;
    const isExpanded = expandedTournamentPlayerKey === playerKey;

    const selectionForPlayer = tournamentTopSelection?.find((p) => {
      if (row.profileId && p.profileId) return p.profileId === row.profileId;
      return (p.name ?? "").trim() === (row.name ?? "").trim();
    });

    return (
      <Fragment key={row.profileId ?? row.name + idx}>
        {/* ✅ Hauptzeile (klickbar) */}
        <tr
          className={
            "border-b last:border-0 hover:bg-neutral-50/70 cursor-pointer " +
            (isExpanded ? "bg-neutral-50/50" : "")
          }

  onClick={() => {
    const key = tournamentPlayerKey(row);

    setExpandedTournamentPlayerKey((prev) =>
      prev === key ? null : key
    );

    // 🔹 NEU: nur wenn Top-N AUS ist
    if (!topActive) {
      loadPlayerTournamentDetails(row);
    }
  }}

          title={
            topActive
              ? "Klicken für Details (Top-Auswahl)"
              : "Klicken für Details (Top-N aktivieren, um eine Auswahl zu sehen)"
          }
        >
          <td className="py-1 pr-2 text-sm tabular-nums text-neutral-500 text-left">
            {medal ? <span>{medal}</span> : <span>{place}.</span>}
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

{/*Button Pfeil Turniere */}
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    const key = tournamentPlayerKey(row);
    setExpandedTournamentPlayerKey((prev) => (prev === key ? null : key));

    // nur wenn Top-N AUS ist
    if (!topActive) {
      loadPlayerTournamentDetails(row);
    }
  }}
  className={
    "mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md " +
    "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 " +
    "transition-transform duration-200 " +
    (isExpanded ? "rotate-180" : "rotate-0")
  }
  aria-label={isExpanded ? "Details schließen" : "Details öffnen"}
  title={isExpanded ? "Schließen" : "Öffnen der Turniere aus denen sich die Zeile zusammensetzt"}
>
  <span className="text-base leading-none">▾</span>
</button>

            </div>
          </td>

          <td className="py-1 pr-2 text-right tabular-nums">{row.tournamentsPlayed}</td>
          <td className="py-1 pr-2 text-right tabular-nums">{row.firstPlaces}</td>
          <td className="py-1 pr-2 text-right tabular-nums">{row.secondPlaces}</td>
          <td className="py-1 pr-2 text-right tabular-nums">{row.thirdPlaces}</td>
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

        {/* ✅ Detailbereich (aufklappbar) */}
        {isExpanded && (
          <tr
            className={`border-b last:border-0 hover:bg-neutral-50 ${
              idx === 0
                ? "bg-yellow-50"
                : idx === 1
                ? "bg-neutral-100"
                : idx === 2
                ? "bg-amber-50"
                : ""
            }`}
          >
            <td colSpan={9} className="py-2 pr-2">
              <div className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-neutral-700">
                    {topActive
                      ? `Top-${tournamentTopN} Turniere für ${row.name}`
                      : `Turniere für ${row.name}`}
                  </div>

                  {topActive && selectionForPlayer?.totalInFilter != null && (
                    <div className="text-[11px] text-neutral-500">
                      {selectionForPlayer.totalInFilter} im Filter
                    </div>
                  )}
                </div>

{topActive ? (
  // ✅ Top-N AN: Auswahl aus der API (tournamentTopSelection)
  !selectionForPlayer || (selectionForPlayer.selected?.length ?? 0) === 0 ? (
    <div className="text-xs text-neutral-500">Keine Auswahl gefunden.</div>
  ) : (
    <div className="max-h-48 overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-neutral-500 border-b">
            <th className="py-1 pr-2">Turnier</th>
            <th className="py-1 pr-2">Kategorie</th>
            <th className="py-1 pr-2">Code</th>
            <th className="py-1 pr-2">Datum</th>
            <th className="py-1 pr-2 text-right">Platz</th>
            <th className="py-1 pr-2 text-right">Punkte</th>
          </tr>
        </thead>
        <tbody>
          {(selectionForPlayer.selected ?? []).map((s, i) => (
            <tr
              key={`${playerKey}-${s.tournament_id}-${i}`}
              className="border-b last:border-0 hover:bg-neutral-50/70"
            >
              <td className="py-1 pr-2">{s.tournament_name ?? "—"}</td>
              <td className="py-1 pr-2 text-neutral-600">
                {s.tournament_category ?? "—"}
              </td>
              <td className="py-1 pr-2 tabular-nums text-neutral-500">
                {s.tournament_code ?? "—"}
              </td>
              <td className="py-1 pr-2 text-neutral-500">
                {s.created_at
                  ? new Date(s.created_at).toLocaleDateString("de-DE")
                  : "—"}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums text-neutral-600">
                {s.final_rank ?? "—"}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums font-semibold text-amber-600">
                <TpWithBonus tp={Number(s.tournament_points ?? 0)} bonus={s.super_final_rank === 1 ? SUPER_FINAL_TP_BONUS : 0} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
) : (
  // ✅ Top-N AUS: alle Turniere des Spielers laden/anzeigen
  (() => {
    const key = tournamentPlayerKey(row);
    const loading = playerTournamentDetailsLoading[key];
    const details = playerTournamentDetails[key] ?? [];

    if (loading) {
      return (
        <div className="text-xs text-neutral-500">Lade Turnierdetails…</div>
      );
    }

    if (details.length === 0) {
      return <div className="text-xs text-neutral-500">Keine Turniere gefunden.</div>;
    }

    return (
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] text-neutral-500 border-b">
              <th className="py-1 pr-2">Turnier</th>
              <th className="py-1 pr-2">Kategorie</th>
              <th className="py-1 pr-2">Code</th>
              <th className="py-1 pr-2">Datum</th>
              <th className="py-1 pr-2 text-right">Platz</th>
              <th className="py-1 pr-2 text-right">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {details.map((s, i) => (
              <tr
                key={`${key}-${s.tournament_id}-${i}`}
                className="border-b last:border-0 hover:bg-neutral-50/70"
              >
                <td className="py-1 pr-2">{s.tournament_name ?? "—"}</td>
                <td className="py-1 pr-2 text-neutral-600">
                  {s.tournament_category ?? "—"}
                </td>
                <td className="py-1 pr-2 tabular-nums text-neutral-500">
                  {s.tournament_code ?? "—"}
                </td>
                <td className="py-1 pr-2 text-neutral-500">
                  {s.created_at
                    ? new Date(s.created_at).toLocaleDateString("de-DE")
                    : "—"}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-neutral-600">
                  {s.final_rank ?? "—"}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums font-semibold text-amber-600">
                  <TpWithBonus tp={Number(s.tournament_points ?? 0)} bonus={s.super_final_rank === 1 ? SUPER_FINAL_TP_BONUS : 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  })()
)}

              </div>
            </td>
          </tr>
        )}
      </Fragment>
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


{/* 🏆 Top-2 Details (nur wenn aktiviert) */}

{typeof tournamentTopN === "number" && tournamentTopN > 0 &&
  tournamentTopSelection &&
  tournamentTopSelection.length > 0 && (
  <div className="mb-4 rounded-2xl border border-neutral-200 bg-orange-50 px-4 py-3">
    <div className="flex items-center justify-between  gap-3">
<div className="text-xs font-semibold text-neutral-600 ">
  {typeof tournamentTopN === "number" && tournamentTopN > 0
    ? `Top-${tournamentTopN} je Spieler (aus ${filterTournamentList?.length ?? 0})`
    : `Alle Turniere (aus ${filterTournamentList?.length ?? 0})`}
</div>

      <Button
        variant="secondary"
        className="!h-8 !px-2 !text-[11px] !leading-none"
        onClick={() => setShowTournamentTopSelection((v) => !v)}
      >
        {showTournamentTopSelection ? "Details ausblenden" : "Details anzeigen"}
      </Button>
    </div>

    {showTournamentTopSelection && (
      <div className="mt-3 max-h-60 overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] text-neutral-500 border-b">
              <th className="py-1 pr-2">Spieler</th>
              <th className="py-1 pr-2">Turnier</th>
              <th className="py-1 pr-2">Kategorie</th>
              <th className="py-1 pr-2">Code</th>
              <th className="py-1 pr-2">Datum</th>
              <th className="py-1 pr-2 text-right">Platz</th>
              <th className="py-1 pr-2 text-right">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {tournamentTopSelection.flatMap((p) =>
              (p.selected ?? []).map((s, idx) => (
                <tr
                  key={`${p.profileId ?? p.name}-${s.tournament_id}-${idx}`}
                  className="border-b last:border-0 hover:bg-neutral-50/70"
                >
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-2">
                      <Avatar url={p.avatar_url ?? null} name={p.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-[11px] text-neutral-500">
                          {p.totalInFilter} im Filter
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-1 pr-2">{s.tournament_name ?? "—"}</td>
                  <td className="py-1 pr-2 text-neutral-600">{s.tournament_category ?? "—"}</td>
                  <td className="py-1 pr-2 tabular-nums text-neutral-500">{s.tournament_code ?? "—"}</td>
                  <td className="py-1 pr-2 text-neutral-500">
                    {s.created_at ? new Date(s.created_at).toLocaleDateString("de-DE") : "—"}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums text-neutral-600">{s.final_rank ?? "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums font-semibold text-amber-600">
                  <TpWithBonus tp={Number(s.tournament_points ?? 0)} bonus={s.super_final_rank === 1 ? SUPER_FINAL_TP_BONUS : 0} />
                </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    )}
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
  className="!h-8 !px-2 !text-[11px] !leading-none"
  onClick={() => {
    // Default-Vorschlag: 2 oder max möglich
    const max = filterTournamentList?.length ?? 1;
    setTournamentTopN(Math.min(2, max));
  }}
  disabled={tournamentLoading || (filterTournamentList?.length ?? 0) === 0}
>
  🏆 Top-X je Spieler
</Button>

{typeof tournamentTopN === "number" && (
  <div className="flex items-center gap-2">
    <label className="text-xs text-neutral-600">
      Top
    </label>

    <input
      type="number"
      min={1}
      max={filterTournamentList?.length ?? 1}
      value={tournamentTopN}
      onChange={(e) => {
        const max = filterTournamentList?.length ?? 1;
        const val = Math.max(1, Math.min(max, Number(e.target.value)));
        setTournamentTopN(val);
      }}
      className="h-8 w-16 rounded-md border border-neutral-300 px-2 text-xs"
    />

    <span className="text-xs text-neutral-500">
      von {filterTournamentList?.length ?? 0} Turnieren
    </span>

    <Button
      variant="secondary"
      className="!h-8 !px-2 !text-[11px]"
      onClick={() =>
        loadTournamentSuccessWith(
          tournamentFilterCategory.trim(),
          tournamentFilterName.trim(),
          tournamentFilterFrom,
          tournamentFilterTo
        )
      }
    >
      anwenden
    </Button>

    <Button
      variant="ghost"
      className="!h-8 !px-2 !text-[11px]"
      onClick={() => {
        //setTournamentTopN(null);
        //loadTournamentSuccessWith(
         // tournamentFilterCategory.trim(),
         // tournamentFilterName.trim(),
        //tournamentFilterFrom,
         // tournamentFilterTo );


  // Filter reset
  setTournamentFilterCategory("");
  setTournamentFilterName("");
  setTournamentFilterFrom("");
  setTournamentFilterTo("");

  // Top-N reset + Details zu
  setTournamentTopN(null);
  setTournamentTopSelection([]);
  setShowTournamentTopSelection(false);

  // Aufklapper schließen
  setExpandedTournamentPlayerKey(null);

  // ✅ Wichtig: Loader bekommt Override -> garantiert OHNE top
setTournamentTopN(null);
loadTournamentSuccessWith(
  tournamentFilterCategory.trim(),
  tournamentFilterName.trim(),
  tournamentFilterFrom,
  tournamentFilterTo,
  null // 👈 Override erzwingt: KEIN top-Param sofort
);


        
      }}
    >
      zurücksetzen
    </Button>
  </div>
)}





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

{/* ---------------- Highscores ---------------- */}
{subTab === "highscores" && (
  <div className="space-y-3">


              {/* A) Globales Highscore-Leaderboard (Spieler) */}
              <div className="mb-5 rounded-2xl border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-neutral-800">
                      Globales Highscore-Leaderboard
                    </div>
                    <div className="text-xs text-neutral-500">
                      Punkte: 🥇=3, 🥈=2, 🥉=1 (über alle Maschinen)
                    </div>
                  </div>
                </div>

                {/* Podium Top-3 */}
                {top3Global.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 items-end gap-2">
                    {/* 🥈 links */}
                    <div className="rounded-2xl border bg-neutral-50 p-3 text-center">
                      <div className="text-lg">🥈</div>
                      <div className="mt-1 truncate text-sm font-semibold">
                        {top3Global[1]?.player ?? "—"}
                      </div>
                      <div className="mt-1 text-xs text-neutral-600">
                        Siege: {top3Global[1]?.wins ?? 0} • Punkte: {top3Global[1]?.points ?? 0}
                      </div>
                    </div>

                    {/* 🥇 groß Mitte */}
                    <div className="rounded-2xl border bg-amber-50 p-4 text-center">
                      <div className="text-2xl">🥇</div>
                      <div className="mt-1 truncate text-base font-bold">
                        {top3Global[0]?.player ?? "—"}
                      </div>
                      <div className="mt-1 text-xs text-neutral-700">
                        Siege: {top3Global[0]?.wins ?? 0} • Punkte: {top3Global[0]?.points ?? 0}
                      </div>
                    </div>

                    {/* 🥉 rechts */}
                    <div className="rounded-2xl border bg-neutral-50 p-3 text-center">
                      <div className="text-lg">🥉</div>
                      <div className="mt-1 truncate text-sm font-semibold">
                        {top3Global[2]?.player ?? "—"}
                      </div>
                      <div className="mt-1 text-xs text-neutral-600">
                        Siege: {top3Global[2]?.wins ?? 0} • Punkte: {top3Global[2]?.points ?? 0}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabelle */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500 border-b">
                        <th className="py-2 pr-2">#</th>
                        <th className="py-2 pr-2">Spieler</th>
                        <th className="py-2 pr-2 text-right">Highscore-Siege</th>
                        <th className="py-2 pr-2 text-right">Podiums</th>
                        <th className="py-2 pr-2 text-right">Highscore-Punkte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {globalHighscorePlayers.map((r, idx) => (
                        <tr key={r.player + idx} className="border-b last:border-0">
                          <td className="py-2 pr-2 text-neutral-500 tabular-nums">{idx + 1}</td>
                          <td className="py-2 pr-2 font-medium">{r.player}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{r.wins}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{r.podiums}</td>
                          <td className="py-2 pr-2 text-right tabular-nums font-semibold">{r.points}</td>
                        </tr>
                      ))}
                      {globalHighscorePlayers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-2 text-sm text-neutral-500">
                            Noch keine Highscores.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>


    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-semibold text-neutral-700">
          Highscores (pro Maschine)
        </div>
        <div className="text-xs text-neutral-500">
          Top 3 Scores je Flipper – inkl. Spieler & Turnier.
        </div>
      </div>

      <Button
        className="ml-auto !h-8 !px-2 !text-[11px] !leading-none"
        variant="secondary"
        onClick={loadHighscores}
        disabled={highscoreLoading}
      >
        Neu laden
      </Button>
    </div>

    {highscoreError && (
      <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
        {highscoreError}
      </div>
    )}

    {highscoreLoading ? (
      <div className="text-sm text-neutral-500">Lade Highscores…</div>
    ) : highscoreMachines.length === 0 ? (
      <div className="text-sm text-neutral-500">
        Noch keine Highscores vorhanden.
      </div>
    ) : (
      <div className="space-y-3">



        {highscoreMachines.map((m) => (
          <div key={m.key} className="rounded-2xl border bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{(m.icon ?? "🎱").trim() || "🎱"}</span>
                  <div className="font-semibold truncate">{m.name}</div>
                </div>
                <div className="text-xs text-neutral-500 truncate">
                  {m.location ?? "Unbekannte Location"}
                </div>
              </div>
            </div>

            <div className="mt-3">
              {(!m.top || m.top.length === 0) ? (
                <div className="text-sm text-neutral-500">
                  Keine Scores eingetragen.
                </div>
              ) : (
                <ol className="space-y-1 text-sm">
                  {m.top.slice(0, 3).map((s, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium">
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"} {s.player}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {" "}– {s.tournament}
                          {s.tournamentCreatedAt
                            ? ` (${new Date(s.tournamentCreatedAt).toLocaleDateString("de-DE")})`
                            : ""}
                        </span>
                      </div>
                      <div className="tabular-nums font-semibold">
                         {Number(s.score).toLocaleString("de-DE")}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

      </CardBody>
    </Card>
  );
}





function Stats({ code, tournamentName }: { code: string; tournamentName: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  // ✅ Elo im Turnier ausgeschaltet (alle Runden elo_enabled=false) -> keine Elo-Veränderung anzeigen
  const [eloOff, setEloOff] = useState(false);

  // ✅ Gemeinsame Maßstäbe für die Spalte "Verlauf" (für alle Spieler gleich -> vergleichbar)
  //    roundPointsMax: höchste Punktzahl in einer Runde (Balken)
  //    totalMax / roundMin / roundMax: für die Gesamtpunkte-Linie
  const verlaufScale = useMemo(() => {
    let roundPointsMax = 0;
    let totalMax = 0;
    let roundMin = Infinity;
    let roundMax = -Infinity;
    for (const r of rows) {
      let total = 0;
      for (const h of r?.history ?? []) {
        const p = Number(h?.points);
        const rn = Number(h?.round);
        if (Number.isFinite(p)) {
          total += p;
          if (p > roundPointsMax) roundPointsMax = p;
        }
        if (Number.isFinite(rn)) {
          roundMin = Math.min(roundMin, rn);
          roundMax = Math.max(roundMax, rn);
        }
      }
      if (total > totalMax) totalMax = total;
    }
    if (!Number.isFinite(roundMin)) { roundMin = 1; roundMax = 1; }
    return { roundPointsMax, totalMax, roundMin, roundMax };
  }, [rows]);
  const roundPointsMax = verlaufScale.roundPointsMax;

  // ✅ Darstellung "Verlauf": Balken pro Runde oder Gesamtpunkte-Linie (Auswahl wird gemerkt)
  const [verlaufMode, setVerlaufMode] = useState<"runden" | "gesamt">("runden");
  useEffect(() => {
    try {
      const v = localStorage.getItem("pb_verlaufMode");
      if (v === "runden" || v === "gesamt") setVerlaufMode(v);
    } catch {}
  }, []);
  function chooseVerlaufMode(v: "runden" | "gesamt") {
    setVerlaufMode(v);
    try {
      localStorage.setItem("pb_verlaufMode", v);
    } catch {}
  }

  async function load() {
    const res = await fetch("/api/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json();
    setRows(j.stats ?? []);
    const rs = Array.isArray(j?.rounds) ? j.rounds : [];
    setEloOff(rs.length > 0 && rs.every((r: any) => r?.elo_enabled === false));
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

  // Competition-Ranking Plätze (1,1,1,4 ...) für die Anzeige im Leaderboard
  const competitionPlaces = useMemo(
    () => computeCompetitionPlaces(rows, (r: any) => Number(r?.points ?? 0)),
    [rows]
  );

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
            {/*
            <div className="flex gap-2">
              <a
                className="hidden sm:inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                href={`/api/export/standings.csv?code=${encodeURIComponent(
                  code
                )}`}
              >
                Tabelle CSV
              </a>
              <a
                className="hidden sm:inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                href={`/api/export/stats.csv?code=${encodeURIComponent(code)}`}
              >
                Stats CSV
              </a>
              <button
                className="hidden sm:inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                onClick={() => window.print()}
              >
                Drucken/PDF
              </button>
            </div>
            */}
          </div>
        </CardHeader>

        <CardBody>
          <div className="overflow-hidden rounded-2xl border bg-white">
            {/* Kopfzeile – Mobile (Platz / Spieler / Punkte) */}
            <div className="grid sm:hidden grid-cols-12 gap-2 border-b bg-neutral-50 px-2 py-3 text-xs text-neutral-600">
              <div className="col-span-2 text-center">Platz</div>
              <div className="col-span-7">Spieler</div>
              <div className="col-span-3 text-right">Punkte</div>
            </div>

            {/* Kopfzeile – Desktop */}
            <div className="hidden sm:grid grid-cols-12 gap-4 border-b bg-neutral-50 px-2 py-3 text-xs text-neutral-600">
              <div className="col-span-1 text-center">Platz</div>
              <div className="col-span-5">Spieler</div>
              <div className="col-span-2 text-right">Punkte</div>
              <div className="col-span-1 text-right">Matches</div>
              <div className="col-span-1 text-right">Winrate</div>
              <div className="col-span-2 flex items-center justify-end gap-1.5">
                <span>Verlauf</span>
                {/* Umschalter: Punkte pro Runde (Balken) / Gesamtpunkte (Linie) */}
                {/* kompakt mit Symbolen; voller Name als Tooltip */}
                <span className="inline-flex shrink-0 overflow-hidden rounded-full border bg-white">
                  {(["runden", "gesamt"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => chooseVerlaufMode(v)}
                      title={v === "runden" ? "Punkte pro Runde" : "Gesamtpunkte im Verlauf"}
                      aria-label={v === "runden" ? "Punkte pro Runde" : "Gesamtpunkte im Verlauf"}
                      className={
                        "flex h-5 w-7 items-center justify-center transition " +
                        (verlaufMode === v
                          ? "bg-neutral-900 text-white"
                          : "text-neutral-500 hover:bg-neutral-100")
                      }
                    >
                      {v === "runden" ? (
                        // Balken-Symbol
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                          <rect x="1" y="6" width="2.5" height="5" rx="0.6" />
                          <rect x="4.75" y="3" width="2.5" height="8" rx="0.6" />
                          <rect x="8.5" y="1" width="2.5" height="10" rx="0.6" />
                        </svg>
                      ) : (
                        // Linien-Symbol (steigend)
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 10.5 L4.5 7 L7 8.5 L11 2.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </span>
              </div>
            </div>

            {rows.map((r: any, index: number) => {
              const hist = (r.history ?? []).map((x: any) => x.points);
              const place = competitionPlaces[index] ?? index + 1;

              const medal = medalForPlace(place);
              const medalClass =
                place === 1 ? "text-lg leaderboard-glow" : "text-lg";
              const hasMedal = medal !== "";

              return (
                <div key={r.id} className="relative min-w-0 border-b last:border-b-0">
                  <button
                    className={`w-full grid grid-cols-12 gap-2 sm:gap-4 px-2 py-3 items-center text-left hover:bg-neutral-50 ${
                      place === 1 ? "leaderboard-first" : ""
                    }`}
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                  >
                    {/* Platz-Spalte: Medaille (1–3) oder Platz-Zahl (ab 4) */}
                    <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center text-xs tabular-nums">
                      {hasMedal && <span className={medalClass}>{medal}</span>}
                      {!hasMedal && <span className="font-semibold">{place}.</span>}
                    </div>

                    {/* Badge schwebend */}
                    {place === 1 && (
                      <span className="absolute -top-3 left-0 winner-ribbon">
                        Champion
                      </span>
                    )}

                    {/* Spieler + Elo-Infos */}
                    <div className="col-span-7 sm:col-span-5 flex items-center justify-between gap-2 sm:gap-4min-w-0">
                      <div className="min-w-0">
                        <span className="mt-6">
                        <PlayerPill
                        
                          player={{
                            name: r.name,
                            color: r.color ?? null,
                            icon: r.icon ?? null,
                            avatarUrl: r.avatarUrl ?? null,
                          }}
                          
                        />
                        </span>
                      </div>

                      {/* Elo/TP rechts: auf Mobile ausblenden */}
                      <div className="hidden sm:block shrink-0 w-fit">
                        <div className="grid grid-cols-[auto_auto] gap-3 items-start">
                          {/* LEFT: ELO BLOCK */}
                          <div className="rounded-xl">
                            <div className="flex items-center justify-between">
                              <span className="ml-2 inline-flex font-semibold items-center rounded-full bg-neutral-100 px-3 py-1 text-[12px]">
                                <span className="text-[12px] mr-2 text-neutral-700">
                                  Elo{" "}
                                </span>{" "}
                                {r.eloEnd != null ? Math.round(r.eloEnd) : "—"}
                              </span>
                            </div>

                            {/* detail row */}
                            <div className="mt-0.5 text-[11px] tabular-nums text-neutral-600">
                              {eloOff ? (
                                <span className="text-neutral-400">Elo aus – nicht gewertet</span>
                              ) : r.eloStart != null && r.eloEnd != null ? (
                                <>
                                  {Math.round(r.eloStart)}{" "}
                                  <span className="mx-1">→</span>{" "}
                                  {Math.round(r.eloEnd)}
                                  {(() => {
                                    const delta = r.eloDelta ?? null;
                                    if (typeof delta !== "number" || delta === 0)
                                      return null;
                                    const sign = delta > 0 ? "+" : "";
                                    const cls =
                                      delta > 0
                                        ? "ml-2 font-semibold text-[12px] text-emerald-600"
                                        : "ml-2 font-semibold text-[12px] text-red-600";
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

                          {/* RIGHT: TP BLOCK */}
                          {Number(r.tournamentPoints ?? 0) > 0 && (
                            <div className="ml-2 mt-2 inline-flex font-semibold items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-sm">
                              <div className="justify-between">
                                <span className="text-[11px] font-semibold text-amber-800">
                                  Turnierwertung
                                </span>
                              </div>
                              <div className="mt-0.5 text-[13px] text-amber-700 font-semibold">
                                +<TpWithBonus
                                  tp={Number(r.tournamentPoints ?? 0)}
                                  bonus={Number(r.superFinalTpBonus ?? 0)}
                                />{" "}
                                TP
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Punkte / Matches / Winrate / Verlauf */}
                    <div className="col-span-3 sm:col-span-2 text-right font-semibold tabular-nums">
                      {r.points}
                    </div>
                    <div className="hidden sm:block col-span-1 text-right tabular-nums">
                      {r.matches}
                    </div>
                    <div className="hidden sm:block col-span-1 text-right tabular-nums">
                      {r.winrate}%
                    </div>
                    <div className="hidden sm:flex col-span-2 justify-end text-neutral-900">
                      {verlaufMode === "gesamt" ? (
                        /* Gesamtpunkte im Turnierverlauf als Linie */
                        <CumulativePointsLine
                          items={(r.history ?? []).map((x: any) => ({
                            round: Number(x.round),
                            points: Number(x.points),
                          }))}
                          maxTotal={verlaufScale.totalMax}
                          roundMin={verlaufScale.roundMin}
                          roundMax={verlaufScale.roundMax}
                        />
                      ) : (
                        /* Punkte pro Runde als Mini-Balken */
                        <RoundPointsBars
                          items={(r.history ?? []).map((x: any) => ({
                            round: Number(x.round),
                            points: Number(x.points),
                          }))}
                          scaleMax={roundPointsMax}
                        />
                      )}
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

function MiniLeaderboard({
  code,
  rotation = false,
  matches = [],
  matchPlayers = [],
}: {
  code: string;
  // ✅ Rotation ("Round the Pinball"): zusätzliche Spalte "vorl." mit vorläufigem Stand
  rotation?: boolean;
  matches?: any[];
  matchPlayers?: any[];
}) {
  const [rows, setRows] = useState<any[]>([]);

  // Vorläufige Zusatzpunkte aus laufenden Flippern (nur Anzeige, speichert nichts)
  const provisional = useMemo(
    () => (rotation ? computeProvisionalRotationPoints(matches, matchPlayers) : {}),
    [rotation, matches, matchPlayers]
  );

  // Wenn sich gespeicherte Plätze ändern: echte Punkte sofort neu laden
  // (sonst springt "vorl." bis zum nächsten 8s-Poll kurz zurück)
  const placedCount = useMemo(
    () => (matchPlayers ?? []).filter((x: any) => x?.position != null).length,
    [matchPlayers]
  );

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
  }, [code, placedCount]);

  // Rotation: alle Spieler, sortiert nach vorläufigem Gesamtstand (echt + vorl.)
  // Sonst: wie bisher Top 8 nach echten Punkten
  const top = useMemo(() => {
    if (!rotation) return rows.slice(0, 8);
    return rows
      .map((r: any) => {
        const pts = Number(r?.points ?? 0);
        const extra = Number(provisional[r?.id] ?? 0);
        return { ...r, provExtra: extra, provTotal: pts + extra };
      })
      .sort(
        (a: any, b: any) =>
          b.provTotal - a.provTotal ||
          Number(b.points ?? 0) - Number(a.points ?? 0) ||
          String(a.name ?? "").localeCompare(String(b.name ?? ""))
      );
  }, [rows, rotation, provisional]);

  const valueOf = (r: any) =>
    rotation ? Number(r?.provTotal ?? 0) : Number(r?.points ?? 0);

  const topPlaces = useMemo(
    () => computeCompetitionPlaces(top, valueOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [top, rotation]
  );

  return (
    <Card>
      {/* Kompaktere Ränder als CardHeader/CardBody, damit Namen mehr Platz haben */}
      <div className="px-2.5 pt-4 pb-2.5 border-b">
        <div className="flex items-center justify-between gap-1.5">
          <div className="text-sm font-semibold whitespace-nowrap">Leaderboard (live)</div>
          {rotation && top.length > 0 ? (
            <div className="flex gap-1.5 text-[11px] font-medium text-neutral-500 tabular-nums">
              <span className="w-6 text-right">Pkt</span>
              <span className="w-7 text-right" title="Vorläufiger Stand inkl. laufender Flipper">
                vorl.
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="px-2.5 py-3">
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
                  className="flex items-start gap-1.5 text-sm"
                >
                  <div className="w-5 shrink-0 text-right tabular-nums text-neutral-500 pt-0.5">
                    {(() => {
                      const place = topPlaces[index] ?? index + 1;
                      // Medaille erst ab > 0 Punkten (sonst hat zu Beginn jeder Gold)
                      const medal = valueOf(r) > 0 ? medalForPlace(place) : null;
                      return medal ? (
                        <span className="text-base">{medal}</span>
                      ) : (
                        <span className="font-semibold">{place}.</span>
                      );
                    })()}
                  </div>
                  <div className="flex items-start gap-1.5 flex-1 min-w-0">
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-white/70 text-xs mt-0.5"
                      style={color ? { backgroundColor: color } : {}}
                    >
                      {emoji || initials}
                    </span>
                    <span className="truncate font-medium">{r.name}</span>
                  </div>
                  {rotation ? (
                    <div className="flex shrink-0 gap-1.5 pl-1 tabular-nums">
                      <span className="w-6 text-right text-neutral-500">
                        {r.points ?? 0}
                      </span>
                      <span
                        className={
                          "w-7 text-right font-semibold " +
                          (r.provExtra > 0 ? "text-emerald-700" : "text-neutral-700")
                        }
                        title={r.provExtra > 0 ? `+${r.provExtra} vorläufig` : undefined}
                      >
                        {r.provTotal}
                      </span>
                    </div>
                  ) : (
                    <div className="shrink-0 tabular-nums text-neutral-700 font-semibold pl-1">
                      {r.points ?? "—"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function CurrentRoundSticky({
  code,
  tournament,
  rounds,
  matches,
  matchPlayers,
  playersById,
  machinesInfoById,
  tasksById, // <- MUSS hier drinstehen
}: {
  code: string;
  tournament: any;
  rounds: any[];
  matches: Match[];
  matchPlayers: MP[];
  playersById: Record<string, PlayerVisual>;
  machinesInfoById: Record<string, { name: string; emoji?: string | null }>;
  tasksById: Record<string, any>;
}) {
  const [tWinrateByPlayerId, setTWinrateByPlayerId] = useState<Record<string, number | null>>({});
  const [mWinrateByKey, setMWinrateByKey] = useState<Record<string, { winrate: number | null; matchesPlayed: number }>>({});
  const [loading, setLoading] = useState(false);

  // ✅ Nur dieser rechte Winrate-Block ist einklappbar
  const [winrateOpen, setWinrateOpen] = useState(true);
  const mwrHasLoadedOnce = useRef(false);

  const locationId = tournament?.location_id ? String(tournament.location_id) : "";


  const currentRound = useMemo(() => {
    const rs = Array.isArray(rounds) ? rounds.slice() : [];
    if (rs.length === 0) return null;
    const open = rs
      .filter((r: any) => String(r?.status ?? "").toLowerCase() === "open")
      .sort((a: any, b: any) => {
        const at = typeof a?.created_at === "string" ? Date.parse(a.created_at) : 0;
        const bt = typeof b?.created_at === "string" ? Date.parse(b.created_at) : 0;
        return bt - at;
      })[0];
    if (open) return open;
    // fallback: höchste round number
    rs.sort((a: any, b: any) => (Number(a?.number ?? 0) - Number(b?.number ?? 0)));
    return rs[rs.length - 1] ?? null;
  }, [rounds]);

  const currentMatches = useMemo(() => {
    const rid = currentRound?.id ? String(currentRound.id) : "";
    if (!rid) return [] as Match[];
    return (matches ?? [])
      .filter((m: any) => String(m?.round_id ?? "") === rid)
      .slice()
      .sort((a: any, b: any) => {
        const at = typeof a?.created_at === "string" ? Date.parse(a.created_at) : 0;
        const bt = typeof b?.created_at === "string" ? Date.parse(b.created_at) : 0;
        return at - bt;
      });
  }, [matches, currentRound]);


  // =========================================================
  // Daten laden NUR wenn es wirklich nötig ist (kein Polling):
  // - einmal, wenn eine neue Runde/Matches generiert wurden
  // - einmal, wenn ein Match geschlossen wurde (Status ändert sich)
  // - wenn Maschine / Spieler / Startposition geändert wurden
  // + optional per "Neu laden" Button
  // =========================================================

  const signature = useMemo(() => {
    const rid = currentRound?.id ? String(currentRound.id) : "";
    const matchSig = (currentMatches ?? [])
      .map((m: any) => `${String(m?.id ?? "")}:${String(m?.machine_id ?? "")}:${String(m?.status ?? "")}`)
      .sort()
      .join("|");

    const matchIds = new Set((currentMatches ?? []).map((m: any) => String(m?.id ?? "")));
    const mpSig = (matchPlayers ?? [])
      .filter((mp: any) => matchIds.has(String(mp?.match_id ?? "")))
      .map((mp: any) => `${String(mp?.match_id ?? "")}:${String(mp?.player_id ?? "")}:${String(mp?.start_position ?? "")}`)
      .sort()
      .join("|");

    return `${rid}__${matchSig}__${mpSig}`;
  }, [currentRound, currentMatches, matchPlayers]);

  const lastSignatureRef = useRef<string>("");

  const reload = useCallback(
    async (showSpinner: boolean) => {
      if (!code) {
        setTWinrateByPlayerId({});
        setMWinrateByKey({});
        return;
      }

      // Spinner nur beim ersten Laden oder bei manuellem Reload zeigen
      if (showSpinner || !mwrHasLoadedOnce.current) setLoading(true);

      try {
        // 1) Turnier-Winrate aus /api/stats (für die Anzeige im Block)
        try {
          const res = await fetch(`/api/stats?_ts=${Date.now()}`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            body: JSON.stringify({ code, _ts: Date.now() }),
          });
          const j = await res.json().catch(() => ({}));
          const rows = Array.isArray(j?.stats) ? j.stats : [];
          const map: Record<string, number | null> = {};
          for (const r of rows) {
            const pid = r?.id ? String(r.id) : "";
            if (!pid) continue;
            map[pid] = typeof r?.winrate === "number" ? r.winrate : null;
          }
          setTWinrateByPlayerId(map);
        } catch {
          setTWinrateByPlayerId({});
        }

        // 2) M-Winrate (profile_id + machineName + location_id) wie in Spieler-Statistik
        if (!locationId || currentMatches.length === 0) {
          setMWinrateByKey({});
          return;
        }

        const machineNames = Array.from(
          new Set(
            (currentMatches ?? [])
              .map((m: any) => {
                const mid = String(m?.machine_id ?? "");
                const name = machinesInfoById?.[mid]?.name;
                return name ? String(name) : "";
              })
              .filter(Boolean)
          )
        );

        const matchIds = new Set((currentMatches ?? []).map((m: any) => String(m?.id ?? "")));
        const mpInRound = (matchPlayers ?? []).filter((mp: any) => matchIds.has(String(mp?.match_id ?? "")));

        const profileIds = Array.from(
          new Set(
            mpInRound
              .map((mp: any) => {
                const pid = String(mp?.player_id ?? "");
                const pl = playersById?.[pid];
                return pl?.profile_id ? String(pl.profile_id) : "";
              })
              .filter(Boolean)
          )
        );

        if (machineNames.length === 0 || profileIds.length === 0) {
          setMWinrateByKey({});
          return;
        }

        try {
          const res = await fetch(`/api/winrates/machine-location?_ts=${Date.now()}`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            body: JSON.stringify({ locationId, profileIds, machineNames, _ts: Date.now() }),
          });
          const j = await res.json().catch(() => ({}));
          const rows = Array.isArray(j?.rows) ? j.rows : [];

          const map: Record<string, { winrate: number | null; matchesPlayed: number }> = {};
          for (const r of rows) {
            const p = r?.profileId ? String(r.profileId) : "";
            const m = r?.machineName ? String(r.machineName) : "";
            if (!p || !m) continue;
            const key = `${p}__${m}__${locationId}`;
            map[key] = {
              winrate: typeof r?.winrate === "number" ? r.winrate : null,
              matchesPlayed: Number(r?.matchesPlayed ?? 0) || 0,
            };
          }
          setMWinrateByKey(map);
        } catch {
          setMWinrateByKey({});
        }
      } finally {
        setLoading(false);
        mwrHasLoadedOnce.current = true;
      }
    },
    [code, currentMatches, matchPlayers, playersById, machinesInfoById]
  );

  // Automatisch neu laden, wenn sich die "Signatur" ändert (Runde/Matches/Spieler/Startpos/Maschine/Status)
  useEffect(() => {
    if (!currentRound || currentMatches.length === 0) return;
    if (!signature) return;

    if (lastSignatureRef.current !== signature) {
      lastSignatureRef.current = signature;
      // kein nerviges "lädt…" bei Auto-Reload
      reload(false);
    }
  }, [signature, currentRound, currentMatches, reload]);


  if (!currentRound || currentMatches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="text-sm font-semibold">Aktuelle Runde</div>
        </CardHeader>
        <CardBody>
          <div className="text-sm text-neutral-500">Keine aktive Runde.</div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="mt-2">
     
<div className="p-5 cursor-pointer select-none">
  <button
    type="button"
    onClick={() => setWinrateOpen((v) => !v)}
    className="w-full text-[14px] font-semibold pb-2 border-b border-gray-200"
  >
    <span className="flex items-center justify-between w-full">
      <span className="text-sm font-semibold">
        Winrate{" "}
        <span className="text-gray-500 text-[12px]">
          #{currentRound?.number ?? currentRound?.round_no ?? "—"}
        </span>
        <span className="text-xs mx-1 text-neutral-400">
          {winrateOpen ? "  ▾" : "  ▸"}
        </span>
      </span>


    </span>
  </button>
</div>
     
      {winrateOpen && (

        
        <div className="space-y-2 pb-5 px-5 ">

          {currentMatches.map((m: any, idx: number) => {
            const machineName = machinesInfoById?.[String(m.machine_id)]?.name ?? "Maschine";
            const matchMps = (matchPlayers ?? [])
              .filter((mp: any) => String(mp.match_id) === String(m.id))
              .slice()
              .sort((a: any, b: any) => (Number(a?.start_position ?? 999) - Number(b?.start_position ?? 999)));

            // Match-Status für Mini-Badge
            const statusRaw = String((m as any)?.status ?? "").toLowerCase();
            const isFinished = statusRaw === "finished";
            const statusLabel = isFinished ? "Finished" : "Aktiv";
            const statusCls = isFinished
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-blue-200 bg-blue-50 text-blue-700";

            // Pro Match: Max-Werte bestimmen (für grüne Hervorhebung)
            const computed = matchMps.map((mp: any) => {
              const pid = String(mp.player_id ?? "");
              const p = playersById?.[pid];
              const profileId = p?.profile_id ? String(p.profile_id) : "";
              const key = profileId && machineName ? `${profileId}__${String(machineName)}__${locationId}` : "";

              const tWr = tWinrateByPlayerId[pid];
              const mWrObj = key ? mWinrateByKey[key] : null;
              const mWr = mWrObj?.winrate ?? null;
              const mCnt = mWrObj?.matchesPlayed ?? 0;

              const pos = (mp as any)?.position ?? null;
              return { pid, p, tWr, mWr, mCnt, pos, team: (mp as any)?.team ?? null };
            });

            const maxT = computed.reduce<number | null>((acc, x) => {
              if (typeof x.tWr !== "number") return acc;
              if (acc == null) return x.tWr;
              return Math.max(acc, x.tWr);
            }, null);

            const maxM = computed.reduce<number | null>((acc, x) => {
              if (typeof x.mWr !== "number") return acc;
              if (acc == null) return x.mWr;
              return Math.max(acc, x.mWr);
            }, null);

            // Gewinner:
// - normal (Matchplay): position === 1
// - DYP Round Robin (Teams): ALLE Spieler des Sieger-Teams (Team mit position === 1)
            const winnerPids = (() => {
              const set = new Set<string>();
              if (!isFinished) return set;

              const hasTeams = computed.some((x) => x.team != null);
              if (!hasTeams) {
                const p = computed.find((x) => Number(x.pos) === 1)?.pid ?? null;
                if (p) set.add(String(p));
                return set;
              }

              // Team-Position = beste (kleinste) Position der Team-Mitglieder
              const teamBestPos = new Map<number, number>();
              for (const x of computed) {
                const t = x.team;
                const p = Number(x.pos);
                if (t == null || !Number.isFinite(p)) continue;
                const prev = teamBestPos.get(Number(t));
                if (prev == null || p < prev) teamBestPos.set(Number(t), p);
              }

              const winningTeams = new Set<number>(
                Array.from(teamBestPos.entries())
                  .filter(([, pos]) => pos === 1)
                  .map(([team]) => team)
              );

              for (const x of computed) {
                if (x.team != null && winningTeams.has(Number(x.team))) {
                  set.add(String(x.pid));
                }
              }
              return set;
            })();

            return (
              <div key={String(m.id)} className="rounded-xl bg-white">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-neutral-800">
                  <div className="min-w-0">
                    Spiel {idx + 1}:{" "}
                    <span className="text-[11px]">{machineName}</span>
                  </div>

                  <span
                    className={
                      "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold " +
                      statusCls
                    }
                    title={`Match-Status: ${statusRaw || "—"}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div className="mt-2">
                  {computed.map((row: any) => {
                    const name = row?.p?.name ?? "—";

                    const nameCls =
                      winnerPids.size > 0 && winnerPids.has(String(row.pid))
                        ? "truncate text-[12px] font-semibold text-amber-600"
                        : "truncate text-[12px]";

                    const tCls =
                      typeof row.tWr === "number" && maxT != null && row.tWr === maxT
                        ? "tabular-nums text-[12px] text-emerald-600 font-semibold"
                        : "tabular-nums text-[12px] text-neutral-700";

                    const mCls =
                      typeof row.mWr === "number" && maxM != null && row.mWr === maxM
                        ? "tabular-nums text-[12px] text-emerald-600 font-semibold"
                        : "tabular-nums text-[12px] text-neutral-700";

                    return (
                      <div key={row.pid} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm items-center">
                        <div className={nameCls}>{name}</div>

                        <div className={tCls}>
                          {typeof row.tWr === "number" ? `${row.tWr}%` : "—"}
                        </div>

                        <div className={mCls}>
                          {typeof row.mWr === "number" ? `${row.mWr}%` : "—"}
                          {row.mCnt > 0 ? (
                            <span className="text-[10px] text-neutral-400"> ({row.mCnt})</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] text-neutral-400">
                  <div />
                  <div className="text-right">Winrate</div>
                  <div className="text-right">M-Winrate</div>
                </div>
              </div>
            );
          })}        </div>
      
        )}
    </Card>
  );
}



function RotationGlobalTimerSticky({
  locked,
  timeLeftLabel,
  timeLeftMs,
  durationSec,
  running,
  paused,
  onStart,
  onPauseToggle,
  onReset,
  onFullscreen,
}: {
  locked: boolean;
  timeLeftLabel: string;
  timeLeftMs: number | null;
  durationSec: number;
  running: boolean;
  paused: boolean;
  onStart: (minutes: number) => void | Promise<void>;
  onPauseToggle: () => void;
  onReset: () => void;
  onFullscreen?: () => void;
}) {
  const [minutes, setMinutes] = useState(10);

  const totalMs = (durationSec ?? 600) * 1000;

  let badgeClass = "bg-neutral-200 text-neutral-900";

  if (timeLeftMs != null) {
    if (timeLeftMs <= 60_000) {
      badgeClass = "bg-red-600 text-white";
    } else if (timeLeftMs <= totalMs / 2) {
      badgeClass = "bg-orange-500 text-white";
    } else {
      badgeClass = "bg-green-600 text-white";
    }
  }


  return (
    <Card className="mt-2">
      <CardHeader>
        <div className="text-sm font-semibold">Rotation Timer</div>
      </CardHeader>
      <CardBody>
        <div className="flex items-center justify-between gap-3">
          

          <div className="flex w-[220px] flex-col items-end gap-2">
            <Select
              value={String(minutes)}
              onChange={(e) => setMinutes(Number(e.target.value) || 10)}
              className="h-12 w-full text-xs"
              title="Dauer (Minuten)"
              disabled={locked || running || paused}
            >
              <option value="3">3 min</option>
              <option value="5">5 min</option>
              <option value="8">8 min</option>
              <option value="10">10 min</option>
              <option value="15">15 min</option>
              <option value="20">20 min</option>
            </Select>
<div className="flex w-full justify-center">
  <div
    className={[
      "inline-flex items-center justify-center rounded-full",
      "px-6 py-2",
      "text-3xl font-semibold tabular-nums",
      "transition-colors",
      badgeClass,
    ].join(" ")}
    aria-live="polite"
  >
    {timeLeftLabel}
  </div>
</div>
            <div className="grid w-full grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-3 text-sm w-full"
                disabled={locked || (!running && !paused)}
                onClick={onPauseToggle}
                title={paused ? "Timer weiterlaufen lassen" : "Timer anhalten"}
              >
                {paused ? "Weiter" : "Pause"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="h-9 px-3 text-sm w-full"
                disabled={locked}
                onClick={onReset}
              >
                Reset
              </Button>
            </div>

            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm w-full"
              disabled={locked || running}
              onClick={async () => {
                await onStart(minutes);
              }}
            >
              Start
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-3 text-sm w-full"
              disabled={locked || !onFullscreen}
              onClick={() => onFullscreen?.()}
              title="Timer groß anzeigen (Overlay)"
            >
              Fullscreen
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function RotationTimerFullscreenOverlay({
  open,
  onClose,
  timeLeftLabel,
  timeLeftMs,
  durationSec,
  running,
  paused,
  locked,
  onPauseToggle,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  timeLeftLabel: string;
  timeLeftMs: number | null;
  durationSec: number;
  running: boolean;
  paused: boolean;
  locked: boolean;
  onPauseToggle: () => void;
  onReset: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // iOS/Safari: während Overlay offen ist -> body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const totalMs = (durationSec ?? 600) * 1000;
  let badgeClass = "bg-white text-black";
  if (timeLeftMs != null) {
    if (timeLeftMs <= 60_000) badgeClass = "bg-red-600 text-white";
    else if (timeLeftMs <= totalMs / 2) badgeClass = "bg-orange-500 text-white";
    else badgeClass = "bg-emerald-500 text-white";
  }

  async function requestTrueFullscreen() {
    // Best effort: funktioniert nicht überall (iOS Safari oft nicht)
    try {
      const el = wrapRef.current as any;
      if (el?.requestFullscreen) await el.requestFullscreen();
    } catch {
      // ignore
    }
  }

  return createPortal(
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[9999] bg-black/95 text-white"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="h-full w-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="text-sm font-semibold tracking-wide">Rotation Timer</div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-3 text-sm"
              onClick={requestTrueFullscreen}
              title="Versucht echtes Browser-Fullscreen (nicht überall verfügbar)"
            >
              Fullscreen (Browser)
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={onClose}
              title="Overlay schließen"
            >
              Schließen
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
          <div
            className={[
              "inline-flex items-center justify-center rounded-full",
              "px-10 py-6",
              "text-[clamp(56px,12vw,140px)] font-bold tabular-nums",
              badgeClass,
            ].join(" ")}
            aria-live="polite"
          >
            {timeLeftLabel}
          </div>

          <div className="w-full max-w-md grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              className="h-12 text-base"
              disabled={locked || (!running && !paused)}
              onClick={onPauseToggle}
              title={paused ? "Timer weiterlaufen lassen" : "Timer anhalten"}
            >
              {paused ? "Weiter" : "Pause"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="h-12 text-base"
              disabled={locked}
              onClick={onReset}
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TimeplayStopwatchFullscreenOverlay({
  open,
  onClose,
  elapsedMs,
  running,
  locked,
  onStartStop,
  onReset,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  elapsedMs: number;
  running: boolean;
  locked: boolean;
  onStartStop: () => void;
  onReset: () => void;
  onApply: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // iOS/Safari: body scroll lock wie bei Rotation
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

const totalMs = Math.max(0, Math.round(elapsedMs));
const totalSeconds = Math.floor(totalMs / 1000);
const minutes = Math.floor(totalSeconds / 60);
const seconds = totalSeconds % 60;
const msPart = totalMs % 1000;

const label = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;


  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/95 text-white"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="h-full w-full flex flex-col">
        {/* Header: ALLE kleinen Buttons oben in gleicher Größe */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="text-sm font-semibold tracking-wide">Stoppuhr</div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              disabled={locked}
              onClick={onReset}
            >
              Reset
            </Button>

            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              disabled={locked || running || elapsedMs <= 0}
              onClick={onApply}
              title={running ? "Erst stoppen" : "Zeit übernehmen"}
            >
              Übernehmen
            </Button>

            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={onClose}
            >
              Schließen
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-4">
          {/* Anzeige */}
          <div className="flex items-center justify-center py-6">
            <div className="text-[clamp(56px,12vw,140px)] font-bold tabular-nums font-mono">
              {label}
            </div>
          </div>

          {/* START/STOP: riesig, min. halbe Screen-Höhe */}
          <div className="flex-1 flex items-stretch">
            <Button
              type="button"
              variant="secondary"
              className="w-full text-[clamp(28px,6vw,64px)] font-extrabold rounded-2xl"
              style={{ minHeight: "50vh" }}
              disabled={locked}
              onClick={onStartStop}
            >
              {running ? "STOP" : "START"}
            </Button>
          </div>

          {/* Optional: bisschen Luft unten */}
          <div className="h-4" />
        </div>
      </div>
    </div>,
    document.body
  );

}


function MatchplayProgressStack({
  tournament,
  rounds,
  playersCount,
  players,
  matches,
  matchPlayers,
  playersById,
  compact,
}: {
  tournament: any;
  rounds: any[];
  playersCount: number | null | undefined;
  players?: any[];
  matches?: Match[];
  matchPlayers?: MP[];
  playersById?: Record<string, PlayerVisual>;
  compact?: boolean;
}) {
  const formatRaw = String(tournament?.format ?? "").toLowerCase();
  const isSupported =
    formatRaw === "matchplay" ||
  formatRaw === "swiss" ||
    formatRaw === "dyp_round_robin" ||
    formatRaw === "dyp round robin" ||
    formatRaw === "round_robin" ||
    formatRaw === "round robin";

  if (!isSupported) return null;

  const [openProgress, setOpenProgress] = useState(true);
  const [pairingsOpen, setPairingsOpen] = useState(true);

  const n =
    Number(playersCount ?? 0) ||
    Number(tournament?.playersCount ?? 0) ||
    Number(tournament?.players_count ?? 0) ||
    (Array.isArray(tournament?.players) ? tournament.players.length : 0);

  // ================================
  // Paarungen im gesamten Turnier (für Sidebar)
  // - zählt identische Spieler-Gruppen über alle Matches
  // - 1vs1: A vs B, sonst: A / B / C
  // - Ghost wird ignoriert
  // ================================
  const mpByMatchAll = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const mp of matchPlayers ?? []) {
      const mid = String(mp?.match_id ?? "");
      if (!mid) continue;
      const arr = map.get(mid) ?? [];
      arr.push(mp);
      map.set(mid, arr);
    }
    return map;
  }, [matchPlayers]);


// ------------------------------------------------------------
const format = String(tournament?.format ?? "");
const isRotationFormat = format === "rotation";
const isEliminationFormat = format === "elimination";

// ------------------------------------------------------------
// ✅ Elimination: Auto-Assign (Platzierungen nach Score) NUR wenn die Runde "voll" ist
// Erwartete Spielerzahl = Startspieler(Runde 1) - (roundNumber-1), mind. 2
// Beispiel Start=5: Runde2 erwartet 4, Runde3 erwartet 3, ...
// ------------------------------------------------------------
const getExpectedPlayersForEliminationRound = useCallback(
  (roundNumber: number) => {
    if (!isEliminationFormat) return null;

    const sorted = (rounds ?? [])
      .slice()
      .sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0));

    // ✅ Start-Runde für Elimination finden:
    // die erste Runde im Turnier, in der überhaupt echte Spieler (player_id) in MatchPlayers auftauchen.
    // (Elimination kann auch erst später starten, z.B. nach Quali.)
    let startRoundNumber: number | null = null;
    let startTotal = 0;

    for (const rr of sorted) {
      const roundId = String(rr?.id ?? "");
      if (!roundId) continue;

      const roundMatchIds = (matches ?? [])
        .filter((mm: any) => String(mm.round_id) === roundId)
        .map((mm: any) => String(mm.id));

      const uniq = new Set<string>();
      for (const mid of roundMatchIds) {
        const mps0 = mpByMatchAll.get(mid) ?? [];
        for (const mp of mps0) {
          if (mp?.player_id) uniq.add(String(mp.player_id));
        }
      }

      if (uniq.size > 0) {
        startRoundNumber = Number(rr.number ?? 0) || null;
        startTotal = uniq.size;
        break;
      }
    }

    if (!startRoundNumber || !startTotal) return null;

    const rn = Number(roundNumber ?? 0) || 0;
    if (rn <= 0) return null;

    // Elimination: pro Runde 1 Spieler weniger aktiv (mindestens 2)
    return Math.max(2, startTotal - (rn - startRoundNumber));
  },
  [isEliminationFormat, rounds, matches, mpByMatchAll]
);

  const matchGroupCountsAll = useMemo(() => {
    const counts = new Map<string, number>();
    const isDyp =
      formatRaw === "dyp_round_robin" ||
      formatRaw === "dyp round robin" ||
      formatRaw === "dyp";

    for (const mm of matches ?? []) {
      const mid = String((mm as any)?.id ?? "");
      if (!mid) continue;

      const mps = mpByMatchAll.get(mid) ?? [];
      if ((mps?.length ?? 0) < 2) continue;

      // Ghost rausfiltern (falls vorhanden)
      const mpsNoGhost = (mps ?? []).filter((mp: any) => {
        const pid = String(mp?.player_id ?? "");
        if (!pid) return false;
        const nm = playersById?.[pid]?.name ?? "";
        return String(nm).toLowerCase() !== "ghost";
      });
      if ((mpsNoGhost?.length ?? 0) < 2) continue;

      if (isDyp) {
        // ✅ DYP Round Robin:
        // Wir zählen hier bewusst die TEAM-PAARUNGEN (Teammates),
        // weil bei 4 Spielern sonst nur 3 "Matchups" existieren (AB vs CD, AC vs BD, AD vs BC),
        // aber 6 mögliche Team-Paare (C(4,2)=6).
        const t1 = mpsNoGhost
          .filter((x: any) => Number(x?.team ?? 0) === 1)
          .map((x: any) => String(x?.player_id ?? ""))
          .filter(Boolean)
          .sort();
        const t2 = mpsNoGhost
          .filter((x: any) => Number(x?.team ?? 0) === 2)
          .map((x: any) => String(x?.player_id ?? ""))
          .filter(Boolean)
          .sort();

        let counted = false;
        if (t1.length >= 2) {
          const key = t1.join("+");
          counts.set(key, (counts.get(key) ?? 0) + 1);
          counted = true;
        }
        if (t2.length >= 2) {
          const key = t2.join("+");
          counts.set(key, (counts.get(key) ?? 0) + 1);
          counted = true;
        }
        if (counted) continue;
        // Fallback: wenn Team-Info fehlt, verhalte dich wie Default (Gruppe)
      }

      // Default (Matchplay/Swiss/RR): komplette Spielergruppe im Match zählen
      const ids = mpsNoGhost
        .map((x: any) => String(x?.player_id ?? ""))
        .filter(Boolean);

      if (ids.length < 2) continue;

      const key = ids.slice().sort().join("::");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [matches, mpByMatchAll, playersById, formatRaw]);

  const pairingRowsAll = useMemo(() => {
    const rows: { key: string; label: string; count: number }[] = [];
    const isDyp =
      formatRaw === "dyp_round_robin" ||
      formatRaw === "dyp round robin" ||
      formatRaw === "dyp";

    const shortName = (name: any) => {
      const s = String(name ?? "").trim();
      if (!s) return "—";
      return s.slice(0, 12);
    };

    for (const [key, count] of matchGroupCountsAll.entries()) {
      // ✅ DYP-Key (Team-Paar): "a+b"
      if (isDyp && key.includes("+") && !key.includes("||") && !key.includes("::")) {
        const ids = key.split("+").filter(Boolean);
        const names = ids.map((pid) => playersById?.[pid]?.name ?? "—").filter(Boolean);
        rows.push({
          key,
          label: names.map(shortName).join(" + "),
          count,
        });
        continue;
      }

      // Legacy DYP-Key (falls noch irgendwo): "a+b||c+d"
      if (key.includes("||")) {
        const [a, b] = key.split("||");
        const team1Ids = String(a ?? "").split("+").filter(Boolean);
        const team2Ids = String(b ?? "").split("+").filter(Boolean);

        const team1Names = team1Ids.map((pid) => playersById?.[pid]?.name ?? "—").filter(Boolean);
        const team2Names = team2Ids.map((pid) => playersById?.[pid]?.name ?? "—").filter(Boolean);

        rows.push({
          key,
          label: `${team1Names.map(shortName).join(" + ")} vs ${team2Names.map(shortName).join(" + ")}`,
          count,
        });
        continue;
      }

      // Default-Key: "a::b::c"
      const ids = key.split("::").filter(Boolean);
      const names = ids.map((pid) => playersById?.[pid]?.name ?? "—").filter(Boolean);
      const sep = ids.length === 2 ? " vs " : " / ";
      rows.push({ key, label: names.join(sep), count });
    }

    // häufigste oben
    rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return rows;
  }, [matchGroupCountsAll, playersById, formatRaw]);

const matchSize = Math.max(2, Number(tournament?.match_size ?? 2) || 2);

// ✅ Hauptrunde-Länge (Runden pro Hauptrunde) – 1:1 dieselbe Logik wie bei den farbigen Punkten links:
// - match_size === 2: klassische Pairings (jeder gegen jeden)
// - match_size >= 3: alle k-Kombinationen genau einmal (C(n,k))
  const roundsPerCycle = calcRoundsPerCycle(tournament, n);
  // ⚠️ Bei Swiss kann n/playersCount kurz 0 sein (z.B. Daten noch nicht da). Dann wäre roundsPerCycle null.
  // Für den "Aussetzer"-Block wollen wir aber trotzdem rendern.
  const canShowMainRoundProgress = !!roundsPerCycle;
  const getRoundNo = (r: any) => {
    const v = r?.number ?? r?.round_no ?? r?.roundNumber ?? r?.round;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const roundsSorted = (rounds ?? [])
    .map((r: any) => ({ ...r, __rn: getRoundNo(r) }))
    .filter((r: any) => typeof r.__rn === "number" && r.__rn > 0)
    .sort((a: any, b: any) => (a.__rn as number) - (b.__rn as number));

  const maxRoundNumber = roundsSorted.length
    ? (roundsSorted[roundsSorted.length - 1].__rn as number)
    : 0;
  const cyclesCount = Math.max(
    1,
    Math.ceil(maxRoundNumber / Math.max(1, Number(roundsPerCycle || 1)))
  );

  const COLORS = [
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#a855f7",
    "#64748b",
    "#06b6d4",
    "#14b8a6",
    "#db2777",
  ];

  const bars = Array.from({ length: cyclesCount }).map((_, i) => {
    const startNo = i * roundsPerCycle + 1;
    const endNo = (i + 1) * roundsPerCycle;
    const finished = roundsSorted.filter((r) => {
      const no = r.number as number;
      return no >= startNo && no <= endNo && String(r.status ?? "").toLowerCase() === "finished";
    }).length;

    // auch anzeigen wenn es schon Runden in diesem Block gibt (fertig oder nicht)
    const hasAny = roundsSorted.some((r) => {
      const no = r.number as number;
      return no >= startNo && no <= endNo;
    });

    return hasAny
      ? {
          label: `Hauptrunde ${i + 1}`,
          done: finished,
          total: roundsPerCycle,
          pct: Math.round((finished / roundsPerCycle) * 100),
          color: COLORS[i % COLORS.length],
        }
      : null;
  }).filter(Boolean) as Array<{ label: string; done: number; total: number; pct: number; color: string }>;

  const hasBars = bars.length > 0;

  // ✅ Aussetzer (Bye) in der AKTUELLEN Runde anzeigen (nur wenn Spielerzahl nicht durch match_size teilbar ist)
  const activePlayers = (players ?? []).filter((p: any) => p?.active !== false);
  const activeIds = activePlayers.map((p: any) => String(p.id)).filter(Boolean);
  const hasBye = activeIds.length > 0 && matchSize > 0 && (activeIds.length % matchSize) !== 0;

  let byeName: string | null = null;
  let byeRoundLabel: string | null = null;

  // ✅ Aktuelle Runde (Scope-safe): open-Runde bevorzugen, sonst letzte vorhandene Runde
  const currentRound = (Array.isArray(rounds) && rounds.length > 0)
    ? ((rounds as any[]).find((r: any) => r?.status === "open") ??
       (rounds as any[])
         .slice()
         .sort((a: any, b: any) => (a?.number ?? 0) - (b?.number ?? 0))
         .at(-1))
    : null;

  if (hasBye && Array.isArray(rounds) && rounds.length > 0 && Array.isArray(matches) && Array.isArray(matchPlayers)) {

    const roundId = currentRound?.id ?? null;
    const roundNo = currentRound?.number ?? null;

    byeRoundLabel = roundNo != null ? `Runde ${roundNo}` : "Aktuelle Runde";

    if (roundId) {
      const matchIds = new Set(
        (matches ?? [])
          .filter((m: any) => String(m.round_id) === String(roundId))
          .map((m: any) => String(m.id))
      );

      const usedIds = new Set(
        (matchPlayers ?? [])
          .filter((mp: any) => matchIds.has(String(mp.match_id)))
          .map((mp: any) => String(mp.player_id))
          .filter(Boolean)
      );

      const byeIds = activeIds.filter((pid) => !usedIds.has(String(pid)));

      const nameFor = (pid: string) =>
        (playersById && playersById[String(pid)]?.name) ||
        activePlayers.find((p: any) => String(p.id) === String(pid))?.name ||
        pid;

      if (byeIds.length === 1) {
        byeName = nameFor(byeIds[0]);
      } else if (byeIds.length > 1) {
        byeName = byeIds.map(nameFor).join(", ");
      } else {
        // Wenn wir es nicht sauber ableiten können, lieber "—" anzeigen.
        byeName = null;
      }
    }
  }


  return (
    <>
      <div className={`mt-2 p-5 rounded-xl border bg-white ${compact ? "p-2" : "p-3"}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpenProgress((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpenProgress((v) => !v);
          }
        }}
        className={`${compact ? "text-[14px] font-semibold pb-2 border-b border-gray-200" : "text-[13px]"} text-neutral-900 cursor-pointer select-none flex items-start justify-between gap-2`}
      >
        <div>
        <span className="flex items-center gap-2">
          <span>Fortschritt Runden</span>
          <span className="text-neutral-400 text-xs mt-0.5">{openProgress ? "▾" : "▸"}</span>
        </span>
        <div className="h-px bg-white" />
        <span className="text-[11px] font-normal">{n} Spieler</span> •{" "}
        <span className="text-[11px] font-normal">{matchSize} pro Match</span> •{" "}
        <span className="text-[11px] font-normal">{roundsPerCycle} Runden pro Hauptrunde</span>
      </div>
       
      </div>

      {openProgress && (
        <div className={`mt-2 ${compact ? "space-y-1.5" : "space-y-2"}`}>
        {bars.map((b, idx) => {
          const frac = b.total > 0 ? b.done / b.total : 0;
          return (
            <div key={idx}>
              <div className={`flex items-center justify-between ${compact ? "text-[12px]" : "text-[13px]"} text-neutral-700`}>
                <div className="font-medium">{b.label}</div>
                <div className="tabular-nums">{b.done}/{b.total} • {b.pct}%</div>
              </div>
              <div className={`mt-1 ${compact ? "h-1.5" : "h-2"} w-full rounded-full bg-neutral-100 overflow-hidden`}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, frac * 100))}%`, backgroundColor: b.color }} />
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>

      {/* Info-Block unter Fortschritt Hauptrunden */}
      {hasBye && (
        <div className={`mt-2 p-5 rounded-xl border bg-white ${compact ? "p-2" : "p-3"}`}>
          <div className="text-gray-900 text-[14px] font-semibold pb-2 border-b border-gray-200">Aussetzer<span className="mx-1 text-gray-500 text-[12px]"># {currentRound?.number ?? currentRound?.round_no ?? "—"}</span></div>
          <div className="mt-1 text-sm text-gray-800">
            <span className="text-[13px] text-gray-900">{(byeName && String(byeName).toLowerCase() !== "ghost") ? byeName : "Ghost"}</span>
          </div>
        </div>
      )}

{/* Paarungen (gesamt im Turnier) */}
<div className={`mt-2 p-5 rounded-xl border bg-white ${compact ? "p-2" : "p-3"}`}>
  <div
    role="button"
    tabIndex={0}
    onClick={() => setPairingsOpen((v) => !v)}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setPairingsOpen((v) => !v);
      }
    }}
    className="text-gray-900 text-[14px] font-semibold pb-2 border-b border-gray-200 flex items-center justify-between gap-2 cursor-pointer select-none"
  >
    <span className="flex items-center gap-2">
      <span>Paarungen</span>
      <span className="text-neutral-400 text-xs">{pairingsOpen ? "▾" : "▸"}</span>
    </span>
    <span className="text-[12px] font-normal text-gray-500">{pairingRowsAll?.length ?? 0}</span>
  </div>

  {pairingsOpen && ((pairingRowsAll?.length ?? 0) === 0 ? (
    <div className="mt-2 text-sm text-gray-600">Noch keine Paarungen.</div>
  ) : (
    <div className="mt-2 max-h-[260px] overflow-auto pr-1">
      <div className="flex flex-col gap-2">
        {(pairingRowsAll ?? []).map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0 truncate text-[11px] text-gray-800">{row.label}</div>
            <div className="shrink-0 text-[11px] font-semibold text-gray-700">{row.count}×</div>
          </div>
        ))}
      </div>
    </div>
  ))}
</div>
    </>
  );
}







function RoundMatchesCard({
  code,
  rounds,
  matches,
  matchPlayers,
  machinesInfoById,
  playersById,
  tasksById,      // ✅ HINZUFÜGEN
  onSaved,
  locked,
  tournament,
  playersCount,
}: {
  code: string;
  rounds: any[];
  matches: Match[];
  matchPlayers: MP[];
  machinesInfoById: Record<string, { name: string; emoji?: string | null }>;
  playersById: Record<string, PlayerVisual>;
  tasksById: Record<string, any>;   // ✅ HINZUFÜGEN
  onSaved: () => void;
  locked: boolean;
  tournament?: any;
  playersCount?: number | null;
}) {
  const [openRoundId, setOpenRoundId] = useState<string | null>(null);
  // ✅ Elimination: alle aktiven (status=open) Runden bleiben automatisch aufgeklappt.
  // Finished-Runden können optional manuell aufgeklappt werden.
  const [openFinishedRoundIds, setOpenFinishedRoundIds] = useState<Set<string>>(() => new Set());
  const lastRoundCountRef = useRef<number>(0);
  const elimSpeechUnlockedRef = useRef(false);

  const roundsPerCycle = useMemo(() => calcRoundsPerCycle(tournament, playersCount), [
    tournament,
    playersCount,
  ]);

  // 🏆 Scores dieses Turniers für die Highscore-Zeile im Match-Kopf
  const liveRecordEntries = useMemo(
    () =>
      liveEntriesFrom({
        machines: Object.entries(machinesInfoById ?? {}).map(([id, info]) => ({ id, name: info?.name ?? null })),
        matches: (matches ?? []).map((x: any) => ({ id: String(x.id), machine_id: x.machine_id ?? null })),
        match_players: (matchPlayers ?? []).map((x: any) => ({ match_id: x.match_id, player_id: x.player_id, score: x.score ?? null })),
        players: Object.entries(playersById ?? {}).map(([id, p]) => ({ id, name: p?.name ?? null, profile_id: p?.profile_id ?? null })),
      }),
    [machinesInfoById, matches, matchPlayers, playersById]
  );

  const machineUsageCounts = useMemo(() => {
  const map: Record<string, number> = {};
  for (const m of matches ?? []) {
    if (!m.machine_id) continue;
    map[m.machine_id] = (map[m.machine_id] ?? 0) + 1;
  }
  return map;
}, [matches]);

  // ✅ Rotation: welcher Flipper ist in welcher Runde gewählt? (machineId -> [{matchId, roundNo}])
  // Grundlage für Doppel-Prüfung beim Score-Speichern und Hinweis im Dropdown.
  const rotationMachineUse = useMemo(() => {
    const roundNoById: Record<string, number> = {};
    for (const r of rounds ?? []) roundNoById[String(r.id)] = Number(r.number);
    const map: Record<string, { matchId: string; roundNo: number }[]> = {};
    for (const m of matches ?? []) {
      if (!m.machine_id) continue;
      (map[m.machine_id] ||= []).push({
        matchId: String(m.id),
        roundNo: roundNoById[String((m as any).round_id)] ?? 0,
      });
    }
    for (const id of Object.keys(map)) map[id].sort((a, b) => a.roundNo - b.roundNo);
    return map;
  }, [rounds, matches]);

  // ================================
  // Winrate / M-Winrate (für Anzeige direkt im Match links)
  // ================================
  const [tWinrateByPlayerId, setTWinrateByPlayerId] = useState<Record<string, number | null>>({});
  const [mWinrateByKey, setMWinrateByKey] = useState<Record<string, { winrate: number | null; matchesPlayed: number }>>({});
  const [winrateLoading, setWinrateLoading] = useState(false);
  const mwrHasLoadedOnceLeft = useRef(false);

  const locationId = tournament?.location_id ? String(tournament.location_id) : "";

  const isEliminationFormat = String(tournament?.format ?? "") === "elimination";
  const isRotationFormat = String(tournament?.format ?? "") === "rotation";

  const isTimeplayFormat = String(tournament?.format ?? "") === "timeplay";

    useEffect(() => {
    if (!isEliminationFormat) return;
    if (typeof window === "undefined") return;

    const handler = () => {
      elimUnlockSpeechOnce();
    };

    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });

    return () => {
      window.removeEventListener("pointerdown", handler as any);
      window.removeEventListener("touchstart", handler as any);
    };
  }, [isEliminationFormat]);



  // ================================
  // ✅ Elimination Helper: erwartete Spieler in Runde N
  // Wichtig: MUSS im Scope von RoundMatchesCard sein, weil onBlur() hier läuft.
  // Logik:
  // - wir suchen die *erste* Runde im Turnier, in der überhaupt echte Spieler (player_id) auftauchen
  //   (Elimination kann auch erst später starten, z.B. nach Quali.)
  // - startTotal = distinct player_id in dieser Start-Runde
  // - expected = startTotal - (roundNumber - startRoundNumber), mindestens 2
  // ================================
  const mpByMatchAll = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const mp of matchPlayers ?? []) {
      const mid = String((mp as any)?.match_id ?? "");
      if (!mid) continue;
      const arr = map.get(mid) ?? [];
      arr.push(mp);
      map.set(mid, arr);
    }
    return map;
  }, [matchPlayers]);

  const getExpectedPlayersForEliminationRound = useCallback(
    (roundNumber: number) => {
      if (!isEliminationFormat) return null;

      const sorted = (rounds ?? [])
        .slice()
        .sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0));

      let startRoundNumber: number | null = null;
      let startTotal = 0;

      for (const rr of sorted) {
        const roundId = String((rr as any)?.id ?? "");
        if (!roundId) continue;

        const roundMatchIds = (matches ?? [])
          .filter((mm: any) => String((mm as any)?.round_id) === roundId)
          .map((mm: any) => String((mm as any)?.id));

        const uniq = new Set<string>();
        for (const mid of roundMatchIds) {
          const mps0 = (mpByMatchAll.get(mid) ?? []) as any[];
          for (const mp of mps0) {
            if ((mp as any)?.player_id) uniq.add(String((mp as any).player_id));
          }
        }

        if (uniq.size > 0) {
          startRoundNumber = Number((rr as any).number ?? 0) || null;
          startTotal = uniq.size;
          break;
        }
      }

      if (!startRoundNumber || !startTotal) return null;

      const rn = Number(roundNumber ?? 0) || 0;
      if (rn <= 0) return null;

      return Math.max(2, startTotal - (rn - startRoundNumber));
    },
    [isEliminationFormat, rounds, matches, mpByMatchAll]
  );



  function fmtPct(v: number | null | undefined) {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return `${v.toFixed(1)}%`;
  }



  // Transition-basiert (Variante A):
// Nur dann automatisch einklappen, wenn wir *live* sehen,
// dass eine Runde von "open" -> "finished" wechselt.
// Dadurch klappt eine manuell wieder geöffnete Finished-Runde
// bei späteren Refetches/Rendern nicht wieder von selbst zu.
const prevRoundStatusRef = useRef<Record<string, string | undefined>>({});

  useEffect(() => {
    const count = rounds?.length ?? 0;
     //alert(`count=${count}`);
    if (!rounds || count === 0) {
      lastRoundCountRef.current = 0;
      return;
    }
 //alert(`count > lastRoundCountRef.current=${lastRoundCountRef.current}`);
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

  useEffect(() => {
  const prev = prevRoundStatusRef.current;
  const currentIds = new Set<string>();

  for (const r of rounds ?? []) {
    const id = r?.id;
    if (!id) continue;
    currentIds.add(id);

    const prevStatus = prev[id];
    const nextStatus = r?.status;

    // Auto-einklappen nur beim echten Übergang open -> finished
    if (prevStatus === "open" && nextStatus === "finished") {
      if (openRoundId === id) setOpenRoundId(null);
      // Elimination: sobald finished, zuklappen (auch wenn vorher auto-offen)
      setOpenFinishedRoundIds((s) => {
        if (!s.has(id)) return s;
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }

    prev[id] = nextStatus;
  }

  // Cleanup: entferne alte IDs, damit die Map nicht wächst,
  // wenn Runden z.B. gewechselt/gelöscht werden.
  for (const id of Object.keys(prev)) {
    if (!currentIds.has(id)) delete prev[id];
  }
}, [rounds, openRoundId]);


  const [posOverride, setPosOverride] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // ✅ NEU: Flipperpunkte (Score) – Override + Saving-Flag (pro match_id + player_id)
  const [scoreOverride, setScoreOverride] = useState<Record<string, string>>({});
  const [savingScore, setSavingScore] = useState<Record<string, boolean>>({});
  const [scoreFocusKey, setScoreFocusKey] = useState<string | null>(null);

  const [timeOverride, setTimeOverride] = useState<Record<string, string>>({});
  const [savingTime, setSavingTime] = useState<Record<string, boolean>>({});
  const [timeFocusKey, setTimeFocusKey] = useState<string | null>(null);


    // ================================
  // Timeplay Stopwatch (Fullscreen Overlay)
  // ================================
  const [tpStopwatchOpen, setTpStopwatchOpen] = useState(false);
  const [tpStopwatchTarget, setTpStopwatchTarget] = useState<{
    matchId: string;
    playerId: string;
  } | null>(null);

  const [tpSwRunning, setTpSwRunning] = useState(false);
  const [tpSwStartAt, setTpSwStartAt] = useState<number | null>(null);
  const [tpSwElapsedMs, setTpSwElapsedMs] = useState(0);

  // Tick damit Anzeige sichtbar "läuft"
  const [_tpSwTick, setTpSwTick] = useState(0);
  useEffect(() => {
    if (!tpStopwatchOpen) return;
    if (!tpSwRunning) return;
    const id = window.setInterval(() => setTpSwTick((x) => x + 1), 50);
    return () => window.clearInterval(id);
  }, [tpStopwatchOpen, tpSwRunning]);

  function tpOpenStopwatch(matchId: string, playerId: string, initialMs = 0) {
    setTpStopwatchTarget({ matchId, playerId });
    setTpSwElapsedMs(initialMs);
    setTpSwRunning(false);
    setTpSwStartAt(null);
    setTpStopwatchOpen(true);
  }

  function tpToggleStartStop() {
    if (tpSwRunning) {
      if (tpSwStartAt != null) {
        setTpSwElapsedMs((prev) => prev + (Date.now() - tpSwStartAt));
      }
      setTpSwRunning(false);
      setTpSwStartAt(null);
    } else {
      setTpSwRunning(true);
      setTpSwStartAt(Date.now());
    }
  }

  function tpResetStopwatch() {
    setTpSwRunning(false);
    setTpSwStartAt(null);
    setTpSwElapsedMs(0);
  }

  function tpSwNowElapsedMs() {
    if (!tpSwRunning || tpSwStartAt == null) return tpSwElapsedMs;
    return tpSwElapsedMs + (Date.now() - tpSwStartAt);
  }

  

  // ================================
// OCR pro Match (Foto NICHT speichern)
// ================================
type OcrState = {
  dataUrl: string;     // Preview + Base64 Quelle (nur im Browser)
  busy: boolean;
  error: string;
  text: string;        // OCR Rohtext
  scores: number[];    // erkannte Scores in Reihenfolge P1..Pn
  notice?: string;
};

const [ocrByMatch, setOcrByMatch] = useState<Record<string, OcrState>>({});




const isOcrOpen = (st?: OcrState) =>
  !!(st?.dataUrl || st?.busy || (st?.scores?.length ?? 0) > 0 || st?.error || st?.text);


function setOcr(matchId: string, patch: Partial<OcrState>) {
  setOcrByMatch((prev) => ({
    ...prev,
    [matchId]: {
      dataUrl: prev[matchId]?.dataUrl ?? "",
      busy: prev[matchId]?.busy ?? false,
      error: prev[matchId]?.error ?? "",
      text: prev[matchId]?.text ?? "",
      scores: prev[matchId]?.scores ?? [],
      ...patch,
    },
  }));
}

function stripDataUrl(s: string) {
  const idx = (s ?? "").indexOf("base64,");
  return idx >= 0 ? s.slice(idx + "base64,".length) : (s ?? "");
}

// Downscale im Browser -> schneller + stabiler (Base64 Payload kleiner)
async function fileToDownscaledDataUrl(file: File, maxW = 1400, quality = 0.85) {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("Konnte Bild nicht lesen"));
    r.readAsDataURL(file);
  });

  const img = document.createElement("img");
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = dataUrl;
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return dataUrl;

  const scale = Math.min(1, maxW / w);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, tw, th);

  // LCD Fotos -> JPEG reicht + kleiner
  return canvas.toDataURL("image/jpeg", quality);
}

// LCD OCR Parsing (pragmatisch): nimm "plausible" Zahlen
function parseScoresFromText(text: string, wantCount: number) {
  const t = (text || "").replace(/\u00A0/g, " ");

  // 1) Label-basierte Erkennung: SPIELER 1 / PLAYER 1 / P1 / PL 1
  const byIdx: Array<number | null> = new Array(wantCount).fill(null);

  const labelPatterns = [
    // SPIELER 1 12,345,678
    (i: number) => new RegExp(`SPIELER\\s*${i}[^0-9]*([0-9][0-9\\s\\.,']{3,})`, "i"),
    // PLAYER 1 12,345,678
    (i: number) => new RegExp(`PLAYER\\s*${i}[^0-9]*([0-9][0-9\\s\\.,']{3,})`, "i"),
    // P1 12,345,678  (oder P 1 ...)
    (i: number) => new RegExp(`\\bP\\s*${i}\\b[^0-9]*([0-9][0-9\\s\\.,']{3,})`, "i"),
    // PL 1 12,345,678
    (i: number) => new RegExp(`\\bPL\\s*${i}\\b[^0-9]*([0-9][0-9\\s\\.,']{3,})`, "i"),
  ];

  for (let i = 1; i <= wantCount; i++) {
    for (const make of labelPatterns) {
      const m = t.match(make(i));
      if (!m) continue;
      const cleaned = String(m[1]).replace(/[^0-9]/g, "");
      if (cleaned.length < 4) continue;
      const n = Number(cleaned);
      if (!Number.isFinite(n)) continue;
      byIdx[i - 1] = n;
      break;
    }
  }

  // 2) Fallback: Zahlen nach Auftreten (Reihenfolge)
  const occ = (() => {
    const tokens = t.split(/\s+/).map((x) => x.trim()).filter(Boolean);
    const out: number[] = [];
    const seen = new Set<string>();

    for (const tok of tokens) {
      if (!/[0-9]/.test(tok)) continue;
      const cleaned = tok.replace(/[^0-9]/g, "");
      if (cleaned.length < 4) continue;
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);

      const n = Number(cleaned);
      if (!Number.isFinite(n)) continue;

      out.push(n);
      if (out.length >= wantCount) break;
    }
    return out;
  })();

  // 3) Final zusammenbauen: erst Labels, sonst Fallback auffüllen
  const final: number[] = [];
  const used = new Set<number>();

  for (let i = 0; i < wantCount; i++) {
    const v = byIdx[i];
    if (typeof v === "number" && Number.isFinite(v)) {
      final.push(v);
      used.add(v);
    } else {
      // nimm den nächsten aus occ, der nicht schon benutzt wurde
      let next: number | undefined;
      while (occ.length) {
        const cand = occ.shift()!;
        if (!used.has(cand)) {
          next = cand;
          used.add(cand);
          break;
        }
      }
      if (typeof next === "number") final.push(next);
    }
  }

  return final.filter((x) => typeof x === "number" && Number.isFinite(x));
}


async function runOcrForMatch(matchId: string, playerCount: number, dataUrlOverride?: string) {
  const st = ocrByMatch[matchId];
  const dataUrl = dataUrlOverride ?? st?.dataUrl;

  if (!dataUrl) {
    setOcr(matchId, { error: "Bitte erst ein Foto auswählen." });
    return;
  }

  setOcr(matchId, { busy: true, error: "", text: "", scores: [] });

  try {
    const base64 = stripDataUrl(dataUrl);

    const res = await fetch(`/api/ocr?t=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      cache: "no-store",
      body: JSON.stringify({ imageBase64: base64 }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOcr(matchId, {
        error: data?.error ? String(data.error) : `OCR failed (${res.status})`,
        busy: false,
      });
      return;
    }

    const text = String(data?.text ?? "");
    const scores = parseScoresFromText(text, playerCount);

    setOcr(matchId, {
      text,
      scores,
      busy: false,
      error: scores.length
        ? ""
        : "Keinen plausiblen Score gefunden (Bild evtl. zu unscharf/dunkel).",
    });
  } catch (e: any) {
    setOcr(matchId, { busy: false, error: e?.message || "OCR failed" });
  }
}

async function applyOcrScoresToMatch(
  matchId: string,
  orderedPlayerIds: string[],
  scores: number[]
) {
  // 1) Optimistic: alle erkannten Scores in EINEM State-Update setzen
  const patch: Record<string, string> = {};
  for (let i = 0; i < orderedPlayerIds.length; i++) {
    const pid = orderedPlayerIds[i];
    const s = scores[i];

    if (!pid) continue;
    if (typeof s !== "number" || !Number.isFinite(s)) continue;

    patch[k(matchId, pid)] = String(s);
  }
  if (Object.keys(patch).length) {
    setScoreOverride((prev) => ({ ...prev, ...patch }));
  }

  // 2) Dann speichern (DB)
  for (let i = 0; i < orderedPlayerIds.length; i++) {
    const pid = orderedPlayerIds[i];
    const s = scores[i];

    if (!pid) continue;
    if (typeof s !== "number" || !Number.isFinite(s)) continue;

    await setScore(matchId, pid, s);
  }
}


async function autoAssignPositionsByExplicitScores(
  matchId: string,
  orderedPlayerIds: string[],
  scores: number[]
) {

  //alert(`autoAssign`);
  const rows = orderedPlayerIds
    .map((pid, idx) => ({ player_id: pid, score: scores[idx] }))
    .filter(
      (x) =>
        Boolean(x.player_id) &&
        typeof x.score === "number" &&
        Number.isFinite(x.score)
    ) as { player_id: string; score: number }[];

  // müssen mind. 2 Spieler sein und für alle muss es einen Score geben
  if (rows.length < 2 || rows.length !== orderedPlayerIds.length) return;

  // bei Gleichstand: abbrechen
  const uniq = new Set(rows.map((r) => r.score));
  if (uniq.size !== rows.length) return;

  // absteigend sortieren und Plätze setzen
  rows.sort((a, b) => b.score - a.score);
  for (let i = 0; i < rows.length; i++) {
    await setPosition(matchId, rows[i].player_id, i + 1);
  }
}





  const [savingMachine, setSavingMachine] = useState<Record<string, boolean>>({});

  // ✅ Optimistic UI: lokale Startreihenfolge pro Match (damit es beim Drag nicht "zurückspringt")
  const [localStartOrderByMatchId, setLocalStartOrderByMatchId] =
    useState<Record<string, string[]>>({});

  // Wenn nach reloadAll neue matchPlayers reinkommen, lokale Reihenfolge verwerfen
  useEffect(() => {
    setLocalStartOrderByMatchId({});
  }, [matchPlayers]);



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

  const openMatches = useMemo(() => {
    const rid = openRoundId ? String(openRoundId) : "";
    if (!rid) return [] as Match[];
    return matchesByRound?.[rid] ?? [];
  }, [openRoundId, matchesByRound]);

  const winrateSignature = useMemo(() => {
    const rid = openRoundId ? String(openRoundId) : "";
    if (!rid) return "";

    const matchSig = (openMatches ?? [])
      .map((m: any) => `${String(m?.id ?? "")}:${String(m?.machine_id ?? "")}:${String(m?.status ?? "")}`)
      .sort()
      .join("|");

    const matchIds = new Set((openMatches ?? []).map((m: any) => String(m?.id ?? "")));
    const mpSig = (matchPlayers ?? [])
      .filter((mp: any) => matchIds.has(String(mp?.match_id ?? "")))
      .map((mp: any) => `${String(mp?.match_id ?? "")}:${String(mp?.player_id ?? "")}:${String(mp?.start_position ?? "")}`)
      .sort()
      .join("|");

    return `${rid}__${matchSig}__${mpSig}`;
  }, [openRoundId, openMatches, matchPlayers]);

  const reloadWinratesLeft = useCallback(
    async (showSpinner: boolean) => {
      if (!code) {
        setTWinrateByPlayerId({});
        setMWinrateByKey({});
        return;
      }

      // Spinner nur beim ersten Laden oder bei manuellem Reload zeigen
      if (showSpinner || !mwrHasLoadedOnceLeft.current) setWinrateLoading(true);

      try {
        // 1) Turnier-Winrate aus /api/stats
        try {
          const res = await fetch(`/api/stats?_ts=${Date.now()}`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            body: JSON.stringify({ code, _ts: Date.now() }),
          });
          const j = await res.json().catch(() => ({}));
          const rows = Array.isArray(j?.stats) ? j.stats : [];
// ⚠️ WICHTIG:
// /api/stats liefert die "live" Turnier-Winrate pro *player_id*.
// Für die Anzeige im Match (links) greifen wir aber über playersById[player_id].profile_id zu.
// Deshalb bauen wir hier eine Map: profileId -> winrate.
const map: Record<string, number | null> = {};

for (const r of rows) {
  // player_id kann in der API mal als "id" oder "player_id" kommen
  const playerId = r?.player_id ? String(r.player_id) : (r?.id ? String(r.id) : "");
  if (!playerId) continue;

  const profileId =
    playersById?.[playerId]?.profile_id ? String(playersById[playerId].profile_id) :
    (r?.profileId ? String(r.profileId) : (r?.profile_id ? String(r.profile_id) : ""));

  if (!profileId) continue;

  map[profileId] = typeof r?.winrate === "number" ? r.winrate : null;
}

setTWinrateByPlayerId(map);

        } catch {
          setTWinrateByPlayerId({});
        }

        // 2) M-Winrate (profile_id + machineName + location_id)
        if (!locationId || (openMatches ?? []).length === 0) {
          setMWinrateByKey({});
          return;
        }

        const machineNames = Array.from(
          new Set(
            (openMatches ?? [])
              .map((m: any) => {
                const mid = String(m?.machine_id ?? "");
                const name = machinesInfoById?.[mid]?.name;
                return name ? String(name) : "";
              })
              .filter(Boolean)
          )
        );

        const matchIds = new Set((openMatches ?? []).map((m: any) => String(m?.id ?? "")));
        const mpInRound = (matchPlayers ?? []).filter((mp: any) => matchIds.has(String(mp?.match_id ?? "")));

        const profileIds = Array.from(
          new Set(
            mpInRound
              .map((mp: any) => {
                const pid = String(mp?.player_id ?? "");
                const pl = playersById?.[pid];
                return pl?.profile_id ? String(pl.profile_id) : "";
              })
              .filter(Boolean)
          )
        );

        if (machineNames.length === 0 || profileIds.length === 0) {
          setMWinrateByKey({});
          return;
        }

        try {
          const res = await fetch(`/api/winrates/machine-location?_ts=${Date.now()}`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            body: JSON.stringify({ locationId, profileIds, machineNames, _ts: Date.now() }),
          });
          const j = await res.json().catch(() => ({}));
          const rows = Array.isArray(j?.rows) ? j.rows : [];

          const map: Record<string, { winrate: number | null; matchesPlayed: number }> = {};
          for (const r of rows) {
            const p = r?.profileId ? String(r.profileId) : "";
            const mn = r?.machineName ? String(r.machineName) : "";
            if (!p || !mn) continue;
            const key = `${p}__${mn}__${locationId}`;
            map[key] = {
              winrate: typeof r?.winrate === "number" ? r.winrate : null,
              matchesPlayed: typeof r?.matchesPlayed === "number" ? r.matchesPlayed : Number(r?.matches_played ?? 0) || 0,
            };
          }
          setMWinrateByKey(map);
          mwrHasLoadedOnceLeft.current = true;
        } catch {
          setMWinrateByKey({});
        }
      } finally {
        setWinrateLoading(false);
      }
    },
    [code, locationId, openMatches, matchPlayers, playersById, machinesInfoById]
  );

  const lastWinrateSigRef = useRef<string>("");
  useEffect(() => {
    // nur reloaden wenn sich wirklich etwas geändert hat (Runde / Matchstatus / Maschine / Spieler)
    if (!winrateSignature) return;
    if (lastWinrateSigRef.current === winrateSignature) return;
    lastWinrateSigRef.current = winrateSignature;
    reloadWinratesLeft(false);
  }, [winrateSignature, reloadWinratesLeft]);



    // ✅ Wie oft wurde diese Spieler-Kombination schon gespielt (egal ob 1v1 / 3er / 4er …)?
    // Wir zählen nur Matches, die bereits ein Ergebnis haben.
    const matchGroupCounts = useMemo(() => {
      const map = new Map<string, number>();

      for (const m of matches ?? []) {
        const mps = mpByMatch[m.id] ?? [];
        if (mps.length < 2) continue;

        // nur zählen, wenn Ergebnis gesetzt ist (inkl. Override)
        const hasResults = mps.some((mp) => getPos(mp) != null);
        if (!hasResults) continue;

        const ids = mps.map((x) => x.player_id).filter(Boolean);
        if (ids.length < 2) continue;

        // gleiche Gruppe = gleiche IDs sortiert
        const key = ids.slice().sort().join("::");
        map.set(key, (map.get(key) ?? 0) + 1);
      }

      return map;
    }, [matches, mpByMatch, posOverride]);



  function k(matchId: string, playerId: string) {
    return `${matchId}:${playerId}`;
  }


  function getPos(mp: MP) {
    const key = k(mp.match_id, mp.player_id);
    return Object.prototype.hasOwnProperty.call(posOverride, key)
      ? posOverride[key]
      : mp.position;
  }

  function getScoreStr(mp: MP) {
    const key = k(mp.match_id, mp.player_id);
    if (Object.prototype.hasOwnProperty.call(scoreOverride, key)) {
      return scoreOverride[key];
    }
    return mp.score == null ? "" : String(mp.score);
  }

  const scoreFmt = new Intl.NumberFormat("de-DE"); // 3.300.000.000

  function formatScoreStr(raw: string) {
    const s = (raw ?? "").trim();
    if (!s) return "";
    const n = Number(s);
    if (!Number.isFinite(n)) return s;
    return scoreFmt.format(n);
  }


  async function setPosition(
    matchId: string,
    playerId: string,
    position: number | null
  ) {
    if (locked) return;
 //alert(`setposition: playerID=${playerId}, position=${position}`);
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
      alert("Speichern fehlgeschlagen (Netzwerk setPosition)");
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

function elimUnlockSpeechOnce() {
  if (elimSpeechUnlockedRef.current) return;
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  try {
    const synth = window.speechSynthesis;

    // iOS/Safari: einmal voices anstoßen
    synth.getVoices?.();

    // iOS: "voll stumm" (volume=0) zählt teils nicht als Unlock.
    // Daher minimal hörbar (aber extrem leise).
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0.09;
    u.rate = 1;
    u.pitch = 1;

    u.onend = () => {
      elimSpeechUnlockedRef.current = true;
    };
    
    synth.cancel();
    synth.speak(u);

    // falls onend nicht feuert, trotzdem "best effort" markieren
    setTimeout(() => {
      elimSpeechUnlockedRef.current = true;
    }, 250);
  } catch (e) {
    console.warn("elimUnlockSpeechOnce failed", e);
  }
}



function elimSpeak(text: string) {
  try {
    if (typeof window === "undefined") return;

    const synth = window.speechSynthesis;
    if (!synth) return;

    // iOS: erst nach User-Geste zuverlässig hörbar
    elimUnlockSpeechOnce();

    // iOS/Safari: voices initialisieren
    //const voices = synth.getVoices?.() ?? [];
    const voices = synth.getVoices?.() ?? [];
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";

    // Stimmen laden (wichtig v.a. Safari/iOS)
  

    // "Vicki" bevorzugen, sonst irgendeine englische Stimme
    const vicki =
      voices.find((v) => (v.name || "").toLowerCase().includes("vicki")) ?? null;
    const en =
      voices.find((v) => (v.lang || "").toLowerCase().startsWith("en")) ?? null;

    if (vicki) utter.voice = vicki;
    else if (en) utter.voice = en;

    synth.speak(utter);
  } catch (e) {
    console.warn("elimSpeak failed (ignored):", e);
  }
}

  // ✅ Rotation: Text mit allen doppelt gewählten Flippern (oder "" wenn alles ok)
  function rotationDuplicateMachinesText(): string {
    if (!isRotationFormat) return "";
    const lines: string[] = [];
    for (const [machineId, uses] of Object.entries(rotationMachineUse)) {
      if (uses.length < 2) continue;
      const name = machinesInfoById?.[machineId]?.name ?? "Unbekannter Flipper";
      const roundsTxt = uses.map((u) => `#${u.roundNo}`).join(", ");
      lines.push(`• „${name}“ ist mehrfach gewählt: Runde ${roundsTxt}`);
    }
    return lines.join("\n");
  }

  async function setScore(matchId: string, playerId: string, score: number | null) {
    if (locked) return;

    // ✅ Rotation: Score nur speichern, wenn jeder Flipper genau einmal vergeben ist
    if (isRotationFormat && score !== null) {
      const dupText = rotationDuplicateMachinesText();
      if (dupText) {
        alert(
          "⚠️ Score wurde NICHT gespeichert.\n\n" +
            "Im Modus „Round the Pinball“ darf jeder Flipper nur einmal vorkommen:\n\n" +
            dupText +
            "\n\nBitte zuerst die Flipper-Auswahl korrigieren."
        );
        return;
      }
    }

    const key = k(matchId, playerId);
    setSavingScore((prev) => ({ ...prev, [key]: true }));

    const scoreFmt = new Intl.NumberFormat("de-DE"); // 3.300.000.000

    function formatScoreStr(raw: string) {
      const s = (raw ?? "").trim();
      if (!s) return "";
      const n = Number(s);
      if (!Number.isFinite(n)) return s;
      return scoreFmt.format(n);
    }

    if (isEliminationFormat) {
      elimUnlockSpeechOnce();
    }

    try {
      const res = await fetch("/api/match_players/set-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, match_id: matchId, player_id: playerId, score }),
      });

const j = await res.json().catch(() => ({}));

//alert(`j?.speak?.text: ${j?.speak?.text}`);
//alert(`j?.speak?.kindt: ${j?.speak?.kind}`);

try {
  if (j?.speak?.text && j?.speak?.kind === "elimination_next_round") {
    elimSpeak(j.speak.text);
  }
} catch (e: any) {
  console.error("setScore failed:", e);
  alert("setScore fehlgeschlagen: " + (e?.message ?? "unknown"));
}

      if (!res.ok) {
        alert(j.error ?? "Speichern fehlgeschlagen");
      } else {
        onSaved();
      }
    } catch {
      alert("Speichern fehlgeschlagen (Netzwerk setScore)");
    } finally {
      setSavingScore((prev) => ({ ...prev, [key]: false }));
    }
  }

    async function setTime(matchId: string, playerId: string, time_ms: number | null) {
    if (locked) return;

    const key = k(matchId, playerId);
    setSavingTime((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await fetch("/api/match_players/set-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, match_id: matchId, player_id: playerId, time_ms }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Speichern fehlgeschlagen");
      } else {
        onSaved();
      }
    } catch {
      alert("Speichern fehlgeschlagen (Netzwerk setTime)");
    } finally {
      setSavingTime((prev) => ({ ...prev, [key]: false }));
    }
  }


  async function autoAssignPositionsByScore(matchId: string, mps: any[]) {
  // nur Teilnehmer mit player_id
  const rows = mps.filter((x) => x.player_id);

  // müssen alle scores haben
  const allHaveScores = rows.length >= 2 && rows.every((x) => typeof getScore(x) === "number");
  //alert(`rows.length >= 2=${rows.length}, rows.every((x) => typeof getScore(x) === "number")=${rows.every((x) => typeof getScore(x) === "number")}`);
  //alert(`allHaveScores=${allHaveScores}`);
  if (!allHaveScores) return;

  // wenn schon irgendeine position gesetzt ist -> NICHT anfassen (sicher)
  //const anyPosSet = rows.some((x) => typeof getPos(x) === "number" && getPos(x) > 0);
  //if (anyPosSet) return;

  // Scores holen
  const scored = rows.map((x) => ({ player_id: x.player_id, score: getScore(x) as number }));


  // 🔥 ELIMINATION-SPEZIALFALL: nur Platz 1 / Platz 2
  if (isEliminationFormat) {
    const minScore = Math.min(...scored.map((s) => s.score));
    const losers = scored.filter((s) => s.score === minScore);

    // Gleichstand um den letzten Platz → nicht automatisch entscheiden
    //alert(`autoAssignPositionsByScore: 1 und 2 Plätze setzten`);
    if (losers.length !== 1) return;

    //alert(`losers.length=${losers.length}`);

    const loserPlayerId = losers[0].player_id;

    //alert(`loserPlayerId=${loserPlayerId}`);

    //alert(`scored=${scored}`);

    for (const s of scored) {
      const pos =
        String(s.player_id) === String(loserPlayerId) ? 2 : 1;

        //alert(`autoAssignPositionsByScore ruft setPosition auf für s.player_id: ${s.player_id}`);

      await setPosition(matchId, s.player_id, pos);
    }

    return; // wichtig: danach NICHT weiter mit Ranking-Logik
  }


//alert(`Standart Plätze`);
  // Optional: wenn Gleichstand -> abbrechen (sonst zufälliges Verhalten)
    const uniq = new Set(scored.map((s) => s.score));
   // alert(`uniq=${uniq}`);
   // alert(`scored.length=${scored.length}`);
  if (uniq.size !== scored.length) {
    alert("Gleichstand der Scores");
    return;
  }

  // absteigend sortieren
  scored.sort((a, b) => b.score - a.score);

  // Positionen setzen
   //alert(`Positionen setzen`);
  for (let i = 0; i < scored.length; i++) {
    const pid = scored[i].player_id;
    const pos = i + 1;
    await setPosition(matchId, pid, pos);
  }
}






// kleine helper (falls du die nicht hast)
//function getScore(mp: any) {
  // falls du scoreOverride benutzt, bitte hier NICHT, sondern DB-Wert mp.score
//  return mp?.score ?? null;
//}
function getScore(mp: any) {
  const key = k(mp.match_id, mp.player_id);

  // ✅ 1) Optimistic: wenn es einen Override gibt, nimm den
  const raw = scoreOverride[key];
  if (raw != null) {
    const cleaned = String(raw).replace(/[^0-9]/g, "");
    if (cleaned !== "") {
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
  }

  // ✅ 2) Fallback: Daten aus DB/Reload
  const v = mp.score;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}


function parseTimeToMs(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  // Erlaubt:
  //  - "ss"           (z.B. "12")
  //  - "ss.mmm"       (z.B. "12.345")
  //  - "mm:ss"        (z.B. "1:23")
  //  - "mm:ss.mmm"    (z.B. "1:23.456")

  // Case A: "ss" oder "ss.mmm"
  // Sekunden: 1..n Stellen, optional .mmm (1-3 Stellen)
  {
    const m = s.match(/^(\d+)(?:\.(\d{1,3}))?$/);
    if (m) {
      const sec = Number(m[1]);
      const msPartRaw = m[2] ?? "0";
      const msPart = Number(msPartRaw.padEnd(3, "0")); // "4"->"400", "45"->"450"

      if (![sec, msPart].every(Number.isFinite) || sec < 0 || msPart < 0 || msPart > 999) return null;
      return sec * 1000 + msPart;
    }
  }

  // Case B: "mm:ss" oder "mm:ss.mmm"
  {
    const m = s.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
    if (m) {
      const mm = Number(m[1]);
      const ss = Number(m[2]);
      const msPartRaw = m[3] ?? "0";
      const msPart = Number(msPartRaw.padEnd(3, "0"));

      if (![mm, ss, msPart].every(Number.isFinite) || mm < 0 || ss < 0 || ss > 59 || msPart < 0 || msPart > 999) return null;
      return (mm * 60 + ss) * 1000 + msPart;
    }
  }

  return null;
}


function formatTimeFromMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  const totalMs = Math.max(0, Math.round(ms));

  const totalSec = Math.floor(totalMs / 1000);
  const msec = totalMs % 1000;

  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;

  const msStr = String(msec).padStart(3, "0");

  // Wenn keine Minuten: "ss.mmm" (z.B. "12.345")
  if (mm <= 0) return `${ss}.${msStr}`;

  // Sonst: "mm:ss.mmm" (z.B. "1:02.345")
  return `${mm}:${String(ss).padStart(2, "0")}.${msStr}`;
}


function getTimeMs(mp: any) {
  const key = k(mp.match_id, mp.player_id);
  const raw = timeOverride[key];
  if (raw != null) {
    const parsed = parseTimeToMs(raw);
    if (parsed != null) return parsed;
  }
  const v = mp.time_ms;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}



  const dndSensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
);


function difficultyBadgeClass(d: string) {
  const v = String(d || "").toLowerCase();
  if (v === "easy") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (v === "medium") return "border-sky-300 bg-sky-50 text-sky-700";
  if (v === "hard") return "border-rose-300 bg-rose-50 text-rose-700";
  return "border-neutral-300 bg-neutral-50 text-neutral-700";
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


async function saveStartOrder(matchId: string, orderedPlayerIds: string[]) {
  const res = await fetch(`/api/match_players/set-start-order?ts=${Date.now()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    cache: "no-store",
    body: JSON.stringify({
      matchId,
      orderedPlayerIds,
    }),
  });

  if (!res.ok) {
    // versuche Fehlermeldung vom Server zu lesen (falls JSON)
    const j = await res.json().catch(() => ({} as any));
    const msg =
      (j && (j.error || j.message)) ||
      (await res.text().catch(() => "")) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
}





return (
  <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">Runden & Matches</div>
        <div className="text-[12px] text-neutral-500">
          {isEliminationFormat
            ? "Elimination: aktive Runden sind automatisch offen"
            : isRotationFormat
            ? "Rotation: alle Maschinen-Runden sind automatisch offen"
            : "Zum Öffnen auf eine Runde klicken"}
          {locked ? " • Turnier beendet (read-only)" : ""}
        </div>
      </div>
    </CardHeader>
    <CardBody>
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          <div className="col-span-1">#</div>
          <div className="col-span-3">Format</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-4 text-center">Sieger (Maschine)</div>
          <div className="col-span-2 text-right">Spiele</div>
        </div>

        {rounds





          .slice()
          .sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0))
          .map((r: any) => {
const ms = matchesByRound[r.id] ?? [];
const forcedOpen =
  (isEliminationFormat && r.status === "open") ||
  (isRotationFormat && r.status === "open");
const isOpen =
  forcedOpen ||
  (isEliminationFormat ? openFinishedRoundIds.has(r.id) : openRoundId === r.id);

// ✅ Sieger-Text pro Match inkl. Maschine (genau wie im aufgeklappten Match)

// ✅ Elimination: Spieler-Anzeige im Runden-Header (current/expected)
const expectedPlayers = isEliminationFormat
  ? getExpectedPlayersForEliminationRound(Number(r?.number ?? r?.round_no ?? 0))
  : null;

const currentPlayers = (() => {
  const uniq = new Set<string>();
  for (const mm of ms ?? []) {
    const mid = String((mm as any)?.id ?? "");
    if (!mid) continue;
    for (const mp of (mpByMatch[mid] ?? []) as any[]) {
      if ((mp as any)?.player_id) uniq.add(String((mp as any).player_id));
    }
  }
  return uniq.size;
})();

// ✅ Elimination: niedrigster (aktuell eingegebener) Score in dieser Runde
// (wichtig für "Score to beat" / Cutline)
const lowestScoreInRound = (() => {
  let min: number | null = null;

  for (const mm of ms ?? []) {
    const mid = String((mm as any)?.id ?? "");
    if (!mid) continue;

    for (const mp of (mpByMatch[mid] ?? []) as any[]) {
      if (!(mp as any)?.player_id) continue;
      const sc = getScore(mp);
      if (typeof sc !== "number" || !Number.isFinite(sc)) continue;

      min = min == null ? sc : Math.min(min, sc);
    }
  }

  return min;
})();


const winnersText = (() => {
  // nur bei finished anzeigen (sonst verwirrt’s)
  if (r.status !== "finished") return "—";
  if (!ms.length) return "—";

  return ms
    .map((m: any) => {
      const machineName =
        machinesInfoById?.[String(m.machine_id)]?.name ?? "Maschine";

      // alle Erstplatzierten (bei Team/DYP können das mehrere sein)
      const winners = (mpByMatch[m.id] ?? [])
        .filter((p: any) => p.position === 1)
        .map((p: any) => playersById[p.player_id]?.name ?? "—")
        .filter((n: any) => n && n !== "—");

      const winnerLabel = winners.length ? winners.join(" + ") : "—";
      return `${winnerLabel} (${machineName})`;
    })
    .join(" • ");
})();



            return (
              <div
                key={r.id}
                id={`round-${r.id}`}
                data-open={isOpen ? "true" : "false"}
                className="border-b last:border-b-0"
              >
                <button
                  className="w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-left hover:bg-neutral-50"
                  onClick={() => {
                    if (isEliminationFormat) {
                      // Aktive Runden bleiben immer offen
                      if (r.status === "open") return;
                      setOpenFinishedRoundIds((s) => {
                        const n = new Set(s);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      });
                      return;
                    }
                    setOpenRoundId(isOpen ? null : r.id);
                  }}
                >
                  <div className="col-span-1 font-semibold text-sm  tabular-nums">
                    #{r.number}
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    {(() => {
                      const rn = Number(r?.number ?? r?.round_no ?? 0);
                      const per = roundsPerCycle ?? null;
                      if (!per || !Number.isFinite(rn) || rn <= 0) return null;
                      const idx = Math.floor((rn - 1) / per);
                      const c = MAIN_ROUND_COLORS[idx % MAIN_ROUND_COLORS.length];
                      return (
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: c }}
                        />
                      );
                    })()}

                    <div className="flex flex-col leading-tight">
                      <span className="text-xs text-gray-600">
                          <span
    className={` text-xs ${formatStyleRound(r.format)}`}
  >
    {formatLabel(r.format)}
  </span>
                      </span>

                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          "inline-flex items-center gap-2 rounded-full px-2 py-1 text-[10px] sm:text-[11px] font-semibold ring-1 ring-inset " +
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

                      <span className="text-[11px] text-neutral-500">
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
                  <div className="col-span-4 text-center text-xs sm:text-xs text-neutral-700">
                    {winnersText}
                  </div>
                  <div className="col-span-2 text-right tabular-nums text-xs sm:text-xs">
                   {ms.length}
                  </div>
                </button>


                {/* ✅ NEU: animiertes Auf/Zu statt {isOpen && ...} */}
                <div
                  className={
                    "overflow-hidden transition-all ease-in-out " +
                    (isOpen
                      ? "max-h-[5000px] opacity-100 duration-300"
                      : "max-h-0 opacity-0 duration-700") //Animation 300 500 700
                  }
                  aria-hidden={!isOpen}
                >


                  <div className="border-t bg-neutral-100 px-4 py-4">
                    {ms.length === 0 ? (
                      <div className="text-sm text-neutral-500">
                        Noch keine Matches in dieser Runde.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {ms.map((m, mi) => {
                          const mps = (mpByMatch[m.id] ?? []).slice();

                          // Anzeige-Nummer für die rechte Seite:
                          // - Falls Best-of/Serie gespielt wird, nutzen wir m.game_number (1..n innerhalb einer Serie)
                          // - Sonst ist es einfach die laufende Nummer innerhalb der Runde (1..)
                          const bestOf = Number(
                            (tournament?.best_of ??
                              tournament?.bestOf ??
                              tournament?.bestof ??
                              tournament?.bestOfGames ??
                              m.best_of ??
                              1)
                          );
                          const gnRaw = (m as any)?.game_number;
                          const gameNo =
                            typeof gnRaw === "number"
                              ? gnRaw
                              : typeof gnRaw === "string" && gnRaw.trim() !== ""
                                ? Number(gnRaw)
                                : null;
                          const displayNo = bestOf > 1 && gameNo ? gameNo : mi + 1;


                          mps.sort((a, b) => {
                            const sa = (a.start_position ?? 999) as number;
                            const sb = (b.start_position ?? 999) as number;
                            if (sa !== sb) return sa - sb;
                            const an = playersById[a.player_id]?.name ?? "";
                            const bn = playersById[b.player_id]?.name ?? "";
                            return an.localeCompare(bn);
                          });

                          // DYP: wir erkennen DYP-Matches über das Turnierformat (nicht über ein lokales 'joined')
                          const isDypMatch =
                          ((typeof data === "undefined" ? undefined : data?.tournament?.format) === "dyp_round_robin" && mps.length === 4) ||
                          (mps.length === 4 && mps.some((x) => (x as any).team != null));
const n = isDypMatch ? 2 : Math.max(2, mps.length || 4);

                          // WICHTIG: hier merken, ob schon Ergebnisse gesetzt sind
                          {/*const hasResults = mps.some((mp) => mp.position != null);*/}
                          const hasResults = mps.some((mp) => getPos(mp) != null);

                          // 🎯 Matchpunkte dieses Matches nach Platz (nur Anzeige, lib/pointsDisplay.ts)
                          const matchScheme = Array.from({ length: n }, (_, i) =>
                            matchPointsForDisplay(i + 1, mps.length, String(tournament?.format ?? ""))
                          );






// ✅ Rotation: aktuell höchster (eingegebener) Score in diesem Match
const highestScoreInMatch = (() => {
  let max: number | null = null;

  for (const mp of mps ?? []) {
    if (!(mp as any)?.player_id) continue;
    const sc = getScore(mp as any);
    if (typeof sc !== "number" || !Number.isFinite(sc)) continue;

    max = max == null ? sc : Math.max(max, sc);
  }

  return max;
})();

// ✅ Name(n) des aktuellen Highscore-Halters (bei Gleichstand mehrere)
const highestScoreHolderName = (() => {
  if (typeof highestScoreInMatch !== "number" || !Number.isFinite(highestScoreInMatch)) return "";
  const names: string[] = [];
  for (const mp of mps ?? []) {
    const pid = (mp as any)?.player_id;
    if (!pid) continue;
    const sc = getScore(mp as any);
    if (sc !== highestScoreInMatch) continue;
    const n = String(playersById?.[pid]?.name ?? "").trim();
    if (n) names.push(n);
  }
  return names.join(" & ");
})();

// ✅ Timeplay: beste (kleinste) Zeit in diesem Match
const bestTimeInMatch = (() => {
  let min: number | null = null;

  for (const mp of mps ?? []) {
    if (!(mp as any)?.player_id) continue;
    const tm = getTimeMs(mp as any);
    if (typeof tm !== "number" || !Number.isFinite(tm)) continue;

    min = min == null ? tm : Math.min(min, tm);
  }

  return min;
})();


const scoredPlayersInMatch = (() => {
  let c = 0;
  for (const mp of mps ?? []) {
    const sc = getScore(mp as any);
    if (typeof sc === "number" && Number.isFinite(sc)) c++;
  }
  return c;
})();




                          


                          const groupIds = mps.map((x) => x.player_id).filter(Boolean);
                          const groupKey = groupIds.slice().sort().join("::");
                          const rawPlayed = matchGroupCounts.get(groupKey) ?? 0;

                          // falls dieses Match schon Ergebnis hat: nicht sich selbst mitzählen
                          const playedCount = hasResults ? Math.max(0, rawPlayed - 1) : rawPlayed;


                          const ocrState = ocrByMatch[m.id];

                          // "offen", sobald wir irgendeinen OCR-Inhalt haben (Foto, busy, error, scores, text)
                          const ocrOpen = Boolean(
                            ocrState?.dataUrl ||
                            ocrState?.busy ||
                            ocrState?.error ||
                            (ocrState?.scores?.length ?? 0) > 0 ||
                            ocrState?.text
                          );



                          return (
                            <div
                              key={m.id}
                              className="rounded-2xl border bg-white"
                            >


                                      {/* ================================
                                          OCR pro Match (Foto NICHT speichern)
                                        ================================ */}





                              <div className="pb-match-head flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b bg-[#f8ecdc] px-2 py-1 sm:px-3 sm:py-2">
                              
                                {/* Linke Seite: Maschine + Spiel + Hinweis */}
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2 sm:gap-3">


                                    {/* 🎰 Maschinen-Icon */}
                                    {m.machine_id ? (
                                      <MachineIcon
                                        name={machinesInfoById[m.machine_id]?.name ?? "Maschine"}
                                        emoji={machinesInfoById[m.machine_id]?.emoji ?? null}
                                      />
                                    ) : (
                                      <MachineIcon name={"Maschine"} emoji={null} />
                                    )}
                                    {/* Maschinen-Dropdown */}
                                    <Select
                                      value={m.machine_id ?? ""}
                                      className="rounded-lg h-02 max-h-10 w--[130px] max-w-[130px]  px-3 py-2 text-xs sm:px-3 sm:py-2 sm:text-xs sm:h-8 sm:max-h-8 "
                                      
                                                                            title={
                                        locked
                                          ? "Turnier ist beendet – Maschine kann nicht mehr geändert werden."
                                          : hasResults
                                          ? "Ergebnisse gesetzt – Maschine kann nicht mehr geändert werden."
                                          : "Solange noch keine Ergebnisse gesetzt sind, kann die Maschine geändert werden."
                                      }

disabled={
                                        locked || hasResults || savingMachine[m.id]
                                      }
                                      onChange={(e) =>
                                        handleChangeMachine(
                                          m.id,
                                          e.target.value === ""
                                            ? null
                                            : e.target.value
                                        )
                                      }
                                    >
                                      <option value="">Maschine wählen…</option>
                                      {Object.entries(machinesInfoById).map(([id, info]) => {
                                        // ✅ Rotation: Hinweis, wenn Flipper schon in einer anderen Runde gewählt ist
                                        const otherRounds = isRotationFormat
                                          ? (rotationMachineUse[id] ?? [])
                                              .filter((u) => u.matchId !== String(m.id))
                                              .map((u) => `#${u.roundNo}`)
                                          : [];
                                        return (
                                          <option key={id} value={id}>
                                            {info.name}
                                            {otherRounds.length > 0
                                              ? ` (schon in ${otherRounds.join(", ")})`
                                              : ""}
                                          </option>
                                        );
                                      })}
                                    </Select>













                                <div className="font-semibold text-[11px] text-neutral-500 whitespace-nowrap">
                                  {savingMachine[m.id] ? (
                                    "speichere…"
                                  ) : m.machine_id ? (
                                    <>
                                      Flipper: <span className="font-semibold text-[11px]  text-blue-500">{machineUsageCounts[m.machine_id] ?? 0} x</span> im Turnier
                                    </>
                                  ) : (
                                    <>Flipper: <span className="font-semibold text-[11px] text-blue-500">0 x</span> im Turnier verwendet</>
                                    
                                  )}
                                  <div className="font-semibold text-[11px] text-neutral-500">
                                    Paarung: <span className="font-semibold text-blue-500">{playedCount + 1} × </span>im Turnier
                                  </div>

                                  
                                </div>




                                  </div>
                                </div>

                                {/* Rechte Seite: Match-ID / Speichern-Status */}
                                <div className="flex text-xs text-neutral-500 whitespace-nowrap">
                                   {displayNo ? (
                                      <div className="flex  items-end flex items-center  gap-2">
                                        <PointsSchemeLine values={matchScheme} />
                                        <span className="font-semibold text-neutral-500 whitespace-nowrap">
                                          Spiel {displayNo}
                                        </span>

                                        {/* Rotation-Timer ist global im rechten Sticky-Bereich */}

                                        {/* OCR Button (öffnet weiterhin das Panel unten) */}
                                        <label
                                          htmlFor={`ocr-${m.id}`}
                                          className={[
                                            "inline-flex items-center justify-center rounded-xl px-2 py-1 text-xs font-semibold",
                                            "border bg-black text-white cursor-pointer select-none",
                                            (locked || ocrByMatch[m.id]?.busy) ? "opacity-50 pointer-events-none" : "",
                                          ].join(" ")}
                                        >
                                          📷 OCR
                                        </label>
                                      </div>
                                    ) : null}
                                    {/*
                                    <div className="text-xs text-neutral-500 whitespace-nowrap">
                                   {m.game_number ? (
                                      <span className="font-semibold text-white whitespace-nowrap">
                                        Place
                                      </span>
                                    ) : null}
                                    </div> */}
                                </div>

                                {/* 🏆 Highscore + 30-Tage-Highscore des Flippers (eigene Zeile im Kopf) */}
                                <MatchRecordsLine
                                  hidden={tournament?.status === "finished"}
                                  code={code}
                                  machineName={m.machine_id ? machinesInfoById[m.machine_id]?.name : null}
                                  liveEntries={liveRecordEntries}
                                />
                              </div>

                                      {/* ================================
                                          OCR pro Match (Foto NICHT speichern)
                                        ================================ */}
                                      <div className="px-2 sm:px-4">
                                        <div className="rounded-2xl  bg-white p-2">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-xs font-semibold">{/*Foto → OCR → Punkte*/}</div>

                                            <div className="flex items-center gap-2">
                                              {/* Hidden file input (öffnet Kamera / Foto-Auswahl) */}
                                              <input
                                                id={`ocr-${m.id}`}
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                disabled={locked || ocrByMatch[m.id]?.busy}
                                                onChange={async (e) => {
                                                  const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                                                  if (!f) return;

                                                  const dataUrl = await fileToDownscaledDataUrl(f);

                                                  // State setzen (öffnet automatisch das Panel, weil dataUrl da ist)
                                                  setOcr(m.id, { dataUrl, error: "", text: "", scores: [] });

                                                  // OCR automatisch starten (WICHTIG: Override mitgeben!)
                                                  runOcrForMatch(m.id, mps.length, dataUrl);

                                                  // input resetten, damit man das gleiche Foto nochmal wählen kann
                                                  (e.target as HTMLInputElement).value = "";
                                                }}
                                              />

                                              
{/* Optional: kleiner Status rechts daneben */}
                                              {ocrByMatch[m.id]?.busy ? (
                                                <span className="text-xs text-neutral-500">OCR läuft…</span>
                                              ) : null}
                                            </div>

                                          </div>
{ocrOpen ? (
  <div className="mt-2 rounded-xl border bg-white p-3">
    {ocrByMatch[m.id]?.dataUrl ? (
      <div className="rounded-xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ocrByMatch[m.id].dataUrl}
          alt="OCR preview"
          className="max-h-56 w-full object-contain"
        />
      </div>
    ) : null}

    {ocrByMatch[m.id]?.error ? (
      <div className="mt-2 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">
        {ocrByMatch[m.id].error}
      </div>
    ) : null}

    {ocrByMatch[m.id]?.notice ? (
      <div className="mt-2 whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
        {ocrByMatch[m.id].notice}
      </div>
    ) : null}

    {ocrByMatch[m.id]?.scores?.length ? (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="text-xs text-neutral-600">
          Erkannte Punkte (Reihenfolge = Startreihenfolge im Match):

          {(() => {
            const ids = mps.map((x: any) => x.player_id).filter(Boolean);
            const orderIds = (localStartOrderByMatchId[m.id] ?? ids).map(String);

            return (
              <div className="mt-2 text-sm text-gray-600">
                <div className="font-medium mb-1">Mapping (Startreihenfolge):</div>

                {orderIds.map((pid, idx) => {
                  const p = playersById[pid];
                  const score = ocrByMatch[m.id]?.scores?.[idx];

                  return (
                    <div key={pid}>
                      P{idx + 1} → {p?.name ?? pid}
                      {typeof score === "number" ? ` (${score.toLocaleString("de-DE")})` : ""}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="flex flex-wrap gap-2">
          {ocrByMatch[m.id].scores.map((s, idx) => (
            <span key={idx} className="rounded-full border bg-neutral-50 px-3 py-1 text-xs">
              P{idx + 1}: {new Intl.NumberFormat("de-DE").format(s)}
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            disabled={locked || ocrByMatch[m.id]?.busy}
            onClick={async () => {
              const ids = mps.map((x: any) => x.player_id).filter(Boolean);
              const orderIds = (localStartOrderByMatchId[m.id] ?? ids).map(String);

              const scores = ocrByMatch[m.id].scores ?? [];
              const playerCount = orderIds.length;
              const recognizedCount = scores.length;

              // ✅ immer: erkannte Scores übernehmen
              await applyOcrScoresToMatch(m.id, orderIds, scores);

              if (recognizedCount < playerCount) {
                // ✅ unvollständig: KEINE Auto-Platzierung
                setOcr(m.id, {
                  notice: `Nur ${recognizedCount}/${playerCount} Scores erkannt. Bitte die fehlenden Scores manuell eintragen – Platzierung wird erst gesetzt, wenn alle Scores vorhanden sind.`,
                });
                return; // Panel bleibt offen
              }

              // ✅ vollständig: Plätze überschreiben
              await autoAssignPositionsByExplicitScores(m.id, orderIds, scores);

              // ✅ danach einklappen & reset OCR UI
              setOcr(m.id, { dataUrl: "", text: "", scores: [], error: "", notice: "", busy: false });
            }}

          >
            Übernehmen
          </Button>

          <Button
            disabled={locked || ocrByMatch[m.id]?.busy}
            onClick={() => setOcr(m.id, { dataUrl: "", text: "", scores: [], error: "", busy: false })}
          >
            Reset
          </Button>
        </div>
      </div>
    ) : null}

    {ocrByMatch[m.id]?.text ? (
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-neutral-600">
          OCR Rohtext anzeigen
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-xl border bg-neutral-50 p-2 text-[11px]">
          {ocrByMatch[m.id].text}
        </pre>
      </details>
    ) : null}
  </div>
) : null}


                  {isEliminationFormat ? (
                      <div className="p-2 bg-yellow-100 text-center text-xs sm:text-xs text-neutral-700 truncate">
                          
                              <>
                                <div className="text-[12px] font-semibold text-neutral-500 tabular-nums">
                                  Spieler: {currentPlayers}/{expectedPlayers ?? "—"}
                                </div>
                                <div className="text-[12px] mt-1 mb-1 font-semibold text-neutral-500 tabular-nums">
                                  Cutoff
                                </div>
                                <div className="text-center text-[12px] font-semibold text-neutral-500 tabular-nums">
                                   <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 6,
                                      alignItems: "center",   // 👈 DAS ist der Punkt
                                    }}
                                  >
                                    
                                      <PinballScore
                                        value={lowestScoreInRound}
                                        minDigits={7}
                                      />
                                    </div>
                                </div>
                              </>
                          
                        </div>
) : isRotationFormat ? (
  <div className="p-2 bg-blue-50 text-center text-xs sm:text-xs text-neutral-700 truncate">
    <>
      <div className="text-[12px] mt-1 mb-1 font-semibold text-neutral-500 tabular-nums">
        Highscore
      </div>

      <div className="text-center text-[12px] font-semibold text-neutral-500 tabular-nums">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
          {typeof highestScoreInMatch === "number" && Number.isFinite(highestScoreInMatch) ? (
            <>
              <PinballScore value={highestScoreInMatch} minDigits={7} />
              {highestScoreHolderName ? (
                <div className="max-w-full truncate text-sm font-semibold text-neutral-700">
                  🏆 {highestScoreHolderName}
                </div>
              ) : null}
            </>
          ) : (
            <span className="text-[12px] text-neutral-500">—</span>
          )}
        </div>
      </div>
    </>
  </div>
) : isTimeplayFormat ? (
  <div className="p-2 bg-yellow-50 text-center text-xs sm:text-xs text-neutral-700 truncate">
{(() => {
  const taskId = String((m as any)?.task_id ?? "");
  const taskObj = taskId ? (tasksById as any)[taskId] : null;

  const taskTitle = String((m as any)?.task_text ?? taskObj?.title ?? "").trim();
  const taskDesc = String(taskObj?.description ?? "").trim();
  const taskDifficulty = String(taskObj?.difficulty ?? "").trim();

  return (
    <>
<div className="relative text-[12px] font-semibold text-neutral-500 tabular-nums h-5">
  {/* ZENTRIERTER TEXT */}
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <span>
      Aufgabe: {taskTitle || "—"}
    </span>
  </div>

  {/* RECHTS: BADGE */}
  {taskDifficulty && (
    <div className="absolute right-0 top-1/2 -translate-y-1/2">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]
          ${difficultyBadgeClass(taskDifficulty)}`}
      >
        {taskDifficulty}
      </span>
    </div>
  )}
</div>

      {taskDesc ? (
        <div className="text-[11px] mt-1 text-neutral-500 whitespace-normal">
          {taskDesc}
        </div>
      ) : null}

      <div className="text-[12px] mt-1 text-neutral-500 tabular-nums">
        Beste Zeit: {bestTimeInMatch != null ? formatTimeFromMs(bestTimeInMatch) : "—"}
      </div>
    </>
  );
})()}

  </div>
) : null}
                                        </div>
                                 
                                      </div>  






<div className="px-2 pt-0 pb-2 sm:px-4 sm:pt-0 sm:pb-4">
  {(() => {
    const ids = mps.map((x) => x.player_id).filter(Boolean);

    // ✅ wenn lokal schon gezogen wurde: diese Reihenfolge anzeigen
    const orderIds = localStartOrderByMatchId[m.id] ?? ids;

    // DYP: In der Match-Ansicht zeigen wir Teams (2 Zeilen) – dafür macht Drag&Drop der Startreihenfolge keinen Sinn.
    const isDypMatch =
      ((typeof data === "undefined" ? undefined : data?.tournament?.format) === "dyp_round_robin" && mps.length === 4) ||
      (mps.length === 4 && mps.some((x) => (x as any).team != null));

    // Round the Pinball (rotation): Startreihenfolge ist beim Erzeugen so verteilt, dass pro Runde
    // jeder Spieler an einem anderen Startplatz/Flipper ist → nicht von Hand verschieben.
    const dndDisabled = locked || hasResults || isDypMatch || isRotationFormat; // ✅ nur solange keine Ergebnisse gesetzt sind

        // ✅ HIERHIN (vor return!)
    const mpByPlayerId = new Map(mps.map((mp) => [mp.player_id, mp]));
    const orderedMps = orderIds
      .map((pid) => mpByPlayerId.get(pid))
      .filter(Boolean) as any[];

    // ✅ Rotation: aktiver Spieler am Flipper = erster von oben ohne gespeicherten Score
    // (zu Rundenbeginn der oberste; haben alle einen Score, ist niemand mehr aktiv)
    const rotationActivePlayerId: string | null =
      isRotationFormat && !locked
        ? (orderedMps.find(
            (x: any) =>
              !(x?.score != null && x?.score !== "" && Number.isFinite(Number(x.score)))
          )?.player_id ?? null)
        : null;

    // =========================
    // 🧑‍🤝‍🧑 DYP Match Ansicht (2 Team-Zeilen)
    // =========================
    if (isDypMatch) {
      const t1 = mps
        .filter((x) => (x as any).team === 1)
        .sort((a, b) => ((a.start_position ?? 999) as any) - ((b.start_position ?? 999) as any));
      const t2 = mps
        .filter((x) => (x as any).team === 2)
        .sort((a, b) => ((a.start_position ?? 999) as any) - ((b.start_position ?? 999) as any));

      // Fallback: falls team nicht gesetzt ist, nutzen wir die Reihenfolge
      const team1 = t1.length === 2 ? t1 : orderedMps.slice(0, 2);
      const team2 = t2.length === 2 ? t2 : orderedMps.slice(2, 4);

      const teamPos = (team: any[]) => {
        const p1 = getPos(team[0]);
        const p2 = getPos(team[1]);
        if (p1 == null && p2 == null) return "";
        if (p1 != null && p1 === p2) return String(p1);
        return "";
      };

      const setTeamResult = async (teamNr: 1 | 2, nextRaw: string) => {
        if (locked) return;
        const next = nextRaw === "" ? null : Number(nextRaw);
        const all = [...team1, ...team2];

        if (next == null) {
          // Reset: alle vier freimachen
          for (const mp of all) {
            await setPosition(m.id, mp.player_id, null);
          }
          return;
        }

        const otherNext = next === 1 ? 2 : 1;
        const mine = teamNr === 1 ? team1 : team2;
        const opp = teamNr === 1 ? team2 : team1;

        for (const mp of mine) {
          await setPosition(m.id, mp.player_id, next);
        }
        for (const mp of opp) {
          await setPosition(m.id, mp.player_id, otherNext);
        }
      };

      const label = (team: any[]) => {
        const a = playersById[team[0]?.player_id]?.name ?? "?";
        const b = playersById[team[1]?.player_id]?.name ?? "?";
        return `${a} / ${b}`;
      };

      const takenBy = (teamNr: 1 | 2) => {
        const other = teamNr === 1 ? team2 : team1;
        const p = getPos(other[0]);
        if (p == null) return null;
        return { pos: p, name: label(other) };
      };

      return (
        <div className="space-y-2">
          <div className="text-xs text-neutral-600 px-1">
            {label(team1)} <span className="text-neutral-400">vs</span> {label(team2)}
          </div>

          {([
            { nr: 1 as const, team: team1 },
            { nr: 2 as const, team: team2 },
          ] as const).map(({ nr, team }) => {
            const pos = teamPos(team);
            const tb = takenBy(nr);
            const isWinner = pos === "1";

            return (
              <div
                key={nr}
                className={
                  "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-2 py-1 sm:px-3 sm:py-2 " +
                  (isWinner ? "bg-amber-200 border-amber-300" : "bg-white")
                }
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 text-[10px]">
                    <PlayerPill player={playersById[team[0]?.player_id] ?? { name: "?" }} />
                    <Pill>/</Pill>
                    <PlayerPill player={playersById[team[1]?.player_id] ?? { name: "?" }} />
                  </div>
                  {pos ? <Pill><span className="text-[10px]">#{pos}</span></Pill> : <Pill>—</Pill>}
                  {isWinner ? <Pill><span className="text-[10px]">🏆 Sieger</span></Pill> : null}
                </div>

                <div className="w-44 flex flex-col gap-1">
                  <Select
                    value={pos}
                    className="rounded-lg px-2 py-1 text-xs sm:px-3 sm:py-2 sm:text-xs"
                    disabled={locked || isEliminationFormat}
                    onChange={(e) => setTeamResult(nr, e.target.value)}
                  >
                    <option value="">Platz —</option>
                    {[1, 2].map((p) => (
                      <option key={p} value={p}>
                        {tb?.pos === p ? `⛔ Platz ${p} (belegt durch ${tb.name})` : `✅ Platz ${p}`}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <DndContext
        sensors={dndSensors}
        collisionDetection={closestCenter}


        
        onDragEnd={async({ active, over }) => {
          if (dndDisabled) return;
          if (!over) return;
          if (active.id === over.id) return;

          const oldIndex = orderIds.indexOf(String(active.id));
          const newIndex = orderIds.indexOf(String(over.id));
          if (oldIndex < 0 || newIndex < 0) return;

          const newIds = arrayMove(orderIds, oldIndex, newIndex);

          // ✅ 1) sofort UI updaten (kein Zurückspringen)
          setLocalStartOrderByMatchId((prev) => ({ ...prev, [m.id]: newIds }));

          try {
            // ✅ 2) speichern
            await saveStartOrder(m.id, newIds);

            // ✅ 3) reload (kann bleiben)
            onSaved(); // reloadAll
          } catch (e: any) {
            console.error(e);

            // ❌ bei Fehler zurücksetzen
            setLocalStartOrderByMatchId((prev) => {
              const next = { ...prev };
              delete next[m.id];
              return next;
            });

            alert(`Konnte Startreihenfolge nicht speichern:\n${e?.message ?? e}`);
          }
        }}
      >
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          
          
          <div className="space-y-2">
            
            {orderedMps.map((mp) => {
              const pos = getPos(mp);

              // ✅ Welche Plätze sind in diesem Match schon vergeben – und von wem?
              const takenBy = new Map<number, string>();
              for (const other of mps) {
                if (other.player_id === mp.player_id) continue;
                const op = getPos(other);

                if (typeof op === "number" && op > 0) {
                  const otherName = playersById[other.player_id]?.name ?? "jemand";
                  takenBy.set(op, otherName);
                }
              }

              const isWinner = pos === 1;
              const isSaving = saving[k(mp.match_id, mp.player_id)] === true;

              // ✅ Rotation: Score bereits gespeichert (DB-Wert) -> dezent grün hinterlegen
              const hasSavedScore =
                isRotationFormat &&
                (mp as any)?.score != null &&
                (mp as any)?.score !== "" &&
                Number.isFinite(Number((mp as any).score));

              // ✅ Rotation: dieser Spieler ist gerade am Flipper dran -> blau
              const isActiveAtMachine =
                rotationActivePlayerId != null && mp.player_id === rotationActivePlayerId;

              return (
                <SortablePlayerRow
                  key={k(mp.match_id, mp.player_id)}
                  id={mp.player_id}
                  disabled={dndDisabled}
                >
                  <div
                    className={
                      "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 sm:px-3 sm:py-2 " +
                      (isWinner
                        ? "bg-amber-200 border-amber-300"
                        : hasSavedScore
                        ? "bg-emerald-50 border-emerald-200"
                        : isActiveAtMachine
                        ? "bg-sky-50 border-sky-400 ring-2 ring-sky-300/70"
                        : "bg-white")
                    }
                  >
                    
<div className="flex flex-col min-w-0">
  <div className="flex flex-col gap-0.5">
  <div className="flex items-center gap-2 text-[14px]">
    <PlayerPill
      player={
        playersById[mp.player_id] ?? {
          name: "Unbekannt",
        }
      }
    />
    {pos ? <Pill><span className="text-[11px]">#{pos}</span></Pill> : <Pill>—</Pill>}
    {isWinner ? <Pill><span className="text-[11px]">🏆 Sieger</span> </Pill>: null}
    {isActiveAtMachine ? (
      <span className="inline-flex items-center rounded-full bg-sky-500 px-2.5 py-0.5 text-[11px] font-semibold text-white animate-pulse">
        ▶ spielt
      </span>
    ) : null}
    {isSaving ? (
      <span className="text-xs text-neutral-500">speichere…</span>
    ) : null}
  </div>

    
    {/* Winrate direkt im Match (links) */}
    {!isTimeplayFormat && (
    <div className="pl-9 flex items-center gap-3 text-[11px] tabular-nums">
      {(() => {
        const pid = mp?.player_id ? String(mp.player_id) : "";
        const profileId =
          pid && playersById?.[pid]?.profile_id ? String(playersById[pid].profile_id) : "";

        const t = profileId ? (tWinrateByPlayerId?.[profileId] ?? null) : null;

        const machineName =
          machinesInfoById?.[String(m?.machine_id ?? "")]?.name
            ? String(machinesInfoById[String(m.machine_id)].name)
            : "";

        const key = profileId && machineName && locationId ? `${profileId}__${machineName}__${locationId}` : "";
        const mwr = key ? (mWinrateByKey?.[key] ?? null) : null;
        const mpCount = typeof mwr?.matchesPlayed === "number" ? mwr.matchesPlayed : 0;

        // ✅ Vergleich innerhalb DESSELBEN Matches: höchste Werte grün markieren (wie rechts)
        const getProfileId = (playerIdRaw: any) => {
          const p = playerIdRaw ? String(playerIdRaw) : "";
          return p && playersById?.[p]?.profile_id ? String(playersById[p].profile_id) : "";
        };
  
        const tVals: number[] = [];
        const mVals: number[] = [];
  
        for (const other of mps ?? []) {
          const otherProfileId = getProfileId(other?.player_id);
          if (!otherProfileId) continue;
  
          const ot = tWinrateByPlayerId?.[otherProfileId];
          if (typeof ot === "number" && Number.isFinite(ot)) tVals.push(ot);
  
          if (machineName && locationId) {
            const oKey = `${otherProfileId}__${machineName}__${locationId}`;
            const omwr = mWinrateByKey?.[oKey];
            const ov = omwr?.winrate;
            if (typeof ov === "number" && Number.isFinite(ov)) mVals.push(ov);
          }
        }

        const maxT = tVals.length > 0 ? Math.max(...tVals) : null;
        const maxM = mVals.length > 0 ? Math.max(...mVals) : null;

                // Runde-Status ist in diesem Block nicht zuverlässig vorhanden.
// Wir nehmen hier den Match-Status (wie rechts im Winrate-Kasten): Aktiv = nicht finished.
const matchStatusRaw = String((m as any)?.status ?? "").toLowerCase();
const isRoundActive = matchStatusRaw !== "finished";

        const tIsTop = typeof t === "number" && Number.isFinite(t) && typeof maxT === "number" && t === maxT;
        const mIsTop =
          typeof mwr?.winrate === "number" &&
          Number.isFinite(mwr.winrate) &&
          typeof maxM === "number" &&
          mwr.winrate === maxM;

        // ✅ Nur in aktiver Runde grün highlighten. Wenn finished: alles neutral.
        const tCls = isRoundActive && tIsTop ? "text-emerald-600 font-semibold" : "text-neutral-500";
        const mCls = isRoundActive && mIsTop ? "text-emerald-600 font-semibold" : "text-neutral-500";

        // ⭐ Favorit: nur in aktiver Runde.
        // Favorit ist der Spieler, der mehr "grüne Werte" hat (Winrate + M-Winrate). Bei Gleichstand: kein Icon.
        let isFavorite = false;
        if (isRoundActive) {
          const greenCountByProfile: Record<string, number> = {};
          for (const other of mps ?? []) {
            const otherProfileId = getProfileId(other?.player_id);
            if (!otherProfileId) continue;
            const ot = tWinrateByPlayerId?.[otherProfileId];
            const om = machineName && locationId ? mWinrateByKey?.[`${otherProfileId}__${machineName}__${locationId}`]?.winrate : null;
            const otIsTop = typeof ot === "number" && Number.isFinite(ot) && typeof maxT === "number" && ot === maxT;
            const omIsTop = typeof om === "number" && Number.isFinite(om) && typeof maxM === "number" && om === maxM;
            greenCountByProfile[otherProfileId] = (otIsTop ? 1 : 0) + (omIsTop ? 1 : 0);
          }
          const counts = Object.values(greenCountByProfile);
          const maxCount = counts.length ? Math.max(...counts) : 0;
          const winners = counts.filter((c) => c === maxCount).length;
          const myCount = profileId ? (greenCountByProfile[profileId] ?? 0) : 0;
          isFavorite = maxCount > 0 && winners === 1 && myCount === maxCount;
        }

return (
          <>
            <span className="text-neutral-500">
              Turnier-Winrate <span className={tCls}>{fmtPct(t)}</span>
            </span>
            <span className="text-neutral-500">
              Flipper-Winrate <span className={mCls}>{fmtPct(mwr?.winrate)}</span>
              {mpCount > 0 ? ` (${mpCount})` : ""}
            </span>
            {isRoundActive && isFavorite ? (
              <span className="text-yellow-500 text-sm" title="Favorit">★</span>
            ) : null}
            {winrateLoading ? <span className="text-neutral-400">lädt…</span> : null}
          </>
        );
      })()}
    </div>
    )}

    {/* 💪 Persönlicher Highscore auf diesem Flipper */}
    <div className="pl-9">
      <PersonalBestLine
        hidden={tournament?.status === "finished"}
        code={code}
        profileId={mp?.player_id ? playersById?.[String(mp.player_id)]?.profile_id ?? null : null}
        machineName={m?.machine_id ? machinesInfoById?.[String(m.machine_id)]?.name ?? null : null}
        liveEntries={liveRecordEntries}
      />
    </div>
</div>
</div>







                    <div className="flex flex-col gap-1">





                      <div className="flex items-center gap-1.5">
                      <PointsGainBadge
                        points={typeof pos === "number" && pos > 0 ? matchScheme[pos - 1] ?? 0 : null}
                      />
                      <Select
                        value={pos ?? ""}
                        className="rounded-lg h-10 max-h-10 w--[160px] max-w-[160px]  px-1 py-1 text-xs sm:px-3 sm:py-2 sm:text-xs sm:h-8 sm:max-h-8"
                        disabled={locked || isEliminationFormat || isRotationFormat}
                        //onChange={async (e) => {
                        
                        onChange={
                           
                            (isEliminationFormat || isRotationFormat)
                              ? undefined
                              : async (e) => {
                          if (locked) return;
                          const v = e.target.value;
                          const next = v === "" ? null : Number(v);

                          

                          const currentPos =
                            typeof pos === "number" && pos > 0 ? pos : null;

                          // =========================
                          // 🥇 1vs1: Auto-Complete
                          // =========================
                          if (mps.length === 2) {
                            const other = mps.find(
                              (x) => x.player_id !== mp.player_id
                            );
                            if (!other) return;

                            // Reset: Platz — -> beide —
                            if (next == null) {
                              await setPosition(m.id, mp.player_id, null);
                              await setPosition(m.id, other.player_id, null);
                              return;
                            }

                            // 1 oder 2 gesetzt -> anderer bekommt automatisch den Gegenplatz
                            const otherNext = next === 1 ? 2 : 1;

                            await setPosition(m.id, mp.player_id, next);

                            const otherPos = getPos(other);
                            if (otherPos !== otherNext) {
                              await setPosition(m.id, other.player_id, otherNext);
                            }

                            return;
                          }

                          // =========================
                          // 🧩 3–4 Spieler: 1:1 Swap
                          // =========================

                          // Platz — -> freimachen
                          if (next == null) {
                            await setPosition(m.id, mp.player_id, null);
                            return;
                          }

                          // Wer hält diesen Platz?
                          const otherMp = mps.find(
                            (x) =>
                              x.player_id !== mp.player_id && getPos(x) === next
                          );

                          // Platz frei -> normal setzen
                          if (!otherMp) {
                            await setPosition(m.id, mp.player_id, next);
                            return;
                          }

                          // 1:1 SWAP (nur 2 Spieler betroffen)
                          if (currentPos === next) return;

                          await setPosition(m.id, otherMp.player_id, currentPos);
                          await setPosition(m.id, mp.player_id, next);
                        }}
                      >
                        <option value="">Platz —</option>

                        {Array.from({ length: n }, (_, i) => i + 1).map((p) => {
                          const holder = takenBy.get(p);

                          return (
                            <option key={p} value={p}>
                              {isEliminationFormat
                                ? `Platz ${p}`
                                : holder
                                  ? `⛔ Platz ${p} (belegt durch ${holder})`
                                  : `✅ Platz ${p}`}
                            </option>
                          );
                        })}
                      </Select>
                      </div>

                      {/* ✅ NEU: Flipperpunkte/Score (unter Platz-Dropdown) */}
                      <div className="flex items-center gap-2">





{isTimeplayFormat ? (
  <>
    <span className="text-[10px] sm:text-xs text-neutral-500 whitespace-nowrap">
      Zeit
    </span>

    <Input
      value={
        timeFocusKey === k(mp.match_id, mp.player_id)
          ? (timeOverride[k(mp.match_id, mp.player_id)] ?? formatTimeFromMs(getTimeMs(mp)))
          : (timeOverride[k(mp.match_id, mp.player_id)] ?? formatTimeFromMs(getTimeMs(mp)))
      }
      onFocus={() => setTimeFocusKey(k(mp.match_id, mp.player_id))}
      inputMode="text"
      placeholder="z.B. 45 oder 1:12"
      className="h-7 rounded-md px-2 py-1 text-xs sm:h-7 sm:px-3 sm:py-2 sm:h-5 max-h-5 max-w-[115px] text-xs [text-size-adjust:100%] [-webkit-text-size-adjust:100%]"
      disabled={locked}
      onChange={(e) => {
        const key = k(mp.match_id, mp.player_id);
        setTimeOverride((prev) => ({ ...prev, [key]: e.target.value }));
      }}
      onBlur={async () => {
        setTimeFocusKey(null);

        const key = k(mp.match_id, mp.player_id);
        const raw = (timeOverride[key] ?? "").trim();

        // leer -> Zeit löschen
        if (raw === "") {
          await setTime(mp.match_id, mp.player_id, null);
          return;
        }

        const ms = parseTimeToMs(raw);
        if (ms == null) {
          alert("Ungültige Zeit. Nutze z.B. '45' oder '1:12'");
          return;
        }

        // 1) Zeit speichern
        await setTime(mp.match_id, mp.player_id, ms);

        // 2) Prüfen: sind alle Zeiten im Match gesetzt?
        //    ⚠️ wie bei deinem Elimination-Fix: NICHT mps aus Closure vertrauen
        const latestMps =
          (matchPlayers ?? []).filter((x: any) => String(x?.match_id) === String(m?.id));

        const rows = (latestMps ?? []).filter((x: any) => x?.player_id);
        const allHaveTimes = rows.length >= 2 && rows.every((x: any) => typeof getTimeMs(x) === "number");
        if (!allHaveTimes) return;

        // 3) Tie-Check
        const times = rows.map((x: any) => getTimeMs(x) as number);
        const uniq = new Set(times);
        if (uniq.size !== times.length) {
          alert("Gleichstand der Zeiten");
          return;
        }

        // 4) Sortieren: kleinste Zeit = best
        const sorted = rows
          .map((x: any) => ({ player_id: x.player_id, time_ms: getTimeMs(x) as number }))
          .sort((a: any, b: any) => a.time_ms - b.time_ms);

        // 5) Score-Mapping (100/99/98...) + speichern
        const scoreByPid: Record<string, number> = {};
        for (let i = 0; i < sorted.length; i++) {
          const pid = String(sorted[i].player_id);
          const score = 100 - i;
          scoreByPid[pid] = score;

          // optional: optimistic Override setzen, damit autoAssign sofort korrekt läuft
          setScoreOverride((prev) => ({ ...prev, [k(mp.match_id, pid)]: String(score) }));

          await setScore(mp.match_id, pid, score);
        }

        // 6) autoAssign: mit gepatchten Scores, damit es sofort korrekt arbeitet
        const patchedLatestMps = rows.map((x: any) => ({
          ...x,
          score: scoreByPid[String(x.player_id)] ?? x.score,
        }));

        if (isEliminationFormat) {
          // Timeplay wirst du normalerweise nicht als elimination fahren,
          // aber falls doch, bleibt die Logik konsistent.
          const expected = getExpectedPlayersForEliminationRound(Number(r?.number ?? 0));
          const currentCount = patchedLatestMps.length;
          if (expected && currentCount === expected) {
            await autoAssignPositionsByScore(m.id, patchedLatestMps);
          }
        } else {
          await autoAssignPositionsByScore(m.id, patchedLatestMps);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />

    {/* ⏱️ Fullscreen-Stoppuhr wie Rotation-Timer */}
    <button
      type="button"
      className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md border bg-white text-sm hover:bg-neutral-50 active:scale-[0.99] disabled:opacity-50"
      disabled={locked}
      title="Stoppuhr öffnen"
      onClick={() => {
        const initialMs = getTimeMs(mp) ?? 0;
        tpOpenStopwatch(mp.match_id, mp.player_id, initialMs);
      }}
    >
      ⏱️
    </button>



    {savingTime[k(mp.match_id, mp.player_id)] ? (
      <span className="text-[10px] sm:text-xs text-neutral-500">
        speichere…
      </span>
    ) : null}
  </>
) : (
  <>
    <span className="text-[10px] sm:text-xs text-neutral-500 whitespace-nowrap">
      Punkte
    </span>

    {/* Punkte: Trennzeichen schon beim Tippen + große Vorschau (components/ScoreInput.tsx) */}
    <ScoreInput
      digits={String(getScoreStr(mp) ?? "").replace(/[^0-9]/g, "")}
      onFocus={() =>
        setScoreFocusKey(k(mp.match_id, mp.player_id))
      }
      placeholder="0"
      className="h-7 rounded-md px-2 py-1 text-xs sm:h-7 sm:px-3 sm:py-2 sm:h-5 max-h-5 w--[115px] max-w-[115px]  text-xs [text-size-adjust:100%] [-webkit-text-size-adjust:100%]"
      disabled={locked}
      onDigitsChange={(cleaned) => {
        const key = k(mp.match_id, mp.player_id);
        setScoreOverride((prev) => ({ ...prev, [key]: cleaned }));
      }}
      onBlur={async () => {

        try {
          elimUnlockSpeechOnce();
          elimSpeak(" ");
        } catch (e) {
          console.log("DEBUG: testspeech failed", e);
        }

        setScoreFocusKey(null);
        const key = k(mp.match_id, mp.player_id);
        const raw = (
          scoreOverride[key] ??
          (mp.score == null ? "" : String(mp.score))
        ).trim();

        if (raw === "") {
          await setScore(mp.match_id, mp.player_id, null);
          return;
        }

        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          alert("Ungültige Punkte");
          return;
        }

        await setScore(mp.match_id, mp.player_id, n);

        // ✅ wenn jetzt alle Scores da sind: Plätze automatisch setzen
        if (isEliminationFormat) {
          const expected = getExpectedPlayersForEliminationRound(Number(r?.number ?? 0));

          const latestMps =
            (matchPlayers ?? []).filter((x: any) => String(x?.match_id) === String(m?.id));

          const currentCount = (latestMps ?? []).filter((x: any) => x?.player_id).length;

          if (expected && currentCount === expected) {
            await autoAssignPositionsByScore(m.id, latestMps);
          }
        } else {
          await autoAssignPositionsByScore(m.id, mps);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />

    {savingScore[k(mp.match_id, mp.player_id)] ? (
      <span className="text-[10px] sm:text-xs text-neutral-500">
        speichere…
      </span>
    ) : null}
  </>
)}



                       










                      </div>


 {/* ✅ Elimination QoL: "Cutoff + 1" Button (schnelles Weiterkommen) */}
                        {isEliminationFormat &&
                        typeof lowestScoreInRound === "number" &&
                        Number.isFinite(lowestScoreInRound) &&
                        (() => {
                          const cutoff = lowestScoreInRound as number;
                          const my = getScore(mp);
                          return my == null;
                        })() ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-5 px-1 text-[10px] bg-green-200 sm:text-xs bg-green-200"
                            disabled={locked}
                            title="Trägt automatisch Cutoff + 1 ein"
                            onClick={async () => {
                              // 🔎 DEBUG iOS Speech: muss DIREKT im Click hörbar sein
try {
  elimUnlockSpeechOnce();
  elimSpeak(" ");
} catch (e) {
  console.log("DEBUG: testspeech failed", e);
}
                              if (locked) return;

                              const cutoff = Number(lowestScoreInRound);
                              if (!Number.isFinite(cutoff)) return;

                              //const target = Math.max(0, Math.floor(cutoff) + 1 + zufallszahl zwischen 1 und 30);
                              const randomOffset = Math.floor(Math.random() * 30) + 1; // 1..30
                              const target = Math.max(0, Math.floor(cutoff) + 1 + randomOffset);

                              const key = k(mp.match_id, mp.player_id);

                              // UI sofort updaten (ohne 7-stellige Zahl tippen)
                              setScoreOverride((prev) => ({
                                ...prev,
                                [key]: String(target),
                              }));

                              setScoreFocusKey(null);

                              // Speichern
                              await setScore(mp.match_id, mp.player_id, target);

                              // Danach: wenn Runde "voll" + alle Scores => Plätze automatisch setzen
                              const expected = getExpectedPlayersForEliminationRound(
                                Number(r?.number ?? 0)
                              );

                              const latestMps = (matchPlayers ?? []).filter(
                                (x: any) =>
                                  String(x?.match_id) === String(m?.id)
                              );

                              const currentCount = (latestMps ?? []).filter(
                                (x: any) => x?.player_id
                              ).length;
                              //alert(`expected=${expected}, currentCount=${currentCount}`);
                              if (expected && currentCount === expected) {
                                const latestMps = (matchPlayers ?? []).filter(
                                  (x: any) => String(x?.match_id) === String(m?.id)
                                );

                                const latestMpsPatched = latestMps.map((x: any) => {
                                  if (String(x?.player_id) === String(mp.player_id)) {
                                    return { ...x, score: target }; // ✅ Button-Score ist garantiert drin
                                  }
                                  return x;
                                });

                                await autoAssignPositionsByScore(m.id, latestMpsPatched);
                              }
                            }}
                          >
                            ✓
                          </Button>
                        ) : null}


                    </div>
                  </div>
                </SortablePlayerRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    );
  })()}
</div>


                                      {/* ================================
                                          OCR pro Match (Foto NICHT speichern)
                                        ================================ */}


                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

        {rounds.length === 0 && (
          <div className="px-4 py-4 text-sm text-neutral-500">
            Noch keine Runden.
          </div>
        )}
      </div>

<TimeplayStopwatchFullscreenOverlay
  open={tpStopwatchOpen}
  onClose={() => setTpStopwatchOpen(false)}
  elapsedMs={tpSwNowElapsedMs()}
  running={tpSwRunning}
  locked={locked}
  onStartStop={tpToggleStartStop}
  onReset={tpResetStopwatch}
  onApply={async () => {
    const tgt = tpStopwatchTarget;
    if (!tgt) return;
    if (tpSwRunning) return;

    const ms = Math.max(0, Math.round(tpSwNowElapsedMs()));
    const key = k(tgt.matchId, tgt.playerId);

    // 1) UI sofort aktualisieren (damit es im Input sofort steht)
    setTimeOverride((prev) => ({
      ...prev,
      [key]: formatTimeFromMs(ms),
    }));

    // 2) Persistieren über deine bestehende API
    await setTime(tgt.matchId, tgt.playerId, ms);

    // 3) schließen
    setTpStopwatchOpen(false);
  }}
/>




    </CardBody>
  </Card>
);

}



export default function AdminHome() {
  const [tab, setTab] = useState<
    "start" | "create" | "archive" | "locations" | "players" | "stats" | "admin"
  >("start");

    // ⭐ NEU: Rolle + Mail des aktuellen Users
  const [userRole, setUserRole] = useState<"admin" | "viewer" | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);


  const [showBottomBar, setShowBottomBar] = useState(true);


// 🎤 Announcer Avatar overlay
const [announcerVisible, setAnnouncerVisible] = useState(false);
const [announcerSpeaking, setAnnouncerSpeaking] = useState(false);

const activeUtterancesRef = useRef(0);
const showTimerRef = useRef<number | null>(null);
const hideTimerRef = useRef<number | null>(null);

const SHOW_DELAY_MS = 1800; // <- HIER deine Schwelle

const clearShowTimer = () => {
  if (showTimerRef.current !== null) {
    clearTimeout(showTimerRef.current);
    showTimerRef.current = null;
  }
};

const clearHideTimer = () => {
  if (hideTimerRef.current !== null) {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }
};

const scheduleShow = () => {
  if (showTimerRef.current !== null) return;

  showTimerRef.current = window.setTimeout(() => {
    showTimerRef.current = null;

    // NUR anzeigen, wenn JETZT noch gesprochen wird
    if (activeUtterancesRef.current > 0) {
      setAnnouncerVisible(true);
      setAnnouncerSpeaking(true);
    }
  }, SHOW_DELAY_MS);
};

const hideAvatar = () => {
  clearShowTimer();
  clearHideTimer();

  setAnnouncerSpeaking(false);

  // wenn er nie sichtbar war → sofort weg
  if (!announcerVisible) {
    setAnnouncerVisible(false);
    return;
  }

  // sonst weich ausblenden
  hideTimerRef.current = window.setTimeout(() => {
    setAnnouncerVisible(false);
  }, 1);
};

// 🔧 Patch speechSynthesis.speak
useEffect(() => {
  if (typeof window === "undefined") return;

  const synth: any = window.speechSynthesis;
  if (!synth || synth.__announcerPatched) return;

  synth.__announcerPatched = true;
  const originalSpeak = synth.speak.bind(synth);

synth.speak = (utter: SpeechSynthesisUtterance) => {
  activeUtterancesRef.current += 1;

  scheduleShow();

// 🐢 Windows Speech etwas langsamer / 🍏 iOS etwas schneller
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isWindows = /Windows/i.test(ua);
const isIOS = /iPad|iPhone|iPod/i.test(ua);

// Standard = 1.0
let rate = 1.0;
if (isWindows) rate = 0.88;  // dein bisheriger Windows-Wert
else if (isIOS) rate = 1.18; // iOS etwas schneller

utter.rate = rate;

  const cleanup = () => {
    activeUtterancesRef.current = Math.max(
      0,
      activeUtterancesRef.current - 1
    );

    if (activeUtterancesRef.current === 0) {
      hideAvatar();
    }
  };

  utter.onend = cleanup;
  utter.onerror = cleanup;

  return originalSpeak(utter);
};


  return () => {
    synth.speak = originalSpeak;
    delete synth.__announcerPatched;
  };
}, [announcerVisible]);

// Stimmen initialisieren (Safari)
useEffect(() => {
  if (typeof window !== "undefined") {
    window.speechSynthesis.getVoices();
  }
}, []);




  useEffect(() => {
  let raf = 0;

  function onScroll() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const scrollY = window.scrollY || 0;
      const vh = window.innerHeight || 0;
      const docH = document.documentElement.scrollHeight || 0;

      // minimal gescrollt -> zeigen
      if (scrollY > 8) {
        setShowBottomBar(true);
        return;
      }

      // nahe Seitenende -> ausblenden
      const nearBottom = scrollY + vh >= docH - 8;
      setShowBottomBar(!nearBottom);
    });
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("scroll", onScroll);
  };
}, []);





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

      // ✅ Activity: Active day + hits (nur 1× pro Tab) – super robust
if (sessionStorage.getItem("activity_bumped") !== "1") {
  // optional: 10s cooldown gegen F5-spam
  const last = Number(sessionStorage.getItem("activity_bumped_at") || "0");
  if (Date.now() - last >= 10_000) {
    // 🔒 Flag SOFORT setzen (blockt StrictMode-Doppelaufrufe zuverlässig)
    sessionStorage.setItem("activity_bumped", "1");
    sessionStorage.setItem("activity_bumped_at", String(Date.now()));

    try {
      await supabase.rpc("bump_daily_activity");
    } catch (e) {
      // Wenn der Call fehlschlägt, Flag wieder entfernen, damit es später nochmal probieren kann
      sessionStorage.removeItem("activity_bumped");
      console.error("activity bump failed", e);
    }
  }
}



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
  const [matchSize, setMatchSize] = useState<2 | 3 | 4>(2); // Standard: 1 vs 1

  const [tournamentFormat, setTournamentFormat] =
    useState<"matchplay" | "timeplay" | "swiss" | "round_robin" | "dyp_round_robin" | "elimination" | "rotation">("matchplay");

  const [templateTournamentId, setTemplateTournamentId] =
    useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [joined, setJoined] = useState<Tournament | null>(null);

  // ✅ Alias: einige ältere UI-Teile referenzieren "data" (Turnier-Objekt).
  const data = joined as any;
  const [archive, setArchive] = useState<Tournament[]>([]);

  const hasOpenTournaments = useMemo(
  () =>
    (archive ?? []).some(
      (t) => (t.status ?? "open") !== "finished" // null/undefined als "open" behandeln
    ),
  [archive]
);

  // ✅ Kategorie-Vorschläge: nur Kategorien, die es wirklich gibt (alle Turniere aus der DB,
  //    Schreibweisen zusammengefasst) – statt nur aus den neuesten 100 Archiv-Einträgen
  const {
    cats: existingCategoryInfos,
    names: existingNameInfos,
    reload: reloadExistingCategories,
  } = useExistingCategories(true);

  // ✏️ Archiv: Name/Kategorie eines beendeten Turniers ändern
  const [editArchiveTournament, setEditArchiveTournament] = useState<{
    code: string;
    name: string;
    category: string;
  } | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);

  const [openLocationId, setOpenLocationId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("pb_code");
    if (saved) setCode(saved);
    loadArchive();
    loadLocations();
  }, []);

  useEffect(() => {
  if (tab === "archive") {
    loadArchive();
  }
}, [tab]);

async function loadArchive() {
  // HARD RESET: alte Liste sofort weg, damit nichts “stale” bleibt
  setArchive([]);

  try {
    const res = await fetch(`/api/tournaments/list?ts=${Date.now()}`, {
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
    reloadExistingCategories(); // Namens-/Kategorie-Vorschläge aktualisieren
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

{/*  Altes Menu
if (joined)
  return (
    <Dashboard
      code={joined.code}
      name={joined.name}
      isAdmin={isAdmin}
    />
  );
  */}
{/* Hier kommt das neue Menu */}
  if (joined)
  return (
    <div className="grid gap-4 grid-cols-1">
      {/* 🔸 Dein Header oben rechts (wie in AdminHome) */}
      <div className="flex items-center justify-end gap-2">
        <ThemeToggle />
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

      {/* 🔸 Card mit deinem Menü-Header */}
      <Card>
        <CardHeader>
          {/*
            📱 Mobile: Tab-Leiste als horizontales Scroll-Menü (große Touch-Targets)
            Desktop: darf weiterhin umbrechen
          */}
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1 md:flex-wrap md:overflow-visible md:whitespace-normal [-webkit-overflow-scrolling:touch]">
            <button
              onClick={() => {
                setJoined(null);
                setTab("start");
              }}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "start"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Start
            </button>

            <span className="hidden md:inline text-neutral-300">|</span>

            {isAdmin && (
              <button
                onClick={() => {
                  setJoined(null);
                  handleClickCreateTab();
                }}
                className={
                  "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                  (tab === "create"
                    ? "bg-black text-white"
                    : "text-neutral-600 hover:bg-neutral-100")
                }
              >
                Turnier Neu anlegen
              </button>
            )}

            {isAdmin && <span className="hidden md:inline text-neutral-300">|</span>}

            <button
              onClick={() => {
                setJoined(null);
                setTab("archive");
              }}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "archive"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Turnier-Archiv
            </button>



            {isAdmin && <span className="hidden md:inline text-neutral-300">|</span>}

            {isAdmin && (
              <button
                onClick={() => {
                  setJoined(null);
                  setTab("locations");
                }}
                className={
                  "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                  (tab === "locations"
                    ? "bg-black text-white"
                    : "text-neutral-600 hover:bg-neutral-100")
                }
              >
                Locations
              </button>
            )}

            <span className="hidden md:inline text-neutral-300">|</span>

            <button
              onClick={() => {
                setJoined(null);
                setTab("players");
              }}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "players"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Spieler
            </button>

            <span className="hidden md:inline text-neutral-300">|</span>

            <button
              onClick={() => {
                setJoined(null);
                setTab("stats");
              }}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "stats"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Statistiken
            </button>

            {isAdmin && (
              <>
                <span className="hidden md:inline text-neutral-300">|</span>
                <button
                  onClick={() => setTab("admin")}
                  className={
                    "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                    (tab === "admin"
                      ? "bg-black text-white"
                      : "text-neutral-600 hover:bg-neutral-100")
                  }
                >
                  Admin
                </button>
              </>
            )}

            {/* 📺 laufendes Turnier → TV-Seite (rechts in der Reiterleiste) */}
            <div className="ml-auto shrink-0 pl-2"><LiveTvButton /></div>
          </div>
        </CardHeader>

        <CardBody>
          {/* ✅ Hier ist jetzt dein Turnier-UI */}
          <Dashboard code={joined.code} name={joined.name} isAdmin={isAdmin} />
        </CardBody>
      </Card>
      {/* 🎤 Avatar overlay while speech is playing */}
      <AnnouncerAvatar visible={announcerVisible} speaking={announcerSpeaking} />
    </div>
  );


  
  


  return (
    <div className="grid gap-4 grid-cols-1">

            {/* 🔸 Neuer Header oben rechts mit Logout */}
<div className="flex items-center justify-end gap-2">
  <ThemeToggle />
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
          {/* 📱 Mobile: horizontale Scroll-Tab-Leiste */}
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1 md:flex-wrap md:overflow-visible md:whitespace-normal [-webkit-overflow-scrolling:touch]">
            <button
              onClick={() => setTab("start")}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "start"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Start
            </button>
            
            <span className="hidden md:inline text-neutral-300">|</span>
         
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
                className={
                  "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                  (tab === "create"
                    ? "bg-black text-white"
                    : "text-neutral-600 hover:bg-neutral-100")
                }
              >
                Turnier Neu anlegen
              </button>
            )}
            {isAdmin && (
              <span className="hidden md:inline text-neutral-300">|</span>
            )}
            
            <button
              onClick={() => setTab("archive")}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "archive"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Turnier-Archiv
            </button>






             {isAdmin && (
            <span className="hidden md:inline text-neutral-300">|</span>
            )}




             {isAdmin && (
            <button
              onClick={() => setTab("locations")}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "locations"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Locations
            </button>
            )}
            <span className="hidden md:inline text-neutral-300">|</span>
            <button
              onClick={() => setTab("players")}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "players"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Spieler
            </button>

            <span className="hidden md:inline text-neutral-300">|</span>
            <button
              onClick={() => setTab("stats")}
              className={
                "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                (tab === "stats"
                  ? "bg-black text-white"
                  : "text-neutral-600 hover:bg-neutral-100")
              }
            >
              Statistiken
            </button>

            {isAdmin && (
              <>
                <span className="hidden md:inline text-neutral-300">|</span>
                <button
                  onClick={() => setTab("admin")}
                  className={
                    "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition " +
                    (tab === "admin"
                      ? "bg-black text-white"
                      : "text-neutral-600 hover:bg-neutral-100")
                  }
                >
                  Admin
                </button>
              </>
            )}

            {/* 📺 laufendes Turnier → TV-Seite (rechts in der Reiterleiste) */}
            <div className="ml-auto shrink-0 pl-2"><LiveTvButton /></div>
          </div>
        </CardHeader>

        <CardBody>
          {tab === "start" ? (
              <div className="space-y-4">

                <div>
                  <div className="text-lg font-semibold">Willkommen 👋</div>
                </div>

                <div
                  className="relative w-full overflow-hidden rounded-xl border bg-neutral-100"
                  style={{ height: 255, minHeight: 255 }}
                >
                  <Image
                    src="/pinballturnier.png"
                    alt="Pinball Turnier"
                    fill
                    unoptimized
                    style={{ objectFit: "cover", objectPosition: "center 15%" }}
                  />
                </div>

                {/* 🏠 Kacheln: läuft gerade · letzter Sieger · höchster Score der Woche */}
                <HomeTiles onOpenTournament={(c) => joinTournament(c)} />

                {/* Programmversion (Git-Kennung + Build-Zeit, siehe next.config.mjs) */}
                <div className="flex justify-end">
                  <VersionBadge />
                </div>
  {/*isAdmin && (

                <div>
                  <div className="text-text-base">Viel Spaß beim Flippern 🥳</div>
                </div>

               
                
                  )*/}
         

              </div>
          ) : tab === "create" ? (
            <CreateTournamentForm
              name={name}
              onNameChange={setName}
              nameSuggestions={
                <CategoryChips
                  cats={existingNameInfos}
                  value={name}
                  onPick={setName}
                  label="Bisherige Namen:"
                />
              }
              category={category}
              onCategoryChange={setCategory}
              categorySuggestions={
                <CategoryChips cats={existingCategoryInfos} value={category} onPick={setCategory} />
              }
              format={tournamentFormat}
              onFormatChange={(v) => {
                setTournamentFormat(v);
                // DYP ist immer 2vs2 => 4 Spieler pro Match
                if (v === "dyp_round_robin") setMatchSize(4);
              }}
              matchSize={matchSize}
              onMatchSizeChange={setMatchSize}
              locationId={locationId}
              onLocationChange={(v) => {
                setLocationId(v);
                if (v) setTemplateTournamentId("");
              }}
              locations={locations}
              busy={busy}
              onCreate={createTournament}
            />
          ) : tab === "archive" ? (
            <div className="space-y-2">
              <div className="text-sm text-neutral-600">
                Letzte Turniere (klicken zum Öffnen):
              </div>
              <div className="overflow-hidden rounded-2xl border bg-white">
                {/* Desktop Header – auf Mobile ausblenden (sonst zu eng) */}
                <div className="hidden sm:grid sm:grid-cols-[repeat(24,minmax(0,1fr))] gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                  <div className="sm:col-[span_5_/_span_5]">Name</div>
                  <div className="sm:col-[span_6_/_span_6]">Kategorie / Serie</div>
                  <div className="sm:col-[span_5_/_span_5]">Format</div>
                  <div className="sm:col-[span_4_/_span_4]">Location</div>
                  <div className="sm:col-[span_2_/_span_2]">Status</div>
                  <div className="sm:col-[span_2_/_span_2]">Erstellt</div>
                </div>
                {archive.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => joinTournament(t.code)}
                    className="grid grid-cols-1 sm:grid-cols-[repeat(24,minmax(0,1fr))] gap-2 px-4 py-3 border-b last:border-b-0 items-start sm:items-center
                              cursor-pointer hover:bg-neutral-50 active:bg-neutral-100 transition"
                  >
                    <div className="sm:col-[span_5_/_span_5] flex min-w-0 items-center gap-2 font-medium">
                      <span className="truncate">{t.name}</span>
                      {t.status === "finished" && isAdmin ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // nicht das Turnier öffnen
                            setEditArchiveTournament({
                              code: t.code,
                              name: t.name ?? "",
                              category: t.category ?? "",
                            });
                          }}
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                          title="Name / Kategorie ändern"
                        >
                          ✏️
                        </button>
                      ) : null}
                      {t.status !== "finished" ? (
                        // 📺 Laufendes Turnier: direkt zum Infobildschirm (neuer Tab), ohne das Turnier zu öffnen
                        <a
                          href={`/s/${encodeURIComponent(t.code)}/tv`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Infobildschirm (TV) in neuem Tab öffnen"
                          aria-label="Infobildschirm (TV) öffnen"
                          className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-sky-400 bg-white px-2.5 py-1 text-xs font-bold text-sky-700 hover:bg-sky-50"
                        >
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
                          </span>
                          📺
                        </a>
                      ) : null}
                    </div>

                    <div className="sm:col-[span_6_/_span_6]">
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

                    <div className="col-span-2 sm:col-[span_5_/_span_5] flex items-center gap-1.5 text-sm text-neutral-400">
                        <span
    className={`inline-flex items-center whitespace-nowrap rounded-full py-1 text-xs font-medium ${formatStyleRound(t.format)}`}
  >
    {formatLabel(t.format)}
  </span>
                      {typeof t.player_count === "number" ? (
                        <span
                          className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600"
                          title={`${t.player_count} Spieler`}
                        >
                          👥 {t.player_count}
                        </span>
                      ) : null}
                    </div>

                    {/* Location statt Code (Code steht im Turnier selbst) */}
                    <div
                      className="sm:col-[span_4_/_span_4] min-w-0 truncate text-sm text-neutral-600"
                      title={`Code: ${t.code}`}
                    >
                      {(() => {
                        const locName = t.location_id
                          ? locations.find((l) => String(l.id) === String(t.location_id))?.name
                          : null;
                        return locName ? (
                          <span>📍 {locName}</span>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        );
                      })()}
                    </div>

                    {/* NEU: Status */}
                    <div className="col-span-1 sm:col-[span_2_/_span_2] text-left text-xs text-neutral-500">

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

                    <div className="col-span-1 sm:col-[span_2_/_span_2] text-left text-xs text-neutral-500">
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

              <EditTournamentMetaDialog
                open={!!editArchiveTournament}
                code={editArchiveTournament?.code ?? ""}
                initialName={editArchiveTournament?.name ?? ""}
                initialCategory={editArchiveTournament?.category ?? ""}
                onClose={() => setEditArchiveTournament(null)}
                onSaved={() => {
                  loadArchive();
                  reloadExistingCategories();
                }}
              />
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
<PlayersTab
    isAdmin={isAdmin}
    joined={joined}
    setJoined={setJoined}
  />
          ) : tab === "stats" ? (
            <LeaderboardsTab isAdmin={isAdmin} />
          ) : tab === "admin" ? (
            <AdminTab />
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


function RefreshBadge({
  refreshing,
  lastUpdatedAt,
}: {
  refreshing: boolean;
  lastUpdatedAt: number | null;
}) {
  const label = refreshing
    ? "🔄 aktualisiert…"
    : "—";

  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-1 text-[11px] text-neutral-600">
      {label}
    </span>
  );
}


function Dashboard({ code, name, isAdmin }: { code: string; name: string; isAdmin: boolean }) {
  // Bottom menu: hidden when idle, shows on scroll, hides again after a short pause.
  const [showBottomBar, setShowBottomBar] = useState(false);
  const bottomBarHideTimerRef = useRef<any>(null);


useEffect(() => {
  // Hidden when idle, shown on interaction (scroll / touch / mouse move),
  // then hides again after a short pause.
  function revealTemporarily() {
    setShowBottomBar(true);
    if (bottomBarHideTimerRef.current) clearTimeout(bottomBarHideTimerRef.current);
    bottomBarHideTimerRef.current = setTimeout(() => {
      setShowBottomBar(false);
    }, 1400);
  }

  // Start hidden (page is "standing")
  setShowBottomBar(false);

  const opts: AddEventListenerOptions = { passive: true };

  window.addEventListener("scroll", revealTemporarily, opts);
  window.addEventListener("wheel", revealTemporarily, opts);
  window.addEventListener("touchstart", revealTemporarily, opts);
  window.addEventListener("touchmove", revealTemporarily, opts);
  window.addEventListener("mousemove", revealTemporarily, opts);
  window.addEventListener("pointermove", revealTemporarily, opts);

  // keyboard navigation should also reveal it
  window.addEventListener("keydown", revealTemporarily);

  return () => {
    window.removeEventListener("scroll", revealTemporarily);
    window.removeEventListener("wheel", revealTemporarily);
    window.removeEventListener("touchstart", revealTemporarily);
    window.removeEventListener("touchmove", revealTemporarily);
    window.removeEventListener("mousemove", revealTemporarily);
    window.removeEventListener("pointermove", revealTemporarily);
    window.removeEventListener("keydown", revealTemporarily);

    if (bottomBarHideTimerRef.current) clearTimeout(bottomBarHideTimerRef.current);
  };
}, []);

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
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [machineName, setMachineName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // --- Turnier-Highscore-Boards (unten im Turnier) ---
  const [playerHighscores, setPlayerHighscores] = useState<any[]>([]);
  const [machineHighscores, setMachineHighscores] = useState<any[]>([]);
  const [hsLoading, setHsLoading] = useState(false);
  // --- Kategorie Turnierleaderboard (übergreifend) ---
  const [categoryTournamentRows, setCategoryTournamentRows] = useState<any[]>([]);
  const [categoryTournamentLoading, setCategoryTournamentLoading] = useState(false);

  // Competition-Platzierung (1,1,1,4 …) für die Turnierpunkte-Tabelle unten
  // (categoryTournamentRows wird bereits absteigend nach tournamentPoints geladen)
  const categoryTournamentPlaces = useMemo(
    () => computeCompetitionPlaces(categoryTournamentRows, (r: any) => Number(r?.tournamentPoints ?? 0)),
    [categoryTournamentRows]
  );

  // Gleiche Tabelle, aber über alle beendeten Turniere mit exakt gleichem Namen
  const [nameTournamentRows, setNameTournamentRows] = useState<any[]>([]);
  const nameTournamentPlaces = useMemo(
    () => computeCompetitionPlaces(nameTournamentRows, (r: any) => Number(r?.tournamentPoints ?? 0)),
    [nameTournamentRows]
  );
  // Reiter: "category" = Serie, "name" = gleicher Turniername (gemerkt im Browser)
  const [tpTab, setTpTab] = useState<"category" | "name">("category");
  useEffect(() => {
    try {
      if (localStorage.getItem("pb_tpTab") === "name") setTpTab("name");
    } catch {
      /* ignore */
    }
  }, []);
  function chooseTpTab(v: "category" | "name") {
    setTpTab(v);
    try {
      localStorage.setItem("pb_tpTab", v);
    } catch {
      /* ignore */
    }
  }

  const [hsRefreshing, setHsRefreshing] = useState(false);
  const [catRefreshing, setCatRefreshing] = useState(false);
  const [lastHsUpdatedAt, setLastHsUpdatedAt] = useState<number | null>(null);
  const [lastCatUpdatedAt, setLastCatUpdatedAt] = useState<number | null>(null);

  const tournamentLeaderboardRef = useRef<HTMLDivElement | null>(null);

    // 🎬 Auto-Screen-Saver (Scroll)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);

  const [autoScrollCountdown, setAutoScrollCountdown] = useState<number>(15);
  const autoScrollCountdownRef = useRef<NodeJS.Timeout | null>(null);


  const autoScrollIndexRef = useRef(0);
  const autoScrollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Anker für "Highlights" (Turnierpunkte + Highscores)
  const highlightsRef = useRef<HTMLDivElement | null>(null);

  function scrollToTournamentLeaderboard() {
  const el = tournamentLeaderboardRef.current;
  if (!el) return;

  const SAFE_TOP_OFFSET = 0; //für das Leaderboard Scrollen

  const scrollParent = getScrollParent(el);
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const y = (elRect.top - parentRect.top) + scrollParent.scrollTop;

    scrollParent.scrollTo({
      top: Math.max(0, y - SAFE_TOP_OFFSET),
      behavior: "smooth",
    });
    return;
  }

  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: Math.max(0, y - SAFE_TOP_OFFSET),
    behavior: "smooth",
  });
}

const tournamentPointsRef = useRef<HTMLDivElement | null>(null);

function scrollToTournamentPoints() {
  const el = tournamentPointsRef.current;
  if (!el) return;

  const SAFE_TOP_OFFSET = 0; // wenn du willst: z.B. 60 bei sticky header

  const scrollParent = getScrollParent(el);
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const y = (elRect.top - parentRect.top) + scrollParent.scrollTop;

    scrollParent.scrollTo({
      top: Math.max(0, y - SAFE_TOP_OFFSET),
      behavior: "smooth",
    });
    return;
  }

  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: Math.max(0, y - SAFE_TOP_OFFSET),
    behavior: "smooth",
  });
}




  // ✅ Scroll-Anker für "Runden & Matches".
// Hintergrund: Es gibt (mindestens) zwei "Runde erzeugen"-Buttons. Egal welcher
// gedrückt wird, sollen wir nach dem Erzeugen der Runde automatisch zur Match-Liste scrollen.
//
// Wichtig: Wir scrollen NICHT sofort im onClick, sondern erst NACH reloadAll(),
// damit die neuen Matches schon gerendert sind.
const matchesSectionRef = useRef<HTMLDivElement | null>(null);
const [scrollToMatchesNext, setScrollToMatchesNext] = useState(false);

function scrollToMatchesSection() {
  const el = matchesSectionRef.current;
  if (!el) return;

  const SAFE_TOP_OFFSET = 0; // kannst du weiter tunen // wird nicht verwendet

  const scrollParent = getScrollParent(el);
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    // Position des Elements relativ zum Scroll-Container:
    const y = (elRect.top - parentRect.top) + scrollParent.scrollTop;

    scrollParent.scrollTo({
      top: Math.max(0, y - SAFE_TOP_OFFSET),
      behavior: "smooth",
    });
    return;
  }

  // Fallback: Window scroll
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: Math.max(0, y - SAFE_TOP_OFFSET),
    behavior: "smooth",
  });
}

const [scrollTargetRoundId, setScrollTargetRoundId] = useState<string | null>(null);


function scrollToRound(roundId: string) {
  const el = document.getElementById(`round-${roundId}`);
  if (!el) return;

  const SAFE_TOP_OFFSET = 0; // bewusst etwas größer, damit der Runden-Header sichtbar bleibt // Runden Scroll

  const scrollParent = getScrollParent(el);

  // 🔹 Scroll innerhalb eines Containers (falls vorhanden)
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    const y =
      (elRect.top - parentRect.top) + scrollParent.scrollTop;

    scrollParent.scrollTo({
      top: Math.max(0, y - SAFE_TOP_OFFSET),
      behavior: "smooth",
    });
    return;
  }

  // 🔹 Fallback: Window scroll
  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: Math.max(0, y - SAFE_TOP_OFFSET),
    behavior: "smooth",
  });
}

function getActiveRoundId(): string | null {
  if (!rounds || rounds.length === 0) return null;

  // "aktive Runde" = status === "open" (bei dir steht in der UI "Aktiv")
  const active = rounds.find((r: any) => r.status === "open");
  if (active?.id) return active.id;

  // Fallback: neueste Runde nach Nummer
  const sorted = rounds.slice().sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0));
  return sorted[sorted.length - 1]?.id ?? null;
}

function jumpToActiveRound() {
  const id = getActiveRoundId();
  if (!id) return;
  scrollToRound(id);
}


function scrollToHighlights() {
  const el = highlightsRef.current;
  if (!el) return;

  const SAFE_TOP_OFFSET = 0; // bei Bedarf z.B. 60

  const scrollParent = getScrollParent(el);
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const y =
      elRect.top - parentRect.top + scrollParent.scrollTop;

    scrollParent.scrollTo({
      top: Math.max(0, y - SAFE_TOP_OFFSET),
      behavior: "smooth",
    });
    return;
  }

  const y = el.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: Math.max(0, y - SAFE_TOP_OFFSET),
    behavior: "smooth",
  });
}



function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;

  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const style = window.getComputedStyle(p);
    const overflowY = style.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return p;
    p = p.parentElement;
  }
  return null;
}



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

  // 🔊 Sprachausgabe pro Runde (DB-Flag)
const [speechRoundEnabledUi, setSpeechRoundEnabledUi] = useState<boolean>(false);

useEffect(() => {
  if (data?.tournament?.speech_round_enabled != null) {
    setSpeechRoundEnabledUi(Boolean(data.tournament.speech_round_enabled));
  }
}, [data?.tournament?.speech_round_enabled]);

async function setSpeechRoundEnabled(next: boolean) {
  if (!isAdmin) return; // Zuschauer nicht
  setSpeechRoundEnabledUi(next);

  const res = await fetch("/api/tournaments/set-speech-round", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ code, enabled: next, _ts: Date.now() }),
  });

  if (!res.ok) {
    // Fehler -> UI zurückrollen
    setSpeechRoundEnabledUi(!next);
    alert("Konnte die Einstellung 'Sprachausgabe pro Runde' nicht speichern.");
  } else {
    // Optional: damit load() sofort den neuen DB-Wert spiegelt
    await reloadAll();
  }
}


  // Merkt sich, wie viele fertige Runden wir bereits für Elo berücksichtigt haben
  const finishedRoundsSeenRef = useRef<number | null>(null);

  const [tournamentChampion, setTournamentChampion] = useState<string | null>(
    null
  );
  const [superFinalChampion, setSuperFinalChampion] = useState<string | null>(
    null
  );

  const [startOrderMode, setStartOrderMode] = useState<
    "random" | "standings_asc" | "last_round_asc"
  >("random");

  const [finalState, setFinalState] = useState<any | null>(null);

  const superFinalRunning = !!(finalState && finalState.status !== "finished");

  const [useElo, setUseElo] = useState(true);
  // ✏️ Name/Kategorie eines beendeten Turniers ändern (Dialog)
  const [editMetaOpen, setEditMetaOpen] = useState(false);

  // ✅ Elo-Schalter gilt für das GANZE Turnier:
  // Zustand aus den Runden übernehmen (sonst springt er beim Neuladen fälschlich auf "an").
  // Gibt es noch keine Runden, bleibt die lokale Einstellung (gilt dann für neue Runden).
  useEffect(() => {
    const rs = (data?.rounds ?? []) as any[];
    if (rs.length === 0) return;
    setUseElo(rs.some((r) => r?.elo_enabled !== false));
  }, [data?.rounds]);

  // An/Aus für alle Runden setzen. Die automatische Elo-Neuberechnung
  // (siehe eloBasis) bemerkt die Änderung und rechnet neu bzw. setzt bei "aus"
  // alle Spieler auf ihren Elo-Stand vor dem Turnier zurück.
  async function toggleTournamentElo() {
    if (busy || locked) return;
    const next = !useElo;
    setUseElo(next);

    const rs = ((data?.rounds ?? []) as any[]).filter(
      (r) => (r?.elo_enabled !== false) !== next
    );
    if (rs.length === 0) return;

    setBusy(true);
    try {
      for (const r of rs) {
        const res = await fetch("/api/rounds/set-elo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId: r.id, eloEnabled: next }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ?? "Elo-Schalter konnte nicht gespeichert werden");
        }
      }
    } catch (e: any) {
      alert(e?.message ?? "Elo-Schalter konnte nicht gespeichert werden");
    } finally {
      setBusy(false);
      await reloadAll();
    }
  }





  const prevRatingsRef = useRef<Record<string, number>>({});
  const expectEloUpdateRef = useRef(false);
  const [eloDeltas, setEloDeltas] = useState<Record<string, number>>({});
  // ✅ Baseline (Elo zu Beginn der aktuellen Runde) – für Zuschauer & Admin
  const [roundBaseline, setRoundBaseline] = useState<Record<string, number>>({});

  const [eloShieldedByProfile, setEloShieldedByProfile] = useState<Record<string, boolean>>({});

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

  // ✅ DYP Round Robin: Startreihenfolge soll immer zufällig sein (UI sperren)
  const isDypRR = data?.tournament?.format === "dyp_round_robin";

  // ✅ Elimination: mehrere parallele Runden dürfen gleichzeitig offen sein
  const isEliminationFormat = data?.tournament?.format === "elimination";

  // ✅ "Letzte Runde (schlechtester zuerst)" ist nur sinnvoll,
  // wenn die neue Runde genau 1 Match erzeugt.
  const activePlayersCount = (data?.players ?? []).filter((p: any) => p?.active !== false).length;

  // WICHTIG: falls dein Feld anders heißt (z.B. players_per_match),
  // hier anpassen. Default: 4
const tFormat = String((data as any)?.tournament?.format ?? "");
const rawMatchSize = Number((data as any)?.tournament?.match_size ?? 4);

const matchSize =
  tFormat === "rotation"
    ? Math.max(2, rawMatchSize) // ✅ Rotation: nicht mehr auf 4 klemmen
    : Math.max(2, Math.min(4, rawMatchSize)); // ✅ alle anderen bleiben wie vorher


  const matchesPerRound = Math.ceil(activePlayersCount / matchSize);
  const canUseLastRoundOrder = matchesPerRound === 1;

  useEffect(() => {
    if (startOrderMode === "last_round_asc" && !canUseLastRoundOrder) {
      setStartOrderMode("random");
    }
  }, [startOrderMode, canUseLastRoundOrder]);

  useEffect(() => {
  if (isDypRR && startOrderMode !== "random") {
    setStartOrderMode("random");
  }
  }, [isDypRR, startOrderMode]);



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

  // ✅ Turnierende: statt Overlay + Ton am Admin-PC wird der Infobildschirm geöffnet.
  //    Siegerehrung + Trommelwirbel/Fanfare laufen dort (am TV, wo alle hinschauen).
  //    true = altes Verhalten (Overlay + Ton hier im Admin) wieder einschalten.
  const ADMIN_FINISH_CELEBRATION = false;

  // Fenster MUSS direkt im Klick geöffnet werden (sonst blockiert der Pop-up-Blocker).
  // Erst leer öffnen, nach erfolgreichem Speichern auf den Infobildschirm leiten.
  function openTvWindowNow(): Window | null {
    if (ADMIN_FINISH_CELEBRATION) return null;
    try {
      return window.open("about:blank", "_blank");
    } catch {
      return null;
    }
  }
  function showTvInWindow(w: Window | null) {
    if (ADMIN_FINISH_CELEBRATION) return;
    const url = `/s/${encodeURIComponent(code)}/tv`;
    try {
      if (w && !w.closed) w.location.href = url;
      else window.open(url, "_blank");
    } catch {
      /* ignore */
    }
  }
  function closeTvWindow(w: Window | null) {
    try {
      if (w && !w.closed) w.close();
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

    // Beendet dieser Sieg das Superfinale? Dann Infobildschirm-Fenster schon jetzt (im Klick) öffnen.
    const target = Number(finalState?.target_points ?? 0);
    const cur = (finalState?.players ?? []).find((x: any) => x?.playerId === p.playerId);
    const willFinish = target > 0 && Number(cur?.points ?? 0) + 1 >= target;
    const tvWin = willFinish ? openTvWindowNow() : null;

    registerFinalWin(p.playerId, p.name, tvWin);
  }

  async function finishTournament() {
    if (!confirm("Turnier wirklich beenden? Danach ist nichts mehr änderbar."))
      return;

    const tvWin = openTvWindowNow();
    if (ADMIN_FINISH_CELEBRATION) playWinnerSounds();

    const res = await fetch("/api/tournaments/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      closeTvWindow(tvWin);
      alert(j?.error ?? "Fehler beim Beenden");
      return;
    }

    showTvInWindow(tvWin);
    await reloadAll();
    {/* await loadArchive(); neue hinzugefügt */}
    await loadChampions();
    if (ADMIN_FINISH_CELEBRATION) setShowCelebration(true);
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


async function waitForRoundDom(roundId: string, { mustBeOpen }: { mustBeOpen: boolean }) {
  const selector = `#round-${roundId}`;
  const timeoutMs = 12000; // reicht locker, aber nicht unendlich Zeit bis gescrollt wird overlay Runde wird erstellt
  const start = performance.now();

  return new Promise<void>((resolve) => {
    const tick = () => {
      const el = document.querySelector(selector) as HTMLElement | null;

      // Element existiert + hat Layout (>= 1px Höhe)
      const exists = !!el && el.getBoundingClientRect().height > 0;

      // optional: muss geöffnet sein
      const openOk = !mustBeOpen || el?.dataset.open === "true";

      if (exists && openOk) {
        resolve();
        return;
      }

      if (performance.now() - start > timeoutMs) {
        // Timeout: wir geben trotzdem frei (sonst hängt es)
        resolve();
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}




async function registerFinalWin(playerId: string, winnerName: string, tvWin: Window | null = null) {
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
    closeTvWindow(tvWin);
    setNotice(j.error ?? "Final-Spiel konnte nicht gespeichert werden");
    return;
  }

  // Finale fertig -> Infobildschirm (Superfinale-Podest + Ton dort), KEIN kleines Elo-Overlay
  if (j.finished) {
    if (ADMIN_FINISH_CELEBRATION) playWinnerSounds();

    try {
      await fetch("/api/tournaments/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
    } catch {
      // Ignorieren, Feier trotzdem zeigen
    }

    showTvInWindow(tvWin);
    await reloadAll();
    {/* await loadArchive(); neue hinzugefügt */}
    await loadChampions();
    if (ADMIN_FINISH_CELEBRATION) setShowCelebration(true);
    return;
  }

  // Finale läuft doch weiter (Vorhersage lag daneben) -> vorsorglich geöffnetes Fenster schließen
  closeTvWindow(tvWin);

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

    {/* await reloadAll(); */}
    localStorage.removeItem("pb_code");
    location.href = "/t";
  }

  // ✅ Elo automatisch neu berechnen, sobald sich die Elo-Grundlage ändert:
  //    - eine Runde wird "finished"
  //    - Platzierung in einer fertigen Runde wird nachträglich korrigiert
  //    - Elo-Schalter einer fertigen Runde wird umgestellt
  // Dazu merken wir uns die Platzierungen aller fertigen Runden und vergleichen.
  // Vorläufige Punkte / Scores in laufenden Runden lösen nichts aus.
  const eloBasisRef = useRef<string | null>(null);
  const eloRecalcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eloBasis = useMemo(() => {
    const finishedRounds = (rounds ?? []).filter((r: any) => r.status === "finished");
    if (finishedRounds.length === 0) return "";
    const finishedRoundIds = new Set(finishedRounds.map((r: any) => String(r.id)));
    const matchRound: Record<string, string> = {};
    for (const m of matches ?? []) {
      if (finishedRoundIds.has(String((m as any).round_id))) matchRound[String(m.id)] = String((m as any).round_id);
    }
    const parts: string[] = finishedRounds.map(
      (r: any) => `R${r.id}:${r.elo_enabled === false ? 0 : 1}`
    );
    for (const mp of matchPlayers ?? []) {
      const rid = matchRound[String((mp as any).match_id)];
      if (!rid) continue;
      parts.push(`${(mp as any).match_id}/${(mp as any).player_id}=${(mp as any).position ?? "-"}`);
    }
    return parts.sort().join("|");
  }, [rounds, matches, matchPlayers]);

  useEffect(() => {
    if (!data || locked) return;

    // Erstes Laden: nur den aktuellen Stand merken, noch nichts tun
    if (eloBasisRef.current === null) {
      eloBasisRef.current = eloBasis;
      return;
    }
    if (eloBasis === eloBasisRef.current) return;
    eloBasisRef.current = eloBasis;
    if (!eloBasis) return; // keine fertigen Runden -> nichts zu rechnen

    // Kurz warten, bis alle Plätze gespeichert sind -> dann EINMAL rechnen
    if (eloRecalcTimerRef.current) clearTimeout(eloRecalcTimerRef.current);
    eloRecalcTimerRef.current = setTimeout(() => {
      eloRecalcTimerRef.current = null;
      recalcElo();
    }, 2000);
  }, [eloBasis, data, locked]);

  useEffect(() => {
    return () => {
      if (eloRecalcTimerRef.current) clearTimeout(eloRecalcTimerRef.current);
    };
  }, []);


useEffect(() => {
  if (!code) return;

  let cancelled = false;

async function tick() {
  if (cancelled) return;

  // ✅ HIER EINSETZEN – Snapshot für Elo-Δ (auch für Zuschauer)
  if (profiles?.length) {
    prevRatingsRef.current = Object.fromEntries(
      profiles.map((p: any) => [
        p.id,
        typeof p.rating === "number" ? p.rating : 0,
      ])
    );
    expectEloUpdateRef.current = true;
  }

  try {
    const next = await reload();

    // ⚠️ KEIN Elo-Delta-Tracking hier (das passiert über den Snapshot oben)
  await Promise.all([
    loadProfiles(),
    reloadFinal(),
    loadTournamentHighscores(true), // ✅ silent
    loadCategoryTournamentLeaderboard(next?.tournament?.category, true, next?.tournament?.name), // ✅ silent
  ]);
  } catch (e) {
    // optional
  }
}



  // sofort laden
  tick();

  // alle 16 Sekunden für Besucher & Admin
  const t = window.setInterval(tick, 16000);

  return () => {
    cancelled = true;
    clearInterval(t);
  };
}, [code]);

useEffect(() => {
  const STEP_SECONDS = 15;

  const clearTimers = () => {
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    if (autoScrollCountdownRef.current) {
      clearInterval(autoScrollCountdownRef.current);
      autoScrollCountdownRef.current = null;
    }
  };

  // immer erst aufräumen (wichtig bei schnellem an/aus klicken)
  clearTimers();

  if (!autoScrollEnabled) {
    setAutoScrollCountdown(STEP_SECONDS);
    return;
  }

  const steps = [
    () => jumpToActiveRound(),
    () => scrollToTournamentLeaderboard(),
    () => scrollToTournamentPoints(),
  ];

  // sofort einmal springen + countdown reset
  steps[autoScrollIndexRef.current % steps.length]();
  autoScrollIndexRef.current++;
  setAutoScrollCountdown(STEP_SECONDS);

  // alle 15s: nächster scroll + countdown reset
  autoScrollTimerRef.current = setInterval(() => {
    steps[autoScrollIndexRef.current % steps.length]();
    autoScrollIndexRef.current++;
    setAutoScrollCountdown(STEP_SECONDS);
  }, STEP_SECONDS * 1000);

  // jede Sekunde runterzählen
  autoScrollCountdownRef.current = setInterval(() => {
    setAutoScrollCountdown((s) => {
      const next = s - 1;
      return next <= 1 ? 1 : next;
    });
  }, 4000);

  return () => {
    clearTimers();
  };
}, [autoScrollEnabled]);




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
  if (!scrollToMatchesNext) return;
  if (!data) return;
  if (!rounds || rounds.length === 0) return;

  const run = async () => {
    // 1) Zielrunde bestimmen: aktive, sonst neueste
    const active = rounds.find((r: any) => r.status === "open");
    const sorted = rounds.slice().sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0));
    const newest = sorted[sorted.length - 1];
    const targetId = (active?.id ?? newest?.id) as string | undefined;
    if (!targetId) {
      setScrollToMatchesNext(false);
      return;
    }

    // 2) Runde öffnen, damit Header+Matches wirklich gerendert sind
    //setOpenRoundId(targetId);

    // 3) Warten bis DOM da ist (und geöffnet ist)
    await waitForRoundDom(targetId, { mustBeOpen: true });

    // 4) Jetzt scrollen
    scrollToRound(targetId);
    setTimeout(() => scrollToRound(targetId), 200);

    setScrollToMatchesNext(false);
  };

  run();
}, [scrollToMatchesNext, data, rounds.length, matches.length]);


// ✅ Baseline pro Runde setzen/laden (damit Besucher auch Elo-Δ sehen)
useEffect(() => {
  if (!code) return;

  const roundNo = data?.tournament?.current_round;
  if (!roundNo) return;
  if (!profiles || profiles.length === 0) return;

  const key = `pb_eloBaseline:${code}:round:${roundNo}`;

  // 1) existiert schon? -> laden
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        setRoundBaseline(parsed);
        return;
      }
    } catch {
      // kaputt -> neu setzen
    }
  }

// 2) Keine Baseline vorhanden:
// Für Zuschauer NICHT baseline=aktueller Stand setzen (sonst diff immer 0)
setRoundBaseline({});
return;
}, [code, data?.tournament?.current_round, profiles]);


useEffect(() => {
  if (!profiles || profiles.length === 0) {
    setEloDeltas({});
    expectEloUpdateRef.current = false;
    return;
  }

  // ✅ 1) Standardfall für ALLE (Zuschauer + Admin): Δ seit Rundenstart via Baseline
  if (roundBaseline && Object.keys(roundBaseline).length > 0) {
    const deltas: Record<string, number> = {};
    for (const p of profiles) {
      const before = roundBaseline[p.id];
      if (typeof before === "number" && typeof p.rating === "number") {
        const diff = p.rating - before;
        if (diff !== 0) deltas[p.id] = diff;
      }
    }
    setEloDeltas(deltas);
    // egal ob expect true/false – wir sind “up to date”
    expectEloUpdateRef.current = false;
    return;
  }

  // ✅ 2) Fallback: alte Admin-Logik (wenn aus irgendeinem Grund keine Baseline da ist)
  if (!expectEloUpdateRef.current) return;

  const prev = prevRatingsRef.current;
  if (!prev || Object.keys(prev).length === 0) {
    expectEloUpdateRef.current = false;
    return;
  }
  // ✅ Fallback: Δ seit letzter Runde (Admin-Logik, wenn keine Baseline existiert)
  const deltas: Record<string, number> = {};
  for (const p of profiles) {
    const before = prev[p.id];
    if (typeof before === "number" && typeof p.rating === "number") {
      const diff = p.rating - before;
      if (diff !== 0) deltas[p.id] = diff;
    }
  }

  setEloDeltas(deltas);
  expectEloUpdateRef.current = false;
}, [profiles, roundBaseline]);




  

 
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
  const res = await fetch(`/api/tournaments/load?t=${Date.now()}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ code, _ts: Date.now() }),
  });

  const j = await res.json();
  const next = j.data ?? j;

  setData(next);
  return next;
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

async function loadTournamentHighscores(silent: boolean = false) {
  if (!code) return;

  if (!silent) {
    setPlayerHighscores([]);
    setMachineHighscores([]);
    setHsLoading(true);
  } else {
    setHsRefreshing(true);
  }

  try {
    const res = await fetch(`/api/tournaments/highscores?_ts=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const json = await res.json().catch(() => ({}));
    setPlayerHighscores(json.playerHighscores ?? []);
    setMachineHighscores(json.machineHighscores ?? []);

    setLastHsUpdatedAt(Date.now());
  } finally {
    if (!silent) setHsLoading(false);
    else setHsRefreshing(false);
  }
}



async function loadCategoryTournamentLeaderboard(
  category: string | undefined | null,
  silent: boolean = false,
  tournamentName?: string | null
) {
  const cat = (category ?? "").trim();
  const tName = (tournamentName ?? "").trim();
  if (!cat && !tName) return;

  if (!silent) {
    setCategoryTournamentRows([]);
    setNameTournamentRows([]);
    setCategoryTournamentLoading(true);
  } else {
    setCatRefreshing(true);
  }

  // exact=1 → nur exakt gleiche Kategorie bzw. exakt gleicher Turniername (Groß/Klein egal)
  const fetchRows = async (param: "category" | "search", value: string) => {
    if (!value) return [];
    const res = await fetch(
      `/api/leaderboards/tournaments?${param}=${encodeURIComponent(value)}&exact=1&_ts=${Date.now()}`,
      { cache: "no-store" }
    );
    const json = await res.json().catch(() => ({}));
    return json.rows ?? [];
  };

  try {
    const [catRows, nameRows] = await Promise.all([fetchRows("category", cat), fetchRows("search", tName)]);
    setCategoryTournamentRows(catRows);
    setNameTournamentRows(nameRows);

    setLastCatUpdatedAt(Date.now());
  } finally {
    if (!silent) setCategoryTournamentLoading(false);
    else setCatRefreshing(false);
  }
}





async function reloadAll() {
  // Snapshot nur, wenn wir schon Profiles haben
  if (profiles?.length) {
    prevRatingsRef.current = Object.fromEntries(
      profiles.map((p: any) => [p.id, typeof p.rating === "number" ? p.rating : 0])
    );
    expectEloUpdateRef.current = true;
  }

  const next = await reload();

  await Promise.all([
    loadProfiles(),
    reloadFinal(),
    loadTournamentHighscores(false),
    loadCategoryTournamentLeaderboard(next?.tournament?.category, false, next?.tournament?.name),
  ]);

  return next;
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
    if (!selectedProfileIds.length) return;
    setBusy(true);
    setNotice(null);
    // Mehrfachauswahl: nacheinander hinzufügen (Reihenfolge = Reihenfolge der Auswahl)
    const errors: string[] = [];
    for (const profileId of selectedProfileIds) {
      try {
        const res = await fetch("/api/players/addFromProfile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, profileId }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          const pname = profiles.find((p) => p.id === profileId)?.name ?? "Spieler";
          errors.push(`${pname}: ${j.error ?? "Fehler"}`);
        }
      } catch (e: any) {
        const pname = profiles.find((p) => p.id === profileId)?.name ?? "Spieler";
        errors.push(`${pname}: ${e?.message ?? "Fehler"}`);
      }
    }
    setBusy(false);
    setSelectedProfileIds([]);
    if (errors.length) setNotice(errors.join(" · "));
    await reloadAll();
  }

  // Profile, die schon im Turnier sind (in der Auswahl grau + "schon dabei")
  const profileIdsInTournament = useMemo(
    () => new Set<string>((data?.players ?? []).map((p: any) => p?.profile_id).filter(Boolean)),
    [data?.players]
  );

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
    //alert(`recalcElo in page`);

    //alert(`code=${code}`);
     
    // Stand VOR der Neuberechnung merken
    // ✅ sicherstellen, dass profiles (Ratings) wirklich da sind
    if (!profiles || profiles.length === 0) {
      await loadProfiles();
    }
    const prev: Record<string, number> = {};
    for (const p of profiles) {
      if (typeof p.rating === "number") {
        prev[p.id] = p.rating;
      }
    }
    prevRatingsRef.current = prev;
    expectEloUpdateRef.current = true;

     //alert(`prev${prev}`);

    setBusy(true);

   

    setNotice(null);
//alert(`code=${code}`);






    const res = await fetch("/api/tournaments/recalc-elo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });










    const j = await res.json().catch(() => ({}));
    setBusy(false);

  
     //alert(`expected=${j.shieldedByProfile}`);
    

    setEloShieldedByProfile(j.shieldedByProfile ?? {});
    console.log("shieldedByProfile payload:", j.shieldedByProfile);

 //alert(`res.ok=${res.ok}`);

    if (!res.ok) {
      setEloShieldedByProfile({});
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

  const hasActiveRound = useMemo(() => {
  return (rounds ?? []).some((r: any) => r.status === "open");
}, [rounds]);

  const isRotationFormat = String(data?.tournament?.format ?? "") === "rotation";

  const isTimeplayFormat = String(data?.tournament?.format ?? "") === "timeplay";

  // ✅ Timeplay: Welche Task-Schwierigkeiten sind für diese Runde erlaubt?
  const [taskDifficulties, setTaskDifficulties] = useState<string[]>([
    "easy",
    "medium",
    "hard",
  ]);


  // ✅ Timeplay: Preview der "eligible" Maschinen für die aktuell gewählten Task-Schwierigkeiten
// Idee: Backend kann das bereits (previewOnly in /api/rounds/create).
// Wir nutzen das hier, um unten in der Maschinenliste alles "auszugrauen", was keine passenden Tasks hat.
const [eligibleMachineIds, setEligibleMachineIds] = useState<string[] | null>(null);
const [eligibleMachinesLoading, setEligibleMachinesLoading] = useState(false);

useEffect(() => {
  // Nur relevant für Timeplay
  if (!isTimeplayFormat) {
    setEligibleMachineIds(null);
    return;
  }

  // Wenn der User ALLE Difficulties abwählt, ist per Definition nichts eligible.
  if (!taskDifficulties || taskDifficulties.length === 0) {
    setEligibleMachineIds([]);
    return;
  }

  let cancelled = false;

  async function fetchEligibleMachines() {
    try {
      setEligibleMachinesLoading(true);

      // Cache-Busting + no-store (damit nix "alt" cached)
      const ts = Date.now();
      const res = await fetch(`/api/rounds/create?ts=${ts}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          code,
          previewOnly: true,
          format: "timeplay",
          taskDifficulties,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (cancelled) return;

      if (!res.ok) {
        console.warn("Preview eligible machines failed:", j?.error ?? j);
        setEligibleMachineIds([]);
        return;
      }

      const ids = Array.isArray(j?.eligibleMachineIds) ? j.eligibleMachineIds : [];
      setEligibleMachineIds(ids.map((x: any) => String(x)));
    } catch (e) {
      if (cancelled) return;
      console.warn("Preview eligible machines network error:", e);
      setEligibleMachineIds([]);
    } finally {
      if (!cancelled) setEligibleMachinesLoading(false);
    }
  }

  fetchEligibleMachines();

  return () => {
    cancelled = true;
  };
}, [isTimeplayFormat, code, JSON.stringify(taskDifficulties)]);


  // ================================
  // Rotation Global Timer (ONE timer for the whole tournament)
  // - shared across all rounds/matches
  // - purely local UI helper (not persisted)
  // ================================
  type RotTimer = {
    endAt: number | null;          // running: absolute timestamp
    remainingMs: number | null;    // paused: remaining time
    durationSec: number;           // last chosen duration (for reset UX)
  };
  const [rotTimer, setRotTimer] = useState<RotTimer>({
    endAt: null,
    remainingMs: null,
    durationSec: 600,
  });
  const [_rotTimerTick, setRotTimerTick] = useState(0);

  // Rotation Timer "Fullscreen" Anzeige (Overlay via Portal)
const [rotTimerFullscreen, setRotTimerFullscreen] = useState(false);
const rotTimerAutoOpenedRef = useRef(false);






  // --- Prestart (15s) ---
  const [rotPrestartEndAt, setRotPrestartEndAt] = useState<number | null>(null);
  const [rotPendingDurationSec, setRotPendingDurationSec] = useState<number | null>(null);

  // damit wir im Prestart nicht doppelt zählen/sprechen
  const rotPrestartLastSpokenRef = useRef<number | null>(null);
  const rotPrestartReadySpokenRef = useRef(false);
  const rotLetsFlipSpokenRef = useRef(false);

  function rotPrestartLeftMs() {
    if (rotPrestartEndAt == null) return null;
    return Math.max(0, rotPrestartEndAt - Date.now());
  }

    const rotHalfAnnouncedRef = useRef(false);
    const rotOneMinuteAnnouncedRef = useRef(false);
    const rotFinalCountdownRef = useRef<number | null>(null);
    const rotFinishedAnnouncedRef = useRef(false);   

    const rotEndSoundPlayedRef = useRef(false);
    const rotPendingEndSoundRef = useRef(false);
    const rotEndSoundRef = useRef<HTMLAudioElement | null>(null);
    const rotEndTimeoutRef = useRef<number | null>(null);
    // --- Rotation Speech (iOS safe) ---
    const rotVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
    const rotSpeechUnlockedRef = useRef(false);
    const elimSpeechUnlockedRef = useRef(false);


// 🎵 Rotation Background Music (MP3 loop)
// Datei: /public/sounds/rotation-loop.mp3
const rotMusicRef = useRef<HTMLAudioElement | null>(null);
const ROT_MUSIC_VOL = 0.25;      // normale Lautstärke (eher leise)
//const ROT_MUSIC_VOL_PLAY = 0.25;  // während Play
const ROT_MUSIC_DUCK = 0.10;     // während Sprache (noch leiser)

function rotMusicEnsure() {
  if (typeof window === "undefined") return null;
  if (!rotMusicRef.current) {
    const a = new Audio("/sounds/timer.mp3");
    a.loop = true;
    a.preload = "auto";
    a.volume = ROT_MUSIC_VOL;
    rotMusicRef.current = a;
  }
  return rotMusicRef.current;
}

function rotPrepareMusic() {
  const a = rotMusicEnsure();
  if (!a) return;

  try {
    a.pause();
    a.currentTime = 0;
    a.muted = true;

    a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
        console.log("Music unlocked OK");
      })
      .catch((err) => {
        a.muted = false;
        console.log("Music unlock failed:", err?.name, err?.message, err);
      });
  } catch (err) {
    try { a.muted = false; } catch {}
    console.log("Music unlock failed (sync):", err);
  }
}


function rotPrepareMusicStartInTap() {
  const a = rotMusicEnsure();
  if (!a) return;

  try {
    // iOS: nur EIN play() im Tap, und laufen lassen
    a.currentTime = 0;
    a.volume = ROT_MUSIC_VOL;
    a.muted = true;

    a.play()
      .then(() => {
        a.muted = false;
        console.log("Music started (tap) OK");
      })
      .catch((err) => {
        a.muted = false;
        console.log("Music start failed:", err?.name, err?.message, err);
      });
  } catch (err) {
    try { a.muted = false; } catch {}
    console.log("Music start failed (sync):", err);
  }
}




function rotMusicPlay() {
  const a = rotMusicEnsure();
  if (!a) return;
  try {
    //a.volume = ROT_MUSIC_VOL;
    if (a.paused) a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

function rotMusicStop() {
  const a = rotMusicRef.current;
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;
    a.volume = ROT_MUSIC_VOL;
  } catch {
    /* ignore */
  }
}

function rotMusicDuck() {
  const a = rotMusicRef.current;
  if (!a) return;
  try {
    a.volume = ROT_MUSIC_DUCK;
  } catch {}
}

function rotMusicUnduck() {
  const a = rotMusicRef.current;
  if (!a) return;
  try {
    a.volume = ROT_MUSIC_VOL;
  } catch {}
}
//function rotMusicUnduckPlay() {
//  const a = rotMusicRef.current;
//  if (!a) return;
//  try {
//    a.volume = ROT_MUSIC_VOL_PLAY;
//  } catch {}
//}

async function rotPlayEndSound(): Promise<boolean> {




  if (typeof window === "undefined") return false;

  // iPad: wenn Seite "hidden" ist -> später erneut versuchen
  if (document?.hidden) return false;

  try {
if (!rotEndSoundRef.current) return false;

    const a = rotEndSoundRef.current;
    if (!a) return false;

    a.volume = 0.9;
    a.currentTime = 0;

    await a.play();
    return true;
  } catch (err) {
    console.log("EndSound play() blocked:", (err as any)?.name, (err as any)?.message, err);
    return false;
  }
}



function rotPrepareEndSound(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  if (!rotEndSoundRef.current) {
    const a = new Audio("/sounds/end.mp3");
    a.preload = "auto";
    (a as any).playsInline = true;
    a.volume = 0.9;
    rotEndSoundRef.current = a;
  }

  const a = rotEndSoundRef.current!;
  try {
    a.pause();
    a.currentTime = 0;
    a.muted = true;

    // play() wird DIREKT im Tap gestartet -> iOS-safe
    return a.play()
      .then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
        a.volume = 0.9;
        console.log("EndSound unlocked OK");
        return true;
      })
      .catch((err) => {
        a.muted = false;
        console.log("EndSound unlock failed:", err?.name, err?.message, err);
        return false;
      });
  } catch (err) {
    a.muted = false;
    console.log("EndSound unlock failed (sync):", err);
    return Promise.resolve(false);
  }
}





  // iOS/Safari: voices sind beim ersten getVoices() oft leer
  useEffect(() => {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    const load = () => {
      rotVoicesRef.current = synth.getVoices?.() ?? [];
    };

    load();
    synth.onvoiceschanged = load;

    return () => {
      // cleanup (nur wenn wir es gesetzt haben)
      if (synth.onvoiceschanged === load) synth.onvoiceschanged = null;
    };
  }, []);

    function rotPickVoice(preferredLangs: string[] = ["en-US", "de-DE"]) {
    const voices = rotVoicesRef.current ?? [];

    // Windows: Vicki/Vicky (nur wenn vorhanden)
    const vicky =
      voices.find((v) => /vicki|vicky/i.test(v.name || "")) ||
      voices.find((v) => /vicki|vicky/i.test(v.voiceURI || "")) ||
      null;

    if (vicky) return vicky;

    // iOS: bevorzugte Sprache suchen
    for (const lang of preferredLangs) {
      const exact = voices.find((v) => v.lang === lang);
      if (exact) return exact;

      const prefix = voices.find((v) =>
        (v.lang || "").toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())
      );
      if (prefix) return prefix;
    }

    return voices[0] ?? null;
  }

  // iOS: Speech oft erst nach einem Speak im User-Click zuverlässig
  function rotUnlockSpeechOnce() {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (rotSpeechUnlockedRef.current) return;

    try {
      synth.cancel();

      const u = new SpeechSynthesisUtterance(".");
      u.volume = 0; // stumm
      u.rate = 1;
      u.pitch = 1;

      const v = rotPickVoice(["en-US", "de-DE"]);
      if (v) {
        u.voice = v;
        u.lang = v.lang || "en-US";
      } else {
        u.lang = "en-US";
      }

      synth.speak(u);
      rotSpeechUnlockedRef.current = true;
    } catch {
      // ignore
    }
  }

  // 🔊 Round Speech (für alle Formate außer Elimination/Rotation)
const roundSpeechUnlockedRef = useRef(false);

function roundUnlockSpeechOnce() {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (roundSpeechUnlockedRef.current) return;

  try {
    synth.cancel();

    const u = new SpeechSynthesisUtterance(".");
    // iOS: muss im User-Click passieren; minimal hörbar vermeiden wir -> sehr leise
    u.volume = 0.01;
    u.rate = 1;
    u.pitch = 1;

    // wir nutzen deine vorhandene Voice-Auswahl aus Rotation:
    // rotPickVoice(["en-US","de-DE"]) existiert schon weiter oben
    const v = rotPickVoice(["en-US", "de-DE"]);
    if (v) {
      u.voice = v;
      u.lang = v.lang || "en-US";
    } else {
      u.lang = "en-US";
    }

    synth.speak(u);
    roundSpeechUnlockedRef.current = true;
  } catch {
    // ignore
  }
}

function roundSpeak(text: string) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;

  try {
    // iOS: voices anstoßen falls leer
    if ((rotVoicesRef.current?.length ?? 0) === 0) {
      synth.getVoices();
    }

    if (!roundSpeechUnlockedRef.current) {
      roundUnlockSpeechOnce();
    }

    synth.cancel();

    const utter = new SpeechSynthesisUtterance(text);

    const v = rotPickVoice(["en-US", "de-DE"]);
    if (v) {
      utter.voice = v;
      utter.lang = v.lang || "en-US";
    } else {
      utter.lang = "en-US";
    }

    synth.speak(utter);
  } catch {
    // ignore
  }
}


  function elimUnlockSpeechOnce() {
    if (elimSpeechUnlockedRef.current) return;
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    try {
      const u = new SpeechSynthesisUtterance(".");
      u.volume = 0;   // unhörbar
      u.rate = 1;
      u.pitch = 1;

      // iOS: voices müssen oft einmal angefragt werden
      window.speechSynthesis.getVoices();
      window.speechSynthesis.speak(u);

      elimSpeechUnlockedRef.current = true;
    } catch (e) {
      console.warn("elimUnlockSpeechOnce failed", e);
    }
  }




function rotSpeak(text: string) {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;

  try {
    // 🔹 iOS Fix: Voices ggf. einmal explizit anstoßen
    if ((rotVoicesRef.current?.length ?? 0) === 0) {
      synth.getVoices();
    }

    // 🔹 iOS Fix: einmal “unlock” (wenn noch nicht passiert)
    if (!rotSpeechUnlockedRef.current) {
      rotUnlockSpeechOnce();
    }

    // 🎧 Musik während Sprache leiser
    rotMusicDuck();

    // verhindert Overlap / “stuck queue”
    synth.cancel();

    // nur EINMAL anlegen
    const utter = new SpeechSynthesisUtterance(text);

    // Voice wählen: Vicky auf Windows, sonst iOS Stimme (en/de)
    const v = rotPickVoice(["en-US", "de-DE"]);
    if (v) {
      utter.voice = v;
      utter.lang = v.lang || "en-US";
    } else {
      utter.lang = "en-US";
    }

    let restore = () => rotMusicUnduck();

    //if (
    //  text === "Los gehts" ||
    //  text === "Achtung, nur noch eine Minute." ||
    //  text === "Halbzeit. Die Hälfte der Zeit ist um."
    //) {
    //  restore = () => rotMusicUnduckPlay();
   // }

    utter.onend = restore;
    utter.onerror = restore;

    // Fallback: falls onend nicht feuert
    window.setTimeout(restore, 1200);

    synth.speak(utter);
  } catch {
    rotMusicUnduck();
  }
}



function elimSpeak(text: string) {
  if (typeof window === "undefined") return;

  const synth = window.speechSynthesis;
  if (!synth) return;

  try {
    // NICHT canceln, sonst killst du ggf. andere Ansagen
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";

    const voices = synth.getVoices();
    const vicki =
      voices.find((v) => v.name === "Vicki") ||
      voices.find((v) => (v.name || "").toLowerCase().includes("vicki")) ||
      null;

    const enFallback =
      voices.find((v) => (v.lang || "").toLowerCase().startsWith("en")) || null;

    utter.voice = vicki ?? enFallback ?? null;

    synth.speak(utter);
  } catch {
    // ignore
  }
}


useEffect(() => {
  if (!isRotationFormat) return;

  const endAt = rotTimer?.endAt;
  if (typeof endAt !== "number" || !Number.isFinite(endAt)) return;

  // alten Timeout weg
  if (rotEndTimeoutRef.current != null) {
    window.clearTimeout(rotEndTimeoutRef.current);
    rotEndTimeoutRef.current = null;
  }

  const fire = async () => {
    // Endsound (einmal)
    if (!rotEndSoundPlayedRef.current) {
      const ok = await rotPlayEndSound();
      if (ok) {
        rotEndSoundPlayedRef.current = true;
      } else {
        // iPad: Sound später erneut versuchen (z.B. wenn User zurückkommt)
        rotPendingEndSoundRef.current = true;
      }
    }


    // Time's up (einmal)
    if (!rotFinishedAnnouncedRef.current) {
      rotFinishedAnnouncedRef.current = true;
      rotSpeak(
        "Time's up! Stop playing pinball immediately and enter your high scores! Thank you!"
      );
    }
  };

  const delay = endAt - Date.now();

  // wenn schon vorbei (oder Tab war asleep): sofort feuern
  if (delay <= 0) {
    fire();
    return;
  }

  rotEndTimeoutRef.current = window.setTimeout(fire, delay);

  return () => {
    if (rotEndTimeoutRef.current != null) {
      window.clearTimeout(rotEndTimeoutRef.current);
      rotEndTimeoutRef.current = null;
    }
  };
}, [isRotationFormat, rotTimer?.endAt]);



  const rotRunning =
    typeof rotTimer?.endAt === "number" &&
    Number.isFinite(rotTimer.endAt) &&
    rotTimer.endAt > Date.now();

  const rotPaused = !rotRunning && Number.isFinite(rotTimer?.remainingMs);

  useEffect(() => {
  if (!isRotationFormat) {
    rotMusicStop();
    return;
  }

  const prestartActive =
    typeof rotPrestartEndAt === "number" && rotPrestartEndAt > Date.now();

  const shouldPlay = (rotRunning || prestartActive) && !rotPaused;

  if (shouldPlay) rotMusicPlay();
  else rotMusicStop();
}, [isRotationFormat, rotRunning, rotPaused, rotPrestartEndAt]);


    !rotRunning &&
    typeof rotTimer?.remainingMs === "number" &&
    Number.isFinite(rotTimer.remainingMs) &&
    rotTimer.remainingMs > 0;

useEffect(() => {
  if (!isRotationFormat) return;

  const prestartActive =
    typeof rotPrestartEndAt === "number" && rotPrestartEndAt > Date.now();

  // Tick laufen lassen wenn Haupttimer läuft ODER Prestart läuft
  if (!rotRunning && !prestartActive) return;

  const id = window.setInterval(() => setRotTimerTick((x) => x + 1), 1000);
  return () => window.clearInterval(id);
}, [isRotationFormat, rotRunning, rotPrestartEndAt]);

  function rotTimeLeftMs() {
    if (rotRunning) return Math.max(0, (rotTimer.endAt as number) - Date.now());
    if (rotPaused) return Math.max(0, rotTimer.remainingMs as number);
    return null;
  }

  function rotFmt(ms: number | null) {
    if (ms == null) return "—";
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  useEffect(() => {
  if (typeof window === "undefined") return;

  const onVis = async () => {
    if (document.hidden) return;

    if (rotPendingEndSoundRef.current && !rotEndSoundPlayedRef.current) {
      const ok = await rotPlayEndSound();
      if (ok) {
        rotEndSoundPlayedRef.current = true;
        rotPendingEndSoundRef.current = false;
      }
    }
  };

  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
}, []);

// Auto-Open (einmal pro Run) + Auto-Close
// - zeigt das Overlay automatisch beim Start (Prestart / Running / Paused)
// - wenn der User es schließt, bleibt es bis zum nächsten Start zu
useEffect(() => {
  if (!isRotationFormat) {
    rotTimerAutoOpenedRef.current = false;
    setRotTimerFullscreen(false);
    return;
  }

  const prestartActive =
    typeof rotPrestartEndAt === "number" && rotPrestartEndAt > Date.now();

  const active = prestartActive || rotRunning || rotPaused;

  // Auto-open nur einmal pro aktivem Run
  if (active && !rotTimerAutoOpenedRef.current) {
    rotTimerAutoOpenedRef.current = true;
    setRotTimerFullscreen(true);
  }

  // Wenn alles inaktiv ist: Auto-Flag reset + Overlay schließen
  if (!active) {
    rotTimerAutoOpenedRef.current = false;
    setRotTimerFullscreen(false);
  }
}, [isRotationFormat, rotRunning, rotPaused, rotPrestartEndAt]);



useEffect(() => {
  if (!isRotationFormat) return;
  if (!rotRunning) return;

  const leftMs = rotTimeLeftMs();
  if (leftMs == null) return;

  const totalMs = (rotTimer?.durationSec ?? 600) * 1000;
  const secondsLeft = Math.ceil(leftMs / 1000);

  // 🟠 Halbzeit (einmal)
  if (!rotHalfAnnouncedRef.current && leftMs <= totalMs / 2) {
    rotHalfAnnouncedRef.current = true;
    rotSpeak("Hurry up and try harder, take risks or stay pussies forever.");
  }

  // 🔴 Noch 1 Minute (einmal)
  if (!rotOneMinuteAnnouncedRef.current && leftMs <= 60_000) {
    rotOneMinuteAnnouncedRef.current = true;
    rotSpeak("Attention, only one minute left.");
  }

  // 🔊 Letzte 10 Sekunden runterzählen
  if (secondsLeft <= 10 && secondsLeft > 1) {
    if (rotFinalCountdownRef.current !== secondsLeft) {
      rotFinalCountdownRef.current = secondsLeft;
      rotSpeak(String(secondsLeft));
    }
  }


  // 🔔 Endsound: sobald <= 1 Sekunde übrig (auch wenn der Tick spät kommt)

  // ✅ Ende-Sound + 'Time's up' werden über den rotEndTimeoutRef-Effect gehandhabt (iPad-sicher).

}, [
  isRotationFormat,
  rotRunning,
  _rotTimerTick,
  rotTimer?.durationSec,
]);



useEffect(() => {
  if (!isRotationFormat) return;

  const leftMs = rotPrestartLeftMs();
  if (leftMs == null) return;

  const secondsLeft = Math.ceil(leftMs / 1000);

  // bei 10s: Ready-Ansage (einmal)
  if (secondsLeft <= 10 && !rotPrestartReadySpokenRef.current) {
    rotPrestartReadySpokenRef.current = true;
    rotSpeak("Get ready, it starts in a few seconds!");
  }

  // bei 3,2,1: runterzählen (jeweils einmal)
  if (secondsLeft <= 5 && secondsLeft > 0) {
    if (rotPrestartLastSpokenRef.current !== secondsLeft) {
      rotPrestartLastSpokenRef.current = secondsLeft;
      rotSpeak(String(secondsLeft));
    }
  }

  // 🔔 Endsound: sobald <= 1 Sekunde übrig (auch wenn der Tick spät kommt)
  // 🔔 Prestart-Endsound (kein played-Flag setzen; das Flag ist fürs echte Turnier-Ende)
  if (leftMs === 0) {
    rotPlayEndSound();
  }


  // bei 0: Let's flip + Haupttimer starten (einmal)
  if (secondsLeft <= 0 && !rotLetsFlipSpokenRef.current) {
    rotLetsFlipSpokenRef.current = true;
    rotSpeak("Let's go and have fun!");

    if (rotPendingDurationSec == null) {
      // Sicherheitsgurt – sollte eigentlich nie passieren
      return;
    }

    rotStartMainTimer(rotPendingDurationSec);

    // Prestart beenden
    setRotPrestartEndAt(null);
    setRotPendingDurationSec(null);
    rotPrestartLastSpokenRef.current = null;
    rotPrestartReadySpokenRef.current = false;
  }
}, [isRotationFormat, _rotTimerTick, rotPrestartEndAt, rotPendingDurationSec]);




function rotStartMainTimer(durationSec: number) {
  // reset Haupttimer-Ansagen
  rotHalfAnnouncedRef.current = false;
  rotOneMinuteAnnouncedRef.current = false;
  rotFinalCountdownRef.current = null;
  rotFinishedAnnouncedRef.current = false;

  // ✅ WICHTIG: Prestart-Sound hat das Flag schon gesetzt – für das echte Ende neu freigeben
  rotEndSoundPlayedRef.current = false;

  rotMusicPlay();

  setRotTimer({
    endAt: Date.now() + durationSec * 1000,
    remainingMs: null,
    durationSec,
  });
}



function rotStartGlobal(minutes = 10) {
  rotUnlockSpeechOnce();

  // iOS: Endsound zuerst unlocken, DANACH Musik starten (nicht parallel)
  rotPrepareEndSound().then(() => {
    rotPrepareMusicStartInTap();
  });


  const dur = Math.max(1, Math.floor(minutes)) * 60;

  // Prestart-Flags reset
  setRotPrestartEndAt(null);
  setRotPendingDurationSec(null);
  rotPrestartLastSpokenRef.current = null;
  rotPrestartReadySpokenRef.current = false;
  rotLetsFlipSpokenRef.current = false;
  rotEndSoundPlayedRef.current = false;

  if (rotEndTimeoutRef.current != null) {
  window.clearTimeout(rotEndTimeoutRef.current);
  rotEndTimeoutRef.current = null;
}


  // Haupttimer erstmal NICHT starten – nur merken
  setRotPendingDurationSec(dur);

  // Prestart 15 Sekunden starten
  setRotPrestartEndAt(Date.now() + 15_000);

  // Optional: falls vorher ein Timer lief, hart stoppen (damit’s sauber ist)
  setRotTimer((prev) => ({
    endAt: null,
    remainingMs: null,
    durationSec: prev?.durationSec ?? dur,
  }));
}


  function rotPauseToggleGlobal() {
    // Pause (running -> paused)
    if (rotRunning) {
      const remaining = Math.max(0, (rotTimer.endAt as number) - Date.now());
      setRotTimer((prev) => ({
        endAt: null,
        remainingMs: remaining,
        durationSec: prev?.durationSec ?? 600,
        
      }));
      rotMusicStop();
      return;
    }

    // Resume (paused -> running)
    if (rotPaused) {
      const remaining = Math.max(0, rotTimer.remainingMs as number);
      setRotTimer((prev) => ({
        endAt: Date.now() + remaining,
        remainingMs: null,
        durationSec: prev?.durationSec ?? 600,
        
      }));
      rotMusicPlay();
    }
  }

  function rotResetGlobal() {
    rotMusicStop();
setRotPrestartEndAt(null);
setRotPendingDurationSec(null);
rotPrestartLastSpokenRef.current = null;
rotPrestartReadySpokenRef.current = false;
rotLetsFlipSpokenRef.current = false;
rotEndSoundPlayedRef.current = false;
rotEndSoundRef.current = null;

if (rotEndTimeoutRef.current != null) {
  window.clearTimeout(rotEndTimeoutRef.current);
  rotEndTimeoutRef.current = null;
}

    setRotTimer((prev) => ({
      endAt: null,
      remainingMs: null,
      durationSec: prev?.durationSec ?? 600,
    }));
  }



  async function createRound() {
    if (locked) return;

    // Rotation erzeugt alle Runden (1 pro Maschine) auf einmal.
    // Danach darf dieser Button nichts mehr erzeugen.
    if (isRotationFormat && (rounds ?? []).length > 0) {
      setNotice(
        "Rotation: Die Maschinen-Runden wurden bereits erzeugt. Bitte jetzt nur noch Scores eintragen und die Runden beenden."
      );
      return;
    }

    if (finalState && finalState.status !== "finished") {
      setNotice(
        "Es läuft ein Super-Finale – neue Runden können nicht mehr gestartet werden."
      );
      return;
    }

    // Nur per Button eine neue Runde starten – und nur wenn aktuell keine Runde mehr aktiv ist.
    if (hasActiveRound) {
      setNotice(
        "Es läuft noch eine aktive Runde. Bitte erst alle Runden auf Finished bringen, dann eine neue Runde erzeugen."
      );
      return;
    }

    setBusy(true);
    setNotice(null);

    const speechRoundEnabled = Boolean(speechRoundEnabledUi);

    // ✅ iOS: Unlock MUSS im Button-Click passieren
    if (speechRoundEnabled && !isEliminationFormat && !isRotationFormat) {
      roundUnlockSpeechOnce();
    }

    const res = await fetch("/api/rounds/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        startOrderMode,
        useElo,      // Elo-Flag für die Runde

        // ✅ Timeplay: Difficulty-Filter für Tasks/Maschinen
        taskDifficulties: isTimeplayFormat ? taskDifficulties : undefined,
      }),
    });

    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setNotice(j.error ?? "Fehler");
    if (j.warnings?.length) setNotice(j.warnings.join(" "));

      // ✅ Nach dem Erzeugen wollen wir direkt zu den Matches springen.
    // Wir setzen nur ein Flag; das tatsächliche Scrollen passiert in einem useEffect
    // NACH reloadAll(), wenn die neuen Runden/Matches schon im DOM sind.
const next = await reloadAll();
setScrollToMatchesNext(true);

if (speechRoundEnabled && !isEliminationFormat && !isRotationFormat && next) {
  try {
    // 1) neueste Runde finden (höchste number)
    const rounds = Array.isArray(next.rounds) ? next.rounds : [];
    const newestRound = rounds
      .filter((r: any) => r && typeof r.number === "number")
      .sort((a: any, b: any) => (b.number ?? 0) - (a.number ?? 0))[0];

    if (!newestRound) return;

    const roundId = String(newestRound.id);
    const roundNo = newestRound.number;

    // 2) Matches dieser Runde
    const matches = (Array.isArray(next.matches) ? next.matches : []).filter(
      (m: any) => String(m.round_id) === roundId
    );

    // Maschinen-Map
    const machinesById = Object.fromEntries(
      (Array.isArray(next.machines) ? next.machines : []).map((m: any) => [
        String(m.id),
        String(m.name ?? "Unknown machine"),
      ])
    );

    // Spieler-Map (Name + profile_id für Winrates)
    const playersByIdLocal = Object.fromEntries(
      (Array.isArray(next.players) ? next.players : []).map((p: any) => [
        String(p.id),
        { name: String(p.name ?? "Unknown"), profile_id: p.profile_id ? String(p.profile_id) : null },
      ])
    );

    // match_players gruppieren
    const mps = Array.isArray(next.match_players) ? next.match_players : [];
    const mpByMatch: Record<string, any[]> = {};
    for (const mp of mps) {
      const mid = String(mp.match_id);
      if (!mpByMatch[mid]) mpByMatch[mid] = [];
      mpByMatch[mid].push(mp);
    }
    // nach start_position sortieren
    for (const mid of Object.keys(mpByMatch)) {
      mpByMatch[mid].sort(
        (a, b) => Number(a.start_position ?? 0) - Number(b.start_position ?? 0)
      );
    }

    // 3) Winrates holen (m-winrate: machine-location)
    const locationId = next?.tournament?.location_id ? String(next.tournament.location_id) : "";
    const machineNamesUnique = Array.from(
      new Set(matches.map((m: any) => machinesById[String(m.machine_id)]).filter(Boolean))
    );

    // alle profileIds, die in den Matches vorkommen
    const profileIdsUnique = Array.from(
      new Set(
        matches
          .flatMap((m: any) =>
            (mpByMatch[String(m.id)] ?? []).map((mp: any) => playersByIdLocal[String(mp.player_id)]?.profile_id)
          )
          .filter(Boolean)
      )
    ) as string[];

    let winrateRows: any[] = [];
    if (locationId && profileIdsUnique.length && machineNamesUnique.length) {
      const wrRes = await fetch("/api/winrates/machine-location", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        cache: "no-store",
        body: JSON.stringify({
          profileIds: profileIdsUnique,
          machineNames: machineNamesUnique,
          locationId,
        }),
      });
      const wrJson = await wrRes.json().catch(() => ({}));
      winrateRows = Array.isArray(wrJson.rows) ? wrJson.rows : [];
    }

    // winrate lookup: key = profileId__machineName
    const wrByKey: Record<string, { winrate: number | null; matchesPlayed: number; wins: number }> = {};
    for (const r of winrateRows) {
      const pid = String(r.profileId ?? "");
      const mn = String(r.machineName ?? "");
      if (!pid || !mn) continue;
      wrByKey[`${pid}__${mn}`] = {
        winrate: typeof r.winrate === "number" ? r.winrate : null,
        matchesPlayed: Number(r.matchesPlayed ?? 0),
        wins: Number(r.wins ?? 0),
      };
    }

    // 4) Speech zusammenbauen
    const parts: string[] = [];
    parts.push(`Round ${roundNo}.`);

    matches.forEach((m: any, idx: number) => {
      const machineName = machinesById[String(m.machine_id)] ?? "Unknown machine";
      const mpList = mpByMatch[String(m.id)] ?? [];

      const players = mpList
        .map((mp: any) => playersByIdLocal[String(mp.player_id)])
        .filter(Boolean);

      const playersText = players.map((p: any) => p.name).join(", ");
      let line = `Match ${idx + 1} on machine ${machineName} with the playing order: ${playersText}.`;

      // Favorite = höchste m-winrate auf dieser Maschine (falls verfügbar)
      // Matchnummer: wenn Backend eine Nummer liefert, nutzen wir die; sonst 1..n
      const matchNo = typeof m.number === "number" ? m.number : idx + 1;
      let best: { name: string; winrate: number } | null = null;
      for (const p of players) {
        if (!p.profile_id) continue;
        const wr = wrByKey[`${p.profile_id}__${machineName}`];
        const wv = wr?.winrate;
        if (typeof wv !== "number") continue;
        if (!best || wv > best.winrate) best = { name: p.name, winrate: wv };
      }

      if (best) {
        line += ` Favorite player with the better machine-winrate on ${machineName} in this match is ${best.name}.`;
      }

      parts.push(line);
    });

    roundSpeak(parts.join(" "));
  } catch (e) {
    console.log("Round speech failed:", e);
  }
}


  

    
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


const machinesInfoById = useMemo(
  () =>
    Object.fromEntries(
      (data?.machines ?? []).map((m: any) => [
        m.id,
        { name: m.name, emoji: m.icon_emoji ?? null },
      ])
    ),
  [data?.machines]
);

const tasksById = useMemo(() => {
  const arr = ((data as any)?.tasks ?? []) as any[];
  return Object.fromEntries(arr.map((x) => [String(x.id), x]));
}, [data]);

  const playersById = useMemo(
    () =>
      Object.fromEntries(
        (data?.players ?? []).map((p: any) => {
          const prof = p.profile_id ? profilesById[p.profile_id] : undefined;

          return [
            p.id,
            {
              name: p.name,
              profile_id: p.profile_id ?? null,
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
    (typeof data === "undefined" ? undefined : data?.tournament?.format) === "swiss"
      ? "Swiss"
      : (typeof data === "undefined" ? undefined : data?.tournament?.format) === "round_robin"
      ? "Round Robin"
      : (typeof data === "undefined" ? undefined : data?.tournament?.format) === "dyp_round_robin"
      ? "DYP Round Robin"
      : (typeof data === "undefined" ? undefined : data?.tournament?.format) === "rotation"
      ? "Round the pinball"
      : (typeof data === "undefined" ? undefined : data?.tournament?.format) === "timeplay"
      ? "Time-Play"
      : (typeof data === "elimination" ? undefined : data?.tournament?.format) === "elimination"
      ? "Crazy Elimination"
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
      {/* 🏆 Highscore-Jubel wie am TV – hier ohne Ton, Antippen schließt */}
      <RecordCelebration code={code} data={data} soundOn={false} dismissOnTap />






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
<div className="mb-4 overflow-hidden rounded-2xl border border-neutral-200 shadow-sm">
  {/* Kopf: Name + Status (Name/Kategorie bei beendeten Turnieren änderbar) */}
  <div className="flex flex-wrap items-start justify-between gap-3 bg-gradient-to-r from-neutral-50 to-white px-4 pb-3 pt-4">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="truncate text-2xl font-semibold leading-tight">{data?.tournament?.name}</h2>
        {isFinished && isAdmin ? (
          <button
            type="button"
            onClick={() => setEditMetaOpen(true)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
            title="Name / Kategorie dieses beendeten Turniers ändern"
          >
            ✏️ Name / Kategorie
          </button>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
        <span>🏷️ {cat || <span className="italic">keine Kategorie</span>}</span>
        {data?.tournament?.locations?.name ? <span>📍 {data.tournament.locations.name}</span> : null}
      </div>
    </div>

    <span
      className={
        "shrink-0 rounded-full px-3 py-1 text-xs font-semibold " +
        (isFinished ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700")
      }
    >
      {isFinished ? "✅ Beendet" : "● Laufend"}
    </span>
  </div>

  {/* Eckdaten */}
  <div className="flex flex-wrap gap-2 border-t border-neutral-100 px-4 py-3 text-sm text-neutral-700">
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1">
      <span className="text-neutral-500">Format</span>
      <span className="font-semibold">{formatLabel}</span>
    </span>
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1">
      <span className="text-neutral-500">Spieler/Maschine</span>
      <span className="font-semibold">{data?.tournament?.match_size ?? 4}</span>
    </span>
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1">
      <span className="text-neutral-500">Code</span>
      <span className="font-mono font-semibold tracking-wider">{code}</span>
    </span>
    <PointsSystemButton
      format={data?.tournament?.format}
      matchSize={data?.tournament?.match_size}
      nPlayers={Array.isArray(data?.players) ? data.players.length : 0}
    />
    {currentRoundObj && (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1">
        <span className="text-neutral-500">Elo in dieser Runde</span>
        <span className={"font-semibold " + (currentRoundObj.elo_enabled ? "text-emerald-700" : "text-neutral-500")}>
          {currentRoundObj.elo_enabled ? "aktiv" : "aus"}
        </span>
      </span>
    )}
  </div>

  {/* Aktionen: links Ablauf, rechts Gefahrenzone */}
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
    <div className="flex flex-wrap items-center gap-3">
      {!isFinished ? (
        <Button
          variant="secondary"
          onClick={finishTournament}
          disabled={busy || !isAdmin}
          title={!isAdmin ? "Nur Admins können das Turnier beenden" : ""}
        >
          🏁 Turnier beenden
        </Button>
      ) : null}

      <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
        <input
          type="checkbox"
          checked={speechRoundEnabledUi}
          onChange={(e) => setSpeechRoundEnabled(e.target.checked)}
          disabled={!isAdmin}
          title={!isAdmin ? "Nur Admins können das ändern" : ""}
        />
        <span>🔊 Sprachausgabe pro Runde</span>
      </label>
    </div>

    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        onClick={deleteTournament}
        disabled={busy || !isAdmin}
        className="!px-3 !py-2 !text-sm bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
        title={!isAdmin ? "Nur Admins dürfen Turniere löschen" : ""}
      >
        🗑️ Turnier löschen
      </Button>
      <div className={"max-w-xs text-right text-[11px] " + (isFinished ? "text-neutral-500" : "text-amber-700")}>
        {isFinished
          ? "Beendet: Elo-Werte bleiben beim Löschen unverändert."
          : "Noch nicht beendet: Beim Löschen wird die Elo auf den Stand vor diesem Turnier zurückgesetzt."}
      </div>
    </div>
  </div>
</div>

<EditTournamentMetaDialog
  open={editMetaOpen}
  code={code}
  initialName={String(data?.tournament?.name ?? "")}
  initialCategory={String(data?.tournament?.category ?? "")}
  onClose={() => setEditMetaOpen(false)}
  onSaved={() => {
    reloadAll();
  }}
/>
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
    value={selectedProfileIds}
    onChange={(ids) => setSelectedProfileIds(ids)}
    disabled={busy || locked}
    disabledIds={profileIdsInTournament}
  />

  <Button
    variant={selectedProfileIds.length ? "primary" : "secondary"}
    disabled={busy || locked || selectedProfileIds.length === 0}
    onClick={addPlayerFromProfile}
    className="h-10 px-3 text-sm"
  >
    {busy && selectedProfileIds.length
      ? "Wird hinzugefügt …"
      : selectedProfileIds.length > 1
      ? `Hinzufügen (${selectedProfileIds.length})`
      : "Hinzufügen"}
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
    Elo für dieses Turnier berechnen
  </span>

  <button
    type="button"
    onClick={toggleTournamentElo}
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
          disabled={busy || locked || isDypRR}
          title={isDypRR ? "Bei DYP Round Robin ist die Startreihenfolge immer zufällig." : undefined}
        >
        <option value="random">Zufällig</option>
        <option value="standings_asc">
          Schlechtester zuerst (nach aktueller Wertung)
        </option>
        <option value="last_round_asc" disabled={!canUseLastRoundOrder}>
          Schlechtester zuerst (nach letzter Runde)
        </option>
      </Select>

{isTimeplayFormat && (
  <div className="rounded-lg border p-3">
    <div className="text-sm font-medium mb-2">Tasks für diese Runde</div>

    <div className="flex flex-wrap gap-3">
      {["easy", "medium", "hard"].map((d) => (
        <label key={d} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={taskDifficulties.includes(d)}
            onChange={() => {
              setTaskDifficulties((prev) =>
                prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
              );
            }}
            disabled={busy || locked}
          />
          <span className="capitalize">{d}</span>
        </label>
      ))}
    </div>

    <p className="mt-2 text-xs text-neutral-500">
      Nur Maschinen mit aktiven Tasks in den gewählten Difficulties werden für diese Runde verwendet.
    </p>
  </div>
)}


      {isDypRR && (
        <p className="text-sm text-neutral-500 leading-snug">
          Bei <b>DYP Round Robin</b> ist die Startreihenfolge immer <b>zufällig</b>.
        </p>
      )}

      <p className="text-sm text-neutral-500 leading-snug">
        Diese Einstellung beeinflusst nur die Reihenfolge{" "}
        <b>innerhalb der Matches</b>, nicht die Gruppenzuordnung.
        Swiss- oder Matchplay-Logik bleiben unverändert.
      </p>
      {!canUseLastRoundOrder && (
        <p className="text-sm text-neutral-500 leading-snug">
          „Schlechtester zuerst (nach letzter Runde)“ geht nur, wenn pro Runde{" "}
          <b>genau ein Match</b> erzeugt wird (alle Spieler in einem Spiel).
        </p>
      )}
    </div>

    {/* 🔹 RECHTER BLOCK — Buttons + Toggle sauber in Leiste */}
    <div className="flex flex-col gap-3 items-end">

      <Button
        className="px-6 py-3 font-semibold"
        onClick={createRound}
        disabled={
          busy ||
          hasOpenPositions ||
          locked ||
          superFinalRunning ||
          hasActiveRound ||
          (isTimeplayFormat && taskDifficulties.length === 0)
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
      
      <Button
      
        variant="secondary"
        onClick={recalcElo}
                      disabled={
                    busy || hasOpenPositions || locked || superFinalRunning
                  }
        
      >
        Elo neu berechnen
      </Button>
      

      {/* ⭐ Toggle in einer cleanen Zeile */}
      <div className="flex items-center gap-3 text-sm text-neutral-600">
        <span className="whitespace-nowrap">Elo für dieses Turnier berechnen</span>
        <button
          type="button"
          onClick={toggleTournamentElo}
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
  isTimeplayFormat={isTimeplayFormat}
  taskDifficulties={taskDifficulties}
  eligibleMachineIds={eligibleMachineIds}
  eligibleMachinesLoading={eligibleMachinesLoading}
/>


      <PlayersList
        players={data?.players ?? []}
        profiles={profiles}     
        profAvatar={profAvatar}
        profRating={profRating}
        playersById={playersById}
        onReload={reloadAll}
        onToggle={togglePlayer}
        busy={busy}
        locked={locked}
        eloDeltas={eloDeltas} 
        eloShieldedByProfile={eloShieldedByProfile}  // ✅ HIER
      />
      <div ref={tournamentLeaderboardRef} />
      <Stats code={code} tournamentName={tournamentName} />

<div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-stretch">
  {/* 🔹 LINKE SEITE */}
  <div className="lg:flex-[3] min-w-0">
    <div ref={matchesSectionRef} />
    <RoundMatchesCard
      code={code}
      rounds={rounds}
      matches={matches}
      matchPlayers={matchPlayers}
      machinesInfoById={machinesInfoById}
      playersById={playersById}
      tasksById={tasksById}   // ✅ HINZUFÜGEN
      onSaved={reloadAll}
      locked={locked}
      tournament={(data as any)?.tournament}
      playersCount={(data as any)?.players?.length ?? null}
    />
  </div>

  {/* 🔹 RECHTE SEITE */}
  <div className="lg:flex-[1] min-w-0">
<div className="rounded-2xl border bg-white p-3 h-full flex flex-col">
  <div className="sticky top-4">
    <MiniLeaderboard
      code={code}
      rotation={isRotationFormat}
      matches={matches}
      matchPlayers={matchPlayers}
    />
    {/* 📺 Infobildschirm (öffentlich, ohne Login) in neuem Fenster – z. B. für zweiten PC/TV */}
    <a
      href={`/s/${encodeURIComponent(code)}/tv`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200"
      title={`Infobildschirm öffnen: /s/${code}/tv`}
    >
      📺 Infobildschirm
    </a>
    <MatchplayProgressStack
      tournament={(data as any)?.tournament}
      rounds={rounds}
      playersCount={(data as any)?.players?.length ?? null}
      players={(data as any)?.players ?? []}
      matches={matches}
      matchPlayers={matchPlayers}
      playersById={playersById}
      compact
    />
{isRotationFormat ? (
  (() => {
    const preLeftMs = rotPrestartLeftMs();
    const displayMs = preLeftMs != null ? preLeftMs : rotTimeLeftMs();

    return (
  <>
    <RotationGlobalTimerSticky
      locked={locked}
      timeLeftLabel={rotFmt(displayMs)}
      timeLeftMs={displayMs}
      durationSec={preLeftMs != null ? 15 : (rotTimer?.durationSec ?? 600)}
      running={preLeftMs != null ? true : rotRunning}
      paused={preLeftMs != null ? false : rotPaused}
      onStart={rotStartGlobal}
      onPauseToggle={rotPauseToggleGlobal}
      onReset={rotResetGlobal}
      onFullscreen={() => {
        rotTimerAutoOpenedRef.current = true;
        setRotTimerFullscreen(true);
      }}
    />

    <RotationTimerOverlay
      open={rotTimerFullscreen}
      onClose={() => setRotTimerFullscreen(false)}
      timeLeftLabel={rotFmt(displayMs)}
      timeLeftMs={displayMs}
      durationSec={preLeftMs != null ? 15 : (rotTimer?.durationSec ?? 600)}
      running={preLeftMs != null ? true : rotRunning}
      paused={preLeftMs != null ? false : rotPaused}
      prestart={preLeftMs != null}
      locked={locked}
      onPauseToggle={rotPauseToggleGlobal}
      onReset={rotResetGlobal}
    />
  </>
);
  })()
) : (
  <CurrentRoundSticky
  code={code}
  tournament={(data as any)?.tournament}
  rounds={rounds}
  matches={matches}
  matchPlayers={matchPlayers}
  playersById={playersById}
  machinesInfoById={machinesInfoById}
  tasksById={tasksById}
  />
)}





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
                    {(() => {
                      const sorted = [...(finalState.ranking ?? [])].sort(
                        (a: any, b: any) =>
                          Number(b?.points ?? 0) - Number(a?.points ?? 0)
                      );
                      const places = computeCompetitionPlaces(
                        sorted,
                        (x: any) => Number(x?.points ?? 0)
                      );

                      return sorted.map((r: any, idx: number) => {
                        const place = places[idx] ?? idx + 1;
                        const medal =
                          place === 1
                            ? "🥇"
                            : place === 2
                            ? "🥈"
                            : place === 3
                            ? "🥉"
                            : null;

                        const rowClass =
                          "grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center " +
                          (place === 1
                            ? "bg-amber-50 font-semibold"
                            : "");

                        return (
                          <div key={r.playerId} className={rowClass}>
                            <div className="col-span-2">
                              {medal ? medal : place}
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
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>

{/* --- Leaderboards unten --- */}
<div className="mt-6 grid gap-4 lg:grid-cols-3">
  {/* A) Turnierpunkte (dein Turnierleaderboard) – Reiter: Serie (Kategorie) | gleicher Turniername */}
  {(() => {
    const catName = String(tournament?.category ?? "").trim();
    const tName = String(tournament?.name ?? "").trim();
    // ohne Kategorie gibt es nur den Namens-Reiter
    const activeTab: "category" | "name" = !catName ? "name" : tpTab;
    const tpRows = activeTab === "name" ? nameTournamentRows : categoryTournamentRows;
    const tpPlaces = activeTab === "name" ? nameTournamentPlaces : categoryTournamentPlaces;
    const tabBtn = (v: "category" | "name", icon: string, label: string, value: string) => {
      const active = activeTab === v;
      return (
        <button
          type="button"
          onClick={() => chooseTpTab(v)}
          title={value}
          className={
            "min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left text-xs transition " +
            (active ? "bg-neutral-900 text-white shadow" : "text-neutral-600 hover:bg-neutral-200")
          }
        >
          <span className="block font-semibold">{icon} {label}</span>
          <span className={"block truncate " + (active ? "text-white/70" : "text-neutral-500")}>{value}</span>
        </button>
      );
    };
    return (
  <Card>
    <CardHeader>
      <div ref={tournamentPointsRef} />
      <div className="font-semibold">🏆 Turnierpunkte</div>
      <div className="mt-2 flex gap-1 rounded-xl bg-neutral-100 p-1">
        {catName ? tabBtn("category", "🏆", "Serie", catName) : null}
        {tabBtn("name", "🏷️", "Turniername", tName || "—")}
      </div>
    </CardHeader>
    <CardBody>
      {categoryTournamentLoading ? (
        <div className="text-sm text-neutral-500">Lade…</div>
      ) : tpRows.length === 0 ? (
        <div className="text-sm text-neutral-500">
          {activeTab === "name"
            ? `Keine Daten für Turniername "${tName || "—"}".`
            : `Keine Daten für Kategorie "${catName || "—"}".`}{" "}
          (Nur beendete Turniere zählen.)
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Spieler</th>
                <th className="py-1 pr-2 text-right">Turnierpunkte</th>
              </tr>
            </thead>
            <tbody>
              {tpRows.map((r: any, idx: number) => {
                const place = tpPlaces[idx] ?? idx + 1;
                const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : null;
                const rowBg =
                  place === 1
                    ? "bg-yellow-50"
                    : place === 2
                    ? "bg-neutral-100"
                    : place === 3
                    ? "bg-orange-50"
                    : "";

                return (
                  <tr
                    key={r.profileId ?? r.profile_id ?? r.name ?? idx}
                    className={`border-b last:border-0 hover:bg-neutral-50 ${rowBg}`}
                  >
                    <td className="py-1 pr-2 text-neutral-500 tabular-nums">
                      {medal ? medal : `${place}.`}
                    </td>
                    <td className="py-1 pr-2">{r.name ?? "—"}</td>
                    <td className="py-1 pr-2 text-right tabular-nums font-semibold">
                      {Number(r.tournamentPoints ?? 0).toLocaleString("de-DE")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CardBody>

  </Card>
    );
  })()}

  {/* B) Highscores pro Spieler */}
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">🔥 Highscores pro Spieler</div>
        {/*<RefreshBadge refreshing={hsRefreshing} lastUpdatedAt={lastHsUpdatedAt} />*/}
      </div>
    </CardHeader>
    <CardBody>
      {hsLoading ? (
        <div className="text-sm text-neutral-500">Lade…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500 border-b">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Spieler</th>
                <th className="py-1 pr-2 text-right">Highscores</th>
              </tr>
            </thead>
            <tbody>
              {playerHighscores.map((r, idx) => (
                <tr
                  key={r.profile_id}
                  className={`border-b last:border-0 hover:bg-neutral-50 ${
                    idx === 0
                      ? "bg-yellow-50"
                      : idx === 1
                      ? "bg-neutral-100"
                      : idx === 2
                      ? "bg-orange-50"
                      : ""
                  }`}
                >
                  <td className="py-1 pr-2 text-neutral-500 tabular-nums">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                  </td>
                  <td className="py-1 pr-2">{r.name}</td>
                  <td className="py-1 pr-2 text-right tabular-nums font-semibold">
                    {r.highscores}
                  </td>
                </tr>
              ))}
              {playerHighscores.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-2 text-sm text-neutral-500">
                    Noch keine Highscores.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </CardBody>
  </Card>

{/* C) Maschinen-Highscores */}
<Card>
  <CardHeader>
    <div className="font-semibold">🕹️ Maschinen-Highscores</div>
  </CardHeader>

  <CardBody>
    {hsLoading ? (
      <div className="text-sm text-neutral-500">Lade…</div>
    ) : machineHighscores.length === 0 ? (
      <div className="text-sm text-neutral-500">Noch keine Scores.</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500 border-b">
              <th className="py-2 pr-3">Maschine</th>
              <th className="py-2 pr-3">Spieler</th>
              <th className="py-2 pr-0 text-right">Score</th>
            </tr>
          </thead>

          <tbody>
            {machineHighscores.map((r, idx) => (
                <tr
                  key={`${r.machine_id}-${r.profile_id}-${idx}`}
                  className={`border-b last:border-0 hover:bg-neutral-50 ${
                  idx === 0
                    ? "bg-yellow-50"
                    : idx === 1
                    ? "bg-neutral-100"
                    : idx === 2
                    ? "bg-orange-50"
                    : ""
                }`}
                >
                {/* Maschine */}
                <td className="py-2 pr-3 align-top">
                  <div className="max-w-[180px]">
                    <div className="font-semibold text-[12px] leading-5">
                      {r.machine_name}
                                          {/* optional: kleines Badge für “Top 1 insgesamt” 
                                          {idx === 0 ? (
                                            <span className="absolute mr-12 text-[12px] px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                                              Top
                                            </span>
                                          ) : null} */}
                    </div>
                    {/* kleine Subline optional */}
                    <div className=" text-[11px] text-neutral-500">
                      Highscore #{idx + 1}
                    </div>
                  </div>
                </td>

                {/* Spieler */}
                <td className="py-2 pr-3 align-top">
                  <span className="inline-flex items-center gap-2">
                    <span className="font-medium  text-[12px]">{r.name}</span>
                  </span>
                </td>

                {/* Score */}
                <td className="py-2 pr-0  text-[12px] text-right align-top tabular-nums font-bold">
                  {Number(r.score ?? 0).toLocaleString("de-DE")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </CardBody>
</Card>

<div
  className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-50
    w-full max-w-[990px]
    transition-transform duration-200
    ${showBottomBar ? "translate-y-0" : "translate-y-full"}
  `}
>
  <div className="px-3 sm:px-4">
    <div className="bg-[rgb(250,250,250)] p-3 sm:p-4 flex gap-2 rounded-t-2xl shadow-[0_-6px_20px_rgba(0,0,0,0.12)]">

        <Button
          disabled={
            busy || hasOpenPositions || locked || superFinalRunning || hasActiveRound ||
            (isTimeplayFormat && taskDifficulties.length === 0)
          }
          onClick={createRound}
          className="flex-1 !py-2 !text-xs sm:!py-3 sm:!text-base"
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

<div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-700">
  <span className="text-xs sm:text-sm text-gray-400">ELO</span>



  <button
    type="button"
    disabled={busy || locked}
    onClick={toggleTournamentElo}
    title="Elo für das ganze Turnier an/aus"
    className={`text-xs sm:text-sm font-medium ${
      useElo ? "text-green-400" : "text-gray-500"
    }`}
  >
    {useElo ? "✓ an" : "aus"}
  </button>
</div>

  <Button
    variant="secondary"
    onClick={() => setAutoScrollEnabled((v) => !v)}
    title="Automatisches Durchscrollen"
    className={
      "relative h-10 w-10 mt-1 rounded-full hidden sm:flex items-center justify-center " +
      (autoScrollEnabled
        ? "bg-neutral-900 text-white"
        : "bg-white text-neutral-700")
    }
  >
    📺
    {autoScrollEnabled && (
      <span className="absolute -top-1 -right-1 rounded-full text-green-400 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
        {autoScrollCountdown}
      </span>
    )}
  </Button>

  <Button
    variant="secondary"
    onClick={jumpToActiveRound}
    disabled={!rounds || rounds.length === 0}
    className="whitespace-nowrap hidden sm:inline-flex"
    title="Zur aktiven Runde springen"
  >
    ⬇️ Runde
  </Button>

  <Button
    variant="secondary"
    onClick={scrollToTournamentLeaderboard}
    className="whitespace-nowrap hidden sm:inline-flex"
    title="Zum Turnier-Leaderboard springen"
  >
    🏆 Leaderboard
  </Button>

  <Button
    variant="secondary"
    onClick={scrollToTournamentPoints}
    className="whitespace-nowrap hidden sm:inline-flex"
    title="Zu den Turnierpunkten springen"
  >
    🔥 Highscores
  </Button>
    </div>
  </div>
</div>
</div>
</div>
  );
}