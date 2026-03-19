import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function addDaysToNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const body = await request.json();

    const customerName = String(body.customer || "").trim();
    const customerEmail = String(body.customerEmail || "")
      .trim()
      .toLowerCase();
    const customerPhone = String(body.customerPhone || "").trim();

    const titleInput = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const priceType = body.priceType === "hourly" ? "hourly" : "fixed";

    const fixedPrice = toNumber(body.fixedPrice);
    const hourlyRate = toNumber(body.hourlyRate);
    const hours = toNumber(body.hours);
    const materials = toNumber(body.materials);

    const vatEnabled = Boolean(body.vatEnabled);

    const subtotal =
      priceType === "fixed"
        ? fixedPrice + materials
        : hourlyRate * hours + materials;

    const vat = vatEnabled ? subtotal * 0.25 : 0;
    const total = subtotal + vat;

    const title =
      titleInput.length > 0
        ? titleInput
        : description.length > 0
          ? description.slice(0, 120)
          : customerName
            ? `Tilbud til ${customerName}`
            : "Tilbud";

    const { data: settings, error: settingsError } = await supabase
      .from("ai_settings")
      .select("offer_valid_days")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.error("Feil ved henting av settings:", settingsError);

      return NextResponse.json(
        { error: "Kunne ikke hente innstillinger" },
        { status: 500 }
      );
    }

    const offerValidDaysRaw =
      settings && typeof settings.offer_valid_days === "number"
        ? settings.offer_valid_days
        : 14;

    const offerValidDays =
      Number.isFinite(offerValidDaysRaw) && offerValidDaysRaw > 0
        ? Math.round(offerValidDaysRaw)
        : 14;

    const validUntil = addDaysToNow(offerValidDays);

    let customerId: string | null = null;

    if (customerEmail) {
      const { data: existingCustomer, error: existingCustomerError } =
        await supabase
          .from("customers")
          .select("id")
          .eq("user_id", user.id)
          .eq("email", customerEmail)
          .maybeSingle();

      if (existingCustomerError) {
        console.error("Feil ved oppslag av kunde:", existingCustomerError);

        return NextResponse.json(
          { error: "Kunne ikke slå opp kunde" },
          { status: 500 }
        );
      }

      if (existingCustomer?.id) {
        customerId = existingCustomer.id;

        const { error: updateCustomerError } = await supabase
          .from("customers")
          .update({
            name: customerName || null,
            phone: customerPhone || null,
          })
          .eq("id", customerId)
          .eq("user_id", user.id);

        if (updateCustomerError) {
          console.error("Feil ved oppdatering av kunde:", updateCustomerError);

          return NextResponse.json(
            { error: "Kunne ikke oppdatere kunde" },
            { status: 500 }
          );
        }
      } else {
        const { data: newCustomer, error: insertCustomerError } = await supabase
          .from("customers")
          .insert({
            user_id: user.id,
            name: customerName || null,
            email: customerEmail,
            phone: customerPhone || null,
          })
          .select("id")
          .single();

        if (insertCustomerError || !newCustomer) {
          console.error("Feil ved opprettelse av kunde:", insertCustomerError);

          return NextResponse.json(
            { error: "Kunne ikke opprette kunde" },
            { status: 500 }
          );
        }

        customerId = newCustomer.id;
      }
    }

    const { data: offer, error: insertOfferError } = await supabase
      .from("offers")
      .insert({
        user_id: user.id,
        customer_id: customerId,
        title,
        description,
        price_type: priceType,
        fixed_price: priceType === "fixed" ? fixedPrice : null,
        hourly_rate: priceType === "hourly" ? hourlyRate : null,
        hours: priceType === "hourly" ? hours : null,
        materials_cost: materials,
        vat_enabled: vatEnabled,
        vat_rate: 25,
        subtotal,
        vat_amount: vat,
        total,
        status: "draft",
        valid_until: validUntil,
      })
      .select("id")
      .single();

    if (insertOfferError || !offer) {
      console.error("Feil ved lagring av tilbud:", insertOfferError);

      return NextResponse.json(
        { error: "Kunne ikke lagre tilbud" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      offerId: offer.id,
    });
  } catch (error) {
    console.error("Create offer API error:", error);

    return NextResponse.json(
      { error: "Uventet feil ved opprettelse av tilbud" },
      { status: 500 }
    );
  }
}