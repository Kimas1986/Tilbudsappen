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

function formatDateTimeIso() {
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
      const title = escapeHtml(line.title || "Linje");
      const description = line.description
        ? `<div style="margin-top:4px;color:#737373;font-size:12px;">${escapeHtml(
            line.description
          )}</div>`
        : "";

      return `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top;">
            <div style="font-weight:600;color:#171717;">${title}</div>
            ${description}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top;text-align:right;color:#171717;">
            ${escapeHtml(String(line.quantity || 0))} ${escapeHtml(line.unit || "")}
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top;text-align:right;color:#171717;">
            ${formatCurrency(line.unit_price)} kr
          </td>
          <td style="padding:12px;border-bottom:1px solid #e5e5e5;vertical-align:top;text-align:right;color:#171717;font-weight:600;">
            ${formatCurrency(line.line_total)} kr
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
      return NextResponse.json(
        { error: "Fant ikke faktura" },
        { status: 404 }
      );
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
      .select("company_name, contact_name, contact_phone")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      console.error("Feil ved henting av settings:", settingsError);
    }

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

    const companyName = String(settings?.company_name || "").trim() || "Tilbudsapp";
    const contactName = String(settings?.contact_name || "").trim();
    const contactPhone = String(settings?.contact_phone || "").trim();
    const invoiceTitle = String(invoice.title || "").trim() || "Faktura";
    const invoiceDescription = String(invoice.description || "").trim();
    const invoiceNumber = String(invoice.invoice_number || "").trim();
    const lines = (invoiceLines as InvoiceLine[] | null) || [];

    const subject = invoiceNumber
      ? `Faktura ${invoiceNumber} - ${invoiceTitle}`
      : `Faktura - ${invoiceTitle}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;color:#171717;line-height:1.6;">
        <h2 style="margin:0 0 8px 0;">${escapeHtml(companyName)}</h2>
        ${
          contactName
            ? `<p style="margin:0;color:#525252;">${escapeHtml(contactName)}</p>`
            : ""
        }
        ${
          contactPhone
            ? `<p style="margin:0;color:#525252;">${escapeHtml(contactPhone)}</p>`
            : ""
        }

        <div style="height:24px;"></div>

        <p>Hei ${escapeHtml(customer.name)},</p>

        <p>Her kommer fakturaen for utført arbeid.</p>

        <div style="border:1px solid #e5e5e5;border-radius:16px;padding:16px;background:#fafafa;">
          <p style="margin:0 0 8px 0;"><strong>${escapeHtml(invoiceTitle)}</strong></p>
          ${
            invoiceDescription
              ? `<p style="margin:0 0 8px 0;color:#525252;">${escapeHtml(
                  invoiceDescription
                )}</p>`
              : ""
          }
          ${
            invoiceNumber
              ? `<p style="margin:0;color:#525252;">Fakturanummer: ${escapeHtml(
                  invoiceNumber
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

        <p>Ta kontakt dersom du har spørsmål til fakturaen.</p>

        <p style="margin-top:24px;">
          Med vennlig hilsen<br/>
          ${escapeHtml(companyName)}<br/>
          ${contactName ? `${escapeHtml(contactName)}<br/>` : ""}
          ${contactPhone ? `${escapeHtml(contactPhone)}` : ""}
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

    const updatePayload =
      invoice.status === "paid"
        ? {}
        : {
            status: "sent",
            sent_at: invoice.sent_at || formatDateTimeIso(),
          };

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from("invoices")
        .update(updatePayload)
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