"use client";

import { useState } from "react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";

/**
 * Admin-only tab content.
 *
 * IMPORTANT: The visibility of this tab is controlled in app/t/page.tsx via `isAdmin`.
 * When you add real actions (migrations, point-system changes, rebuilds, etc.),
 * make sure the corresponding API routes also enforce admin permissions server-side.
 */
export default function AdminTab() {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function runPlaceholder(key: string, label: string) {
    try {
      setBusyKey(key);
      // Placeholder: wire this to a real API route later.
      alert(label);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold">Admin</div>
        <div className="text-sm text-neutral-600">
          Hier kommen Admin-Aktionen rein (z.B. neues Punktesystem übernehmen).
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold">Punktesystem</div>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              onClick={() =>
                runPlaceholder("apply_points", "Neues Punktesystem übernommen (Platzhalter)")
              }
              disabled={busyKey !== null}
            >
              {busyKey === "apply_points" ? "…" : "Neues Punktesystem übernehmen"}
            </Button>

            <Button
              onClick={() =>
                runPlaceholder("preview_points", "Vorschau/Simulation gestartet (Platzhalter)")
              }
              disabled={busyKey !== null}
            >
              {busyKey === "preview_points" ? "…" : "Vorschau / Simulation"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold">Wartung</div>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              onClick={() => runPlaceholder("rebuild", "Rebuild angestoßen (Platzhalter)")}
              disabled={busyKey !== null}
            >
              {busyKey === "rebuild" ? "…" : "Stats/Leaderboards rebuild"}
            </Button>

            <Button
              onClick={() => runPlaceholder("checks", "Daten-Checks gestartet (Platzhalter)")}
              disabled={busyKey !== null}
            >
              {busyKey === "checks" ? "…" : "Daten-Checks"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
