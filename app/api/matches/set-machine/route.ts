import { NextResponse } from "next/server";


import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { matchId, machineId } = body ?? {};

    if (!matchId || !machineId) {
      return NextResponse.json(
        { error: "matchId und machineId sind erforderlich" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();   // ✅ so

    const { data, error } = await supabase
      .from("matches")
      .update({ machine_id: machineId })
      .eq("id", matchId)
      .select("id")
      .maybeSingle(); // wichtig: kein Hard-Error, wenn 0 Rows

    if (error) {
      console.error("Supabase-Fehler in set-machine:", error);
      return NextResponse.json(
        { error: error.message ?? "Supabase-Fehler in set-machine" },
        { status: 500 }
      );
    }

    if (!data) {
      // d.h. kein Match mit dieser ID gefunden
      return NextResponse.json(
        { error: "Match nicht gefunden (kein Datensatz aktualisiert)" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Unerwarteter Fehler in /api/matches/set-machine:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unerwarteter Fehler in API-Handler" },
      { status: 500 }
    );
  }
}
