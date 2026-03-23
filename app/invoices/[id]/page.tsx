import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type InvoiceLine = {
  id: string;
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
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

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  title: string | null;
  description: string | null;
  status: string;
  subtotal: number | null;
  vat_amount: number | null;
  total: number | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  offer_id: string | null;
  customers?: CustomerRelation;
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

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("no-NO");
  } catch {
    return "-";
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("no-NO");
  } catch {
    return "-";
  }
}

function getCustomerInfo(customers: CustomerRelation) {
  const customer = Array.isArray(customers) ? customers[0] : customers;

  return {
    name: customer?.name || "Uten kunde",
    email: customer?.email || null,
    phone: customer?.phone || null,
  };
}

function getInvoiceStatusLabel(status: string) {
  if (status === "draft") return "Utkast";
  if (status === "sent") return "Sendt";
  if (status === "paid") return "Betalt";
  if (status === "overdue") return "Forfalt";
  if (status === "cancelled") return "Kreditert";
  return status;
}

function getInvoiceStatusClasses(status: string) {
  if (status === "draft") return "bg-yellow-100 text-yellow-800";
  if (status === "sent") return "bg-blue-100 text-blue-800";
  if (status === "paid") return "bg-green-100 text-green-800";
  if (status === "overdue") return "bg-orange-100 text-orange-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-neutral-100 text-neutral-800";
}

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
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

function getCompanyLines(settings: SettingsRow | null) {
  const lines: string[] = [];

  if (settings?.company_name) lines.push(settings.company_name);
  if (settings?.company_address) lines.push(settings.company_address);

  const postcode = String(settings?.company_postcode || "").trim();
  const city = String(settings?.company_city || "").trim();
  const cityLine = [postcode, city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);

  return lines;
}

