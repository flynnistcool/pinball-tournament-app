import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// POST: { code: string, enabled?: boolean, lang?: "en" | "de" }
// - enabled: 🔊 Sprachausgabe pro Runde an/aus
// - lang: Sprache der Sprachausgabe für dieses Turnier (Spalte tournaments.speech_lang)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "").trim().toUpperCase();

  if (!code) {
    return noStoreJson({ ok: false, error: "Code fehlt" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.enabled !== undefined) patch.speech_round_enabled = Boolean(body.enabled);
  if (body.lang !== undefined) {
    if (body.lang !== "en" && body.lang !== "de") {
      return noStoreJson({ ok: false, error: "Ungültige Sprache" }, { status: 400 });
    }
    patch.speech_lang = body.lang;
  }
  if (!Object.keys(patch).length) {
    return noStoreJson({ ok: false, error: "Nichts zu ändern" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { error } = await sb.from("tournaments").update(patch).eq("code", code);

  if (error) {
    const hint =
      "speech_lang" in patch && /speech_lang/i.test(error.message)
        ? " – bitte zuerst supabase_speech_lang.sql im Supabase SQL-Editor ausführen"
        : "";
    return noStoreJson({ ok: false, error: error.message + hint }, { status: 500 });
  }

  return noStoreJson({ ok: true, ...patch });
}
