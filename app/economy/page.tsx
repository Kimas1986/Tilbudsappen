import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type OfferRow = {
  id: string;
  title: string | null;
  status: string;
  total: number | null;
  subtotal: number | null;
  vat_amount: number | null;
  materials_cost: number | null;
  fixed_price: number | null;
  hourly_rate: number | null;
  hours: number | null;
  valid_until: string | null;
  approved_at: string | null;
  created_at: string | null;
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
  line_total: number | null;
  quantity: number | null;
  unit_price: number | null;
  waste_percent: number | null;
  markup_percent: number | null;
};

function isExpired(validUntil: string | null) {
  if (!validUntil) return false;

  const date = new Date(validUntil);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getTime() < Date.now();
}

function getDisplayStatus(offer: OfferRow) {
  if (offer.status === "approved") return "approved";
  if (isExpired(offer.valid_until)) return "expired";
  return offer.status;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("no-NO");
  } catch {
    return "-";
  }
}

function toNumber(value: number | null | undefined) {
  return Number(value || 0);
}

function getCustomerName(offer: OfferRow) {
  if (Array.isArray(offer.customers)) {
    return offer.customers[0]?.name || "Uten kunde";
  }

  return offer.customers?.name || "Uten kunde";
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

export default async function EconomyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: offers, error: offersError }, { data: offerMaterials, error: materialsError }] =
    await Promise.all([
      supabase
        .from("offers")
        .select(
          "id, title, status, total, subtotal, vat_amount, materials_cost, fixed_price, hourly_rate, hours, valid_until, approved_at, created_at, customers(name)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("offer_materials")
        .select(
          "offer_id, line_total, quantity, unit_price, waste_percent, markup_percent"
        )
        .eq("user_id", user.id),
    ]);

  if (offersError) {
    console.error("Feil ved henting av tilbud:", offersError);
  }

  if (materialsError) {
    console.error("Feil ved henting av materiallinjer:", materialsError);
  }

  const typedOffers = (offers as OfferRow[] | null) || [];
  const typedOfferMaterials = (offerMaterials as OfferMaterialRow[] | null) || [];

  const offersWithDisplayStatus = typedOffers.map((offer) => ({
    ...offer,
    displayStatus: getDisplayStatus(offer),
  }));

  const totalOfferValue = offersWithDisplayStatus.reduce(
    (sum, offer) => sum + toNumber(offer.total),
    0
  );

  const approvedOffers = offersWithDisplayStatus.filter(
    (offer) => offer.displayStatus === "approved"
  );
  const sentOffers = offersWithDisplayStatus.filter(
    (offer) => offer.displayStatus === "sent"
  );
  const draftOffers = offersWithDisplayStatus.filter(
    (offer) => offer.displayStatus === "draft"
  );
  const expiredOffers = offersWithDisplayStatus.filter(
    (offer) => offer.displayStatus === "expired"
  );

  const approvedValue = approvedOffers.reduce(
    (sum, offer) => sum + toNumber(offer.total),
    0
  );
  const sentValue = sentOffers.reduce(
    (sum, offer) => sum + toNumber(offer.total),
    0
  );
  const draftValue = draftOffers.reduce(
    (sum, offer) => sum + toNumber(offer.total),
    0
  );

  const laborTotal = offersWithDisplayStatus.reduce((sum, offer) => {
    if (offer.fixed_price != null) {
      return sum + toNumber(offer.fixed_price);
    }

    return sum + toNumber(offer.hourly_rate) * toNumber(offer.hours);
  }, 0);

  const materialsTotal = offersWithDisplayStatus.reduce(
    (sum, offer) => sum + toNumber(offer.materials_cost),
    0
  );

  const approvedOfferIds = new Set(approvedOffers.map((offer) => offer.id));
  const sentOfferIds = new Set(sentOffers.map((offer) => offer.id));

  const approvedOfferMaterials = typedOfferMaterials.filter((item) =>
    approvedOfferIds.has(item.offer_id)
  );
  const sentOfferMaterials = typedOfferMaterials.filter((item) =>
    sentOfferIds.has(item.offer_id)
  );

  const approvedMaterialsOut = approvedOfferMaterials.reduce(
    (sum, item) => sum + toNumber(item.line_total),
    0
  );
  const approvedEstimatedMaterialCost = approvedOfferMaterials.reduce(
    (sum, item) => sum + calculateEstimatedCostTotal(item),
    0
  );
  const approvedEstimatedMaterialProfit =
    approvedMaterialsOut - approvedEstimatedMaterialCost;

  const sentMaterialsOut = sentOfferMaterials.reduce(
    (sum, item) => sum + toNumber(item.line_total),
    0
  );
  const sentEstimatedMaterialCost = sentOfferMaterials.reduce(
    (sum, item) => sum + calculateEstimatedCostTotal(item),
    0
  );
  const sentEstimatedMaterialProfit =
    sentMaterialsOut - sentEstimatedMaterialCost;

  const allMaterialsOut = typedOfferMaterials.reduce(
    (sum, item) => sum + toNumber(item.line_total),
    0
  );
  const allEstimatedMaterialCost = typedOfferMaterials.reduce(
    (sum, item) => sum + calculateEstimatedCostTotal(item),
    0
  );
  const allEstimatedMaterialProfit = allMaterialsOut - allEstimatedMaterialCost;

  const materialMarginPercent =
    allMaterialsOut > 0
      ? (allEstimatedMaterialProfit / allMaterialsOut) * 100
      : 0;

  const approvalBaseCount = approvedOffers.length + sentOffers.length;
  const approvalRate =
    approvalBaseCount > 0
      ? (approvedOffers.length / approvalBaseCount) * 100
      : 0;

  const averageApprovedValue =
    approvedOffers.length > 0 ? approvedValue / approvedOffers.length : 0;

  const customerMap = new Map<
    string,
    {
      name: string;
      totalValue: number;
      approvedValue: number;
      offerCount: number;
    }
  >();

  for (const offer of offersWithDisplayStatus) {
    const name = getCustomerName(offer);
    const existing = customerMap.get(name) || {
      name,
      totalValue: 0,
      approvedValue: 0,
      offerCount: 0,
    };

    existing.totalValue += toNumber(offer.total);
    existing.offerCount += 1;

    if (offer.displayStatus === "approved") {
      existing.approvedValue += toNumber(offer.total);
    }

    customerMap.set(name, existing);
  }

  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 5);

  const recentApproved = [...approvedOffers]
    .sort((a, b) => {
      const aTime = a.approved_at ? new Date(a.approved_at).getTime() : 0;
      const bTime = b.approved_at ? new Date(b.approved_at).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Tilbudsapp</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">Økonomi</h1>
              <p className="mt-4 text-sm text-neutral-600">
                Her ser du omsetning, pipeline, materialøkonomi og hvilke kunder
                som betyr mest akkurat nå.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Tilbake til dashboard
              </Link>

              <Link
                href="/offers/new"
                className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-medium text-white"
              >
                + Nytt tilbud
              </Link>

              <Link
                href="/materials"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Materialdatabase
              </Link>

              <Link
                href="/settings"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Innstillinger
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Total tilbudsverdi</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(totalOfferValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100">
              <p className="text-sm text-green-800">Godkjent verdi</p>
              <p className="mt-2 text-2xl font-bold text-green-900">
                {formatCurrency(approvedValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100">
              <p className="text-sm text-blue-800">Ute hos kunder</p>
              <p className="mt-2 text-2xl font-bold text-blue-900">
                {formatCurrency(sentValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-100">
              <p className="text-sm text-emerald-800">Estimert materialfortjeneste</p>
              <p className="mt-2 text-2xl font-bold text-emerald-900">
                {formatCurrency(allEstimatedMaterialProfit)} kr
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Godkjenningsrate</p>
              <p className="mt-2 text-2xl font-bold">
                {formatPercent(approvalRate)} %
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Materialmargin</p>
              <p className="mt-2 text-2xl font-bold">
                {formatPercent(materialMarginPercent)} %
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Snitt godkjent tilbud</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(averageApprovedValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Utløpte tilbud</p>
              <p className="mt-2 text-2xl font-bold">{expiredOffers.length}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Omsetning og pipeline</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Dette viser hvor mye som er landet, hva som ligger ute, og hva
                som fortsatt er i arbeid.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">Godkjent verdi</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(approvedValue)} kr
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {approvedOffers.length} tilbud er landet
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">Ute hos kunder</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(sentValue)} kr
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {sentOffers.length} tilbud venter svar
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">I utkast</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(draftValue)} kr
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {draftOffers.length} tilbud under arbeid
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">Arbeidsverdi total</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(laborTotal)} kr
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Fastpris/timearbeid ekskl. materialer
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100">
              <h2 className="text-lg font-semibold text-green-900">
                Intern fortjenesteoversikt
              </h2>
              <p className="mt-2 text-sm text-green-800">
                Dette bygger på materiallinjene dine og anslått kost basert på
                grunnpris, svinn og påslag.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">Materialer ut til kunde</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(allMaterialsOut)} kr
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">Anslått materialkost</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(allEstimatedMaterialCost)} kr
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">Anslått materialfortjeneste</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(allEstimatedMaterialProfit)} kr
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">Materialmargin</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatPercent(materialMarginPercent)} %
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">Fortjeneste i godkjente tilbud</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(approvedEstimatedMaterialProfit)} kr
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm text-neutral-500">Fortjeneste ute hos kunder</p>
                  <p className="mt-2 text-xl font-bold">
                    {formatCurrency(sentEstimatedMaterialProfit)} kr
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
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
              <h2 className="text-lg font-semibold">Sist godkjent</h2>
              <p className="mt-2 text-sm text-neutral-600">
                De nyeste tilbudene som faktisk er landet.
              </p>

              {recentApproved.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">
                  Ingen godkjente tilbud enda.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {recentApproved.map((offer) => (
                    <Link
                      key={offer.id}
                      href={`/offers/${offer.id}`}
                      className="block rounded-2xl bg-white p-4 ring-1 ring-black/5 transition hover:bg-neutral-50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{getCustomerName(offer)}</p>
                          <p className="mt-1 text-sm text-neutral-500">
                            {offer.title || "Tilbud"}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Godkjent {formatDate(offer.approved_at)}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-bold">
                            {formatCurrency(toNumber(offer.total))} kr
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}