"use client";

// 📝 Registrieren (ohne Mail): Konto wird angelegt und wartet auf Freischaltung durch den Admin.

import { useState } from "react";
import { Card, CardBody, CardHeader, Input, Button } from "@/components/ui";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // 🍯 Honeypot (unsichtbar)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onRegister() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/public/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, note, website }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setMsg(j?.error ?? "Registrierung fehlgeschlagen");
        return;
      }
      setDone(true);
    } catch {
      setMsg("Netzwerkfehler – bitte erneut versuchen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">Registrieren</div>
          <div className="text-xs text-neutral-500">
            Nach der Registrierung schaltet der Admin dein Konto frei – dann kannst du alles ansehen.
          </div>
        </CardHeader>
        <CardBody>
          {done ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                ✅ Danke! Dein Konto ist angelegt und <b>wartet auf Freischaltung</b> durch den Admin.
                Du kannst dich schon anmelden – sobald du freigeschaltet bist, siehst du alles.
              </div>
              <a href="/login" className="block w-full rounded-xl bg-neutral-900 px-4 py-2 text-center text-sm font-semibold text-white">
                Zur Anmeldung
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-sm text-neutral-600">Dein Name</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Markus" />
              </div>
              <div>
                <div className="mb-1 text-sm text-neutral-600">E-Mail</div>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="name@beispiel.de" />
              </div>
              <div>
                <div className="mb-1 text-sm text-neutral-600">Passwort (mind. 8 Zeichen)</div>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
              </div>
              <div>
                <div className="mb-1 text-sm text-neutral-600">Hinweis für den Admin (optional)</div>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Ich spiele in der Flipperliga mit" />
              </div>
              {/* 🍯 für Bots – für Menschen unsichtbar */}
              <input
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
                aria-hidden="true"
              />
              <Button disabled={busy || !name.trim() || !email.trim() || password.length < 8} onClick={onRegister} className="w-full">
                {busy ? "Registriere …" : "Registrieren"}
              </Button>
              {msg ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</div> : null}
              <div className="text-center text-xs text-neutral-500">
                Schon ein Konto?{" "}
                <a href="/login" className="font-semibold text-blue-700 hover:underline">
                  Anmelden
                </a>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
