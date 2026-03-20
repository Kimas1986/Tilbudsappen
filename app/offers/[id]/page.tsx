import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import CopyLinkButton from "@/components/copy-link-button";
import { createClient } from "@/lib/supabase/server";

type OfferMaterial = {
  id: string;
  material_name: string | null;
  supplier: string | null;
  unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  waste_percent: number | null;
  markup_percent: number | null;
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

type OfferRow = {
  id: string;
  title: string | null;
  description: string | null;
  status: string;
  created_at: string | null;
  valid_until: string | null;
  approved_at: string | null;
  share_token: string | null;
  price_type: string | null;
  fixed_price: number | null;
  hourly_rate: number | null;
  hours: number | null;
  materials_cost: number | null;
  vat_enabled: boolean | null;
  vat_amount: number | null;
  subtotal: number | null;
  total: number | null;
  customers?: CustomerRelation;
};

function isExpired(validUntil: string | null) {
  if (!validUntil) return false;

  try {
    const date = new Date(validUntil);
    if (Number.isNaN(date.getTime())) return false;
    return date.getTime() < Date.now();
  } catch {
    return false;
  }
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
  if (status === "approved") {
    return "bg-green-100 text-green-800";
  }

  if (status === "draft") {
    return "bg-yellow-100 text-yellow-800";
  }

  if (status === "sent") {
    return "bg-blue-100 text-blue-800";
  }

  if (status === "rejected") {
    return "bg-red-100 text-red-800";
  }

  if (status === "expired") {
    return "bg-red-200 text-red-900";
  }

  return "bg-neutral-100 text-neutral-800";
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

function toNumber(value: number | null | undefined) {
  return Number(value || 0);
}

function calculateEstimatedCostPerUnit(item: OfferMaterial) {
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

function calculateEstimatedCostTotal(item: OfferMaterial) {
  return calculateEstimatedCostPerUnit(item) * toNumber(item.quantity);
}

function getCustomerInfo(customers: CustomerRelation) {
  const customer = Array.isArray(customers) ? customers[0] : customers;

  return {
    name: customer?.name || "Uten kunde",
    email: customer?.email || null,
    phone: customer?.phone || null,
  };
}

export default async function OfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: offer, error } = await supabase
    .from("offers")
    .select(
      `
      id,
      title,
      description,
      status,
      created_at,
      valid_until,
      approved_at,
      share_token,
      price_type,
      fixed_price,
      hourly_rate,
      hours,
      materials_cost,
      vat_enabled,
      vat_amount,
      subtotal,
      total,
      customers(name, email, phone)
    `
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !offer) {
    notFound();
  }

  const typedOffer = offer as OfferRow;

  const { data: offerMaterials, error: offerMaterialsError } = await supabase
    .from("offer_materials")
    .select(
      "id, material_name, supplier, unit, quantity, unit_price, waste_percent, markup_percent, line_total"
    )
    .eq("offer_id", typedOffer.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (offerMaterialsError) {
    console.error("Feil ved henting av materiallinjer:", offerMaterialsError);
  }

  const materials = (offerMaterials as OfferMaterial[] | null) || [];
  const displayStatus = getDisplayStatus(typedOffer);
  const customer = getCustomerInfo(typedOffer.customers || null);

  const estimatedCostTotal = materials.reduce(
    (sum, item) => sum + calculateEstimatedCostTotal(item),
    0
  );

  const materialsSalesTotal = materials.reduce(
    (sum, item) => sum + toNumber(item.line_total),
    0
  );

  const estimatedMaterialsProfit = materialsSalesTotal - estimatedCostTotal;
  const laborValue =
    typedOffer.price_type === "hourly"
      ? toNumber(typedOffer.hourly_rate) * toNumber(typedOffer.hours)
      : toNumber(typedOffer.fixed_price);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = typedOffer.share_token
    ? `${baseUrl}/t/${typedOffer.share_token}`
    : "";
  const pdfUrl = `/api/offers/${typedOffer.id}/pdf`;
  const sendUrl = `/api/offers/${typedOffer.id}/send`;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Tilbud</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                {typedOffer.title || "Tilbud"}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <span>Opprettet {formatDateTime(typedOffer.created_at)}</span>
                <span>•</span>
                <span>Gyldig til {formatDate(typedOffer.valid_until)}</span>
                {typedOffer.approved_at ? (
                  <>
                    <span>•</span>
                    <span>Godkjent {formatDateTime(typedOffer.approved_at)}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <span
                className={`w-fit rounded-lg px-3 py-1 text-sm font-medium ${getStatusClasses(
                  displayStatus
                )}`}
              >
                {getStatusLabel(displayStatus)}
              </span>

              <Link
                href="/dashboard"
                className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900"
              >
                Tilbake til dashboard
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-4">
            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Totalpris</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(typedOffer.total)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Arbeid</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(laborValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Materialer</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(typedOffer.materials_cost)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">MVA</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(typedOffer.vat_amount)} kr
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Tilbudsinnhold</h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">Prisform</p>
                  <p className="mt-1 font-medium">
                    {typedOffer.price_type === "fixed" ? "Fastpris" : "Timepris"}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <p className="text-sm text-neutral-500">MVA aktivert</p>
                  <p className="mt-1 font-medium">
                    {typedOffer.vat_enabled ? "Ja" : "Nei"}
                  </p>
                </div>

                {typedOffer.price_type === "fixed" ? (
                  <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                    <p className="text-sm text-neutral-500">Fastpris</p>
                    <p className="mt-1 font-medium">
                      {formatCurrency(typedOffer.fixed_price)} kr
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                      <p className="text-sm text-neutral-500">Timepris</p>
                      <p className="mt-1 font-medium">
                        {formatCurrency(typedOffer.hourly_rate)} kr
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                      <p className="text-sm text-neutral-500">Timer</p>
                      <p className="mt-1 font-medium">
                        {formatNumber(typedOffer.hours)}
                      </p>
                    </div>
                  </>
                )}

                <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 sm:col-span-2">
                  <p className="text-sm text-neutral-500">Kunde</p>
                  <p className="mt-1 font-medium">{customer.name}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-neutral-500">
                    <span>E-post: {customer.email || "-"}</span>
                    <span>Telefon: {customer.phone || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-black/5">
                <p className="text-sm text-neutral-500">Beskrivelse</p>
                <p className="mt-2 whitespace-pre-wrap">
                  {typedOffer.description || "-"}
                </p>
              </div>
            </section>

            <section className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">Handlinger</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Herfra kan du åpne PDF, sende e-post og dele kundelenken.
              </p>

              <div className="mt-4 grid gap-3">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white"
                >
                  Åpne PDF
                </a>

                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                >
                  Last ned PDF
                </a>

                <form action={sendUrl} method="post">
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white"
                  >
                    Send tilbud på e-post
                  </button>
                </form>
              </div>

              <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-sm text-neutral-500">Kundelenke</p>

                <p className="mt-2 break-all rounded-xl bg-neutral-100 px-3 py-2 text-sm">
                  {publicUrl || "Mangler delingslenke"}
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  {publicUrl ? (
                    <>
                      <Link
                        href={publicUrl}
                        className="rounded-2xl bg-black px-4 py-3 text-center text-sm font-medium text-white"
                      >
                        Åpne kundelenke
                      </Link>

                      <CopyLinkButton url={publicUrl} offerId={typedOffer.id} />
                    </>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <section className="mt-8 rounded-2xl border border-neutral-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">Materialer</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Materialer som er lagt inn på tilbudet.
                </p>
              </div>

              <div className="rounded-xl bg-neutral-100 px-3 py-2 text-sm font-medium">
                {materials.length} linjer
              </div>
            </div>

            {materials.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-500">
                Ingen materialer lagt inn på dette tilbudet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {materials.map((item) => {
                  const estimatedCostPerUnit = calculateEstimatedCostPerUnit(item);
                  const estimatedCostLine = calculateEstimatedCostTotal(item);
                  const salesLine = toNumber(item.line_total);
                  const lineProfit = salesLine - estimatedCostLine;

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {item.material_name || "Materiale"}
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                            <span>{item.supplier || "Ukjent leverandør"}</span>
                            <span>•</span>
                            <span>{item.unit || "stk"}</span>
                          </div>
                        </div>

                        <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
                          <div className="rounded-xl bg-white p-3">
                            <p className="text-neutral-500">Antall</p>
                            <p className="mt-1 font-medium">
                              {formatNumber(item.quantity)} {item.unit || "stk"}
                            </p>
                          </div>

                          <div className="rounded-xl bg-white p-3">
                            <p className="text-neutral-500">Salgspris/enhet</p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(item.unit_price)} kr
                            </p>
                          </div>

                          <div className="rounded-xl bg-white p-3">
                            <p className="text-neutral-500">Anslått kost/enhet</p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(estimatedCostPerUnit)} kr
                            </p>
                          </div>

                          <div className="rounded-xl bg-white p-3">
                            <p className="text-neutral-500">Linjesum</p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(item.line_total)} kr
                            </p>
                          </div>

                          <div className="rounded-xl bg-white p-3">
                            <p className="text-neutral-500">Anslått kost total</p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(estimatedCostLine)} kr
                            </p>
                          </div>

                          <div className="rounded-xl bg-white p-3">
                            <p className="text-neutral-500">Fortjeneste</p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(lineProfit)} kr
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5">
            <p className="text-lg font-semibold text-green-900">
              Intern materialøkonomi
            </p>
            <p className="mt-1 text-sm text-green-800">
              Kun synlig for deg. Vises ikke til kunde eller i PDF.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">Materialer ut</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(materialsSalesTotal)} kr
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">Anslått kost</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(estimatedCostTotal)} kr
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">Anslått fortjeneste</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(estimatedMaterialsProfit)} kr
                </p>
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-2xl bg-neutral-100 p-5">
            <h2 className="text-lg font-semibold">Prisoppsummering</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">Subtotal</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(typedOffer.subtotal)} kr
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">MVA</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(typedOffer.vat_amount)} kr
                </p>
              </div>

              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm text-neutral-500">Totalt</p>
                <p className="mt-1 text-lg font-bold">
                  {formatCurrency(typedOffer.total)} kr
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}