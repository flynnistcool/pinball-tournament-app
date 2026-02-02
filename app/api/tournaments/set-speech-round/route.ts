import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// POST: { code: string, enabled: boolean }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();
  const enabled = Boolean(body.enabled);

  if (!code) {
    return noStoreJson({ error: "Code fehlt" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { error } = await sb
    .from("tournaments")
    .update({ speech_round_enabled: enabled })
    .eq("code", code);

  if (error) {
    return noStoreJson({ error: error.message }, { status: 500 });
  }

  return noStoreJson({ ok: true, enabled });
}
