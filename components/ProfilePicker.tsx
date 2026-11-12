import { useEffect, useMemo, useRef, useState } from "react";

type Profile = {
  id: string;
  name: string;
  icon?: string | null; // z.B. "😎"
  color?: string | null; // z.B. "#0ea5e9"
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const out = parts.map((p) => p[0]?.toUpperCase()).join("");
  return out || "?";
}

function Avatar({ p }: { p: Profile }) {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs"
      style={p.color ? { backgroundColor: p.color } : {}}
    >
      {(p.icon ?? "").trim() || initials(p.name)}
    </span>
  );
}

/**
 * Profil-Auswahl mit Mehrfachauswahl (Häkchen).
 * - Klick auf einen Eintrag setzt/entfernt das Häkchen, die Liste bleibt offen.
 * - `disabledIds`: Profile, die schon im Turnier sind → grau, "schon dabei", nicht wählbar.
 */
export function ProfilePicker({
  profiles,
  value,
  onChange,
  disabled,
  disabledIds,
}: {
  profiles: Profile[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  disabledIds?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => {
    const set = new Set(value);
    return profiles.filter((p) => set.has(p.id));
  }, [profiles, value]);

  // Click outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  return (
    <div ref={wrapRef} className="relative min-w-[240px] flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={
          "w-full rounded-xl border bg-white px-3 py-2 text-left text-sm shadow-sm " +
          "flex items-center justify-between gap-2 " +
          (disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-neutral-50")
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          {selected.length === 0 ? (
            <span className="text-neutral-500">Profile wählen…</span>
          ) : selected.length === 1 ? (
            <>
              <Avatar p={selected[0]} />
              <span className="truncate">{selected[0].name}</span>
            </>
          ) : (
            <>
              <span className="flex shrink-0 -space-x-1.5">
                {selected.slice(0, 4).map((p) => (
                  <Avatar key={p.id} p={p} />
                ))}
              </span>
              <span className="truncate">{selected.map((p) => p.name).join(", ")}</span>
              <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                {selected.length}
              </span>
            </>
          )}
        </div>
        <span className="text-neutral-400">▾</span>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1">
            {profiles.map((p) => {
              const already = disabledIds?.has(p.id) ?? false;
              const checked = value.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={already}
                  onClick={() => toggle(p.id)}
                  className={
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm " +
                    (already
                      ? "cursor-not-allowed opacity-45"
                      : checked
                      ? "bg-blue-50 hover:bg-blue-100"
                      : "hover:bg-neutral-50")
                  }
                >
                  <span
                    className={
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[12px] font-bold " +
                      (already
                        ? "border-neutral-300 bg-neutral-100 text-neutral-500"
                        : checked
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-neutral-300 bg-white text-transparent")
                    }
                  >
                    ✓
                  </span>
                  <Avatar p={p} />
                  <span className="truncate">{p.name}</span>
                  {already && <span className="ml-auto shrink-0 text-xs text-neutral-500">schon dabei</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t bg-neutral-50 px-3 py-2 text-xs">
            <span className="text-neutral-600">
              {value.length === 0 ? "Mehrere möglich" : `${value.length} ausgewählt`}
            </span>
            <span className="flex gap-1">
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="rounded-lg px-2 py-1 text-neutral-700 hover:bg-neutral-200"
                >
                  Auswahl leeren
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-neutral-900 px-2.5 py-1 font-medium text-white hover:bg-neutral-700"
              >
                Fertig
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
