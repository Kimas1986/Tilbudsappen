import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PushEnableCard from "@/components/push-enable-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OfferRow = {
  id: string;
  title: string | null;
  total: number | null;
  status: string;
  description: string | null;
  created_at: string | null;
  valid_until: string | null;
  approved_at: string | null;
  customers:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total: number | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string | null;
};

function isExpired(validUntil: string | null) {
  if (!validUntil) return false;
  const date = new Date(validUntil);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
}

function getDisplayStatus(offer: OfferRow) {
  if (offer.status === "approved") return "approved";
  if (isExpired(offer.valid_until)) return "expired";
  return offer.status;
}

function isInvoiceOverdue(invoice: InvoiceRow) {
  if (invoice.status !== "sent") return false;
  if (!invoice.due_date) return false;

  const dueDate = new Date(invoice.due_date);
  if (Number.isNaN(dueDate.getTime())) return false;

  return dueDate.getTime() < Date.now();
}

function getInvoiceDisplayStatus(invoice: InvoiceRow) {
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "cancelled") return "cancelled";
  if (isInvoiceOverdue(invoice)) return "overdue";
  return invoice.status;
}

function getStatusLabel(status: string) {
  if (status === "approved") return "Godkjent";
  if (status === "draft") return "Utkast";
  if (status === "sent") return "Sendt";
  if (status === "rejected") return "Avslått";
  if (status === "expired") return "Utløpt";
  return status;
}

function getStatusClasses(status: string) {
  if (status === "approved") return "bg-green-100 text-green-800";
  if (status === "draft") return "bg-yellow-100 text-yellow-800";
  if (status === "sent") return "bg-blue-100 text-blue-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  if (status === "expired") return "bg-red-200 text-red-900";
  return "bg-neutral-100 text-neutral-800";
}

function getInvoiceStatusLabel(status: string) {
  if (status === "draft") return "Utkast";
  if (status === "sent") return "Sendt";
  if (status === "paid") return "Betalt";
  if (status === "overdue") return "Forfalt";
  if (status === "cancelled") return "Kreditert";
  return status;
}

function getCustomerName(offer: OfferRow) {
  if (Array.isArray(offer.customers)) {
    return offer.customers[0]?.name || "Uten kunde";
  }

  return offer.customers?.name || "Uten kunde";
}

