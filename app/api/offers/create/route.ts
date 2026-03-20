import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type IncomingSelectedMaterial = {
  materialId?: string;
  name?: string;
  supplier?: string | null;
  unit?: string;
  quantity?: string | number;
  unitPrice?: number | string;
  wastePercent?: number | string;
  markupPercent?: number | string;
  lineTotal?: number | string;
};

type CleanSelectedMaterial = {
  materialId: string;
  name: string;
  supplier: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  wastePercent: number;
  markupPercent: number;
  lineTotal: number;
};

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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function addDaysToNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function clampMinimum(value: number, minimum: number) {
  return value < minimum ? minimum : value;
}

function sanitizeSelectedMaterials(
  selectedMaterialsRaw: IncomingSelectedMaterial[]
) {
  return selectedMaterialsRaw
    .map((item): CleanSelectedMaterial => {
      const materialId = String(item.materialId || "").trim();
      const name = String(item.name || "").trim();
      const supplier = item.supplier ? String(item.supplier).trim() : null;
      const unit = String(item.unit || "stk").trim() || "stk";
      const quantity = clampMinimum(toNumber(item.quantity), 0);
      const unitPrice = clampMinimum(toNumber(item.unitPrice), 0);
      const wastePercent = clampMinimum(toNumber(item.wastePercent), 0);
      const markupPercent = clampMinimum(toNumber(item.markupPercent), 0);

      const incomingLineTotal = clampMinimum(toNumber(item.lineTotal), 0);
      const calculatedLineTotal = roundMoney(quantity * unitPrice);
      const lineTotal =
        incomingLineTotal > 0 ? roundMoney(incomingLineTotal) : calculatedLineTotal;

      return {
        materialId,
        name,
        supplier,
        unit,
        quantity: roundMoney(quantity),
        unitPrice: roundMoney(unitPrice),
        wastePercent: roundMoney(wastePercent),
        markupPercent: roundMoney(markupPercent),
        lineTotal,
      };
    })
    .filter(
      (item) =>
        item.materialId &&
        item.name &&
        item.quantity > 0 &&
        item.unitPrice >= 0
    );
}

function buildOfferTitle(
  titleInput: string,
  description: string,
  customerName: string
) {
  if (titleInput) {
    return titleInput;
  }

  if (description) {
    return description.slice(0, 120);
  }

  if (customerName) {
    return `Tilbud til ${customerName}`;
  }

  return "Tilbud";
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

    const fixedPriceInput = clampMinimum(toNumber(body.fixedPrice), 0);
    const hourlyRateInput = clampMinimum(toNumber(body.hourlyRate), 0);
    const hoursInput = clampMinimum(toNumber(body.hours), 0);
    let materialsInput = clampMinimum(toNumber(body.materials), 0);

    const vatEnabled = Boolean(body.vatEnabled);
    const useSavedMaterials = Boolean(body.useSavedMaterials);

    const selectedMaterialsRaw: IncomingSelectedMaterial[] = Array.isArray(
      body.selectedMaterials
    )
      ? body.selectedMaterials
      : [];

    const selectedMaterials = sanitizeSelectedMaterials(selectedMaterialsRaw);

    if (!customerName) {
      return NextResponse.json({ error: "Fyll inn kundenavn" }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json(
        { error: "Fyll inn beskrivelse" },
        { status: 400 }
      );
    }

    let fixedPrice = roundMoney(fixedPriceInput);
    let hourlyRate = roundMoney(hourlyRateInput);
    let hours = roundMoney(hoursInput);
    let materials = roundMoney(materialsInput);

    if (useSavedMaterials && selectedMaterials.length > 0) {
      materials = roundMoney(
        selectedMaterials.reduce((sum, item) => sum + item.lineTotal, 0)
      );
    }

    if (priceType === "fixed") {
      hourlyRate = 0;
      hours = 0;

      if (fixedPrice <= 0) {
        return NextResponse.json(
          { error: "Fyll inn fastpris" },
          { status: 400 }
        );
      }
    }

    if (priceType === "hourly") {
      fixedPrice = 0;

      if (hourlyRate <= 0) {
        return NextResponse.json(
          { error: "Fyll inn timepris" },
          { status: 400 }
        );
      }

      if (hours <= 0) {
        return NextResponse.json({ error: "Fyll inn timer" }, { status: 400 });
      }
    }

    const subtotal = roundMoney(
      priceType === "fixed"
        ? fixedPrice + materials
        : hourlyRate * hours + materials
    );

    const vatRate = vatEnabled ? 25 : 0;
    const vatAmount = vatEnabled ? roundMoney(subtotal * 0.25) : 0;
    const total = roundMoney(subtotal + vatAmount);

    const title = buildOfferTitle(titleInput, description, customerName);

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
        vat_rate: vatRate,
        subtotal,
        vat_amount: vatAmount,
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

    if (selectedMaterials.length > 0) {
      const offerMaterialRows = selectedMaterials.map((item) => ({
        offer_id: offer.id,
        user_id: user.id,
        material_id: item.materialId,
        material_name: item.name,
        supplier: item.supplier,
        unit: item.unit || "stk",
        quantity: item.quantity,
        unit_price: item.unitPrice,
        waste_percent: item.wastePercent,
        markup_percent: item.markupPercent,
        line_total: item.lineTotal,
      }));

      const { error: insertOfferMaterialsError } = await supabase
        .from("offer_materials")
        .insert(offerMaterialRows);

      if (insertOfferMaterialsError) {
        console.error(
          "Feil ved lagring av materiallinjer:",
          insertOfferMaterialsError
        );

        return NextResponse.json(
          { error: "Tilbud lagret, men materialer kunne ikke lagres" },
          { status: 500 }
        );
      }
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