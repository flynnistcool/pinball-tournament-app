import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const { code, enabled } = await req.json();

    const sb = supabaseAdmin();

    const { error } = await sb
      .from("tournaments")
      .update({ superfinal_elo_enabled: !!enabled })
      .eq("code", code);

    if (error) {
      console.error("superfinal_elo update error", error);
      return NextResponse.json(
        { error: "Konnte Elo-Einstellung für das Super-Finale nicht speichern." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("superfinal_elo route error", e);
    return NextResponse.json(
      { error: "Unbekannter Fehler beim Setzen der Elo-Einstellung." },
      { status: 500 }
    );
  }
}
