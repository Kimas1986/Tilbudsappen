import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { renderToBuffer } from "@react-pdf/renderer";
import OfferPdf from "@/components/offer-pdf";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
  }

  const { data: offer, error } = await supabase
    .from("offers")
    .select("*, customers(*), user_id")
    .eq("id", id)
    .single();

  if (error || !offer) {
    return NextResponse.json(
      { error: "Fant ikke tilbud" },
      { status: 404 }
    );
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

  try {
    const pdfBuffer = await renderToBuffer(
      OfferPdf({
        offer,
        settings,
      })
    );

    const customerEmail =
      offer.customers?.email || offer.customer_email;

    if (!customerEmail) {
      return NextResponse.json(
        { error: "Kunde mangler e-post" },
        { status: 400 }
      );
    }

    await resend.emails.send({
      from: `${settings?.company_name || "Tilbud"} <onboarding@resend.dev>`,
      to: customerEmail,
      subject: `Tilbud: ${offer.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>${settings?.company_name || "Tilbud"}</h2>

          <p>Hei,</p>

          <p>Du har mottatt et tilbud.</p>

          <p>
            <strong>${offer.title}</strong><br/>
            Totalt: ${offer.total} kr<br/>
            Gyldig til: ${
              offer.valid_until
                ? new Date(offer.valid_until).toLocaleDateString("no-NO")
                : "-"
            }
          </p>

          <p>
            For å godkjenne tilbudet, trykk her:
          </p>

          <p>
            <a href="${customerUrl}" 
               style="display:inline-block;padding:10px 16px;background:#000;color:#fff;text-decoration:none;border-radius:8px;">
               Åpne tilbud
            </a>
          </p>

          <br/>

          <p>
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

    await supabase
      .from("offers")
      .update({ status: "sent" })
      .eq("id", offer.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send email error:", err);

    return NextResponse.json(
      { error: "Kunne ikke sende e-post" },
      { status: 500 }
    );
  }
}