"use client";

// 🤖 Bot-Art im Spielerprofil (unter dem Bot-Schalter): feste Elo / 👻 Ghost-Bot / ⚡ Form-Bot.
// Ghost und Form folgen einem echten Spieler (Auswahl). Rechnung: lib/botMirror.ts

import { BotKindsOverviewLink, type OverviewBot } from "@/components/BotKindsOverview";
import { useBotSettings } from "@/components/useBotSettings";

export type BotKindValue = "fixed" | "ghost" | "form" | "rival" | "gambler" | "pro" | "champion" | "specialist" | "character";

/** Bot-Arten, die einem Spieler folgen (Auswahl nötig) */
const OWNER_KINDS: BotKindValue[] = ["ghost", "form", "rival"];

const KINDS: { v: BotKindValue; label: string; hint: string }[] = [
  { v: "fixed", label: "🤖 Feste Elo", hint: "Spielt wie ein typischer Spieler mit der oben eingetragenen Elo." },
  {
    v: "gambler",
    label: "🔴 Gambler",
    hint: "Feste Elo (oben), aber sehr wechselhaft: breiter Bereich und viele Ausreißer – mal Pech, mal Wahnsinn. Streuung im Bot-Labor einstellbar.",
  },
  {
    v: "specialist",
    label: "🟠 Specialist",
    hint: "Feste Elo (oben), aber in jedem Turnier 2 Lieblingsflipper (bei höchstens 4 aktiven Flippern 1) – dort +250 Elo. Der Admin sieht „liebt heute: …“ und kann ihm seinen Flipper zuteilen. Im Bot-Labor einstellbar.",
  },
  {
    v: "character",
    label: "🎭 Charakter",
    hint: "Feste Elo (oben), aber wie ein echter Mensch: je Turnier 2 Lieblingsflipper (+250 Elo) und 2 Angstflipper (−250 Elo); bei 4–6 aktiven Flippern je 1, bis 3 nur ein Liebling. Der Admin sieht „liebt / mag nicht“. Im Bot-Labor einstellbar.",
  },
  {
    v: "champion",
    label: "👑 Champion",
    hint: "Spielt wie die Besten: würfelt zwischen den 85 % und 97 % besten aller echten Scores am Flipper – unabhängig von der Elo (die Elo oben zählt nur für Siegchance/Favorit). Im Bot-Labor einstellbar.",
  },
  {
    v: "pro",
    label: "🟣 Pro",
    hint: "Feste Elo (oben), aber sehr konstant: enger Bereich, kaum Ausreißer. Streuung im Bot-Labor einstellbar.",
  },
  {
    v: "ghost",
    label: "👻 Ghost-Bot",
    hint: "Spielt wie der gewählte Spieler: würfelt aus ALLEN seinen Scores am Flipper (mit seinen Schwankungen). Unter 3 Scores: wie ein Spieler seiner Elo.",
  },
  {
    v: "form",
    label: "⚡ Form-Bot",
    hint: "Folgt der aktuellen Form des gewählten Spielers: Durchschnitt seiner letzten 2 Scores am Flipper ±5 % (auch von heute). Noch nie gespielt: wie ein Spieler seiner Elo.",
  },
  {
    v: "rival",
    label: "🥊 Rivalen-Bot",
    hint: "Wächst mit dem gewählten Spieler: startet mit seiner Elo, wird nach jedem direkten Duell 25 stärker, wenn der Spieler vorne liegt, und 25 schwächer, wenn er verliert (zählt sofort, 1000–2800).",
  },
];

export default function BotKindPicker({
  kind,
  ownerId,
  owners,
  bots,
  onKind,
  onOwner,
  disabled,
}: {
  /** alle Bot-Profile (für „📖 Alle Bot-Arten erklärt“) */
  bots?: readonly OverviewBot[];
  kind: BotKindValue;
  ownerId: string;
  /** echte Spieler (keine Bots) */
  owners: readonly { id: string; name: string }[];
  onKind: (v: BotKindValue) => void;
  onOwner: (id: string) => void;
  disabled?: boolean;
}) {
  const active = KINDS.find((k) => k.v === kind) ?? KINDS[0];
  const settings = useBotSettings(true);
  return (
    <div className="mt-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-violet-900">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Bot-Art</span>
        <BotKindsOverviewLink settings={settings} bots={bots ?? []} />
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {KINDS.map((k) => (
          <button
            key={k.v}
            type="button"
            disabled={disabled}
            onClick={() => onKind(k.v)}
            className={
              "rounded-full border px-2.5 py-1 font-semibold transition disabled:opacity-50 " +
              (kind === k.v ? "border-violet-500 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-800 hover:bg-violet-100")
            }
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 text-[11px] text-violet-800/80">{active.hint}</div>
      {OWNER_KINDS.includes(kind) ? (
        <label className="mt-2 flex items-center gap-2">
          <span className="shrink-0 font-semibold">
            {kind === "ghost" ? "Spielt wie:" : kind === "rival" ? "Rivale von:" : "Folgt der Form von:"}
          </span>
          <select
            value={ownerId}
            disabled={disabled}
            onChange={(e) => onOwner(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-2 py-1 text-sm text-neutral-900"
          >
            <option value="">– Spieler wählen –</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {kind === "ghost" || kind === "form" ? (
        <div className="mt-1 text-[11px] text-violet-800/80">Die Elo des Bots wird automatisch auf die Elo dieses Spielers gesetzt.</div>
      ) : kind === "rival" ? (
        <div className="mt-1 text-[11px] text-violet-800/80">
          Startstärke = Elo des Spielers beim ersten Speichern; danach rechnet sich die Stärke aus euren Duellen.
        </div>
      ) : null}
    </div>
  );
}

