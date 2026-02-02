import { supabaseAdmin } from "@/lib/supabaseServer";
import { dynamic, noStoreJson, revalidate } from "../_util";

export { dynamic, revalidate };

type Difficulty = "easy" | "medium" | "hard";
function normalizeDifficulty(v: any): Difficulty | undefined {
  if (v === undefined) return undefined;
  return v === "easy" || v === "medium" || v === "hard" ? v : "easy";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return noStoreJson({ error: "id fehlt" }, 400);

  const patch: any = {};
  if (body.title !== undefined) patch.title = String(body.title ?? "").trim();
  if (body.description !== undefined) patch.description = String(body.description ?? "").trim() || null;
  if (body.active !== undefined) patch.active = body.active !== false;

  const d = normalizeDifficulty(body.difficulty);
  if (d !== undefined) patch.difficulty = d;

  const sb = supabaseAdmin();
  const { error } = await sb.from("machine_tasks").update(patch).eq("id", id);
  if (error) return noStoreJson({ error: error.message }, 500);

  return noStoreJson({ ok: true });
}
