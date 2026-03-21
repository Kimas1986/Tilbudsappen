import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Offer = {
  id: string;
  status: string;
  total: number | null;
};

type MaterialLine = {
  line_total: number | null;
  unit_price: number | null;
  quantity: number | null;
  waste_percent: number | null;
  markup_percent: number | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function toNumber(v: number | null | undefined) {
  return Number(v || 0);
}

function getDisplayStatus(status: string) {
  if (status === "approved") return "approved";
  if (status === "sent") return "sent";
  if (status === "draft") return "draft";
  if (status === "rejected") return "rejected";
  return status;
}

function calculateCostPerUnit(item: MaterialLine) {
  const unit = toNumber(item.unit_price);
  const waste = toNumber(item.waste_percent);
  const markup = toNumber(item.markup_percent);

  const wasteFactor = 1 + waste / 100;
  const markupFactor = 1 + markup / 100;

  if (wasteFactor <= 0 || markupFactor <= 0) return unit;

  return unit / wasteFactor / markupFactor;
}

function calculateCostTotal(item: MaterialLine) {
  return calculateCostPerUnit(item) * toNumber(item.quantity);
}

export default async function EconomyPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: offers } = await supabase
    .from("offers")
    .select("id, status, total")
    .eq("user_id", user.id);

  const { data: materials } = await supabase
    .from("offer_materials")
    .select("line_total, unit_price, quantity, waste_percent, markup_percent")
    .eq("user_id", user.id);

  const typedOffers = (offers as Offer[]) || [];
  const typedMaterials = (materials as MaterialLine[]) || [];

  // ===== TOP CARDS =====
  const approved = typedOffers.filter((o) => getDisplayStatus(o.status) === "approved");
  const sent = typedOffers.filter((o) => getDisplayStatus(o.status) === "sent");

  const approvedValue = approved.reduce((sum, o) => sum + toNumber(o.total), 0);
  const sentValue = sent.reduce((sum, o) => sum + toNumber(o.total), 0);

  const approvalRate =
    typedOffers.length > 0
      ? Math.round((approved.length / typedOffers.length) * 100)
      : 0;

  // ===== PROFIT =====
  const materialsSales = typedMaterials.reduce(
    (sum, m) => sum + toNumber(m.line_total),
    0
  );

  const materialsCost = typedMaterials.reduce(
    (sum, m) => sum + calculateCostTotal(m),
    0
  );

  const profit = materialsSales - materialsCost;

  const margin =
    materialsSales > 0
      ? Math.round((profit / materialsSales) * 100)
      : 0;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">

          {/* HEADER */}
          <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Økonomi</h1>
              <p className="mt-2 text-neutral-500">
                Oversikt over hva du tjener og hva som er ute hos kunder.
              </p>
            </div>

            <div className="flex gap-3">
              <a href="/dashboard" className="rounded-2xl border px-4 py-2">
                Dashboard
              </a>
              <a href="/offers/new" className="rounded-2xl bg-black px-4 py-2 text-white">
                + Nytt tilbud
              </a>
            </div>
          </div>

          {/* TOP CARDS */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Omsetning (godkjent)" value={approvedValue} />
            <Card title="Ute hos kunde" value={sentValue} />
            <Card title="Fortjeneste (estimert)" value={profit} />
            <Card title="Godkjenningsrate" value={`${approvalRate} %`} />
          </div>

          {/* MID SECTION */}
          <div className="mt-10 grid gap-6 lg:grid-cols-2">

            {/* PIPELINE */}
            <div className="rounded-2xl bg-neutral-50 p-5">
              <h2 className="font-semibold">Pipeline</h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniCard
                  label="Utkast"
                  value={sumByStatus(typedOffers, "draft")}
                />
                <MiniCard
                  label="Sendt"
                  value={sumByStatus(typedOffers, "sent")}
                />
                <MiniCard
                  label="Godkjent"
                  value={sumByStatus(typedOffers, "approved")}
                />
                <MiniCard
                  label="Utløpt"
                  value={typedOffers.filter((o) => o.status === "expired").length}
                  isCount
                />
              </div>
            </div>

            {/* PROFIT */}
            <div className="rounded-2xl bg-green-50 p-5">
              <h2 className="font-semibold">Fortjeneste</h2>

              {materialsSales === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">
                  Ingen materialdata ennå. Legg inn materialer i tilbud for å se fortjeneste.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MiniCard label="Materialer ut" value={materialsSales} />
                  <MiniCard label="Kost" value={materialsCost} />
                  <MiniCard label="Fortjeneste" value={profit} />
                  <MiniCard label="Margin" value={`${margin} %`} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ===== COMPONENTS =====

function Card({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-neutral-100 p-5">
      <p className="text-sm text-neutral-500">{title}</p>
      <p className="mt-2 text-2xl font-bold">
        {typeof value === "number" ? `${formatCurrency(value)} kr` : value}
      </p>
    </div>
  );
}

function MiniCard({
  label,
  value,
  isCount,
}: {
  label: string;
  value: number;
  isCount?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 font-semibold">
        {isCount ? value : `${formatCurrency(value)} kr`}
      </p>
    </div>
  );
}

function sumByStatus(offers: Offer[], status: string) {
  return offers
    .filter((o) => o.status === status)
    .reduce((sum, o) => sum + toNumber(o.total), 0);
}