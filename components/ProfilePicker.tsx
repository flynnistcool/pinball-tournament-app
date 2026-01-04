// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";

type Profile = {
  id: string;
  name: string;
  icon?: string | null;   // z.B. "😎"
  color?: string | null;  // z.B. "#0ea5e9"
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const out = parts.map((p) => p[0]?.toUpperCase()).join("");
  return out || "?";
}

export function ProfilePicker({
  profiles,
  value,
  onChange,
  disabled,
}: {
  profiles: Profile[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => profiles.find((p) => p.id === value) ?? null,
    [profiles, value]
  );

  // Click outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
        <div className="flex items-center gap-2 min-w-0">
          {selected ? (
            <>
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs"
                style={selected.color ? { backgroundColor: selected.color } : {}}
              >
                {(selected.icon ?? "").trim() || initials(selected.name)}
              </span>
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <span className="text-neutral-500">Profil wählen…</span>
          )}
        </div>
        <span className="text-neutral-400">▾</span>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto py-1">
            {profiles.map((p) => {
              const icon = (p.icon ?? "").trim();
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-neutral-50"
                >
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs"
                    style={p.color ? { backgroundColor: p.color } : {}}
                  >
                    {icon || initials(p.name)}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
