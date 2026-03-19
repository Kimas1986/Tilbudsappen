import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const { data: materials, error } = await supabase
      .from("materials")
      .select(
        "id, name, supplier, unit, base_price, waste_percent, markup_percent, pricing_mode"
      )
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (error) {
      console.error("Feil ved henting av materialer:", error);

      return NextResponse.json(
        { error: "Kunne ikke hente materialer" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      materials: materials || [],
    });
  } catch (error) {
    console.error("Materials API error:", error);

    return NextResponse.json(
      { error: "Uventet feil ved henting av materialer" },
      { status: 500 }
    );
  }
}