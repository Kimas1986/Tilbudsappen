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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Offer = {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  price_type?: string | null;
  vat_enabled?: boolean | null;
  subtotal?: number | string | null;
  vat_amount?: number | string | null;
  total?: number | string | null;
  created_at?: string | null;
  valid_until?: string | null;
  share_token?: string | null;
};

type Settings = {
  company_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCurrency(value: number | string | null | undefined) {
  const amount = toNumber(value);

  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getStatusLabel(status: string | null | undefined) {
  if (status === "approved") return "Godkjent";
  if (status === "draft") return "Utkast";
  if (status === "sent") return "Sendt";
  if (status === "rejected") return "Avslått";
  return status || "-";
}

function getPriceTypeLabel(priceType: string | null | undefined) {
  if (priceType === "fixed") return "Fastpris";
  if (priceType === "hourly") return "Timepris";
  return priceType || "-";
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#171717",
    backgroundColor: "#ffffff",
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
  statusBadge: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    fontSize: 10,
  },
  heroCard: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 10,
    color: "#737373",
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 10,
  },
  heroMeta: {
    fontSize: 11,
    color: "#525252",
    lineHeight: 1.5,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
  },
  textCard: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    padding: 14,
  },
  bodyText: {
    fontSize: 11,
    lineHeight: 1.6,
    color: "#171717",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    marginBottom: 6,
  },
  infoBox: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    padding: 14,
  },
  infoLabel: {
    fontSize: 10,
    color: "#737373",
    marginBottom: 5,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: 700,
    color: "#171717",
  },
  totalsCard: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    marginTop: 16,
    overflow: "hidden",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  totalsLabel: {
    fontSize: 11,
    color: "#404040",
  },
  totalsValue: {
    fontSize: 11,
    fontWeight: 700,
    color: "#171717",
  },
  totalsGrandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f5f5f5",
  },
  totalsGrandLabel: {
    fontSize: 12,
    fontWeight: 700,
  },
  totalsGrandValue: {
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

function OfferPdfDocument({
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
    <Document
      title={offer.title || "Tilbud"}
      author={company}
      subject="Tilbud"
      language="no-NO"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.topBlock}>
          <Text style={styles.companyName}>{company}</Text>
          <Text style={styles.contactLine}>{contact}</Text>
          {phone ? <Text style={styles.contactLine}>Tlf: {phone}</Text> : null}
          <Text style={styles.statusBadge}>{getStatusLabel(offer.status)}</Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Tittel</Text>
          <Text style={styles.heroTitle}>{offer.title || "Tilbud"}</Text>
          <Text style={styles.heroMeta}>
            Opprettet: {formatDate(offer.created_at)}
          </Text>
          <Text style={styles.heroMeta}>
            Gyldig til: {formatDate(offer.valid_until)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beskrivelse</Text>
          <View style={styles.textCard}>
            <Text style={styles.bodyText}>{offer.description || "-"}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Prisform</Text>
            <Text style={styles.infoValue}>
              {getPriceTypeLabel(offer.price_type)}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>MVA</Text>
            <Text style={styles.infoValue}>
              {offer.vat_enabled ? "Ja" : "Nei"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pris</Text>

          <View style={styles.totalsCard}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(offer.subtotal)}
              </Text>
            </View>

            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>MVA</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(offer.vat_amount)}
              </Text>
            </View>

            <View style={styles.totalsGrandRow}>
              <Text style={styles.totalsGrandLabel}>Totalt</Text>
              <Text style={styles.totalsGrandValue}>
                {formatCurrency(offer.total)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Tilbudet er gyldig til {formatDate(offer.valid_until)}.
          </Text>
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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const { data: offer, error: offerError } = await supabase
      .from("offers")
      .select(
        "id, title, description, status, price_type, vat_enabled, subtotal, vat_amount, total, created_at, valid_until, share_token"
      )
      .eq("id", id)
      .single<Offer>();

    if (offerError || !offer) {
      return NextResponse.json({ error: "Fant ikke tilbud" }, { status: 404 });
    }

    const { data: settings } = await supabase
      .from("ai_settings")
      .select("company_name, contact_name, contact_phone")
      .eq("user_id", user.id)
      .single<Settings>();

    const pdfBuffer = await renderToBuffer(
      <OfferPdfDocument offer={offer} settings={settings || {}} />
    );

    return new NextResponse(pdfBuffer as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="tilbud-${offer.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF generation failed:", error);

    return NextResponse.json(
      { error: "Kunne ikke generere PDF" },
      { status: 500 }
    );
  }
}