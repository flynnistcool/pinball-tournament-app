import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "Code fehlt" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // 1️⃣ Turnier holen (inkl. Status)
  const { data: t, error: tErr } = await sb
    .from("tournaments")
    .select("id, status")
    .eq("code", code)
    .single();

  if (tErr || !t) {
    return NextResponse.json(
      { error: "Turnier nicht gefunden" },
      { status: 404 }
    );
  }

  const tid = t.id;

  // 2️⃣ Wenn Turnier NICHT beendet ist → Elo / Stat-Werte der Profile zurücksetzen
  if (t.status !== "finished") {
    const { data: trRows, error: trErr } = await sb
      .from("tournament_ratings")
      .select(
        "profile_id, rating_before, matches_before, provisional_before"
      )
      .eq("tournament_id", tid);

    if (trErr) {
      return NextResponse.json(
        {
          error:
            trErr.message ??
            "Fehler beim Laden von tournament_ratings für dieses Turnier",
        },
        { status: 500 }
      );
    }

    if (trRows && trRows.length > 0) {
      // Profile auf Startzustand zurücksetzen
      for (const row of trRows) {
        await sb
          .from("profiles")
          .update({
            rating: row.rating_before,
            matches_played: row.matches_before,
            provisional_matches: row.provisional_before,
          })
          .eq("id", row.profile_id);
      }

      // Einträge aus tournament_ratings für dieses Turnier entfernen
      await sb
        .from("tournament_ratings")
        .delete()
        .eq("tournament_id", tid);
    }
  }

  // 3️⃣ Alle Turnierdaten löschen (in sinnvoller Reihenfolge)
  await sb.from("match_players").delete().eq("tournament_id", tid);
  await sb.from("matches").delete().eq("tournament_id", tid);
  await sb.from("rounds").delete().eq("tournament_id", tid);
  await sb.from("machines").delete().eq("tournament_id", tid);
  await sb.from("players").delete().eq("tournament_id", tid);
  await sb.from("standings").delete().eq("tournament_id", tid);

  // 4️⃣ Turnier selbst löschen
  const { error: delErr } = await sb
    .from("tournaments")
    .delete()
    .eq("id", tid);

  if (delErr) {
    return NextResponse.json(
      {
        error:
          delErr.message ??
          "Turnier konnte nicht gelöscht werden",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
