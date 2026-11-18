"use client";

// 🧮 Elo-Rechner (Admin): versteckter Knopf rechts unten (nur ab Tablet-Breite) → Fenster mittig am rechten Rand.
// Zwei Spieler wählen (Werte aus dem Profil, änderbar) → Gewinnchance, K-Faktor, Neuling-Schutz und
// was ein Sieg / Unentschieden / eine Niederlage bringt – mit Rechenweg. Rechnung: lib/eloCalc.ts (wie recalc-elo).

import { useEffect, useRef, useState } from "react";
import { duel, type DuelSide, type EloPlayer } from "@/lib/eloCalc";

type Prof = { id: string; name: string; rating: number | null; matches_played: number | null; provisional_matches: number | null; is_bot?: boolean | null };
type Side = { profileId: string; rating: string; matches: string; provisional: string };

const EMPTY: Side = { profileId: "", rating: "1500", matches: "30", provisional: "0" };
const POS_KEY = "pb_eloCalcPos";

const f1 = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±") + f1(Math.abs(n));
const pct = (n: number) => `${Math.round(n * 1000) / 10} %`.replace(".", ",");

function toPlayer(s: Side): EloPlayer {
  return {
    rating: Number(String(s.rating).replace(",", ".")) || 0,
    matchesPlayed: Math.max(0, Math.round(Number(s.matches) || 0)),
    provisional: Math.max(0, Math.round(Number(s.provisional) || 0)),
  };
}

export default function EloCalculator() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<Prof[] | null>(null);
  const [a, setA] = useState<Side>(EMPTY);
  const [b, setB] = useState<Side>(EMPTY);
  // ✋ verschiebbar: Position (links/oben in px) – null = Standard (mittig am rechten Rand); merkt sich das Gerät
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(POS_KEY) ?? "null");
      if (v && typeof v.x === "number" && typeof v.y === "number") setPos(v);
    } catch {
      /* ignore */
    }
  }, []);
  const clamp = (x: number, y: number) => {
    const el = boxRef.current;
    const w = el?.offsetWidth ?? 400;
    const h = el?.offsetHeight ?? 300;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - Math.min(h, 120))),
    };
  };
  const onDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return; // ✕ nicht als Griff
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos(clamp(e.clientX - d.dx, e.clientY - d.dy));
  };
  const onDragEnd = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPos((p) => {
      try {
        if (p) window.localStorage.setItem(POS_KEY, JSON.stringify(p));
      } catch {
        /* ignore */
      }
      return p;
    });
  };

  // Profile erst beim Öffnen laden (immer frisch)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/profiles/list?ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setProfiles(Array.isArray(j?.profiles) ? j.profiles : []);
      })
      .catch(() => !cancelled && setProfiles([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // gemerkte Position beim Öffnen in den sichtbaren Bereich holen (anderer Bildschirm / kleineres Fenster)
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setPos((p) => (p ? clamp(p.x, p.y) : p)), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc schließt
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const choose = (set: (s: Side) => void, id: string) => {
    const p = (profiles ?? []).find((x) => String(x.id) === id);
    if (!p) return set({ ...EMPTY, profileId: "" });
    set({
      profileId: id,
      rating: String(Math.round(Number(p.rating ?? 1500) * 10) / 10),
      matches: String(p.matches_played ?? 0),
      provisional: String(p.provisional_matches ?? 0),
    });
  };

  const nameOf = (s: Side, fallback: string) => (profiles ?? []).find((x) => String(x.id) === s.profileId)?.name ?? fallback;
  const pa = toPlayer(a);
  const pb = toPlayer(b);
  const res = duel(pa, pb);
  const nameA = nameOf(a, "Spieler A");
  const nameB = nameOf(b, "Spieler B");

  return (
    <>
      {/* versteckter Knopf: rechts unten, blass – erst beim Drüberfahren sichtbar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-3 right-1 z-[80] hidden h-8 w-8 items-center justify-center rounded-full text-base opacity-20 transition hover:bg-white hover:opacity-100 hover:shadow md:flex"
        title="Elo-Rechner"
        aria-label="Elo-Rechner öffnen"
      >
        🧮
      </button>

      {open ? (
        <div
          ref={boxRef}
          className={
            "fixed z-[81] max-h-[90vh] w-[400px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-800 shadow-2xl " +
            (pos ? "" : "right-4 top-1/2 -translate-y-1/2")
          }
          style={pos ? { left: pos.x, top: pos.y } : undefined}
          role="dialog"
          aria-label="Elo-Rechner"
        >
          {/* ✋ Kopfzeile = Griff zum Verschieben (Doppelklick = zurück an den Standardplatz) */}
          <div
            className="-mx-4 -mt-4 mb-3 flex cursor-move touch-none select-none items-center justify-between rounded-t-2xl px-4 pb-1 pt-4"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onDoubleClick={() => {
              setPos(null);
              try {
                window.localStorage.removeItem(POS_KEY);
              } catch {
                /* ignore */
              }
            }}
            title="Ziehen zum Verschieben · Doppelklick = zurück an den Standardplatz"
          >
            <div className="text-base font-bold">🧮 Elo-Rechner</div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 text-neutral-500 hover:bg-neutral-100" title="Schließen (Esc)">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <SideInput label="Spieler A" side={a} setSide={setA} profiles={profiles} onChoose={(id) => choose(setA, id)} />
            <SideInput label="Spieler B" side={b} setSide={setB} profiles={profiles} onChoose={(id) => choose(setB, id)} />
          </div>

          <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs">
            <div className="mb-1 font-semibold text-neutral-700">Gewinnchance (laut Elo)</div>
            <div className="flex items-center gap-2 tabular-nums">
              <span className="w-24 truncate">{nameA}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-rose-200">
                <div className="h-full bg-emerald-500" style={{ width: `${res.a.expected * 100}%` }} />
              </div>
              <span className="w-24 truncate text-right">{nameB}</span>
            </div>
            <div className="mt-1 flex justify-between font-semibold tabular-nums">
              <span>{pct(res.a.expected)}</span>
              <span className="text-neutral-400">Unterschied {f1(Math.abs(pa.rating - pb.rating))} Elo</span>
              <span>{pct(res.b.expected)}</span>
            </div>
          </div>

          <SideResult name={nameA} other={nameB} me={pa} r={res.a} />
          <SideResult name={nameB} other={nameA} me={pb} r={res.b} />

          <div className="mt-3 text-[11px] leading-snug text-neutral-500">
            Rechnung wie im Turnier: Änderung = K × (Ergebnis − Gewinnchance); Sieg = 1, Unentschieden = 0,5, Niederlage = 0.
            K = 32 (Neuling) · 24 (unter 30 Spielen) · 16 (etabliert). Gegen einen Neuling zählt ein Duell nur halb.
            Ein 4er-Spiel sind 3 solche Duelle (jeder gegen jeden), bei Round the Pinball je Flipper. Bots: Elo bleibt fest.
          </div>
        </div>
      ) : null}
    </>
  );
}

