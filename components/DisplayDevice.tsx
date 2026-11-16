"use client";

// 🏷️ Auf welchem Gerät läuft die Seite? (TV / Admin / Handy) – damit dauerhafte Anzeigen (Badges)
// ihre Einstellung aus 🔔 Meldungen & Sounds → "Dauerhafte Anzeigen" kennen.
// TV-Seite und Handy-Seite setzen den Provider; ohne Provider gilt "admin".

import { createContext, useContext, type ReactNode } from "react";
import { notifSetting } from "@/lib/notifications";
import { useNotificationSettings } from "@/components/useNotificationSettings";

type DisplayDevice = "tv" | "admin" | "phone";

const DisplayDeviceContext = createContext<DisplayDevice>("admin");

export function DisplayDeviceProvider({ device, children }: { device: DisplayDevice; children: ReactNode }) {
  return <DisplayDeviceContext.Provider value={device}>{children}</DisplayDeviceContext.Provider>;
}

export function useDisplayDevice(): DisplayDevice {
  return useContext(DisplayDeviceContext);
}

/** Ist diese dauerhafte Anzeige (z. B. "badge:favorite") auf diesem Gerät eingeschaltet? */
export function useBadgeOn(id: string): boolean {
  const device = useDisplayDevice();
  const ns = useNotificationSettings();
  return notifSetting(ns, id, device).enabled;
}
