import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type OfferRow = {
  id: string;
  title: string | null;
  total: number | null;
  subtotal: number | null;
  vat_amount: number | null;
  materials_cost: number | null;
  price_type: string | null;
  fixed_price: number | null;
  hourly_rate: number | null;
  hours: number | null;
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

type OfferMaterialRow = {
  offer_id: string;
  quantity: number | null;
  unit_price: number | null;
  waste_percent: number | null;
  markup_percent: number | null;
  line_total: number | null;
};

function toNumber(value: number | null | undefined) {
  return Number(value || 0);
}

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
  statuses?: string[],
  field:
    | "total"
    | "subtotal"
    | "vat_amount"
    | "materials_cost"
    | "fixed_price"
    | "hourly_rate"
    | "hours" = "total"
) {
  return offers.reduce((sum, offer) => {
    const displayStatus = getDisplayStatus(offer);

    if (statuses && !statuses.includes(displayStatus)) {
      return sum;
    }

    return sum + Number(offer[field] || 0);
  }, 0);
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

function averageOfferValue(offers: OfferRow[]) {
  if (offers.length === 0) return 0;

  const total = offers.reduce((sum, offer) => sum + Number(offer.total || 0), 0);
  return Math.round(total / offers.length);
}

function getOfferLaborValue(offer: OfferRow) {
  if (offer.price_type === "hourly") {
    return toNumber(offer.hourly_rate) * toNumber(offer.hours);
  }

  return toNumber(offer.fixed_price);
}

function calculateEstimatedCostPerUnit(item: OfferMaterialRow) {
  const unitPrice = toNumber(item.unit_price);
  const wastePercent = toNumber(item.waste_percent);
  const markupPercent = toNumber(item.markup_percent);

  const wasteFactor = 1 + wastePercent / 100;
  const markupFactor = 1 + markupPercent / 100;

  if (wasteFactor <= 0 || markupFactor <= 0) {
    return unitPrice;
  }

  return unitPrice / wasteFactor / markupFactor;
}

function calculateEstimatedCostTotal(item: OfferMaterialRow) {
  return calculateEstimatedCostPerUnit(item) * toNumber(item.quantity);
}

function groupMaterialMetricsByOffer(materials: OfferMaterialRow[]) {
  const result = new Map<
    string,
    {
      sales: number;
      estimatedCost: number;
      profit: number;
    }
  >();

  for (const item of materials) {
    const sales = toNumber(item.line_total);
    const estimatedCost = calculateEstimatedCostTotal(item);
    const profit = sales - estimatedCost;

    const existing = result.get(item.offer_id) || {
      sales: 0,
      estimatedCost: 0,
      profit: 0,
    };

    result.set(item.offer_id, {
      sales: existing.sales + sales,
      estimatedCost: existing.estimatedCost + estimatedCost,
      profit: existing.profit + profit,
    });
  }

  return result;
}

function getTopCustomerRows(offers: OfferRow[]) {
  const customerMap = new Map<
    string,
    {
      name: string;
      count: number;
      total: number;
      approvedTotal: number;
    }
  >();

  for (const offer of offers) {
    const name = getCustomerName(offer);
    const existing = customerMap.get(name) || {
      name,
      count: 0,
      total: 0,
      approvedTotal: 0,
    };

    existing.count += 1;
    existing.total += toNumber(offer.total);

    if (getDisplayStatus(offer) === "approved") {
      existing.approvedTotal += toNumber(offer.total);
    }

    customerMap.set(name, existing);
  }

  return Array.from(customerMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
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

  const [{ data: offers, error }, { data: offerMaterials, error: materialsError }] =
    await Promise.all([
      supabase
        .from("offers")
        .select(
          "id, title, total, subtotal, vat_amount, materials_cost, price_type, fixed_price, hourly_rate, hours, status, description, created_at, valid_until, approved_at, customers(name)"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("offer_materials")
        .select(
          "offer_id, quantity, unit_price, waste_percent, markup_percent, line_total"
        )
        .eq("user_id", user.id),
    ]);

  if (error) {
    console.error("Feil ved henting av tilbud:", error);
  }

  if (materialsError) {
    console.error("Feil ved henting av materiallinjer:", materialsError);
  }

  const typedOffers = (offers as OfferRow[] | null) || [];
  const typedOfferMaterials = (offerMaterials as OfferMaterialRow[] | null) || [];

  const materialMetricsByOffer = groupMaterialMetricsByOffer(typedOfferMaterials);

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

  const totalLaborValue = typedOffers.reduce(
    (sum, offer) => sum + getOfferLaborValue(offer),
    0
  );
  const totalMaterialsRevenue = typedOffers.reduce(
    (sum, offer) => sum + toNumber(offer.materials_cost),
    0
  );

  const totalEstimatedMaterialCost = Array.from(materialMetricsByOffer.values()).reduce(
    (sum, item) => sum + item.estimatedCost,
    0
  );
  const totalEstimatedMaterialProfit = Array.from(materialMetricsByOffer.values()).reduce(
    (sum, item) => sum + item.profit,
    0
  );
  const approvedEstimatedMaterialProfit = typedOffers.reduce((sum, offer) => {
    if (getDisplayStatus(offer) !== "approved") {
      return sum;
    }

    const metrics = materialMetricsByOffer.get(offer.id);
    return sum + (metrics?.profit || 0);
  }, 0);

  const sentEstimatedMaterialProfit = typedOffers.reduce((sum, offer) => {
    if (getDisplayStatus(offer) !== "sent") {
      return sum;
    }

    const metrics = materialMetricsByOffer.get(offer.id);
    return sum + (metrics?.profit || 0);
  }, 0);

  const materialMarginPercent =
    totalMaterialsRevenue > 0
      ? Math.round((totalEstimatedMaterialProfit / totalMaterialsRevenue) * 100)
      : 0;

  const topCustomers = getTopCustomerRows(typedOffers);

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
                Her ser du status på tilbudene dine, hvor mye som ligger ute,
                hva som er godkjent og hvordan materialøkonomien utvikler seg.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <a
                href="/offers/new"
                className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-medium text-white"
              >
                + Nytt tilbud
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
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
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

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Omsetning og pipeline</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Rask oversikt over hva som er ute, hva som er landet, og hva som
                fortsatt ligger i produksjon.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">Ute hos kunder</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(totalSentValue)} kr
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Tilbud sendt, ikke godkjent enda
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">Godkjent verdi</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(totalApprovedValue)} kr
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Tilbud som allerede er landet
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">Arbeidsverdi totalt</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(totalLaborValue)} kr
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Fastpris/timearbeid ekskl. materialer
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">Materialer totalt</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(totalMaterialsRevenue)} kr
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Sum materialkost ut mot kunde
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100">
              <h2 className="text-lg font-semibold text-green-900">
                Intern fortjenesteoversikt
              </h2>
              <p className="mt-2 text-sm text-green-800">
                Dette bygger på materiallinjene dine og anslått kost basert på
                grunnpris, svinn og påslag.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">
                    Materialer ut til kunde
                  </p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(totalMaterialsRevenue)} kr
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">Anslått materialkost</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(totalEstimatedMaterialCost)} kr
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">
                    Anslått materialfortjeneste
                  </p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(totalEstimatedMaterialProfit)} kr
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">Materialmargin</p>
                  <p className="mt-2 text-xl font-bold">
                    {materialMarginPercent} %
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">
                    Fortjeneste i godkjente tilbud
                  </p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(approvedEstimatedMaterialProfit)} kr
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">
                    Fortjeneste ute hos kunder
                  </p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(sentEstimatedMaterialProfit)} kr
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_0.75fr]">
            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Topp kunder</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Hvem som har størst tilbudsverdi hos deg akkurat nå.
              </p>

              {topCustomers.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">
                  Ingen kundedata enda.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {topCustomers.map((customer, index) => (
                    <div
                      key={`${customer.name}-${index}`}
                      className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-black/5"
                    >
                      <div>
                        <p className="font-medium">{customer.name}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          {customer.count} tilbud •{" "}
                          {formatCurrency(customer.approvedTotal)} kr godkjent
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm text-neutral-500">Total verdi</p>
                        <p className="mt-1 font-bold">
                          {formatCurrency(customer.total)} kr
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
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
            </div>
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
                  const materialMetrics = materialMetricsByOffer.get(offer.id);
                  const offerMaterialProfit = materialMetrics?.profit || 0;

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

                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                              Materialer: {formatCurrency(offer.materials_cost)} kr
                            </span>

                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                              Anslått materialfortjeneste:{" "}
                              {formatCurrency(offerMaterialProfit)} kr
                            </span>
                          </div>
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