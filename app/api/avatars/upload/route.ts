import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const form = await req.formData();
  const profileId = String(form.get("profileId") ?? "").trim();
  const file = form.get("file") as File | null;
  if (!profileId || !file) return NextResponse.json({ error: "Fehlende Daten" }, { status: 400 });

  const sb = supabaseAdmin();
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${profileId}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage.from("avatars").upload(path, buf, { upsert: true, contentType: file.type || "image/png" });
  if (upErr) return NextResponse.json({ error: `Upload fehlgeschlagen: ${upErr.message}` }, { status: 500 });

  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  const url = pub.publicUrl;

  const { error: pErr } = await sb.from("profiles").update({ avatar_url: url }).eq("id", profileId);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, avatarUrl: url });
}
