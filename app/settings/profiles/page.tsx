"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader, Input, Button, Pill } from "@/components/ui";

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [startRating, setStartRating] = useState("1500");
  const [provisionalMatches, setProvisionalMatches] = useState("10");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/profiles/list", { cache: "no-store" });
    const j = await res.json();
    setProfiles(j.profiles ?? []);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setMsg(null);
    const res = await fetch("/api/profiles/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startRating: Number(startRating), provisionalMatches: Number(provisionalMatches) })
    });
    const j = await res.json();
    if (!res.ok) { setMsg(j.error ?? "Fehler"); return; }
    setName("");
    await load();
    setMsg("Profil angelegt ✅");
  }

  async function save(p: any, rating: number, prov: number, reset: boolean) {
    setMsg(null);
    const res = await fetch("/api/profiles/setRating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, rating, provisionalMatches: prov, resetMatchesPlayed: reset })
    });
    const j = await res.json();
    if (!res.ok) { setMsg(j.error ?? "Fehler"); return; }
    await load();
    setMsg("Gespeichert ✅");
  }

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return profiles;
    return profiles.filter((p:any)=> (p.name ?? "").toLowerCase().includes(qq));
  }, [profiles, q]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-neutral-500">Admin</div>
              <div className="text-lg font-semibold">Spieler-Profile</div>
              <div className="mt-1 text-sm text-neutral-600">Hier kannst du Profile anlegen und Start-Elo (800–3000) / Provisional-Matches setzen (z.B. für Profis). Nach dem ersten Match ist manuelles Ändern gesperrt.</div>
            </div>
            <div className="flex items-center gap-2">
              <a className="inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-medium bg-neutral-100 hover:bg-neutral-200" href="/">Zurück</a>
              <Pill>v2.0</Pill>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <div className="mb-1 text-sm text-neutral-600">Name</div>
              <Input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Spielername" />
            </div>
            <div>
              <div className="mb-1 text-sm text-neutral-600">Start-Elo</div>
              <Input value={startRating} onChange={(e)=>setStartRating(e.target.value)} inputMode="numeric" />
              <div className="mt-1 text-xs text-neutral-500">Standard: 1500 (änderbar vor dem 1. Match, Range 800–3000)</div>
            </div>
            <div>
              <div className="mb-1 text-sm text-neutral-600">Provisional Matches</div>
              <Input value={provisionalMatches} onChange={(e)=>setProvisionalMatches(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button onClick={create}>Profil anlegen</Button>
            <Button variant="secondary" onClick={load}>Aktualisieren</Button>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-sm text-neutral-600">Suche</div>
            <Input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Name..." />
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border bg-white">
            <div className="grid grid-cols-12 gap-2 border-b bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              <div className="col-span-4">Name</div>
              <div className="col-span-2 text-right">Elo</div>
              <div className="col-span-3 text-right">Matches</div>
              <div className="col-span-3 text-right">Aktion</div>
            </div>
            {list.map((p:any)=> (
              <ProfileRow key={p.id} p={p} onSave={save} />
            ))}
            {list.length === 0 && <div className="px-4 py-4 text-sm text-neutral-500">Keine Profile gefunden.</div>}
          </div>

          {msg && <div className="mt-3 rounded-xl bg-neutral-100 p-3 text-sm">{msg}</div>}
        </CardBody>
      </Card>
    </div>
  );
}

function ProfileRow({ p, onSave }: any) {
  const [rating, setRating] = useState(String(Math.round(p.rating ?? 1500)));
  const [prov, setProv] = useState(String(p.provisional_matches ?? 10));
  const [reset, setReset] = useState(false);

  const played = (p.matches_played ?? 0);
  const isProv = played < (p.provisional_matches ?? 0);
  const canEdit = played === 0;

  return (
    <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b last:border-b-0 items-center">
      <div className="col-span-4">
        <div className="font-medium">{p.name}</div>
        <div className="text-xs text-neutral-500">{isProv ? `Provisional (${p.matches_played ?? 0}/${p.provisional_matches ?? 0})` : `Stabil (${p.matches_played ?? 0} Matches)`}</div>
      </div>
      <div className="col-span-2 text-right">
        <Input value={rating} onChange={(e)=>setRating(e.target.value)} inputMode="numeric" disabled={!canEdit} />
      </div>
      <div className="col-span-3 text-right">
        <Input value={prov} onChange={(e)=>setProv(e.target.value)} inputMode="numeric" disabled={!canEdit} />
      </div>
      <div className="col-span-3 text-right">
        {canEdit ? (
          <>
            <Button variant="secondary" onClick={()=>onSave(p, Number(rating), Number(prov), false)}>Speichern</Button>
          </>
        ) : (
          <span className="text-xs text-neutral-500">Gesperrt nach 1. Match</span>
        )}
      </div>
    </div>
  );
}
