import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const supabase = await createClient();

  const { error } = await supabase
    .from("offers")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("share_token", token);

  if (error) {
    console.error("Feil ved godkjenning av tilbud:", error);
  }

  return NextResponse.redirect(new URL(`/t/${token}`, request.url));
}