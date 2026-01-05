// @ts-nocheck
"use client";
{/*
type PlayersTabProps = {
  isAdmin: boolean;
}; */}

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, Input } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { joinTournamentByCode } from "@/lib/joinTournament";


import { useRouter } from "next/navigation";

type PlayersTabProps = {
  isAdmin: boolean;
  joined: any | null;
  setJoined: (t: any) => void;
};

type Profile = {
  id: string;
  name: string;
  avatar_url?: string | null;
  rating: number | null;
  matches_played: number;
  provisional_matches: number;
  color?: string | null;
  icon?: string | null;
  total_tournament_points?: number;
};

type Draft = {
  name: string;
  rating: string;
  provisional: string;
  resetMatchesPlayed: boolean;
  color: string;
  icon: string;
};

type EloPoint = {
  tournamentId: string | null;
  tournamentName: string;
  code: string;
  category: string | null;   // ✅ NEU
  created_at: string | null;
  rating: number;
  tournament_points?: number | null;
  final_rank?: number | null;
  super_final_rank?: number | null;
};

type Achievement = {
  label: string;
  icon: string;
};

// 🆕 Stats aus /api/players/stats
type PlayerStats = {
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  matchWinRate: number | null; // 0–1
  placements: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    other: number;
  };
  tournamentsPlayed: number;
  // Turnier-Stats
  tournamentPlacements: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    other: number;
  };
  tournamentAvgPlacement: number | null;
  tournamentWinRate: number | null; // 0–1

  // Super-Finale-Stats (aus /api/players/stats)
  finalsPlayed: number;
  finalsPlacements: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    other: number;
  };
  finalsAvgPlacement: number | null;
  finalsWinRate: number | null; // 0–1
};

// 🆕 Maschinen-Stats aus /api/players/machine-stats
type MachineStat = {
  locationId: string | null;
  locationName: string | null;
  machineId: string | null;
  machineName: string | null;
  matchesPlayed: number;
  wins: number;
  winRate: number | null;
  avgPosition: number | null;
};

const COLOR_OPTIONS = [
  // Pastell-Reihe 1
  "#fcd9b6", // peach orange
  "#bff3c3", // soft mint green
  "#cfe4ff", // baby blue
  "#e4d4ff", // pastel lavender
  "#ffd0d6", // pastel rose
  "#c9f2f9", // soft aqua
  "#fff2b5", // vanilla yellow
  "#e5e7eb", // light grey

  // Reihe 2 (neu)
  "#0ea5e9", // helles cyan
  "#16a34a", // sattes grün
  "#2563eb", // kräftiges blau
  "#7c3aed", // tiefes lila
  "#db2777", // pink
  "#facc15", // helles gelb
  "#4b5563", // dunkles grau
  "#14b8a6", // teal
];



