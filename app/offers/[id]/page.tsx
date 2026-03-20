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

function getStatusLabel(status: string) {
  if (status === "approved") return "Godkjent";
  if (status === "draft") return "Utkast";
  if (status === "sent") return "Sendt";
  if (status === "rejected") return "Avslått";
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

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
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
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !offer) {
    notFound();
  }

  const { data: offerMaterials, error: offerMaterialsError } = await supabase
    .from("offer_materials")
    .select(
      "id, material_name, supplier, unit, quantity, unit_price, waste_percent, markup_percent, line_total"
    )
    .eq("offer_id", offer.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (offerMaterialsError) {
    console.error("Feil ved henting av materiallinjer:", offerMaterialsError);
  }

  const materials = (offerMaterials as OfferMaterial[] | null) || [];

  const estimatedCostTotal = materials.reduce(
    (sum, item) => sum + calculateEstimatedCostTotal(item),
    0
  );

  const materialsSalesTotal = materials.reduce(
    (sum, item) => sum + toNumber(item.line_total),
    0
  );

  const estimatedMaterialsProfit = materialsSalesTotal - estimatedCostTotal;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = `${baseUrl}/t/${offer.share_token}`;
  const pdfUrl = `/api/offers/${offer.id}/pdf`;
  const sendUrl = `/api/offers/${offer.id}/send`;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">{offer.title || "Tilbud"}</h1>

              <p className="mt-2 text-sm text-neutral-500">
                Opprettet{" "}
                {offer.created_at
                  ? new Date(offer.created_at).toLocaleString("no-NO")
                  : "-"}
              </p>

              <p className="mt-1 text-sm text-neutral-500">
                Gyldig til {formatDate(offer.valid_until)}
              </p>
            </div>

            <span
              className={`w-fit rounded-lg px-3 py-1 text-sm font-medium ${getStatusClasses(
                offer.status
              )}`}
            >
              {getStatusLabel(offer.status)}
            </span>
          </div>

          <div className="mt-6">
            <p className="text-sm text-neutral-500">Beskrivelse</p>
            <p className="mt-1 whitespace-pre-wrap">{offer.description || "-"}</p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-neutral-100 p-4">
              <p className="text-sm text-neutral-500">Prisform</p>
              <p className="mt-1 font-medium">
                {offer.price_type === "fixed" ? "Fastpris" : "Timepris"}
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-100 p-4">
              <p className="text-sm text-neutral-500">MVA</p>
              <p className="mt-1 font-medium">
                {offer.vat_enabled ? "Ja" : "Nei"}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
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
                              {item.quantity || 0} {item.unit || "stk"}
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
          </div>

          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4">
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
          </div>

          <div className="mt-6 space-y-2 rounded-2xl bg-neutral-100 p-4">
            <p>Subtotal: {formatCurrency(offer.subtotal)} kr</p>
            <p>MVA: {formatCurrency(offer.vat_amount)} kr</p>
            <p className="text-lg font-bold">
              Totalt: {formatCurrency(offer.total)} kr
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-neutral-900 px-4 py-2 text-center text-white"
            >
              Åpne PDF
            </a>

            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-neutral-300 px-4 py-2 text-center"
            >
              Last ned PDF
            </a>

            <form action={sendUrl} method="post">
              <button
                type="submit"
                className="w-full rounded-2xl bg-blue-600 px-4 py-2 text-center text-white sm:w-auto"
              >
                Send tilbud på e-post
              </button>
            </form>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
            <p className="text-sm text-neutral-500">Kundelenke</p>

            <p className="mt-2 break-all rounded-xl bg-neutral-100 px-3 py-2 text-sm">
              {publicUrl}
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href={publicUrl}
                className="rounded-2xl bg-black px-4 py-2 text-center text-white"
              >
                Åpne kundelenke
              </Link>

              <CopyLinkButton url={publicUrl} offerId={offer.id} />

              <Link
                href="/dashboard"
                className="rounded-2xl border border-neutral-300 px-4 py-2 text-center"
              >
                Tilbake
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}