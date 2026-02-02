import { supabaseAdmin } from "@/lib/supabaseServer";
import { dynamic, noStoreJson, revalidate } from "../_util";

export { dynamic, revalidate };

type Difficulty = "easy" | "medium" | "hard";
function normalizeDifficulty(v: any): Difficulty {
  return v === "easy" || v === "medium" || v === "hard" ? v : "easy";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const locationMachineId = String(body.locationMachineId ?? "").trim();
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim() || null;
  const active = body.active !== false;
  const difficulty = normalizeDifficulty(body.difficulty);

  if (!locationMachineId) return noStoreJson({ error: "locationMachineId fehlt" }, 400);
  if (!title) return noStoreJson({ error: "title fehlt" }, 400);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("machine_tasks")
    .insert([
      {
        location_machine_id: locationMachineId,
        title,
        description,
        active,
        difficulty, // ✅ NOT NULL erfüllt
      },
    ])
    .select("id, title, description, active, difficulty, created_at")
    .single();

  if (error) return noStoreJson({ error: error.message }, 500);
  return noStoreJson({ task: data });
}
