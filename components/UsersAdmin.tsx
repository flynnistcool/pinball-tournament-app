"use client";

// 👥 Admin-Bereich: Logins verwalten (anlegen, Rolle, Spielerprofil, Passwort, löschen).
// Alle Änderungen laufen über /api/admin/users* – nur für echt geprüfte Admins (middleware.ts).

import { useEffect, useMemo, useState } from "react";
import ProfileSelectSingle from "@/components/ProfileSelectSingle";

type UserRow = {
  id: string;
  email: string;
  role: "admin" | "viewer" | "pending";
  createdAt: string | null;
  lastSignInAt: string | null;
  profileId: string | null;
  profileName: string | null;
  isSelf: boolean;
  displayName?: string | null;
  signupNote?: string | null;
};

type ProfileOpt = { id: string; name: string; icon: string | null; color: string | null };

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–");

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok && j?.ok ? { ok: true } : { ok: false, error: j?.error ?? `Fehler (${r.status})` };
  } catch {
    return { ok: false, error: "Netzwerkfehler" };
  }
}

function RoleBadge({ role, hasProfile }: { role: "admin" | "viewer" | "pending"; hasProfile?: boolean }) {
  return role === "admin" ? (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">👑 Admin</span>
  ) : hasProfile ? (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">🎮 Zuschauer mit Spielerprofil</span>
  ) : (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">👀 Zuschauer</span>
  );
}

