import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { extraballForced } from "@/lib/botRules";
import { sha256, randomCode } from "@/lib/crypto";
import { DEFAULT_PLAY_MINUTES, normalizePlayMinutes } from "@/lib/playMinutes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim() || "Turnier";

  const rawFormat = String(body.format ?? "matchplay");
  const format =
    rawFormat === "swiss" ||
    rawFormat === "round_robin" ||
    rawFormat === "dyp_round_robin" ||
    rawFormat === "elimination" ||
    rawFormat === "rotation" ||
    rawFormat === "timeplay"
      ? rawFormat
      : "matchplay";

  const categoryValue = body.category != null ? String(body.category).trim() : "";
  const category = categoryValue.length > 0 ? categoryValue : null;

const matchSizeRaw = Number(body.matchSize ?? body.match_size ?? 4);

// ✅ Default: alle Formate außer rotation bleiben streng 2|3|4
let match_size: number =
  format === "rotation"
    ? Math.max(2, Math.floor(matchSizeRaw || 4)) // ✅ Rotation: beliebig ab 2
    : ([2, 3, 4] as const).includes(matchSizeRaw as any)
    ? (matchSizeRaw as 2 | 3 | 4)
    : 4;

// DYP 2v2: 4 Spieler pro Match (2 Teams à 2 Spieler)
if (format === "dyp_round_robin") match_size = 4;


  const templateTournamentId = body.templateTournamentId ? String(body.templateTournamentId) : null;
  const locationId = body.locationId ? String(body.locationId) : null;

  const adminPinHashPlaceholder = sha256("0000");
  const code = randomCode(6);

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("tournaments")
    .insert({
      code,
      name,
      admin_pin_hash: adminPinHashPlaceholder,
      category,
      match_size,
      format,
      location_id: locationId,
      extraball: extraballForced(format) || body.extraball === true, // 🎱 mit Extraball gespielt? (RtP/Timeplay: immer)
      // ⏱️ Spielzeit je Flipper (nur RtP) – ab dem ersten Score gesperrt
      ...(format === "rotation" ? { play_minutes: normalizePlayMinutes(body.playMinutes) ?? DEFAULT_PLAY_MINUTES } : {}),
    })
    .select("id, code, name, created_at, category, match_size, format, location_id, extraball")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let templateLoc: string | null = null;
  if (templateTournamentId && !locationId) {
    const { data: tt } = await sb
      .from("tournaments")
      .select("location_id")
      .eq("id", templateTournamentId)
      .single();
    templateLoc = (tt as any)?.location_id ?? null;
  }

  if (templateLoc) {
    await sb.from("tournaments").update({ location_id: templateLoc }).eq("id", data.id);
    (data as any).location_id = templateLoc;
  }

  // --- Maschinenkopie ---
  // Priorität: templateTournamentId > locationId
  // 🎱 Nur DYP bekommt auch Nicht-Flipper (Arcade, Kicker …: location_machines.is_pinball = false);
  //    alle anderen Modi nur Flipper. Fehlt die Spalte noch (SQL nicht ausgeführt) → alles wie bisher.
  const onlyPinball = format !== "dyp_round_robin";
  const notPinball = new Set<string>(); // Namen (klein) der Nicht-Flipper an der Location
  const flagLocation = String((data as any).location_id ?? locationId ?? "");
  if (onlyPinball && flagLocation) {
    const { data: flags, error: flErr } = await sb
      .from("location_machines")
      .select("name, is_pinball")
      .eq("location_id", flagLocation);
    if (!flErr) {
      for (const f of (flags ?? []) as { name: string | null; is_pinball: boolean | null }[]) {
        if (f.is_pinball === false) notPinball.add(String(f.name ?? "").trim().toLowerCase());
      }
    }
  }
  const keep = (m: any) => !notPinball.has(String(m?.name ?? "").trim().toLowerCase());

  if (templateTournamentId) {
    const { data: msAll } = await sb
      .from("machines")
      .select("name, active, icon_emoji")
      .eq("tournament_id", templateTournamentId);
    const ms = (msAll ?? []).filter(keep);

    if (ms?.length) {
      await sb.from("machines").insert(
        ms.map((m: any) => ({
          tournament_id: data.id,
          name: m.name,
          active: m.active,
          icon_emoji: m.icon_emoji ?? null,   // <-- WICHTIG: mitkopieren!
        }))
      );
    }
  } else if (locationId) {
    const { data: msAll } = await sb
      .from("location_machines")
      .select("name, active, icon_emoji")
      .eq("location_id", locationId)
      .order("sort_order");
    const ms = (msAll ?? []).filter(keep);

    if (ms?.length) {
      await sb.from("machines").insert(
        ms.map((m: any) => ({
          tournament_id: data.id,
          name: m.name,
          active: m.active,
          icon_emoji: m.icon_emoji ?? null,
        }))
      );
    }
  }

  return new NextResponse(JSON.stringify({ tournament: data }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
