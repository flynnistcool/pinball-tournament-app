import { supabaseAdmin } from "@/lib/supabaseServer";
import { dynamic, noStoreJson, revalidate } from "../_util";

export { dynamic, revalidate };

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return noStoreJson({ error: "id fehlt" }, 400);

  const sb = supabaseAdmin();
  const { error } = await sb.from("machine_tasks").delete().eq("id", id);
  if (error) return noStoreJson({ error: error.message }, 500);

  return noStoreJson({ ok: true });
}
