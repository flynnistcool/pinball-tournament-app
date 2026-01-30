// @ts-nocheck
"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";



// ---- safeText: verhindert React-Crash wenn versehentlich ein Object/Date gerendert wird
const safeText = (v: any): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toLocaleString("de-DE");
  try {
    // Falls es ein Objekt ist (auch leeres {}), nicht direkt rendern
    if (typeof v === "object") return JSON.stringify(v);
  } catch {}
  return String(v);
};



// ---- Minimaler Markdown-Renderer (ohne externe Libs)
// Unterstützt: Überschriften (#/##/###), Listen (-/* und 1.), Links [text](url), **fett**, *kursiv*, > Zitate
const mdParseInline = (s: string) => {
  const out: any[] = [];
  const re = /\[([^\]]+)\]\(([^\)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] && m[2]) {
      const label = m[1];
      const href = m[2];
      out.push(
        <a
          key={`a-${m.index}-${href}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
        >
          {label}
        </a>
      );
    } else if (m[3]) {
      out.push(<strong key={`b-${m.index}`}>{m[3]}</strong>);
    } else if (m[4]) {
      out.push(<em key={`i-${m.index}`}>{m[4]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
};

const mdRender = (mdRaw: string) => {
  const md = String(mdRaw ?? "").replace(/\r\n/g, "\n");
  const lines = md.split("\n");
  const blocks: any[] = [];

  let i = 0;
  const pushParagraph = (paraLines: string[]) => {
    const t = paraLines.join(" ").trim();
    if (!t) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-relaxed text-neutral-800 whitespace-pre-wrap">
        {mdParseInline(t)}
      </p>
    );
  };

  while (i < lines.length) {
    const line = lines[i];

    // Leerzeile → Absatz flush
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Headings
    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="text-sm font-semibold text-neutral-900 mt-2">
          {mdParseInline(h3[1].trim())}
        </h3>
      );
      i++;
      continue;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="text-base font-semibold text-neutral-900 mt-2">
          {mdParseInline(h2[1].trim())}
        </h2>
      );
      i++;
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="text-lg font-semibold text-neutral-900 mt-2">
          {mdParseInline(h1[1].trim())}
        </h1>
      );
      i++;
      continue;
    }

    // Blockquote (mehrere Zeilen)
    if (line.trim().startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        q.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      const qt = q.join("\n").trim();
      blocks.push(
        <div key={`q-${blocks.length}`} className="border-l-4 border-neutral-200 pl-3 py-1 text-sm text-neutral-700 bg-neutral-50 rounded-md">
          {qt.split("\n").map((l, idx2) => (
            <div key={idx2}>{mdParseInline(l)}</div>
          ))}
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 text-sm text-neutral-800 space-y-1">
          {items.map((it, idx2) => (
            <li key={idx2}>{mdParseInline(it.trim())}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal pl-5 text-sm text-neutral-800 space-y-1">
          {items.map((it, idx2) => (
            <li key={idx2}>{mdParseInline(it.trim())}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Absatz sammeln bis Leerzeile oder Blockstart
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^###\s+/.test(lines[i]) &&
      !/^##\s+/.test(lines[i]) &&
      !/^#\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith(">") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    pushParagraph(para);
  }

  if (blocks.length === 0) {
    return <div className="text-sm text-neutral-500">Keine Infos vorhanden.</div>;
  }

  return <div className="space-y-2">{blocks}</div>;
};


/*
type PlayersTabProps = {
  isAdmin: boolean;
};
*/

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, Input, Select } from "@/components/ui";
import { EloSparkline } from "@/components/charts";
import { joinTournamentByCode } from "@/lib/joinTournament";
import {Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from "recharts";
const ACTION_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#64748b",
];



const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#64748b"];

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
  info?: string | null;
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
  // 🆕 Sparkline: cumulative Winrate (0–1) über die Zeit (Maschine+Location)
  winRateSeries?: number[];
};

type PlayerMachineBest = {
  machineId: string;
  machineName: string;
  machineIconEmoji?: string | null;
  // "global" ist hier pro (Location + Maschine)
  locationId?: string | null;
  locationName?: string | null;
  bestScore: number;
  isGlobalHighscore: boolean;
  // 🆕 Platzierung global innerhalb der Location für diese Maschine (Dense Rank)
  globalRank?: number | null;
};

type PlayerTournamentHighscore = {
  tournamentId: string;
  tournamentName: string;
  created_at: string | null;
  machineHighscores: number; // Anzahl Maschinen, wo Spieler in diesem Turnier Platz 1 ist
};


// 🆕 Single Play (Training)
type SinglePlayRun = {
  id: string;
  profile_id: string;
  location_id: string | null;
  machine_id: string | null;
  status: "in_progress" | "finished" | "abandoned";
  started_at: string | null;
  finished_at: string | null;
  total_score: number | null;
  notes?: string | null;
  machine?: { id: string; name: string; icon_emoji?: string | null } | null;
};

type SinglePlayBallEvent = {
  id: string;
  run_id: string;
  ball_no: number;
  ball_score: number | null;
  drain_zone: string | null;
  drain_detail: string | null;
  save_action: string | null;
  save_action_detail: string | null;
  created_at: string | null;
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



function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-lg leading-none">{icon}</div>
      <div>
        <div className="text-base font-semibold text-neutral-900">{title}</div>
        {subtitle ? (
          <div className="text-xs text-neutral-500">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini-Kuchendiagramm für Drain-Zonen
// Nutzung: <DrainPieChart rows={[{label:"Mitte", value: 7}, ...]} height={220} />
type DrainPieRow = { label: string; value: number };

function DrainPieChart({
  rows,
  height = 200,
}: {
  rows: DrainPieRow[];
  height?: number;
}) {
  const data = (rows || []).filter((r) => (r?.value ?? 0) > 0);
  const total = data.reduce((acc, r) => acc + (r.value ?? 0), 0);
  if (!data.length || total <= 0) return null;

  // feste, gut unterscheidbare Farben (keine Abhängigkeit vom Theme)
    return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            formatter={(value: any, _name: any, props: any) => {
              const v = Number(value ?? 0);
              const pct = total ? Math.round((v / total) * 100) : 0;
              return [`${v}x • ${pct}%`, props?.payload?.label ?? ""];
            }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius="80%"
            innerRadius="45%"
            paddingAngle={2}
            isAnimationActive={false}
          >
            {data.map((_, idx) => (
              <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}


type BarRow = { label: string; value: number; pct?: number };

function SaveBarChart({
  rows,
  height = 220,
}: {
  rows: BarRow[];
  height?: number;
}) {
  if (!rows || rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => r.value || 0), 1);

  return (
    <div className="rounded-md border bg-white p-2">
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis type="number" domain={[0, max]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={{ fontSize: 11, fill: "#374151" }}
            />
            <Tooltip
              formatter={(value: any, name: any, props: any) => {
                const v = Number(value || 0);
                const p = props?.payload?.pct;
                return [p != null ? `${v}x • ${p}%` : `${v}x`, ""];
              }}
              labelFormatter={(label: any) => String(label)}
            />
            <Bar dataKey="value" radius={[6, 6, 6, 6]}>
              {rows.map((_, idx) => (
                <Cell key={`bar-${idx}`} fill={ACTION_COLORS[idx % ACTION_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

  function MachineBadge({
    name,
    emoji,
  }: {
    name: string;
    emoji?: string | null;
  }) {
    const initials = (name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => (s[0] ? s[0].toUpperCase() : ""))
      .join("");

    const e = (emoji || "").trim();

    return (
    <div className="h-8 w-8 rounded-xl bg-neutral-60 flex items-center justify-center text-[14px] font-black text-neutral-800 shrink-0">
        {e ? <span>{e}</span> : <span className="text-[11px]">{initials || "?"}</span>}
      </div>
    );
  }





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

function ScoreboardRow({
  leftLabel,
  leftValue,
  leftSubValue,
  leftSubLabel,
  centerTop,
  rightLabel,
  rightValue,
  rightSubValue,
  rightSubLabel,
}: {
  leftLabel: string;
  leftValue: number;
  leftSubValue?: number;
  leftSubLabel?: string;
  centerTop: string;
  rightLabel: string;
  rightValue: number;
  rightSubValue?: number;
  rightSubLabel?: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border bg-white px-4 py-3">
      <div className="grid grid-cols-3 items-center">
        {/* Left */}
        <div className="flex flex-col items-center">

          <div className="mt-1 inline-flex min-w-[1.25rem] justify-center rounded-xl bg-neutral-900 px-3 py-1 text-3xl font-extrabold tabular-nums text-white shadow-sm">
            {leftValue}
          </div>

          {leftSubValue !== undefined ? (
            <div className="mt-1 flex flex-col items-center">
              <div className="text-sm font-bold tabular-nums text-neutral-900">
                {leftSubValue}
              </div>
              {leftSubLabel ? (
                <div className="text-[10px] text-neutral-500">{leftSubLabel}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Center */}
        <div className="text-center">
          <div className="text-xs font-semibold text-neutral-500">{centerTop}</div>
          <div className="mt-1 text-xl font-black tracking-widest text-neutral-900">
            VS
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col items-center">
        
          <div className="mt-1 inline-flex min-w-[1.25rem] justify-center rounded-xl bg-neutral-900 px-3 py-1 text-3xl font-extrabold tabular-nums text-white shadow-sm">
            {rightValue}
          </div>

          {rightSubValue !== undefined ? (
            <div className="mt-1 flex flex-col items-center">
              <div className="text-sm font-bold tabular-nums text-neutral-900">
                {rightSubValue}
              </div>
              {rightSubLabel ? (
                <div className="text-[10px] text-neutral-500">{rightSubLabel}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function extractQuotedParts(s: string): string[] {
  const out: string[] = [];
  const re = /'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const inner = (m[1] ?? "").trim();
    if (inner) out.push(`'${inner}'`);
  }
  return out;
}

function fmtScore(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "–";
}

function Sparkline({ values }: { values: number[] }) {
  const w = 220;
  const h = 48;
  const pad = 4;

  const data = (values || []).filter((v) => Number.isFinite(v));
  if (data.length < 2) {
    return (
      <div className="h-12 w-[220px] rounded-md border bg-white text-[11px] text-neutral-500 flex items-center justify-center">
        zu wenig Daten
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);

  const points = data
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / (data.length - 1);
      const y = h - pad - ((v - min) * (h - pad * 2)) / span;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="block"
      role="img"
      aria-label="Score Verlauf"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
        className="text-neutral-900"
      />
    </svg>
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

    // 🆕 Welche profile.id gehört zum aktuell eingeloggten User?
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [myProfileIdLoading, setMyProfileIdLoading] = useState(false);


  // 🆕 Info/Notizen pro Profil
  const [infoDraft, setInfoDraft] = useState<Record<string, string>>({});
  const [infoSaving, setInfoSaving] = useState<Record<string, boolean>>({});
  const [infoMsg, setInfoMsg] = useState<Record<string, string | null>>({});
  const [infoMode, setInfoMode] = useState<Record<string, "edit" | "preview">>({});

  // Elo-History-States: pro Profil
  const [eloHistory, setEloHistory] = useState<Record<string, EloPoint[]>>({});
  const [eloLoading, setEloLoading] = useState<Record<string, boolean>>({});
  const [eloError, setEloError] = useState<Record<string, string | null>>({});

  // Vergleichsauswahl (max. 2 Spieler)
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  // 🆕 Head-to-Head (Vergleich: direkte Duelle)
  const [h2hLoading, setH2hLoading] = useState(false);
  const [h2hError, setH2hError] = useState<string | null>(null);
  const [h2hData, setH2hData] = useState<any | null>(null);

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

  const [spDetailSuggestions, setSpDetailSuggestions] = useState<
    Record<string, { drain: string[]; save: string[]; run: string[] }>
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

  const [spOpenedArchivedRun, setSpOpenedArchivedRun] = useState<Record<string, any | null>>({});
  const [spOpenedArchivedEvents, setSpOpenedArchivedEvents] = useState<Record<string, any[]>>({});


  // 🆕 Turniererfolge-Tabellen (2 Tabellen) pro Profil
  const [successByProfile, setSuccessByProfile] = useState<
    Record<
      string,
      { machineBests: PlayerMachineBest[]; tournaments: PlayerTournamentHighscore[] } | null
    >
  >({});

  const [successLoading, setSuccessLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [successError, setSuccessError] = useState<Record<string, string | null>>(
    {}
  );


  // aktiver Unter-Tab pro Profil ("stats" | "single" | "edit")
  const [detailTabs, setDetailTabs] = useState<
    Record<string, "edit" | "stats" | "single">
  >({});




  // 🆕 Single Play State pro Profil
  const [spActiveRun, setSpActiveRun] = useState<Record<string, SinglePlayRun | null>>({});
  const [spBallEvents, setSpBallEvents] = useState<Record<string, SinglePlayBallEvent[]>>({});
  const [spArchiveRuns, setSpArchiveRuns] = useState<Record<string, SinglePlayRun[]>>({});
  const [spLoading, setSpLoading] = useState<Record<string, boolean>>({});
  const [spError, setSpError] = useState<Record<string, string | null>>({});

  const [spStatsEvents, setSpStatsEvents] = useState<Record<string, any[]>>({});
  const [spStatsEventRuns, setSpStatsEventRuns] = useState<Record<string, any[]>>({});
  const [spStatsEventsLoading, setSpStatsEventsLoading] = useState<Record<string, boolean>>({});
  const [spStatsEventsError, setSpStatsEventsError] = useState<Record<string, string>>({});

// Drilldown states (pro Profil)
const [spDrainOpenZone, setSpDrainOpenZone] = useState<Record<string, string>>({});
const [spDrainDetailFilter, setSpDrainDetailFilter] = useState<Record<string, string>>({});


// Mirror-Drilldown states (Save-first) (pro Profil)
const [spSaveOpenAction, setSpSaveOpenAction] = useState<Record<string, string>>({});
const [spSaveDetailFilter, setSpSaveDetailFilter] = useState<Record<string, string>>({});
const [spSaveDrainZoneFilter, setSpSaveDrainZoneFilter] = useState<Record<string, string>>({});
const [spSaveDrainDetailFilter, setSpSaveDrainDetailFilter] = useState<Record<string, string>>({});


  // Save-Detail Auswahl (Klick auf blaues Badge) -> zeigt passende Run-Details (pro Profil)
  const [spSelectedSaveDetail, setSpSelectedSaveDetail] = useState<
    Record<string, { zone: string; drainDetail: string; action: string; badge: string } | null>
  >({});

  // Save-Action Auswahl (Klick auf Rettungsversuch-Zeile) -> zeigt Run-Details (pro Profil)
  const [spSelectedSaveAction, setSpSelectedSaveAction] = useState<
    Record<string, { zone: string; drainDetail: string; action: string } | null>
  >({});

  // Maschinenliste (pro Location) für den Dropdown
  const [spMachines, setSpMachines] = useState<any[]>([]);
  const [spMachinesLoading, setSpMachinesLoading] = useState(false);
  const [spMachinesError, setSpMachinesError] = useState<string | null>(null);

  // Drafts für UI-Eingaben (pro Profil)
  const [spStartMachineId, setSpStartMachineId] = useState<Record<string, string>>({});
  const [spBallDraft, setSpBallDraft] = useState<Record<string, any>>({});
  const [spTotalScoreDraft, setSpTotalScoreDraft] = useState<Record<string, string>>({});

  // ✅ Single-Play Statistik Filter (pro Profil)
  const [spStatsMachineId, setSpStatsMachineId] = useState<Record<string, string>>({});
  const [spStatsRange, setSpStatsRange] = useState<Record<string, string>>({}); 
  // Werte z.B. "10" | "20" | "50" | "all"

  const [spRunDetailDraft, setSpRunDetailDraft] = useState<Record<string, string>>({});

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
            info: p.info ?? null,
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

  
  // 🆕 Mapping: auth user -> profile_id laden (direkt via supabaseBrowser)
  useEffect(() => {
    (async () => {
      setMyProfileIdLoading(true);
      try {
        const sb = supabaseBrowser();

        // 1) eingeloggten User holen
        const { data: userData } = await sb.auth.getUser();
        const userId = userData?.user?.id ?? null;

        if (!userId) {
          setMyProfileId(null);
          return;
        }

        // 2) Mapping holen
        const { data: link, error } = await sb
          .from("profile_links")
          .select("profile_id")
          .eq("auth_user_id", userId)
          .maybeSingle();

        if (error) {
          console.warn("profile_links load failed:", error.message);
          setMyProfileId(null);
          return;
        }

        setMyProfileId(link?.profile_id ?? null);
      } catch (e: any) {
        console.warn("profile_links load crashed:", e?.message ?? e);
        setMyProfileId(null);
      } finally {
        setMyProfileIdLoading(false);
      }
    })();
  }, []);



  // ✅ Single-Play Player/Stats: Ball-Events (Drains & letzter Rettungsversuch) automatisch laden
  // - sobald ein Profil im "Single"-Tab ist
  // - und erneut, wenn der Machine-Filter wechselt
  useEffect(() => {
    const activeProfileIds = Object.entries(detailTabs)
      .filter(([, tab]) => tab === "single")
      .map(([pid]) => pid);

    for (const pid of activeProfileIds) {
      if (spStatsEventsLoading[pid]) continue;
      const machineId = spStatsMachineId[pid] ?? "";
      // ✅ Filter-Konsistenz: Beim ersten Laden sollen Sparkline/Runs und Ball-Stats
      // denselben Zeitraum verwenden. Default oben ist "20".
      const range = spStatsRange[pid] ?? "20";
      loadSinglePlayStatsEvents(pid, machineId, range);
    }
    // bewusst: kein spStatsEvents als Dependency, sonst riskieren wir Reload-Loops
  }, [detailTabs, spStatsMachineId, spStatsRange]);



// ─────────────────────────────────────────────────────────
// Single Play: Maschinen aus location_machines + locations laden
// ─────────────────────────────────────────────────────────
useEffect(() => {
  (async () => {
    setSpMachinesLoading(true);
    setSpMachinesError(null);

    try {
      const res = await fetch(
        `/api/location-machines/all?ts=${Date.now()}`,
        { cache: "no-store" }
      );

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSpMachines([]);
        setSpMachinesError(j.error ?? "Konnte Maschinen nicht laden");
        return;
      }

      setSpMachines(Array.isArray(j.machines) ? j.machines : []);
    } catch {
      setSpMachines([]);
      setSpMachinesError("Konnte Maschinen nicht laden (Netzwerkfehler?)");
    } finally {
      setSpMachinesLoading(false);
    }
  })();
}, []);


async function loadSinglePlayDetailSuggestions(profileId: string) {
  try {
    const resS = await fetch(
      `/api/single-play/detail-suggestions?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`,
      { cache: "no-store" }
    );
    const s = await resS.json().catch(() => ({}));
    if (resS.ok) {
      setSpDetailSuggestions((prev) => ({
        ...prev,
        [profileId]: {
          drain: Array.isArray(s.drain) ? s.drain : [],
          save: Array.isArray(s.save) ? s.save : [],
          run: Array.isArray(s.run) ? s.run : [],
        },
      }));
    }
  } catch {
    // bewusst silent – UI soll nicht kaputtgehen
  }
}

async function loadSinglePlayStatsEvents(profileId: string, machineId: string, range: string) {
  // Hard reset (gegen stale data / gelöschte Runs)
  setSpStatsEvents((prev) => ({ ...prev, [profileId]: [] }));
  setSpStatsEventRuns((prev) => ({ ...prev, [profileId]: [] }));

  setSpStatsEventsLoading((prev) => ({ ...prev, [profileId]: true }));
  setSpStatsEventsError((prev) => ({ ...prev, [profileId]: "" }));

  try {
    const cleanMachineId = (machineId ?? "").trim();
    // Default oben ist "20" (Sparkline/Runs). Range wird durchgereicht.
    const cleanRange = String(range ?? "20").trim().toLowerCase();

    const url =
      `/api/single-play/ball-events?profileId=${encodeURIComponent(profileId)}` +
      (cleanMachineId ? `&machineId=${encodeURIComponent(cleanMachineId)}` : "") +
      `&range=${encodeURIComponent(cleanRange)}` +
      `&ts=${Date.now()}`;

    const res = await fetch(url, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSpStatsEventsError((prev) => ({
        ...prev,
        [profileId]: j?.error || `Stats Events Fehler (${res.status})`,
      }));
      return;
    }

    setSpStatsEvents((prev) => ({
      ...prev,
      [profileId]: Array.isArray(j.events) ? j.events : [],
    }));

    setSpStatsEventRuns((prev) => ({
      ...prev,
      [profileId]: Array.isArray(j.runs) ? j.runs : [],
    }));
  } catch (e: any) {
    setSpStatsEventsError((prev) => ({
      ...prev,
      [profileId]: `Stats Events Netzwerkfehler: ${String(e?.message ?? e)}`,
    }));
  } finally {
    setSpStatsEventsLoading((prev) => ({ ...prev, [profileId]: false }));
  }
}



  const isOwnerOfProfile = (profileId: string) => {
    return !!myProfileId && myProfileId === profileId;
  };



  async function loadSinglePlay(profileId: string) {
    // Hard reset (gegen stale data)
    setSpLoading((prev) => ({ ...prev, [profileId]: true }));
    setSpError((prev) => ({ ...prev, [profileId]: null }));
    setSpActiveRun((prev) => ({ ...prev, [profileId]: null }));
    setSpBallEvents((prev) => ({ ...prev, [profileId]: [] }));
    setSpArchiveRuns((prev) => ({ ...prev, [profileId]: [] }));
    setSpDetailSuggestions((prev) => ({
      ...prev,
      [profileId]: { drain: [], save: [], run: []  },
    }));

    try {
      // 1) Active Run
      const resA = await fetch(
        `/api/single-play/run/active?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      const a = await resA.json().catch(() => ({}));
      if (resA.ok) {
        setSpActiveRun((prev) => ({ ...prev, [profileId]: a.run ?? null }));
        setSpBallEvents((prev) => ({ ...prev, [profileId]: Array.isArray(a.events) ? a.events : [] }));
      } else {
        // nicht fatal, wir zeigen dann einfach keinen aktiven Run
        console.warn("single-play active error", a.error);
      }

      // 2) Archive (finished)
      const resL = await fetch(
        `/api/single-play/runs/list?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`,
        { cache: "no-store" }
      );
      const l = await resL.json().catch(() => ({}));


// Detail-Suggestions (Badges) laden
try {
  const resS = await fetch(
    `/api/single-play/detail-suggestions?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`,
    { cache: "no-store" }
  );

  const s = await resS.json().catch(() => ({}));

  if (resS.ok) {
    setSpDetailSuggestions((prev) => ({
      ...prev,
      [profileId]: {
        drain: Array.isArray(s.drain) ? s.drain : [],
        save: Array.isArray(s.save) ? s.save : [],
      },
    }));
  } else {
    console.warn("detail-suggestions failed", resS.status, s);
    setSpDetailSuggestions((prev) => ({
      ...prev,
      [profileId]: { drain: [], save: [], run: []  },
    }));
  }
} catch {
  setSpDetailSuggestions((prev) => ({
    ...prev,
    [profileId]: { drain: [], save: [] },
  }));
  // bewusst silent – UI soll nicht kaputtgehen
}




if (resL.ok) {
  const runs = Array.isArray(l.runs) ? l.runs : [];
  setSpArchiveRuns((prev) => ({ ...prev, [profileId]: runs }));

  // ✅ Default-Maschine: letzte verwendete Maschine aus dem Archiv vorauswählen
  // (nur setzen, wenn der User noch nichts ausgewählt hat)
  const sorted = runs
    .slice()
    .sort((a: any, b: any) => {
      const ta = a.finished_at ? new Date(a.finished_at).getTime() : 0;
      const tb = b.finished_at ? new Date(b.finished_at).getTime() : 0;
      return tb - ta; // neueste zuerst
    });

  const lastMachineId =
    (sorted[0]?.machine_id as string | null) ??
    (sorted[0]?.machine?.id as string | null) ??
    null;

  if (lastMachineId) {
    setSpStartMachineId((prev) => {
      // wenn schon gewählt: nicht überschreiben
      if (prev[profileId]) return prev;
      return { ...prev, [profileId]: lastMachineId };
    });
  }
} else {
  console.warn("single-play list error", l.error);
}

// ✅ NACHDEM Archiv geladen wurde: Suggestions laden
await loadSinglePlayDetailSuggestions(profileId);

    } catch {
      setSpError((prev) => ({ ...prev, [profileId]: "Single Play konnte nicht geladen werden" }));
    } finally {
      setSpLoading((prev) => ({ ...prev, [profileId]: false }));
    }
  }

  async function startSinglePlayRun(profileId: string, machineId: string) {
    if (!machineId) return;
    // ✅ Merken: letzte verwendete Maschine für dieses Profil

    setSpStartMachineId((prev) => ({ ...prev, [profileId]: machineId }));

    setSpError((prev) => ({ ...prev, [profileId]: null }));

    try {
      const res = await fetch(`/api/single-play/run/start?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ profileId, machineId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSpError((prev) => ({ ...prev, [profileId]: j.error ?? "Run konnte nicht gestartet werden" }));
        return;
      }
      setSpActiveRun((prev) => ({ ...prev, [profileId]: j.run ?? null }));
      setSpBallEvents((prev) => ({ ...prev, [profileId]: [] }));

      // ✅ Draft für neuen Run explizit auf Ball 1 zurücksetzen
      setSpBallDraft((prev) => ({
        ...prev,
        [profileId]: {
          ball_no: 1,
          ball_score: "",
          drain_zone: "",
          drain_detail: "",
          save_action: "",
          save_action_detail: "",
        },
      }));


      // Archive neu laden, damit „in_progress“ nicht im Archiv steckt, aber wir bleiben konsistent
      await loadSinglePlay(profileId);
    } catch {
      setSpError((prev) => ({ ...prev, [profileId]: "Run konnte nicht gestartet werden (Netzwerkfehler?)" }));
    }
  }

  async function openArchivedSinglePlayRun(profileId: string, runId: string) {
  // Falls aktiver Run läuft: nicht öffnen (sonst UI Chaos)
  if (spActiveRun[profileId]) return;

  setSpError((prev) => ({ ...prev, [profileId]: null }));

  try {
    const res = await fetch(
      `/api/single-play/run/get?profileId=${encodeURIComponent(profileId)}&runId=${encodeURIComponent(runId)}&ts=${Date.now()}`,
      { cache: "no-store" }
    );

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSpError((prev) => ({
        ...prev,
        [profileId]: j.error ?? "Run konnte nicht geladen werden",
      }));
      return;
    }

    setSpOpenedArchivedRun((prev) => ({ ...prev, [profileId]: j.run ?? null }));
    setSpOpenedArchivedEvents((prev) => ({ ...prev, [profileId]: Array.isArray(j.events) ? j.events : [] }));
  } catch {
    setSpError((prev) => ({
      ...prev,
      [profileId]: "Run konnte nicht geladen werden (Netzwerkfehler?)",
    }));
  }
}

function closeArchivedSinglePlayRun(profileId: string) {
  setSpOpenedArchivedRun((prev) => ({ ...prev, [profileId]: null }));
  setSpOpenedArchivedEvents((prev) => ({ ...prev, [profileId]: [] }));
}


  async function upsertSinglePlayBall(profileId: string, runId: string, payload: any) {
    setSpError((prev) => ({ ...prev, [profileId]: null }));
    try {
      const res = await fetch(`/api/single-play/ball/upsert?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ runId, ...payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSpError((prev) => ({ ...prev, [profileId]: j.error ?? "Ball konnte nicht gespeichert werden" }));
        return;
      }

// ✅ Wenn Ball 3 gespeichert wurde: Gesamt-Score automatisch füllen
if (payload.ballNo === 3) {
  const raw = String(payload.ballScore ?? "").trim();
  const n = Number(raw.replace(/[^0-9]/g, ""));
  if (Number.isFinite(n) && n > 0) {
    setSpTotalScoreDraft((prev) => ({ ...prev, [profileId]: String(n) }));
  }
}


      // Events local aktualisieren
      const newEvents = Array.isArray(j.events) ? j.events : (spBallEvents[profileId] || []);
      setSpBallEvents((prev) => ({ ...prev, [profileId]: newEvents }));

      // ✅ Badges sofort aktualisieren (neue '...' sollen direkt auftauchen)
      await loadSinglePlayDetailSuggestions(profileId);   

      // ✅ Draft reset + automatisch nächster Ball
      const newExistingBalls = new Set((newEvents || []).map((e: any) => Number(e.ball_no)).filter(Boolean));
      const newNextBall = [1, 2, 3].find((b) => !newExistingBalls.has(b)) ?? 3;

      setSpBallDraft((prev) => ({
        ...prev,
        [profileId]: {
          ball_no: newNextBall,
          ball_score: "",
          drain_zone: "",
          drain_detail: "",
          save_action: "",
          save_action_detail: "",
        },
      }));

    } catch {
      setSpError((prev) => ({ ...prev, [profileId]: "Ball konnte nicht gespeichert werden (Netzwerkfehler?)" }));
    }
  }

  function appendToDraft(profileId: string, field: "drain_detail" | "save_action_detail", text: string) {
  setSpBallDraft((prev) => {
    const cur = prev[profileId] ?? {
      ball_no: 1,
      ball_score: "",
      drain_zone: "",
      drain_detail: "",
      save_action: "",
      save_action_detail: "",
    };

    const existing = String((cur as any)[field] ?? "");
    const next =
      existing.trim().length > 0
        ? existing.replace(/\s+$/, "") + " " + text
        : text;

    return {
      ...prev,
      [profileId]: {
        ...cur,
        [field]: next,
      },
    };
  });
}

function appendToRunDetailDraft(profileId: string, text: string) {
  setSpRunDetailDraft((prev) => {
    const existing = String(prev[profileId] ?? "");
    const next =
      existing.trim().length > 0
        ? existing.replace(/\s+$/, "") + " " + text
        : text;

    return { ...prev, [profileId]: next };
  });
}



  async function finishSinglePlayRun(profileId: string, runId: string, totalScore: number, runDetail?: string) {

    setSpError((prev) => ({ ...prev, [profileId]: null }));
    try {
      const res = await fetch(`/api/single-play/run/finish?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ runId, totalScore, runDetail }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSpError((prev) => ({ ...prev, [profileId]: j.error ?? "Run konnte nicht abgeschlossen werden" }));
        return;
      }

      // ✅ Gesamt-Score Input zurücksetzen (sonst bleibt alter Wert stehen)
      setSpTotalScoreDraft((prev) => {
        const cp = { ...prev };
        delete cp[profileId];
        return cp;
      });


      // Refresh alles
      await loadSinglePlay(profileId);
    } catch {
      setSpError((prev) => ({ ...prev, [profileId]: "Run konnte nicht abgeschlossen werden (Netzwerkfehler?)" }));
    }
  }

  async function deleteArchivedSinglePlayRun(profileId: string, runId: string, runLabel: string) {
  const ok = confirm(`Run "${runLabel}" wirklich löschen?\n(Das löscht Run + Ball-Events endgültig.)`);
  if (!ok) return;

  setSpError((prev) => ({ ...prev, [profileId]: null }));

  try {
    const res = await fetch(`/api/single-play/run/delete-archive?ts=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ runId, profileId }),
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSpError((prev) => ({
        ...prev,
        [profileId]: j.error ?? "Run konnte nicht gelöscht werden",
      }));
      return;
    }

    // ✅ danach alles neu laden (damit Archiv sofort aktuell ist)
    await loadSinglePlay(profileId);
  } catch {
    setSpError((prev) => ({
      ...prev,
      [profileId]: "Run konnte nicht gelöscht werden (Netzwerkfehler?)",
    }));
  }
}


  
async function deleteSinglePlayRun(profileId: string, runId: string) {
  if (!runId) return;

  const ok = confirm(
    "Aktiven Run wirklich LÖSCHEN?\n\nDabei werden auch alle gespeicherten Bälle entfernt.\nDieser Vorgang kann nicht rückgängig gemacht werden."
  );
  if (!ok) return;

  setSpError((prev) => ({ ...prev, [profileId]: null }));

  try {
    const res = await fetch(`/api/single-play/run/delete?ts=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ profileId, runId }),
    });

    const raw = await res.text();
    let j: any = {};
    try {
      j = raw ? JSON.parse(raw) : {};
    } catch {
      // wenn HTML oder sonstwas kommt, bleibt j leer
    }

    if (!res.ok) {
      console.log("DELETE RUN failed:", res.status, raw);

      setSpError((prev) => ({
        ...prev,
        [profileId]:
          j.error ??
          `Run konnte nicht gelöscht werden (HTTP ${res.status})`,
      }));
      return;
    }


    // ✅ Hard reset states, damit kein alter Run “hängen bleibt”
    setSpActiveRun((prev) => ({ ...prev, [profileId]: null }));
    setSpBallEvents((prev) => ({ ...prev, [profileId]: [] }));
    setSpBallDraft((prev) => {
      const cp = { ...prev };
      delete cp[profileId];
      return cp;
    });
    setSpTotalScoreDraft((prev) => {
      const cp = { ...prev };
      delete cp[profileId];
      return cp;
    });

    // ✅ neu laden (Archiv + Maschinen-Preselect usw.)
    await loadSinglePlay(profileId);
  } catch {
    setSpError((prev) => ({
      ...prev,
      [profileId]: "Run konnte nicht gelöscht werden (Netzwerkfehler?)",
    }));
  }
}




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

  async function loadSuccessTables(profileId: string) {
  setSuccessLoading((prev) => ({ ...prev, [profileId]: true }));
  setSuccessError((prev) => ({ ...prev, [profileId]: null }));

  try {
    const res = await fetch(`/api/players/success-tables?ts=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ profileId }),
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      setSuccessError((prev) => ({
        ...prev,
        [profileId]: j.error ?? "Konnte Turniererfolge nicht laden.",
      }));
      setSuccessByProfile((prev) => ({ ...prev, [profileId]: null }));
    } else {
      setSuccessByProfile((prev) => ({
        ...prev,
        [profileId]: {
          machineBests: Array.isArray(j.machineBests) ? j.machineBests : [],
          tournaments: Array.isArray(j.tournaments) ? j.tournaments : [],
        },
      }));
    }
  } catch (e: any) {
    setSuccessError((prev) => ({
      ...prev,
      [profileId]: "Netzwerkfehler: " + String(e?.message ?? e),
    }));
    setSuccessByProfile((prev) => ({ ...prev, [profileId]: null }));
  } finally {
    setSuccessLoading((prev) => ({ ...prev, [profileId]: false }));
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
      // 🆕 Turniererfolge-Tabellen laden
      loadSuccessTables(id);
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


  // ─────────────────────────────────────────────────────────
  // Info/Notizen speichern
  // ─────────────────────────────────────────────────────────
  async function saveInfo(profileId: string) {
    if (!isAdmin) return;

    const info = String(infoDraft[profileId] ?? "").trimEnd(); // End-Whitespace behalten wir nicht unnötig
    setInfoSaving((prev) => ({ ...prev, [profileId]: true }));
    setInfoMsg((prev) => ({ ...prev, [profileId]: null }));

    try {
      const res = await fetch(`/api/profiles/setInfo?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id: profileId, info }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInfoMsg((prev) => ({ ...prev, [profileId]: j.error ?? "Konnte Info nicht speichern" }));
        return;
      }

      // local state updaten
      setProfiles((prev) =>
        prev.map((p) => (p.id === profileId ? { ...p, info: info.length ? info : null } : p))
      );

      setInfoMsg((prev) => ({ ...prev, [profileId]: "Gespeichert ✅" }));
    } catch {
      setInfoMsg((prev) => ({ ...prev, [profileId]: "Konnte Info nicht speichern (Netzwerkfehler?)" }));
    } finally {
      setInfoSaving((prev) => ({ ...prev, [profileId]: false }));
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
      // 🆕 Success-Tables mit aufräumen
      setSuccessByProfile((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setSuccessError((prev) => {
        const cp = { ...prev };
        delete cp[id];
        return cp;
      });
      setSuccessLoading((prev) => {
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

  useEffect(() => {
  async function run() {
    if (compareSelection.length !== 2) {
      setH2hData(null);
      setH2hError(null);
      return;
    }

    const [profileAId, profileBId] = compareSelection;

    setH2hLoading(true);
    setH2hError(null);

    try {
      const res = await fetch(`/api/players/head-to-head?ts=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ profileAId, profileBId }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Head-to-Head konnte nicht geladen werden.");

      setH2hData(j);
    } catch (e: any) {
      setH2hData(null);
      setH2hError(String(e?.message ?? e));
    } finally {
      setH2hLoading(false);
    }
  }

  run();
  }, [compareSelection]);




  const one = h2hData?.matches?.oneVsOne;
