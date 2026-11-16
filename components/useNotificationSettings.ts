"use client";

// 🔔 Mitteilungs-Einstellungen (global) – einmal laden, zwischen allen Komponenten geteilt,
// alle 5 Minuten aktualisiert. Bis zum Laden: Standardwerte (= bisheriges Verhalten).

import { useEffect, useState } from "react";
import {
  defaultNotificationSettings,
  normalizeNotificationSettings,
  type NotificationSettings,
} from "@/lib/notifications";

const REFRESH_MS = 5 * 60_000;
let cache: { at: number; settings: NotificationSettings } | null = null;
let inflight: Promise<NotificationSettings> | null = null;
const listeners = new Set<(s: NotificationSettings) => void>();

function load(force = false): Promise<NotificationSettings> {
  if (!force && cache && Date.now() - cache.at < REFRESH_MS) return Promise.resolve(cache.settings);
  if (inflight) return inflight;
  inflight = fetch(`/api/public/notification-settings?ts=${Date.now()}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => (j?.ok ? normalizeNotificationSettings(j.settings) : defaultNotificationSettings()))
    .catch(() => cache?.settings ?? defaultNotificationSettings())
    .then((s) => {
      cache = { at: Date.now(), settings: s };
      inflight = null;
      listeners.forEach((l) => l(s));
      return s;
    });
  return inflight;
}

/** nach dem Speichern auf der Admin-Seite: sofort für alle Komponenten übernehmen */
export function publishNotificationSettings(s: NotificationSettings) {
  cache = { at: Date.now(), settings: s };
  listeners.forEach((l) => l(s));
}

export function useNotificationSettings(): NotificationSettings {
  const [s, setS] = useState<NotificationSettings>(() => cache?.settings ?? defaultNotificationSettings());
  useEffect(() => {
    listeners.add(setS);
    load().then(setS);
    const t = window.setInterval(() => load(true), REFRESH_MS);
    return () => {
      listeners.delete(setS);
      window.clearInterval(t);
    };
  }, []);
  return s;
}
