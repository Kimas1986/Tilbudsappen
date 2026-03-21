import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  return new Date(value).toLocaleDateString("no-NO");
}

function getStatusCount(offers: OfferRow[], status: string) {
  return offers.filter((offer) => getDisplayStatus(offer) === status).length;
}

function sumOfferValues(
  offers: OfferRow[],
  statuses?: string[]
) {
  return offers.reduce((sum, offer) => {
    const displayStatus = getDisplayStatus(offer);

    if (statuses && !statuses.includes(displayStatus)) {
      return sum;
    }

    return sum + Number(offer.total || 0);
  }, 0);
}

function averageOfferValue(offers: OfferRow[]) {
  if (offers.length === 0) return 0;

  const total = offers.reduce((sum, offer) => sum + Number(offer.total || 0), 0);
  return Math.round(total / offers.length);
}

function calculateApprovalRate(offers: OfferRow[]) {
  const sentOrApproved = offers.filter((offer) => {
    const displayStatus = getDisplayStatus(offer);
    return displayStatus === "sent" || displayStatus === "approved";
  }).length;

  const approved = offers.filter(
    (offer) => getDisplayStatus(offer) === "approved"
  ).length;

  if (sentOrApproved === 0) {
    return 0;
  }

  return Math.round((approved / sentOrApproved) * 100);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { data: offers, error } = await supabase
    .from("offers")
    .select(
      "id, title, total, status, description, created_at, valid_until, approved_at, customers(name)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Feil ved henting av tilbud:", error);
  }

  const typedOffers = (offers as OfferRow[] | null) || [];

  const draftCount = getStatusCount(typedOffers, "draft");
  const sentCount = getStatusCount(typedOffers, "sent");
  const approvedCount = getStatusCount(typedOffers, "approved");
  const expiredCount = getStatusCount(typedOffers, "expired");

  const totalOfferCount = typedOffers.length;
  const totalValueAll = sumOfferValues(typedOffers);
  const totalSentValue = sumOfferValues(typedOffers, ["sent"]);
  const totalApprovedValue = sumOfferValues(typedOffers, ["approved"]);
  const totalDraftValue = sumOfferValues(typedOffers, ["draft"]);
  const approvalRate = calculateApprovalRate(typedOffers);
  const averageValue = averageOfferValue(typedOffers);

  const customerMap = new Map<
    string,
    {
      name: string;
      totalValue: number;
      approvedValue: number;
      offerCount: number;
    }
  >();

  for (const offer of typedOffers) {
    const name = getCustomerName(offer);
    const existing = customerMap.get(name) || {
      name,
      totalValue: 0,
      approvedValue: 0,
      offerCount: 0,
    };

    existing.totalValue += Number(offer.total || 0);
    existing.offerCount += 1;

    if (getDisplayStatus(offer) === "approved") {
      existing.approvedValue += Number(offer.total || 0);
    }

    customerMap.set(name, existing);
  }

  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 3);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Tilbudsapp</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                Dashboard
              </h1>
              <p className="mt-4 text-neutral-600">Du er logget inn som:</p>
              <p className="mt-2 inline-flex rounded-2xl bg-neutral-100 px-4 py-3 font-medium">
                {user.email}
              </p>
              <p className="mt-4 max-w-2xl text-sm text-neutral-600">
                Her ser du status på tilbudene dine, hva som ligger ute akkurat nå
                og hvilke kunder som betyr mest.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
              <a
                href="/offers/new"
                className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-medium text-white"
              >
                + Nytt tilbud
              </a>

              <a
                href="/economy"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Økonomi
              </a>

              <a
                href="/materials"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Materialdatabase
              </a>

              <a
                href="/settings"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Innstillinger
              </a>

              <a
                href="/logout"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900 sm:col-span-2"
              >
                Logg ut
              </a>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-yellow-50 p-5 ring-1 ring-yellow-100">
              <p className="text-sm text-yellow-800">Utkast</p>
              <p className="mt-2 text-2xl font-bold text-yellow-900">
                {draftCount}
              </p>
              <p className="mt-2 text-sm text-yellow-900/80">
                {formatCurrency(totalDraftValue)} kr i utkast
              </p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100">
              <p className="text-sm text-blue-800">Sendt</p>
              <p className="mt-2 text-2xl font-bold text-blue-900">
                {sentCount}
              </p>
              <p className="mt-2 text-sm text-blue-900/80">
                {formatCurrency(totalSentValue)} kr ute hos kunder
              </p>
            </div>

            <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100">
              <p className="text-sm text-green-800">Godkjent</p>
              <p className="mt-2 text-2xl font-bold text-green-900">
                {approvedCount}
              </p>
              <p className="mt-2 text-sm text-green-900/80">
                {formatCurrency(totalApprovedValue)} kr godkjent
              </p>
            </div>

            <div className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-100">
              <p className="text-sm text-red-800">Utløpt</p>
              <p className="mt-2 text-2xl font-bold text-red-900">
                {expiredCount}
              </p>
              <p className="mt-2 text-sm text-red-900/80">
                Trenger oppfølging
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Totalt antall tilbud</p>
              <p className="mt-2 text-2xl font-bold">{totalOfferCount}</p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Total tilbudsverdi</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(totalValueAll)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Godkjenningsrate</p>
              <p className="mt-2 text-2xl font-bold">{approvalRate} %</p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Snittpris</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(averageValue)} kr
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Topp kunder</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Hvem som har størst tilbudsverdi hos deg akkurat nå.
              </p>

              {topCustomers.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">Ingen kunder enda.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {topCustomers.map((customer) => (
                    <div
                      key={customer.name}
                      className="rounded-2xl bg-white p-4 ring-1 ring-black/5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{customer.name}</p>
                          <p className="mt-1 text-sm text-neutral-500">
                            {customer.offerCount} tilbud •{" "}
                            {formatCurrency(customer.approvedValue)} kr godkjent
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-neutral-500">Total verdi</p>
                          <p className="mt-1 font-bold">
                            {formatCurrency(customer.totalValue)} kr
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Snarveier</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Gå rett til det du bruker mest.
              </p>

              <div className="mt-4 grid gap-3">
                <a
                  href="/offers/new"
                  className="rounded-2xl bg-black px-4 py-3 text-center text-sm font-medium text-white"
                >
                  Lag nytt tilbud
                </a>

                <a
                  href="/economy"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                >
                  Åpne økonomi
                </a>

                <a
                  href="/materials"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                >
                  Åpne materialdatabase
                </a>

                <a
                  href="/settings"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                >
                  Åpne innstillinger
                </a>
              </div>
            </section>
          </div>

          <div className="mt-10">
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
              <div className="mt-4 rounded-2xl bg-neutral-50 p-6 ring-1 ring-black/5">
                <p className="text-neutral-500">Ingen tilbud enda.</p>
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
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <a href={`/offers/${offer.id}`} className="min-w-0 flex-1">
                          <p className="truncate text-lg font-semibold">
                            {getCustomerName(offer)}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                            <span>{formatCurrency(offer.total)} kr</span>
                            <span>•</span>
                            <span>{formatDate(offer.created_at)}</span>
                            {offer.title ? (
                              <>
                                <span>•</span>
                                <span className="truncate">{offer.title}</span>
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
                        </a>

                        <div className="flex flex-col items-start gap-3 lg:items-end">
                          <span
                            className={`rounded-lg px-3 py-1 text-sm font-medium ${getStatusClasses(
                              displayStatus
                            )}`}
                          >
                            {getStatusLabel(displayStatus)}
                          </span>

                          <div className="flex gap-2">
                            <a
                              href={`/offers/${offer.id}`}
                              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-900"
                            >
                              Åpne
                            </a>

                            <form action={deleteOffer}>
                              <input type="hidden" name="offerId" value={offer.id} />
                              <button
                                type="submit"
                                className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700"
                              >
                                Slett
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}