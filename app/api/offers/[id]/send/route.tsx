import React from "react";
import { NextResponse } from "next/server";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Offer = {
  id: string;
  share_token?: string | null;
  customer_id?: string | null;
  title?: string | null;
  description?: string | null;
  total?: number | string | null;
  created_at?: string | null;
};

type Customer = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type Settings = {
  company_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function formatCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
  }).format(toNumber(value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingRight: 40,
    paddingBottom: 40,
    paddingLeft: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#171717",
  },
  topBlock: {
    marginBottom: 22,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  companyName: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4,
  },
  contactLine: {
    fontSize: 10,
    color: "#525252",
    lineHeight: 1.5,
  },
  title: {
    fontSize: 22,
    marginBottom: 10,
    fontWeight: 700,
  },
  meta: {
    marginBottom: 18,
    color: "#525252",
    fontSize: 10,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    marginBottom: 6,
    fontWeight: 700,
  },
  body: {
    lineHeight: 1.6,
  },
  totalBox: {
    marginTop: 8,
    paddingTop: 10,
    paddingRight: 12,
    paddingBottom: 10,
    paddingLeft: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 6,
  },
  total: {
    fontSize: 13,
    fontWeight: 700,
  },
  footer: {
    marginTop: 28,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
  },
  footerText: {
    fontSize: 10,
    color: "#525252",
    lineHeight: 1.5,
  },
});

function OfferPdf({
  offer,
  settings,
}: {
  offer: Offer;
  settings: Settings;
}) {
  const company = settings.company_name || "Ditt Firma";
  const contact = settings.contact_name || "Kontaktperson";
  const phone = settings.contact_phone || "";

  return (
    <Document title={offer.title || "Tilbud"}>
      <Page size="A4" style={styles.page}>
        <View style={styles.topBlock}>
          <Text style={styles.companyName}>{company}</Text>
          <Text style={styles.contactLine}>{contact}</Text>
          {phone ? <Text style={styles.contactLine}>Tlf: {phone}</Text> : null}
        </View>

        <Text style={styles.title}>{offer.title || "Tilbud"}</Text>

        <Text style={styles.meta}>
          Opprettet: {formatDate(offer.created_at)}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beskrivelse</Text>
          <Text style={styles.body}>{offer.description || "-"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pris</Text>
          <View style={styles.totalBox}>
            <Text style={styles.total}>
              Totalt: {formatCurrency(offer.total)}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Ta kontakt dersom du har spørsmål til tilbudet.
          </Text>
          <Text style={styles.footerText}>
            {company}
            {contact ? ` • ${contact}` : ""}
            {phone ? ` • ${phone}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function POST(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const { data: offer } = await supabase
      .from("offers")
      .select("id, share_token, customer_id, title, description, total, created_at")
      .eq("id", id)
      .single<Offer>();

    if (!offer) {
      return NextResponse.json({ error: "Fant ikke tilbud" }, { status: 404 });
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, email")
      .eq("id", offer.customer_id)
      .eq("user_id", user.id)
      .single<Customer>();

    if (!customer?.email) {
      return NextResponse.json(
        { error: "Kunden mangler e-post" },
        { status: 400 }
      );
    }

    const { data: settings } = await supabase
      .from("ai_settings")
      .select("company_name, contact_name, contact_phone")
      .eq("user_id", user.id)
      .single<Settings>();

    const company = settings?.company_name || "Ditt Firma";
    const contact = settings?.contact_name || "Kontaktperson";
    const phone = settings?.contact_phone || "";

    if (!offer.share_token) {
      return NextResponse.json(
        { error: "Tilbudet mangler kundelenke" },
        { status: 400 }
      );
    }

    const publicUrl = `http://localhost:3000/t/${offer.share_token}`;
    const pdfBuffer = await renderToBuffer(
      <OfferPdf offer={offer} settings={settings || {}} />
    );

    const emailResult = await resend.emails.send({
      from: "Tilbud <onboarding@resend.dev>",
      to: customer.email,
      subject: offer.title || "Tilbud",
      html: `
        <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
          <p>Hei${customer.name ? ` ${customer.name}` : ""},</p>

          <p>Vedlagt finner du tilbudet ditt i PDF-format.</p>

          <p>For å se og godkjenne tilbudet:</p>

          <p>
            <a href="${publicUrl}" style="display:inline-block; padding:10px 16px; background:#111; color:#fff; border-radius:8px; text-decoration:none;">
              Se og godkjenn tilbud
            </a>
          </p>

          <p>Ta kontakt dersom du har spørsmål.</p>

          <br/>

          <p>
            Med vennlig hilsen<br/>
            <strong>${company}</strong><br/>
            ${contact}<br/>
            ${phone}
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `tilbud-${offer.id}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (emailResult.error) {
      return NextResponse.json(
        { error: emailResult.error.message },
        { status: 500 }
      );
    }

    await supabase
      .from("offers")
      .update({ status: "sent" })
      .eq("id", offer.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Kunne ikke sende e-post" },
      { status: 500 }
    );
  }
}