const togetherAny = h2hData?.matches?.togetherAny;


const [idA, idB] =
  compareSelection.length === 2 ? (compareSelection as [string, string]) : (["", ""] as any);

const leftName =
  profiles.find((p) => p.id === idA)?.display_name ??
  profiles.find((p) => p.id === idA)?.nickname ??
  "A";

const rightName =
  profiles.find((p) => p.id === idB)?.display_name ??
  profiles.find((p) => p.id === idB)?.nickname ??
  "B";


const headToHeadPanel =
  compareSelection.length === 2 ? (
    <div className="mt-3 rounded-xl bg-white p-3 ml-3 mr-3">
      <div className="text-base font-semibold text-neutral-800 mb-3 text-center">
        Direktvergleich (Head-to-Head)
      </div>

      {h2hLoading ? (
        <div className="text-sm text-neutral-500">Lade Head-to-Head…</div>
      ) : h2hError ? (
        <div className="text-sm text-red-600">{h2hError}</div>
      ) : !h2hData ? (
        <div className="text-sm text-neutral-500">Keine Daten.</div>
      ) : (
        <div className="grid gap-4">
          {/* 🎯 1 vs 1 */}
          <div className="rounded-2xl border bg-neutral-50 p-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-base font-semibold text-neutral-800">
                <span>🎯</span>
                <span>Matches 1 vs 1 (nur ihr beide)</span>
              </div>

              <div className="mt-1 text-sm text-neutral-600">
                Spiele:{" "}
                <span className="font-semibold text-neutral-900">
                  {one?.count ?? 0}
                </span>
              </div>
            </div>

            <ScoreboardRow
              leftLabel={leftName}
              leftValue={h2hData.matches.oneVsOne.aWins ?? 0}
              centerTop="gewonnen"

              rightLabel={rightName}
              rightValue={h2hData.matches.oneVsOne.bWins ?? 0}
            />
          </div>

          {/* 👥 zusammen */}
          <div className="rounded-2xl border bg-neutral-50 p-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-base font-semibold text-neutral-800">
                <span>👥</span>
                <span>Matches zusammen (auch mit anderen)</span>
              </div>

              <div className="mt-1 text-sm text-neutral-600">
                Spiele:{" "}
                <span className="font-semibold text-neutral-900">
                  {togetherAny?.count ?? 0}
                </span>
              </div>
            </div>

            <ScoreboardRow
              leftLabel={leftName}
              leftValue={h2hData.matches.togetherAny?.aBeatsB ?? 0}
              leftSubValue={h2hData.matches.togetherAny?.aFirsts ?? 0}
              leftSubLabel="1. Plätze"
              centerTop="besser platziert"
              rightLabel={rightName}
              rightValue={h2hData.matches.togetherAny?.bBeatsA ?? 0}
              rightSubValue={h2hData.matches.togetherAny?.bFirsts ?? 0}
              rightSubLabel="1. Plätze"
            />
          </div>

          {/* --- TURNIERE --- */}
          <div className="mt-2 text-center text-sm font-semibold text-neutral-700">
            Turniere
          </div>

          {/* 🏆 Turniere 1 vs 1 */}
          <div className="rounded-2xl border bg-neutral-50 p-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-base font-semibold text-neutral-800">
                <span>🏆</span>
                <span>Turniere 1 vs 1 (nur ihr beide)</span>
              </div>

              <div className="mt-1 text-sm text-neutral-600">
                Turniere:{" "}
                <span className="font-semibold text-neutral-900">
                  {h2hData.tournaments.oneVsOneOnly?.count ?? 0}
                </span>
              </div>
            </div>

            <ScoreboardRow
              leftLabel={leftName}
              leftValue={h2hData.tournaments.oneVsOneOnly?.aWins ?? 0}
              centerTop="gewonnen"
              rightLabel={rightName}
              rightValue={h2hData.tournaments.oneVsOneOnly?.bWins ?? 0}
            />
          </div>

          {/* 🏆 Turniere zusammen */}
          <div className="rounded-2xl border bg-neutral-50 p-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-base font-semibold text-neutral-800">
                <span>🏆</span>
                <span>Turniere zusammen (auch mit anderen)</span>
              </div>

              <div className="mt-1 text-sm text-neutral-600">
                Turniere:{" "}
                <span className="font-semibold text-neutral-900">
                  {h2hData.tournaments.togetherAny?.count ?? 0}
                </span>
              </div>
            </div>

            <ScoreboardRow
              leftLabel={leftName}
              leftValue={h2hData.tournaments.togetherAny?.aWins ?? 0}
              leftSubValue={h2hData.tournaments.togetherAny?.aFirsts ?? 0}
              leftSubLabel="1. Plätze"
              centerTop="besser platziert"
              rightLabel={rightName}
              rightValue={h2hData.tournaments.togetherAny?.bWins ?? 0}
              rightSubValue={h2hData.tournaments.togetherAny?.bFirsts ?? 0}
              rightSubLabel="1. Plätze"
            />
          </div>
        </div>
      )}
    </div>
  ) : null;



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
            const tournamentPoints = Number((profile as any).total_tournament_points ?? 0);
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
              tournamentPoints, 
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
                          <div className="text-base font-semibold flex items-center gap-1.5">
                            {idx === 0 ? "Spieler A:" : "Spieler B:"} {p.name}
                            {p.icon && <span>{p.icon}</span>}
                          </div>
                          {/*
                          <div className="text-[11px] text-neutral-500">
                            ID: <span className="font-mono">{p.id}</span>
                          </div>
                          */}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] mt-1">
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
                  
                        <span className="flex items-baseline gap-1">
                          
                          <span className="font-bold tabular-nums text-amber-600">
                            {Number.isFinite(s.tournamentPoints) ? Math.round(s.tournamentPoints) : 0}
                          </span>{" "}
                          <span className="text-amber-600 font-bold">TP</span>{/*<span className="text-amber-600 font-semibold">(Turnierpunkte)</span>*/}
                        </span>
                      </div>



                      <div className="flex items-center justify-between mt-1.5">
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-[2px] text-[12px] font-semibold " +
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



              
{headToHeadPanel}


            </div>
            
          );
        })()
      : null;








  return (


  
    <Card>
      <CardHeader>
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <div className="font-semibold">Spieler (Profiles)</div>

  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
    <Input
      value={q}
      onChange={(e) => setQ(e.target.value)}
      placeholder="Suchen…"
      className="w-full sm:w-60"
    />

    <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
      <Button variant="secondary" disabled={busy} onClick={load} className="w-full sm:w-auto">
        Neu laden
      </Button>

      {isAdmin && (
        <Button disabled={busy} onClick={startNew} className="w-full sm:w-auto">
          Neuer Spieler
        </Button>
      )}
    </div>
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

            // 🆕 Success-Tabellen Daten
            const success = successByProfile[p.id] ?? null;
            const loadingSuccess = successLoading[p.id] === true;
            const successErr = successError[p.id] ?? null;

            const machineBests = success?.machineBests ?? [];
            const tournamentHighscores = success?.tournaments ?? [];


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
                  className="flex w-full flex-col gap-3 px-4 py-3 text-left hover:bg-neutral-50 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => openRow(p.id)}
                >
                  <div className="flex items-center gap-3 min-w-0 w-full">
                    <Avatar
                      url={(p as any).avatar_url ?? null}
                      name={p.name}
                      color={p.color}
                      icon={p.icon}
                    />
                    <div>
  <div className="text-base font-medium flex items-center gap-2 min-w-0">
    <span className="truncate">{p.name}</span>

    <span className="shrink-0 text-sm text-amber-600">
      {Number(p.total_tournament_points)} TP{" "}
      <span className="hidden sm:inline text-xs text-amber-600">(Turnierpunkte)</span>
    </span>
  </div>
                      <div className="text-[11px] text-neutral-500">
                        {/*ID: <span className="font-mono">{p.id}</span>*/}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full flex-col items-start text-left leading-tight gap-1.5 sm:w-auto sm:items-end sm:text-right sm:shrink-0">


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
                          "rounded-full border px-3 py-[3px] text-[12px] font-medium " +
                          (isCompared
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-blue-200 bg-blue-50 text-blue-600 hover:bg-neutral-50")
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
{/* Tab-Navigation */}
<div className="flex gap-2 text-xs mb-1">
  <button
    type="button"
    onClick={() => {
      setDetailTabs((prev) => ({ ...prev, [p.id]: "stats" }));
    }}
    className={`px-3 py-1 rounded-full border ${
      currentDetailTab === "stats"
        ? "bg-white shadow-sm font-semibold"
        : "bg-transparent text-neutral-500"
    }`}
  >
    Statistiken
  </button>

{(isOwnerOfProfile(p.id) || isAdmin) &&  (
  <button
    type="button"
    onClick={() => {
      setDetailTabs((prev) => ({ ...prev, [p.id]: "single" }));
      loadSinglePlay(p.id);
    }}
    className={`px-3 py-1 rounded-full border ${
      currentDetailTab === "single"
        ? "bg-white shadow-sm font-semibold"
        : "bg-transparent text-neutral-500"
    }`}
  >
    Single Play
  </button>
)}

{(isOwnerOfProfile(p.id) || isAdmin) &&  (

  <button
    type="button"
    onClick={() => {
      setDetailTabs((prev) => ({ ...prev, [p.id]: "info" }));
      setInfoDraft((prev) => ({
        ...prev,
        [p.id]: prev[p.id] ?? (p.info ?? ""),
      }));
    }}
    className={`px-3 py-1 rounded-full border ${
      currentDetailTab === "info"
        ? "bg-white shadow-sm font-semibold"
        : "bg-transparent text-neutral-500"
    }`}
  >
    Info
  </button>
  
)}

{(isOwnerOfProfile(p.id) || isAdmin) &&  (
    <button
      type="button"
      onClick={() => {
        setDetailTabs((prev) => ({ ...prev, [p.id]: "edit" }));
      }}
      className={`px-3 py-1 rounded-full border ${
        currentDetailTab === "edit"
          ? "bg-white shadow-sm font-semibold"
          : "bg-transparent text-neutral-500"
      }`}
    >
      Profil bearbeiten
    </button>
)}

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

                    

                    
                    {/* Tab: INFO */}
{currentDetailTab === "info" && (() => {
  const mode = infoMode[p.id] ?? (isAdmin ? "edit" : "preview");
  const currentText = infoDraft[p.id] ?? (p.info ?? "");
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-neutral-900">ℹ️ Info</div>
            <div className="text-xs text-neutral-500">
              Freie Notizen zum Spieler (z.B. Lieblingsmaschine, Besonderheiten, Kontakt, etc.). Markdown wird unterstützt.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isAdmin ? (
              <div className="text-[11px] text-neutral-400">nur Admin kann bearbeiten</div>
            ) : null}

            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setInfoMode((prev) => ({
                  ...prev,
                  [p.id]: mode === "edit" ? "preview" : "edit",
                }))
              }
            >
              {mode === "edit" ? "Vorschau" : "Bearbeiten"}
            </Button>
          </div>
        </div>
      </div>

      {infoMsg[p.id] ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            String(infoMsg[p.id]).includes("✅")
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {infoMsg[p.id]}
        </div>
      ) : null}

      {mode === "preview" ? (
        <div className="rounded-xl border bg-white p-3">
          <div className="mb-2 text-[11px] text-neutral-500">
            Vorschau
          </div>
          {mdRender(currentText)}
          {isAdmin ? (
            <div className="mt-3 text-[11px] text-neutral-400">
              Tipp: Überschrift mit <span className="font-mono">##</span>, Liste mit <span className="font-mono">-</span>, fett mit <span className="font-mono">**text**</span>, Link mit <span className="font-mono">[text](url)</span>.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-3 space-y-2">
          <label className="block text-xs font-medium text-neutral-600">
            Notizen (Markdown möglich)
          </label>
          <textarea
            className="w-full min-h-[160px] rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200 disabled:bg-neutral-100"
            placeholder={"Beispiele:\n## Stärken\n- Multiball\n- Kontrolle\n\n> Achtung bei Tilt\n\nLieblingsmaschine: [Attack from Mars](https://ipdb.org)"}
            value={currentText}
            onChange={(e) =>
              setInfoDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
            }
            disabled={!isAdmin || infoSaving[p.id]}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-neutral-500">
              {isAdmin ? "Wird im Profil gespeichert." : "Du kannst es lesen, aber nicht ändern."}
            </div>
            <Button
              size="sm"
              disabled={!isAdmin || infoSaving[p.id]}
              onClick={() => saveInfo(p.id)}
            >
              {infoSaving[p.id] ? "Speichert…" : "Speichern"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
})()}

{/* Tab: SINGLE PLAY */}
                    {currentDetailTab === "single" && (
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="rounded-xl border bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-neutral-900">
<div className="mb-3">
  {/* Titelzeile */}
  <div className="flex items-center gap-2 mb-1">
    <span className="text-lg">🎯</span>
    <h2 className="text-lg font-semibold text-neutral-900">
      Single Play Training
    </h2>
  </div>

  {/* Untertitel */}
  <p className="text-xs text-neutral-500 leading-snug">
    Run starten, dann nach jeder Kugel sofort eintragen. Am Ende Gesamt-Score speichern.
  </p>
</div>



                              </div>
                            </div>
                            <div className="text-[11px] text-neutral-500">pro Spieler-Profil</div>
                          </div>
                        </div>

                        {/* Error */}
                        {spError[p.id] ? (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {spError[p.id]}
                          </div>
                        ) : null}

                        {/* Maschinen-Ladefehler */}
                        {spMachinesError ? (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {spMachinesError}
                          </div>
                        ) : null}


{/* Active Run oder Start */}
{(() => {
  const run = spActiveRun[p.id] ?? null;
  const events = spBallEvents[p.id] ?? [];

  // ✅ Archiv-Run geöffnet?
  const opened = spOpenedArchivedRun[p.id] ?? null;
  const openedEvents = spOpenedArchivedEvents[p.id] ?? [];

  const machines = (spMachines || []).filter((m: any) => m && (m.active !== false));

  const drainOptions = [
    { v: "left_outlane", l: "Linke Outlane" },
    { v: "middle", l: "Mitte" },
    { v: "right_outlane", l: "Rechte Outlane" },
    { v: "tilt", l: "Tilt" },
    { v: "danger_room", l: "Danger Room" },
    { v: "other", l: "Sonstiges" },
  ];

const saveOptionGroups = [
  {
    label: "Nudge",
    options: [
      { v: "nudge_double", l: "Nudge Double Up" },
      { v: "nudge_left", l: "Nudge Left" },
      { v: "nudge_left_up", l: "Nudge Left Up" },
      { v: "nudge_left_up_right", l: "Nudge Left Up Right" },
      { v: "nudge_right", l: "Nudge Right" },
      { v: "nudge_right_up", l: "Nudge Right Up" },
      { v: "nudge_right_up_left", l: "Nudge Right Up Left" },
    ],
  },
  {
    label: "Slap / Save",
    options: [
      { v: "single_slap_save", l: "Single Slap Save" },
      { v: "single_slap_save_nudge", l: "Single Slap Save Nudge" },
      { v: "double_slap_save", l: "Double Slap Save" },
      { v: "one_finger_nudge", l: "One Finger Nudge" },
      { v: "dead_bounce", l: "Dead Bounce" },
      { v: "death_save", l: "Death Save" },
    ],
  },
  {
    label: "Sonstiges",
    options: [
      { v: "shake_it", l: "Shake it" },
      { v: "shatz", l: "Shatz" },
      { v: "confused", l: "Confused" },
      { v: "too_slow", l: "Too Slow" },
      { v: "other", l: "Other" },
    ],
  },
];

// Flatten for quick lookup in saveLabel()
const saveOptions = saveOptionGroups.flatMap((g) => g.options);

  // ✅ Helfer: hübsche Labels aus values
  const drainLabel = (v: any) => {
    const s = String(v ?? "");
    const hit = drainOptions.find((o) => o.v === s);
    return hit?.l ?? (s ? s : "–");
  };

  const saveLabel = (v: any) => {
    const s = String(v ?? "");
    const hit = saveOptions.find((o) => o.v === s);
    return hit?.l ?? (s ? s : "–");
  };

  // ✅ NEU: EIN Render-Block für Ball-Karten (wird für Live + Archiv benutzt)
  const renderBallCards = (list: any[]) => {
    const sorted = (list ?? []).slice().sort((a: any, b: any) => (a.ball_no ?? 0) - (b.ball_no ?? 0));

    return (
      <div className="space-y-2">
        {sorted.map((e: any, idx: number) => {
          const ballNo = Number(e.ball_no ?? 0);

          // "Score nach Ball" ist kumuliert (wie in deinem UI)
          const scoreCum =
            Number.isFinite(Number(e.ball_score)) ? Number(e.ball_score) : null;

          const prev = idx > 0 ? sorted[idx - 1] : null;
          const prevCum =
            prev && Number.isFinite(Number(prev.ball_score)) ? Number(prev.ball_score) : 0;

          // "Ball-Score (relativ)" = Differenz zum vorherigen kumulierten Score
          const scoreRel =
            scoreCum == null ? null : Math.max(0, scoreCum - (Number.isFinite(prevCum) ? prevCum : 0));

          const dz = drainLabel(e.drain_zone);
          const sa = saveLabel(e.save_action);

          return (
            <div key={e.id ?? `${ballNo}-${idx}`} className="rounded-xl border bg-white p-3 text-[12px] text-neutral-800">
              {/* Header: 🎱 Ball X • Score gesamt • Ball-Score relativ */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <div className="font-semibold flex items-center gap-2">
                  <span aria-hidden>🎱</span>
                  <span>Ball {ballNo || "–"}</span>
                </div>

                <span className="text-neutral-300">•</span>

                <div className="text-neutral-700">
                  Score (gesamt):{" "}
                  <span className="font-semibold tabular-nums">{Number(scoreCum).toLocaleString("en-US") ?? "–"}</span>
                </div>

                <span className="text-neutral-300">•</span>

                <div className="text-neutral-700">
                  Ball-Score (relativ):{" "}
                  <span className="font-semibold tabular-nums">{Number(scoreRel).toLocaleString("en-US") ?? "–"}</span>
                </div>
              </div>

              {/* 2 Spalten: Drain / Save */}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-neutral-50 p-2">
                  <div className="text-[11px] font-medium text-neutral-500">
                    Wo ist die Kugel raus?
                  </div>
                  <div className="mt-0.5 font-medium text-neutral-800">{dz}</div>
                </div>

                <div className="rounded-lg bg-neutral-50 p-2">
                  <div className="text-[11px] font-medium text-neutral-500">
                    Was getan um zu retten?
                  </div>
                  <div className="mt-0.5 font-medium text-neutral-800">{sa}</div>
                </div>
              </div>

              {/* Details */}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-neutral-50 p-2">
                  <div className="text-[11px] font-medium text-neutral-500">Drain Detail</div>
                  <div className="mt-0.5 text-neutral-700">{e.drain_detail ? String(e.drain_detail) : "–"}</div>
                </div>

                <div className="rounded-lg bg-neutral-50 p-2">
                  <div className="text-[11px] font-medium text-neutral-500">Save Detail</div>
                  <div className="mt-0.5 text-neutral-700">{e.save_action_detail ? String(e.save_action_detail) : "–"}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ✅ 1) Archiv-Run (read-only), nur wenn KEIN aktiver Run läuft
  if (!run && opened) {
    const machineName = opened.machine?.name ?? "–";
    const machineEmoji = opened.machine?.icon_emoji ? String(opened.machine.icon_emoji).trim() : "";

    return (
      <div className="space-y-3">
        <div className="rounded-xl border bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-neutral-700">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-500">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" />
                    Archiv-Run (Read-only)
                </div>
              </div>
              <div className="mt-1 text-sm font-semibold text-neutral-900">
                {machineEmoji ? `${machineEmoji} ` : ""}{machineName}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                Start: {opened.started_at ? new Date(opened.started_at).toLocaleString() : "–"}
                {" · "}
                Ende: {opened.finished_at ? new Date(opened.finished_at).toLocaleString() : "–"}
              </div>
              <div className="mt-1 text-[12px] text-neutral-700">
                Gesamt-Score: <span className="font-semibold tabular-nums">{Number(opened.total_score ).toLocaleString("en-US") ?? "–"}</span>
              </div>
              {opened.run_detail && opened.run_detail.trim().length > 0 ? (
                <div className="mt-1 text-[12px] text-neutral-600">
                  <span className="font-medium text-neutral-700">Run-Detail:</span>{" "}
                  <span className="italic">{opened.run_detail}</span>
                </div>
              ) : null}
            </div>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeArchivedSinglePlayRun(p.id);
              }}
            >
              Schließen
            </Button>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs font-semibold text-neutral-700 mb-2">Gespeicherte Bälle</div>

          {openedEvents.length === 0 ? (
            <div className="text-[12px] text-neutral-500">Keine Ball-Daten.</div>
          ) : (
            renderBallCards(openedEvents)
          )}
        </div>
      </div>
    );
  }

  // ✅ 2) Kein aktiver Run → Start UI
  if (!run) {
    const startMachineId = spStartMachineId[p.id] ?? "";
    return (
      <div className="rounded-xl border bg-white p-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Maschine</label>
            <Select
              value={startMachineId}
              onChange={(e) =>
                setSpStartMachineId((prev) => ({ ...prev, [p.id]: e.target.value }))
              }
              disabled={spMachinesLoading}
              className="bg-white text-neutral-900"
            >
              <option value="">{spMachinesLoading ? "Lade Maschinen…" : "Bitte wählen"}</option>

              {machines.map((m: any) => {
                const loc = m.location_name ?? m.locationName ?? "";
                const machine = m.machine_name ?? m.machineName ?? m.name ?? "";
                const label = loc ? `${loc} — ${machine}` : machine;

                return (
                  <option key={m.id} value={m.id} className="text-neutral-900">
                    {label}
                  </option>
                );
              })}
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={!startMachineId || spMachinesLoading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startSinglePlayRun(p.id, startMachineId);
              }}
            >
              Run starten
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ 3) Aktiver Run → Werte berechnen
  const existingBalls = new Set((events || []).map((e: any) => Number(e.ball_no)).filter(Boolean));
  const nextBall = [1, 2, 3].find((b) => !existingBalls.has(b)) ?? 3;

  const draft = spBallDraft[p.id] ?? {
    ball_no: nextBall,
    ball_score: "",
    drain_zone: "",
    drain_detail: "",
    save_action: "",
    save_action_detail: "",
  };

  const ballNo = Number.isFinite(Number(draft.ball_no)) ? Number(draft.ball_no) : nextBall;

  // ✅ Active Run UI
  const machineName = run.machine?.name ?? "–";
  const machineEmoji = run.machine?.icon_emoji ? String(run.machine.icon_emoji).trim() : "";

  const totalScoreDraft =
    spTotalScoreDraft[p.id] ?? (run.total_score != null ? String(run.total_score) : "");

  const all3Done = [1, 2, 3].every((b) => existingBalls.has(b));
  const ballAlreadySaved = existingBalls.has(ballNo);

  return (
    <div className="space-y-3">
      {/* Header Aktiver Run */}
      <div className="w-full rounded-xl border bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Aktiver Run
            </div>

            <div className="mt-1 text-sm font-semibold text-neutral-900">
              {machineEmoji ? `${machineEmoji} ` : ""}{machineName}
            </div>

            <div className="mt-1 text-[11px] text-neutral-500">
              Start: {run.started_at ? new Date(run.started_at).toLocaleString() : "–"}
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 px-3 text-sm text-red-600 border-red-200 hover:bg-red-50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteSinglePlayRun(p.id, run.id);
            }}
          >
            Löschen
          </Button>
        </div>
      </div>

      {/* Bereits gespeicherte Bälle (LIVE) */}
      {events.length ? (
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs font-semibold text-neutral-700 mb-2">Gespeicherte Bälle</div>
          {renderBallCards(events)}
        </div>
      ) : null}

      {/* Ball-Form (nur solange nicht alle 3 Bälle gespeichert sind) */}
      {all3Done ? (
        <div className="rounded-xl border bg-emerald-50 p-3 text-sm text-emerald-800">
          ✅ Alle 3 Bälle sind gespeichert – du kannst den Run jetzt abschließen.
        </div>
      ) : null}

      {!all3Done ? (
        <div className="rounded-xl border bg-white p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-neutral-700">Ball-Log</div>
            <div className="text-[11px] text-neutral-500">Tipp: nach jeder Kugel sofort speichern</div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Ball</label>
              <Select
                value={String(ballNo)}
                onChange={(e) =>
                  setSpBallDraft((prev) => ({
                    ...prev,
                    [p.id]: { ...draft, ball_no: Number(e.target.value) },
                  }))
                }
              >
                {[1, 2, 3].map((b) => (
                  <option key={b} value={String(b)} disabled={existingBalls.has(b)}>
                    Ball {b}{existingBalls.has(b) ? " (gespeichert)" : ""}
                  </option>
                ))}
              </Select>
              <div className="mt-1 text-[11px] text-neutral-500">
                Standard ist der nächste noch nicht gespeicherte Ball.
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Score nach Ball (optional)</label>
              <Input
                inputMode="numeric"
                placeholder="z.B. 450000"
                value={draft.ball_score}
                onChange={(e) =>
                  setSpBallDraft((prev) => ({
                    ...prev,
                    [p.id]: { ...draft, ball_score: e.target.value },
                  }))
                }
              />
            </div>
          </div>

{/* Drain + Rettung als zusammengehörige Gruppen */}
<div className="grid gap-3 sm:grid-cols-2">
  {/* Drain */}
  <div className="rounded-xl border bg-white p-3 space-y-3">
    <div className="text-[14px] font-semibold text-neutral-700 pb-2 border-b border-gray-200">🕳️ Drain</div>

    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">
        Wo ist die Kugel raus?
      </label>
      <Select
        value={draft.drain_zone}
        className="text-xs sm:text-xs"
        onChange={(e) =>
          setSpBallDraft((prev) => ({
            ...prev,
            [p.id]: { ...draft, drain_zone: e.target.value },
          }))
        }
      >
        <option value="">Bitte wählen</option>
        {drainOptions.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </Select>
    </div>

    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">
        Drain Detail (optional)
      </label>
      <Input
        placeholder="z.B. horizontal tick tack zwischen slings…"
        className="text-xs sm:text-xs"
        value={draft.drain_detail}
        onChange={(e) =>
          setSpBallDraft((prev) => ({
            ...prev,
            [p.id]: { ...draft, drain_detail: e.target.value },
          }))
        }
      />

      {(spDetailSuggestions[p.id]?.drain ?? []).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {(spDetailSuggestions[p.id]?.drain ?? []).map((t) => (
            <button
              key={t}
              type="button"
              className="rounded-full border bg-rose-50 border-rose-200 px-2 py-1 text-[11px] text-rose-700 hover:bg-rose-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                appendToDraft(p.id, "drain_detail", t);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  </div>

  {/* Rettung */}
  <div className="rounded-xl border bg-white p-3 space-y-3">
    <div className="text-[14px] font-semibold text-neutral-700 pb-2 border-b border-gray-200">🛟 Rettung</div>

    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">
        Was getan um zu retten?
      </label>
      <Select
        value={draft.save_action}
        className="text-xs sm:text-xs"
        onChange={(e) =>
          setSpBallDraft((prev) => ({
            ...prev,
            [p.id]: { ...draft, save_action: e.target.value },
          }))
        }
      >
        <option value="">Bitte wählen</option>
        {saveOptionGroups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </div>

    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">
        Save Detail (optional)
      </label>
      <Input
        placeholder="z.B. nudge spät / zu stark / nicht gecheckt…"
        className="text-xs sm:text-xs"
        value={draft.save_action_detail}
        onChange={(e) =>
          setSpBallDraft((prev) => ({
            ...prev,
            [p.id]: { ...draft, save_action_detail: e.target.value },
          }))
        }
      />

      {(spDetailSuggestions[p.id]?.save ?? []).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {(spDetailSuggestions[p.id]?.save ?? []).map((t) => (
            <button
              key={t}
              type="button"
              className="rounded-full border bg-blue-50 border-blue-200 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                appendToDraft(p.id, "save_action_detail", t);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  </div>
</div>


          <div className="flex items-center justify-end">
            {ballAlreadySaved ? (
              <div className="text-[11px] text-neutral-500">
                Dieser Ball ist bereits gespeichert. Bitte wähle den nächsten Ball.
              </div>
            ) : null}

            <Button
              type="button"
              variant="secondary"
              disabled={!draft.drain_zone || !draft.save_action || ballAlreadySaved}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                upsertSinglePlayBall(p.id, run.id, {
                  ballNo: ballNo,
                  ballScore: draft.ball_score,
                  drainZone: draft.drain_zone,
                  drainDetail: draft.drain_detail,
                  saveAction: draft.save_action,
                  saveActionDetail: draft.save_action_detail,
                });
              }}
            >
              Ball speichern
            </Button>
          </div>
        </div>
      ) : null}


{/* Finish */}
<div className="rounded-xl border bg-white p-3 space-y-1">
  <div className="text-xs font-semibold text-neutral-700">
    Run abschließen
  </div>

  {/* Zeile 1: Gesamt-Score + Button */}

  {/* Zeile 2: Run Detail – volle Breite */}
  <div>
    <label className="block text-xs font-medium text-neutral-600 mb-1">
      Run Detail
    </label>

    <textarea
      rows={3}
      className="w-full rounded-md border border-neutral-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900"
      placeholder="z.B. Setup, besondere Ereignisse, Probleme, Lernpunkte …"
      value={spRunDetailDraft[p.id] ?? ""}
      onChange={(e) =>
        setSpRunDetailDraft((prev) => ({
          ...prev,
          [p.id]: e.target.value,
        }))
      }
    />
  </div>

  {(spDetailSuggestions[p.id]?.run ?? []).length > 0 ? (
  <div className="flex flex-wrap gap-2">
    {(spDetailSuggestions[p.id]?.run ?? []).map((t) => (
      <button
        key={t}
        type="button"
        className="rounded-full border bg-green-50 border-green-200 px-2 py-1 text-[11px] text-green-700 hover:bg-green-100"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          appendToRunDetailDraft(p.id, t);
        }}
      >
        {t}
      </button>
    ))}
  </div>
) : null}

  <div className="grid gap-3 sm:grid-cols-2">


    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1 mt-2">
        Gesamt-Score
      </label>
      <Input
        inputMode="numeric"
        placeholder="Endscore"
        value={totalScoreDraft}
        onChange={(e) =>
          setSpTotalScoreDraft((prev) => ({
            ...prev,
            [p.id]: e.target.value,
          }))
        }
      />
    </div>

    <div className="flex items-end">
      <Button
        type="button"
        className="w-full"
        disabled={!totalScoreDraft}
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const n = Number(
            String(totalScoreDraft).replace(/[^0-9]/g, "")
          );
          if (!Number.isFinite(n) || n <= 0) {
            setSpError((prev) => ({
              ...prev,
              [p.id]: "Bitte einen gültigen Gesamt-Score eingeben",
            }));
            return;
          }

          await finishSinglePlayRun(
            p.id,
            run.id,
            n,
            spRunDetailDraft[p.id] // 👈 Run Detail mitsenden
          );
        }}
      >
        Run abschließen
      </Button>
    </div>
  </div>


</div>


    </div>
  );
})()}



                        {/* Archiv */}
                        <div className="rounded-xl border bg-white p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-semibold text-neutral-700">Archiv (letzte Runs)</div>
                            <button
                              type="button"
                              className="text-[11px] text-neutral-600 underline underline-offset-2"
                              onClick={() => loadSinglePlay(p.id)}
                            >
                              neu laden
                            </button>
                          </div>

                          {spLoading[p.id] ? (
                            <div className="text-[12px] text-neutral-500">Lade…</div>
                          ) : (spArchiveRuns[p.id] ?? []).length === 0 ? (
                            <div className="text-[12px] text-neutral-500">Noch keine gespeicherten Runs.</div>
                          ) : (
                            <div className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 390 }}>
{(spArchiveRuns[p.id] ?? []).slice(0, 10).map((r) => {
  const label = `${r.machine?.name ?? "–"}${r.finished_at ? " (" + new Date(r.finished_at).toLocaleString() + ")" : ""}`;

  return (
    <div
      key={r.id}
      className="rounded-lg border bg-neutral-50 p-2 text-[12px] text-neutral-700 flex items-center justify-between gap-3 cursor-pointer hover:bg-neutral-100"

      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openArchivedSinglePlayRun(p.id, r.id);
      }}
    >
      {/* links: Text */}
      <div className="min-w-0">
        <div className="font-semibold truncate">
          {r.machine?.icon_emoji ? `${r.machine.icon_emoji} ` : ""}
          {r.machine?.name ?? "–"}
        </div>
        <div>
          Score: <span className="tabular-nums font-semibold">

            {Number(r.total_score).toLocaleString("en-US") ?? "–"}

          </span>
          <span className="text-neutral-400"> • </span>
          {r.finished_at ? new Date(r.finished_at).toLocaleString() : "–"}
        </div>
        {r.run_detail ? (


                <div className="text-[12px] text-neutral-500">
                  <span className="text-[12px] font-semibold">Run-Detail:</span>{" "}
                  <span className="italic">{r.run_detail}</span>
                </div>
          
        ) : null}
      </div>


      {/* rechts: Löschen */}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-8 px-3 text-sm text-red-600 border-red-200 hover:bg-red-50"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          deleteArchivedSinglePlayRun(p.id, r.id, label);
        }}
      >
        Löschen
      </Button>
    </div>
  );
})}

                            </div>
                          )}
                        </div>


{/* ✅ Statistik (Single Play) */}
<div className="rounded-xl border bg-white p-3 space-y-3">
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                    <span>📊</span>
                    <span>Statistik (Training)</span>
      </div>
      <div className="text-[11px] text-neutral-500">
        Trend & Tabelle pro Maschine (älteste → neueste).
      </div>
    </div>
    <div className="mt-4">
                  {/* ✅ Neu laden (oben rechts): aktualisiert Sparkline/Runs + Ball-Stats */}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const curMachineId = spStatsMachineId[p.id] ?? "";
                  const curRange = spStatsRange[p.id] ?? "20";

                  // 1) Runs (Sparkline + Tabelle) neu laden
                  await loadSinglePlay(p.id);

                  // 2) Ball-Events neu laden
                  await loadSinglePlayStatsEvents(p.id, curMachineId, curRange);
                }}
                disabled={(spLoading[p.id] ?? false) || (spStatsEventsLoading[p.id] ?? false)}
              >
                {(spLoading[p.id] ?? false) || (spStatsEventsLoading[p.id] ?? false)
                  ? "Lade…"
                  : "Neu laden"}
              </Button>
    </div>
  </div>

  {(() => {
    const allRuns = spArchiveRuns[p.id] ?? [];

    // Filter UI
    const machineId = spStatsMachineId[p.id] ?? "";
    const range = spStatsRange[p.id] ?? "20";

    const machinesForFilter = [
      { id: "", name: "Alle Maschinen" },
      ...(spMachines || [])
        .filter((m: any) => m && (m.active !== false))
        .map((m: any) => ({
          id: m.id,
          name:
            (m.location_name ? `${m.location_name} — ` : "") +
            (m.machine_name ?? m.name ?? "–"),
        })),
    ];

    // Runs filtern
    let filtered = allRuns.slice();

    if (machineId) {
      filtered = filtered.filter((r: any) => String(r.machine_id ?? r.machine?.id ?? "") === machineId);
    }

    // Chronologisch (älteste -> neueste) für Sparkline
    filtered.sort((a: any, b: any) => {
      const ta = a.finished_at ? new Date(a.finished_at).getTime() : 0;
      const tb = b.finished_at ? new Date(b.finished_at).getTime() : 0;
      return ta - tb;
    });

    // Range anwenden
    if (range !== "all") {
      const n = Number(range);
      if (Number.isFinite(n) && n > 0) {
        filtered = filtered.slice(Math.max(0, filtered.length - n));
      }
    }

    const scores = filtered
      .map((r: any) => Number(r.total_score))
      .filter((n: any) => Number.isFinite(n));

    // UI: Runs-Tabelle soll nach 5 Einträgen scrollen (statt endlos zu wachsen)
    // Hinweis: Einträge haben leicht unterschiedliche Höhe (Run-Detail optional).
    // Daher nehmen wir eine robuste "Card-Höhe" als Richtwert.
    const RUNS_TABLE_VISIBLE_ROWS = 5;
    const RUNS_TABLE_ROW_EST_PX = 78; // ~1 Card (mit Datum + ggf. kurzer Detailzeile)
    const runsTableMaxHeightPx = RUNS_TABLE_VISIBLE_ROWS * RUNS_TABLE_ROW_EST_PX;

    return (
      <div className="space-y-3">
        {/* Filter */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Maschine</label>
            <Select
              value={machineId}
              onChange={(e) => setSpStatsMachineId((prev) => ({ ...prev, [p.id]: e.target.value }))}
              className="bg-white text-neutral-900"
            >
              {machinesForFilter.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Zeitraum</label>
            <Select
              value={range}
              onChange={(e) => setSpStatsRange((prev) => ({ ...prev, [p.id]: e.target.value }))}
              className="bg-white text-neutral-900"
            >
              <option value="10">Letzte 10 Runs</option>
              <option value="20">Letzte 20 Runs</option>
              <option value="50">Letzte 50 Runs</option>
              <option value="all">Alle (max. geladen)</option>
            </Select>
          </div>

        </div>

        {/* Sparkline */}
        <div className="rounded-lg border bg-neutral-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-neutral-700">Score-Verlauf</div>
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-neutral-500">{scores.length} Runs</div>


            </div>
          </div>
          <Sparkline values={scores} />
        </div>

        {/* Tabelle */}
        <div className="rounded-lg border bg-white p-3">
          <div className="text-xs font-semibold text-neutral-700 mb-2">Runs (Tabelle)</div>

          {filtered.length === 0 ? (
            <div className="text-[12px] text-neutral-500">Keine Runs im Filter.</div>
          ) : (
            <div
              className="space-y-2 overflow-y-auto pr-1"
              style={{ maxHeight: runsTableMaxHeightPx }}
            >
              {filtered
                .slice()
                .reverse() // neueste oben in Tabelle
                .map((r: any) => {
                  const dt = r.finished_at ? new Date(r.finished_at).toLocaleString() : "–";
                  const machineName = r.machine?.name ?? r.machine_name ?? "–";
                  const icon = r.machine?.icon_emoji ? String(r.machine.icon_emoji).trim() : "";
                  const runDetail = (r.run_detail ?? r.notes ?? "").trim();

                  return (
                    <div key={r.id} className="rounded-lg border bg-neutral-50 p-2 text-[12px] text-neutral-700">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold truncate">
                          {icon ? `${icon} ` : ""}
                          {machineName}
                        </div>
                        <div className="tabular-nums font-semibold">{fmtScore(r.total_score)}</div>
                      </div>

                      <div className="mt-1 text-[11px] text-neutral-500">{dt}</div>

                      {runDetail ? (
                        <div className="mt-1 text-[11px] text-neutral-700">
                          <span className="font-semibold">Run-Detail:</span> {runDetail}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* ✅ Drilldown: Drains & letzter Rettungsversuch (letzte 50 Runs) */}
        {(() => {
          const machineId = spStatsMachineId[p.id] ?? "";
          const events = spStatsEvents[p.id] ?? [];
          const loading = spStatsEventsLoading[p.id] ?? false;
          const err = spStatsEventsError[p.id] ?? "";

          const range = spStatsRange[p.id] ?? "20";
          const runsUsed = spStatsEventRuns[p.id] ?? [];

          const machineLabel = machineId
            ? (spMachines.find((m: any) => String(m.id) === String(machineId))?.machine_name ??
               spMachines.find((m: any) => String(m.id) === String(machineId))?.machineName ??
               spMachines.find((m: any) => String(m.id) === String(machineId))?.name ??
               "–")
            : "Alle";

          const rangeLabel = String(range).toLowerCase() === "all" ? "Alle" : `Letzte ${range}`;
          const runsLabel = `${runsUsed.length} Runs`;

          // Labels
          const drainLabel: Record<string, string> = {
            left_outlane: "Linke Outlane",
            middle: "Mitte",
            right_outlane: "Rechte Outlane",
            danger_room: "Danger Room",
            other: "Sonstiges",
            "": "–",
          };

          const saveLabel: Record<string, string> = {
            nudge: "Nudge",
            double_nudge: "Double Nudge",
            nudge_left: "Nudge Left",
            nudge_right: "Nudge Right",
            nudge_left_under: "Nudge Left Under",
            nudge_right_under: "Nudge Right Under",
            nudge_left_under_right: "Nudge Left Under Right",
            nudge_right_under_left: "Nudge Right Under Left",
            slap_save: "Slap Save",
            single_slap_save: "Single Slap Save",
            double_slap_save: "Double Slap Save",
            death_save: "Death Save",
            dead_bounce: "Dead Bounce",
            shatz: "Shatz",
            confused: "Confused",
            not_checked: "Nicht gecheckt",
            other: "Sonstiges",
            "": "–",
          };

          const humanizeSaveAction = (k: any) => {
            const raw = String(k ?? "");
            if (!raw) return "–";
            return (saveLabel[raw] ?? raw.split("_").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "));
          };

          // Zone counts
          const total = events.length || 0;
          const zoneCounts = new Map<string, number>();
          for (const ev of events) {
            const z = String(ev.drain_zone ?? "");
            zoneCounts.set(z, (zoneCounts.get(z) ?? 0) + 1);
          }

          const zones = Array.from(zoneCounts.entries())
            .map(([zone, count]) => ({ zone, count }))
            .sort((a, b) => b.count - a.count);

          const openZone = spDrainOpenZone[p.id] ?? "";
          const detailFilter = spDrainDetailFilter[p.id] ?? "";

          // Helper: Events in open zone
          const zoneEvents = openZone
            ? events.filter((ev) => String(ev.drain_zone ?? "") === openZone)
            : [];

          // Drain detail badge counts (only in this zone)
          const drainBadgeCounts = new Map<string, number>();
          for (const ev of zoneEvents) {
            for (const b of extractQuotedParts(String(ev.drain_detail ?? ""))) {
              drainBadgeCounts.set(b, (drainBadgeCounts.get(b) ?? 0) + 1);
            }
          }

          const drainBadges = Array.from(drainBadgeCounts.entries())
            .map(([badge, count]) => ({ badge, count }))
            .sort((a, b) => b.count - a.count);

          // Save action counts – optionally filtered by selected drain detail badge
          const saveCounts = new Map<string, number>();
          for (const ev of zoneEvents) {
            if (detailFilter) {
              const badges = extractQuotedParts(String(ev.drain_detail ?? ""));
              if (!badges.includes(detailFilter)) continue;
            }
            const a = String(ev.save_action ?? "");
            saveCounts.set(a, (saveCounts.get(a) ?? 0) + 1);
          }

          const saveTotal = Array.from(saveCounts.values()).reduce((acc, n) => acc + n, 0);

          const saveRows = Array.from(saveCounts.entries())
            .map(([action, count]) => ({
              action,
              count,
              pct: saveTotal ? Math.round((count / saveTotal) * 100) : 0,
            }))
            .sort((a, b) => b.count - a.count);


// Save details grouped by save_action (so you know WHICH detail belongs to WHICH attempt)
const saveDetailsByAction = new Map<string, Map<string, number>>();

for (const ev of zoneEvents) {
  // keep EXACT same filtering logic as saveRows:
  if (detailFilter) {
    const drainBadges = extractQuotedParts(String(ev.drain_detail ?? ""));
    if (!drainBadges.includes(detailFilter)) continue;
  }

  const action = String(ev.save_action ?? "");
  if (!action) continue;

  const badges = extractQuotedParts(String(ev.save_action_detail ?? ""));
  if (badges.length === 0) continue;

  if (!saveDetailsByAction.has(action)) {
    saveDetailsByAction.set(action, new Map<string, number>());
  }
  const m = saveDetailsByAction.get(action)!;

  for (const b of badges) {
    m.set(b, (m.get(b) ?? 0) + 1);
  }
}





          // Save detail badge counts (same filter as saveRows: zone + optional drain-detail filter)
          const saveDetailCounts = new Map<string, number>();
          for (const ev of zoneEvents) {
            if (detailFilter) {
              const badges = extractQuotedParts(String(ev.drain_detail ?? ""));
              if (!badges.includes(detailFilter)) continue;
            }

            for (const b of extractQuotedParts(String(ev.save_action_detail ?? ""))) {
              saveDetailCounts.set(b, (saveDetailCounts.get(b) ?? 0) + 1);
            }
          }

          const saveDetailBadges = Array.from(saveDetailCounts.entries())
            .map(([badge, count]) => ({ badge, count }))
            .sort((a, b) => b.count - a.count);



            const pieRows = zones.map((z) => ({
              label: drainLabel[z.zone] ?? z.zone,
              value: z.count,
            }));
          // Initial load trigger (when machine filter changes)
          // -> IMPORTANT: do this in a useEffect normally, but we can also call in onChange handler.
          // We do it properly below with an effect in section 4.

          return (
            <div className="rounded-lg border bg-white p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                    <span>🕳️</span>
                    <span>Drains & letzter Rettungsversuch</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Basis: Ball-Events aus dem aktuellen Filter.
                    <br />
                    Maschine: <span className="font-semibold text-neutral-700">{machineLabel}</span>{" · "}Zeitraum: <span className="font-semibold text-neutral-700">{rangeLabel}</span>{" · "}Runs: <span className="font-semibold text-neutral-700">{runsLabel}</span>.
                  </div>
                </div>

                {/* Button wurde nach oben in den Score-Verlauf-Header verschoben */}
              </div>

              {err ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[12px] text-red-700">{err}</div>
              ) : null}

              {loading ? (
                <div className="text-[12px] text-neutral-500">Lade Ball-Events…</div>
              ) : total === 0 ? (
                <div className="text-[12px] text-neutral-500">Keine Ball-Events gefunden.</div>
              ) : (
                <div className="space-y-2">
                  {/* Zonen Tabelle */}
                  <div className="text-[12px] font-semibold text-neutral-700">Wo ist die Kugel raus?</div>
                  <DrainPieChart rows={pieRows} height={220} colors={PIE_COLORS} />

                  <div className="space-y-1">
                    {zones.map((r, i) => {
                      const pct = total ? Math.round((r.count / total) * 100) : 0;
                      const isOpen = openZone === r.zone;

                      return (
                        <div key={r.zone} className="rounded-md border bg-neutral-50">
                          <button
                            type="button"
                            className="w-full px-2 py-2 text-left flex items-center justify-between gap-2 cursor-pointer"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSpDrainDetailFilter((prev) => ({ ...prev, [p.id]: "" }));
                                      setSpSelectedSaveAction((prev) => ({ ...prev, [p.id]: null }));
                                      setSpSelectedSaveDetail((prev) => ({ ...prev, [p.id]: null })); // filter reset when switching zone
                              setSpDrainOpenZone((prev) => ({ ...prev, [p.id]: isOpen ? "" : r.zone }));
                            }}
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-[12px] text-neutral-800">
                                <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 align-middle" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{drainLabel[r.zone] ?? r.zone}
                              </div>
                              <div className="text-[11px] text-neutral-500">{r.count}x • {pct}%</div>
                            </div>
                            <div className="text-[12px] text-neutral-500">{isOpen ? "▲" : "▼"}</div>
                          </button>

                          {/* Drilldown Panel */}
                          {isOpen ? (
                            <div className="border-t bg-white p-2 space-y-2">
                              {/* Active filters */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-[11px] text-neutral-600">
                                  Filter: <span className="font-semibold">{drainLabel[r.zone] ?? r.zone}</span>
                                  {detailFilter ? (
                                    <> {" · "} Detail: <span className="font-semibold">{detailFilter}</span></>
                                  ) : null}
                                </div>

                                {detailFilter ? (
                                  <button
                                    type="button"
                                    className="text-[11px] text-neutral-600 underline underline-offset-2"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSpDrainDetailFilter((prev) => ({ ...prev, [p.id]: "" }));
                                      setSpSelectedSaveAction((prev) => ({ ...prev, [p.id]: null }));
                                      setSpSelectedSaveDetail((prev) => ({ ...prev, [p.id]: null }));
                                    }}
                                  >
                                    Detail-Filter löschen
                                  </button>
                                ) : null}
                              </div>

                              <div className="grid gap-2 sm:grid-cols-2">
                                {/* Drain detail badges */}
                                <div className="rounded-md border bg-neutral-50 p-2">
                                  <div className="text-[11px] font-semibold text-neutral-700 mb-2">Drain-Details</div>

                                  {drainBadges.length === 0 ? (
                                    <div className="text-[11px] text-neutral-500">Keine '...' Details gefunden.</div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {drainBadges.slice(0, 30).map((b) => {
                                        const active = detailFilter === b.badge;
                                        return (
                                          <button
                                            key={b.badge}
                                            type="button"
                                            className={
                                              "rounded-full border px-2 py-1 text-[11px] transition-colors " +
                                              (active
                                                ? "bg-red-600 text-white border-red-600"
                                                : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100")
                                            }
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setSpDrainDetailFilter((prev) => ({
                                                ...prev,
                                                [p.id]: active ? "" : b.badge,
                                              }));
                                              setSpSelectedSaveAction((prev) => ({ ...prev, [p.id]: null }));
                                              setSpSelectedSaveDetail((prev) => ({ ...prev, [p.id]: null }));
                                            }}
                                          >
                                            {b.badge} <span className={active ? "opacity-80" : "text-neutral-400"}>({b.count})</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Save action counts (crossfiltered by badge) */}
{/* Save action counts + Save-Details pro Rettungsversuch (crossfiltered by badge) */}
{(() => {
  // Save-Details pro Rettungsversuch (save_action) gruppieren
  const saveDetailsByAction = new Map<string, Map<string, number>>();

  for (const ev of zoneEvents) {
    // gleiche Filterlogik wie bei saveRows:
    // wenn ein Drain-Detail-Badge aktiv ist, nur diese Events
    if (detailFilter) {
      const drainBadges = extractQuotedParts(String(ev.drain_detail ?? ""));
      if (!drainBadges.includes(detailFilter)) continue;
    }

    const action = String(ev.save_action ?? "");
    if (!action) continue;

    const badges = extractQuotedParts(String(ev.save_action_detail ?? ""));
    if (badges.length === 0) continue;

    if (!saveDetailsByAction.has(action)) {
      saveDetailsByAction.set(action, new Map<string, number>());
    }
    const m = saveDetailsByAction.get(action)!;

    for (const b of badges) {
      m.set(b, (m.get(b) ?? 0) + 1);
    }
  }

  return (
    <div className="rounded-md border bg-neutral-50 p-2">
      <div className="text-[11px] font-semibold text-neutral-700 mb-2">
        Letzter Rettungsversuch
      </div>

      {saveRows.length === 0 ? (
        <div className="text-[11px] text-neutral-500">Keine Daten im Filter.</div>
      ) : (
        <div className="space-y-2">
          {saveRows.map((s, idx) => {
            const badgeMap = saveDetailsByAction.get(s.action);
            const badges = badgeMap
              ? Array.from(badgeMap.entries())
                  .map(([badge, count]) => ({ badge, count }))
                  .sort((a, b) => b.count - a.count)
              : [];

            return (
              <button
                key={s.action}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSpSelectedSaveAction((prev) => {
                    const cur = prev[p.id];
                    const next = { zone: r.zone, drainDetail: detailFilter ?? "", action: s.action };
                    const same = cur && cur.zone === next.zone && cur.drainDetail === next.drainDetail && cur.action === next.action;
                    return { ...prev, [p.id]: same ? null : next };
                  });
                  // wenn Action wechselt, Badge-Auswahl löschen
                  setSpSelectedSaveDetail((prev) => ({ ...prev, [p.id]: null }));
                }}
                className={(() => {
                  const selA = spSelectedSaveAction[p.id];
                  const active = !!selA && selA.zone === r.zone && selA.drainDetail === (detailFilter ?? "") && selA.action === s.action;
                  return (
                    "w-full text-left rounded-lg border bg-white p-2 transition-shadow " +
                    (active ? "ring-2 ring-neutral-300 border-neutral-300" : "hover:shadow-sm")
                  );
                })()}
              >
                <div className="flex items-center justify-between text-[12px] text-neutral-700">
                  
<div className="flex items-center gap-2 font-medium">
  
{idx < 7 && (
  
  <span
    className="inline-block h-3 w-3 rounded-full"
    style={{ backgroundColor: ACTION_COLORS[idx % ACTION_COLORS.length] }}
  />
)}

  <span>{humanizeSaveAction(s.action)}</span>
</div>

                  <div className="tabular-nums font-semibold">{s.count}x • {s.pct}%</div>
                </div>


                {badges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {badges.slice(0, 12).map((b) => {
                      const activeSel = spSelectedSaveDetail[p.id];
                      const isActive =
                        !!activeSel &&
                        activeSel.zone === r.zone &&
                        activeSel.drainDetail === (detailFilter ?? "") &&
                        activeSel.action === s.action &&
                        activeSel.badge === b.badge;

                      return (
                        <button
                          key={b.badge}
                          type="button"
                          className={
                            "rounded-full border px-2 py-1 text-[11px] bg-blue-50 text-blue-700 border-blue-200 transition-colors " +
                            (isActive ? "ring-2 ring-blue-300" : "hover:bg-blue-100")
                          }
                          title={`${b.count}x`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSpSelectedSaveAction((prev) => ({ ...prev, [p.id]: { zone: r.zone, drainDetail: detailFilter ?? "", action: s.action } }));
                            setSpSelectedSaveDetail((prev) => {
                              const cur = prev[p.id];
                              const next = {
                                zone: r.zone,
                                drainDetail: detailFilter ?? "", 
                                action: s.action,
                                badge: b.badge,
                              };
                              const same =
                                cur &&
                                cur.zone === next.zone &&
                                cur.drainDetail === next.drainDetail &&
                                cur.action === next.action &&
                                cur.badge === next.badge;
                              return { ...prev, [p.id]: same ? null : next };
                            });
                          }}
                        >
                          {b.badge} <span className="text-blue-400">({b.count})</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
})()}



                         
                              </div>

                              

                              {/* Run-Details: Klick auf Rettungsversuch (Save-Action) oder Save-Detail-Badge */}
                              {(() => {
                                const selDetail = spSelectedSaveDetail[p.id];
                                const selAction = spSelectedSaveAction[p.id];

                                // Kontext muss zum aktuellen Drilldown passen
                                const ctxZone = r.zone;
                                const ctxDrainDetail = detailFilter ?? "";

                                const detailActive =
                                  !!selDetail &&
                                  selDetail.zone === ctxZone &&
                                  (selDetail.drainDetail ?? "") === ctxDrainDetail;

                                const actionActive =
                                  !!selAction &&
                                  selAction.zone === ctxZone &&
                                  (selAction.drainDetail ?? "") === ctxDrainDetail;

                                if (!detailActive && ! actionActive) {
                                  return null;
                                }

                                // Filter-Mode
                                const mode: "detail" | "action" = detailActive ? "detail" : "action";
                                const actionKey = detailActive ? String(selDetail!.action) : String(selAction!.action);
                                const badgeKey = detailActive ? String(selDetail!.badge) : "";

                                // passende Events bestimmen
                                const matchingEvents = zoneEvents.filter((ev: any) => {
                                  // drain-detail filter ist bereits im ctx (detailFilter)
                                  if (ctxDrainDetail) {
                                    const drainBadges = extractQuotedParts(String(ev.drain_detail ?? ""));
                                    if (!drainBadges.includes(ctxDrainDetail)) return false;
                                  }

                                  if (String(ev.save_action ?? "") !== actionKey) return false;

                                  if (mode === "detail") {
                                    const saveBadges = extractQuotedParts(String(ev.save_action_detail ?? ""));
                                    if (!saveBadges.includes(badgeKey)) return false;
                                  }

                                  return true;
                                });

                                const runIds = Array.from(new Set(matchingEvents.map((ev: any) => ev.run_id).filter(Boolean)));
                                const runsById = new Map((runsUsed ?? []).map((rr: any) => [rr.id, rr]));
                                const matchingRuns = runIds
                                  .map((id: any) => runsById.get(id))
                                  .filter(Boolean);

                                // Häufigste Run-Detail Texte (Top 5)
                                const freq = new Map<string, { count: number; latestTs: number }>();
                                for (const rr of matchingRuns as any[]) {
                                  const txtRaw = String(rr?.run_detail ?? "").trim();
                                  const txt = txtRaw ? txtRaw : "(kein Run-Detail)";
                                  const ts = rr?.finished_at ? new Date(rr.finished_at).getTime() : 0;
                                  const cur = freq.get(txt);
                                  if (!cur) {
                                    freq.set(txt, { count: 1, latestTs: ts });
                                  } else {
                                    cur.count += 1;
                                    if (ts > cur.latestTs) cur.latestTs = ts;
                                  }
                                }

                                const top = Array.from(freq.entries())
                                  .map(([text, v]) => ({ text, count: v.count, latestTs: v.latestTs }))
                                  .sort((a, b) => (b.count - a.count) || (b.latestTs - a.latestTs))
                                  .slice(0, 5);

                                const title = mode === "detail"
                                  ? (<>Run-Notizen zu: <span className="text-blue-700">{badgeKey}</span></>)
                                  : (<>Run-Notizen zum Rettungsversuch: <span className="text-neutral-900">{humanizeSaveAction(actionKey)}</span></>);

                                const close = (e: any) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (mode === "detail") {
                                    setSpSelectedSaveDetail((prev) => ({ ...prev, [p.id]: null }));
                                  } else {
                                    setSpSelectedSaveAction((prev) => ({ ...prev, [p.id]: null }));
                                  }
                                };

                                return (
                                  <div className="mt-2 rounded-md border bg-neutral-50 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <div className="text-[12px] font-semibold text-neutral-800">{title}</div>
                                        <div className="text-[11px] text-neutral-500">
                                          {ctxDrainDetail ? (
                                            <>
                                              Drain-Detail: <span className="font-semibold text-neutral-700">{ctxDrainDetail}{" · "}</span>
                                            </>
                                          ) : null}
                                          Save: <span className="font-semibold text-neutral-700">{humanizeSaveAction(actionKey)}</span>
                                        </div>
                                      </div>
                                      <button type="button" className="text-[11px] text-neutral-500 hover:text-neutral-800 underline" onClick={close}>
                                        schließen
                                      </button>
                                    </div>

                                    {top.length === 0 ? (
                                      <div className="mt-2 text-[12px] text-neutral-600">Keine passenden Runs gefunden.</div>
                                    ) : (
                                      <div className="mt-2 space-y-2">
                                        {top.map((t) => {
                                          const when = t.latestTs ? new Date(t.latestTs).toLocaleString() : "—";
                                          return (
                                            <div key={t.text} className="rounded-md border bg-white p-2">
                                              <div className="flex items-center justify-between">
                                                <div className="text-[11px] text-neutral-500">{when}</div>
                                                <div className="text-[11px] font-semibold text-neutral-700 tabular-nums">{t.count}×</div>
                                              </div>
                                              <div className={"mt-1 text-[12px] whitespace-pre-wrap " + (t.text === "(kein Run-Detail)" ? "text-neutral-500 italic" : "text-neutral-800")}>{t.text}</div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

<div className="text-[11px] text-neutral-500">
                                Tipp: Klick auf ein Detail-Badge filtert rechts die Rettungsversuche.
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}


        
        {/* ✅ Mirror-Drilldown: Letzte Rettungsversuche & Drains (Save-first) */}
        {(() => {
          const machineId = spStatsMachineId[p.id] ?? "";
          const events = spStatsEvents[p.id] ?? [];
          const loading = spStatsEventsLoading[p.id] ?? false;
          const err = spStatsEventsError[p.id] ?? "";

          const range = spStatsRange[p.id] ?? "20";
          const runsUsed = spStatsEventRuns[p.id] ?? [];

          const machineLabel = machineId
            ? (spMachines.find((m: any) => String(m.id) === String(machineId))?.machine_name ??
               spMachines.find((m: any) => String(m.id) === String(machineId))?.machineName ??
               spMachines.find((m: any) => String(m.id) === String(machineId))?.name ??
               "–")
            : "Alle";

          const rangeLabel =
            String(range).toLowerCase() === "all"
              ? "Alle"
              : `Letzte ${range}`;

          const runsLabel = `${runsUsed.length} Runs`;

          // Labels (Drain-Zonen) – gleiche Übersetzung wie im anderen Drilldown
          const drainLabel: Record<string, string> = {
            left_outlane: "Linke Outlane",
            middle: "Mitte",
            right_outlane: "Rechte Outlane",
            danger_room: "Danger Room",
            other: "Sonstiges",
            "": "–",
          };

          const saveLabel: Record<string, string> = {
            nudge: "Nudge",
            nudge_double: "Nudge Double",
            nudge_left: "Nudge Left",
            nudge_right: "Nudge Right",
            nudge_left_under: "Nudge Left Under",
            nudge_right_under: "Nudge Right Under",
            nudge_left_under_right: "Nudge Left Under Right",
            nudge_right_under_left: "Nudge Right Under Left",
            slap_save: "Slap Save",
            single_slap_save: "Single Slap Save",
            double_slap_save: "Double Slap Save",
            death_save: "Death Save",
            dead_bounce: "Dead Bounce",
            shatz: "Shatz",
            confused: "Confused",
            not_checked: "Nicht gecheckt",
            other: "Sonstige",
          };

          // Save-Actions (Level 1)
          const saveActionCounts = new Map<string, number>();
          for (const ev of events) {
            const a = String(ev.save_action ?? "").trim();
            if (!a) continue;
            saveActionCounts.set(a, (saveActionCounts.get(a) ?? 0) + 1);
          }
          const saveActions = Array.from(saveActionCounts.entries())
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count);

          const totalSave = saveActions.reduce((acc, r) => acc + r.count, 0);

          const openAction = spSaveOpenAction[p.id] ?? "";

          const runsById = new Map((runsUsed ?? []).map((r: any) => [r.id, r]));

          return (
            <div className="rounded-lg border bg-white p-3 space-y-3 mt-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                    <span>🛟</span>
                    <span>Letzte Rettungsversuche & Drains</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Basis: Ball-Events aus dem aktuellen Filter.
                    <br />
                    Maschine: <span className="font-semibold text-neutral-700">{machineLabel}</span>, Zeitraum:{" "}
                    <span className="font-semibold text-neutral-700">{rangeLabel}</span>,{" "}
                    <span className="font-semibold text-neutral-700">{runsLabel}</span>.
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="text-[12px] text-neutral-500">Lade Ball-Events…</div>
              ) : err ? (
                <div className="text-[12px] text-red-600">{err}</div>
              ) : saveActions.length === 0 ? (
                <div className="text-[12px] text-neutral-500">Keine Ball-Events im aktuellen Filter.</div>
              ) : (
                <div className="space-y-3">
                  {/* Überblick: Häufigste Rettungsversuche (Top 7) */}
                  <SaveBarChart
                    rows={saveActions
                      .slice(0, 7)
                      .map((r) => ({
                        label: safeText(saveLabel[r.action] ?? r.action),
                        value: r.count,
                        pct: totalSave ? Math.round((r.count / totalSave) * 100) : 0,
                      }))}
                    height={220}
                  />

                  <div className="space-y-2">
                    {saveActions.map((row, idx) => {
                    const isOpen = openAction === row.action;

                    const pct = totalSave ? Math.round((row.count / totalSave) * 100) : 0;

                    // Events in dieser Action
                    const actionEvents = events.filter((ev: any) => String(ev.save_action ?? "") === row.action);

                    // Save-Detail Badges (blau)
                    const saveBadgeCounts = new Map<string, number>();
                    for (const ev of actionEvents) {
                      const badges = extractQuotedParts(String(ev.save_action_detail ?? ""));
                      for (const b of badges) saveBadgeCounts.set(b, (saveBadgeCounts.get(b) ?? 0) + 1);
                    }
                    const saveBadges = Array.from(saveBadgeCounts.entries())
                      .map(([badge, count]) => ({ badge, count }))
                      .sort((a, b) => b.count - a.count);

                    const activeSaveBadge = spSaveDetailFilter[p.id] ?? "";

                    // ActionEvents gefiltert nach Save-Badge (wenn gesetzt)
                    const actionEventsAfterSaveBadge = activeSaveBadge
                      ? actionEvents.filter((ev: any) => extractQuotedParts(String(ev.save_action_detail ?? "")).includes(activeSaveBadge))
                      : actionEvents;

                    // Drain-Zonen (rechts)
                    const zoneCounts = new Map<string, number>();
                    for (const ev of actionEventsAfterSaveBadge) {
                      const z = String(ev.drain_zone ?? "").trim();
                      if (!z) continue;
                      zoneCounts.set(z, (zoneCounts.get(z) ?? 0) + 1);
                    }
                    const zones = Array.from(zoneCounts.entries())
                      .map(([zone, count]) => ({ zone, count }))
                      .sort((a, b) => b.count - a.count);

                    const totalZone = zones.reduce((acc, z) => acc + z.count, 0);

                    const activeZone = spSaveDrainZoneFilter[p.id] ?? "";
                    const activeDrainDetail = spSaveDrainDetailFilter[p.id] ?? "";

                    // Run-Notizen: erst zeigen, wenn Kontext "später" ist:
                    // - Drain-Detail gewählt ODER
                    // - Save-Detail + Drain-Zone gewählt
                    const showRunNotes = !!activeZone; // Ebene früher: sobald eine Drain-Zone gewählt ist

                    // Matching Run IDs für Run-Notizen
                    let matchingRunIds: string[] = [];
                    if (showRunNotes && activeZone) {
                      const filteredForNotes = actionEventsAfterSaveBadge.filter((ev: any) => {
                        if (String(ev.drain_zone ?? "") !== activeZone) return false;
                        if (activeDrainDetail) {
                          const dBadges = extractQuotedParts(String(ev.drain_detail ?? ""));
                          if (!dBadges.includes(activeDrainDetail)) return false;
                        }
                        return true;
                      });
                      matchingRunIds = Array.from(new Set(filteredForNotes.map((ev: any) => ev.run_id).filter(Boolean)));
                    }

                    // Top 5 häufigste Run-Detail Texte
                    const getRunMachineLabel = (run: any) => {
                      const mid = String(run?.machine_id ?? run?.machine?.id ?? "").trim();
                      if (!mid) return "";
                      const hit = (spMachines || []).find((m: any) => String(m?.id) === String(mid));
                      return String(hit?.machine_name ?? hit?.machineName ?? hit?.name ?? "").trim();
                    };

                    const runDetailCounts = new Map<string, number>();
                    const runDetailMeta = new Map<string, { finished_at?: string; machine?: string }>();
                    for (const rid of matchingRunIds) {
                      const r = runsById.get(rid);
                      if (!r) continue;
                      const txt = String(r.run_detail ?? "").trim();
                      const key = txt || "(kein Run-Detail)";
                      runDetailCounts.set(key, (runDetailCounts.get(key) ?? 0) + 1);
                      if (!runDetailMeta.has(key)) runDetailMeta.set(key, { finished_at: r.finished_at, machine: getRunMachineLabel(r) });
                    }
                    const topRunDetails = Array.from(runDetailCounts.entries())
                      .map(([text, count]) => ({ text, count, finished_at: runDetailMeta.get(text)?.finished_at, machine: runDetailMeta.get(text)?.machine }))
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 5);

                    return (
                      <div key={safeText(row.action)} className="rounded-md border bg-neutral-50">
                        <button
                          type="button"
                          className="w-full px-2 py-2 text-left flex items-center justify-between gap-2 cursor-pointer"
                          onClick={() => {
                            setSpSaveOpenAction((prev) => ({ ...prev, [p.id]: isOpen ? "" : row.action }));
                            // Reset Detail-Filter beim Wechsel der Action
                            setSpSaveDetailFilter((prev) => ({ ...prev, [p.id]: "" }));
                            setSpSaveDrainZoneFilter((prev) => ({ ...prev, [p.id]: "" }));
                            setSpSaveDrainDetailFilter((prev) => ({ ...prev, [p.id]: "" }));
                          }}
                        >
                          <div className="min-w-0">
<div className="flex items-center gap-2 font-semibold text-[12px] text-neutral-800">
  {idx < 7 && (
    <span
      className="inline-block h-3 w-3 rounded-full"
      style={{ backgroundColor: ACTION_COLORS[idx] }}
    />
  )}
  <span>{safeText(saveLabel[row.action] ?? row.action)}</span>
</div>
                            <div className="text-[11px] text-neutral-500">{row.count}x • {pct}%</div>
                          </div>
                          <div className="text-[12px] text-neutral-500">{isOpen ? "▲" : "▼"}</div>
                        </button>

                        {isOpen ? (
                          <div className="border-t bg-white p-2 space-y-2">
                            <div className="grid gap-3 md:grid-cols-2">
                              {/* Links: Save-Details */}
                              <div className="rounded-md border bg-neutral-50 p-3">
                                <div className="text-[11px] font-semibold text-neutral-700 mb-2">Save-Details</div>
                                {saveBadges.length === 0 ? (
                                  <div className="text-[11px] text-neutral-500">Keine Save-Details.</div>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {saveBadges.slice(0, 16).map((b) => {
                                      const active = activeSaveBadge === b.badge;
                                      return (
                                        <button
                                          key={safeText(b.badge)}
                                          type="button"
                                          className={
                                            "rounded-full border px-2 py-1 text-[11px] " +
                                            (active
                                              ? "bg-blue-600 text-white border-blue-600"
                                              : "bg-blue-50 text-blue-700 border-blue-200")
                                          }
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setSpSaveDetailFilter((prev) => ({
                                              ...prev,
                                              [p.id]: active ? "" : b.badge,
                                            }));
                                            // beim Badge-Wechsel: Zone/Detail Reset
                                            setSpSaveDrainZoneFilter((prev) => ({ ...prev, [p.id]: "" }));
                                            setSpSaveDrainDetailFilter((prev) => ({ ...prev, [p.id]: "" }));
                                          }}
                                          title={`${b.count}x`}
                                        >
                                          {safeText(b.badge)}{" "}
                                          <span className={active ? "opacity-80" : "text-blue-400"}>({b.count})</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Rechts: Drains (Zonen + Drain-Details immer sichtbar) */}
                              <div className="rounded-md border bg-neutral-50 p-3">
                                <div className="text-[11px] font-semibold text-neutral-700">Drains</div>

                                {zones.length === 0 ? (
                                  <div className="text-[11px] text-neutral-500">Keine Drains.</div>
                                ) : (
                                  <div className="space-y-2">
                                    {zones.map((z) => {
                                      const zActive = activeZone === z.zone;

                                      const zPct = totalZone ? Math.round((z.count / totalZone) * 100) : 0;

                                      const zEvents = actionEventsAfterSaveBadge.filter(
                                        (ev: any) => String(ev.drain_zone ?? "") === z.zone
                                      );

                                      // Drain-Details (rot) innerhalb dieser Zone
                                      const drainBadgeCounts = new Map<string, number>();
                                      for (const ev of zEvents) {
                                        const db = extractQuotedParts(String(ev.drain_detail ?? ""));
                                        for (const b of db) drainBadgeCounts.set(b, (drainBadgeCounts.get(b) ?? 0) + 1);
                                      }
                                      const drainBadges = Array.from(drainBadgeCounts.entries())
                                        .map(([badge, count]) => ({ badge, count }))
                                        .sort((a, b) => b.count - a.count);

return (
  <button
    key={safeText(z.zone)}
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();

      // WICHTIG: NICHT togglen, sonst schließt du andere Zonen.
      // Wir merken nur, welche Zone "aktiv" ist (für Detail-Filter), aber öffnen/schließen machen wir nicht mehr.
      setSpSaveDrainZoneFilter((prev) => ({
        ...prev,
        [p.id]: z.zone,
      }));

      // optional: Detail reset beim "Zone auswählen"
      setSpSaveDrainDetailFilter((prev) => ({ ...prev, [p.id]: "" }));
    }}
    className={(() => {
      const isOpen = drainBadges.length > 0; // Ebene 5 existiert => immer offen
      // Optional: optisches "Active" nur wenn wirklich activeZone === z.zone
      const active = activeZone === z.zone;

      return (
        "w-full text-left rounded-lg border bg-white p-2 transition-shadow " +
        (active ? "ring-2 ring-neutral-300 border-neutral-300" : "hover:shadow-sm")
      );
    })()}
  >
    {(() => {
      const isOpen = drainBadges.length > 0; // Ebene 5 existiert => immer offen

      return (
        <>
          <div className="flex items-center justify-between text-[12px] text-neutral-700">
            <div className="font-medium">
              {safeText(drainLabel[z.zone] ?? z.zone)}
            </div>
            <div className="tabular-nums font-semibold">
              {z.count}x • {zPct}%
            </div>
          </div>

          {/* IMMER offen wenn Badges existieren */}
          {isOpen && (
            <div className="mt-2 flex flex-wrap gap-2">
              {drainBadges.slice(0, 10).map((b) => {
                // dActive soll nur gelten, wenn diese Zone gerade "ausgewählt" ist
                const dActive = activeZone === z.zone && activeDrainDetail === b.badge;

                return (
                  <button
                    key={safeText(b.badge)}
                    type="button"
                    className={
                      "rounded-full border px-2 py-1 text-[11px] " +
                      (dActive
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-red-50 text-red-700 border-red-200")
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      // Zone merken (damit dActive konsistent ist)
                      setSpSaveDrainZoneFilter((prev) => ({ ...prev, [p.id]: z.zone }));

                      // Detail togglen
                      setSpSaveDrainDetailFilter((prev) => ({
                        ...prev,
                        [p.id]: dActive ? "" : b.badge,
                      }));
                    }}
                    title={`${b.count}x`}
                  >
                    {safeText(b.badge)}{" "}
                    <span className={dActive ? "opacity-80" : "text-red-400"}>
                      ({b.count})
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      );
    })()}
  </button>
);



                                    })}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Run-Notizen (Top 5) – erst später wie im oberen Block */}
                            {showRunNotes ? (
                              <div className="mt-3 rounded-md border bg-neutral-50 p-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-[12px] font-semibold text-neutral-800">
                                      Run-Notizen{" "}
                                      {activeSaveBadge ? (
                                        <>
                                          zu: <span className="text-blue-700">{safeText(activeSaveBadge)}</span>
                                        </>
                                      ) : (
                                        <>
                                          zum Rettungsversuch: <span className="text-neutral-900">{safeText(saveLabel[row.action] ?? row.action)}</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-neutral-500">
                                      Drain-Detail:{" "}
                                      <span className="font-medium text-neutral-700">
                                        {activeDrainDetail ? `'${activeDrainDetail}'` : "—"}
                                      </span>
                                      {" · "}
                                      Save:{" "}
                                      <span className="font-medium text-neutral-700">
                                        {safeText(saveLabel[row.action] ?? row.action)}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="text-[11px] text-neutral-500 hover:text-neutral-800 underline"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSpSaveDrainZoneFilter((prev) => ({ ...prev, [p.id]: "" }));
                                      setSpSaveDrainDetailFilter((prev) => ({ ...prev, [p.id]: "" }));
                                      setSpSaveDetailFilter((prev) => ({ ...prev, [p.id]: "" }));
                                    }}
                                  >
                                    schließen
                                  </button>
                                </div>

                                {topRunDetails.length === 0 ? (
                                  <div className="mt-2 text-[12px] text-neutral-500">Keine passenden Runs.</div>
                                ) : (
                                  <div className="mt-2 space-y-2">
                                    {topRunDetails.map((r) => (
                                      <div key={r.text} className="rounded-md border bg-white p-2">
                                        <div className="flex items-center justify-between">
                                          <div className="text-[11px] text-neutral-500">
                                            {r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}                                            {r.count === 1 && r.machine ? (
                                              <> · <span className="font-semibold text-neutral-700">{safeText(r.machine)}</span></>
                                            ) : null}                                          </div>
                                          <div className="text-[12px] font-semibold text-neutral-700">{r.count}×</div>
                                        </div>
                                        <div className="mt-1 text-[12px] text-neutral-800 whitespace-pre-wrap">
                                          {r.text}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            <div className="mt-2 text-[11px] text-neutral-500">
                              Tipp: Klick auf ein Save-Detail (blau) filtert rechts die Drains.
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                </div>
              )}
            </div>
          );
        })()}


{/* Platzhalter für die nächsten Statistik-Blöcke */}
        <div className="">
          <div className="">

          </div>

          <div className="">

          </div>
        </div>
      </div>
    );
  })()}
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
                                <div className="min-w-0">
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
<li className="flex items-center gap-2 w-full min-w-0">
  <div className="min-w-0 flex-1 basis-0 truncate">
    <span className="truncate font-medium">{m.machineName ?? "Maschine"}</span>
    {m.locationName && (
      <span className="truncate  text-neutral-500"> ({m.locationName})</span>
    )}
  </div>

  <span className="shrink-0 whitespace-nowrap text-right text-[13px] tabular-nums">
    {m.matchesPlayed} Matches
    {winRatePercent != null && (
      <>
        {" "}· <span>{winRatePercent}%</span>
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
                                <div className="min-w-0">
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
                                            className="flex items-center gap-2 min-w-0"
                                          >
                                            <div className="min-w-0 w-0 flex-1">
                                              <div className="truncate">
                                                <span className="font-medium">{m.machineName ?? "Maschine"}</span>
                                                {m.locationName && (
                                                  <span className="text-neutral-500"> ({m.locationName})</span>
                                                )}
                                              </div>
                                            </div>

                                            <span className="shrink-0 whitespace-nowrap text-right text-[13px]">
                                              {avgPos != null && (
                                                <span className="tabular-nums font-semibold">Ø {avgPos}</span>
                                              )}
                                              {winRatePercent != null && (
                                                <span className="tabular-nums text-neutral-600"> · {winRatePercent}%</span>
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

                                          {/* 🆕 Sparkline: Winrate-Verlauf (Maschine+Location) */}
                                          {Array.isArray((m as any).winRateSeries) &&
                                          ((m as any).winRateSeries?.length ?? 0) > 1 ? (
                                            <div className="mx-2 hidden sm:block">
                                              <svg
                                                width="120"
                                                height="22"
                                                viewBox="0 0 90 22"
                                                className="overflow-visible"
                                              >
                                                {(() => {
                                                  const vals = ((m as any).winRateSeries as number[])
                                                    .map((v) => (typeof v === "number" ? v : 0))
                                                    .slice(-30);
                                                  const n = vals.length;
                                                  const clamp = (x: number) =>
                                                    Math.max(0, Math.min(1, x));
                                                  const pts = vals.map((v, i) => {
                                                    const x = n <= 1 ? 0 : (i / (n - 1)) * 118; // 140 - 2
                                                    const y = 20 - clamp(v) * 20;
                                                    return `${x.toFixed(2)},${y.toFixed(2)}`;
                                                  });
                                                  const d = pts.join(" ");
                                                  return (
                                                    <>
                                                      <polyline
                                                        points={d}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        className="text-neutral-400"
                                                      />
                                                    </>
                                                  );
                                                })()}
                                              </svg>
                                            </div>
                                          ) : null}

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


                          <div className="mb-3">
                            <SectionTitle
                              icon="📈"
                              title="Elo-Verlauf"
                              subtitle="Entwicklung über abgeschlossene Turniere"
                            />
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

                          <div className="my-3 h-px w-full bg-neutral-200" /> {/*Strick*/}


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
                                
                                <div className="h-32 mt-1 mb-4 flex items-center min-h-[112px]">
                                  <EloSparkline values={eloValues} />
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
                                <div className="mb-3">
                                  <SectionTitle
                                    icon="🏅"
                                    title="Turniererfolge"
                                    subtitle="Turnierpunkte, Turnierplatzierung, Super-Finale Platzierung, Elo"
                                  />
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



                              {/* Liste pro Turnier */}
                              <div className="rounded-xl border bg-white p-3">

{/* Turniererfolge: 2 Tabellen nebeneinander */}
<div className="rounded-xl border bg-white p-3">
<div className="mb-3">
  <SectionTitle
    icon="🔥"
    title="Highscores"
    subtitle="Bestscore je Maschine + Turnier-Highscores"
  />
</div>

  {loadingSuccess ? (
    <div className="text-[13px] text-neutral-500">Lade Turniererfolge…</div>
  ) : successErr ? (
    <div className="text-[13px] text-red-600">{successErr}</div>
  ) : (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* LINKS */}
      <div className="rounded-xl border bg-neutral-50 p-2">
        <div className="mb-1 text-[13px] font-semibold text-neutral-700">
          🕹️ Beste globale Scores je Maschine & Location
        </div>

        {machineBests.length === 0 ? (
          <div className="text-[13px] text-neutral-500">
            Keine Daten vorhanden.
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto pr-1">
            <table className="w-full text-[13px] table-fixed">
              <colgroup>
                <col className="min-w-[75px]" />
                <col className="w-[82px] sm:w-[120px]" />
                <col className="w-[62px] sm:w-[110px]" />
              </colgroup>
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="py-1 font-medium w-auto">Maschine</th>
                  <th className="py-1 text-right font-medium w-[110px] whitespace-nowrap">Bestscore</th>
                  <th className="py-1 text-right w-[110px]"></th>
                </tr>
              </thead>
              <tbody>
                {machineBests.map((r) => (
                  <tr
                    key={`${r.machineId}__${r.locationId ?? "null"}`}
                    className="border-t border-neutral-200/60"
                  >
                    <td className="py-1.5 pr-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <MachineBadge
                          name={r.machineName}
                          emoji={r.machineIconEmoji ?? null}
                        />
                        <div className="min-w-6 w-0 flex-1">
                          <div className="font-semibold text-neutral-900 truncate">
                            {r.machineName}
                          </div>
                          <div className="text-[11px] text-neutral-500 truncate">
                            {r.locationName ?? "Unbekannte Location"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {Number(r.bestScore ?? 0).toLocaleString("de-DE")}
                    </td>
                    <td className="py-1.5 text-right">
                      {typeof r.globalRank === "number" ? (
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-semibold " +
                            (r.globalRank === 1
                              ? "bg-amber-100 text-amber-900"
                              : "bg-neutral-100 text-neutral-700")
                          }
                          title="Platzierung global innerhalb dieser Location"
                        >
{r.globalRank === 1 ? (
  <>
    <span className="sm:hidden">High #1</span>
    <span className="hidden sm:inline">Highscore #1</span>
  </>
) : (
  <>
    <span className="sm:hidden"># {r.globalRank}</span>
    <span className="hidden sm:inline">{`Rang #${r.globalRank}`}</span>
  </>
)}
                        </span>
                      ) : r.isGlobalHighscore ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-[2px] text-[11px] font-semibold text-amber-900">
                          Highscore
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECHTS */}
      <div className="rounded-xl border bg-neutral-50 p-2">
        <div className="mb-1 text-[13px] font-semibold text-neutral-700">
          🏆 Turniere: Maschinen-Highscores
        </div>

        {tournamentHighscores.length === 0 ? (
          <div className="text-[13px] text-neutral-500">
            Keine Turnier-Daten vorhanden.
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto pr-1">
            <table className="w-full text-[13px]">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="py-1 font-medium">Turnier</th>
                  <th className="py-1 text-right font-medium">Highscores</th>
                </tr>
              </thead>
              <tbody>
                {tournamentHighscores
                  .filter((t) => t.machineHighscores > 0)
                  .map((t) => {
                  const dateLabel = t.created_at
                    ? new Date(t.created_at).toLocaleDateString("de-DE")
                    : "";
                  return (
                    <tr key={t.tournamentId} className="border-t border-neutral-200/60">
                      <td className="py-1.5 pr-2">
                        <div className="font-semibold text-neutral-900 truncate">
                          {t.tournamentName}
                        </div>
                        {dateLabel && (
                          <div className="text-[11px] text-neutral-500">
                            {dateLabel}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {t.machineHighscores}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )}
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