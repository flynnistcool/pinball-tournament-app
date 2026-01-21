import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // location_machines + join locations(name)
    const { data, error } = await supabase
      .from("location_machines")
      .select("id, location_id, name, active, sort_order, locations:location_id(name)")
      .order("location_id", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) return noStoreJson({ error: error.message }, 500);

    const machines = (data ?? []).map((r: any) => ({
      id: r.id,
      location_id: r.location_id,
      machine_name: r.name,
      location_name: r.locations?.name ?? "",
      active: r.active,
      sort_order: r.sort_order,
    }));

    return noStoreJson({ machines });
  } catch (e: any) {
    return noStoreJson({ error: String(e?.message ?? e) }, 500);
  }
}
