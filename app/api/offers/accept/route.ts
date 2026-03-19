import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const body = await request.json();
    const id = body.id;

    if (!id) {
      return NextResponse.json({ error: "Mangler id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("offers")
      .update({ status: "accepted" })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "DB feil" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Serverfeil" }, { status: 500 });
  }
}