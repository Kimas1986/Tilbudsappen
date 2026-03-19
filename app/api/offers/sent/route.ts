import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const body = await request.json();
  const { offerId } = body;

  if (!offerId) {
    return NextResponse.json({ error: "Missing offerId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("offers")
    .update({ status: "sent" })
    .eq("id", offerId);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}