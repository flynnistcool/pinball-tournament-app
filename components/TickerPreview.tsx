"use client";

// 📜 Ticker-Vorschau (Admin → 🔔 Meldungen & Sounds): jede Meldungsart einmal mit Beispielnamen,
// in der echten Ticker-Darstellung (LiveTicker mit previewItems). Nur Anzeige – nichts wird gespeichert.

import { useMemo, useState } from "react";
import LiveTicker from "@/components/LiveTicker";
import { tickerPreviewItems } from "@/lib/tickerPreviewItems";

export default function TickerPreview() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const items = useMemo(() => tickerPreviewItems(), []);

  return (
    <div className="rounded-xl border bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold"
      >
        <span>
          📜 Ticker-Vorschau{" "}
          <span className="font-normal text-neutral-500">– jede Meldung einmal mit Beispielnamen, so wie im Live-Ticker</span>
        </span>
        <span className="text-xs text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t px-3 pb-3 pt-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500">Darstellung:</span>
            {[
              { v: false, label: "☀️ Hell (Admin)" },
              { v: true, label: "🌙 Dunkel (TV)" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setDark(o.v)}
                className={
                  "rounded-full px-2.5 py-1 font-semibold ring-1 " +
                  (dark === o.v ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white text-neutral-700 ring-neutral-200")
                }
              >
                {o.label}
              </button>
            ))}
            <span className="text-neutral-400">Nur Anzeige – erscheint in keinem echten Ticker.</span>
          </div>
          <div className={dark ? "max-w-[34rem] rounded-2xl bg-neutral-950 p-3" : "max-w-[26rem]"}>
            <LiveTicker code="" variant={dark ? "tv" : "admin"} previewItems={items} title={false} soundOn={false} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
