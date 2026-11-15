"use client";

// ⏳ Warte-Seite für selbst registrierte Logins, die der Admin noch nicht freigeschaltet hat.
// "Erneut prüfen" holt eine frische Anmeldung (mit der neuen Rolle) und versucht es noch einmal.

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";

export default function WartetPage() {
  const sb = supabaseBrowser();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function recheck() {
    setBusy(true);
    setMsg(null);
    try {
      await sb.auth.refreshSession(); // neue Rolle ins Anmelde-Cookie holen
      const { data } = await sb.auth.getUser();
      if (data.user?.app_metadata?.role && data.user.app_metadata.role !== "pending") {
        location.href = "/t";
        return;
      }
      setMsg("Noch nicht freigeschaltet – bitte etwas Geduld.");
    } catch {
      setMsg("Prüfen gerade nicht möglich – bitte später erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await sb.auth.signOut();
    location.href = "/login";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">⏳ Wartet auf Freischaltung</div>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Dein Konto ist angelegt, muss aber noch vom Admin freigeschaltet werden. Danach kannst du Turniere,
              Statistiken und Spieler ansehen.
            </div>
            <Button disabled={busy} onClick={recheck} className="w-full">
              {busy ? "Prüfe …" : "🔄 Erneut prüfen"}
            </Button>
            {msg ? <div className="text-center text-sm text-neutral-600">{msg}</div> : null}
            <button type="button" onClick={logout} className="w-full text-center text-xs text-neutral-500 hover:underline">
              Abmelden
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
