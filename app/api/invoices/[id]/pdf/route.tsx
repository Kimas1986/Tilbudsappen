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

type CustomerRelation =
  | {
      name: string | null;
      email?: string | null;
      phone?: string | null;
    }
  | {
      name: string | null;
      email?: string | null;
      phone?: string | null;
    }[]
  | null;

type Invoice = {
  id: string;
  invoice_number?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  subtotal?: number | string | null;
  vat_amount?: number | string | null;
  total?: number | string | null;
  due_date?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  customers?: CustomerRelation;
};

type InvoiceLine = {
  id: string;
  title: string | null;
  description: string | null;
  quantity: number | string | null;
  unit: string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
};

type Settings = {
  company_name?: string | null;
  company_email?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  company_address?: string | null;
  company_postcode?: string | null;
  company_city?: string | null;
  org_number?: string | null;
  bank_account?: string | null;
  iban?: string | null;
  bic?: string | null;
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

function formatNumber(value: number | string | null | undefined) {
  const amount = toNumber(value);

  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 0,
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
  if (status === "draft") return "Utkast";
  if (status === "sent") return "Sendt";
  if (status === "paid") return "Betalt";
  if (status === "overdue") return "Forfalt";
  if (status === "cancelled") return "Kreditert";
  return status || "-";
}

function getCustomerInfo(customers: CustomerRelation) {
  const customer = Array.isArray(customers) ? customers[0] : customers;

  return {
    name: customer?.name || "Uten kunde",
    email: customer?.email || null,
    phone: customer?.phone || null,
  };
}

function formatOrgNumber(value: string | null | undefined) {
  const raw = String(value || "").replace(/\s+/g, "");
  if (raw.length !== 9) return String(value || "").trim();
  return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6, 9)}`;
}

function formatBankAccount(value: string | null | undefined) {
  const raw = String(value || "").replace(/\s+/g, "");
  if (raw.length !== 11) return String(value || "").trim();
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 11)}`;
}

function getCompanyAddressLine(settings: Settings) {
  const postcode = String(settings.company_postcode || "").trim();
  const city = String(settings.company_city || "").trim();
  return [postcode, city].filter(Boolean).join(" ");
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#171717",
    backgroundColor: "#ffffff",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  companyBlock: {
    width: "52%",
  },
  invoiceMetaBlock: {
    width: "44%",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fafafa",
  },
  companyName: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4,
  },
  companyLine: {
    fontSize: 10,
    color: "#404040",
    lineHeight: 1.45,
  },
  sectionLabel: {
    fontSize: 9,
    color: "#737373",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#ececec",
  },
  metaLabel: {
    fontSize: 10,
    color: "#525252",
  },
  metaValue: {
    fontSize: 10,
    fontWeight: 700,
    color: "#171717",
  },
  customerBlock: {
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 12,
  },
  customerName: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4,
  },
  customerLine: {
    fontSize: 10,
    color: "#404040",
    lineHeight: 1.45,
  },
  descriptionBlock: {
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fafafa",
  },
  descriptionText: {
    fontSize: 10,
    lineHeight: 1.55,
    color: "#171717",
  },
  table: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 18,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  tableHeaderCell: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 9,
    fontWeight: 700,
    color: "#404040",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  cell: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    fontSize: 10,
    color: "#171717",
  },
  cellDescription: {
    width: "44%",
  },
  cellQty: {
    width: "16%",
    textAlign: "right",
  },
  cellUnitPrice: {
    width: "20%",
    textAlign: "right",
  },
  cellLineTotal: {
    width: "20%",
    textAlign: "right",
  },
  lineTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 3,
  },
  lineDescription: {
    fontSize: 9,
    color: "#666666",
    lineHeight: 1.4,
  },
  totalsWrap: {
    marginLeft: "52%",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    overflow: "hidden",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  totalsLabel: {
    fontSize: 10,
    color: "#404040",
  },
  totalsValue: {
    fontSize: 10,
    fontWeight: 700,
    color: "#171717",
  },
  totalsGrandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: "#f5f5f5",
  },
  totalsGrandLabel: {
    fontSize: 11,
    fontWeight: 700,
  },
  totalsGrandValue: {
    fontSize: 11,
    fontWeight: 700,
  },
  footer: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
  },
  footerText: {
    fontSize: 9,
    color: "#525252",
    lineHeight: 1.5,
  },
});

