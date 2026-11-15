"use client";

// 📝 Registrieren (ohne Mail): Konto wird angelegt und wartet auf Freischaltung durch den Admin.

import { useState } from "react";
import { Card, CardBody, CardHeader, Input, Button } from "@/components/ui";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // 🍯 Honeypot (unsichtbar)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pwMismatch = password2.length > 0 && password !== password2;

  async function onRegister() {
    if (password !== password2) {
      setMsg("Die beiden Passwörter stimmen nicht überein");
      return;
    }
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
                <div className="relative">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    title={showPw ? "Passwort verbergen" : "Passwort anzeigen"}
                    aria-label={showPw ? "Passwort verbergen" : "Passwort anzeigen"}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-lg text-neutral-500 hover:bg-neutral-100"
                  >
                    {showPw ? "🙈" : "👁️"}
                  </button>
                </div>
                {password.length > 0 && password.length < 8 ? (
                  <div className="mt-1 text-xs text-amber-700">Noch {8 - password.length} Zeichen</div>
                ) : null}
              </div>
              <div>
                <div className="mb-1 text-sm text-neutral-600">Passwort wiederholen</div>
                <div className="relative">
                  <Input
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className={"pr-12 " + (pwMismatch ? "border-red-300" : "")}
                  />
                  {password2.length > 0 ? (
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base">
                      {pwMismatch ? "❌" : "✅"}
                    </span>
                  ) : null}
                </div>
                {pwMismatch ? <div className="mt-1 text-xs text-red-600">Die Passwörter stimmen nicht überein</div> : null}
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
              <Button disabled={busy || !name.trim() || !email.trim() || password.length < 8 || password !== password2} onClick={onRegister} className="w-full">
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
