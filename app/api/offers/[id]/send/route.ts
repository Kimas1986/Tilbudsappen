import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import OfferPdf from "@/components/offer-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OfferCustomer =
  | {
      name: string | null;
      email: string | null;
      phone: string | null;
    }
  | {
      name: string | null;
      email: string | null;
      phone: string | null;
    }[]
  | null;

type OfferRow = {
  id: string;
  user_id: string;
  share_token: string | null;
  title: string | null;
  description: string | null;
  total: number | null;
  subtotal: number | null;
  vat_amount: number | null;
  valid_until: string | null;
  created_at: string | null;
  price_type: string | null;
  fixed_price: number | null;
  hourly_rate: number | null;
  hours: number | null;
  materials_cost: number | null;
  vat_enabled: boolean | null;
  status: string | null;
  customers?: OfferCustomer;
};

type SettingsRow = {
  company_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("no-NO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCustomer(customers: OfferCustomer) {
  const customer = Array.isArray(customers) ? customers[0] : customers;

  return {
    name: customer?.name || null,
    email: customer?.email || null,
    phone: customer?.phone || null,
  };
}

function buildEmailHtml(args: {
  companyName: string;
  contactName: string;
  contactPhone: string;
  customerName: string | null;
  offerTitle: string;
  total: number;
  validUntil: string | null;
  customerUrl: string;
}) {
  const {
    companyName,
    contactName,
    contactPhone,
    customerName,
    offerTitle,
    total,
    validUntil,
    customerUrl,
  } = args;

  const safeCompanyName = escapeHtml(companyName);
  const safeContactName = escapeHtml(contactName);
  const safeContactPhone = escapeHtml(contactPhone);
  const safeOfferTitle = escapeHtml(offerTitle);
  const safeCustomerUrl = escapeHtml(customerUrl);
  const greeting = customerName ? `Hei ${escapeHtml(customerName)},` : "Hei,";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; color: #171717; line-height: 1.6;">
      <h2 style="margin: 0 0 16px 0;">${safeCompanyName}</h2>

      <p>${greeting}</p>

      <p>Du har mottatt et tilbud fra oss.</p>

      <div style="margin: 16px 0; padding: 16px; background: #f5f5f5; border-radius: 12px;">
        <p style="margin: 0 0 8px 0;"><strong>${safeOfferTitle}</strong></p>
        <p style="margin: 0;">Totalt: ${formatCurrency(total)} kr</p>
        <p style="margin: 4px 0 0 0;">Gyldig til: ${formatDate(validUntil)}</p>
      </div>

      <p>For å se og eventuelt godkjenne tilbudet, bruk knappen under:</p>

      <p style="margin: 20px 0;">
        <a href="${safeCustomerUrl}" 
           style="display:inline-block;padding:12px 18px;background:#000;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
           Åpne tilbud
        </a>
      </p>

      <p>PDF ligger vedlagt i e-posten.</p>

      <p style="margin-top: 28px;">
        Med vennlig hilsen<br/>
        ${safeCompanyName}<br/>
        ${safeContactName ? `${safeContactName}<br/>` : ""}
        ${safeContactPhone ? `${safeContactPhone}<br/>` : ""}
      </p>
    </div>
  `;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY mangler" },
        { status: 500 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const { data: offer, error: offerError } = await supabase
      .from("offers")
      .select(
        `
        id,
        user_id,
        share_token,
        title,
        description,
        total,
        subtotal,
        vat_amount,
        valid_until,
        created_at,
        price_type,
        fixed_price,
        hourly_rate,
        hours,
        materials_cost,
        vat_enabled,
        status,
        customers(name, email, phone)
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json(
        { error: "Fant ikke tilbud" },
        { status: 404 }
      );
    }

    const typedOffer = offer as OfferRow;

    const { data: offerMaterials, error: offerMaterialsError } = await supabase
      .from("offer_materials")
      .select("*")
      .eq("offer_id", typedOffer.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (offerMaterialsError) {
      console.error("Feil ved henting av materiallinjer:", offerMaterialsError);

      return NextResponse.json(
        { error: "Kunne ikke hente materiallinjer" },
        { status: 500 }
      );
    }

    const { data: settings, error: settingsError } = await supabase
      .from("ai_settings")
      .select("company_name, contact_name, contact_phone")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.error("Feil ved henting av settings:", settingsError);

      return NextResponse.json(
        { error: "Kunne ikke hente innstillinger" },
        { status: 500 }
      );
    }

    const typedSettings = (settings || null) as SettingsRow | null;
    const customer = getCustomer(typedOffer.customers || null);
    const customerEmail = customer.email?.trim().toLowerCase() || null;

    if (!customerEmail) {
      return NextResponse.json(
        { error: "Kunde mangler e-post" },
        { status: 400 }
      );
    }

    if (!typedOffer.share_token) {
      return NextResponse.json(
        { error: "Tilbudet mangler kundelenke" },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const customerUrl = `${baseUrl}/t/${typedOffer.share_token}`;

    const companyName = typedSettings?.company_name?.trim() || "Tilbud";
    const contactName = typedSettings?.contact_name?.trim() || "";
    const contactPhone = typedSettings?.contact_phone?.trim() || "";

    const pdfBuffer = await renderToBuffer(
      OfferPdf({
        offer: typedOffer,
        materials: offerMaterials || [],
        company: {
          name: companyName,
          contact_person: contactName,
          phone: contactPhone,
        },
      })
    );

    const resend = new Resend(process.env.RESEND_API_KEY);

    const subject = `Tilbud: ${typedOffer.title || "Tilbud"}`;

    const { error: sendError } = await resend.emails.send({
      from: `${companyName} <onboarding@resend.dev>`,
      to: customerEmail,
      subject,
      html: buildEmailHtml({
        companyName,
        contactName,
        contactPhone,
        customerName: customer.name,
        offerTitle: typedOffer.title || "Tilbud",
        total: Number(typedOffer.total || 0),
        validUntil: typedOffer.valid_until,
        customerUrl,
      }),
      attachments: [
        {
          filename: `tilbud-${typedOffer.id}.pdf`,
          content: Buffer.from(pdfBuffer),
        },
      ],
    });

    if (sendError) {
      console.error("Send email error:", sendError);

      return NextResponse.json(
        { error: "Kunne ikke sende e-post" },
        { status: 500 }
      );
    }

    await supabase
      .from("offers")
      .update({
        status: typedOffer.status === "approved" ? "approved" : "sent",
      })
      .eq("id", typedOffer.id)
      .eq("user_id", user.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send email error:", err);

    return NextResponse.json(
      { error: "Kunne ikke sende e-post" },
      { status: 500 }
    );
  }
}