import { supabaseAdmin } from "@/lib/supabaseServer";
import { dynamic, noStoreJson, revalidate } from "../_util";

export { dynamic, revalidate };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locationMachineId = String(url.searchParams.get("locationMachineId") ?? "").trim();
  if (!locationMachineId) return noStoreJson({ error: "locationMachineId fehlt" }, 400);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("machine_tasks")
    .select("id, title, description, active, difficulty, created_at")
    .eq("location_machine_id", locationMachineId)
    .order("created_at");

  if (error) return noStoreJson({ error: error.message }, 500);
  return noStoreJson({ tasks: data ?? [] });
}
