"use client";

// 🔬 Bot-Labor (Admin): "Was würde welcher Bot an diesem Flipper würfeln – und warum?"
// - Rohdaten des Flippers in der Location (alle Scores mit Elo damals, Status, Format, Niveau)
// - alle Bots im Vergleich (+ eigene Elo), je 200× Probewürfeln
// - Stellschrauben zum Ausprobieren (werden NICHT gespeichert – nur hier im Labor)
// Gerechnet wird mit derselben Funktion wie beim echten Spielen (lib/botScore.ts).

import { useEffect, useMemo, useState } from "react";
import { BOT_SETTINGS, normalizeBotSettings, computeBotScore, kStatus, type BotCalc, type BotRawSample, type BotSettings } from "@/lib/botScore";
import { effectiveExtraball, extraballForced, scoreLevel } from "@/lib/botRules";
import { BotCalcView, fmtLabel } from "@/components/BotCalcDialog";
import ExtraballToggle from "@/components/ExtraballToggle";

const nf = new Intl.NumberFormat("de-DE");
const fmt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "–" : nf.format(Math.round(n)));
const mio = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "–" : n >= 1e6 ? `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio.` : fmt(n);

const LAB_FORMATS = [
  { value: "rotation", label: "Round the Pinball" },
  { value: "matchplay", label: "Matchplay" },
  { value: "swiss", label: "Swiss" },
  { value: "round_robin", label: "Round Robin" },
];
const RUNS = 200;

type Bot = { id: string; name: string; rating: number | null };

type SimResult = {
  key: string;
  name: string;
  elo: number;
  calc: BotCalc;
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
  outliersUp: number;
  outliersDown: number;
};

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

/** Zufall mit festem Startwert: gleiche Daten + gleiche Einstellungen = gleiche Würfe.
 *  So ändern sich die Zahlen nur, wenn sich wirklich etwas ändert (oder "Neu würfeln"). */
function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function simulate(
  key: string,
  name: string,
  elo: number,
  base: { machine: string; location: string | null; format: string; extraball: boolean; samples: BotRawSample[]; settings: BotSettings },
  seed: number
): SimResult {
  const rng = seededRng(hashSeed(`${seed}|${elo}`));
  const level = scoreLevel(base.format, base.extraball) ?? "normal";
  const input = {
    botName: name,
    botElo: elo,
    machine: base.machine,
    location: base.location,
    format: base.format,
    extraball: base.extraball,
    level,
    levelOf: scoreLevel,
    samples: base.samples,
    settings: base.settings,
    rng,
  };
  const calc = computeBotScore(input);
  const scores: number[] = [];
  let up = 0;
  let down = 0;
  if (calc.ok) {
    for (let i = 0; i < RUNS; i++) {
      const c = computeBotScore(input);
      if (c.score != null) scores.push(c.score);
      if (c.roll?.kind === "outlier_high") up++;
      if (c.roll?.kind === "outlier_low") down++;
    }
  }
  scores.sort((a, b) => a - b);
  return {
    key,
    name,
    elo,
    calc,
    min: scores[0] ?? NaN,
    p10: quantile(scores, 0.1),
    median: quantile(scores, 0.5),
    p90: quantile(scores, 0.9),
    max: scores[scores.length - 1] ?? NaN,
    outliersUp: up,
    outliersDown: down,
  };
}

function NumField({
  label,
  hint,
  value,
  base,
  onChange,
  step = 1,
  suffix,
}: {
  label: string;
  hint: string;
  value: number;
  /** fester Ausgangswert (gleiche Einheit wie value) – Abweichung wird farbig markiert */
  base: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  const diff = Number.isFinite(value) ? value - base : 0;
  const changed = Math.abs(diff) > 1e-9;
  const tone = !changed
    ? "border-neutral-200 bg-white"
    : diff > 0
    ? "border-emerald-300 bg-emerald-50"
    : "border-sky-300 bg-sky-50";
  return (
    <label className={"block rounded-xl border p-2.5 transition-colors " + tone}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-neutral-700">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            step={step}
            value={Number.isFinite(value) ? value : ""}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-8 w-20 rounded-md border px-2 text-right text-sm tabular-nums"
          />
          {suffix ? <span className="text-xs text-neutral-500">{suffix}</span> : null}
        </span>
      </div>
      {changed ? (
        <div className={"mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold " + (diff > 0 ? "text-emerald-700" : "text-sky-700")}>
          <span>
            {diff > 0 ? "▲ höher" : "▼ niedriger"} als gespeichert: {String(base).replace(".", ",")}
            {suffix ? ` ${suffix}` : ""}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onChange(base);
            }}
            className="rounded-md bg-white/70 px-1.5 py-0.5 font-medium hover:bg-white"
            title="Auf den gespeicherten Wert zurücksetzen"
          >
            ↺
          </button>
        </div>
      ) : null}
      <div className="mt-1 text-[11px] leading-snug text-neutral-500">{hint}</div>
    </label>
  );
}

