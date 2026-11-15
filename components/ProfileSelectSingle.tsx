"use client";

// Einfach-Auswahl eines Spielerprofils mit Avatar-Kreis (Farbe/Verlauf + Emoji bzw. Initialen) –
// wie die Spielerauswahl beim Turnier, aber nur EIN Profil (oder "kein Profil").

import { useEffect, useRef, useState } from "react";

export type ProfileSelectOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  /** Hinweis rechts (z. B. "schon mit x@y.de") */
  note?: string | null;
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function Avatar({ o }: { o: ProfileSelectOption }) {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs"
      style={o.color ? { background: o.color } : {}}
    >
      {o.icon ?? <span className="text-[10px] font-bold text-neutral-600">{initials(o.name)}</span>}
    </span>
  );
}

export default function ProfileSelectSingle({
  value,
  options,
  onChange,
  disabled,
  emptyLabel = "— kein Spielerprofil —",
}: {
  value: string;
  options: ProfileSelectOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const current = options.find((o) => o.id === value) ?? null;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function pick(id: string) {
    setOpen(false);
    if (id !== value) onChange(id);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-white px-2 text-left text-sm " +
          (disabled ? "cursor-not-allowed opacity-60" : "hover:bg-neutral-50")
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {current ? (
            <>
              <Avatar o={current} />
              <span className="truncate">{current.name}</span>
            </>
          ) : (
            <span className="text-neutral-500">{emptyLabel}</span>
          )}
        </span>
        <span className="text-neutral-400">▾</span>
      </button>

      {open && !disabled ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border bg-white shadow-lg">
          <div className="max-h-72 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => pick("")}
              className={"flex w-full items-center px-3 py-2 text-left text-sm hover:bg-neutral-50 " + (!value ? "bg-blue-50" : "")}
            >
              <span className="text-neutral-500">{emptyLabel}</span>
            </button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                className={
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 " +
                  (o.id === value ? "bg-blue-50 font-semibold" : "")
                }
              >
                <Avatar o={o} />
                <span className="truncate">{o.name}</span>
                {o.note ? <span className="ml-auto shrink-0 text-xs text-neutral-400">{o.note}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