function formatCurrency(value: number | null) {
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

function getStatusCount(offers: OfferRow[], status: string) {
  return offers.filter((offer) => getDisplayStatus(offer) === status).length;
}

function sumOfferValues(offers: OfferRow[], statuses?: string[]) {
  return offers.reduce((sum, offer) => {
    const displayStatus = getDisplayStatus(offer);

    if (statuses && !statuses.includes(displayStatus)) {
      return sum;
    }

    return sum + Number(offer.total || 0);
  }, 0);
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

function StatCard({
  label,
  value,
  subtext,
  tone = "neutral",
}: {
  label: string;
  value: string;
  subtext: string;
  tone?: "neutral" | "blue" | "green" | "yellow" | "orange" | "red";
}) {
  const toneClasses =
    tone === "blue"
      ? "text-blue-700"
      : tone === "green"
      ? "text-green-700"
      : tone === "yellow"
      ? "text-yellow-700"
      : tone === "orange"
      ? "text-orange-700"
      : tone === "red"
      ? "text-red-700"
      : "text-neutral-900";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClasses}`}>{value}</p>
      <p className="mt-2 text-sm text-neutral-500">{subtext}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("Feil ved henting av bruker på dashboard:", userError);
  }

  if (!user) {
    redirect("/login");
  }

  async function deleteOffer(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const offerId = String(formData.get("offerId") || "").trim();

    if (!offerId) {
      redirect("/dashboard");
    }

    await supabase
      .from("offers")
      .delete()
      .eq("id", offerId)
      .eq("user_id", user.id);

    redirect("/dashboard");
  }

  const [{ data: offers, error: offersError }, { data: invoices, error: invoicesError }] =
    await Promise.all([
      supabase
        .from("offers")
        .select(
          "id, title, total, status, description, created_at, valid_until, approved_at, customers(name)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("invoices")
        .select("id, invoice_number, status, total, due_date, paid_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  if (offersError) {
    console.error("Feil ved henting av tilbud:", offersError);
  }

  if (invoicesError) {
    console.error("Feil ved henting av fakturaer:", invoicesError);
  }

  const typedOffers = (offers as OfferRow[] | null) || [];
  const typedInvoices = ((invoices as InvoiceRow[] | null) || []).map((invoice) => ({
    ...invoice,
    displayStatus: getInvoiceDisplayStatus(invoice),
  }));

  const draftCount = getStatusCount(typedOffers, "draft");
  const sentCount = getStatusCount(typedOffers, "sent");
  const approvedCount = getStatusCount(typedOffers, "approved");
  const expiredCount = getStatusCount(typedOffers, "expired");

  const totalSentValue = sumOfferValues(typedOffers, ["sent"]);
  const totalApprovedValue = sumOfferValues(typedOffers, ["approved"]);
  const totalDraftValue = sumOfferValues(typedOffers, ["draft"]);

  const paidInvoiceValue = sumInvoiceValues(typedInvoices, ["paid"]);
  const sentInvoiceValue = sumInvoiceValues(typedInvoices, ["sent"]);
  const overdueInvoiceValue = sumInvoiceValues(typedInvoices, ["overdue"]);

  const paidInvoiceCount = typedInvoices.filter(
    (invoice) => invoice.displayStatus === "paid"
  ).length;
  const overdueInvoiceCount = typedInvoices.filter(
    (invoice) => invoice.displayStatus === "overdue"
  ).length;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Tilbudsapp</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                Dashboard
              </h1>
              <p className="mt-3 text-sm text-neutral-600 sm:text-base">
                Du er logget inn som:
              </p>
              <p className="mt-2 inline-flex max-w-full rounded-2xl bg-neutral-100 px-4 py-3 text-sm font-medium break-all sm:text-base">
                {user.email}
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-600">
                Her ser du status på tilbudene dine, hva som ligger ute akkurat nå
                og kan gå rett videre til tilbud, økonomi, fakturaer og materialer.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[420px]">
              <a
                href="/offers/new"
                className="rounded-2xl bg-black px-5 py-4 text-center text-sm font-medium text-white transition hover:opacity-90"
              >
                + Nytt tilbud
              </a>

              <a
                href="/economy"
                className="rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Økonomi
              </a>

              <a
                href="/materials"
                className="rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Materialdatabase
              </a>

              <a
                href="/invoices"
                className="rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Fakturaer
              </a>

              <a
                href="/settings"
                className="rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Innstillinger
              </a>

              <a
                href="/logout"
                className="rounded-2xl border border-neutral-300 bg-white px-5 py-4 text-center text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Logg ut
              </a>

              <PushEnableCard />
            </div>
          </div>

          <div className="mt-8 rounded-3xl bg-neutral-50 p-4 ring-1 ring-black/5 sm:p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Tilbud</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Oversikt over tilbud som ligger som utkast, sendt, godkjent og utløpt.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Utkast"
                value={String(draftCount)}
                subtext={`${formatCurrency(totalDraftValue)} kr i utkast`}
                tone="yellow"
              />
              <StatCard
                label="Sendt"
                value={String(sentCount)}
                subtext={`${formatCurrency(totalSentValue)} kr ute hos kunder`}
                tone="blue"
              />
              <StatCard
                label="Godkjent"
                value={String(approvedCount)}
                subtext={`${formatCurrency(totalApprovedValue)} kr godkjent`}
                tone="green"
              />
              <StatCard
                label="Utløpt"
                value={String(expiredCount)}
                subtext="Trenger oppfølging"
                tone="red"
              />
            </div>
          </div>

          <div className="mt-4 rounded-3xl bg-neutral-50 p-4 ring-1 ring-black/5 sm:p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Faktura</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Oversikt over betalt, utestående og forfalt.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Totalt fakturert"
                value={`${formatCurrency(paidInvoiceValue)} kr`}
                subtext={`${paidInvoiceCount} betalte fakturaer`}
                tone="green"
              />
              <StatCard
                label="Utestående"
                value={`${formatCurrency(sentInvoiceValue)} kr`}
                subtext="Sendt, men ikke betalt"
                tone="blue"
              />
              <StatCard
                label="Forfalt"
                value={`${formatCurrency(overdueInvoiceValue)} kr`}
                subtext={`${overdueInvoiceCount} forfalte fakturaer`}
                tone="orange"
              />
              <StatCard
                label="Fakturamodul"
                value={String(typedInvoices.length)}
                subtext="Totalt opprettede fakturaer"
                tone="neutral"
              />
            </div>
          </div>

          <div className="mt-8 sm:mt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Dine tilbud</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Kundenavn ligger øverst, med pris, dato, status og jobbtittel
                  under.
                </p>
              </div>
            </div>

            {typedOffers.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5 sm:p-6">
                <p className="text-sm text-neutral-500 sm:text-base">
                  Ingen tilbud enda.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {typedOffers.map((offer) => {
                  const displayStatus = getDisplayStatus(offer);

                  return (
                    <div
                      key={offer.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:bg-neutral-50"
                    >
                      <div className="flex flex-col gap-4">
                        <a
                          href={`/offers/${offer.id}`}
                          className="block min-w-0 rounded-xl"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold sm:text-lg">
                                {getCustomerName(offer)}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                                <span>{formatCurrency(offer.total)} kr</span>
                                <span className="hidden sm:inline">•</span>
                                <span>{formatDate(offer.created_at)}</span>
                                {offer.title ? (
                                  <>
                                    <span className="hidden sm:inline">•</span>
                                    <span className="max-w-full truncate">
                                      {offer.title}
                                    </span>
                                  </>
                                ) : null}
                              </div>

                              <p className="mt-2 text-sm text-neutral-500">
                                Gyldig til: {formatDate(offer.valid_until)}
                              </p>

                              {offer.description ? (
                                <p className="mt-2 line-clamp-2 text-sm text-neutral-500">
                                  {offer.description}
                                </p>
                              ) : null}
                            </div>

                            <span
                              className={`inline-flex self-start rounded-lg px-3 py-1 text-sm font-medium ${getStatusClasses(
                                displayStatus
                              )}`}
                            >
                              {getStatusLabel(displayStatus)}
                            </span>
                          </div>
                        </a>

                        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                          <a
                            href={`/offers/${offer.id}`}
                            className="inline-flex min-h-[44px] items-center rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                          >
                            Åpne
                          </a>

                          <form action={deleteOffer}>
                            <input type="hidden" name="offerId" value={offer.id} />
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
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-8 sm:mt-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Fakturastatus</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Rask oversikt over betalt, utestående og forfalt.
                </p>
              </div>

              <a
                href="/invoices"
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Åpne fakturaer
              </a>
            </div>

            {typedInvoices.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5 sm:p-6">
                <p className="text-sm text-neutral-500 sm:text-base">
                  Ingen fakturaer enda.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 sm:p-5">
                  <p className="text-sm text-neutral-500">Betalt</p>
                  <p className="mt-2 text-xl font-bold text-green-700">
                    {formatCurrency(paidInvoiceValue)} kr
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    {paidInvoiceCount} stk • {getInvoiceStatusLabel("paid")}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 sm:p-5">
                  <p className="text-sm text-neutral-500">Utestående</p>
                  <p className="mt-2 text-xl font-bold text-blue-700">
                    {formatCurrency(sentInvoiceValue)} kr
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Sendt til kunde
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 sm:p-5">
                  <p className="text-sm text-neutral-500">Forfalt</p>
                  <p className="mt-2 text-xl font-bold text-orange-700">
                    {formatCurrency(overdueInvoiceValue)} kr
                  </p>
                  <p className="mt-2 text-sm text-neutral-500">
                    {overdueInvoiceCount} stk • {getInvoiceStatusLabel("overdue")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}