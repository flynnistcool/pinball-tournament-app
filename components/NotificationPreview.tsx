"use client";

// 👀 Vorschau einer Mitteilung (🔔 Meldungen & Sounds): zeigt die echte Einblendung mit Beispieldaten
// in der TV- oder Admin-Darstellung und spielt den eingestellten Sound (auch noch nicht gespeicherte Änderungen).
// Klick schließt; sonst nach der eingestellten Dauer.

import { useEffect } from "react";
// @ts-ignore -- @types/react-dom ist im Projekt nicht installiert (createPortal funktioniert trotzdem)
import { createPortal } from "react-dom";
import { NOTIFICATIONS, notifSetting, type NotificationSettings } from "@/lib/notifications";
import { playSoundById } from "@/lib/playSound";
import { CELEBRATION_KINDS, CelebrationPreview } from "@/components/RecordCelebration";
import { FlawlessPreview } from "@/components/FlawlessCelebration";
import { RivalryEventPreview } from "@/components/RivalryEvents";
import type { RivalryEvent } from "@/lib/rivalryInsights";

const RIVALRY_KINDS: RivalryEvent["kind"][] = [
  "streakBroken",
  "nemesisBeaten",
  "jubilee",
  "leadChange",
  "streakGrow",
  "newNemesis",
  "evenReached",
];

type CelebrationKind = (typeof CELEBRATION_KINDS)[number];
const isCelebration = (k: string): k is CelebrationKind => (CELEBRATION_KINDS as readonly string[]).includes(k);
const isRivalry = (k: string): k is RivalryEvent["kind"] => (RIVALRY_KINDS as string[]).includes(k);

/** Gibt es für diese Art eine echte Vorschau (sonst vereinfachte Karte)? */
export function hasRealPreview(kind: string): boolean {
  return isCelebration(kind) || isRivalry(kind) || kind === "flawless";
}

export default function NotificationPreview({
  kind,
  device,
  settings,
  onClose,
}: {
  kind: string;
  device: "tv" | "admin";
  settings: NotificationSettings;
  onClose: () => void;
}) {
  const st = notifSetting(settings, kind, device);

  useEffect(() => {
    const stop = st.sound !== "none" ? playSoundById(st.sound, st.volume) : () => {};
    const t = st.ms ? window.setTimeout(onClose, st.ms) : undefined;
    return () => {
      stop();
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, device]);

  if (isCelebration(kind)) return <CelebrationPreview kind={kind} onClose={onClose} />;
  if (kind === "flawless") return <FlawlessPreview variant={device} onClose={onClose} />;
  if (isRivalry(kind)) return <RivalryEventPreview kind={kind} variant={device} onClose={onClose} />;

  // vereinfachte Vorschau für die übrigen Arten (Runde generiert/abgeschlossen, Turnierende …)
  const def = NOTIFICATIONS.find((n) => n.id === kind);
  return createPortal(
    <div className="fixed inset-0 z-[130] flex cursor-pointer items-center justify-center bg-black/60" onClick={onClose}>
      <div className="mx-4 max-w-xl rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 px-10 py-8 text-center text-white shadow-2xl ring-4 ring-white/20">
        <div className="text-7xl leading-none">{def?.icon ?? "🔔"}</div>
        <div className="mt-3 text-3xl font-black">{def?.title ?? kind}</div>
        <div className="mt-2 text-sm text-white/80">{def?.when}</div>
        <div className="mt-3 text-xs text-white/60">
          Darstellung {device === "tv" ? "am TV" : "im Admin"}: {def?.devices[device]?.where ?? "–"} · vereinfachte Vorschau
        </div>
      </div>
    </div>,
    document.body
  );
}
