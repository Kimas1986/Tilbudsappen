import Link from "next/link";
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
  if (status === "cancelled") return "Kreditert";
  return status;
}

function getInvoiceStatusClasses(status: string) {
  if (status === "draft") return "bg-yellow-100 text-yellow-800";
  if (status === "sent") return "bg-blue-100 text-blue-800";
  if (status === "paid") return "bg-green-100 text-green-800";
  if (status === "cancelled") return "bg-red-100 text-red-800";
  return "bg-neutral-100 text-neutral-800";
}

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

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

  async function markInvoiceSent() {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    await supabase
      .from("invoices")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    redirect(`/invoices/${id}?success=${encodeURIComponent("Faktura markert som sendt")}`);
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

    await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    redirect(`/invoices/${id}?success=${encodeURIComponent("Faktura markert som betalt")}`);
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

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const response = await fetch(`${baseUrl}/api/invoices/${id}/send`, {
      method: "POST",
      headers: {
        Cookie: "",
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

    redirect(`/invoices/${id}?success=${encodeURIComponent("Faktura sendt på e-post")}`);
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
      offer_id,
      customers(name, email, phone)
    `
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (invoiceError || !invoice) {
    notFound();
  }

  const { data: invoiceLines, error: linesError } = await supabase
    .from("invoice_lines")
    .select("id, title, description, quantity, unit, unit_price, line_total")
    .eq("invoice_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (linesError) {
    console.error("Feil ved henting av fakturalinjer:", linesError);
  }

  const typedInvoice = invoice as InvoiceRow;
  const typedLines = (invoiceLines as InvoiceLine[] | null) || [];
  const customer = getCustomerInfo(typedInvoice.customers || null);
  const hasCustomerEmail = Boolean(String(customer.email || "").trim());

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
                <Link
                  href="/dashboard"
                  className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900"
                >
                  Dashboard
                </Link>

                {typedInvoice.offer_id ? (
                  <Link
                    href={`/offers/${typedInvoice.offer_id}`}
                    className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900"
                  >
                    Tilbake til tilbud
                  </Link>
                ) : null}
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

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Fakturainnhold</h2>

              <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
                <p className="text-sm text-neutral-500">Beskrivelse</p>
                <p className="mt-2 whitespace-pre-wrap">
                  {typedInvoice.description || "-"}
                </p>
              </div>

              <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
                <p className="text-sm text-neutral-500">Kundeinfo</p>
                <p className="mt-2 font-medium">{customer.name}</p>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-500">
                  <span>E-post: {customer.email || "-"}</span>
                  <span>Telefon: {customer.phone || "-"}</span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Handlinger</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Første versjon: send faktura på e-post, eller marker den manuelt
                som sendt og betalt.
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

                <Link
                  href="/economy"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                >
                  Åpne økonomi
                </Link>
              </div>

              {!hasCustomerEmail ? (
                <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
                  Kunden mangler e-postadresse, så faktura kan ikke sendes enda.
                </div>
              ) : null}

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
                  Linjene som ligger til grunn for fakturaen.
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
              <div className="mt-4 space-y-3">
                {typedLines.map((line) => (
                  <div
                    key={line.id}
                    className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{line.title}</p>
                        {line.description ? (
                          <p className="mt-1 text-sm text-neutral-500">
                            {line.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="grid gap-2 text-sm sm:grid-cols-3 lg:w-[420px]">
                        <div className="rounded-xl bg-white p-3">
                          <p className="text-neutral-500">Antall</p>
                          <p className="mt-1 font-medium">
                            {formatNumber(line.quantity)} {line.unit || ""}
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-3">
                          <p className="text-neutral-500">Pris/enhet</p>
                          <p className="mt-1 font-medium">
                            {formatCurrency(line.unit_price)} kr
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-3">
                          <p className="text-neutral-500">Linjesum</p>
                          <p className="mt-1 font-medium">
                            {formatCurrency(line.line_total)} kr
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}