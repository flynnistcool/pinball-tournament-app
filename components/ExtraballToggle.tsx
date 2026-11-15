"use client";

// 🎱 Schalter "Mit Extraball": Turniere mit Extraball haben meist deutlich höhere Scores.
// KI-Bots (und später Rekorde) vergleichen nach Punkteniveau (siehe lib/botRules.ts → scoreLevel).
// locked = Format wird immer mit Extraball gespielt (Round the Pinball, Timeplay) → fest an.

export default function ExtraballToggle({
  checked,
  onChange,
  disabled,
  locked,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const isOn = locked || checked;
  const off = disabled || locked;
  return (
    <label
      className={
        "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition " +
        (isOn ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-neutral-200 bg-neutral-50 text-neutral-800") +
        (off ? (locked ? " cursor-default" : " opacity-60") : " cursor-pointer hover:bg-white")
      }
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={isOn}
        onChange={(e) => onChange(e.target.checked)}
        disabled={off}
      />
      <span>
        <span className="font-semibold">
          🎱 Mit Extraball{locked ? <span className="ml-1.5 text-xs font-normal">🔒 immer bei diesem Format</span> : null}
        </span>
        <span className="block text-xs text-neutral-500">
          {locked
            ? "Dieses Format wird immer mit Extraball gespielt. Die Scores zählen für Vergleiche (KI-Bots) als normales Punkteniveau."
            : "Mit Extraball werden die Scores meist deutlich höher. KI-Bots vergleichen dann vor allem mit Extraball-Spielen."}
        </span>
      </span>
    </label>
  );
}

/** kleines Abzeichen für Turnierkopf / Archiv (on = mit Extraball, sonst dezent "ohne Extraball") */
export function ExtraballBadge({ on = true }: { on?: boolean }) {
  return on ? (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"
      title="Dieses Turnier wird mit Extraball gespielt"
    >
      🎱 mit Extraball
    </span>
  ) : (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500"
      title="Dieses Turnier wird ohne Extraball gespielt"
    >
      <span className="mr-1 opacity-60 grayscale">🎱</span>ohne Extraball
    </span>
  );
}