function SideInput({
  label,
  side,
  setSide,
  profiles,
  onChoose,
}: {
  label: string;
  side: Side;
  setSide: (s: Side) => void;
  profiles: Prof[] | null;
  onChoose: (id: string) => void;
}) {
  const input = "w-full rounded-lg border border-neutral-200 px-2 py-1 text-xs tabular-nums";
  return (
    <div className="space-y-1 rounded-xl border border-neutral-200 p-2">
      <div className="text-[11px] font-semibold text-neutral-500">{label}</div>
      <select value={side.profileId} onChange={(e) => onChoose(e.target.value)} className={input}>
        <option value="">{profiles ? "– frei eingeben –" : "lädt…"}</option>
        {(profiles ?? [])
          .slice()
          .sort((x, y) => String(x.name).localeCompare(String(y.name)))
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.is_bot ? " 🤖" : ""}
            </option>
          ))}
      </select>
      <label className="block text-[10px] text-neutral-500">
        Elo
        <input className={input} inputMode="decimal" value={side.rating} onChange={(e) => setSide({ ...side, rating: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-1">
        <label className="block text-[10px] text-neutral-500">
          Spiele
          <input className={input} inputMode="numeric" value={side.matches} onChange={(e) => setSide({ ...side, matches: e.target.value })} />
        </label>
        <label className="block text-[10px] text-neutral-500">
          Neuling noch
          <input className={input} inputMode="numeric" value={side.provisional} onChange={(e) => setSide({ ...side, provisional: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

function SideResult({ name, other, me, r }: { name: string; other: string; me: EloPlayer; r: DuelSide }) {
  const w = r.weight < 1 ? " × 0,5" : "";
  const exp = f1(r.expected * 100).replace(",0", "");
  const row = (label: string, score: string, delta: number) => (
    <tr className="border-t border-neutral-100">
      <td className="py-1 pr-2 text-neutral-600">{label}</td>
      <td className="py-1 pr-2 text-[11px] text-neutral-400 tabular-nums">
        {r.k}
        {w} × ({score} − {r.expected.toFixed(3).replace(".", ",")})
      </td>
      <td className={"py-1 text-right font-bold tabular-nums " + (delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-neutral-500")}>
        {sign(delta)}
      </td>
      <td className="py-1 pl-2 text-right text-[11px] text-neutral-400 tabular-nums">→ {f1(me.rating + delta)}</td>
    </tr>
  );
  return (
    <div className="mt-3 rounded-xl border border-neutral-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <div className="font-semibold">{name}</div>
        <div className="text-[11px] text-neutral-500">
          K = <b className="text-neutral-700">{r.k}</b> · {r.kWhy}
        </div>
      </div>
      <div className="text-[11px] text-neutral-500">
        Gewinnchance gegen {other}: <b className="text-neutral-700">{exp} %</b>
        {r.weight < 1 ? <span className="ml-1 rounded bg-amber-50 px-1 text-amber-700">🛡️ Gegner ist Neuling → zählt halb</span> : null}
      </div>
      <table className="mt-1 w-full text-xs">
        <tbody>
          {row("Sieg", "1", r.win)}
          {row("Unentschieden", "0,5", r.draw)}
          {row("Niederlage", "0", r.loss)}
        </tbody>
      </table>
    </div>
  );
}