async function recalculateInvoiceTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  userId: string
) {
  const { data: invoiceForVat, error: invoiceForVatError } = await supabase
    .from("invoices")
    .select("subtotal, vat_amount")
    .eq("id", invoiceId)
    .eq("user_id", userId)
    .single();

  if (invoiceForVatError || !invoiceForVat) {
    throw new Error("Kunne ikke hente faktura for MVA-beregning.");
  }

  const oldSubtotal = toNumber(invoiceForVat.subtotal);
  const oldVatAmount = toNumber(invoiceForVat.vat_amount);
  const vatRate =
    oldSubtotal !== 0 && oldVatAmount !== 0 ? oldVatAmount / oldSubtotal : 0;

  const { data: lines, error: linesError } = await supabase
    .from("invoice_lines")
    .select("quantity, unit_price, line_total")
    .eq("invoice_id", invoiceId)
    .eq("user_id", userId);

  if (linesError) {
    throw new Error("Kunne ikke hente fakturalinjer for summering.");
  }

  const subtotal = round2(
    (lines || []).reduce((sum, line) => {
      const explicitLineTotal = Number(line.line_total);
      if (Number.isFinite(explicitLineTotal)) {
        return sum + explicitLineTotal;
      }

      return sum + toNumber(line.quantity) * toNumber(line.unit_price);
    }, 0)
  );

  const vatAmount = round2(subtotal * vatRate);
  const total = round2(subtotal + vatAmount);

  const { error: updateInvoiceError } = await supabase
    .from("invoices")
    .update({
      subtotal,
      vat_amount: vatAmount,
      total,
    })
    .eq("id", invoiceId)
    .eq("user_id", userId);

  if (updateInvoiceError) {
    throw new Error("Kunne ikke oppdatere summer på faktura.");
  }
}

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const errorMessage = String(resolvedSearchParams?.error || "").trim();
  const successMessage = String(resolvedSearchParams?.success || "").trim();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  async function updateInvoiceHeader(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const dueDateRaw = String(formData.get("due_date") || "").trim();

    if (!title) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Fakturatittel må fylles ut")}`
      );
    }

    const updatePayload: {
      title: string;
      description: string | null;
      due_date: string | null;
    } = {
      title,
      description: description || null,
      due_date: dueDateRaw
        ? new Date(`${dueDateRaw}T12:00:00`).toISOString()
        : null,
    };

    const { error } = await supabase
      .from("invoices")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Kunne ikke oppdatere fakturahodet")}`
      );
    }

    redirect(
      `/invoices/${id}?success=${encodeURIComponent("Fakturahodet ble oppdatert")}`
    );
  }

  async function updateInvoiceLine(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const lineId = String(formData.get("line_id") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const quantity = toNumber(formData.get("quantity"));
    const unit = String(formData.get("unit") || "").trim();
    const unitPrice = toNumber(formData.get("unit_price"));
    const lineTotal = round2(quantity * unitPrice);

    if (!lineId) {
      redirect(`/invoices/${id}?error=${encodeURIComponent("Mangler linje-ID")}`);
    }

    if (!title) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Linjetittel må fylles ut")}`
      );
    }

    const { error } = await supabase
      .from("invoice_lines")
      .update({
        title,
        description: description || null,
        quantity,
        unit: unit || null,
        unit_price: unitPrice,
        line_total: lineTotal,
      })
      .eq("id", lineId)
      .eq("invoice_id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Kunne ikke oppdatere fakturalinjen")}`
      );
    }

    try {
      await recalculateInvoiceTotals(supabase, id, user.id);
    } catch {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Linjen ble lagret, men summer kunne ikke oppdateres")}`
      );
    }

    redirect(
      `/invoices/${id}?success=${encodeURIComponent("Fakturalinje oppdatert")}`
    );
  }

  async function addInvoiceLine(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const quantity = toNumber(formData.get("quantity"));
    const unit = String(formData.get("unit") || "").trim();
    const unitPrice = toNumber(formData.get("unit_price"));

    if (!title) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Ny linje må ha en tittel")}`
      );
    }

    const safeQuantity = Number.isFinite(quantity) ? quantity : 0;

    const { error } = await supabase.from("invoice_lines").insert({
      invoice_id: id,
      user_id: user.id,
      line_type: "item",
      title,
      description: description || null,
      quantity: safeQuantity,
      unit: unit || "stk",
      unit_price: unitPrice,
      line_total: round2(safeQuantity * unitPrice),
    });

    if (error) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Kunne ikke legge til fakturalinje")}`
      );
    }

    try {
      await recalculateInvoiceTotals(supabase, id, user.id);
    } catch {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Linjen ble lagt til, men summer kunne ikke oppdateres")}`
      );
    }

    redirect(
      `/invoices/${id}?success=${encodeURIComponent("Ny fakturalinje lagt til")}`
    );
  }

  async function deleteInvoiceLine(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const lineId = String(formData.get("line_id") || "").trim();

    if (!lineId) {
      redirect(`/invoices/${id}?error=${encodeURIComponent("Mangler linje-ID")}`);
    }

    const { error } = await supabase
      .from("invoice_lines")
      .delete()
      .eq("id", lineId)
      .eq("invoice_id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Kunne ikke slette fakturalinje")}`
      );
    }

    try {
      await recalculateInvoiceTotals(supabase, id, user.id);
    } catch {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Linjen ble slettet, men summer kunne ikke oppdateres")}`
      );
    }

    redirect(
      `/invoices/${id}?success=${encodeURIComponent("Fakturalinje slettet")}`
    );
  }

  async function markInvoiceSent() {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Kunne ikke markere faktura som sendt")}`
      );
    }

    redirect(
      `/invoices/${id}?success=${encodeURIComponent("Faktura markert som sendt")}`
    );
  }

  async function markInvoicePaid() {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      redirect(
        `/invoices/${id}?error=${encodeURIComponent("Kunne ikke markere faktura som betalt")}`
      );
    }

    redirect(
      `/invoices/${id}?success=${encodeURIComponent("Faktura markert som betalt")}`
    );
  }

  async function sendInvoiceEmail() {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const response = await fetch(`${baseUrl}/api/invoices/${id}/send`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const error =
        typeof data?.error === "string"
          ? data.error
          : "Kunne ikke sende faktura";
      redirect(`/invoices/${id}?error=${encodeURIComponent(error)}`);
    }

    redirect(
      `/invoices/${id}?success=${encodeURIComponent("Faktura sendt på e-post")}`
    );
  }

  const [
    { data: invoice, error: invoiceError },
    { data: invoiceLines, error: linesError },
    { data: settings, error: settingsError },
  ] = await Promise.all([
    supabase
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
        offer_id,
        customers(name, email, phone)
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("invoice_lines")
      .select("id, title, description, quantity, unit, unit_price, line_total")
      .eq("invoice_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_settings")
      .select(
        "company_name, company_email, contact_name, contact_phone, company_address, company_postcode, company_city, org_number, bank_account, iban, bic"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (invoiceError || !invoice) {
    notFound();
  }

  if (linesError) {
    console.error("Feil ved henting av fakturalinjer:", linesError);
  }

  if (settingsError) {
    console.error("Feil ved henting av firmainnstillinger:", settingsError);
  }

  const typedInvoice = invoice as InvoiceRow;
  const typedLines = (invoiceLines as InvoiceLine[] | null) || [];
  const typedSettings = (settings as SettingsRow | null) || null;
  const customer = getCustomerInfo(typedInvoice.customers || null);
  const hasCustomerEmail = Boolean(String(customer.email || "").trim());
  const companyLines = getCompanyLines(typedSettings);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 border-b border-neutral-200 pb-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Faktura</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                {typedInvoice.title || "Faktura"}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <span>Opprettet {formatDateTime(typedInvoice.created_at)}</span>
                <span>•</span>
                <span>Forfall {formatDate(typedInvoice.due_date)}</span>
                {typedInvoice.invoice_number ? (
                  <>
                    <span>•</span>
                    <span>Nr. {typedInvoice.invoice_number}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <span
                className={`w-fit rounded-lg px-3 py-1 text-sm font-medium ${getInvoiceStatusClasses(
                  typedInvoice.status
                )}`}
              >
                {getInvoiceStatusLabel(typedInvoice.status)}
              </span>

              <div className="flex flex-wrap gap-2">
                <a
                  href="/dashboard"
                  className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900"
                >
                  Dashboard
                </a>

                {typedInvoice.offer_id ? (
                  <a
                    href={`/offers/${typedInvoice.offer_id}`}
                    className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900"
                  >
                    Tilbake til tilbud
                  </a>
                ) : null}

                <a
                  href={`/api/invoices/${typedInvoice.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900"
                >
                  Åpne PDF
                </a>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {successMessage}
            </div>
          ) : null}

          <section className="mt-8 rounded-3xl border border-neutral-200 bg-neutral-50 p-6">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Fra
                </p>

                <div className="mt-3 space-y-1 text-sm text-neutral-700">
                  <p className="text-lg font-semibold text-neutral-900">
                    {typedSettings?.company_name || "Firmanavn mangler"}
                  </p>

                  {companyLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}

                  {typedSettings?.company_email ? (
                    <p>E-post: {typedSettings.company_email}</p>
                  ) : null}

                  {typedSettings?.contact_name ? (
                    <p>Kontakt: {typedSettings.contact_name}</p>
                  ) : null}

                  {typedSettings?.contact_phone ? (
                    <p>Telefon: {typedSettings.contact_phone}</p>
                  ) : null}

                  {typedSettings?.org_number ? (
                    <p>Org.nr: {formatOrgNumber(typedSettings.org_number)}</p>
                  ) : null}

                  {typedSettings?.bank_account ? (
                    <p>Konto: {formatBankAccount(typedSettings.bank_account)}</p>
                  ) : null}

                  {typedSettings?.iban ? <p>IBAN: {typedSettings.iban}</p> : null}
                  {typedSettings?.bic ? <p>BIC: {typedSettings.bic}</p> : null}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Til
                </p>

                <div className="mt-3 space-y-1 text-sm text-neutral-700">
                  <p className="text-lg font-semibold text-neutral-900">
                    {customer.name}
                  </p>
                  <p>E-post: {customer.email || "-"}</p>
                  <p>Telefon: {customer.phone || "-"}</p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Fakturanummer
                    </p>
                    <p className="mt-2 font-semibold text-neutral-900">
                      {typedInvoice.invoice_number || "-"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-neutral-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Forfall
                    </p>
                    <p className="mt-2 font-semibold text-neutral-900">
                      {formatDate(typedInvoice.due_date)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Kunde</p>
              <p className="mt-2 text-lg font-bold">{customer.name}</p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Subtotal</p>
              <p className="mt-2 text-lg font-bold">
                {formatCurrency(typedInvoice.subtotal)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">MVA</p>
              <p className="mt-2 text-lg font-bold">
                {formatCurrency(typedInvoice.vat_amount)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100">
              <p className="text-sm text-green-800">Totalt</p>
              <p className="mt-2 text-2xl font-bold text-green-900">
                {formatCurrency(typedInvoice.total)} kr
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Fakturahode</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Her kan du justere tittelen, beskrivelsen og forfallsdatoen før
                sending.
              </p>

              <form action={updateInvoiceHeader} className="mt-4 space-y-4">
                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <label className="block text-sm font-medium text-neutral-700">
                    Fakturatittel
                  </label>
                  <input
                    name="title"
                    defaultValue={typedInvoice.title || ""}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                    placeholder="F.eks. Faktura - bad renovering"
                  />
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <label className="block text-sm font-medium text-neutral-700">
                    Beskrivelse / kommentar
                  </label>
                  <textarea
                    name="description"
                    rows={6}
                    defaultValue={typedInvoice.description || ""}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                    placeholder="F.eks. Tilleggsarbeid utført etter avtale med kunde..."
                  />
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <label className="block text-sm font-medium text-neutral-700">
                    Forfallsdato
                  </label>
                  <input
                    type="date"
                    name="due_date"
                    defaultValue={toDateInputValue(typedInvoice.due_date)}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white"
                >
                  Lagre fakturahode
                </button>
              </form>

              {!typedSettings?.org_number || !typedSettings?.bank_account ? (
                <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
                  Organisasjonsnummer eller kontonummer mangler i innstillinger.
                  Fyll dette inn før du sender faktura til kunde.
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Handlinger</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Rediger fakturaen ferdig først, og send den deretter til kunden.
              </p>

              <div className="mt-4 grid gap-3">
                <form action={sendInvoiceEmail}>
                  <button
                    type="submit"
                    disabled={!hasCustomerEmail}
                    className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send faktura på e-post
                  </button>
                </form>

                <a
                  href={`/api/invoices/${typedInvoice.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full rounded-2xl bg-black px-4 py-3 text-center text-sm font-medium text-white"
                >
                  Åpne PDF
                </a>

                <form action={markInvoiceSent}>
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white"
                  >
                    Marker som sendt
                  </button>
                </form>

                <form action={markInvoicePaid}>
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-green-600 px-4 py-3 text-center text-sm font-medium text-white"
                  >
                    Marker som betalt
                  </button>
                </form>

                <a
                  href="/economy"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                >
                  Åpne økonomi
                </a>
              </div>

              {!hasCustomerEmail ? (
                <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
                  Kunden mangler e-postadresse, så faktura kan ikke sendes enda.
                </div>
              ) : null}

              <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-900">Praktisk flyt</p>
                <p className="mt-1 text-sm text-blue-800">
                  Du kan bruke negative tall på antall eller pris for fratrekk,
                  prisavslag eller kreditering av deler av jobben.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-sm text-neutral-500">Statushistorikk</p>
                <div className="mt-3 space-y-2 text-sm text-neutral-600">
                  <p>Opprettet: {formatDateTime(typedInvoice.created_at)}</p>
                  <p>Sendt: {formatDateTime(typedInvoice.sent_at)}</p>
                  <p>Betalt: {formatDateTime(typedInvoice.paid_at)}</p>
                </div>
              </div>
            </section>
          </div>

          <section className="mt-8 rounded-2xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">Fakturalinjer</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Her kan du redigere eksisterende linjer, slette dem eller legge
                  til nye.
                </p>
              </div>

              <div className="rounded-xl bg-neutral-100 px-3 py-2 text-sm font-medium">
                {typedLines.length} linjer
              </div>
            </div>

            {typedLines.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-500">
                Ingen fakturalinjer på denne fakturaen.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {typedLines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5"
                  >
                    <form action={updateInvoiceLine} className="space-y-4">
                      <input type="hidden" name="line_id" value={line.id} />

                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-neutral-700">
                            Linjetittel
                          </label>
                          <input
                            name="title"
                            defaultValue={line.title}
                            className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                            placeholder="F.eks. Ekstra materialer"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700">
                            Kommentar / beskrivelse
                          </label>
                          <input
                            name="description"
                            defaultValue={line.description || ""}
                            className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                            placeholder="F.eks. Ekstraarbeid etter avtale"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <label className="block text-sm font-medium text-neutral-700">
                            Antall
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            name="quantity"
                            defaultValue={line.quantity ?? 1}
                            className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700">
                            Enhet
                          </label>
                          <input
                            name="unit"
                            defaultValue={line.unit || ""}
                            className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                            placeholder="stk"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700">
                            Pris per enhet
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            name="unit_price"
                            defaultValue={line.unit_price ?? 0}
                            className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                          />
                        </div>

                        <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                          <p className="text-sm text-neutral-500">Nåværende linjesum</p>
                          <p className="mt-1 text-lg font-bold">
                            {formatCurrency(line.line_total)} kr
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Oppdateres ved lagring
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="submit"
                          className="rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
                        >
                          Lagre linje
                        </button>
                      </div>
                    </form>

                    <form action={deleteInvoiceLine} className="mt-3">
                      <input type="hidden" name="line_id" value={line.id} />
                      <button
                        type="submit"
                        className="rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700"
                      >
                        Slett linje
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="text-lg font-semibold text-emerald-900">Legg til ny linje</h2>
            <p className="mt-1 text-sm text-emerald-800">
              Bruk denne for tilleggsarbeid, ekstra materialer eller fratrekk.
            </p>

            <form action={addInvoiceLine} className="mt-4 space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-emerald-900">
                    Linjetittel
                  </label>
                  <input
                    name="title"
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                    placeholder="F.eks. Tilleggsarbeid"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-emerald-900">
                    Kommentar / beskrivelse
                  </label>
                  <input
                    name="description"
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                    placeholder="F.eks. Utført etter avtale med kunde"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-sm font-medium text-emerald-900">
                    Antall
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="quantity"
                    defaultValue={1}
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-emerald-900">
                    Enhet
                  </label>
                  <input
                    name="unit"
                    defaultValue="stk"
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-emerald-900">
                    Pris per enhet
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="unit_price"
                    defaultValue={0}
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                  />
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-emerald-100">
                  <p className="text-sm text-emerald-800">Summer</p>
                  <p className="mt-1 text-sm text-emerald-900">
                    Regnes automatisk når linjen lagres
                  </p>
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-medium text-white"
              >
                Legg til fakturalinje
              </button>
            </form>
          </section>

          <section className="mt-8 rounded-2xl bg-neutral-100 p-5">
            <h2 className="text-lg font-semibold">Prisoppsummering</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">Subtotal</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(typedInvoice.subtotal)} kr
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">MVA</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(typedInvoice.vat_amount)} kr
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">Totalt</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(typedInvoice.total)} kr
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}