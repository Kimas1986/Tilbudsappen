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

type MaterialTemplate = {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
};

type MaterialTemplateItem = {
  id: string;
  template_id: string;
  material_id: string;
  quantity: number | null;
  materials:
    | {
        id: string;
        name: string;
        supplier: string | null;
        unit: string;
        base_price: number;
        waste_percent: number;
        markup_percent: number;
      }
    | {
        id: string;
        name: string;
        supplier: string | null;
        unit: string;
        base_price: number;
        waste_percent: number;
        markup_percent: number;
      }[]
    | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
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

function calculateSuggestedPrice(material: Material) {
  const base = Number(material.base_price || 0);
  const waste = Number(material.waste_percent || 0);
  const markup = Number(material.markup_percent || 0);

  const withWaste = base * (1 + waste / 100);
  const finalPrice = withWaste * (1 + markup / 100);

  return finalPrice;
}

function getTemplateMaterial(
  item: MaterialTemplateItem
):
  | {
      id: string;
      name: string;
      supplier: string | null;
      unit: string;
      base_price: number;
      waste_percent: number;
      markup_percent: number;
    }
  | null {
  if (Array.isArray(item.materials)) {
    return item.materials[0] || null;
  }

  return item.materials || null;
}

type SearchParams = Promise<{
  error?: string;
}>;

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const errorMessage = String(resolvedSearchParams?.error || "").trim();

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
      redirect("/materials?error=Mangler+navn+p%C3%A5+materiale");
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
      redirect("/materials?error=Kunne+ikke+lagre+materiale");
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
      redirect("/materials?error=Mangler+materiale+som+skal+slettes");
    }

    const { error } = await supabase
      .from("materials")
      .delete()
      .eq("id", materialId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Feil ved sletting av materiale:", error);
      redirect("/materials?error=Kunne+ikke+slette+materiale");
    }

    redirect("/materials");
  }

  async function createTemplate(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const name = String(formData.get("template_name") || "").trim();
    const description = String(formData.get("template_description") || "").trim();

    if (!name) {
      redirect("/materials?error=Mangler+navn+p%C3%A5+materialmal");
    }

    const { error } = await supabase.from("material_templates").insert({
      user_id: user.id,
      name,
      description: description || null,
    });

    if (error) {
      console.error("Feil ved opprettelse av materialmal:", error);
      redirect("/materials?error=Kunne+ikke+lagre+materialmal");
    }

    redirect("/materials");
  }

  async function deleteTemplate(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const templateId = String(formData.get("templateId") || "").trim();

    if (!templateId) {
      redirect("/materials?error=Mangler+materialmal+som+skal+slettes");
    }

    const { error } = await supabase
      .from("material_templates")
      .delete()
      .eq("id", templateId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Feil ved sletting av materialmal:", error);
      redirect("/materials?error=Kunne+ikke+slette+materialmal");
    }

    redirect("/materials");
  }

  async function addTemplateItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const templateId = String(formData.get("templateId") || "").trim();
    const materialId = String(formData.get("materialId") || "").trim();
    const quantity = Number(formData.get("quantity") || 1);

    if (!templateId) {
      redirect("/materials?error=Mangler+materialmal");
    }

    if (!materialId) {
      redirect("/materials?error=Velg+et+materiale+f%C3%B8rst");
    }

    const safeQuantity =
      Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

    const { data: existingItem, error: existingItemError } = await supabase
      .from("material_template_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("template_id", templateId)
      .eq("material_id", materialId)
      .maybeSingle();

    if (existingItemError) {
      console.error("Feil ved sjekk av eksisterende mallinje:", existingItemError);
      redirect("/materials?error=Kunne+ikke+sjekke+materialmal");
    }

    if (existingItem?.id) {
      redirect("/materials?error=Dette+materialet+finnes+allerede+i+denne+malen");
    }

    const { error } = await supabase.from("material_template_items").insert({
      template_id: templateId,
      user_id: user.id,
      material_id: materialId,
      quantity: safeQuantity,
    });

    if (error) {
      console.error("Feil ved opprettelse av mallinje:", error);

      const isDuplicate =
        typeof error.message === "string" &&
        (error.message.toLowerCase().includes("duplicate") ||
          error.message.toLowerCase().includes("unique"));

      if (isDuplicate) {
        redirect("/materials?error=Dette+materialet+finnes+allerede+i+denne+malen");
      }

      redirect("/materials?error=Kunne+ikke+legge+til+materiale+i+mal");
    }

    redirect("/materials");
  }

  async function updateTemplateItemQuantity(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const templateItemId = String(formData.get("templateItemId") || "").trim();
    const quantity = Number(formData.get("quantity") || 0);

    if (!templateItemId) {
      redirect("/materials?error=Mangler+mallinje+som+skal+oppdateres");
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      redirect("/materials?error=Antall+m%C3%A5+v%C3%A6re+st%C3%B8rre+enn+0");
    }

    const { error } = await supabase
      .from("material_template_items")
      .update({
        quantity,
      })
      .eq("id", templateItemId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Feil ved oppdatering av mallinje:", error);
      redirect("/materials?error=Kunne+ikke+oppdatere+antall+i+mal");
    }

    redirect("/materials");
  }

  async function deleteTemplateItem(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const templateItemId = String(formData.get("templateItemId") || "").trim();

    if (!templateItemId) {
      redirect("/materials?error=Mangler+mallinje+som+skal+slettes");
    }

    const { error } = await supabase
      .from("material_template_items")
      .delete()
      .eq("id", templateItemId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Feil ved sletting av mallinje:", error);
      redirect("/materials?error=Kunne+ikke+fjerne+mallinje");
    }

    redirect("/materials");
  }

  const [
    { data: materials, error: materialsError },
    { data: templates, error: templatesError },
    { data: templateItems, error: templateItemsError },
  ] = await Promise.all([
    supabase.from("materials").select("*").order("created_at", { ascending: false }),
    supabase
      .from("material_templates")
      .select("id, name, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("material_template_items")
      .select(
        `
        id,
        template_id,
        material_id,
        quantity,
        materials(
          id,
          name,
          supplier,
          unit,
          base_price,
          waste_percent,
          markup_percent
        )
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  if (materialsError) {
    console.error("Feil ved henting av materialer:", materialsError);
  }

  if (templatesError) {
    console.error("Feil ved henting av materialmaler:", templatesError);
  }

  if (templateItemsError) {
    console.error("Feil ved henting av mallinjer:", templateItemsError);
  }

  const typedMaterials = (materials as Material[] | null) || [];
  const typedTemplates = (templates as MaterialTemplate[] | null) || [];
  const typedTemplateItems = (templateItems as MaterialTemplateItem[] | null) || [];

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
              <div>
                <h1 className="text-2xl font-bold">Materialdatabase</h1>
                <p className="mt-2 text-sm text-neutral-500">
                  Legg inn egne materialer og priser. Dette blir grunnlaget for
                  smartere tilbud senere.
                </p>
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {errorMessage}
                </div>
              ) : null}

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
              <div>
                <h2 className="text-xl font-semibold">Ny materialmal</h2>
                <p className="mt-2 text-sm text-neutral-500">
                  Lag ferdige pakker for jobber du gjør ofte.
                </p>
              </div>

              <form action={createTemplate} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium">Navn på mal</label>
                  <input
                    name="template_name"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    placeholder="F.eks. Lettvegg standard"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Beskrivelse</label>
                  <textarea
                    name="template_description"
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    placeholder="F.eks. Standardpakke for lettvegg med stendere, gips og skruer."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-black px-4 py-4 text-white"
                >
                  Lagre materialmal
                </button>
              </form>
            </section>
          </div>

          <div className="space-y-6">
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

            <section className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
              <div>
                <h2 className="text-xl font-semibold">Materialmaler</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Sett sammen ferdige pakker du kan bruke i nye tilbud.
                </p>
              </div>

              {typedTemplates.length === 0 ? (
                <p className="mt-6 text-neutral-500">
                  Ingen materialmaler enda.
                </p>
              ) : (
                <div className="mt-6 space-y-4">
                  {typedTemplates.map((template) => {
                    const templateItemsForThis = typedTemplateItems.filter(
                      (item) => item.template_id === template.id
                    );

                    return (
                      <div
                        key={template.id}
                        className="rounded-2xl border border-neutral-200 p-5"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-semibold">{template.name}</p>

                            {template.description ? (
                              <p className="mt-1 text-sm text-neutral-500">
                                {template.description}
                              </p>
                            ) : null}

                            <p className="mt-2 text-xs text-neutral-500">
                              Opprettet: {formatDate(template.created_at)}
                            </p>
                          </div>

                          <form action={deleteTemplate}>
                            <input
                              type="hidden"
                              name="templateId"
                              value={template.id}
                            />
                            <button
                              type="submit"
                              className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700"
                            >
                              Slett mal
                            </button>
                          </form>
                        </div>

                        <div className="mt-5 rounded-2xl bg-neutral-50 p-4">
                          <h3 className="text-sm font-semibold">
                            Legg til materiale i mal
                          </h3>

                          <form
                            action={addTemplateItem}
                            className="mt-3 grid gap-3 lg:grid-cols-[1fr_160px_auto]"
                          >
                            <input
                              type="hidden"
                              name="templateId"
                              value={template.id}
                            />

                            <select
                              name="materialId"
                              className="rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                              defaultValue=""
                            >
                              <option value="">Velg materiale</option>
                              {typedMaterials.map((material) => (
                                <option key={material.id} value={material.id}>
                                  {material.name}
                                  {material.supplier
                                    ? ` (${material.supplier})`
                                    : ""}
                                </option>
                              ))}
                            </select>

                            <input
                              name="quantity"
                              type="number"
                              step="0.01"
                              min="0.01"
                              defaultValue="1"
                              className="rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                              placeholder="Antall"
                            />

                            <button
                              type="submit"
                              className="rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
                            >
                              Legg til
                            </button>
                          </form>
                        </div>

                        {templateItemsForThis.length === 0 ? (
                          <p className="mt-4 text-sm text-neutral-500">
                            Ingen materiallinjer i denne malen enda.
                          </p>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {templateItemsForThis.map((item) => {
                              const material = getTemplateMaterial(item);

                              if (!material) {
                                return null;
                              }

                              const salesUnit = calculateSuggestedPrice({
                                id: material.id,
                                supplier: material.supplier,
                                sku: null,
                                name: material.name,
                                unit: material.unit,
                                base_price: material.base_price,
                                waste_percent: material.waste_percent,
                                markup_percent: material.markup_percent,
                                pricing_mode: "markup",
                                created_at: "",
                              });

                              const totalLine =
                                Number(item.quantity || 0) * salesUnit;

                              return (
                                <div
                                  key={item.id}
                                  className="rounded-2xl border border-neutral-200 bg-white p-4"
                                >
                                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium">{material.name}</p>

                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                                        <span>
                                          {material.supplier || "Ukjent leverandør"}
                                        </span>
                                        <span>•</span>
                                        <span>{material.unit}</span>
                                      </div>

                                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-xl bg-neutral-50 p-3">
                                          <p className="text-neutral-500">Antall</p>
                                          <form
                                            action={updateTemplateItemQuantity}
                                            className="mt-2 flex gap-2"
                                          >
                                            <input
                                              type="hidden"
                                              name="templateItemId"
                                              value={item.id}
                                            />
                                            <input
                                              name="quantity"
                                              type="number"
                                              step="0.01"
                                              min="0.01"
                                              defaultValue={String(item.quantity || 1)}
                                              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2"
                                            />
                                            <button
                                              type="submit"
                                              className="rounded-xl bg-black px-3 py-2 text-xs font-medium text-white"
                                            >
                                              Lagre
                                            </button>
                                          </form>
                                        </div>

                                        <div className="rounded-xl bg-neutral-50 p-3">
                                          <p className="text-neutral-500">
                                            Salgspris/enhet
                                          </p>
                                          <p className="mt-1 font-medium">
                                            {formatCurrency(salesUnit)} kr
                                          </p>
                                        </div>

                                        <div className="rounded-xl bg-neutral-50 p-3">
                                          <p className="text-neutral-500">
                                            Linjesum
                                          </p>
                                          <p className="mt-1 font-medium">
                                            {formatCurrency(totalLine)} kr
                                          </p>
                                        </div>

                                        <div className="rounded-xl bg-neutral-50 p-3">
                                          <p className="text-neutral-500">
                                            Grunnpris
                                          </p>
                                          <p className="mt-1 font-medium">
                                            {formatCurrency(material.base_price)} kr
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    <form action={deleteTemplateItem}>
                                      <input
                                        type="hidden"
                                        name="templateItemId"
                                        value={item.id}
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700"
                                      >
                                        Fjern
                                      </button>
                                    </form>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}