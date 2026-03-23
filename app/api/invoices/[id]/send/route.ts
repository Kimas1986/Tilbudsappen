import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type InvoiceLine = {
  id: string;
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
};

type SettingsRow = {
  company_name: string | null;
  company_email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  company_address: string | null;
  company_postcode: string | null;
  company_city: string | null;
  org_number: string | null;
  bank_account: string | null;
  iban: string | null;
  bic: string | null;
};

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string | null | undefined) {
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

function nowIso() {
  return new Date().toISOString();
}

function getCustomerInfo(customers: CustomerRelation) {
  const customer = Array.isArray(customers) ? customers[0] : customers;

  return {
    name: customer?.name || "kunde",
    email: customer?.email || null,
    phone: customer?.phone || null,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function getCompanyAddressLine(settings: SettingsRow | null | undefined) {
  const postcode = String(settings?.company_postcode || "").trim();
  const city = String(settings?.company_city || "").trim();
  return [postcode, city].filter(Boolean).join(" ");
}

function buildLinesHtml(lines: InvoiceLine[]) {
  if (lines.length === 0) {
    return `
      <tr>
        <td colspan="4" style="padding:12px;border-bottom:1px solid #e5e5e5;color:#525252;">
          Ingen fakturalinjer
        </td>
      </tr>
    `;
  }

  return lines
    .map((line) => {
      const title = escapeHtml(String(line.title || "Linje"));
      const quantity = Number(line.quantity || 0);
      const unit = escapeHtml(String(line.unit || ""));
      const unitPrice = formatCurrency(line.unit_price);
      const lineTotal = formatCurrency(line.line_total);

      const description = String(line.description || "").trim()
        ? `<div style="margin-top:4px;color:#737373;font-size:12px;">${escapeHtml(
            String(line.description || "")
          )}</div>`
        : "";

      return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top;">
            <div style="font-weight:600;color:#171717;">${title}</div>
            ${description}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top;text-align:right;color:#171717;">
            ${escapeHtml(String(quantity))}${unit ? ` ${unit}` : ""}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top;text-align:right;color:#171717;">
            ${unitPrice} kr
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top;text-align:right;color:#171717;font-weight:600;">
            ${lineTotal} kr
          </td>
        </tr>
      `;
    })
    .join("");
}

export async function POST(
  _request: Request,
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

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        `
        id,
        user_id,
        title,
        description,
        status,
        invoice_number,
        subtotal,
        vat_amount,
        total,
        due_date,
        sent_at,
        paid_at,
        created_at,
        customer_id,
        customers(name, email, phone)
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Fant ikke faktura" }, { status: 404 });
    }

    const { data: invoiceLines, error: linesError } = await supabase
      .from("invoice_lines")
      .select("id, title, description, quantity, unit, unit_price, line_total")
      .eq("invoice_id", invoice.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (linesError) {
      console.error("Feil ved henting av fakturalinjer:", linesError);

      return NextResponse.json(
        { error: "Kunne ikke hente fakturalinjer" },
        { status: 500 }
      );
    }

    const { data: settings, error: settingsError } = await supabase
      .from("ai_settings")
      .select(
        "company_name, company_email, contact_name, contact_phone, company_address, company_postcode, company_city, org_number, bank_account, iban, bic"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.error("Feil ved henting av settings:", settingsError);
    }

    const typedSettings = (settings as SettingsRow | null) || null;

    const customer = getCustomerInfo(invoice.customers as CustomerRelation);
    const customerEmail = String(customer.email || "").trim();

    if (!customerEmail) {
      return NextResponse.json(
        { error: "Kunden mangler e-postadresse" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY mangler" },
        { status: 500 }
      );
    }

    const resend = new Resend(resendApiKey);

    const companyName = String(typedSettings?.company_name || "").trim() || "Tilbudsapp";
    const companyEmail = String(typedSettings?.company_email || "").trim();
    const contactName = String(typedSettings?.contact_name || "").trim();
    const contactPhone = String(typedSettings?.contact_phone || "").trim();
    const companyAddress = String(typedSettings?.company_address || "").trim();
    const companyAddressLine = getCompanyAddressLine(typedSettings);
    const orgNumber = String(typedSettings?.org_number || "").trim();
    const bankAccount = String(typedSettings?.bank_account || "").trim();
    const iban = String(typedSettings?.iban || "").trim();
    const bic = String(typedSettings?.bic || "").trim();

    const invoiceTitle = String(invoice.title || "").trim() || "Faktura";
    const invoiceDescription = String(invoice.description || "").trim();
    const invoiceNumber = String(invoice.invoice_number || "").trim();
    const lines = (invoiceLines as InvoiceLine[] | null) || [];

    const subject = invoiceNumber
      ? `Faktura ${invoiceNumber} - ${invoiceTitle}`
      : `Faktura - ${invoiceTitle}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#171717;line-height:1.6;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr>
            <td style="width:54%;vertical-align:top;padding-right:16px;">
              <h2 style="margin:0 0 8px 0;">${escapeHtml(companyName)}</h2>
              ${
                companyAddress
                  ? `<p style="margin:0;color:#525252;">${escapeHtml(companyAddress)}</p>`
                  : ""
              }
              ${
                companyAddressLine
                  ? `<p style="margin:0;color:#525252;">${escapeHtml(companyAddressLine)}</p>`
                  : ""
              }
              ${
                companyEmail
                  ? `<p style="margin:0;color:#525252;">${escapeHtml(companyEmail)}</p>`
                  : ""
              }
              ${
                contactName
                  ? `<p style="margin:0;color:#525252;">Kontakt: ${escapeHtml(contactName)}</p>`
                  : ""
              }
              ${
                contactPhone
                  ? `<p style="margin:0;color:#525252;">Telefon: ${escapeHtml(contactPhone)}</p>`
                  : ""
              }
              ${
                orgNumber
                  ? `<p style="margin:0;color:#525252;">Org.nr: ${escapeHtml(
                      formatOrgNumber(orgNumber)
                    )}</p>`
                  : ""
              }
              ${
                bankAccount
                  ? `<p style="margin:0;color:#525252;">Konto: ${escapeHtml(
                      formatBankAccount(bankAccount)
                    )}</p>`
                  : ""
              }
              ${
                iban
                  ? `<p style="margin:0;color:#525252;">IBAN: ${escapeHtml(iban)}</p>`
                  : ""
              }
              ${
                bic
                  ? `<p style="margin:0;color:#525252;">BIC: ${escapeHtml(bic)}</p>`
                  : ""
              }
            </td>

            <td style="width:46%;vertical-align:top;">
              <div style="border:1px solid #e5e5e5;border-radius:16px;padding:16px;background:#fafafa;">
                <p style="margin:0 0 6px 0;font-size:12px;color:#737373;text-transform:uppercase;">Faktura</p>
                ${
                  invoiceNumber
                    ? `<p style="margin:0 0 6px 0;color:#525252;">Fakturanummer: ${escapeHtml(
                        invoiceNumber
                      )}</p>`
                    : ""
                }
                <p style="margin:0 0 6px 0;color:#525252;">Dato: ${formatDate(
                  invoice.created_at
                )}</p>
                <p style="margin:0;color:#525252;">Forfallsdato: ${formatDate(
                  invoice.due_date
                )}</p>
              </div>
            </td>
          </tr>
        </table>

        <div style="border:1px solid #e5e5e5;border-radius:16px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 6px 0;font-size:12px;color:#737373;text-transform:uppercase;">Kunde</p>
          <p style="margin:0 0 4px 0;font-size:18px;font-weight:700;">${escapeHtml(
            customer.name
          )}</p>
          ${
            customer.email
              ? `<p style="margin:0;color:#525252;">E-post: ${escapeHtml(customer.email)}</p>`
              : ""
          }
          ${
            customer.phone
              ? `<p style="margin:0;color:#525252;">Telefon: ${escapeHtml(customer.phone)}</p>`
              : ""
          }
        </div>

        <p>Hei ${escapeHtml(customer.name)},</p>

        <p>Her kommer fakturaen for utført arbeid og leverte varer/tjenester.</p>

        <div style="border:1px solid #e5e5e5;border-radius:16px;padding:16px;background:#fafafa;">
          <p style="margin:0 0 8px 0;"><strong>${escapeHtml(invoiceTitle)}</strong></p>
          ${
            invoiceDescription
              ? `<p style="margin:0 0 8px 0;color:#525252;">${escapeHtml(
                  invoiceDescription
                )}</p>`
              : ""
          }
          <p style="margin:0;color:#525252;">Forfallsdato: ${formatDate(
            invoice.due_date
          )}</p>
          <p style="margin:8px 0 0 0;font-size:20px;font-weight:700;">Totalt: ${formatCurrency(
            invoice.total
          )} kr</p>
        </div>

        <div style="height:24px;"></div>

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding:12px;border-bottom:1px solid #d4d4d4;">Beskrivelse</th>
              <th style="text-align:right;padding:12px;border-bottom:1px solid #d4d4d4;">Antall</th>
              <th style="text-align:right;padding:12px;border-bottom:1px solid #d4d4d4;">Pris</th>
              <th style="text-align:right;padding:12px;border-bottom:1px solid #d4d4d4;">Sum</th>
            </tr>
          </thead>
          <tbody>
            ${buildLinesHtml(lines)}
          </tbody>
        </table>

        <div style="height:20px;"></div>

        <div style="border:1px solid #e5e5e5;border-radius:16px;padding:16px;background:#fff;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#525252;">Subtotal</span>
            <strong>${formatCurrency(invoice.subtotal)} kr</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#525252;">MVA</span>
            <strong>${formatCurrency(invoice.vat_amount)} kr</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:18px;">
            <span><strong>Totalt</strong></span>
            <strong>${formatCurrency(invoice.total)} kr</strong>
          </div>
        </div>

        <div style="height:24px;"></div>

        ${
          bankAccount || orgNumber || iban || bic
            ? `
          <div style="border:1px solid #e5e5e5;border-radius:16px;padding:16px;background:#fafafa;">
            <p style="margin:0 0 8px 0;font-size:12px;color:#737373;text-transform:uppercase;">Betalingsinformasjon</p>
            ${
              bankAccount
                ? `<p style="margin:0;color:#525252;">Kontonummer: ${escapeHtml(
                    formatBankAccount(bankAccount)
                  )}</p>`
                : ""
            }
            ${
              orgNumber
                ? `<p style="margin:0;color:#525252;">Organisasjonsnummer: ${escapeHtml(
                    formatOrgNumber(orgNumber)
                  )}</p>`
                : ""
            }
            ${
              iban
                ? `<p style="margin:0;color:#525252;">IBAN: ${escapeHtml(iban)}</p>`
                : ""
            }
            ${
              bic
                ? `<p style="margin:0;color:#525252;">BIC: ${escapeHtml(bic)}</p>`
                : ""
            }
          </div>
        `
            : ""
        }

        <div style="height:24px;"></div>

        <p>Ta kontakt dersom du har spørsmål til fakturaen.</p>

        <p style="margin-top:24px;">
          Med vennlig hilsen<br/>
          ${escapeHtml(companyName)}<br/>
          ${contactName ? `${escapeHtml(contactName)}<br/>` : ""}
          ${contactPhone ? `${escapeHtml(contactPhone)}<br/>` : ""}
          ${companyEmail ? `${escapeHtml(companyEmail)}` : ""}
        </p>
      </div>
    `;

    const sendResult = await resend.emails.send({
      from: `${companyName} <onboarding@resend.dev>`,
      to: customerEmail,
      subject,
      html,
    });

    if (sendResult.error) {
      console.error("Feil ved sending av faktura:", sendResult.error);

      return NextResponse.json(
        { error: "Kunne ikke sende faktura på e-post" },
        { status: 500 }
      );
    }

    if (invoice.status !== "paid") {
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          status: "sent",
          sent_at: invoice.sent_at || nowIso(),
        })
        .eq("id", invoice.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error("Feil ved oppdatering av fakturastatus:", updateError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invoice send API error:", error);

    return NextResponse.json(
      { error: "Uventet feil ved sending av faktura" },
      { status: 500 }
    );
  }
}