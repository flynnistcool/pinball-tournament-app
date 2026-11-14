import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { eloAllowedInFormat } from "@/lib/botRules";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const roundId = String(body?.roundId ?? "");
    const eloEnabled = Boolean(body?.eloEnabled);

    if (!roundId) {
      return NextResponse.json(
        { ok: false, error: "roundId missing" },
        { status: 400, headers: NO_STORE }
      );
    }

    const sb = supabaseAdmin();

    // 🚫 DYP: nie Elo (Ausschalten ist immer erlaubt)
    if (eloEnabled) {
      const { data: rd } = await sb
        .from("rounds")
        .select("format, tournament_id")
        .eq("id", roundId)
        .maybeSingle();
      let tFormat: string | null = null;
      if ((rd as any)?.tournament_id) {
        const { data: tt } = await sb
          .from("tournaments")
          .select("format")
          .eq("id", (rd as any).tournament_id)
          .maybeSingle();
        tFormat = (tt as any)?.format ?? null;
      }
      if (!eloAllowedInFormat((rd as any)?.format) || !eloAllowedInFormat(tFormat)) {
        return NextResponse.json(
          { ok: false, error: "Bei DYP gibt es keine Elo" },
          { status: 400, headers: NO_STORE }
        );
      }
    }

    const { error } = await sb
      .from("rounds")
      .update({ elo_enabled: eloEnabled })
      .eq("id", roundId);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers: NO_STORE }
      );
    }

    return NextResponse.json(
      { ok: true, elo_enabled: eloEnabled },
      { status: 200, headers: NO_STORE }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500, headers: NO_STORE }
    );
  }
}
