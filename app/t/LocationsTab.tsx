// @ts-nocheck           // ⬅️ diese Zeile NEU
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, Input, Pill, Select } from "@/components/ui";
import MachineStatsLine from "@/components/MachineStatsLine";

type Location = { id: string; name: string; created_at?: string; machine_count?: number };
type LocationMachine = {
  id?: string;
  name: string;
  active: boolean;
  sort_order?: number | null;
  icon_emoji?: string | null;
};

function suggestEmojiForMachine(name: string): string {
  const n = name.toLowerCase();

  if (n.includes("metallica")) return "🎸";
  if (n.includes("jaws")) return "🦈";
  if (n.includes("aerosmith")) return "🎤";
  if (n.includes("cactus")) return "🌵";
  if (n.includes("black knight")) return "🛡️";
  if (n.includes("looney") || n.includes("tunes")) return "🎬";
  if (n.includes("acdc") || n.includes("ac/dc")) return "⚡";
  if (n.includes("star") || n.includes("wars")) return "✨";
  if (n.includes("godzilla")) return "🦖";

  const fallback = ["🎰", "🎮", "🎯", "🎲", "⭐", "🎡", "✨"];
  let hash = 0;
  for (let i = 0; i < n.length; i++) {
    hash = (hash + n.charCodeAt(i) * (i + 1)) % fallback.length;
  }
  return fallback[hash] ?? "✨";
}

