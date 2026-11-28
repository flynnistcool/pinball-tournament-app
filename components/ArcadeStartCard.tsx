"use client";

// 🕹️ Admin, Reiter "Erstellen": Arcade-Lauf starten – Spieler, Schwierigkeitsgrad, Location wählen.
// Legt über /api/arcade/start ein Arcade-Turnier an und öffnet es (onStarted).

import { useEffect, useState } from "react";
import { ARCADE_MODES, arcadeKindIcon, arcadeModeDef, arcadeUnlocked, type ArcadeMode } from "@/lib/arcade";
import { PLAY_MINUTE_OPTIONS } from "@/lib/playMinutes";

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
  // Spielweise: bestimmt, als welches Format die Scores gespeichert werden
  const [style, setStyle] = useState<"matchplay" | "rotation">("matchplay");
  const [playMinutes, setPlayMinutes] = useState(10); // ⏱️ nur RtP-Spielweise
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 🔒 Freischalten: geschaffte Modi des gewählten Spielers
  const [cleared, setCleared] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!profileId) {
      setCleared(null);
      return;
    }
    let alive = true;
    setCleared(null);
    fetch(`/api/arcade/progress?profileId=${encodeURIComponent(profileId)}&ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setCleared(new Set(Array.isArray(j?.cleared) ? j.cleared.map(String) : [])))
      .catch(() => alive && setCleared(new Set()));
    return () => {
      alive = false;
    };
  }, [profileId]);
  const isOpen = (m: (typeof ARCADE_MODES)[number]) => arcadeUnlocked(m, cleared ?? new Set());

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
        body: JSON.stringify({ profileId, mode, locationId, style, playMinutes }),
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

      <div className="mt-3 text-xs font-medium text-neutral-600">🎮 Spielweise</div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {(
          [
            ["matchplay", "🎯 Matchplay", "ohne Extraball – Scores zählen als Matchplay"],
            ["rotation", "🔄 Round the Pinball", "mit Extraball wie an RtP-Abenden – Scores zählen als RtP, mit RtP-Timer"],
          ] as const
        ).map(([v, label, hint]) => (
          <button
            key={v}
            type="button"
            onClick={() => setStyle(v)}
            className={
              "rounded-xl border px-3 py-2 text-left transition " +
              (style === v ? "border-fuchsia-500 bg-fuchsia-600 text-white shadow" : "bg-white hover:bg-fuchsia-50")
            }
          >
            <div className="text-sm font-bold">{label}</div>
            <div className={"text-[11px] " + (style === v ? "text-white/80" : "text-neutral-500")}>{hint}</div>
          </button>
        ))}
      </div>

      {style === "rotation" ? (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-xs font-medium text-neutral-600">⏱️ Zeit je Flipper</span>
          <select
            value={playMinutes}
            onChange={(e) => setPlayMinutes(Number(e.target.value) || 10)}
            className="rounded-lg border bg-white px-2 py-1 text-sm"
          >
            {PLAY_MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} min{m === 10 ? " (Standard)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-3 text-xs font-medium text-neutral-600">🎚️ Schwierigkeitsgrad</div>
      <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {ARCADE_MODES.map((m) => {
          const open = isOpen(m);
          const need = m.unlockAfter ? arcadeModeDef(m.unlockAfter) : null;
          return (
            <button
              key={m.mode}
              type="button"
              onClick={() => open && setMode(m.mode)}
              disabled={!open}
              title={open ? m.hint : `🔒 Erst ${need?.icon ?? ""} ${need?.label ?? ""} schaffen`}
              className={
                "rounded-xl border px-2 py-2 text-left transition " +
                (!open
                  ? "cursor-not-allowed bg-neutral-100 opacity-60"
                  : mode === m.mode
                  ? "border-fuchsia-500 bg-fuchsia-600 text-white shadow"
                  : "bg-white hover:bg-fuchsia-50")
              }
            >
              <div className="text-sm font-bold">
                {open ? m.icon : "🔒"} {m.label}
                {cleared?.has(m.mode) ? <span className="ml-1" title="schon geschafft">✅</span> : null}
              </div>
              <div className={"text-[11px] " + (mode === m.mode && open ? "text-white/80" : "text-neutral-500")}>
                {open ? m.hint : `erst ${need?.icon ?? ""} ${need?.label ?? ""} schaffen`}
                {!m.ranked ? " · ohne Rangliste" : ""}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl border bg-white p-2 text-[12px] text-neutral-700">
        <span className="font-semibold">Gegner:</span>{" "}
        {def.dynamic ? <span className="text-neutral-500">werden beim Start zusammengestellt</span> : null}
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
          disabled={!profileId || !locationId || busy || !isOpen(def)}
          onClick={start}
          className="rounded-xl bg-fuchsia-600 px-5 py-2.5 text-sm font-black text-white shadow hover:bg-fuchsia-700 disabled:opacity-50"
        >
          {busy ? "starte …" : `🕹️ ${def.label} starten`}
        </button>
      </div>
    </div>
  );
}
