"use client";

// ⚙️ Gespeicherte Bot-Stellschrauben im Browser (einmal laden, geteilt) – z. B. für die
// 🟠 Specialist-Lieblingsflipper im Admin (gleiche Anzahl wie beim Würfeln).

import { useEffect, useState } from "react";
import { BOT_SETTINGS, normalizeBotSettings, type BotSettings } from "@/lib/botScore";

let cached: Promise<BotSettings> | null = null;

function load(): Promise<BotSettings> {
  if (!cached) {
    cached = fetch(`/api/bots/settings?ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => normalizeBotSettings(j?.settings))
      .catch(() => {
        cached = null;
        return normalizeBotSettings(BOT_SETTINGS);
      });
  }
  return cached;
}

export function useBotSettings(active = true): BotSettings {
  const [s, setS] = useState<BotSettings>(() => normalizeBotSettings(BOT_SETTINGS));
  useEffect(() => {
    if (!active) return;
    let alive = true;
    load().then((v) => alive && setS(v));
    return () => {
      alive = false;
    };
  }, [active]);
  return s;
}