export default function UsersAdmin() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [profiles, setProfiles] = useState<ProfileOpt[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // neuer Login
  const [nEmail, setNEmail] = useState("");
  const [nPw, setNPw] = useState("");
  const [nRole, setNRole] = useState<"admin" | "viewer">("viewer");
  const [nProfile, setNProfile] = useState("");

  async function load() {
    setErr(null);
    try {
      const r = await fetch(`/api/admin/users?ts=${Date.now()}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setErr(j?.error ?? "Benutzer konnten nicht geladen werden");
        setUsers([]);
        return;
      }
      setUsers(j.users ?? []);
    } catch {
      setErr("Netzwerkfehler");
      setUsers([]);
    }
  }

  useEffect(() => {
    load();
    fetch(`/api/profiles/list?ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) =>
        setProfiles(
          (j?.profiles ?? [])
            .filter((p: any) => !p.is_bot && !p.exclude_from_stats) // nur echte Spieler
            .map((p: any) => ({
              id: String(p.id),
              name: String(p.name ?? "?"),
              icon: (p.icon ?? "").trim() || null,
              color: p.color ?? null,
            }))
            .sort((a: ProfileOpt, b: ProfileOpt) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }))
        )
      )
      .catch(() => setProfiles([]));
  }, []);

  // Blöcke: 👑 Admins → 👀 Zuschauer → 🎮 Zuschauer mit Spielerprofil (je alphabetisch)
  const userGroups = useMemo(() => {
    const byMail = (a: UserRow, b: UserRow) => a.email.localeCompare(b.email, "de", { sensitivity: "base" });
    const all = users ?? [];
    return [
      { key: "admins", label: "👑 Admins", list: all.filter((u) => u.role === "admin").sort(byMail) },
      { key: "viewers", label: "👀 Zuschauer", list: all.filter((u) => u.role === "viewer" && !u.profileId).sort(byMail) },
      {
        key: "players",
        label: "🎮 Zuschauer mit Spielerprofil",
        list: all.filter((u) => u.role === "viewer" && !!u.profileId).sort(byMail),
      },
    ].filter((g) => g.list.length > 0);
  }, [users]);

  // ⏳ selbst registriert, wartet auf Freischaltung (älteste zuerst)
  const pendingUsers = useMemo(
    () => (users ?? []).filter((u) => u.role === "pending").sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    [users]
  );
  // gewähltes Spielerprofil je wartendem Login (optional beim Freischalten)
  const [approveProfile, setApproveProfile] = useState<Record<string, string>>({});

  // welches Profil ist schon mit welchem Login verknüpft?
  const linkedBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users ?? []) if (u.profileId) m.set(u.profileId, u.email);
    return m;
  }, [users]);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText: string): Promise<boolean> {
    setBusy(key);
    setMsg(null);
    setErr(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setErr(r.error ?? "Fehler");
    else setMsg(okText);
    await load();
    return r.ok;
  }

  function profileSelect(value: string, onChange: (v: string) => void, selfUserEmail?: string) {
    return (
      <ProfileSelectSingle
        value={value}
        onChange={onChange}
        options={profiles.map((p) => {
          const other = linkedBy.get(p.id);
          return {
            id: p.id,
            name: p.name,
            icon: p.icon,
            color: p.color,
            note: other && other !== selfUserEmail ? `schon mit ${other}` : null,
          };
        })}
      />
    );
  }

  return (
    <div className="space-y-4">
      {err ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">⚠️ {err}</div> : null}
      {msg ? <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✅ {msg}</div> : null}

      {/* ⏳ Wartet auf Freischaltung */}
      {pendingUsers.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <span>⏳ Wartet auf Freischaltung</span>
            <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[11px]">{pendingUsers.length}</span>
          </div>
          {pendingUsers.map((u) => {
            const pid = approveProfile[u.id] ?? "";
            const label = u.displayName ? `${u.displayName} (${u.email})` : u.email;
            return (
              <div key={u.id} className="rounded-xl border bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{u.displayName ?? "(ohne Namen)"}</span>
                  <span className="truncate text-sm text-neutral-600">{u.email}</span>
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">registriert {fmtDate(u.createdAt)}</div>
                {u.signupNote ? (
                  <div className="mt-1 rounded-lg bg-neutral-50 px-2 py-1 text-xs text-neutral-700">💬 {u.signupNote}</div>
                ) : null}
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  {profileSelect(pid, (v) => setApproveProfile((m) => ({ ...m, [u.id]: v })), u.email)}
                  <button
                    type="button"
                    disabled={busy === u.id}
                    onClick={() =>
                      run(
                        u.id,
                        () => post("/api/admin/users/update", { id: u.id, role: "viewer", ...(pid ? { profileId: pid } : {}) }),
                        `${label} freigeschaltet${pid ? " und mit Spielerprofil verknüpft" : ""}.`
                      )
                    }
                    className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ✅ Freischalten
                  </button>
                  <button
                    type="button"
                    disabled={busy === u.id}
                    onClick={() => {
                      if (!confirm(`Anmeldung von ${label} ablehnen?\n\nDer Login wird gelöscht.`)) return;
                      run(u.id, () => post("/api/admin/users/delete", { id: u.id }), `Anmeldung von ${label} abgelehnt.`);
                    }}
                    className="h-9 rounded-lg border border-red-200 bg-white px-3 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    ❌ Ablehnen
                  </button>
                </div>
              </div>
            );
          })}
          <div className="text-[11px] text-amber-800">
            Freigeschaltete werden 👀 Zuschauer. Das Spielerprofil ist optional und geht auch später noch.
          </div>
        </div>
      ) : null}

      {/* Liste */}
      {users == null ? (
        <div className="text-sm text-neutral-500">Lade Benutzer …</div>
      ) : (
        <div className="space-y-2">
          {userGroups.map((g) => (
            <div key={g.key} className="space-y-2">
              <div className="flex items-center gap-2 px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <span>{g.label}</span>
                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">{g.list.length}</span>
                <span className="h-px flex-1 bg-neutral-200" />
              </div>
              {g.list.map((u) => (
            <div key={u.id} className={"rounded-xl border p-3 " + (u.isSelf ? "border-amber-300 bg-amber-50/40" : "bg-white")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{u.email}</span>
                    <RoleBadge role={u.role} hasProfile={!!u.profileId} />
                    {u.isSelf ? (
                      <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">du</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    🎮 Spielerprofil: <b className="text-neutral-700">{u.profileName ?? "keins"}</b> · zuletzt angemeldet{" "}
                    {fmtDate(u.lastSignInAt)} · angelegt {fmtDate(u.createdAt)}
                  </div>
                </div>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center">
                {/* Rolle */}
                <select
                  value={u.role}
                  disabled={busy === u.id || (u.isSelf && u.role === "admin")}
                  title={u.isSelf ? "Du kannst dir selbst nicht die Admin-Rolle wegnehmen" : "Rolle ändern"}
                  onChange={(e) => {
                    const role = e.target.value as "admin" | "viewer";
                    if (!confirm(`${u.email} wirklich zu ${role === "admin" ? "👑 Admin" : "👀 Zuschauer"} machen?`)) return;
                    run(u.id, () => post("/api/admin/users/update", { id: u.id, role }), `Rolle von ${u.email} geändert (gilt nach erneutem Anmelden).`);
                  }}
                  className="h-9 rounded-lg border bg-white px-2 text-sm disabled:opacity-60"
                >
                  <option value="viewer">👀 Zuschauer</option>
                  <option value="admin">👑 Admin</option>
                </select>

                {/* Profil */}
                {profileSelect(u.profileId ?? "", (v) =>
                  run(u.id, () => post("/api/admin/users/update", { id: u.id, profileId: v || null }), v ? "Spielerprofil verknüpft." : "Verknüpfung gelöst."),
                  u.email
                )}

                {/* Passwort */}
                <button
                  type="button"
                  disabled={busy === u.id}
                  onClick={() => {
                    const pw = prompt(`Neues Passwort für ${u.email} (mind. 8 Zeichen):`);
                    if (pw == null) return;
                    run(u.id, () => post("/api/admin/users/update", { id: u.id, password: pw }), `Passwort von ${u.email} geändert.`);
                  }}
                  className="h-9 rounded-lg border bg-white px-3 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  🔑 Passwort
                </button>

                {/* Löschen */}
                <button
                  type="button"
                  disabled={busy === u.id || u.isSelf}
                  title={u.isSelf ? "Du kannst dich nicht selbst löschen" : "Login löschen (Spielerprofil bleibt erhalten)"}
                  onClick={() => {
                    if (!confirm(`Login ${u.email} wirklich löschen?\n\nDas Spielerprofil bleibt erhalten, nur der Login ist weg.`)) return;
                    run(u.id, () => post("/api/admin/users/delete", { id: u.id }), `Login ${u.email} gelöscht.`);
                  }}
                  className="h-9 rounded-lg border border-red-200 bg-white px-3 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  🗑️ Löschen
                </button>
              </div>
            </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Neuer Login */}
      <div className="rounded-xl border border-dashed bg-neutral-50 p-3">
        <div className="mb-2 text-sm font-semibold">➕ Neuen Login anlegen</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={nEmail}
            onChange={(e) => setNEmail(e.target.value)}
            placeholder="E-Mail"
            inputMode="email"
            className="h-9 rounded-lg border bg-white px-2 text-sm"
          />
          <input
            value={nPw}
            onChange={(e) => setNPw(e.target.value)}
            placeholder="Startpasswort (mind. 8 Zeichen)"
            className="h-9 rounded-lg border bg-white px-2 text-sm"
          />
          <select
            value={nRole}
            onChange={(e) => setNRole(e.target.value as "admin" | "viewer")}
            className="h-9 rounded-lg border bg-white px-2 text-sm"
          >
            <option value="viewer">👀 Zuschauer (nur ansehen)</option>
            <option value="admin">👑 Admin (darf alles)</option>
          </select>
          {profileSelect(nProfile, setNProfile)}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-xs text-neutral-500">
            Der Login ist sofort aktiv (keine Bestätigungs-Mail). Passwort bitte selbst weitergeben.
          </div>
          <button
            type="button"
            disabled={busy === "new" || !nEmail.trim() || nPw.length < 8}
            onClick={() =>
              run(
                "new",
                () => post("/api/admin/users", { email: nEmail, password: nPw, role: nRole, profileId: nProfile || null }),
                `Login ${nEmail.trim()} angelegt.`
              ).then((ok) => {
                if (!ok) return; // Eingaben behalten, damit man korrigieren kann
                setNEmail("");
                setNPw("");
                setNRole("viewer");
                setNProfile("");
              })
            }
            className="h-9 shrink-0 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {busy === "new" ? "Lege an …" : "Anlegen"}
          </button>
        </div>
      </div>

      <div className="text-xs text-neutral-500">
        ℹ️ Rollen-Änderungen gelten, sobald sich der Benutzer neu anmeldet (spätestens nach etwa einer Stunde automatisch).
        Zuschauer können alles ansehen, aber nichts ändern.
      </div>
    </div>
  );
}
