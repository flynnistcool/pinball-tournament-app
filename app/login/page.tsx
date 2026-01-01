"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Card, CardBody, CardHeader, Input, Button, Pill } from "@/components/ui";

export default function LoginPage() {
  const sb = supabaseBrowser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) location.href = "/";
    })();
  }, []);

  async function onLogin() {
    setBusy(true); setMsg(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    location.href = "/";
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-neutral-500"></div>
              <div className="text-lg font-semibold">Anmelden</div>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-sm text-neutral-600">E-Mail</div>
              <Input value={email} onChange={(e)=>setEmail(e.target.value)} inputMode="email" placeholder="admin@example.com" />
            </div>
            <div>
              <div className="mb-1 text-sm text-neutral-600">Passwort</div>
              <Input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" placeholder="••••••••" />
            </div>
            <Button disabled={busy} onClick={onLogin} className="w-full">Anmelden</Button>
            {msg && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</div>}
            <div className="text-xs text-neutral-500">
              Hinweis: Admin-Account wird in Supabase Auth angelegt (Users → Add user).
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
