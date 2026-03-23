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

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function getInvoiceYear() {
  return new Date().getFullYear();
}

function buildInvoiceNumber(year: number, sequence: number) {
  return `${year}-${String(sequence).padStart(4, "0")}`;
}

function parseInvoiceSequence(invoiceNumber: string | null | undefined, year: number) {
  const value = String(invoiceNumber || "").trim();
  const match = value.match(/^(\d{4})-(\d{4})$/);

  if (!match) return null;

  const parsedYear = Number(match[1]);
  const parsedSequence = Number(match[2]);

  if (parsedYear !== year) return null;
  if (!Number.isFinite(parsedSequence)) return null;

  return parsedSequence;
}

async function generateNextInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const year = getInvoiceYear();

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("user_id", userId)
    .not("invoice_number", "is", null);

  if (error) {
    throw new Error("Kunne ikke hente eksisterende fakturanumre.");
  }

  const maxSequence = (invoices || []).reduce((max, row) => {
    const current = parseInvoiceSequence(row.invoice_number, year);
    if (current === null) return max;
    return Math.max(max, current);
  }, 0);

  return buildInvoiceNumber(year, maxSequence + 1);
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
    const offerId = String(body?.offerId || "").trim();

    if (!offerId) {
      return NextResponse.json({ error: "Mangler offerId" }, { status: 400 });
    }

    const { data: existingInvoice } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("offer_id", offerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingInvoice?.id) {
      return NextResponse.json({
        success: true,
        invoiceId: existingInvoice.id,
        invoiceNumber: existingInvoice.invoice_number || null,
        alreadyExists: true,
      });
    }

    const { data: offer, error: offerError } = await supabase
      .from("offers")
      .select(
        `
        id,
        user_id,
        customer_id,
        title,
        description,
        status,
        subtotal,
        vat_amount,
        total,
        price_type,
        fixed_price,
        hourly_rate,
        hours,
        materials_cost,
        customers(name, email, phone)
      `
      )
      .eq("id", offerId)
      .eq("user_id", user.id)
      .single();

    if (offerError || !offer) {
      console.error("Feil ved henting av tilbud:", offerError);

      return NextResponse.json({ error: "Fant ikke tilbud" }, { status: 404 });
    }

    if (offer.status !== "approved") {
      return NextResponse.json(
        { error: "Faktura kan bare opprettes fra godkjente tilbud" },
        { status: 400 }
      );
    }

    const { data: offerMaterials, error: offerMaterialsError } = await supabase
      .from("offer_materials")
      .select(
        "id, material_name, supplier, unit, quantity, unit_price, line_total"
      )
      .eq("offer_id", offer.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (offerMaterialsError) {
      console.error("Feil ved henting av materiallinjer:", offerMaterialsError);

      return NextResponse.json(
        { error: "Kunne ikke hente materiallinjer" },
        { status: 500 }
      );
    }

    const customersRelation = Array.isArray(offer.customers)
      ? offer.customers[0] || null
      : offer.customers || null;

    const customerName = customersRelation?.name || "Kunde";

    const title =
      String(offer.title || "").trim() || `Faktura til ${customerName}`;

    const description =
      String(offer.description || "").trim() ||
      "Faktura opprettet fra godkjent tilbud.";

    const subtotal = toNumber(offer.subtotal);
    const vatAmount = toNumber(offer.vat_amount);
    const total = toNumber(offer.total);

    const invoiceNumber = await generateNextInvoiceNumber(supabase, user.id);

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        user_id: user.id,
        offer_id: offer.id,
        customer_id: offer.customer_id || null,
        invoice_number: invoiceNumber,
        title,
        description,
        status: "draft",
        subtotal,
        vat_amount: vatAmount,
        total,
        due_date: addDays(14),
      })
      .select("id, invoice_number")
      .single();

    if (invoiceError || !invoice) {
      console.error("Feil ved opprettelse av faktura:", invoiceError);

      return NextResponse.json(
        { error: "Kunne ikke opprette faktura" },
        { status: 500 }
      );
    }

    const invoiceLines =
      offerMaterials && offerMaterials.length > 0
        ? offerMaterials.map((item) => ({
            invoice_id: invoice.id,
            user_id: user.id,
            source_offer_material_id: item.id,
            line_type: "item",
            title: item.material_name || "Materiale",
            description: item.supplier || null,
            quantity: toNumber(item.quantity) || 1,
            unit: item.unit || "stk",
            unit_price: toNumber(item.unit_price),
            line_total: toNumber(item.line_total),
          }))
        : [
            {
              invoice_id: invoice.id,
              user_id: user.id,
              source_offer_material_id: null,
              line_type: "item",
              title: String(offer.title || "Arbeid"),
              description,
              quantity: 1,
              unit: "stk",
              unit_price: subtotal,
              line_total: subtotal,
            },
          ];

    const { error: linesError } = await supabase
      .from("invoice_lines")
      .insert(invoiceLines);

    if (linesError) {
      console.error("Feil ved opprettelse av fakturalinjer:", linesError);

      await supabase
        .from("invoices")
        .delete()
        .eq("id", invoice.id)
        .eq("user_id", user.id);

      return NextResponse.json(
        { error: "Kunne ikke opprette fakturalinjer" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number || invoiceNumber,
    });
  } catch (error) {
    console.error("Create invoice from offer API error:", error);

    return NextResponse.json(
      { error: "Uventet feil ved opprettelse av faktura" },
      { status: 500 }
    );
  }
}