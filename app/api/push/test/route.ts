import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToSubscriptions } from "@/lib/push/send";

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke logget inn" }, { status: 401 });
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", user.id);

    if (subscriptionsError) {
      console.error("push test: subscriptions error", subscriptionsError);
      return NextResponse.json(
        { error: "Kunne ikke hente subscriptions", details: subscriptionsError.message },
        { status: 500 }
      );
    }

    const validSubscriptions = ((subscriptions as PushSubscriptionRow[] | null) || [])
      .filter((item) => item.endpoint && item.p256dh && item.auth);

    if (validSubscriptions.length === 0) {
      return NextResponse.json(
        { error: "Ingen gyldige push subscriptions funnet for bruker" },
        { status: 400 }
      );
    }

    const results = await sendPushToSubscriptions(validSubscriptions, {
      title: "Test push",
      body: "Dette er en test fra Tilbudsapp.",
      url: "/dashboard",
    });

    return NextResponse.json({
      ok: true,
      subscriptionsFound: validSubscriptions.length,
      results,
    });
  } catch (error) {
    console.error("push test route error", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ukjent feil",
      },
      { status: 500 }
    );
  }
}