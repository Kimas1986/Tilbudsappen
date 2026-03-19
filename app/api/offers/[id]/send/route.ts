import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import OfferPdf from "@/components/offer-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const { data: offer, error: offerError } = await supabase
      .from("offers")
      .select("*, customers(*), user_id")
      .eq("id", id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json(
        { error: "Fant ikke tilbud" },
        { status: 404 }
      );
    }

    const { data: offerMaterials, error: offerMaterialsError } = await supabase
      .from("offer_materials")
      .select("*")
      .eq("offer_id", offer.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (offerMaterialsError) {
      console.error("Feil ved henting av materiallinjer:", offerMaterialsError);
    }

    const { data: settings } = await supabase
      .from("ai_settings")
      .select("company_name, contact_name, contact_phone")
      .eq("user_id", user.id)
      .maybeSingle();

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const customerUrl = `${baseUrl}/t/${offer.share_token}`;

    const resend = new Resend(process.env.RESEND_API_KEY);

    const pdfBuffer = await renderToBuffer(
      OfferPdf({
        offer,
        materials: offerMaterials || [],
        company: {
          name: settings?.company_name || "",
          contact_person: settings?.contact_name || "",
          phone: settings?.contact_phone || "",
        },
      })
    );

    const customerEmail = offer.customers?.email || offer.customer_email;

    if (!customerEmail) {
      return NextResponse.json(
        { error: "Kunde mangler e-post" },
        { status: 400 }
      );
    }

    const { error: sendError } = await resend.emails.send({
      from: `${settings?.company_name || "Tilbud"} <onboarding@resend.dev>`,
      to: customerEmail,
      subject: `Tilbud: ${offer.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; color: #171717; line-height: 1.6;">
          <h2 style="margin: 0 0 16px 0;">${settings?.company_name || "Tilbud"}</h2>

          <p>Hei${offer.customers?.name ? ` ${offer.customers.name}` : ""},</p>

          <p>Du har mottatt et tilbud fra oss.</p>

          <p>
            <strong>${offer.title || "Tilbud"}</strong><br/>
            Totalt: ${formatCurrency(Number(offer.total || 0))} kr<br/>
            Gyldig til: ${formatDate(offer.valid_until)}
          </p>

          <p>For å se og godkjenne tilbudet, trykk her:</p>

          <p>
            <a href="${customerUrl}" 
               style="display:inline-block;padding:10px 16px;background:#000;color:#fff;text-decoration:none;border-radius:8px;">
               Åpne tilbud
            </a>
          </p>

          <p>PDF ligger vedlagt.</p>

          <br/>

          <p style="margin-top:20px;">
            Med vennlig hilsen<br/>
            ${settings?.company_name || ""}<br/>
            ${settings?.contact_name || ""}<br/>
            ${settings?.contact_phone || ""}
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `tilbud-${offer.id}.pdf`,
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
      .update({ status: "sent" })
      .eq("id", offer.id)
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