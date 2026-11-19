"use client";

// 🔔 Admin: alle Mitteilungen (Einblendungen) je Gerät – an/aus, Dauer, Sound, Lautstärke, "▶ Probe".
// Global gespeichert (app_settings "notification_settings"); Daten/Standard: lib/notifications.ts
// Sounds: lib/soundCatalog.ts (Standard-Töne + eigene aus public/sounds/effekte/ via "npm run musik")

import { useEffect, useRef, useState } from "react";
import {
  BADGES,
  DEVICE_LABEL,
  SERVER_FEED_ID,
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
import ScopeChip from "@/components/ScopeChip";
import NotificationPreview, { hasRealPreview } from "@/components/NotificationPreview";
import TickerPreview from "@/components/TickerPreview";

const DEVICES: NotifDevice[] = ["tv", "admin", "phone", "ticker"];
/** Mitteilungen, die woanders eingestellt werden */
const ELSEWHERE: Record<string, string> = { timer: "Einstellungen über ⚙️ im Rotation Timer" };
/** Gerät ohne eigene Einstellung, aber an anderer Stelle geregelt → Hinweis statt "–" */
const HANDLED_ELSEWHERE: Record<string, Partial<Record<NotifDevice, string>>> = {
  rotationSplash: { ticker: "→ „Durchgang geschafft“ steht im Ticker über „Runde abgeschlossen“, der Start über „Runde generiert“" },
};

const STANDARD_SOUNDS = SOUND_CATALOG.filter((s) => s.group === "Standard");
const OWN_SOUNDS = SOUND_CATALOG.filter((s) => s.group === "Eigene");

export default function NotificationsOverview() {
  const loaded = useNotificationSettings();
  const [draft, setDraft] = useState<NotificationSettings>(loaded);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stopRef = useRef<() => void>(() => {});
  // 🎧 Sound-Test
  const [testSound, setTestSound] = useState<string>("fanfare");
  const [testPlaying, setTestPlaying] = useState(false);
  const testTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(testTimerRef.current), []);
  // 👀 Vorschau einer Einblendung
  const [previewKind, setPreviewKind] = useState<string>("flawless");
  const [previewDevice, setPreviewDevice] = useState<"tv" | "admin">("tv");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Kopfzeile, Tabelle und unterer Scrollbalken scrollen seitwärts gemeinsam
  const headRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [tableW, setTableW] = useState(1000);
  const [overflowX, setOverflowX] = useState(false);
  function syncScroll(src: HTMLDivElement) {
    const x = src.scrollLeft;
    for (const el of [headRef.current, bodyRef.current, barRef.current]) {
      if (el && el !== src && el.scrollLeft !== x) el.scrollLeft = x;
    }
  }
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setTableW(body.scrollWidth);
      setOverflowX(body.scrollWidth > body.clientWidth + 1);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(body);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

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

      {/* 📜 Ticker-Vorschau: alle Meldungen einmal, wie im Live-Ticker */}
      <TickerPreview />

      {/* 📡 Ticker über Server (Beta) */}
      <label className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={draft[SERVER_FEED_ID]?.ticker?.enabled === true}
          onChange={(e) =>
            update(SERVER_FEED_ID, "ticker", { enabled: false, seconds: null, volume: 1, sound: "none" }, { enabled: e.target.checked })
          }
        />
        <span>
          <span className="font-semibold">📡 Ticker über Server</span>{" "}
          <span className="rounded-full bg-indigo-100 px-1.5 py-px text-[10px] font-bold text-indigo-700">BETA</span>
          <span className="block text-xs text-neutral-600">
            Sicherheitsnetz: Die Admin-Seite trägt wie bisher sofort ein. Zusätzlich rechnet der Server nach und
            ergänzt, was fehlt – z. B. wenn das iPad aus war oder die Seite im Hintergrund lag (etwa 10–20 s später).
            Es reicht, wenn irgendein Gerät offen ist (TV, Handy, Admin). Gilt für: Runde generiert/abgeschlossen,
            Durchgänge, On fire, Serie beendet, Noch unbesiegt, Traum geplatzt, Flawless Victory, Turnierende, Score im Vergleich zum Schnitt.
            Ausschalten = wieder wie vorher.
            Benötigt einmalig <code>supabase_tournament_feed_state.sql</code> (10-Sekunden-Tippfehler-Schutz).
          </span>
        </span>
      </label>

      {/* 🎧 Sound-Test: beliebigen Sound anhören */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-neutral-50 px-3 py-2">
        <span className="text-sm font-semibold">🎧 Sound-Test</span>
        <select
          value={testSound}
          onChange={(e) => {
            stopRef.current();
            setTestPlaying(false);
            setTestSound(e.target.value);
          }}
          className="h-8 min-w-0 flex-1 rounded-lg border bg-white px-2 text-sm sm:max-w-xs"
        >
          <optgroup label="Standard">
            {STANDARD_SOUNDS.filter((s) => s.id !== "none").map((s) => (
              <option key={s.id} value={s.id}>
                🔊 {s.label}
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
        <button
          type="button"
          onClick={() => {
            if (testPlaying) {
              stopRef.current();
              setTestPlaying(false);
              return;
            }
            preview(testSound, 1);
            setTestPlaying(true);
            // kurze Klänge sind von selbst fertig → Knopf nach ein paar Sekunden zurücksetzen
            window.clearTimeout(testTimerRef.current);
            testTimerRef.current = window.setTimeout(() => setTestPlaying(false), 12_000);
          }}
          className={
            "h-8 rounded-lg px-3 text-sm font-semibold text-white " +
            (testPlaying ? "bg-red-600 hover:bg-red-700" : "bg-neutral-900 hover:bg-neutral-800")
          }
        >
          {testPlaying ? "⏹ Stopp" : "▶ Start"}
        </button>
      </div>

      {/* 👀 Vorschau: Einblendung mit Beispieldaten ansehen (mit dem eingestellten Sound) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-neutral-50 px-3 py-2">
        <span className="text-sm font-semibold">👀 Vorschau</span>
        <select
          value={previewKind}
          onChange={(e) => setPreviewKind(e.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border bg-white px-2 text-sm sm:max-w-xs"
        >
          {NOTIFICATIONS.filter((n) => n.devices.tv || n.devices.admin).map((n) => (
            <option key={n.id} value={n.id}>
              {n.icon} {n.title}
              {hasRealPreview(n.id) ? "" : " (vereinfacht)"}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded-lg border bg-white text-sm">
          {(["tv", "admin"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPreviewDevice(d)}
              className={"px-2.5 py-1 " + (previewDevice === d ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100")}
            >
              {d === "tv" ? "📺 TV" : "🖥️ Admin"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            stopRef.current();
            setTestPlaying(false);
            setPreviewOpen(true);
          }}
          className="h-8 rounded-lg bg-neutral-900 px-3 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          ▶ Anzeigen
        </button>
        <span className="text-[11px] text-neutral-500">Klick auf die Einblendung schließt sie</span>
      </div>
      {previewOpen ? (
        <NotificationPreview
          key={previewKind + previewDevice}
          kind={previewKind}
          device={previewDevice}
          settings={draft}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      {/* Kopfzeile bleibt oben am Bildschirm stehen; läuft beim Seitwärts-Scrollen mit */}
      <div
        ref={headRef}
        className="sticky top-0 z-20 overflow-hidden rounded-t-xl border bg-neutral-50 shadow-sm"
      >
        <table className="w-full min-w-[1000px] table-fixed text-sm">
          <colgroup>
            <col style={{ width: "14rem" }} />
            {DEVICES.map((d) => (
              <col key={d} />
            ))}
          </colgroup>
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2">Mitteilung</th>
              {DEVICES.map((d) => (
                <th key={d} className="px-3 py-2">
                  {DEVICE_LABEL[d]}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <div
        ref={bodyRef}
        onScroll={(e) => syncScroll(e.currentTarget)}
        className="-mt-3 overflow-x-auto rounded-b-xl border border-t-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <table className="w-full min-w-[1000px] table-fixed text-sm">
          <colgroup>
            <col style={{ width: "14rem" }} />
            {DEVICES.map((d) => (
              <col key={d} />
            ))}
          </colgroup>
          <tbody>
            {NOTIFICATIONS.map((n) => (
              <tr key={n.id} className="border-t align-top">
                <td className="px-3 py-2.5">
                  <div className="font-semibold">
                    {n.icon} {n.title}
                  </div>
                  <div className="mt-1">
                    <ScopeChip kind={n.id} />
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500">{n.when}</div>
                </td>
                {DEVICES.map((d) => {
                  const p = n.devices[d];
                  if (!p) {
                    const hint = HANDLED_ELSEWHERE[n.id]?.[d];
                    return (
                      <td key={d} className={"px-3 py-2.5 " + (hint ? "text-[11px] text-neutral-500" : "text-neutral-300")}>
                        {hint ?? "–"}
                      </td>
                    );
                  }
                  const base: NotifDeviceSetting = { enabled: true, seconds: p.seconds, volume: 1, sound: defaultSoundId(p.sound) };
                  const st = draft[n.id]?.[d] ?? base;
                  const soundBlock = (silentNow: boolean) => (
                    <>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={st.sound}
                          onChange={(e) => update(n.id, d, base, { sound: e.target.value })}
                          className={
                            "h-7 min-w-0 max-w-[11rem] flex-1 rounded-md border px-1.5 text-[11px] " +
                            (silentNow ? "bg-neutral-50 text-neutral-500" : "bg-amber-50 font-semibold text-amber-900")
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
                        {!silentNow ? (
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
                      {!silentNow ? (
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
                    </>
                  );
                  if (d === "ticker") {
                    // 📣 Ticker: an/aus + optional Ton (TV bei aktivem Ton, Admin)
                    const tOff = !st.enabled;
                    return (
                      <td key={d} className={"px-3 py-2.5 " + (tOff ? "bg-neutral-50/80" : "")}>
                        <label className="flex items-center gap-1.5 text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={st.enabled}
                            onChange={(e) => update(n.id, d, base, { enabled: e.target.checked })}
                          />
                          <span className={tOff ? "text-neutral-400 line-through" : "text-neutral-700"}>im Ticker</span>
                        </label>
                        {p.note ? <div className="mt-0.5 text-[11px] text-neutral-400">{p.note}</div> : null}
                        <div className={"mt-1.5 space-y-1.5 " + (tOff ? "pointer-events-none opacity-40" : "")}>
                          {soundBlock(st.sound === "none")}
                        </div>
                      </td>
                    );
                  }
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
      {/* Scrollbalken zum Seitwärts-Scrollen bleibt unten am Bildschirm sichtbar */}
      {overflowX ? (
        <div
          ref={barRef}
          onScroll={(e) => syncScroll(e.currentTarget)}
          className="sticky bottom-0 z-20 -mt-3 overflow-x-auto rounded-b-xl bg-white/90 backdrop-blur"
        >
          <div style={{ width: tableW, height: 1 }} />
        </div>
      ) : null}

      {/* 🏷️ Dauerhafte Anzeigen (Badges): nur an/aus je Gerät */}
      <div className="rounded-xl border">
        <div className="border-b bg-neutral-50 px-3 py-2">
          <div className="text-sm font-semibold">🏷️ Dauerhafte Anzeigen</div>
          <div className="text-[11px] text-neutral-500">
            Keine Mitteilungen, sondern Badges/Zeilen, die stehen bleiben, solange der Zustand gilt – hier nur an/aus je
            Gerät.
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2">Anzeige</th>
                {(["tv", "admin", "phone"] as NotifDevice[]).map((d) => (
                  <th key={d} className="px-3 py-2">
                    {DEVICE_LABEL[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BADGES.map((b) => (
                <tr key={b.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-semibold">
                      {b.icon} {b.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">{b.when}</div>
                  </td>
                  {(["tv", "admin", "phone"] as NotifDevice[]).map((d) => {
                    const p = b.devices[d];
                    if (!p) {
                      return (
                        <td key={d} className="px-3 py-2 text-neutral-300">
                          –
                        </td>
                      );
                    }
                    const base: NotifDeviceSetting = { enabled: true, seconds: null, volume: 1, sound: "none" };
                    const st = draft[b.id]?.[d] ?? base;
                    return (
                      <td key={d} className={"px-3 py-2 " + (!st.enabled ? "bg-neutral-50/80" : "")}>
                        <label className="flex items-center gap-1.5 text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={st.enabled}
                            onChange={(e) => update(b.id, d, base, { enabled: e.target.checked })}
                          />
                          <span className={!st.enabled ? "text-neutral-400 line-through" : "text-neutral-700"}>{p.where}</span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
