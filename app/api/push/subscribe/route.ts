import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke logget inn" }, { status: 401 });
    }

    const body = await req.json();

    const subscription = body?.subscription;

    if (!subscription) {
      return NextResponse.json(
        { error: "Mangler subscription" },
        { status: 400 }
      );
    }

    // Lagre push subscription i Supabase
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys?.p256dh,
          auth: subscription.keys?.auth,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "endpoint",
        }
      );

    if (error) {
      console.error("Feil ved lagring av push:", error);
      return NextResponse.json(
        { error: "Kunne ikke lagre push subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Push subscribe error:", err);
    return NextResponse.json(
      { error: "Serverfeil" },
      { status: 500 }
    );
  }
}