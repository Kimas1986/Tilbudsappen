import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

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
  try {
    const { id } = await params;

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const { data: offer, error: offerError } = await supabase
      .from("offers")
      .select("*, customers(*)")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (offerError || !offer) {
      return NextResponse.json(
        { error: "Fant ikke tilbud" },
        { status: 404 }
      );
    }

    if (!offer.customers?.email) {
      return NextResponse.json(
        { error: "Kunden mangler e-post" },
        { status: 400 }
      );
    }

    const { data: settings } = await supabase
      .from("ai_settings")
      .select("company_name, contact_name, contact_phone")
      .eq("user_id", user.id)
      .maybeSingle();

    const publicUrl = `http://localhost:3000/t/${offer.share_token}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height:1.6; color:#111;">
        <p>Hei ${offer.customers?.name || ""},</p>

        <p>Du har mottatt et tilbud fra oss.</p>

        <p style="margin:20px 0;">
          <a href="${publicUrl}" 
             style="display:inline-block; padding:12px 20px; background:#111; color:#fff; text-decoration:none; border-radius:8px;">
            Se og godkjenn tilbud
          </a>
        </p>

        <p><strong>${offer.title}</strong></p>

        <p>${offer.description || ""}</p>

        <hr style="margin:20px 0;" />

        <p><strong>Totalt:</strong> ${formatCurrency(offer.total)} kr</p>

        <p><strong>Gyldig til:</strong> ${formatDate(offer.valid_until)}</p>

        <hr style="margin:20px 0;" />

        <p>Ta kontakt dersom du har spørsmål.</p>

        <br/>

        <p style="margin-top:20px;">
          ${settings?.company_name || ""}
          <br/>
          ${settings?.contact_name || ""}
          <br/>
          ${settings?.contact_phone || ""}
        </p>
      </div>
    `;

    const emailText = `
Hei ${offer.customers?.name || ""},

Du har mottatt et tilbud fra oss.

Se og godkjenn tilbud:
${publicUrl}

${offer.title}

${offer.description || ""}

Totalt: ${formatCurrency(offer.total)} kr
Gyldig til: ${formatDate(offer.valid_until)}

Med vennlig hilsen
${settings?.company_name || ""}
${settings?.contact_name || ""}
${settings?.contact_phone || ""}
    `;

    const { error: sendError } = await resend.emails.send({
      from: "Tilbud <onboarding@resend.dev>",
      to: offer.customers.email,
      subject: offer.title || "Tilbud",
      html: emailHtml,
      text: emailText,
    });

    if (sendError) {
      console.error("Resend error:", sendError);

      return NextResponse.json(
        { error: "Kunne ikke sende e-post" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send email error:", error);

    return NextResponse.json(
      { error: "Uventet feil ved sending av e-post" },
      { status: 500 }
    );
  }
}