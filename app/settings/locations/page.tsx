// @ts-nocheck           // ⬅️ diese Zeile NEU

"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, Input, Button, Select, Pill } from "@/components/ui";

type Loc = { id: string; name: string };

function suggestEmojiForMachine(name: string): string {
  const n = name.toLowerCase();

  // ein paar einfache Name→Emoji-Heuristiken
  if (n.includes("metallica")) return "🎸";
  if (n.includes("jaws")) return "🦈";
  if (n.includes("aerosmith")) return "🎤";
  if (n.includes("cactus")) return "🌵";
  if (n.includes("black knight")) return "🛡️";
  if (n.includes("looney") || n.includes("tunes")) return "🎬";
  if (n.includes("acdc") || n.includes("ac/dc")) return "⚡";
  if (n.includes("star") || n.includes("wars")) return "✨";
  if (n.includes("godzilla")) return "🦖";

  // Fallback: pseudo-random aus ein paar Standard-Emojis
  const fallback = ["🎰", "🎮", "🎯", "🎲", "⭐", "🎡", "✨"];
  let hash = 0;
  for (let i = 0; i < n.length; i++) {
    hash = (hash + n.charCodeAt(i) * (i + 1)) % fallback.length;
  }
  return fallback[hash] ?? "✨";
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [machineName, setMachineName] = useState<string>("");
  const [machines, setMachines] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadLocations() {
    const res = await fetch("/api/locations/list", { cache: "no-store" });
    const j = await res.json();
    setLocations(j.locations ?? []);
    if (!selected && (j.locations ?? []).length) setSelected(j.locations[0].id);
  }

  async function loadMachines(locId: string) {
    if (!locId) return;
    const res = await fetch(
      `/api/locations/machines?locationId=${encodeURIComponent(locId)}`,
      { cache: "no-store" }
    );
    const j = await res.json();
    setMachines(j.machines ?? []);
  }

  useEffect(() => {
    loadLocations();
  }, []);
  useEffect(() => {
    if (selected) loadMachines(selected);
  }, [selected]);

  async function addLocation() {
    setMsg(null);
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/locations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error ?? "Fehler");
      return;
    }
    setNewName("");
    await loadLocations();
    setSelected(j.location.id);
  }

  async function deleteLocation() {
    if (!selected) return;
    if (!confirm("Location wirklich löschen? (inkl. Maschinenliste)")) return;
    const res = await fetch("/api/locations/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error ?? "Fehler");
      return;
    }
    setSelected("");
    setMachines([]);
    await loadLocations();
  }

  function addMachineLocal() {
    const name = machineName.trim();
    if (!name) return;
    setMachines([
      ...machines,
      {
        id: `tmp_${Date.now()}`,
        name,
        active: true,
        sort_order: machines.length,
        icon_emoji: "", // neu: Emoji-Feld lokal miterzeugen
      },
    ]);
    setMachineName("");
  }

  function toggle(idx: number) {
    const copy = machines.slice();
    copy[idx] = { ...copy[idx], active: !copy[idx].active };
    setMachines(copy);
  }

  function remove(idx: number) {
    const copy = machines.slice();
    copy.splice(idx, 1);
    setMachines(copy.map((m, i) => ({ ...m, sort_order: i })));
  }

  async function saveMachines() {
    setMsg(null);
    if (!selected) return;
    const res = await fetch("/api/locations/machines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId: selected,
        machines: machines.map((m, i) => ({
          name: m.name,
          active: m.active,
          sort_order: i,
          icon_emoji: m.icon_emoji ?? null, // neu: Emoji mit zum Backend schicken
        })),
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error ?? "Fehler");
      return;
    }
    setMsg("Gespeichert ✅");
    await loadMachines(selected);
  }

  const selectedName = useMemo(
    () => locations.find((l) => l.id === selected)?.name ?? "",
    [locations, selected]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-neutral-500">Admin</div>
              <div className="text-lg font-semibold">Locations & Flipper-Listen</div>
            </div>
            <div className="flex items-center gap-2">
              <a
                className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200"
                href="/"
              >
                Zurück
              </a>
              <Pill>v1.3</Pill>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-sm text-neutral-600">Location wählen</div>
              <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                {locations.length === 0 && <option value="">Keine Locations</option>}
              </Select>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={deleteLocation} disabled={!selected}>
                  Löschen
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-sm text-neutral-600">Neue Location</div>
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z.B. Vereinsheim"
                />
                <Button onClick={addLocation}>Anlegen</Button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">
                Flipper-Liste{selectedName ? `: ${selectedName}` : ""}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={saveMachines} disabled={!selected}>
                  Speichern
                </Button>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <Input
                value={machineName}
                onChange={(e) => setMachineName(e.target.value)}
                placeholder="Flipper hinzufügen (Name)"
              />
              <Button
                variant="secondary"
                onClick={addMachineLocal}
                disabled={!selected}
              >
                Hinzufügen
              </Button>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border">
              <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                <div className="col-span-6">Name</div>
                <div className="col-span-2 text-center">Emoji/Icon</div>
                <div className="col-span-2 text-right">Aktiv</div>
                <div className="col-span-2 text-right">Aktion</div>
              </div>
              {machines.map((m, idx) => (
                <div
                  key={m.id ?? idx}
                  className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0"
                >
                  <div className="col-span-6 font-medium break-words">{m.name}</div>

                  <div className="col-span-2 flex items-center justify-center gap-1">
                    <Input
                      className="w-16 text-center"
                      maxLength={4}
                      value={m.icon_emoji ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMachines((old) =>
                          old.map((x, i) =>
                            i === idx ? { ...x, icon_emoji: v } : x
                          )
                        );
                      }}
                      placeholder="🎰"
                    />
                    <Button
                      size="xs"
                      onClick={() => {
                        const suggestion = suggestEmojiForMachine(m.name ?? "");
                        setMachines((old) =>
                          old.map((x, i) =>
                            i === idx ? { ...x, icon_emoji: suggestion } : x
                          )
                        );
                      }}
                    >
                      KI
                    </Button>
                  </div>

                  <div className="col-span-2 text-right">
                    <button
                      className={
                        "rounded-full px-3 py-1 text-sm " +
                        (m.active
                          ? "bg-green-50 text-green-700"
                          : "bg-neutral-100 text-neutral-600")
                      }
                      onClick={() => toggle(idx)}
                    >
                      {m.active ? "Ja" : "Nein"}
                    </button>
                  </div>
                  <div className="col-span-2 text-right">
                    <button
                      className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                      onClick={() => remove(idx)}
                    >
                      Entfernen
                    </button>
                  </div>
                </div>
              ))}
              {machines.length === 0 && (
                <div className="px-4 py-4 text-sm text-neutral-500">
                  Noch keine Flipper hinterlegt.
                </div>
              )}
            </div>

            {msg && (
              <div className="mt-3 rounded-xl bg-neutral-100 p-3 text-sm">{msg}</div>
            )}
          </div>

          <div className="mt-3 text-xs text-neutral-500">
            Tipp: Lege pro Location einmal die Flipper an. Beim Turnier erstellen kannst du
            dann die Location wählen und die Maschinen werden automatisch übernommen –
            inklusive Icons/Emojis.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