export default function LocationsTab() {
  const [busy, setBusy] = useState(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [openLocationId, setOpenLocationId] = useState<string | null>(null);

  // Create Location UI
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  // Machines edit UI
  const [machinesBusy, setMachinesBusy] = useState(false);
  const [machines, setMachines] = useState<LocationMachine[]>([]);
  const [machineNewName, setMachineNewName] = useState("");


// Machine Tasks UI
type TaskDifficulty = "easy" | "medium" | "hard";
type MachineTask = {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  difficulty: TaskDifficulty;
  created_at?: string;
};

const [taskMachine, setTaskMachine] = useState<LocationMachine | null>(null);
const [tasksBusy, setTasksBusy] = useState(false);
const [tasks, setTasks] = useState<MachineTask[]>([]);
const [taskTitle, setTaskTitle] = useState("");
const [taskDesc, setTaskDesc] = useState("");
const [newTaskDifficulty, setNewTaskDifficulty] = useState<TaskDifficulty>("easy");

  const openLocation = useMemo(
    () => locations.find((l) => l.id === openLocationId) ?? null,
    [locations, openLocationId]
  );

  async function loadLocations() {
    setBusy(true);
    try {
      const res = await fetch("/api/locations/list", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setLocations(j.locations ?? []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadMachines(locationId: string) {
    setMachinesBusy(true);
    try {
      const res = await fetch(
        `/api/locations/machines?locationId=${encodeURIComponent(locationId)}`,
        {
          cache: "no-store",
        }
      );
      const j = await res.json().catch(() => ({}));
      // kommt als { machines: [...] }
      const list: LocationMachine[] = (j.machines ?? []).map((m: any, idx: number) => ({
        id: m.id,
        name: String(m.name ?? ""),
        active: m.active !== false,
        sort_order: m.sort_order ?? idx,
        icon_emoji: m.icon_emoji ?? "", // <-- Emoji aus Backend übernehmen
      }));
      setMachines(list);
    } finally {
      setMachinesBusy(false);
    }
  }

  async function saveMachines(locationId: string, nextMachines: LocationMachine[]) {
    setMachinesBusy(true);
    try {
      const res = await fetch("/api/locations/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          machines: nextMachines.map((m, idx) => ({
            id: m.id ?? null,
            name: m.name,
            active: m.active !== false,
            sort_order: typeof m.sort_order === "number" ? m.sort_order : idx,
            icon_emoji: m.icon_emoji ?? null, // <-- Emoji mit speichern
          })),
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Speichern fehlgeschlagen");
        return;
      }

      await Promise.all([loadLocations(), loadMachines(locationId)]);
    } finally {
      setMachinesBusy(false);
    }
  }

  async function loadTasks(locationMachineId: string) {
    setTasksBusy(true);
    try {
      const res = await fetch(
        `/api/machine-tasks/list?locationMachineId=${encodeURIComponent(locationMachineId)}&t=${Date.now()}`,
        { cache: "no-store" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Tasks laden fehlgeschlagen");
        setTasks([]);
        return;
      }
      setTasks((j.tasks ?? []) as MachineTask[]);
      // Task-Liste unter "mehr" (Statistik) still mitaktualisieren
      if (openLocationId) loadMachineStats(openLocationId, true);
    } finally {
      setTasksBusy(false);
    }
  }

  async function openTasksForMachine(m: LocationMachine) {
    if (!m?.id) {
      alert("Erst speichern, dann Tasks anlegen.");
      return;
    }
    setTaskMachine(m);
    // zum Task-Editor (unter der Flipper-Liste) scrollen
    setTimeout(() => document.getElementById("timeplay-task-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    setTaskTitle("");
    setTaskDesc("");
    setNewTaskDifficulty("easy");
    await loadTasks(String(m.id));
  }

  async function createTask() {
    if (!taskMachine?.id) return;
    const title = taskTitle.trim();
    if (!title) return;

    setTasksBusy(true);
    try {
      const res = await fetch("/api/machine-tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationMachineId: taskMachine.id,
          title,
          description: taskDesc.trim() || null,
          active: true,
          difficulty: newTaskDifficulty,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Task anlegen fehlgeschlagen");
        return;
      }

      setTaskTitle("");
      setTaskDesc("");
      setNewTaskDifficulty("easy");
      await loadTasks(String(taskMachine.id));
    } finally {
      setTasksBusy(false);
    }
  }

  async function updateTask(id: string, patch: Partial<MachineTask>) {
    setTasksBusy(true);
    try {
      const res = await fetch("/api/machine-tasks/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Task speichern fehlgeschlagen");
        return;
      }

      if (taskMachine?.id) await loadTasks(String(taskMachine.id));
    } finally {
      setTasksBusy(false);
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("Task wirklich löschen?")) return;

    setTasksBusy(true);
    try {
      const res = await fetch("/api/machine-tasks/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Task löschen fehlgeschlagen");
        return;
      }

      if (taskMachine?.id) await loadTasks(String(taskMachine.id));
    } finally {
      setTasksBusy(false);
    }
  }


  async function deleteLocation(id: string, name: string) {
    if (!confirm(`Location "${name}" wirklich löschen?`)) return;

    const res = await fetch("/api/locations/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error ?? "Löschen fehlgeschlagen");
      return;
    }

    await loadLocations();
    if (openLocationId === id) {
      setOpenLocationId(null);
      setMachines([]);
    }
  }

  async function createLocation() {
    const name = newName.trim();
    if (!name) return;

    setBusy(true);
    try {
      const res = await fetch("/api/locations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error ?? "Fehler");
        return;
      }

      setCreateOpen(false);
      setNewName("");
      await loadLocations();

      if (j.location?.id) {
        setOpenLocationId(j.location.id);
        await loadMachines(j.location.id);
      }
    } finally {
      setBusy(false);
    }
  }

  // wenn Location gewählt wird: Maschinen laden
  useEffect(() => {
    if (!openLocationId) {
      setMachines([]);
      return;
    }
    loadMachines(openLocationId);
    loadMachineStats(openLocationId);
  }, [openLocationId]);

  // 📊 Statistik pro Flipper (nur lesend, Zuordnung über Location + Flipper-Name)
  const [machineStats, setMachineStats] = useState<Record<string, any>>({});
  const [machineStatsLoading, setMachineStatsLoading] = useState(false);
  async function loadMachineStats(locationId: string, silent = false) {
    if (!silent) {
      setMachineStatsLoading(true);
      setMachineStats({});
    }
    try {
      const res = await fetch(`/api/locations/machine-stats?locationId=${encodeURIComponent(locationId)}&_ts=${Date.now()}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j?.stats) setMachineStats(j.stats);
    } catch {
      /* Statistik ist nicht kritisch */
    } finally {
      setMachineStatsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* HEADER: Locations + Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="font-semibold">Locations</div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setCreateOpen(true)}
              >
                Neue Location
              </Button>
              <Button variant="secondary" disabled={busy} onClick={loadLocations}>
                Neu laden
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardBody>
          {createOpen ? (
            <div className="rounded-2xl border bg-white p-4 mb-4">
              <div className="text-sm font-semibold mb-2">Neue Location anlegen</div>
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="z.B. Flo Bar"
                />
                <Button disabled={busy || !newName.trim()} onClick={createLocation}>
                  Erstellen
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setCreateOpen(false)}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border bg-white">
            <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              <div className="col-span-9">Name</div>
              <div className="col-span-3 text-right">ID</div>
            </div>

            {locations.map((l) => (
              <button
                key={l.id}
                className={
                  "w-full grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0 items-center text-left hover:bg-neutral-50 " +
                  (openLocationId === l.id ? "bg-neutral-50" : "")
                }
                onClick={() => setOpenLocationId(l.id)}
              >
                <div className="col-span-9 font-medium">{l.name}</div>
                <div
                  className="col-span-3 flex items-center justify-end gap-2 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">
                    {l.machine_count ?? 0}
                  </span>

                  <button
                    className="rounded-lg border px-2 py-1 text-xs hover:bg-red-50 hover:text-red-600"
                    onClick={() => deleteLocation(l.id, l.name)}
                  >
                    Löschen
                  </button>
                </div>
              </button>
            ))}

            {locations.length === 0 ? (
              <div className="px-4 py-4 text-sm text-neutral-500">
                Noch keine Locations.
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* DETAIL: Maschinen der Location */}
      {openLocation ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">
                Location: {openLocation.name}{" "}
                <span className="text-xs text-neutral-500 ml-2">
                  ({openLocation.id})
                </span>
              </div>
              {machinesBusy ? <Pill>lädt…</Pill> : null}
            </div>
          </CardHeader>

          <CardBody>
            <div className="rounded-2xl border bg-white p-4 space-y-3">
              {/* Maschine hinzufügen */}
              <div className="flex gap-2">
                <Input
                  value={machineNewName}
                  onChange={(e) => setMachineNewName(e.target.value)}
                  placeholder="Neue Maschine (Name)"
                />
                <Button
                  variant="secondary"
                  disabled={machinesBusy || !machineNewName.trim()}
                  onClick={async () => {
                    const next: LocationMachine[] = [
                      ...machines,
                      {
                        name: machineNewName.trim(),
                        active: true,
                        sort_order: machines.length,
                        icon_emoji: "",
                      },
                    ];
                    setMachineNewName("");
                    setMachines(next);
                    await saveMachines(openLocation.id, next);
                  }}
                >
                  Hinzufügen
                </Button>
              </div>

              {/* Maschinen Liste */}
              <div className="space-y-2">
                {machines.map((m, idx) => {
                  // kleine, einheitliche Knöpfe in der Kopfzeile
                  const iconBtn =
                    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-neutral-100 px-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-200 disabled:opacity-35 disabled:cursor-not-allowed";
                  return (
                  <div key={idx} className="space-y-3 rounded-2xl border bg-white p-3 shadow-sm">
                    {/* Kopfzeile: Nr · Name · Icon · Status · Sortieren · Löschen */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-7 text-xs text-neutral-400">#{idx + 1}</span>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-xl">
                        {(m.icon_emoji ?? "").trim() || "🎰"}
                      </span>
                      <div className="min-w-[180px] flex-1">
                        <input
                          className="h-9 w-full rounded-lg border px-3 text-base font-semibold outline-none focus:ring-2 focus:ring-black/10"
                          value={m.name}
                          onChange={(e) => {
                            const next = machines.slice();
                            next[idx] = { ...next[idx], name: e.target.value };
                            setMachines(next);
                          }}
                        />
                      </div>
                      <input
                        className="h-9 w-14 rounded-lg border text-center text-lg outline-none focus:ring-2 focus:ring-black/10"
                        maxLength={4}
                        title="Icon (Emoji)"
                        value={m.icon_emoji ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          const next = machines.slice();
                          next[idx] = { ...next[idx], icon_emoji: v };
                          setMachines(next);
                        }}
                        placeholder="🎰"
                      />
                      <button
                        type="button"
                        className={iconBtn}
                        title="Icon vorschlagen"
                        disabled={machinesBusy}
                        onClick={() => {
                          const suggestion = suggestEmojiForMachine(m.name ?? "");
                          const next = machines.slice();
                          next[idx] = { ...next[idx], icon_emoji: suggestion };
                          setMachines(next);
                        }}
                      >
                        KI
                      </button>
                      <select
                        className={
                          "h-9 rounded-lg border px-2 text-sm font-medium outline-none " +
                          (m.active ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-500")
                        }
                        value={m.active ? "1" : "0"}
                        onChange={(e) => {
                          const next = machines.slice();
                          next[idx] = {
                            ...next[idx],
                            active: e.target.value === "1",
                          };
                          setMachines(next);
                        }}
                      >
                        <option value="1">● aktiv</option>
                        <option value="0">○ inaktiv</option>
                      </select>
                      <button
                        type="button"
                        className={iconBtn}
                        title="nach oben"
                        disabled={machinesBusy || idx === 0}
                        onClick={async () => {
                          const next = machines.slice();
                          const tmp = next[idx - 1];
                          next[idx - 1] = next[idx];
                          next[idx] = tmp;
                          setMachines(next);
                          await saveMachines(openLocation.id, next);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        title="nach unten"
                        disabled={machinesBusy || idx === machines.length - 1}
                        onClick={async () => {
                          const next = machines.slice();
                          const tmp = next[idx + 1];
                          next[idx + 1] = next[idx];
                          next[idx] = tmp;
                          setMachines(next);
                          await saveMachines(openLocation.id, next);
                        }}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-lg px-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-35"
                        title="Flipper aus der Location löschen"
                        disabled={machinesBusy}
                        onClick={async () => {
                          const next = machines.filter((_, i) => i !== idx);
                          setMachines(next);
                          await saveMachines(openLocation.id, next);
                        }}
                      >
                        🗑 Löschen
                      </button>
                    </div>

                    {/* 📊 Statistik + Timeplay Tasks (unter "mehr") */}
                    <MachineStatsLine
                      stat={m.id ? machineStats[m.id] : undefined}
                      loading={machineStatsLoading}
                      canEditTasks={!machinesBusy && !!m.id}
                      onEditTasks={() => openTasksForMachine(m)}
                    />
                  </div>
                  );
                })}

                {machines.length === 0 ? (
                  <div className="text-sm text-neutral-500">
                    Noch keine Maschinen in dieser Location.
                  </div>
                ) : null}
              </div>

              {/* Speichern Button */}
              <div className="pt-2">
                <Button
                  disabled={machinesBusy}
                  onClick={() => saveMachines(openLocation.id, machines)}
                >
                  Änderungen speichern
                </Button>
              </div>
{taskMachine ? (
  <div id="timeplay-task-editor" className="mt-4 scroll-mt-4 rounded-2xl border-2 border-blue-200 bg-white p-4">
    <div className="flex items-center justify-between gap-2">
      <div className="font-semibold">Timeplay Tasks: {taskMachine.name}</div>
      <Button variant="secondary" onClick={() => setTaskMachine(null)}>
        Schließen
      </Button>
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Input
        value={taskTitle}
        onChange={(e) => setTaskTitle(e.target.value)}
        placeholder="Task Titel"
      />
      <Input
        value={taskDesc}
        onChange={(e) => setTaskDesc(e.target.value)}
        placeholder="Beschreibung (optional)"
      />

      <Select
        value={newTaskDifficulty}
        onChange={(e) => setNewTaskDifficulty(e.target.value as any)}
      >
        <option value="easy">easy</option>
        <option value="medium">medium</option>
        <option value="hard">hard</option>
      </Select>

      <Button disabled={tasksBusy || !taskTitle.trim()} onClick={createTask}>
        + Task
      </Button>
    </div>

    <div className="mt-3 space-y-2">
      {tasksBusy ? (
        <div className="text-sm text-neutral-500">Lade Tasks...</div>
      ) : null}

      {tasks.map((t) => (
        <div key={t.id} className="rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              defaultValue={t.title ?? ""}
              onBlur={(e) => updateTask(t.id, { title: e.target.value } as any)}
            />
            <Input
              defaultValue={t.description ?? ""}
              onBlur={(e) =>
                updateTask(t.id, { description: e.target.value } as any)
              }
              placeholder="Beschreibung"
            />
            <Select
              value={(t.difficulty ?? "easy") as any}
              onChange={(e) =>
                updateTask(t.id, { difficulty: e.target.value } as any)
              }
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </Select>

            <Button
              variant="secondary"
              onClick={() => updateTask(t.id, { active: !t.active } as any)}
            >
              {t.active ? "Aktiv" : "Inaktiv"}
            </Button>

            <Button variant="secondary" onClick={() => deleteTask(t.id)}>
              Löschen
            </Button>
          </div>
        </div>
      ))}

      {!tasksBusy && tasks.length === 0 ? (
        <div className="text-sm text-neutral-500">
          Noch keine Tasks für diese Maschine.
        </div>
      ) : null}
    </div>
  </div>
) : null}

            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="text-sm text-neutral-500">
          Klicke links eine Location an, um die Maschinen zu sehen.
        </div>
      )}
    </div>
  );
}
