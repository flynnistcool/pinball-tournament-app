"use client";

// 🔔 Admin: alle Mitteilungen (Einblendungen) je Gerät – an/aus, Dauer, Sound, Lautstärke, "▶ Probe".
// Global gespeichert (app_settings "notification_settings"); Daten/Standard: lib/notifications.ts
// Sounds: lib/soundCatalog.ts (Standard-Töne + eigene aus public/sounds/effekte/ via "npm run musik")

import { useEffect, useRef, useState } from "react";
import {
  DEVICE_LABEL,
  NOTIFICATIONS,
  defaultNotificationSettings,
  defaultSoundId,
  normalizeNotificationSettings,
  type NotifDevice,
  type NotifDeviceSetting,
  type NotificationSettings,
} from "@/lib/notifications";
import { SOUND_CATALOG } from "@/lib/soundCatalog";
import { playSoundById } from "@/lib/playSound";
import { publishNotificationSettings, useNotificationSettings } from "@/components/useNotificationSettings";

const DEVICES: NotifDevice[] = ["tv", "admin", "phone"];
/** Mitteilungen, die woanders eingestellt werden */
const ELSEWHERE: Record<string, string> = { timer: "Einstellungen über ⚙️ im Rotation Timer" };

const STANDARD_SOUNDS = SOUND_CATALOG.filter((s) => s.group === "Standard");
const OWN_SOUNDS = SOUND_CATALOG.filter((s) => s.group === "Eigene");

