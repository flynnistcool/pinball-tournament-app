"use client";

// 🕹️ Admin, Reiter "Erstellen": Arcade-Lauf starten – Spieler, Schwierigkeitsgrad, Location wählen.
// Legt über /api/arcade/start ein Arcade-Turnier an und öffnet es (onStarted).

import { useEffect, useState } from "react";
import { ARCADE_MODES, arcadeKindIcon, type ArcadeMode } from "@/lib/arcade";

type Prof = { id: string; name: string; is_bot?: boolean | null };

export default function ArcadeStartCard({
  locations,
  defaultLocationId,
  onStarted,
}: {
  locations: readonly { id: string; name: string }[];
  defaultLocationId?: string | null;
  onStarted: (code: string) => void;
}) {
  const [profiles, setProfiles] = useState<Prof[]>([]);
  const [profileId, setProfileId] = useState("");
  const [mode, setMode] = useState<ArcadeMode>("easy");
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/profiles/list?ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setProfiles(Array.isArray(j?.profiles) ? j.profiles : []))
      .catch(() => setProfiles([]));
  }, []);
  useEffect(() => {
    if (!locationId && locations.length) setLocationId(defaultLocationId || locations[0].id);
  }, [locations, defaultLocationId, locationId]);

  const humans = profiles.filter((p) => !p.is_bot).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
  const def = ARCADE_MODES.find((m) => m.mode === mode) ?? ARCADE_MODES[0];

  async function start() {
    if (!profileId || !locationId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/arcade/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, mode, locationId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? "Arcade-Lauf konnte nicht gestartet werden");
        return;
      }
      onStarted(String(j.code));
    } catch {
      setErr("Netzwerkfehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border-2 border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-white to-white p-4">
      <div className="text-lg font-black">🕹️ Arcade starten</div>
      <div className="text-xs text-neutral-500">
        Kämpf dich Stufe für Stufe durch die Bots. Verloren = ein Leben weniger, derselbe Gegner nochmal.
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs font-medium text-neutral-600">👤 Spieler</div>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
          >
            <option value="">– wählen –</option>
            {humans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-medium text-neutral-600">📍 Location</div>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 text-xs font-medium text-neutral-600">🎚️ Schwierigkeitsgrad</div>
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ARCADE_MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => setMode(m.mode)}
            className={
              "rounded-xl border px-2 py-2 text-left transition " +
              (mode === m.mode ? "border-fuchsia-500 bg-fuchsia-600 text-white shadow" : "bg-white hover:bg-fuchsia-50")
            }
          >
            <div className="text-sm font-bold">
              {m.icon} {m.label}
            </div>
            <div className={"text-[11px] " + (mode === m.mode ? "text-white/80" : "text-neutral-500")}>{m.hint}</div>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-xl border bg-white p-2 text-[12px] text-neutral-700">
        <span className="font-semibold">Gegner:</span>{" "}
        {def.stages.map((s, i) => (
          <span key={s.key} className="whitespace-nowrap">
            {i ? " → " : ""}
            {arcadeKindIcon(s.kind)} {s.name}
            {s.kind === "champion" ? null : <span className="text-neutral-400"> {s.elo}</span>}
          </span>
        ))}{" "}
        · {"❤️".repeat(def.lives)}
      </div>

      {err ? <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={!profileId || !locationId || busy}
          onClick={start}
          className="rounded-xl bg-fuchsia-600 px-5 py-2.5 text-sm font-black text-white shadow hover:bg-fuchsia-700 disabled:opacity-50"
        >
          {busy ? "starte …" : `🕹️ ${def.label} starten`}
        </button>
      </div>
    </div>
  );
}
