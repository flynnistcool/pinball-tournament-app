"use client";

// Maske "Turnier Neu anlegen" (nur Darstellung).
// Alle Werte + das Erstellen selbst liegen weiterhin in app/t/page.tsx (AdminHome);
// diese Komponente bekommt sie nur durchgereicht.

import type { ReactNode } from "react";
import { Button, Input, Select } from "@/components/ui";

export type TournamentFormat =
  | "matchplay"
  | "timeplay"
  | "swiss"
  | "round_robin"
  | "dyp_round_robin"
  | "elimination"
  | "rotation";

const FORMATS: { value: TournamentFormat; icon: string; label: string; hint: string }[] = [
  { value: "matchplay", icon: "🎯", label: "Matchplay", hint: "Standard – Gruppen spielen je einen Flipper" },
  { value: "timeplay", icon: "⏱️", label: "Timeplay", hint: "Matchplay mit Zeitlimit" },
  { value: "swiss", icon: "⚖️", label: "Swiss", hint: "Gleich Starke spielen gegeneinander" },
  { value: "round_robin", icon: "🔄", label: "Round Robin", hint: "Jeder gegen jeden (Beta)" },
  { value: "rotation", icon: "🎰", label: "Rotation", hint: "Alle Spieler spielen jede Maschine" },
  { value: "elimination", icon: "💥", label: "Crazy Elimination", hint: "Alle gegeneinander, −1 pro Runde" },
  { value: "dyp_round_robin", icon: "👥", label: "DYP Round Robin", hint: "2 vs 2, Teams rotieren" },
];

const SIZES: { value: 2 | 3 | 4; label: string; sub: string }[] = [
  { value: 2, label: "2", sub: "1 vs 1" },
  { value: 3, label: "3", sub: "1 vs 1 vs 1" },
  { value: 4, label: "4", sub: "1 vs 1 vs 1 vs 1" },
];

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-neutral-800">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-lg">{icon}</span>
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-sm font-medium text-neutral-600">{children}</div>;
}

export default function CreateTournamentForm({
  name,
  onNameChange,
  nameSuggestions,
  category,
  onCategoryChange,
  categorySuggestions,
  format,
  onFormatChange,
  matchSize,
  onMatchSizeChange,
  locationId,
  onLocationChange,
  locations,
  busy,
  onCreate,
}: {
  name: string;
  onNameChange: (v: string) => void;
  /** Vorschlags-Chips unter dem Namen */
  nameSuggestions?: ReactNode;
  category: string;
  onCategoryChange: (v: string) => void;
  /** Vorschlags-Chips unter der Kategorie */
  categorySuggestions?: ReactNode;
  format: TournamentFormat;
  onFormatChange: (v: TournamentFormat) => void;
  matchSize: 2 | 3 | 4;
  onMatchSizeChange: (v: 2 | 3 | 4) => void;
  locationId: string;
  onLocationChange: (v: string) => void;
  locations: { id: string; name: string }[];
  busy: boolean;
  onCreate: () => void;
}) {
  const sizeLocked = format === "dyp_round_robin" || format === "elimination";
  const fmt = FORMATS.find((f) => f.value === format);
  const locName = locations.find((l) => l.id === locationId)?.name;

  const summary = [
    fmt ? `${fmt.icon} ${fmt.label}` : null,
    format === "elimination" ? "alle in einem Match" : format === "dyp_round_robin" ? "2 vs 2" : `${matchSize} Spieler pro Maschine`,
    locName ? `📍 ${locName}` : "ohne Location-Import",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <Section icon="🏷️" title="Name & Serie">
        <div>
          <FieldLabel>Turniername</FieldLabel>
          <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="z.B. Monats-Cup" />
          {nameSuggestions}
        </div>
        <div>
          <FieldLabel>Kategorie / Serie</FieldLabel>
          <Input
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            placeholder="z.B. Liga 2025, Monatsserie, Fun-Cup"
          />
          {categorySuggestions}
        </div>
      </Section>

      <Section icon="🎮" title="Spielmodus">
        <div>
          <FieldLabel>Format</FieldLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {FORMATS.map((f) => {
              const active = f.value === format;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => onFormatChange(f.value)}
                  aria-pressed={active}
                  className={
                    "flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition " +
                    (active
                      ? "border-neutral-900 bg-neutral-900 text-white shadow-md"
                      : "border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-400 hover:bg-white")
                  }
                >
                  <span className="text-2xl leading-none">{f.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{f.label}</span>
                    <span className={"block text-xs " + (active ? "text-white/70" : "text-neutral-500")}>{f.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500">Das Format gilt für das gesamte Turnier.</div>
        </div>

        <div>
          <FieldLabel>Spieler pro Maschine</FieldLabel>
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {SIZES.map((s) => {
              const active = s.value === matchSize;
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={sizeLocked}
                  onClick={() => onMatchSizeChange(s.value)}
                  aria-pressed={active}
                  className={
                    "rounded-xl border px-2 py-2 text-center transition disabled:cursor-not-allowed disabled:opacity-40 " +
                    (active
                      ? "border-neutral-900 bg-neutral-900 text-white shadow-md"
                      : "border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-400 hover:bg-white")
                  }
                >
                  <span className="block text-xl font-bold leading-tight">{s.label}</span>
                  <span className={"block text-[11px] " + (active ? "text-white/70" : "text-neutral-500")}>{s.sub}</span>
                </button>
              );
            })}
          </div>
          {format === "elimination" && (
            <div className="mt-1.5 text-xs text-neutral-500">
              Hinweis: Bei Elimination wird diese Einstellung ignoriert – pro Runde spielen alle verbleibenden Spieler in
              einem Match.
            </div>
          )}
          {format === "dyp_round_robin" && (
            <div className="mt-1.5 text-xs text-neutral-500">DYP ist immer 2 vs 2 (4 Spieler pro Maschine).</div>
          )}
        </div>
      </Section>

      <Section icon="📍" title="Maschinen">
        <div>
          <FieldLabel>Maschinen importieren aus Location</FieldLabel>
          <Select value={locationId} onChange={(e) => onLocationChange(e.target.value)}>
            <option value="">— (kein Location-Import)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="mt-1.5 text-xs text-neutral-500">Importiert Maschinen aus der Location-Datenbank.</div>
        </div>
      </Section>

      <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-neutral-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-neutral-900">{name.trim() || "Neues Turnier"}</div>
          <div className="text-sm text-neutral-600">
            {category.trim() ? `🏆 ${category.trim()} · ` : ""}
            {summary}
          </div>
        </div>
        <Button disabled={busy} onClick={onCreate} className="shrink-0 px-6">
          {busy ? "Wird erstellt …" : "🚀 Turnier erstellen"}
        </Button>
      </div>
    </div>
  );
}