function InvoicePdfDocument({
  invoice,
  lines,
  settings,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  settings: Settings;
}) {
  const customer = getCustomerInfo(invoice.customers || null);
  const companyName = settings.company_name || "Ditt Firma";
  const companyAddressLine = getCompanyAddressLine(settings);

  return (
    <Document
      title={invoice.title || "Faktura"}
      author={companyName}
      subject="Faktura"
      language="no-NO"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.topRow}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{companyName}</Text>

            {settings.company_address ? (
              <Text style={styles.companyLine}>{settings.company_address}</Text>
            ) : null}

            {companyAddressLine ? (
              <Text style={styles.companyLine}>{companyAddressLine}</Text>
            ) : null}

            {settings.company_email ? (
              <Text style={styles.companyLine}>{settings.company_email}</Text>
            ) : null}

            {settings.contact_name ? (
              <Text style={styles.companyLine}>
                Kontakt: {settings.contact_name}
              </Text>
            ) : null}

            {settings.contact_phone ? (
              <Text style={styles.companyLine}>
                Telefon: {settings.contact_phone}
              </Text>
            ) : null}

            {settings.org_number ? (
              <Text style={styles.companyLine}>
                Org.nr: {formatOrgNumber(settings.org_number)}
              </Text>
            ) : null}

            {settings.bank_account ? (
              <Text style={styles.companyLine}>
                Konto: {formatBankAccount(settings.bank_account)}
              </Text>
            ) : null}

            {settings.iban ? (
              <Text style={styles.companyLine}>IBAN: {settings.iban}</Text>
            ) : null}

            {settings.bic ? (
              <Text style={styles.companyLine}>BIC: {settings.bic}</Text>
            ) : null}
          </View>

          <View style={styles.invoiceMetaBlock}>
            <Text style={styles.sectionLabel}>Dokument</Text>
            <Text style={styles.invoiceTitle}>Faktura</Text>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status</Text>
              <Text style={styles.metaValue}>{getStatusLabel(invoice.status)}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Fakturanummer</Text>
              <Text style={styles.metaValue}>{invoice.invoice_number || "-"}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Dato</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.created_at)}</Text>
            </View>

            <View style={[styles.metaRow, styles.rowLast]}>
              <Text style={styles.metaLabel}>Forfall</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.due_date)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.customerBlock}>
          <Text style={styles.sectionLabel}>Kunde</Text>
          <Text style={styles.customerName}>{customer.name}</Text>
          {customer.email ? (
            <Text style={styles.customerLine}>E-post: {customer.email}</Text>
          ) : null}
          {customer.phone ? (
            <Text style={styles.customerLine}>Telefon: {customer.phone}</Text>
          ) : null}
        </View>

        {invoice.title || invoice.description ? (
          <View style={styles.descriptionBlock}>
            {invoice.title ? (
              <>
                <Text style={styles.sectionLabel}>Tittel</Text>
                <Text
                  style={[
                    styles.descriptionText,
                    { fontSize: 12, marginBottom: 8 },
                  ]}
                >
                  {invoice.title}
                </Text>
              </>
            ) : null}

            {invoice.description ? (
              <>
                <Text style={styles.sectionLabel}>Beskrivelse / kommentar</Text>
                <Text style={styles.descriptionText}>{invoice.description}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.cellDescription]}>
              Beskrivelse
            </Text>
            <Text style={[styles.tableHeaderCell, styles.cellQty]}>Antall</Text>
            <Text style={[styles.tableHeaderCell, styles.cellUnitPrice]}>
              Pris
            </Text>
            <Text style={[styles.tableHeaderCell, styles.cellLineTotal]}>
              Sum
            </Text>
          </View>

          {lines.length === 0 ? (
            <View style={[styles.row, styles.rowLast]}>
              <Text style={[styles.cell, { width: "100%" }]}>
                Ingen fakturalinjer
              </Text>
            </View>
          ) : (
            lines.map((line, index) => {
              const isLast = index === lines.length - 1;
              const rowStyle = isLast
                ? [styles.row, styles.rowLast]
                : [styles.row];

              return (
                <View key={line.id} style={rowStyle}>
                  <View style={[styles.cell, styles.cellDescription]}>
                    <Text style={styles.lineTitle}>{line.title || "Linje"}</Text>
                    {line.description ? (
                      <Text style={styles.lineDescription}>{line.description}</Text>
                    ) : null}
                  </View>

                  <Text style={[styles.cell, styles.cellQty]}>
                    {formatNumber(line.quantity)}
                    {line.unit ? ` ${line.unit}` : ""}
                  </Text>

                  <Text style={[styles.cell, styles.cellUnitPrice]}>
                    {formatCurrency(line.unit_price)}
                  </Text>

                  <Text style={[styles.cell, styles.cellLineTotal]}>
                    {formatCurrency(line.line_total)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.totalsWrap}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{formatCurrency(invoice.subtotal)}</Text>
          </View>

          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>MVA</Text>
            <Text style={styles.totalsValue}>{formatCurrency(invoice.vat_amount)}</Text>
          </View>

          <View style={styles.totalsGrandRow}>
            <Text style={styles.totalsGrandLabel}>Totalt</Text>
            <Text style={styles.totalsGrandValue}>{formatCurrency(invoice.total)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Betales til konto {formatBankAccount(settings.bank_account || "-")}
            {settings.org_number
              ? ` • Org.nr ${formatOrgNumber(settings.org_number)}`
              : ""}
          </Text>

          {settings.iban || settings.bic ? (
            <Text style={styles.footerText}>
              {settings.iban ? `IBAN: ${settings.iban}` : ""}
              {settings.iban && settings.bic ? " • " : ""}
              {settings.bic ? `BIC: ${settings.bic}` : ""}
            </Text>
          ) : null}

          <Text style={styles.footerText}>
            Ta kontakt dersom du har spørsmål til fakturaen.
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

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        title,
        description,
        status,
        subtotal,
        vat_amount,
        total,
        due_date,
        sent_at,
        paid_at,
        created_at,
        customers(name, email, phone)
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single<Invoice>();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Fant ikke faktura" }, { status: 404 });
    }

    const { data: invoiceLines, error: linesError } = await supabase
      .from("invoice_lines")
      .select("id, title, description, quantity, unit, unit_price, line_total")
      .eq("invoice_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (linesError) {
      return NextResponse.json(
        { error: "Kunne ikke hente fakturalinjer" },
        { status: 500 }
      );
    }

    const { data: settings } = await supabase
      .from("ai_settings")
      .select(
        "company_name, company_email, contact_name, contact_phone, company_address, company_postcode, company_city, org_number, bank_account, iban, bic"
      )
      .eq("user_id", user.id)
      .maybeSingle<Settings>();

    const pdfBuffer = await renderToBuffer(
      <InvoicePdfDocument
        invoice={invoice}
        lines={(invoiceLines as InvoiceLine[] | null) || []}
        settings={settings || {}}
      />
    );

    return new NextResponse(pdfBuffer as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="faktura-${invoice.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Invoice PDF generation failed:", error);

    return NextResponse.json(
      { error: "Kunne ikke generere PDF" },
      { status: 500 }
    );
  }
}