function Avatar({
  url,
  name,
  color,
  icon,
}: {
  url: string | null;
  name: string;
  color?: string | null;
  icon?: string | null;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const bgColor = color || "#e5e7eb"; // default gray
  const emoji = icon && icon.trim() ? icon.trim() : null;

 

  return (
    <div
      className="h-10 w-10 overflow-hidden rounded-xl border flex items-center justify-center text-sm font-semibold"
      style={{
        backgroundColor: bgColor,
        color: "#111827",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : emoji ? (
        <span className="text-base">{emoji}</span>
      ) : (
        <span className="text-sm font-semibold text-neutral-900">
          {initials || "?"}
        </span>
      )}
    </div>
  );
}

export default function PlayersTab({ isAdmin, joined, setJoined }: PlayersTabProps){
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | "new" | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingKey, setSavingKey] = useState<string | "new" | null>(null);

  // Elo-History-States: pro Profil
  const [eloHistory, setEloHistory] = useState<Record<string, EloPoint[]>>({});
  const [eloLoading, setEloLoading] = useState<Record<string, boolean>>({});
  const [eloError, setEloError] = useState<Record<string, string | null>>({});

  // Vergleichsauswahl (max. 2 Spieler)
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  // Stats-State pro Profil
  const [statsByProfile, setStatsByProfile] = useState<
    Record<string, PlayerStats | null>
  >({});
  const [statsLoading, setStatsLoading] = useState<
    Record<string, boolean>
  >({});
  const [statsError, setStatsError] = useState<
    Record<string, string | null>
  >({});

  // 🆕 Machine-Stats-State pro Profil
  const [machineStatsByProfile, setMachineStatsByProfile] = useState<
    Record<string, MachineStat[] | null>
  >({});
  const [machineStatsLoading, setMachineStatsLoading] = useState<
    Record<string, boolean>
  >({});
  const [machineStatsError, setMachineStatsError] = useState<
    Record<string, string | null>
  >({});

  // aktiver Unter-Tab pro Profil ("edit" | "stats")
  const [detailTabs, setDetailTabs] = useState<
    Record<string, "edit" | "stats">
  >({});

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/list?ts=${Date.now()}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Konnte Profile nicht laden");
        setProfiles([]);
      } else {
        const rawProfiles: any[] = j.profiles ?? [];
        setProfiles(
          rawProfiles.map((p) => ({
            id: p.id,
            name: p.name,
            avatar_url: p.avatar_url ?? null,
            rating: p.rating ?? null,
            matches_played: p.matches_played ?? 0,
            provisional_matches: p.provisional_matches ?? 0,
            color: p.color ?? null,
            icon: p.icon ?? null,
            total_tournament_points: p.total_tournament_points ?? 0,
          }))
        );
      }
    } catch {
      setError("Konnte Profile nicht laden (Netzwerkfehler?)");
      setProfiles([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return profiles;
    return profiles.filter((p) => (p.name ?? "").toLowerCase().includes(s));
  }, [profiles, q]);

  
  //const [busy, setBusy] = useState(false);
  //const [msg, setMsg] = useState<string | null>(null);

  // falls du setJoined aus props oder context bekommst:
  // const { setJoined } = props;

  async function openByCode(code: string) {
    //setBusy(true);
    //setMsg(null);

    const r = await joinTournamentByCode(code);
    //setBusy(false);

    if (!r.ok) return //setMsg(r.error);

    setJoined(r.tournament); // oder was auch immer bei dir den State setzt
  }

  function ensureDraft(key: string, profile?: Profile): Draft {
    setDrafts((prev) => {
      if (prev[key]) return prev;
      const base: Draft =
        profile && profile.rating != null
          ? {
              name: profile.name,
              rating: String(Math.round(profile.rating)),
              provisional: String(profile.provisional_matches ?? 10),
              resetMatchesPlayed: false,
              color: profile.color ?? "",
              icon: profile.icon ?? "",
            }
          : {
              name: profile?.name ?? "",
              rating: "1500",
              provisional: "10",
              resetMatchesPlayed: false,
              color: profile?.color ?? "",
              icon: profile?.icon ?? "",
            };
      return { ...prev, [key]: base };
    });

    return (
      drafts[key] ??
      ({
        name: profile?.name ?? "",
        rating:
          profile && profile.rating != null
            ? String(Math.round(profile.rating))
            : "1500",
        provisional: String(profile?.provisional_matches ?? 10),
        resetMatchesPlayed: false,
        color: profile?.color ?? "",
        icon: profile?.icon ?? "",
      } as Draft)
    );
  }

  // Elo-Historie für ein Profil laden
  async function loadEloHistory(profileId: string) {
    setEloLoading((prev) => ({ ...prev, [profileId]: true }));
    setEloError((prev) => ({ ...prev, [profileId]: null }));

    try {
      const res = await fetch("/api/players/elo-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEloError((prev) => ({
          ...prev,
          [profileId]: j.error ?? "Elo-Verlauf konnte nicht geladen werden.",
        }));
        setEloHistory((prev) => ({ ...prev, [profileId]: [] }));
      } else {
        // j.history kommt aus tournament_ratings (rating_before + rating_after)
        const raw: any[] = j.history ?? [];
        const points: EloPoint[] = [];

        if (raw.length > 0) {
          const first = raw[0];

          // Start-Elo: rating_before des ersten Turniers (Fallback rating_after)
          const startRating =
            typeof first.rating_before === "number"
              ? first.rating_before
              : typeof first.rating_after === "number"
              ? first.rating_after
              : null;

          if (startRating != null) {
            points.push({
              tournamentId: null,
              tournamentName: "Start-Elo",
              code: "",
              category: null, 
              created_at: first.created_at ?? null,
              rating: startRating,
            });
          }

          // Danach: Elo nach jedem Turnier = rating_after
          for (const h of raw) {
            if (typeof h.rating_after !== "number") continue;

            points.push({
              tournamentId:
                h.tournamentId ?? h.tournament_id ?? h.tournament ?? null,
              tournamentName:
                h.tournamentName ??
                h.tournament_name ??
                h.name ??
                "(ohne Name)",
             
              code: (h.code ?? h.tournament_code ?? h.tournamentCode ?? h.slug ?? "").toString(),
              category: h.category ?? null,
              created_at: h.created_at ?? null,
              rating: h.rating_after,
              tournament_points: h.tournament_points ?? null,
              final_rank: h.final_rank ?? null,
              super_final_rank: h.super_final_rank ?? null,
            });
          }
        }

        setEloHistory((prev) => ({
          ...prev,
          [profileId]: points,
        }));
      }
    } catch {
      setEloError((prev) => ({
        ...prev,
        [profileId]: "Netzwerkfehler beim Laden der Elo-Historie.",
      }));
      setEloHistory((prev) => ({ ...prev, [profileId]: [] }));
    } finally {
      setEloLoading((prev) => ({ ...prev, [profileId]: false }));
    }
  }

  // Stats für ein Profil laden
  async function loadStats(profileId: string) {
    setStatsLoading((prev) => ({ ...prev, [profileId]: true }));
    setStatsError((prev) => ({ ...prev, [profileId]: null }));

    try {
      const res = await fetch("/api/players/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });

      const j = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setStatsError((prev) => ({
          ...prev,
          [profileId]: j.error ?? "Konnte Stats nicht laden.",
        }));
        setStatsByProfile((prev) => ({ ...prev, [profileId]: null }));
      } else {
        console.log("players/stats response for", profileId, j);

        let payload: PlayerStats | null = null;

        if (j && typeof j === "object") {
          // Variante 1: Response ist direkt PlayerStats
          if ("matchesPlayed" in j || "tournamentsPlayed" in j) {
            payload = j as PlayerStats;
          }
          // Variante 2: Response ist { stats: PlayerStats }
          else if ("stats" in j && j.stats && typeof j.stats === "object") {
            payload = j.stats as PlayerStats;
          }
        }

        setStatsByProfile((prev) => ({
          ...prev,
          [profileId]: payload,
        }));
      }
    } catch (e: any) {
      setStatsError((prev) => ({
        ...prev,
        [profileId]:
          "Konnte Stats nicht laden: " + String(e?.message ?? e),
      }));
      setStatsByProfile((prev) => ({ ...prev, [profileId]: null }));
    } finally {
      setStatsLoading((prev) => ({ ...prev, [profileId]: false }));
    }
  }

  // 🆕 Machine-Stats für ein Profil laden
  async function loadMachineStats(profileId: string) {
    setMachineStatsLoading((prev) => ({ ...prev, [profileId]: true }));
    setMachineStatsError((prev) => ({ ...prev, [profileId]: null }));

    try {
      const res = await fetch("/api/players/machine-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMachineStatsError((prev) => ({
          ...prev,
          [profileId]: j.error ?? "Konnte Machine-Stats nicht laden.",
        }));
        setMachineStatsByProfile((prev) => ({
          ...prev,
          [profileId]: null,
        }));
      } else {
        const list = (j.machines ?? []) as MachineStat[];
        setMachineStatsByProfile((prev) => ({
          ...prev,
          [profileId]: list,
        }));
      }
    } catch (e: any) {
      setMachineStatsError((prev) => ({
        ...prev,
        [profileId]:
          "Konnte Machine-Stats nicht laden: " + String(e?.message ?? e),
      }));
      setMachineStatsByProfile((prev) => ({
        ...prev,
        [profileId]: null,
      }));
    } finally {
      setMachineStatsLoading((prev) => ({
        ...prev,
        [profileId]: false,
      }));
    }
  }

  function openRow(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    const p = profiles.find((x) => x.id === id);
    if (p) {
      ensureDraft(id, p);
      // Elo-Historie laden, sobald Spieler geöffnet wird
      loadEloHistory(id);
      // Stats laden
      loadStats(id);
      // 🆕 Machine-Stats laden
      loadMachineStats(id);
    }
    setOpenId(id);
  }

  function startNew() {
    ensureDraft("new");
    setOpenId("new");
  }

  function updateDraftField(
    key: string,
    field: keyof Draft,
    value: string | boolean
  ) {
    setDrafts((prev) => {
      const current: Draft =
        prev[key] ?? {
          name: "",
          rating: "1500",
          provisional: "10",
          resetMatchesPlayed: false,
          color: "",
          icon: "",
        };
      return {
        ...prev,
        [key]: {
          ...current,
          [field]: value as any,
        },
      };
    });
  }

  async function saveNew() {
    const draft = drafts["new"];
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Name darf nicht leer sein.");
      return;
    }

    const startRating = Number(draft.rating || 1500);
    const provisionalMatches = Number(draft.provisional || 10);

    setSavingKey("new");
    setError(null);
    try {
      const res = await fetch("/api/profiles/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startRating,
          provisionalMatches,
          color: draft.color || null,
          icon: draft.icon || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Konnte Spieler nicht anlegen");
        return;
      }
      await load();
      setOpenId(null);
      setDrafts((prev) => {
        const cp = { ...prev };
        delete cp["new"];
        return cp;
      });
    } finally {
      setSavingKey(null);
    }
  }

  async function saveExisting(id: string) {
    const draft = drafts[id];
    if (!draft) return;

    const rating = Number(draft.rating || 1500);
    const provisionalMatches = Number(draft.provisional || 10);
    const resetMatchesPlayed = draft.resetMatchesPlayed === true;

    setSavingKey(id);
    setError(null);
    try {
      const res = await fetch("/api/profiles/setRating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          rating,
          provisionalMatches,
          resetMatchesPlayed,
          color: draft.color || null,
          icon: draft.icon || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Konnte Rating nicht speichern");
        return;
      }
      await load();
      setOpenId(null);
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteProfile(id: string, name: string) {
    if (
      !confirm(
        `Profil "${name}" wirklich löschen?\nDieser Vorgang kann nicht rückgängig gemacht werden.`
      )
    ) {
      return;
    }

    setSavingKey(id);
    setError(null);

    try {
      const res = await fetch("/api/profiles/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(j.error ?? "Konnte Profil nicht löschen");
        return;
      }

      await load();
      setOpenId(null);
      setDrafts((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setEloHistory((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setEloError((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setEloLoading((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setCompareSelection((prev) => prev.filter((x) => x !== id));
      // Stats mit aufräumen
      setStatsByProfile((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setStatsError((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setStatsLoading((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      // Machine-Stats mit aufräumen
      setMachineStatsByProfile((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setMachineStatsError((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setMachineStatsLoading((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
    } finally {
      setSavingKey(null);
    }
  }

  // Vergleichs-Toggle (max. 2 Spieler)
  function toggleCompare(id: string) {
    setCompareSelection((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      // wenn neu dazu & schon 2 drin -> ältesten ersetzen
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });

    // Elo-Verlauf fürs Vergleichspanel gleich mitladen, falls noch nicht
    if (!eloHistory[id] && !eloLoading[id]) {
      loadEloHistory(id);
    }
  }

  // Vergleichspanel (wenn genau 2 Spieler ausgewählt sind)
  const comparePanel =
    compareSelection.length === 2
      ? (() => {
          const [idA, idB] = compareSelection;
          const profileA = profiles.find((p) => p.id === idA) || null;
          const profileB = profiles.find((p) => p.id === idB) || null;

          if (!profileA || !profileB) return null;

          const histA = eloHistory[idA] ?? [];
          const histB = eloHistory[idB] ?? [];

          function buildStats(profile: Profile, history: EloPoint[]) {
            const numTournaments =
              history.length > 0 ? Math.max(0, history.length - 1) : 0;
            const matches = profile.matches_played ?? 0;
            const currentElo =
              typeof profile.rating === "number" ? profile.rating : null;

            const firstRating =
              history.length > 0 ? history[0].rating : null;
            const lastRating =
              history.length > 0 ? history[history.length - 1].rating : null;

            let trendDelta: number | null = null;
            if (firstRating != null && lastRating != null) {
              trendDelta = lastRating - firstRating;
            }

            let trendLabel = "±0 Elo";
            let trendClass = "bg-neutral-100 text-neutral-600";
            if (trendDelta != null && trendDelta !== 0) {
              const abs = Math.round(Math.abs(trendDelta));
              if (trendDelta > 0) {
                trendLabel = `+${abs} Elo`;
                trendClass = "bg-emerald-50 text-emerald-700";
              } else {
                trendLabel = `-${abs} Elo`;
                trendClass = "bg-red-50 text-red-700";
              }
            }

            return {
              numTournaments,
              matches,
              currentElo,
              trendDelta,
              trendLabel,
              trendClass,
            };
          }

          const statsA = buildStats(profileA, histA);
          const statsB = buildStats(profileB, histB);

          return (
            <div className="mb-4 rounded-2xl border bg-white p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <div className="text-xs font-semibold text-neutral-700">
                    Vergleich
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Zwei Spieler ausgewählt – Elo, Trend & Turniere im
                    Direktvergleich
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setCompareSelection([])}
                >
                  Vergleich zurücksetzen
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[{ p: profileA, s: statsA }, { p: profileB, s: statsB }].map(
                  ({ p, s }, idx) => (
                    <div
                      key={p.id}
                      className="rounded-xl border bg-neutral-50/80 px-3 py-2.5 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar
                          url={(p as any).avatar_url ?? null}
                          name={p.name}
                          color={p.color}
                          icon={p.icon}
                        />
                        <div>
                          <div className="text-sm font-semibold flex items-center gap-1.5">
                            {idx === 0 ? "Spieler A:" : "Spieler B:"} {p.name}
                            {p.icon && <span>{p.icon}</span>}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            ID: <span className="font-mono">{p.id}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] mt-1">
                        <span className="flex items-baseline gap-1">
                          <span className="text-neutral-500">ELO</span>
                          <span className="font-bold tabular-nums text-neutral-900">
                            {typeof s.currentElo === "number"
                              ? Math.round(s.currentElo)
                              : "—"}
                          </span>
                        </span>

                        <span className="flex items-baseline gap-1">
                          <span className="text-neutral-500">🏆</span>
                          <span className="font-semibold tabular-nums text-neutral-900">
                            {s.numTournaments}
                          </span>{" "}
                          <span className="text-neutral-500">Turniere</span>
                        </span>

                        <span className="flex items-baseline gap-1">
                          <span className="text-neutral-500">🎮</span>
                          <span className="font-semibold tabular-nums text-neutral-900">
                            {s.matches}
                          </span>{" "}
                          <span className="text-neutral-500">Matches</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-1.5">
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-semibold " +
                            s.trendClass
                          }
                        >
                          Trend: {s.trendLabel}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })()
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Spieler (Profiles)</div>
          <div className="flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suchen…"
              className="w-40 sm:w-60"
            />
          
            <Button variant="secondary" disabled={busy} onClick={load}>
              Neu laden
            </Button>
         {isAdmin && (
            <Button disabled={busy} onClick={startNew}>
              Neuer Spieler
            </Button>
         )}
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {error ? (
          <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Vergleichspanel */}
        {comparePanel}

        <div className="space-y-2">
          {/* Neuer Spieler – Editblock */}
          {openId === "new" && (
            <div className="rounded-xl border bg-white px-4 py-3">
              <div className="text-sm font-medium mb-2">
                Neuen Spieler anlegen
              </div>

              {/* Live-Vorschau für neuen Spieler */}
              <div className="mb-3 flex items-center gap-3">
                <Avatar
                  url={null}
                  name={drafts["new"]?.name || "Neuer Spieler"}
                  color={drafts["new"]?.color || undefined}
                  icon={drafts["new"]?.icon || undefined}
                />
                <div className="text-[11px] text-neutral-500">
                  Vorschau Avatar (Name, Farbe & Emoji)
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Name
                  </label>
                  <Input
                    value={drafts["new"]?.name ?? ""}
                    onChange={(e) =>
                      updateDraftField("new", "name", e.target.value)
                    }
                    disabled={savingKey === "new"}
                    placeholder="Spielername"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Start-Elo
                  </label>
                  <Input
                    type="number"
                    value={drafts["new"]?.rating ?? "1500"}
                    onChange={(e) =>
                      updateDraftField("new", "rating", e.target.value)
                    }
                    disabled={savingKey === "new"}
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Standard: 1500 (min 800 / max 3000).
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Provisional Matches
                  </label>
                  <Input
                    type="number"
                    value={drafts["new"]?.provisional ?? "10"}
                    onChange={(e) =>
                      updateDraftField("new", "provisional", e.target.value)
                    }
                    disabled={savingKey === "new" || !isAdmin}
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Wie viele Spiele als „Einstiegsphase“ zählen.
                  </div>
                </div>
              </div>

              {/* Farbe & Icon für neuen Spieler */}
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-neutral-600">
                      Farbe
                    </label>
                    <div className="text-[11px] text-neutral-500">
                      Für Badges & Avatar
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => {
                      const active = drafts["new"]?.color === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateDraftField("new", "color", c)}
                          className={`h-6 w-6 rounded-full border ${
                            active
                              ? "ring-2 ring-offset-2 ring-neutral-900"
                              : "ring-0"
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => updateDraftField("new", "color", "")}
                      className="px-2 py-0.5 text-[11px] rounded border text-neutral-500 hover:bg-neutral-50"
                    >
                      Keine
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">
                    Emoji-Icon
                  </label>
                  <Input
                    value={drafts["new"]?.icon ?? ""}
                    onChange={(e) =>
                      updateDraftField("new", "icon", e.target.value)
                    }
                    disabled={savingKey === "new"}
                    placeholder="z.B. 🎱, 👾, ⭐"
                  />
                  <div className="mt-1 text-[11px] text-neutral-500">
                    Wird groß im Avatar angezeigt.
                  </div>
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={savingKey === "new"}
                  onClick={() => {
                    setOpenId(null);
                    setDrafts((prev) => {
                      const cp = { ...prev };
                      delete cp["new"];
                      return cp;
                    });
                  }}
                >
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  disabled={savingKey === "new"}
                  onClick={saveNew}
                >
                  Spieler anlegen
                </Button>
              </div>
            </div>
          )}

          {/* Bestehende Spieler */}
          {filtered.map((p) => {
            const isOpen = openId === p.id;
            const draft = drafts[p.id] ?? ensureDraft(p.id, p);

            const history = eloHistory[p.id] ?? [];
            const loadingElo = eloLoading[p.id] === true;
            const historyErr = eloError[p.id] ?? null;

            const stats = statsByProfile[p.id] ?? null;
            const loadingStats = statsLoading[p.id] === true;
            const statsErr = statsError[p.id] ?? null;

            const machineStatsRaw = machineStatsByProfile[p.id] ?? null;
            const loadingMachineStats =
              machineStatsLoading[p.id] === true;
            const machineStatsErr = machineStatsError[p.id] ?? null;

            const machineStatsArray: MachineStat[] = machineStatsRaw ?? [];

            const eloValues = history.map((h) => h.rating);

            // Anzahl Turniere (Start-Elo nicht mitzählen)
            const numTournaments =
              history.length > 0 ? Math.max(0, history.length - 1) : 0;
            const tournamentsPlayed = numTournaments;

            const withDelta = history.map((point, idx) => {
              const prev = idx > 0 ? history[idx - 1].rating : null;
              const delta = prev == null ? null : point.rating - prev;
              return { ...point, delta };
            });

            // Gesamt-Trend (Start -> letzter Wert)
            const firstRating =
              history.length > 0 ? history[0].rating : null;
            const lastRating =
              history.length > 0 ? history[history.length - 1].rating : null;
            let trendDelta: number | null = null;
            if (firstRating != null && lastRating != null) {
              trendDelta = lastRating - firstRating;
            }

            let trendLabel = "±0 Elo";
            let trendClass = "bg-neutral-100 text-neutral-600";
            if (trendDelta != null && trendDelta !== 0) {
              const abs = Math.round(Math.abs(trendDelta));
              if (trendDelta > 0) {
                trendLabel = `+${abs} Elo`;
                trendClass = "bg-emerald-50 text-emerald-700";
              } else {
                trendLabel = `-${abs} Elo`;
                trendClass = "bg-red-50 text-red-700";
              }
            }

            // Peak-Elo / Tiefster Elo
            const peakPoint =
              history.length > 0
                ? history.reduce(
                    (best, cur) => (cur.rating > best.rating ? cur : best),
                    history[0]
                  )
                : null;

            const lowestPoint =
              history.length > 0
                ? history.reduce(
                    (best, cur) => (cur.rating < best.rating ? cur : best),
                    history[0]
                  )
                : null;

            // Bestes / schlechtestes Turnier (nur echte Turniere, nicht Start-Elo)
            const tournamentRows = withDelta.slice(1); // Index 0 = Start-Elo
            let bestRow: any | null = null;
            let worstRow: any | null = null;

            for (const pt of tournamentRows) {
              if (typeof pt.delta !== "number") continue;
              if (pt.delta > 0) {
                if (!bestRow || pt.delta > bestRow.delta) {
                  bestRow = pt;
                }
              }
              if (pt.delta < 0) {
                if (!worstRow || pt.delta < worstRow.delta) {
                  worstRow = pt;
                }
              }
            }

            // Achievements / Meilensteine
            const achievements: Achievement[] = [];
            const matchesPlayed = p.matches_played ?? 0;

            if (trendDelta != null && Math.abs(trendDelta) >= 100) {
              const sign = trendDelta > 0 ? "+" : "";
              achievements.push({
                label: `${sign}${Math.round(trendDelta)} Elo seit Start`,
                icon: trendDelta > 0 ? "📈" : "📉",
              });
            }

            if (matchesPlayed >= 100) {
              achievements.push({
                label: `${matchesPlayed} Matches gespielt`,
                icon: "🎮",
              });
            } else if (matchesPlayed >= 50) {
              achievements.push({
                label: `50+ Matches Erfahrung`,
                icon: "🎮",
              });
            }

            let currentStreak = 0;
            for (let i = tournamentRows.length - 1; i >= 0; i--) {
              const d = tournamentRows[i].delta;
              if (typeof d === "number" && d > 0) {
                currentStreak++;
              } else {
                break;
              }
            }
            if (currentStreak >= 3) {
              achievements.push({
                label: `${currentStreak} Turniere in Folge Elo gewonnen`,
                icon: "🔥",
              });
            }

            const isCompared = compareSelection.includes(p.id);

            // abgeleitete Stats für Matches-Block
            let matchWinRatePercent: number | null = null;
            let avgPlacement: number | null = null;
            let p1 = 0,
              p2 = 0,
              p3 = 0,
              p4 = 0;

            // abgeleitete Stats für Turnier-Block
            let tp1 = 0,
              tp2 = 0,
              tp3 = 0,
              tp4 = 0;
            let tAvgPlacement: number | null = null;
            let tWinRatePercent: number | null = null;

            // abgeleitete Stats für Super-Finale-Block
            let fp1 = 0,
              fp2 = 0,
              fp3 = 0,
              fp4 = 0;
            let fAvgPlacement: number | null = null;
            let fWinRatePercent: number | null = null;
            let finalsPlayed = 0;

            if (stats) {
              // Matches
              p1 = stats.placements?.["1"] ?? 0;
              p2 = stats.placements?.["2"] ?? 0;
              p3 = stats.placements?.["3"] ?? 0;
              p4 = stats.placements?.["4"] ?? 0;

              const denom = p1 + p2 + p3 + p4;
              if (denom > 0) {
                avgPlacement = (1 * p1 + 2 * p2 + 3 * p3 + 4 * p4) / denom;
              }

              if (stats.matchWinRate != null) {
                matchWinRatePercent =
                  Math.round(stats.matchWinRate * 1000) / 10; // eine Nachkommastelle
              }

              // Turniere
              tp1 = stats.tournamentPlacements?.["1"] ?? 0;
              tp2 = stats.tournamentPlacements?.["2"] ?? 0;
              tp3 = stats.tournamentPlacements?.["3"] ?? 0;
              tp4 = stats.tournamentPlacements?.["4"] ?? 0;

              tAvgPlacement = stats.tournamentAvgPlacement ?? null;

              if (stats.tournamentWinRate != null) {
                tWinRatePercent =
                  Math.round(stats.tournamentWinRate * 1000) / 10;
              }

              // Super-Finale
              finalsPlayed = stats.finalsPlayed ?? 0;

              fp1 = stats.finalsPlacements?.["1"] ?? 0;
              fp2 = stats.finalsPlacements?.["2"] ?? 0;
              fp3 = stats.finalsPlacements?.["3"] ?? 0;
              fp4 = stats.finalsPlacements?.["4"] ?? 0;

              fAvgPlacement = stats.finalsAvgPlacement ?? null;

              if (stats.finalsWinRate != null) {
                fWinRatePercent =
                  Math.round(stats.finalsWinRate * 1000) / 10;
              }
            }

            // 🆕 Top-Maschinen (aus Machine-Stats)
            const topMachinesByMatches: MachineStat[] = [...machineStatsArray]
              .sort((a, b) => {
                const ma = a.matchesPlayed ?? 0;
                const mb = b.matchesPlayed ?? 0;
                if (mb !== ma) return mb - ma; // mehr Matches zuerst
                const wa = a.winRate ?? 0;
                const wb = b.winRate ?? 0;
                if (wb !== wa) return wb - wa; // höhere Winrate zuerst
                const apa = a.avgPosition ?? Number.POSITIVE_INFINITY;
                const apb = b.avgPosition ?? Number.POSITIVE_INFINITY;
                return apa - apb; // niedrigere Ø-Pos zuerst
              })
              .slice(0, 3);

            const topMachinesByAvgPos: MachineStat[] = [...machineStatsArray]
              .filter(
                (m) =>
                  m.matchesPlayed > 0 &&
                  m.avgPosition != null &&
                  Number.isFinite(m.avgPosition as number)
              )
              .sort((a, b) => {
                const apa = a.avgPosition ?? Number.POSITIVE_INFINITY;
                const apb = b.avgPosition ?? Number.POSITIVE_INFINITY;
                if (apa !== apb) return apa - apb; // bessere Ø-Pos
                const ma = a.matchesPlayed ?? 0;
                const mb = b.matchesPlayed ?? 0;
                if (mb !== ma) return mb - ma; // mehr Matches
                const wa = a.winRate ?? 0;
                const wb = b.winRate ?? 0;
                return wb - wa; // höhere Winrate
              })
              .slice(0, 3);

            const currentDetailTab = detailTabs[p.id] ?? "stats";

// 🆕 Vollständige Maschinenliste: nach Winrate absteigend sortiert (nur Anzeige)
// Hinweis: winRate ist hier ein Wert von 0..1 (wird unten als % formatiert).
// Null/undefined behandeln wir als 0, damit diese Einträge am Ende landen.
const machineStatsSortedByWinrate: MachineStat[] = [...machineStatsArray]
  .sort((a, b) => {
    const wa = typeof a.winRate === "number" ? a.winRate : 0;
    const wb = typeof b.winRate === "number" ? b.winRate : 0;

    // 1) Primär: Winrate absteigend
    if (wb !== wa) return wb - wa;

    // 2) Tie-Breaker: mehr Matches zuerst
    const ma = a.matchesPlayed ?? 0;
    const mb = b.matchesPlayed ?? 0;
    if (mb !== ma) return mb - ma;

    // 3) Tie-Breaker: bessere Ø-Platzierung zuerst (niedriger ist besser)
    const apa = a.avgPosition ?? Number.POSITIVE_INFINITY;
    const apb = b.avgPosition ?? Number.POSITIVE_INFINITY;
    return apa - apb;
  });


            return (
              <div
                key={p.id}
                className="rounded-xl border bg-white overflow-hidden"
              >
                {/* Kopfzeile */}
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-50"
                  onClick={() => openRow(p.id)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      url={(p as any).avatar_url ?? null}
                      name={p.name}
                      color={p.color}
                      icon={p.icon}
                    />
                    <div>
                      <div className="text-base font-medium flex items-center gap-2">
                        {p.name} • <span className="text-sm text-amber-600">
                          <span>
                            {Number(p.total_tournament_points)} TP <span className="text-xs text-amber-600">(Turnierpunkte)</span>
                          </span>
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {/*ID: <span className="font-mono">{p.id}</span>*/}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end text-right leading-tight gap-1.5">
                    {/* Zeile 1: ELO */}
                    {typeof p.rating === "number" ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-xs font-medium text-amber-600">
                          ELO
                        </span>
                        <span className="text-lg font-bold tabular-nums text-amber-600">
                          {Math.round(p.rating)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-neutral-400">
                        kein Elo
                      </span>
                    )}

                    {/* Zeile 2: Matches / provisional */}
                    <div className="text-[13px] text-neutral-700 font-medium">
                      🎮{" "}
                      <span className="tabular-nums font-semibold text-neutral-900">
                        {p.matches_played ?? 0}
                      </span>{" "}
                      Elo Matches <span className="text-neutral-400">•</span>{" "}
                      ⏳{" "}
                      <span className="tabular-nums font-semibold text-neutral-900">
                        {p.provisional_matches ?? 0}
                      </span>{" "}
                      provisional{" "}
                    </div>

                    {/* Zeile 3: Vergleich-Toggle + Details */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompare(p.id);
                        }}
                        className={
                          "rounded-full border px-2 py-[2px] text-[11px] font-medium " +
                          (isCompared
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50")
                        }
                      >
                        {isCompared ? "Im Vergleich" : "Vergleichen"}
                      </button>
                      <span className="text-[12px] text-neutral-600 underline underline-offset-2">
                        {isOpen ? "Details schließen ▲" : "Details öffnen ▼"}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Detailbereich mit Tabs */}
                {isOpen && (
                  <div className="border-t bg-neutral-50/70 px-4 py-3 space-y-3">
                    {/* Tab-Navigation */}
                    <div className="flex gap-2 text-xs mb-1">
                      <button
                        type="button"
                        onClick={() =>
                          setDetailTabs((prev) => ({
                            ...prev,
                            [p.id]: "stats",
                          }))
                        }
                        className={`px-3 py-1 rounded-full border ${
                          currentDetailTab === "stats"
                            ? "bg-white shadow-sm font-semibold"
                            : "bg-transparent text-neutral-500"
                        }`}
                      >
                        Statistiken
                      </button>
                      {/*{isAdmin && ( */}
                      <button
                        type="button"
                        onClick={() =>
                          setDetailTabs((prev) => ({
                            ...prev,
                            [p.id]: "edit",
                          }))
                        }
                        className={`px-3 py-1 rounded-full border ${
                          currentDetailTab === "edit"
                            ? "bg-white shadow-sm font-semibold"
                            : "bg-transparent text-neutral-500"
                        }`}
                      >
                        Profil bearbeiten
                      </button>
                      {/*})}*/}
                    </div>

                    {/* Tab: EDIT */}
                    {currentDetailTab === "edit" && (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              Elo-Rating
                            </label>
                            <Input
                              type="number"
                              value={draft.rating}
                              onChange={(e) =>
                                updateDraftField(
                                  p.id,
                                  "rating",
                                  e.target.value
                                )
                              }
                              disabled={savingKey === p.id || !isAdmin}
                            />
                            <div className="mt-1 text-[11px] text-neutral-500">
                              Kann nur geändert werden, bevor das Profil erste
                              Matches gespielt hat.
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              Provisional Matches
                            </label>
                            <Input
                              type="number"
                              value={draft.provisional}
                              onChange={(e) =>
                                updateDraftField(
                                  p.id,
                                  "provisional",
                                  e.target.value
                                )
                              }
                              disabled={savingKey === p.id || !isAdmin}
                            />
                            <div className="mt-1 text-[11px] text-neutral-500">
                              0–50, wie viele Spiele als „Einstiegsphase“
                              zählen.
                            </div>
                          </div>
                          <label className="mt-1 flex items-start gap-2 text-xs text-neutral-700">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={draft.resetMatchesPlayed}
                              onChange={(e) =>
                                updateDraftField(
                                  p.id,
                                  "resetMatchesPlayed",
                                  e.target.checked
                                )
                              }
                              disabled={savingKey === p.id || !isAdmin}
                            />
                            <span>
                              Matches gespielt auf 0 zurücksetzen
                              <br />
                              <span className="text-[11px] text-neutral-500">
                                Praktisch z.B. wenn ein Profil neu gestartet
                                werden soll.
                              </span>
                            </span>
                          </label>
                        </div>

                        {/* Farbe & Icon Edit */}
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-medium text-neutral-600">
                                Farbe
                              </label>
                              <div className="text-[11px] text-neutral-500">
                                Für Badges & Avatar
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {COLOR_OPTIONS.map((c) => {
                                const active = draft.color === c;
                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() =>
                                      updateDraftField(p.id, "color", c)
                                    }
                                    className={`h-6 w-6 rounded-full border ${
                                      active
                                        ? "ring-2 ring-offset-2 ring-neutral-900"
                                        : "ring-0"
                                    }`}
                                    style={{ backgroundColor: c }}
                                    disabled={savingKey === p.id}
                                  />
                                );
                              })}
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraftField(p.id, "color", "")
                                }
                                className="px-2 py-0.5 text-[11px] rounded border text-neutral-500 hover:bg-neutral-50"
                                disabled={savingKey === p.id}
                              >
                                Keine
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              Emoji-Icon
                            </label>
                            <Input
                              value={draft.icon}
                              onChange={(e) =>
                                updateDraftField(
                                  p.id,
                                  "icon",
                                  e.target.value
                                )
                              }
                              disabled={savingKey === p.id}
                              placeholder="z.B. 🎱, 👾, ⭐"
                            />
                            <div className="mt-1 text-[11px] text-neutral-500">
                              Wird groß im Avatar angezeigt.
                            </div>
                          </div>
                        </div>
                     
                        {/* Aktionen: Löschen / Abbrechen / Speichern */}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            disabled={savingKey === p.id || !isAdmin}
                            onClick={() => deleteProfile(p.id, p.name)}
                          >
                            Löschen
                          </Button>
                       

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={savingKey === p.id}
                              onClick={() => {
                                setOpenId(null);
                                setDrafts((prev) => {
                                  const cp = { ...prev };
                                  delete cp[p.id];
                                  return cp;
                                });
                              }}
                            >
                              Abbrechen
                            </Button>
                            <Button
                              size="sm"
                              disabled={savingKey === p.id}
                              onClick={() => saveExisting(p.id)}
                            >
                              Speichern
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab: STATISTIKEN */}
                    {currentDetailTab === "stats" && (
                      <div className="space-y-3">
                        {/* Performance-Blöcke: Matches, Turniere, Super-Finale */}
                        <div className="grid gap-3 sm:grid-cols-3 mt-2">
                          {/* Matches-Block */}
                          <div className="rounded-xl border bg-white p-3 text-sm text-neutral-700">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold flex items-center gap-1">
                                🎮 Matches
                              </span>
                              <span className="text-sm font-bold tabular-nums text-neutral-900">
                                {stats?.matchesPlayed ??
                                  p.matches_played ??
                                  0}
                              </span>
                            </div>

                            {loadingStats ? (
                              <div className="text-[11px] text-neutral-500">
                                Lade Stats…
                              </div>
                            ) : statsErr ? (
                              <div className="text-[11px] text-red-600">
                                {statsErr}
                              </div>
                            ) : stats ? (
                              <div className="text-[13px] text-neutral-600 space-y-0.5">
                                <div>
                                  {p1}× Platz 1 · {p2}× Platz 2 · {p3}× Platz
                                  3 · {p4}× Platz 4
                                </div>
                                <div>
                                  Ø-Platz{" "}
                                  <span className="tabular-nums font-semibold">
                                    {avgPlacement != null
                                      ? avgPlacement
                                          .toFixed(2)
                                          .replace(".", ",")
                                      : "–"}
                                  </span>{" "}
                                  · Winrate{" "}
                                  <span
                                    className={
                                      "tabular-nums font-semibold " +
                                      (matchWinRatePercent == null
                                        ? "text-neutral-500"
                                        : matchWinRatePercent > 50
                                        ? "text-emerald-600"
                                        : matchWinRatePercent < 50
                                        ? "text-red-600"
                                        : "text-neutral-700")
                                    }
                                  >
                                    {matchWinRatePercent != null
                                      ? `${matchWinRatePercent
                                          .toFixed(1)
                                          .replace(".", ",")}%`
                                      : "–"}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[13px] text-neutral-500">
                                Platzierungen & Winrate kommen hier rein, sobald
                                wir die Stats aus dem Backend haben. 🙂
                              </div>
                            )}
                          </div>

                          {/* Turniere-Block */}
                          <div className="rounded-xl border bg-white p-3 text-sm text-neutral-700">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold flex items-center gap-1">
                                🏆 Turniere
                              </span>
                              <span className="text-sm font-bold tabular-nums text-neutral-900">
                                {stats?.tournamentsPlayed ?? numTournaments}
                              </span>
                            </div>

                            {loadingStats ? (
                              <div className="text-[11px] text-neutral-500">
                                Lade Stats…
                              </div>
                            ) : statsErr ? (
                              <div className="text-[11px] text-red-600">
                                {statsErr}
                              </div>
                            ) : stats ? (
                              <div className="text-[13px] text-neutral-600 space-y-0.5">
                                <div>
                                  {tp1}× Platz 1 · {tp2}× Platz 2 · {tp3}×
                                  Platz 3 · {tp4}× Platz 4
                                </div>
                                <div>
                                  Ø-Platz{" "}
                                  <span className="tabular-nums font-semibold">
                                    {tAvgPlacement != null
                                      ? tAvgPlacement
                                          .toFixed(2)
                                          .replace(".", ",")
                                      : "–"}
                                  </span>{" "}
                                  · Winrate{" "}
                                  <span
                                    className={
                                      "tabular-nums font-semibold " +
                                      (tWinRatePercent == null
                                        ? "text-neutral-500"
                                        : tWinRatePercent > 50
                                        ? "text-emerald-600"
                                        : tWinRatePercent < 50
                                        ? "text-red-600"
                                        : "text-neutral-700")
                                    }
                                  >
                                    {tWinRatePercent != null
                                      ? `${tWinRatePercent
                                          .toFixed(1)
                                          .replace(".", ",")}%`
                                      : "–"}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[13px] text-neutral-500">
                                Turnier-Platzierungen (Platz 1 / 2 / 3 / 4) und
                                Turnier-Winrate werden aus den Matchdaten
                                berechnet, sobald Stats verfügbar sind.
                              </div>
                            )}
                          </div>

                          {/* Super-Finale-Block */}
                          <div className="rounded-xl border bg-white p-3 text-sm text-neutral-700">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold flex items-center gap-1">
                                👑 Super Finale
                              </span>
                              <span className="text-sm font-bold tabular-nums text-neutral-900">
                                {stats ? finalsPlayed : 0}
                              </span>
                            </div>

                            {loadingStats ? (
                              <div className="text-[11px] text-neutral-500">
                                Lade Stats…
                              </div>
                            ) : statsErr ? (
                              <div className="text-[11px] text-red-600">
                                {statsErr}
                              </div>
                            ) : stats && finalsPlayed > 0 ? (
                              <div className="text-[13px] text-neutral-600 space-y-0.5">
                                <div>
                                  {fp1}× Platz 1 · {fp2}× Platz 2 · {fp3}×
                                  Platz 3 · {fp4}× Platz 4
                                </div>
                                <div>
                                  Ø-Platz{" "}
                                  <span className="tabular-nums font-semibold">
                                    {fAvgPlacement != null
                                      ? fAvgPlacement
                                          .toFixed(2)
                                          .replace(".", ",")
                                      : "–"}
                                  </span>{" "}
                                  · Winrate{" "}
                                  <span
                                    className={
                                      "tabular-nums font-semibold " +
                                      (fWinRatePercent == null
                                        ? "text-neutral-500"
                                        : fWinRatePercent > 50
                                        ? "text-emerald-600"
                                        : fWinRatePercent < 50
                                        ? "text-red-600"
                                        : "text-neutral-700")
                                    }
                                  >
                                    {fWinRatePercent != null
                                      ? `${fWinRatePercent
                                          .toFixed(1)
                                          .replace(".", ",")}%`
                                      : "–"}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-neutral-500">
                                Noch keine Super-Finalteilnahme für dieses
                                Profil – erst in die Top-Ränge spielen. 💥
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 🏙️ Location & Maschinen-Stats mit Top-3 Übersicht */}
                        <div className="mt-2 rounded-xl border bg-white p-3 text-sm text-neutral-700">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold flex items-center gap-1">
                              🏙️ Location & Maschinen
                            </span>
                          </div>

                          {loadingMachineStats ? (
                            <div className="text-[13px] text-neutral-500">
                              Lade Machine-Stats…
                            </div>
                          ) : machineStatsErr ? (
                            <div className="text-[13px] text-red-600">
                              {machineStatsErr}
                            </div>
                          ) : machineStatsArray.length === 0 ? (
                            <div className="text-[13px] text-neutral-500">
                              Noch keine Daten zu Maschinen – erst ein paar
                              Matches spielen. 🙂
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {/* Top-3 Übersicht */}
                              <div className="grid gap-3 sm:grid-cols-2">
                                {/* Meist gespielt */}
                                <div>
                                  <div className="text-[13px] font-semibold text-neutral-600 mb-1">
                                    Meist gespielt (Top 3)
                                  </div>
                                  {topMachinesByMatches.length === 0 ? (
                                    <div className="text-[13px] text-neutral-500">
                                      Keine Maschinen-Daten.
                                    </div>
                                  ) : (
                                    <ul className="space-y-0.5 text-[12px] text-neutral-700">
                                      {topMachinesByMatches.map((m) => {
                                        const winRatePercent =
                                          m.winRate != null
                                            ? (Math.round(
                                                m.winRate * 1000
                                              ) / 10)
                                                .toFixed(1)
                                                .replace(".", ",")
                                            : null;
                                        return (
                                          <li
                                            key={`top-matches-${m.locationId ?? m.locationName}-${m.machineId ?? m.machineName}`}
                                            className="flex justify-between gap-2"
                                          >
                                            <span className="truncate">
                                              <span className="font-medium">
                                                {m.machineName ?? "Maschine"}
                                              </span>
                                              {m.locationName && (
                                                <span className="text-neutral-500">
                                                  {" "}
                                                  ({m.locationName})
                                                </span>
                                              )}
                                            </span>
                                            <span className="text-right text-[13px] tabular-nums">
                                              {m.matchesPlayed} Matches
                                              {winRatePercent != null && (
                                                <>
                                                  {" "}
                                                  ·{" "}
                                                  <span>
                                                    {winRatePercent}%
                                                  </span>
                                                </>
                                              )}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>

                                {/* Beste Ø-Platzierung */}
                                <div>
                                  <div className="text-[13px] font-semibold text-neutral-600 mb-1">
                                    Beste Ø-Platzierung (Top 3)
                                  </div>
                                  {topMachinesByAvgPos.length === 0 ? (
                                    <div className="text-[13px] text-neutral-500">
                                      Noch keine Platzierungs-Daten.
                                    </div>
                                  ) : (
                                    <ul className="space-y-0.5 text-[12px] text-neutral-700">
                                      {topMachinesByAvgPos.map((m) => {
                                        const winRatePercent =
                                          m.winRate != null
                                            ? (Math.round(
                                                m.winRate * 1000
                                              ) / 10)
                                                .toFixed(1)
                                                .replace(".", ",")
                                            : null;
                                        const avgPos =
                                          m.avgPosition != null
                                            ? m.avgPosition
                                                .toFixed(2)
                                                .replace(".", ",")
                                            : null;
                                        return (
                                          <li
                                            key={`top-avg-${m.locationId ?? m.locationName}-${m.machineId ?? m.machineName}`}
                                            className="flex justify-between gap-2"
                                          >
                                            <span className="truncate">
                                              <span className="font-medium">
                                                {m.machineName ?? "Maschine"}
                                              </span>
                                              {m.locationName && (
                                                <span className="text-neutral-500">
                                                  {" "}
                                                  ({m.locationName})
                                                </span>
                                              )}
                                            </span>
                                            <span className="text-right text-[13px]">
                                              {avgPos != null && (
                                                <span className="tabular-nums font-semibold">
                                                  Ø {avgPos}
                                                </span>
                                              )}
                                              {winRatePercent != null && (
                                                <span className="tabular-nums text-neutral-600">
                                                  {" "}
                                                  · {winRatePercent}%
                                                </span>
                                              )}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              </div>

                              {/* Vollständige Maschinenliste */}
                              <div className="pt-2 border-t border-neutral-100 mt-2"> {/*Scrollbar*/}
                                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                    {machineStatsSortedByWinrate.map((m, idx) => {
                                      const winRatePercent =
                                        m.winRate != null
                                          ? (Math.round(m.winRate * 1000) / 10)
                                              .toFixed(1)
                                              .replace(".", ",")
                                          : null;
                                      const avgPos =
                                        m.avgPosition != null
                                          ? m.avgPosition
                                              .toFixed(2)
                                              .replace(".", ",")
                                          : null;

                                      return (
                                        <div
                                          key={`${m.locationId ?? "loc"}-${
                                            m.machineId ?? m.machineName ?? idx
                                          }`}
                                          className="flex items-center justify-between rounded-lg bg-neutral-50 px-2 py-1.5"
                                        >
                                          <div className="min-w-0">
                                            <div className="truncate text-[13px] font-semibold">
                                              {m.machineName ?? "Maschine"}
                                            </div>
                                            <div className="truncate text-[13px] text-neutral-500">
                                              {m.locationName ??
                                                "Unbekannte Location"}
                                            </div>
                                          </div>
                                          <div className="text-right text-[13px]">
                                            <div className="tabular-nums">
                                              {m.matchesPlayed} Matches
                                            </div>
                                            <div className="tabular-nums text-neutral-600">
                                              {winRatePercent != null
                                                ? `Winrate ${winRatePercent}%`
                                                : "Winrate –"}
                                              {" · "}
                                              {avgPos != null
                                                ? `Ø-Platz ${avgPos}`
                                                : "Ø-Platz –"}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Elo-Verlauf + Trend / Bestes / Schlechtestes Turnier */}
                        <div className="mt-1">
                          <div className="text-sm font-semibold text-neutral-700 mb-1 text-center">
                            Elo-Verlauf über abgeschlossene Turniere
                          </div>

                          {/* Achievements / Meilensteine (oben) */}
                          {achievements.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {achievements.map((a, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-[3px] text-[11px] font-medium text-indigo-700"
                                >
                                  {a.icon} {a.label}
                                </span>
                              ))}
                            </div>
                          )}

                          {loadingElo ? (
                            <div className="text-xs text-neutral-500">
                              Lade Elo-Historie…
                            </div>
                          ) : historyErr ? (
                            <div className="text-xs text-red-600">
                              {historyErr}
                            </div>
                          ) : history.length === 0 ? (
                            <div className="text-xs text-neutral-500">
                              Für dieses Profil gibt es noch keine Elo-Historie
                              (keine abgeschlossenen Turniere mit Elo).
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {/* Überblick-Card mit Graph + Peak/Tiefster */}
                              <div className="rounded-xl border bg-white p-3">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-neutral-700">
                                      Überblick
                                    </span>
                                    <span className="text-[15px] text-neutral-500">
                                      {numTournaments} Turnier
                                      {numTournaments === 1 ? "" : "e"}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <span
                                      className={
                                        "inline-flex items-center rounded-full px-2 py-[2px] text-[15px] font-semibold " +
                                        trendClass
                                      }
                                    >
                                      Trend: {trendLabel}
                                    </span>
                                    {lastRating != null && (
                                      <span className="text-[15px] text-neutral-500">
                                        Aktuell:{" "}
                                        <span className="font-semibold tabular-nums">
                                          {Math.round(lastRating)}
                                        </span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Graph */}
                                <div className="h-24 flex items-center">
                                  <Sparkline values={eloValues} />
                                </div>

                                {/* Achievements-Leiste direkt unter dem Graph */}
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {achievements.length > 0 ? (
                                    achievements.map((a, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-flex items-center rounded-full bg-amber-50 px-2 py-[2px] text-[10px] font-medium text-amber-700"
                                      >
                                        {a.icon} {a.label}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-[2px] text-[10px] font-medium text-neutral-500">
                                      Noch keine Meilensteine – mehr Turniere
                                      spielen! 💪
                                    </span>
                                  )}
                                </div>

                                {/* Peak-Elo / Tiefster Elo */}
                                <div className="mt-3 flex items-center justify-between text-xs text-neutral-700">
                                  <div>
                                    <div className="font-semibold">
                                      Peak-Elo
                                    </div>
                                    <div className="text-base font-semibold tabular-nums text-neutral-900">
                                      {peakPoint
                                        ? Math.round(peakPoint.rating)
                                        : "–"}
                                    </div>
                                    {peakPoint && peakPoint.tournamentId && (
                                      <div className="text-[11px] text-neutral-500 truncate max-w-[180px]">
                                        {peakPoint.tournamentName || "Turnier"}
                                        {peakPoint.created_at
                                          ? ` • ${new Date(
                                              peakPoint.created_at
                                            ).toLocaleDateString("de-DE")}`
                                          : ""}
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-right">
                                    <div className="font-semibold">
                                      Tiefster Elo
                                    </div>
                                    <div className="text-base font-semibold tabular-nums text-neutral-900">
                                      {lowestPoint
                                        ? Math.round(lowestPoint.rating)
                                        : "–"}
                                    </div>
                                    {lowestPoint && (
                                      <div className="text-[11px] text-neutral-500 truncate max-w-[180px]">
                                        {lowestPoint.tournamentId === null
                                          ? "Start-Elo"
                                          : lowestPoint.tournamentName ||
                                            "Turnier"}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Liste pro Turnier */}
                              <div className="rounded-xl border bg-white p-3">
                                <div className="mb-1 text-sm font-semibold text-neutral-700">
                                  Turniererfolge <span className="text-neutral-500 text-xs ">(Turnierpunke, Turnierplatzierung, Super-Finale Platzierung, Elo)</span>
                                </div>
<div className="space-y-1 max-h-40 overflow-y-auto pr-1">
  {withDelta
    .slice()
    .reverse()
    .map((pt, idx) => {
      const dateLabel = pt.created_at
        ? new Date(pt.created_at).toLocaleDateString("de-DE")
        : "";

      const delta = pt.delta as number | null;
      const hasDelta = typeof delta === "number";
      const deltaAbs = hasDelta ? Math.abs(delta) : 0;
      const deltaAbsRounded = Math.round(deltaAbs);
      const deltaSign =
        !hasDelta || delta === 0 ? "±" : delta > 0 ? "+" : "−";
      const deltaClass =
        !hasDelta || delta === 0
          ? "text-neutral-500"
          : delta > 0
          ? "text-emerald-600"
          : "text-red-600";

      // ✅ Start-Elo nach reverse richtig erkennen
      const isStartRow = pt.tournamentId == null;

      const isBest =
        !isStartRow && bestRow && pt.tournamentId === bestRow.tournamentId;
      const isWorst =
        !isStartRow && worstRow && pt.tournamentId === worstRow.tournamentId;

      return (
        <div
          key={`${pt.tournamentId ?? "start"}-${pt.created_at ?? idx}`}
          className="group relative flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2 py-1.5"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium flex items-center gap-2">

{!isStartRow && String(pt.code ?? "").trim() !== "" && (
  <button
    type="button"
    title="Turnier öffnen"
    className="opacity-60 hover:opacity-100 transition"
    onClick={() => {
      const c = String(pt.code ?? "").trim();
      if (c) openByCode(c);
    }}
  

  >
    ⤴️
  </button>
)}

              {isStartRow ? "Start-Elo" : pt.tournamentName}
              {!isStartRow && isBest && (
                <span className="rounded-full bg-emerald-100 px-2 py-[1px] text-[11px] font-semibold text-emerald-700">
                  Bestes Turnier
                </span>
              )}
              {!isStartRow && isWorst && (
                <span className="rounded-full bg-red-100 px-2 py-[1px] text-[11px] font-semibold text-red-700">
                  Größter Drop
                </span>
              )}
            </div>

            <div className="text-[13px] text-neutral-500">
              {isStartRow ? (
                <>Startwert</>
              ) : (
                <>
                  {/*Kategorie: */}
                  {pt.category ?? "—"}
                  {dateLabel ? ` • ${dateLabel}` : ""}
                </>
              )}
            </div>
          {!isStartRow && (
            <div className="mt-1 flex flex-wrap gap-2">
              {pt.tournament_points != null && (
                <span className="rounded-full bg-amber-50 px-2 py-[1px] text-[11px] font-semibold text-amber-900 border">
                  + {' '}{pt.tournament_points} TP
                </span>
              )}

              {pt.final_rank != null && (
                <span className="rounded-full bg-blue-50 text-blue-900 px-2 py-[1px] text-[12px] font-semibold border">
                  Platz {pt.final_rank}
                </span>
              )}

              {pt.super_final_rank != null && (
                <span className="rounded-full bg-blue-50 text-blue-900 px-2 py-[1px] text-[12px] font-semibold border">
                  SF Platz {pt.super_final_rank}
                </span>
              )}
            </div>
          )}            


            
          </div>



          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums">
              {Math.round(pt.rating)}
            </div>
            {!isStartRow && hasDelta && (
              <div className={"text-[13px] tabular-nums " + deltaClass}>
                {deltaSign}
                {deltaAbsRounded}
              </div>
            )}
          </div>
        </div>
      );
    })}
</div>

                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && openId !== "new" && (
            <div className="text-sm text-neutral-500">
              Keine Spieler gefunden.
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
