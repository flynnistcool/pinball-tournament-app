import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const profileId = String(body.profileId ?? "").trim();

    if (!profileId) {
      return NextResponse.json({ error: "profileId fehlt" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // 1️⃣ Profil holen (für aktuelles Rating nach dem letzten Turnier)
    const { data: profile, error: profileErr } = await sb
      .from("profiles")
      .select("id, rating")
      .eq("id", profileId)
      .single();

    if (profileErr || !profile) {
      console.error("elo-history profile error:", profileErr);
      return NextResponse.json(
        { error: "Profil nicht gefunden" },
        { status: 404 }
      );
    }

    // 2️⃣ Alle Turnier-Ratings für dieses Profil holen
    const { data: rows, error: rowsErr } = await sb
      .from("tournament_ratings")
      .select("tournament_id, rating_before, created_at, profile_id")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true });

    if (rowsErr) {
      console.error("elo-history tournament_ratings error:", rowsErr);
      return NextResponse.json(
        { error: "DB-Fehler beim Laden der Elo-Historie" },
        { status: 500 }
      );
    }

    // falls noch nie ein Turnier gespielt → nur aktuelles Rating als Start-Elo
    if (!rows || rows.length === 0) {
      const startRating =
        typeof profile.rating === "number" ? profile.rating : null;
      return NextResponse.json({ startRating, history: [] });
    }

    const sorted = rows; // ist bereits nach created_at sortiert

    // Start-Elo = rating_before des ersten Turniers
    const startRating =
      typeof sorted[0].rating_before === "number"
        ? sorted[0].rating_before
        : typeof profile.rating === "number"
        ? profile.rating
        : null;

    // 3️⃣ Turnier-Metadaten (Name, Code, created_at) holen
    const tournamentIds = sorted
      .map((r: any) => r.tournament_id)
      .filter((x: any): x is string => !!x);

    let tournamentsById: Record<string, any> = {};
    if (tournamentIds.length > 0) {
      const { data: ts, error: tErr } = await sb
        .from("tournaments")
        .select("id, name, code, category,  created_at, status")
        .in("id", tournamentIds);

      if (tErr) {
        console.error("elo-history tournaments error:", tErr);
      }

      for (const t of ts ?? []) {
        tournamentsById[t.id] = t;
      }
    }

    // 4️⃣ Elo NACH jedem Turnier ableiten:
    // nach Turnier i = rating_before von Turnier i+1,
    // beim letzten Turnier = aktuelles profile.rating
    const history = sorted.map((r: any, idx: number) => {
      let ratingAfter: number | null = null;

      if (idx < sorted.length - 1) {
        const next = sorted[idx + 1];
        ratingAfter =
          typeof next.rating_before === "number" ? next.rating_before : null;
      } else {
        ratingAfter =
          typeof profile.rating === "number" ? profile.rating : null;
      }

      const t = tournamentsById[r.tournament_id] ?? null;

      return {
        tournamentId: r.tournament_id,
        rating_after: ratingAfter,
        rating_before:
          typeof r.rating_before === "number" ? r.rating_before : null,
        created_at: t?.created_at ?? r.created_at,
        code: t?.code ?? "",
        category: t?.category ?? null, // ✅ NEU
        tournamentName: t?.name ?? "(ohne Name)",
      };
    });

    return NextResponse.json({ startRating, history });
  } catch (err) {
    console.error("elo-history route crash:", err);
    return NextResponse.json(
      { error: "Unerwarteter Fehler in elo-history" },
      { status: 500 }
    );
  }
}
