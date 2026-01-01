"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, Input } from "@/components/ui";

type Profile = { id: string; name: string; avatar_url: string | null; rating?: number | null };

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <div className="h-10 w-10 overflow-hidden rounded-xl border bg-neutral-100 flex items-center justify-center">
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" /> : <span className="text-sm font-semibold text-neutral-600">{initials || "?"}</span>}
    </div>
  );
}

export default function PlayersTab() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setErr(null);
    try {
      const res = await fetch("/api/profiles/list", { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      setProfiles(j.profiles ?? []);
    } catch {
      setProfiles([]);
      setErr("Spieler/Profiles konnten nicht geladen werden.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return profiles;
    return profiles.filter((p) => (p.name ?? "").toLowerCase().includes(s));
  }, [profiles, q]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">Spieler (Profiles)</div>
          <div className="flex items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen…" />
            <Button variant="secondary" disabled={busy} onClick={load}>
              Neu laden
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {err ? <div className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

        <div className="space-y-2">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar url={p.avatar_url} name={p.name} />
                <div className="text-base font-medium">{p.name}</div>
                {typeof p.rating === "number" ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-sm">
                    Elo <span className="ml-2 font-semibold tabular-nums">{Math.round(p.rating)}</span>
                  </span>
                ) : null}
              </div>

              <div className="text-xs font-mono text-neutral-400">{p.id}</div>
            </div>
          ))}

          {filtered.length === 0 ? <div className="text-sm text-neutral-500">Keine Spieler gefunden.</div> : null}
        </div>
      </CardBody>
    </Card>
  );
}