export default function BotLab() {
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState("");
  const [machines, setMachines] = useState<string[]>([]);
  const [machine, setMachine] = useState("");
  const [format, setFormat] = useState("rotation");
  const [extraball, setExtraball] = useState(false);
  const [customElo, setCustomElo] = useState<string>("");

  const [samples, setSamples] = useState<BotRawSample[] | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // gespeicherte Stellschrauben (Datenbank) = Ausgangswerte; settings = gerade im Labor eingestellt
  const [saved, setSaved] = useState<BotSettings>(() => structuredClone(BOT_SETTINGS));
  const [settings, setSettings] = useState<BotSettings>(() => structuredClone(BOT_SETTINGS));
  const [savedInfo, setSavedInfo] = useState<{ updatedAt: string | null; tableMissing: boolean; fromDb: boolean } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [simSeed, setSimSeed] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "elo" | "date">("score");

  const changedSettings = JSON.stringify(settings) !== JSON.stringify(saved);
  const differsFromDefaults = JSON.stringify(saved) !== JSON.stringify(normalizeBotSettings(BOT_SETTINGS));

  useEffect(() => {
    fetch("/api/bots/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) return;
        const st = normalizeBotSettings(j.settings);
        setSaved(st);
        setSettings(structuredClone(st));
        setSavedInfo({ updatedAt: j.updatedAt ?? null, tableMissing: !!j.tableMissing, fromDb: !!j.saved });
      })
      .catch(() => {});
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await fetch("/api/bots/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setSettingsMsg(`⚠️ ${j?.error ?? "Speichern fehlgeschlagen"}`);
        return;
      }
      const st = normalizeBotSettings(j.settings);
      setSaved(st);
      setSettings(structuredClone(st));
      setSavedInfo({ updatedAt: j.updatedAt ?? null, tableMissing: false, fromDb: true });
      setSettingsMsg("✅ Gespeichert – die Bots spielen ab jetzt mit diesen Werten.");
    } catch {
      setSettingsMsg("⚠️ Netzwerkfehler beim Speichern");
    } finally {
      setSavingSettings(false);
    }
  }

  useEffect(() => {
    fetch("/api/locations/list", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setLocations((j?.locations ?? []).map((l: any) => ({ id: String(l.id), name: String(l.name) }))))
      .catch(() => setLocations([]));
    fetch("/api/bots/lab", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setBots(j?.bots ?? []))
      .catch(() => setBots([]));
  }, []);

  useEffect(() => {
    setMachines([]);
    setMachine("");
    setSamples(null);
    if (!locationId) return;
    fetch(`/api/locations/machines?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const names = Array.from(
          new Set((j?.machines ?? []).map((m: any) => String(m.name ?? "").trim()).filter(Boolean))
        ) as string[];
        setMachines(names);
      })
      .catch(() => setMachines([]));
  }, [locationId]);

  async function load() {
    if (!locationId || !machine) return;
    setLoading(true);
    setErr(null);
    setOpenKey(null);
    try {
      const res = await fetch(
        `/api/bots/lab?locationId=${encodeURIComponent(locationId)}&machine=${encodeURIComponent(machine)}`,
        { cache: "no-store" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? "Daten konnten nicht geladen werden");
        setSamples(null);
        return;
      }
      setSamples(j.samples ?? []);
      setBots(j.bots ?? []);
    } catch {
      setErr("Netzwerkfehler");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (locationId && machine) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine]);

  const xbLocked = extraballForced(format);
  const xb = effectiveExtraball(format, extraball);
  const locName = locations.find((l) => l.id === locationId)?.name ?? null;
  const level = scoreLevel(format, xb) ?? "normal";

  const results = useMemo(() => {
    if (!samples) return [];
    const base = { machine, location: locName, format, extraball: xb, samples, settings };
    const list: SimResult[] = bots.map((b) => simulate(b.id, b.name, Number(b.rating ?? 1500), base, simSeed));
    const ce = Number(customElo);
    if (customElo.trim() && Number.isFinite(ce) && ce > 0) list.push(simulate("custom", `Eigene Elo`, ce, base, simSeed));
    return list.sort((a, b) => a.elo - b.elo);
    // simSeed: neu würfeln
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, bots, customElo, format, xb, settings, machine, locName, simSeed]);

  const rows = useMemo(() => {
    const out = (samples ?? []).map((s) => {
      const lvl = scoreLevel(s.format, s.extraball);
      const status = s.isBot
        ? { ok: false, text: "🤖 Bot – raus" }
        : s.placeholder
        ? { ok: false, text: "🚫 Platzhalter – raus" }
        : s.scoreIgnored
        ? { ok: false, text: "🚫 ignoriert – raus" }
        : !lvl
        ? { ok: false, text: "Timeplay/DYP – raus" }
        : s.elo == null
        ? { ok: false, text: "Elo unbekannt – raus" }
        : { ok: true, text: lvl === level ? "✓ nutzbar" : `✓ nutzbar (umgerechnet)` };
      return { s, lvl, status, k: s.elo == null ? null : kStatus(s.provisionalBefore, s.matchesBefore) };
    });
    out.sort((a, b) =>
      sortBy === "score"
        ? b.s.score - a.s.score
        : sortBy === "elo"
        ? (b.s.elo ?? -1) - (a.s.elo ?? -1)
        : String(b.s.date ?? "").localeCompare(String(a.s.date ?? ""))
    );
    return out;
  }, [samples, sortBy, level]);

  const set = <K extends keyof BotSettings>(k: K, v: BotSettings[K]) => setSettings((p) => ({ ...p, [k]: v }));

  const open = results.find((r) => r.key === openKey) ?? null;

  // 🎲 10 Einzelwürfe je Bot – so, wie der Bot im Turnier nacheinander spielen würde
  const [tenRolls, setTenRolls] = useState<{ key: string; name: string; elo: number; rolls: BotCalc[] }[] | null>(null);
  function rollTen() {
    if (!samples) return;
    const level = scoreLevel(format, xb) ?? "normal";
    const list = results.map((r) => {
      const rolls: BotCalc[] = [];
      for (let i = 0; i < 10; i++) {
        rolls.push(
          computeBotScore({
            botName: r.name,
            botElo: r.elo,
            machine,
            location: locName,
            format,
            extraball: xb,
            level,
            levelOf: scoreLevel,
            samples,
            settings,
          })
        );
      }
      return { key: r.key, name: r.name, elo: r.elo, rolls };
    });
    setTenRolls(list);
  }
  // Daten/Einstellungen geändert → alte Einzelwürfe passen nicht mehr
  useEffect(() => {
    setTenRolls(null);
  }, [samples, settings, format, xb, customElo, bots]);

  // 🚫 einzelnen Score ignorieren / wieder zählen (Turnierergebnis bleibt unverändert)
  const [ignoreBusy, setIgnoreBusy] = useState<string | null>(null);
  async function toggleIgnored(s: BotRawSample) {
    if (!s.matchId || !s.playerId) return;
    const key = `${s.matchId}|${s.playerId}`;
    const next = !s.scoreIgnored;
    setIgnoreBusy(key);
    try {
      const res = await fetch("/api/match_players/set-stats-ignored", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: s.matchId, playerId: s.playerId, ignored: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(j?.error ?? "Konnte nicht gespeichert werden");
        return;
      }
      setSamples((prev) =>
        (prev ?? []).map((x) => (x.matchId === s.matchId && x.playerId === s.playerId ? { ...x, scoreIgnored: next } : x))
      );
    } catch {
      setErr("Netzwerkfehler");
    } finally {
      setIgnoreBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Auswahl */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <div className="mb-1 text-xs font-medium text-neutral-600">📍 Location</div>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="h-10 w-full rounded-xl border bg-white px-2 text-sm">
            <option value="">— wählen —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-medium text-neutral-600">🕹️ Flipper</div>
          <select
            value={machine}
            onChange={(e) => setMachine(e.target.value)}
            disabled={!machines.length}
            className="h-10 w-full rounded-xl border bg-white px-2 text-sm disabled:opacity-50"
          >
            <option value="">— wählen —</option>
            {machines.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-medium text-neutral-600">🎮 Turnier-Format (angenommen)</div>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="h-10 w-full rounded-xl border bg-white px-2 text-sm">
            {LAB_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-medium text-neutral-600">🧪 Eigene Elo testen</div>
          <input
            type="number"
            value={customElo}
            onChange={(e) => setCustomElo(e.target.value)}
            placeholder="z. B. 1850"
            className="h-10 w-full rounded-xl border bg-white px-2 text-sm"
          />
        </label>
      </div>
      <div className="sm:max-w-md">
        <ExtraballToggle checked={extraball} onChange={setExtraball} locked={xbLocked} />
      </div>

      {err ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">⚠️ {err}</div> : null}
      {loading ? <div className="text-sm text-neutral-500">Lade Daten …</div> : null}
      {!samples && !loading ? (
        <div className="rounded-xl border border-dashed bg-neutral-50 p-4 text-sm text-neutral-500">
          Location und Flipper wählen – dann siehst du alle Scores an diesem Flipper und was jeder Bot würfeln würde.
          {!bots.length ? " (Noch keine Bot-Profile angelegt – unter „Spieler“ ein Profil mit 🤖 KI-Bot anlegen.)" : ""}
        </div>
      ) : null}

      {samples ? (
        <>
          {/* Stellschrauben */}
          <div className="rounded-2xl border bg-neutral-50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">⚙️ Stellschrauben</div>
                <div className="text-xs text-neutral-500">
                  Erst ausprobieren – die Tabellen rechnen sofort neu. Die Bots im Turnier spielen erst nach „Übernehmen und speichern“ mit den neuen Werten.
                </div>
                <div className="mt-0.5 text-[11px] text-neutral-400">
                  {savedInfo?.tableMissing
                    ? "⚠️ Tabelle app_settings fehlt noch (SQL ausführen) – es gelten die eingebauten Standardwerte."
                    : savedInfo?.fromDb
                    ? `Gespeichert am ${savedInfo.updatedAt ? new Date(savedInfo.updatedAt).toLocaleString("de-DE") : "–"}`
                    : "Noch nie gespeichert – es gelten die eingebauten Standardwerte."}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {changedSettings ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSettings(structuredClone(saved))}
                      disabled={savingSettings}
                      className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50"
                    >
                      ↺ Verwerfen
                    </button>
                    <button
                      type="button"
                      onClick={saveSettings}
                      disabled={savingSettings}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {savingSettings ? "Speichere …" : "💾 Übernehmen und speichern"}
                    </button>
                  </>
                ) : differsFromDefaults ? (
                  <button
                    type="button"
                    onClick={() => setSettings(normalizeBotSettings(BOT_SETTINGS))}
                    className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
                    title="Die eingebauten Standardwerte zum Ausprobieren laden (erst mit Speichern übernommen)"
                  >
                    Standardwerte laden
                  </button>
                ) : null}
              </div>
            </div>
            {settingsMsg ? <div className="mb-2 rounded-lg bg-white px-3 py-1.5 text-xs">{settingsMsg}</div> : null}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <NumField
                label="Elo-Fenster (±)"
                hint={`Nacheinander probiert: ${settings.eloWindows.join(" → ")}. Hier das größte Fenster.`}
                value={settings.eloWindows[settings.eloWindows.length - 1]} base={saved.eloWindows[saved.eloWindows.length - 1]}
                onChange={(v) => {
                  const max = Math.max(10, v || 10);
                  set("eloWindows", [Math.round(max / 4), Math.round(max / 2), max]);
                }}
                step={25}
              />
              <NumField label="Mindestanzahl Scores" hint="So viele Scores braucht ein Elo-Fenster mindestens." value={settings.minScores} base={saved.minScores} onChange={(v) => set("minScores", Math.max(1, Math.round(v)))} />
              <NumField label="Gleicher Modus ab" hint="Nur Scores aus dem gleichen Modus, wenn es mindestens so viele gibt." value={settings.minSameMode} base={saved.minSameMode} onChange={(v) => set("minSameMode", Math.max(1, Math.round(v)))} />
              <NumField
                label="Bereich (mittlere %)"
                hint="Wie viel der Scores den Bereich bilden (80 = 10. bis 90. Perzentil)."
                value={settings.rangeHighPct - settings.rangeLowPct} base={saved.rangeHighPct - saved.rangeLowPct}
                onChange={(v) => {
                  const w = Math.min(100, Math.max(10, v || 80));
                  setSettings((p) => ({ ...p, rangeLowPct: (100 - w) / 2, rangeHighPct: 100 - (100 - w) / 2 }));
                }}
                suffix="%"
              />
              <NumField label="Ausreißer-Chance" hint="So oft liegt der Bot außerhalb des Bereichs." value={Math.round(settings.outlierChance * 100)} base={Math.round(saved.outlierChance * 100)} onChange={(v) => set("outlierChance", Math.min(100, Math.max(0, v)) / 100)} suffix="%" />
              <NumField label="Ausreißer-Stärke (max.)" hint="So weit höchstens unter/über dem Bereich." value={Math.round(settings.outlierMax * 100)} base={Math.round(saved.outlierMax * 100)} onChange={(v) => set("outlierMax", Math.max(0, v) / 100)} suffix="%" />
              <NumField label="Auf-/Abschlag je 100 Elo" hint="Wenn es keine Spieler mit ähnlicher Elo gibt (z. B. 2500er)." value={Math.round(settings.extrapolatePer100 * 100)} base={Math.round(saved.extrapolatePer100 * 100)} onChange={(v) => set("extrapolatePer100", Math.max(0, v) / 100)} suffix="%" />
              <NumField label="Faktor Extraball-Niveau" hint="Umrechnung normal ↔ hoch (1,25 = Extraball-Scores sind 25 % höher)." value={settings.levelFactor} base={saved.levelFactor} onChange={(v) => set("levelFactor", Math.max(1, v || 1))} step={0.05} />
              <NumField label="Gewicht K24" hint="Spieler mit 10–30 Matches (Elo ziemlich sicher). K16 = 1 (voll)." value={settings.kWeights.k24} base={saved.kWeights.k24} onChange={(v) => set("kWeights", { ...settings.kWeights, k24: Math.max(0, v) })} step={0.05} />
              <NumField label="Gewicht K32 (Notfall)" hint="Neue Spieler – nur wenn sonst zu wenig Scores." value={settings.kWeights.k32} base={saved.kWeights.k32} onChange={(v) => set("kWeights", { ...settings.kWeights, k32: Math.max(0, v) })} step={0.05} />
              <NumField label="Ausreißer-Filter Daten" hint="Wie streng einzelne Wahnsinns-/Pechspiele aussortiert werden (kleiner = strenger)." value={settings.dataOutlierIqr} base={saved.dataOutlierIqr} onChange={(v) => set("dataOutlierIqr", Math.max(0.1, v || 1.5))} step={0.25} />
            </div>
          </div>

          {/* Bots im Vergleich */}
          <div className="rounded-2xl border bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">
                  🤖 Was würden die Bots an „{machine}“ würfeln? ({fmtLabel(format)}
                  {xb ? ", 🎱 mit Extraball" : ""} → {level === "high" ? "hohes" : "normales"} Punkteniveau)
                </div>
                <div className="text-xs text-neutral-500">Je Bot {RUNS}× Probewürfeln (feste Würfelfolge – gleiche Daten ergeben gleiche Zahlen; „Neu würfeln“ = neue Folge). Klick auf eine Zeile = ausführlicher Rechenzettel.</div>
              </div>
              <button type="button" onClick={() => setSimSeed((s) => s + 1)} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-neutral-100">
                🎲 Neu würfeln
              </button>
            </div>
            {!results.length ? (
              <div className="text-sm text-neutral-500">Noch keine Bots – lege unter „Spieler“ Bot-Profile an oder trage oben eine eigene Elo ein.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="text-neutral-500">
                    <tr>
                      <th className="py-1.5 pr-2">Bot</th>
                      <th className="py-1.5 pr-2">Elo</th>
                      <th className="py-1.5 pr-2">Grundlage</th>
                      <th className="py-1.5 pr-2 text-right">Bereich</th>
                      <th className="py-1.5 pr-2 text-right">schlecht (10 %)</th>
                      <th className="py-1.5 pr-2 text-right">typisch</th>
                      <th className="py-1.5 pr-2 text-right">gut (90 %)</th>
                      <th className="py-1.5 pr-2 text-right">min – max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr
                        key={r.key}
                        onClick={() => setOpenKey(openKey === r.key ? null : r.key)}
                        className={"cursor-pointer border-t hover:bg-violet-50 " + (openKey === r.key ? "bg-violet-50" : "")}
                      >
                        <td className="py-1.5 pr-2 font-semibold">{r.name}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{r.elo}</td>
                        <td className="py-1.5 pr-2 text-neutral-600">
                          {!r.calc.ok
                            ? `⚠️ ${r.calc.error}`
                            : r.calc.extrapolation
                            ? `${r.calc.samples.length} nächste Spieler (Ø ${r.calc.extrapolation.refElo}) × ${String(r.calc.extrapolation.factor).replace(".", ",")}`
                            : `${r.calc.samples.length} Scores, ±${r.calc.window} Elo`}
                          {r.calc.ok && r.calc.pool.key !== "sameLevel" ? (
                            <span className="ml-1 text-neutral-400">({r.calc.pool.key === "sameMode" ? "nur gleicher Modus" : "inkl. umgerechnet"})</span>
                          ) : null}
                          {r.calc.dataOutliers.length ? <span className="ml-1 text-amber-700">· {r.calc.dataOutliers.length} Ausreißer raus</span> : null}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">
                          {r.calc.range ? `${mio(r.calc.range.low)} – ${mio(r.calc.range.high)}` : "–"}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{mio(r.p10)}</td>
                        <td className="py-1.5 pr-2 text-right font-bold tabular-nums">{mio(r.median)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{mio(r.p90)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-neutral-500">
                          {mio(r.min)} – {mio(r.max)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {results.length ? (
              <div className="mt-3 rounded-2xl border bg-neutral-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">🎲 10 Einzelwürfe</div>
                    <div className="text-xs text-neutral-500">
                      So würde jeder Bot 10 Spiele nacheinander an diesem Flipper spielen. Jeder Klick = 10 neue Würfe.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={rollTen}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
                  >
                    🎲 10× würfeln
                  </button>
                </div>
                {tenRolls ? (
                  <div className="mt-2 space-y-1.5">
                    {tenRolls.map((t) => (
                      <div key={t.key} className="flex flex-wrap items-center gap-1.5">
                        <span className="w-36 shrink-0 text-xs font-semibold">
                          {t.name} <span className="font-normal text-neutral-500">({t.elo})</span>
                        </span>
                        {t.rolls[0]?.ok ? (
                          t.rolls.map((c, i) => (
                            <span
                              key={i}
                              className={
                                "rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums " +
                                (c.roll?.kind === "outlier_high"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : c.roll?.kind === "outlier_low"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-white text-neutral-700 ring-1 ring-neutral-200")
                              }
                              title={
                                c.roll?.kind === "outlier_high"
                                  ? `🍀 Ausreißer nach oben (+${c.roll.pct} %)`
                                  : c.roll?.kind === "outlier_low"
                                  ? `😬 Ausreißer nach unten (−${c.roll.pct} %)`
                                  : "normales Spiel"
                              }
                            >
                              {c.roll?.kind === "outlier_high" ? "🍀 " : c.roll?.kind === "outlier_low" ? "😬 " : ""}
                              {mio(c.score)}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-neutral-500">⚠️ {t.rolls[0]?.error}</span>
                        )}
                      </div>
                    ))}
                    <div className="pt-1 text-[11px] text-neutral-500">
                      🍀 grün = Ausreißer nach oben · 😬 blau = Ausreißer nach unten · weiß = normales Spiel im Bereich
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {open ? (
              <div className="mt-3 rounded-2xl border-2 border-violet-200 bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    🧾 Rechenzettel: {open.name} ({open.elo}) – Beispielwurf
                  </div>
                  <button type="button" onClick={() => setOpenKey(null)} className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-200">
                    ✕
                  </button>
                </div>
                <div className="mb-2 rounded-xl bg-white px-3 py-2 text-xs text-neutral-600">
                  Bei {RUNS} Würfen: schlecht (10 %) {mio(open.p10)} · typisch {mio(open.median)} · gut (90 %) {mio(open.p90)} ·
                  Ausreißer {open.outliersUp}× nach oben, {open.outliersDown}× nach unten
                </div>
                <BotCalcView calc={open.calc} />
              </div>
            ) : null}
          </div>

          {/* Rohdaten */}
          <div className="rounded-2xl border bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">
                  📋 Alle Scores an „{machine}“{locName ? ` (📍 ${locName})` : ""} – {rows.length} Einträge
                </div>
                <div className="text-xs text-neutral-500">
                  Aus beendeten Turnieren. Elo = Stand zu Beginn jenes Turniers. Falsche Scores (z. B. Flipper defekt) mit
                  „🚫 ignorieren“ markieren – das Turnierergebnis bleibt unverändert. Platzhalter-Profile im Spielerprofil markieren.
                </div>
              </div>
              <div className="flex gap-1 text-xs">
                {(["score", "elo", "date"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSortBy(k)}
                    className={"rounded-full px-2.5 py-1 " + (sortBy === k ? "bg-neutral-900 text-white" : "bg-neutral-100 hover:bg-neutral-200")}
                  >
                    {k === "score" ? "nach Score" : k === "elo" ? "nach Elo" : "nach Datum"}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="sticky top-0 bg-white text-neutral-500">
                  <tr>
                    <th className="py-1.5 pr-2">Spieler</th>
                    <th className="py-1.5 pr-2 text-right">Score</th>
                    <th className="py-1.5 pr-2">Elo damals</th>
                    <th className="py-1.5 pr-2">Status</th>
                    <th className="py-1.5 pr-2">Format</th>
                    <th className="py-1.5 pr-2">Niveau</th>
                    <th className="py-1.5 pr-2">Turnier</th>
                    <th className="py-1.5 pr-2">Datum</th>
                    <th className="py-1.5 pr-2">für Bots</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={"border-t " + (r.status.ok ? "" : "text-neutral-400")}>
                      <td className="py-1 pr-2 font-medium">{r.s.playerName}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.s.score)}</td>
                      <td className="py-1 pr-2 tabular-nums">{r.s.elo == null ? "–" : Math.round(r.s.elo)}</td>
                      <td className="py-1 pr-2">{r.k ? r.k.toUpperCase() : "–"}</td>
                      <td className="py-1 pr-2">{fmtLabel(r.s.format)}</td>
                      <td className="py-1 pr-2">{r.lvl === "high" ? "hoch 🎱" : r.lvl === "normal" ? "normal" : "–"}</td>
                      <td className="py-1 pr-2">{r.s.tournamentName}</td>
                      <td className="py-1 pr-2 tabular-nums">{r.s.date ? new Date(r.s.date).toLocaleDateString("de-DE") : "–"}</td>
                      <td className="py-1 pr-2">{r.status.text}</td>
                      <td className="py-1 text-right">
                        {!r.s.isBot && !r.s.placeholder && r.s.matchId ? (
                          <button
                            type="button"
                            onClick={() => toggleIgnored(r.s)}
                            disabled={ignoreBusy === `${r.s.matchId}|${r.s.playerId}`}
                            className={
                              "whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 " +
                              (r.s.scoreIgnored ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50" : "text-neutral-600 hover:bg-neutral-100")
                            }
                            title={
                              r.s.scoreIgnored
                                ? "Score wieder als Grundlage zählen"
                                : "Score ist falsch (z. B. Flipper defekt) – nicht mehr als Grundlage nehmen. Turnierergebnis bleibt."
                            }
                          >
                            {r.s.scoreIgnored ? "↺ wieder zählen" : "🚫 ignorieren"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
