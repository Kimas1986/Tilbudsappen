import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type CustomerRelation =
  | {
      name: string | null;
      email?: string | null;
    }
  | {
      name: string | null;
      email?: string | null;
    }[]
  | null;

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  title: string | null;
  status: string;
  total: number | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  customers?: CustomerRelation;
};

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
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

function isOverdue(invoice: InvoiceRow) {
  if (invoice.status !== "sent") return false;
  if (!invoice.due_date) return false;

  const dueDate = new Date(invoice.due_date);
  if (Number.isNaN(dueDate.getTime())) return false;

  return dueDate.getTime() < Date.now();
}

function getDisplayStatus(invoice: InvoiceRow) {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "cancelled") return "cancelled";
  if (isOverdue(invoice)) return "overdue";
  return invoice.status;
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

function getCustomerName(customers: CustomerRelation) {
  if (Array.isArray(customers)) {
    return customers[0]?.name || "Uten kunde";
  }

  return customers?.name || "Uten kunde";
}

function getStatusCount(
  invoices: Array<InvoiceRow & { displayStatus: string }>,
  status: string
) {
  return invoices.filter((invoice) => invoice.displayStatus === status).length;
}

function sumInvoiceValues(
  invoices: Array<InvoiceRow & { displayStatus: string }>,
  statuses?: string[]
) {
  return invoices.reduce((sum, invoice) => {
    if (statuses && !statuses.includes(invoice.displayStatus)) {
      return sum;
    }

    return sum + Number(invoice.total || 0);
  }, 0);
}

export default async function InvoicesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  async function deleteInvoice(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const invoiceId = String(formData.get("invoiceId") || "").trim();

    if (!invoiceId) {
      redirect("/invoices");
    }

    await supabase
      .from("invoices")
      .delete()
      .eq("id", invoiceId)
      .eq("user_id", user.id);

    redirect("/invoices");
  }

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      title,
      status,
      total,
      due_date,
      sent_at,
      paid_at,
      created_at,
      customers(name, email)
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Feil ved henting av fakturaer:", error);
  }

  const typedInvoices = ((invoices as InvoiceRow[] | null) || []).map((invoice) => ({
    ...invoice,
    displayStatus: getDisplayStatus(invoice),
  }));

  const draftCount = getStatusCount(typedInvoices, "draft");
  const sentCount = getStatusCount(typedInvoices, "sent");
  const paidCount = getStatusCount(typedInvoices, "paid");
  const overdueCount = getStatusCount(typedInvoices, "overdue");

  const draftValue = sumInvoiceValues(typedInvoices, ["draft"]);
  const sentValue = sumInvoiceValues(typedInvoices, ["sent"]);
  const paidValue = sumInvoiceValues(typedInvoices, ["paid"]);
  const overdueValue = sumInvoiceValues(typedInvoices, ["overdue"]);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Tilbudsapp</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                Fakturaer
              </h1>
              <p className="mt-3 text-sm leading-6 text-neutral-600">
                Her ser du alle fakturaene dine, hva som er utkast, sendt, betalt
                og hva som nå er forfalt.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[420px]">
              <a
                href="/dashboard"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Dashboard
              </a>

              <a
                href="/economy"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Økonomi
              </a>

              <a
                href="/offers/new"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-black px-5 py-3 text-center text-sm font-medium text-white transition hover:opacity-90"
              >
                + Nytt tilbud
              </a>

              <a
                href="/materials"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Materialdatabase
              </a>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-yellow-50 p-4 ring-1 ring-yellow-100 sm:p-5">
              <p className="text-sm text-yellow-800">Utkast</p>
              <p className="mt-2 text-2xl font-bold text-yellow-900">
                {draftCount}
              </p>
              <p className="mt-2 text-sm text-yellow-900/80">
                {formatCurrency(draftValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100 sm:p-5">
              <p className="text-sm text-blue-800">Sendt</p>
              <p className="mt-2 text-2xl font-bold text-blue-900">
                {sentCount}
              </p>
              <p className="mt-2 text-sm text-blue-900/80">
                {formatCurrency(sentValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-100 sm:p-5">
              <p className="text-sm text-orange-800">Forfalt</p>
              <p className="mt-2 text-2xl font-bold text-orange-900">
                {overdueCount}
              </p>
              <p className="mt-2 text-sm text-orange-900/80">
                {formatCurrency(overdueValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-green-50 p-4 ring-1 ring-green-100 sm:p-5">
              <p className="text-sm text-green-800">Betalt</p>
              <p className="mt-2 text-2xl font-bold text-green-900">
                {paidCount}
              </p>
              <p className="mt-2 text-sm text-green-900/80">
                {formatCurrency(paidValue)} kr
              </p>
            </div>
          </div>

          <div className="mt-8 sm:mt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Fakturaliste</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Kundenavn øverst, med fakturanummer, tittel, status og beløp under.
                </p>
              </div>
            </div>

            {typedInvoices.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5 sm:p-6">
                <p className="text-sm text-neutral-500 sm:text-base">
                  Ingen fakturaer enda.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {typedInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:bg-neutral-50"
                  >
                    <div className="flex flex-col gap-4">
                      <a
                        href={`/invoices/${invoice.id}`}
                        className="block min-w-0 rounded-xl"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-semibold sm:text-lg">
                              {getCustomerName(invoice.customers || null)}
                            </p>

                            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                              {invoice.invoice_number ? (
                                <>
                                  <span>Nr. {invoice.invoice_number}</span>
                                  <span className="hidden sm:inline">•</span>
                                </>
                              ) : null}

                              <span>{formatCurrency(invoice.total)} kr</span>
                              <span className="hidden sm:inline">•</span>
                              <span>{formatDate(invoice.created_at)}</span>

                              {invoice.title ? (
                                <>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="max-w-full truncate">
                                    {invoice.title}
                                  </span>
                                </>
                              ) : null}
                            </div>

                            <p className="mt-2 text-sm text-neutral-500">
                              Forfall: {formatDate(invoice.due_date)}
                            </p>

                            {invoice.sent_at ? (
                              <p className="mt-1 text-sm text-neutral-500">
                                Sendt: {formatDate(invoice.sent_at)}
                              </p>
                            ) : null}

                            {invoice.paid_at ? (
                              <p className="mt-1 text-sm text-green-700">
                                Betalt: {formatDate(invoice.paid_at)}
                              </p>
                            ) : null}
                          </div>

                          <span
                            className={`inline-flex self-start rounded-lg px-3 py-1 text-sm font-medium ${getInvoiceStatusClasses(
                              invoice.displayStatus
                            )}`}
                          >
                            {getInvoiceStatusLabel(invoice.displayStatus)}
                          </span>
                        </div>
                      </a>

                      <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                        <a
                          href={`/invoices/${invoice.id}`}
                          className="inline-flex min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                        >
                          Åpne
                        </a>

                        <form action={deleteInvoice}>
                          <input
                            type="hidden"
                            name="invoiceId"
                            value={invoice.id}
                          />
                          <button
                            type="submit"
                            className="inline-flex min-h-[44px] items-center rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-200"
                          >
                            Slett
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}