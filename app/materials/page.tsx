import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Material = {
  id: string;
  supplier: string | null;
  sku: string | null;
  name: string;
  unit: string;
  base_price: number;
  waste_percent: number;
  markup_percent: number;
  pricing_mode: string;
  created_at: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function calculateSuggestedPrice(material: Material) {
  const base = Number(material.base_price || 0);
  const waste = Number(material.waste_percent || 0);
  const markup = Number(material.markup_percent || 0);

  const withWaste = base * (1 + waste / 100);
  const finalPrice = withWaste * (1 + markup / 100);

  return finalPrice;
}

export default async function MaterialsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  async function createMaterial(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const supplier = String(formData.get("supplier") || "").trim();
    const sku = String(formData.get("sku") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const unit = String(formData.get("unit") || "stk").trim();
    const pricingMode = String(formData.get("pricing_mode") || "markup").trim();

    const basePrice = Number(formData.get("base_price") || 0);
    const wastePercent = Number(formData.get("waste_percent") || 0);
    const markupPercent = Number(formData.get("markup_percent") || 0);

    if (!name) {
      redirect("/materials");
    }

    const { error } = await supabase.from("materials").insert({
      user_id: user.id,
      supplier: supplier || null,
      sku: sku || null,
      name,
      unit,
      base_price: Number.isFinite(basePrice) ? basePrice : 0,
      waste_percent: Number.isFinite(wastePercent) ? wastePercent : 0,
      markup_percent: Number.isFinite(markupPercent) ? markupPercent : 0,
      pricing_mode: pricingMode || "markup",
      last_updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Feil ved opprettelse av materiale:", error);
    }

    redirect("/materials");
  }

  async function deleteMaterial(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const materialId = String(formData.get("materialId") || "").trim();

    if (!materialId) {
      redirect("/materials");
    }

    const { error } = await supabase
      .from("materials")
      .delete()
      .eq("id", materialId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Feil ved sletting av materiale:", error);
    }

    redirect("/materials");
  }

  const { data: materials, error } = await supabase
    .from("materials")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Feil ved henting av materialer:", error);
  }

  const typedMaterials = (materials as Material[] | null) || [];

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
            <div>
              <h1 className="text-2xl font-bold">Materialdatabase</h1>
              <p className="mt-2 text-sm text-neutral-500">
                Legg inn egne materialer og priser. Dette blir grunnlaget for
                smartere tilbud senere.
              </p>
            </div>

            <form action={createMaterial} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium">Navn</label>
                <input
                  name="name"
                  className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  placeholder="F.eks. Gipsplate 13x1200x2400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Leverandør</label>
                <input
                  name="supplier"
                  className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  placeholder="F.eks. Monter"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Varenummer</label>
                <input
                  name="sku"
                  className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  placeholder="F.eks. 12345678"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Enhet</label>
                  <select
                    name="unit"
                    defaultValue="stk"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  >
                    <option value="stk">stk</option>
                    <option value="m">m</option>
                    <option value="m2">m²</option>
                    <option value="m3">m³</option>
                    <option value="pakke">pakke</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium">Prislogikk</label>
                  <select
                    name="pricing_mode"
                    defaultValue="markup"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  >
                    <option value="markup">Kost + påslag</option>
                    <option value="market">Markedspris</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium">Grunnpris</label>
                <input
                  name="base_price"
                  type="number"
                  step="0.01"
                  className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  placeholder="F.eks. 129"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Svinn %</label>
                  <input
                    name="waste_percent"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Påslag %</label>
                  <input
                    name="markup_percent"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-black px-4 py-4 text-white"
              >
                Lagre materiale
              </button>
            </form>
          </section>

          <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Dine materialer</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Egen prisbank for tilbud.
                </p>
              </div>

              <a
                href="/dashboard"
                className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium"
              >
                Tilbake
              </a>
            </div>

            {typedMaterials.length === 0 ? (
              <p className="mt-6 text-neutral-500">Ingen materialer enda.</p>
            ) : (
              <div className="mt-6 space-y-3">
                {typedMaterials.map((material) => (
                  <div
                    key={material.id}
                    className="rounded-2xl border border-neutral-200 p-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium">{material.name}</p>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                          <span>{material.supplier || "Ukjent leverandør"}</span>
                          <span>•</span>
                          <span>{material.unit}</span>
                          {material.sku ? (
                            <>
                              <span>•</span>
                              <span>Vnr: {material.sku}</span>
                            </>
                          ) : null}
                        </div>

                        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                          <div className="rounded-xl bg-neutral-50 p-3">
                            <p className="text-neutral-500">Grunnpris</p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(material.base_price)} kr
                            </p>
                          </div>

                          <div className="rounded-xl bg-neutral-50 p-3">
                            <p className="text-neutral-500">Svinn</p>
                            <p className="mt-1 font-medium">
                              {material.waste_percent} %
                            </p>
                          </div>

                          <div className="rounded-xl bg-neutral-50 p-3">
                            <p className="text-neutral-500">Påslag</p>
                            <p className="mt-1 font-medium">
                              {material.markup_percent} %
                            </p>
                          </div>

                          <div className="rounded-xl bg-neutral-50 p-3">
                            <p className="text-neutral-500">Anslått salgspris</p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(calculateSuggestedPrice(material))} kr
                            </p>
                          </div>
                        </div>
                      </div>

                      <form action={deleteMaterial}>
                        <input
                          type="hidden"
                          name="materialId"
                          value={material.id}
                        />
                        <button
                          type="submit"
                          className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700"
                        >
                          Slett
                        </button>
                      </form>
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