"use client";

// 🤖 Schalter im Spielerprofil: Profil als KI-Bot markieren.
// Bots haben eine feste Elo (Schwierigkeitsstufe) – sie ändert sich nie,
// und Spiele gegen Bots ändern auch die Elo der Menschen nicht.

export default function BotToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs " +
        (checked ? "border-violet-300 bg-violet-50 text-violet-900" : "border-neutral-200 bg-white text-neutral-700") +
        (disabled ? " opacity-60" : " cursor-pointer")
      }
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        <span className="font-semibold">🤖 KI-Bot</span>
        <br />
        <span className="text-[11px] text-neutral-500">
          Feste Elo (oben eintragen, z. B. 1300 / 1500 / 1700 / 2000 / 2500) – ändert sich nie. Spiele gegen
          Bots ändern auch die Elo der Menschen nicht.
        </span>
      </span>
    </label>
  );
}

/** kleines 🤖-Abzeichen hinter dem Namen */
export function BotBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 " +
        className
      }
      title="KI-Bot (feste Elo)"
    >
      🤖 Bot
    </span>
  );
}

/** 🚫 Schalter: Platzhalter-/Testprofil – Scores zählen nicht für KI-Bots (und später Statistiken) */
export function PlaceholderToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs " +
        (checked ? "border-neutral-400 bg-neutral-100 text-neutral-900" : "border-neutral-200 bg-white text-neutral-700") +
        (disabled ? " opacity-60" : " cursor-pointer")
      }
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        <span className="font-semibold">🚫 Platzhalter / Testprofil</span>
        <br />
        <span className="text-[11px] text-neutral-500">
          Scores dieses Profils zählen nicht als Grundlage für KI-Bots (später auch nicht für Statistiken). Alte
          Turnierergebnisse bleiben unverändert.
        </span>
      </span>
    </label>
  );
}

/** kleines 🚫-Abzeichen hinter dem Namen */
export function PlaceholderBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-neutral-200 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600"
      title="Platzhalter-/Testprofil – zählt nicht für Bots/Statistiken"
    >
      🚫 Platzhalter
    </span>
  );
}
