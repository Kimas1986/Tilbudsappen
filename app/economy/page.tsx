import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type OfferRow = {
  id: string;
  status: string;
  total: number | null;
  valid_until: string | null;
};

type InvoiceRow = {
  id: string;
  status: string;
  total: number | null;
  created_at: string | null;
  due_date: string | null;
  paid_at: string | null;
};

type InvoiceCustomerRelation =
  | {
      name: string | null;
    }
  | {
      name: string | null;
    }[]
  | null;

type RecentInvoiceRow = {
  id: string;
  title: string | null;
  status: string;
  total: number | null;
  created_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  customers?: InvoiceCustomerRelation;
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

function sumOfferValues(offers: OfferRow[]) {
  return offers.reduce((sum, offer) => sum + toNumber(offer.total), 0);
}

function sumInvoiceValues(invoices: InvoiceRow[]) {
  return invoices.reduce((sum, invoice) => sum + toNumber(invoice.total), 0);
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

function getCustomerName(customers: InvoiceCustomerRelation) {
  if (Array.isArray(customers)) {
    return customers[0]?.name || "Uten kunde";
  }

  return customers?.name || "Uten kunde";
}

function EconomyCard({
  title,
  value,
  accent = "neutral",
}: {
  title: string;
  value: string;
  accent?: "neutral" | "green" | "blue" | "emerald";
}) {
  const classes =
    accent === "green"
      ? "bg-green-50 ring-1 ring-green-100"
      : accent === "blue"
        ? "bg-blue-50 ring-1 ring-blue-100"
        : accent === "emerald"
          ? "bg-emerald-50 ring-1 ring-emerald-100"
          : "bg-neutral-100 ring-1 ring-black/5";

  const textClasses =
    accent === "green"
      ? "text-green-900"
      : accent === "blue"
        ? "text-blue-900"
        : accent === "emerald"
          ? "text-emerald-900"
          : "text-neutral-900";

  return (
    <div className={`rounded-2xl p-5 ${classes}`}>
      <p className="text-sm text-neutral-500">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${textClasses}`}>{value}</p>
    </div>
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

export default async function EconomyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: offers, error: offersError },
    { data: offerMaterials, error: materialsError },
    { data: invoices, error: invoicesError },
    { data: recentInvoices, error: recentInvoicesError },
  ] = await Promise.all([
    supabase
      .from("offers")
      .select("id, status, total, valid_until")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("offer_materials")
      .select(
        "offer_id, line_total, quantity, unit_price, waste_percent, markup_percent"
      )
      .eq("user_id", user.id),
    supabase
      .from("invoices")
      .select("id, status, total, created_at, due_date, paid_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("invoices")
      .select(
        `
        id,
        title,
        status,
        total,
        created_at,
        due_date,
        paid_at,
        customers(name)
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  if (offersError) {
    console.error("Feil ved henting av tilbud:", offersError);
  }

  if (materialsError) {
    console.error("Feil ved henting av materiallinjer:", materialsError);
  }

  if (invoicesError) {
    console.error("Feil ved henting av fakturaer:", invoicesError);
  }

  if (recentInvoicesError) {
    console.error("Feil ved henting av fakturaliste:", recentInvoicesError);
  }

  const typedOffers = (offers as OfferRow[] | null) || [];
  const typedOfferMaterials = (offerMaterials as OfferMaterialRow[] | null) || [];
  const typedInvoices = (invoices as InvoiceRow[] | null) || [];
  const typedRecentInvoices = (recentInvoices as RecentInvoiceRow[] | null) || [];

  const offersWithDisplayStatus = typedOffers.map((offer) => ({
    ...offer,
    displayStatus: getDisplayStatus(offer),
  }));

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

  const approvedValue = sumOfferValues(approvedOffers);
  const sentValue = sumOfferValues(sentOffers);
  const draftValue = sumOfferValues(draftOffers);

  const approvalBaseCount = approvedOffers.length + sentOffers.length;
  const approvalRate =
    approvalBaseCount > 0
      ? (approvedOffers.length / approvalBaseCount) * 100
      : 0;

  const approvedOfferIds = new Set(approvedOffers.map((offer) => offer.id));
  const approvedOfferMaterials = typedOfferMaterials.filter((item) =>
    approvedOfferIds.has(item.offer_id)
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

  const approvedMaterialMargin =
    approvedMaterialsOut > 0
      ? (approvedEstimatedMaterialProfit / approvedMaterialsOut) * 100
      : 0;

  const hasApprovedMaterialData = approvedOfferMaterials.length > 0;

  const paidInvoices = typedInvoices.filter((invoice) => invoice.status === "paid");
  const sentInvoices = typedInvoices.filter((invoice) => invoice.status === "sent");
  const draftInvoices = typedInvoices.filter((invoice) => invoice.status === "draft");

  const totalInvoicedValue = sumInvoiceValues(paidInvoices);
  const outstandingInvoiceValue = sumInvoiceValues(sentInvoices);
  const draftInvoiceValue = sumInvoiceValues(draftInvoices);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Tilbudsapp</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">Økonomi</h1>
              <p className="mt-4 text-sm text-neutral-600">
                Her ser du det viktigste: hva som er landet, hva som venter svar,
                hva som er fakturert, og hva du faktisk tjener på godkjente tilbud.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
              <Link
                href="/dashboard"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Dashboard
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
                href="/invoices"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Fakturaer
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <EconomyCard
              title="Omsetning (godkjent)"
              value={`${formatCurrency(approvedValue)} kr`}
              accent="green"
            />

            <EconomyCard
              title="Avventer svar"
              value={`${formatCurrency(sentValue)} kr`}
              accent="blue"
            />

            <EconomyCard
              title="Totalt fakturert"
              value={`${formatCurrency(totalInvoicedValue)} kr`}
              accent="neutral"
            />

            <EconomyCard
              title="Fortjeneste (estimert)"
              value={`${formatCurrency(approvedEstimatedMaterialProfit)} kr`}
              accent="emerald"
            />

            <EconomyCard
              title="Godkjenningsrate"
              value={`${formatPercent(approvalRate)} %`}
              accent="neutral"
            />
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Pipeline</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Dette viser hvor mye som fortsatt er i bevegelse.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <DetailCard
                  label="Utkast"
                  value={`${formatCurrency(draftValue)} kr`}
                />
                <DetailCard
                  label="Sendt til kunde"
                  value={`${formatCurrency(sentValue)} kr`}
                />
                <DetailCard
                  label="Godkjent"
                  value={`${formatCurrency(approvedValue)} kr`}
                />
                <DetailCard
                  label="Utløpte tilbud"
                  value={`${expiredOffers.length} stk`}
                />
              </div>
            </section>

            <section className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100">
              <h2 className="text-lg font-semibold text-green-900">
                Fortjeneste
              </h2>
              <p className="mt-2 text-sm text-green-800">
                Beregnes kun på godkjente tilbud og bare der materiallinjene gir
                grunnlag for kostberegning.
              </p>

              {hasApprovedMaterialData ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DetailCard
                    label="Materialer ut"
                    value={`${formatCurrency(approvedMaterialsOut)} kr`}
                  />
                  <DetailCard
                    label="Anslått materialkost"
                    value={`${formatCurrency(approvedEstimatedMaterialCost)} kr`}
                  />
                  <DetailCard
                    label="Estimert fortjeneste"
                    value={`${formatCurrency(approvedEstimatedMaterialProfit)} kr`}
                  />
                  <DetailCard
                    label="Margin"
                    value={`${formatPercent(approvedMaterialMargin)} %`}
                  />
                </div>
              ) : (
                <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-green-100">
                  <p className="text-sm text-neutral-700">
                    Ingen fortjenestedata å vise ennå. Dette kommer når godkjente
                    tilbud har materiallinjer med kostgrunnlag.
                  </p>
                </div>
              )}
            </section>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Fakturastatus</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Oversikt over hva som er sendt, betalt og fortsatt ligger som kladd.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <DetailCard
                  label="Totalt fakturert"
                  value={`${formatCurrency(totalInvoicedValue)} kr`}
                />
                <DetailCard
                  label="Utestående fakturaer"
                  value={`${formatCurrency(outstandingInvoiceValue)} kr`}
                />
                <DetailCard
                  label="Fakturakladder"
                  value={`${formatCurrency(draftInvoiceValue)} kr`}
                />
                <DetailCard
                  label="Betalte fakturaer"
                  value={`${paidInvoices.length} stk`}
                />
              </div>
            </section>

            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Siste fakturaer</h2>
                  <p className="mt-2 text-sm text-neutral-600">
                    Rask oversikt over de nyeste fakturaene dine.
                  </p>
                </div>

                <Link
                  href="/invoices"
                  className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900"
                >
                  Åpne alle
                </Link>
              </div>

              {typedRecentInvoices.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">
                    Ingen fakturaer enda.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {typedRecentInvoices.map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={`/invoices/${invoice.id}`}
                      className="block rounded-2xl bg-white p-4 ring-1 ring-black/5 transition hover:bg-neutral-50"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {getCustomerName(invoice.customers || null)}
                          </p>
                          <p className="mt-1 text-sm text-neutral-500">
                            {invoice.title || "Faktura"}
                          </p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Opprettet {formatDate(invoice.created_at)} • Forfall{" "}
                            {formatDate(invoice.due_date)}
                          </p>
                        </div>

                        <div className="flex flex-col items-start gap-2 sm:items-end">
                          <span
                            className={`rounded-lg px-3 py-1 text-xs font-medium ${getInvoiceStatusClasses(
                              invoice.status
                            )}`}
                          >
                            {getInvoiceStatusLabel(invoice.status)}
                          </span>

                          <p className="font-bold">
                            {formatCurrency(toNumber(invoice.total))} kr
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