export default function NotificationsOverview() {
  const loaded = useNotificationSettings();
  const [draft, setDraft] = useState<NotificationSettings>(loaded);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stopRef = useRef<() => void>(() => {});

  // geladene Werte übernehmen, solange nichts geändert wurde
  useEffect(() => {
    if (!dirty) setDraft(loaded);
  }, [loaded, dirty]);

  useEffect(() => () => stopRef.current(), []);

  function preview(soundId: string, vol: number) {
    stopRef.current();
    stopRef.current = playSoundById(soundId, vol);
  }

  function update(id: string, d: NotifDevice, base: NotifDeviceSetting, patch: Partial<NotifDeviceSetting>) {
    setDirty(true);
    setMsg(null);
    setDraft((cur) => {
      const next: NotificationSettings = JSON.parse(JSON.stringify(cur));
      next[id] = next[id] ?? {};
      next[id][d] = { ...(next[id][d] ?? base), ...patch };
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/notification-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.error ?? "Speichern fehlgeschlagen" });
        return;
      }
      const s = normalizeNotificationSettings(j.settings);
      publishNotificationSettings(s);
      setDraft(s);
      setDirty(false);
      setMsg({ ok: true, text: "Gespeichert – gilt sofort hier und auf TV/Handy spätestens nach 5 Minuten." });
    } catch {
      setMsg({ ok: false, text: "Netzwerkfehler" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
        ℹ️ Nur die <b>Mitteilungen</b> (kurze Einblendungen), nicht die dauerhaften Badges wie 🔥 am Namen oder ★ Favorit. Am TV
        gibt es Ton nur, wenn dort „🔊 Ton aktivieren“ gedrückt wurde. Lautstärke: 100 % = wie bisher. „–“ = auf diesem Gerät
        gibt es die Mitteilung nicht. Einstellungen gelten <b>global</b> für alle Turniere.
        <br />
        🎵 <b>Eigene Sounds:</b> MP3 nach <code>public/sounds/effekte/</code> legen und <code>npm run musik</code> ausführen –
        dann stehen sie hier unter „Eigene Sounds“ zur Auswahl{OWN_SOUNDS.length ? ` (aktuell ${OWN_SOUNDS.length})` : ""}.
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2">Mitteilung</th>
              {DEVICES.map((d) => (
                <th key={d} className="px-3 py-2">
                  {DEVICE_LABEL[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATIONS.map((n) => (
              <tr key={n.id} className="border-t align-top">
                <td className="px-3 py-2.5">
                  <div className="font-semibold">
                    {n.icon} {n.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">{n.when}</div>
                </td>
                {DEVICES.map((d) => {
                  const p = n.devices[d];
                  if (!p) {
                    return (
                      <td key={d} className="px-3 py-2.5 text-neutral-300">
                        –
                      </td>
                    );
                  }
                  const base: NotifDeviceSetting = { enabled: true, seconds: p.seconds, volume: 1, sound: defaultSoundId(p.sound) };
                  const st = draft[n.id]?.[d] ?? base;
                  const elsewhere = ELSEWHERE[n.id];
                  const off = !st.enabled;
                  const silent = st.sound === "none";
                  return (
                    <td key={d} className={"px-3 py-2.5 " + (off ? "bg-neutral-50/80" : "")}>
                      {elsewhere ? (
                        <div className="text-xs text-neutral-700">{p.where}</div>
                      ) : (
                        <label className="flex items-center gap-1.5 text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={st.enabled}
                            onChange={(e) => update(n.id, d, base, { enabled: e.target.checked })}
                          />
                          <span className={off ? "text-neutral-400 line-through" : "text-neutral-700"}>{p.where}</span>
                        </label>
                      )}
                      {p.note ? <div className="mt-0.5 text-[11px] text-neutral-400">{p.note}</div> : null}

                      {elsewhere ? (
                        <div className="mt-1 text-[11px] text-neutral-500">{elsewhere}</div>
                      ) : (
                        <div className={"mt-1.5 space-y-1.5 " + (off ? "pointer-events-none opacity-40" : "")}>
                          {st.seconds != null ? (
                            <label className="flex items-center gap-1.5 text-xs text-neutral-600">
                              ⏱
                              <input
                                type="number"
                                min={2}
                                max={60}
                                value={st.seconds}
                                onChange={(e) => update(n.id, d, base, { seconds: Number(e.target.value) || 2 })}
                                className="h-7 w-14 rounded-md border px-1.5 text-right tabular-nums"
                              />
                              s
                            </label>
                          ) : (
                            <div className="text-xs text-neutral-400">⏱ –</div>
                          )}

                          {/* 🔊 Sound-Auswahl + Probe */}
                          <div className="flex items-center gap-1.5">
                            <select
                              value={st.sound}
                              onChange={(e) => update(n.id, d, base, { sound: e.target.value })}
                              className={
                                "h-7 min-w-0 max-w-[11rem] flex-1 rounded-md border px-1.5 text-[11px] " +
                                (silent ? "bg-neutral-50 text-neutral-500" : "bg-amber-50 font-semibold text-amber-900")
                              }
                              title="Sound für diese Mitteilung auf diesem Gerät"
                            >
                              <optgroup label="Standard">
                                {STANDARD_SOUNDS.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.id === "none" ? s.label : "🔊 " + s.label}
                                  </option>
                                ))}
                              </optgroup>
                              {OWN_SOUNDS.length ? (
                                <optgroup label="Eigene Sounds">
                                  {OWN_SOUNDS.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      🎵 {s.label}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                            </select>
                            {!silent ? (
                              <button
                                type="button"
                                onClick={() => preview(st.sound, st.volume)}
                                className="shrink-0 rounded-md border bg-white px-1.5 py-0.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50"
                                title="Ton mit eingestellter Lautstärke anhören"
                              >
                                ▶
                              </button>
                            ) : null}
                          </div>
                          {!silent ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="range"
                                min={0}
                                max={1.5}
                                step={0.05}
                                value={st.volume}
                                onChange={(e) => update(n.id, d, base, { volume: Number(e.target.value) })}
                                className="h-1.5 w-24 cursor-pointer accent-neutral-900"
                                title="Lautstärke (100 % = wie bisher)"
                              />
                              <span className="w-10 text-right text-[11px] tabular-nums text-neutral-500">
                                {Math.round(st.volume * 100)} %
                              </span>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {msg ? (
        <div className={"rounded-lg px-3 py-2 text-xs " + (msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
          {msg.ok ? "✅ " : "⚠️ "}
          {msg.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setDraft(defaultNotificationSettings());
            setDirty(true);
            setMsg(null);
          }}
          className="rounded-lg px-2 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
        >
          ↺ Standard wiederherstellen
        </button>
        <div className="flex items-center gap-2">
          {dirty ? <span className="text-xs text-amber-700">Nicht gespeicherte Änderungen</span> : null}
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setDraft(loaded);
              setDirty(false);
              setMsg(null);
            }}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-40"
          >
            Verwerfen
          </button>
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={save}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {busy ? "Speichere …" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
