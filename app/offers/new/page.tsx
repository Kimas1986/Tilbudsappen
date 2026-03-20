"use client";

import { useEffect, useMemo, useState } from "react";

type AiSuggestion = {
  title: string;
  description: string;
  priceType: "fixed" | "hourly";
  hours: number;
  hourlyRate: number;
  materials: number;
  fixedPrice: number;
};

type MaterialRow = {
  id: string;
  name: string;
  supplier: string | null;
  unit: string;
  base_price: number;
  waste_percent: number;
  markup_percent: number;
  pricing_mode: string;
};

type MaterialTemplateItem = {
  id: string;
  materialId: string;
  quantity: number;
  material: MaterialRow;
};

type MaterialTemplate = {
  id: string;
  name: string;
  description: string;
  created_at: string | null;
  items: MaterialTemplateItem[];
};

type SelectedMaterial = {
  materialId: string;
  name: string;
  supplier: string | null;
  unit: string;
  quantity: string;
  unitPrice: number;
  wastePercent: number;
  markupPercent: number;
  lineTotal: number;
};

function parseNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(value);
}

function calculateMaterialUnitPrice(material: MaterialRow) {
  const basePrice = Number(material.base_price || 0);
  const wastePercent = Number(material.waste_percent || 0);
  const markupPercent = Number(material.markup_percent || 0);

  const withWaste = basePrice * (1 + wastePercent / 100);
  const withMarkup = withWaste * (1 + markupPercent / 100);

  return Math.round(withMarkup * 100) / 100;
}

function calculateLineTotal(quantity: string, unitPrice: number) {
  return parseNumber(quantity) * unitPrice;
}

function formatSuggestionSummary(suggestion: AiSuggestion) {
  if (suggestion.priceType === "hourly") {
    return `${formatCurrency(suggestion.hourlyRate)} kr/t × ${suggestion.hours} t + ${formatCurrency(suggestion.materials)} kr materialer`;
  }

  return `${formatCurrency(suggestion.fixedPrice)} kr fastpris + ${formatCurrency(suggestion.materials)} kr materialer`;
}

const QUICK_INPUTS = [
  "Bytte 2 vinduer",
  "Sette opp lettvegg 10 m²",
  "Skifte ytterdør",
  "Legge 20 m² laminatgulv",
  "Montere kjøkkenbenk og tilpasning",
  "Skifte kledning på én vegg",
];

export default function NewOfferPage() {
  const [customer, setCustomer] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceType, setPriceType] = useState<"fixed" | "hourly">("fixed");
  const [fixedPrice, setFixedPrice] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [hours, setHours] = useState("");
  const [materials, setMaterials] = useState("");
  const [vatEnabled, setVatEnabled] = useState(true);

  const [aiInput, setAiInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [lastAppliedAiInput, setLastAppliedAiInput] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [offerId, setOfferId] = useState<string | null>(null);

  const [materialsCatalog, setMaterialsCatalog] = useState<MaterialRow[]>([]);
  const [materialTemplates, setMaterialTemplates] = useState<MaterialTemplate[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [materialsError, setMaterialsError] = useState("");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterial[]>([]);
  const [useSavedMaterials, setUseSavedMaterials] = useState(true);
  const [templateMessage, setTemplateMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadMaterials() {
      try {
        setMaterialsLoading(true);
        setMaterialsError("");

        const response = await fetch("/api/materials", {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Kunne ikke hente materialer");
        }

        if (!active) return;

        setMaterialsCatalog(Array.isArray(data.materials) ? data.materials : []);
        setMaterialTemplates(Array.isArray(data.templates) ? data.templates : []);
      } catch (error) {
        console.error(error);

        if (!active) return;

        setMaterialsError("Kunne ikke hente materialdatabase.");
      } finally {
        if (active) {
          setMaterialsLoading(false);
        }
      }
    }

    loadMaterials();

    return () => {
      active = false;
    };
  }, []);

  const selectedTemplate = useMemo(() => {
    return materialTemplates.find((template) => template.id === selectedTemplateId) || null;
  }, [materialTemplates, selectedTemplateId]);

  const calculatedMaterialCost = useMemo(() => {
    return selectedMaterials.reduce((sum, item) => sum + item.lineTotal, 0);
  }, [selectedMaterials]);

  useEffect(() => {
    if (useSavedMaterials) {
      setMaterials(String(Math.round(calculatedMaterialCost * 100) / 100));
    }
  }, [calculatedMaterialCost, useSavedMaterials]);

  const totals = useMemo(() => {
    const fixed = parseNumber(fixedPrice);
    const rate = parseNumber(hourlyRate);
    const hourCount = parseNumber(hours);
    const materialCost = parseNumber(materials);

    const subtotal =
      priceType === "fixed"
        ? fixed + materialCost
        : rate * hourCount + materialCost;

    const vat = vatEnabled ? subtotal * 0.25 : 0;
    const total = subtotal + vat;

    return { subtotal, vat, total };
  }, [priceType, fixedPrice, hourlyRate, hours, materials, vatEnabled]);

  const selectedMaterialsCount = selectedMaterials.length;

  function applyAiSuggestion(suggestion: AiSuggestion) {
    setTitle(suggestion.title);
    setDescription(suggestion.description);

    if (suggestion.priceType === "hourly") {
      setPriceType("hourly");
      setHourlyRate(String(suggestion.hourlyRate || ""));
      setHours(String(suggestion.hours || ""));
      setFixedPrice("");
    } else {
      setPriceType("fixed");
      setFixedPrice(String(suggestion.fixedPrice || ""));
      setHourlyRate("");
      setHours("");
    }

    if (!useSavedMaterials || selectedMaterials.length === 0) {
      setMaterials(String(suggestion.materials || ""));
    }

    setLastAppliedAiInput(aiInput.trim());
  }

  async function handleGenerateText() {
    setAiError("");
    setAiSuggestion(null);
    setSaveError("");
    setSaveSuccess("");

    if (!aiInput.trim()) {
      setAiError("Skriv kort hva jobben gjelder først.");
      return;
    }

    try {
      setIsGenerating(true);

      const response = await fetch("/api/ai/offer-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: aiInput,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "AI-feil");
      }

      const suggestion: AiSuggestion = {
        title: String(data.title || ""),
        description: String(data.description || ""),
        priceType: data.priceType === "hourly" ? "hourly" : "fixed",
        hours: Number(data.hours || 0),
        hourlyRate: Number(data.hourlyRate || 0),
        materials: Number(data.materials || 0),
        fixedPrice: Number(data.fixedPrice || 0),
      };

      setAiSuggestion(suggestion);
      applyAiSuggestion(suggestion);
    } catch (error) {
      console.error(error);
      setAiError("Kunne ikke generere forslag.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleQuickInputClick(value: string) {
    setAiInput(value);
    setAiError("");
  }

  function handleClearAiDraft() {
    setAiSuggestion(null);
    setLastAppliedAiInput("");
    setAiError("");
    setAiInput("");
    setTitle("");
    setDescription("");
    setPriceType("fixed");
    setFixedPrice("");
    setHourlyRate("");
    setHours("");
    if (!useSavedMaterials || selectedMaterials.length === 0) {
      setMaterials("");
    }
  }

  function buildSelectedMaterial(material: MaterialRow, quantity: string) {
    const unitPrice = calculateMaterialUnitPrice(material);

    return {
      materialId: material.id,
      name: material.name,
      supplier: material.supplier,
      unit: material.unit,
      quantity,
      unitPrice,
      wastePercent: Number(material.waste_percent || 0),
      markupPercent: Number(material.markup_percent || 0),
      lineTotal: calculateLineTotal(quantity, unitPrice),
    };
  }

  function handleAddMaterial() {
    if (!selectedMaterialId) return;

    const material = materialsCatalog.find((item) => item.id === selectedMaterialId);

    if (!material) return;

    const alreadyExists = selectedMaterials.some(
      (item) => item.materialId === material.id
    );

    if (alreadyExists) {
      setSelectedMaterialId("");
      return;
    }

    setSelectedMaterials((prev) => [...prev, buildSelectedMaterial(material, "1")]);

    setSelectedMaterialId("");
    setUseSavedMaterials(true);
    setTemplateMessage("");
  }

  function handleApplyTemplate() {
    if (!selectedTemplate) return;

    const templateItems = Array.isArray(selectedTemplate.items)
      ? selectedTemplate.items
      : [];

    if (templateItems.length === 0) {
      setTemplateMessage("Denne malen har ingen materiallinjer.");
      return;
    }

    let addedCount = 0;
    let skippedCount = 0;

    setSelectedMaterials((prev) => {
      const next = [...prev];

      for (const templateItem of templateItems) {
        const material = templateItem.material;

        if (!material?.id) {
          skippedCount += 1;
          continue;
        }

        const alreadyExists = next.some(
          (item) => item.materialId === material.id
        );

        if (alreadyExists) {
          skippedCount += 1;
          continue;
        }

        next.push(
          buildSelectedMaterial(material, String(templateItem.quantity || 1))
        );
        addedCount += 1;
      }

      return next;
    });

    setUseSavedMaterials(true);

    if (addedCount > 0 && skippedCount > 0) {
      setTemplateMessage(
        `Mal lagt inn. ${addedCount} materialer lagt til, ${skippedCount} hoppet over fordi de allerede finnes i tilbudet.`
      );
      return;
    }

    if (addedCount > 0) {
      setTemplateMessage(`Mal lagt inn. ${addedCount} materialer lagt til.`);
      return;
    }

    setTemplateMessage("Ingen nye materialer ble lagt til fra malen.");
  }

  function handleMaterialQuantityChange(materialId: string, quantity: string) {
    setSelectedMaterials((prev) =>
      prev.map((item) =>
        item.materialId === materialId
          ? {
              ...item,
              quantity,
              lineTotal: calculateLineTotal(quantity, item.unitPrice),
            }
          : item
      )
    );
  }

  function handleRemoveMaterial(materialId: string) {
    setSelectedMaterials((prev) =>
      prev.filter((item) => item.materialId !== materialId)
    );
  }

  async function handleSaveOffer() {
    setSaveError("");
    setSaveSuccess("");

    if (!customer.trim()) {
      setSaveError("Fyll inn kundenavn.");
      return;
    }

    if (!description.trim()) {
      setSaveError("Fyll inn beskrivelse.");
      return;
    }

    try {
      setIsSaving(true);

      const response = await fetch("/api/offers/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer,
          customerEmail,
          customerPhone,
          title,
          description,
          priceType,
          fixedPrice,
          hourlyRate,
          hours,
          materials,
          vatEnabled,
          useSavedMaterials,
          selectedMaterials,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Kunne ikke lagre tilbud");
      }

      setOfferId(String(data.offerId));
      setSaveSuccess("Tilbud lagret som utkast.");
    } catch (error) {
      console.error(error);
      setSaveError(
        error instanceof Error ? error.message : "Kunne ikke lagre tilbud"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSendEmail() {
    if (!offerId) return;

    setSaveError("");
    setSaveSuccess("");

    try {
      const response = await fetch(`/api/offers/${offerId}/send`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Kunne ikke sende e-post");
      }

      setSaveSuccess("Tilbud sendt på e-post.");
    } catch (error) {
      console.error(error);
      setSaveError(
        error instanceof Error ? error.message : "Kunne ikke sende e-post"
      );
    }
  }

  const pdfUrl = offerId ? `/api/offers/${offerId}/pdf` : null;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-500">Tilbudsapp</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Nytt tilbud
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Fyll inn kunde, jobb og pris. Du kan bruke AI til å lage et
              komplett forslag før du lagrer tilbudet.
            </p>
          </div>

          <a
            href="/dashboard"
            className="inline-flex rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900"
          >
            Tilbake til dashboard
          </a>
        </div>

        <div className="mb-6 rounded-3xl border border-black bg-black px-5 py-5 text-white shadow-sm sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-white/70">1-klikk tilbud</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">
                Skriv jobben kort. Få ferdig forslag med én gang.
              </h2>
              <p className="mt-2 text-sm text-white/75">
                Dette fyller inn tittel, beskrivelse og prisoppsett automatisk.
                Materialer fra databasen eller ferdige maler legger du på under
                hvis du vil gjøre tilbudet mer presist.
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
              <p className="text-white/70">Status</p>
              <p className="mt-1 font-medium">
                {lastAppliedAiInput
                  ? `Sist generert fra: "${lastAppliedAiInput}"`
                  : "Ingen AI-forslag brukt enda"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Kunde og jobb</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Start med hvem tilbudet gjelder og hva jobben går ut på.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium">Kundenavn</label>
                <input
                  name="customer"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                  placeholder="F.eks. Ola Nordmann"
                />
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">E-post</label>
                  <input
                    name="customerEmail"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                    placeholder="F.eks. ola@epost.no"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Telefon</label>
                  <input
                    name="customerPhone"
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                    placeholder="F.eks. 90000000"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="min-w-0">
                  <label className="block text-sm font-medium">
                    AI-hjelp til komplett forslag
                  </label>
                  <p className="mt-1 text-sm text-neutral-500">
                    Skriv kort hva jobben gjelder. AI foreslår tittel, tekst,
                    prisform og tall du kan justere videre.
                  </p>
                </div>

                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="F.eks. sette opp lettvegg 10m2"
                  className="mt-3 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 outline-none focus:border-black"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  {QUICK_INPUTS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleQuickInputClick(item)}
                      className="rounded-full border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700"
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleGenerateText}
                    disabled={isGenerating}
                    className="rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {isGenerating
                      ? "Genererer..."
                      : "Generer komplett forslag"}
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAiDraft}
                    className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900"
                  >
                    Tøm forslag
                  </button>
                </div>

                {aiError ? (
                  <p className="mt-3 text-sm text-red-600">{aiError}</p>
                ) : null}

                {aiSuggestion ? (
                  <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">AI foreslår</p>
                        <p className="mt-1 text-sm text-neutral-500">
                          Forslaget er allerede lagt inn i feltene under.
                        </p>
                      </div>

                      <div className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                        Lagt inn automatisk
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-neutral-50 p-3">
                      <p className="text-xs text-neutral-500">Tittel</p>
                      <p className="mt-1 font-medium">
                        {aiSuggestion.title || "-"}
                      </p>
                    </div>

                    <div className="mt-3 rounded-xl bg-neutral-50 p-3">
                      <p className="text-xs text-neutral-500">Oppsummering</p>
                      <p className="mt-1 text-sm font-medium">
                        {formatSuggestionSummary(aiSuggestion)}
                      </p>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-neutral-50 p-3">
                        <p className="text-xs text-neutral-500">Prisform</p>
                        <p className="mt-1 font-medium">
                          {aiSuggestion.priceType === "fixed"
                            ? "Fastpris"
                            : "Timepris"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-neutral-50 p-3">
                        <p className="text-xs text-neutral-500">Materialer</p>
                        <p className="mt-1 font-medium">
                          {formatCurrency(aiSuggestion.materials)} kr
                        </p>
                      </div>

                      {aiSuggestion.priceType === "hourly" ? (
                        <>
                          <div className="rounded-xl bg-neutral-50 p-3">
                            <p className="text-xs text-neutral-500">Timepris</p>
                            <p className="mt-1 font-medium">
                              {formatCurrency(aiSuggestion.hourlyRate)} kr
                            </p>
                          </div>

                          <div className="rounded-xl bg-neutral-50 p-3">
                            <p className="text-xs text-neutral-500">Timer</p>
                            <p className="mt-1 font-medium">
                              {aiSuggestion.hours}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl bg-neutral-50 p-3 sm:col-span-2">
                          <p className="text-xs text-neutral-500">Fastpris</p>
                          <p className="mt-1 font-medium">
                            {formatCurrency(aiSuggestion.fixedPrice)} kr
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Materialdatabasen er fortsatt det mest presise grunnlaget.
                      Legg gjerne til faktiske materialer eller en ferdig mal
                      under for å få bedre kalkyle.
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium">Tittel</label>
                <input
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                  placeholder="F.eks. Sette opp lettvegg"
                />
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium">Beskrivelse</label>
                <textarea
                  name="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={8}
                  className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                  placeholder="F.eks. Oppsetting av lettvegg inkludert nødvendig tilpasning og fagmessig utførelse."
                />
              </div>
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Materialer</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Velg fra materialdatabasen, eller bruk ferdige materialmaler
                  for å fylle inn flere linjer med ett klikk.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium">
                      Materialmal
                    </label>
                    <p className="mt-1 text-sm text-neutral-500">
                      Velg en ferdig pakke hvis jobben ligner noe du gjør ofte.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => {
                        setSelectedTemplateId(e.target.value);
                        setTemplateMessage("");
                      }}
                      className="rounded-2xl border border-neutral-300 bg-white px-4 py-3"
                      disabled={materialsLoading}
                    >
                      <option value="">
                        {materialsLoading
                          ? "Laster materialmaler..."
                          : "Velg materialmal"}
                      </option>

                      {materialTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleApplyTemplate}
                      disabled={!selectedTemplateId}
                      className="rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Legg inn mal
                    </button>
                  </div>

                  {selectedTemplate ? (
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                      <p className="font-medium">{selectedTemplate.name}</p>

                      {selectedTemplate.description ? (
                        <p className="mt-1 text-sm text-neutral-500">
                          {selectedTemplate.description}
                        </p>
                      ) : null}

                      <p className="mt-2 text-sm text-neutral-600">
                        {selectedTemplate.items.length} materiallinjer i malen
                      </p>
                    </div>
                  ) : null}

                  {templateMessage ? (
                    <p className="text-sm text-green-700">{templateMessage}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  className="rounded-2xl border border-neutral-300 px-4 py-3"
                  disabled={materialsLoading}
                >
                  <option value="">
                    {materialsLoading
                      ? "Laster materialer..."
                      : "Velg materiale fra databasen"}
                  </option>

                  {materialsCatalog.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name}
                      {material.supplier ? ` (${material.supplier})` : ""}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
                >
                  Legg til
                </button>
              </div>

              {materialsError ? (
                <p className="mt-3 text-sm text-red-600">{materialsError}</p>
              ) : null}

              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
                <input
                  id="useSavedMaterials"
                  type="checkbox"
                  checked={useSavedMaterials}
                  onChange={() => setUseSavedMaterials(!useSavedMaterials)}
                  className="h-4 w-4"
                />
                <label htmlFor="useSavedMaterials" className="text-sm font-medium">
                  Bruk materialene over som grunnlag for materialkost
                </label>
              </div>

              {selectedMaterials.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-500">
                  Ingen materialer valgt enda.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {selectedMaterials.map((item) => (
                    <div
                      key={item.materialId}
                      className="rounded-2xl border border-neutral-200 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.name}</p>
                          <p className="mt-1 text-sm text-neutral-500">
                            {item.supplier || "Ukjent leverandør"} • {item.unit}
                          </p>

                          <div className="mt-3 grid gap-3 sm:grid-cols-4">
                            <div>
                              <p className="text-xs text-neutral-500">Antall</p>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleMaterialQuantityChange(
                                    item.materialId,
                                    e.target.value
                                  )
                                }
                                className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2"
                              />
                            </div>

                            <div>
                              <p className="text-xs text-neutral-500">Enhetspris</p>
                              <p className="mt-1 rounded-xl bg-neutral-50 px-3 py-2 text-sm font-medium">
                                {formatCurrency(item.unitPrice)} kr
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-neutral-500">Svinn</p>
                              <p className="mt-1 rounded-xl bg-neutral-50 px-3 py-2 text-sm font-medium">
                                {item.wastePercent} %
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-neutral-500">Linjesum</p>
                              <p className="mt-1 rounded-xl bg-neutral-50 px-3 py-2 text-sm font-medium">
                                {formatCurrency(item.lineTotal)} kr
                              </p>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveMaterial(item.materialId)}
                          className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700"
                        >
                          Fjern
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 rounded-2xl bg-neutral-100 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Total materialkost</span>
                  <span className="text-lg font-bold">
                    {formatCurrency(calculatedMaterialCost)} kr
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Prisoppsett</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Velg om tilbudet skal være fastpris eller timepris.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium">Prisform</label>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPriceType("fixed")}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      priceType === "fixed"
                        ? "border-black bg-black text-white"
                        : "border-neutral-300 bg-white text-neutral-900"
                    }`}
                  >
                    <p className="font-medium">Fastpris</p>
                    <p
                      className={`mt-1 text-sm ${
                        priceType === "fixed"
                          ? "text-white/80"
                          : "text-neutral-500"
                      }`}
                    >
                      Ett samlet beløp for hele jobben.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPriceType("hourly")}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      priceType === "hourly"
                        ? "border-black bg-black text-white"
                        : "border-neutral-300 bg-white text-neutral-900"
                    }`}
                  >
                    <p className="font-medium">Timepris</p>
                    <p
                      className={`mt-1 text-sm ${
                        priceType === "hourly"
                          ? "text-white/80"
                          : "text-neutral-500"
                      }`}
                    >
                      Timesats, timer og materialer.
                    </p>
                  </button>
                </div>
              </div>

              {priceType === "fixed" && (
                <div className="mt-5">
                  <label className="block text-sm font-medium">Fastpris</label>
                  <input
                    name="fixedPrice"
                    type="text"
                    inputMode="decimal"
                    value={fixedPrice}
                    onChange={(e) => setFixedPrice(e.target.value)}
                    placeholder="F.eks. 12500"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                  />
                </div>
              )}

              {priceType === "hourly" && (
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">Timepris</label>
                    <input
                      name="hourlyRate"
                      type="text"
                      inputMode="decimal"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      placeholder="F.eks. 950"
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Timer</label>
                    <input
                      name="hours"
                      type="text"
                      inputMode="decimal"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      placeholder="F.eks. 8"
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                    />
                  </div>
                </div>
              )}

              <div className="mt-5">
                <label className="block text-sm font-medium">Materialer</label>
                <input
                  name="materials"
                  type="text"
                  inputMode="decimal"
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  placeholder="F.eks. 3200"
                  className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
                />
                <p className="mt-2 text-xs text-neutral-500">
                  Dette feltet fylles automatisk hvis du bruker materiallisten over,
                  men du kan også justere det manuelt.
                </p>
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
                <input
                  id="vatEnabled"
                  name="vatEnabled"
                  type="checkbox"
                  checked={vatEnabled}
                  onChange={() => setVatEnabled(!vatEnabled)}
                  className="h-4 w-4"
                />
                <label htmlFor="vatEnabled" className="text-sm font-medium">
                  Inkluder MVA
                </label>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6 lg:sticky lg:top-6">
              <div>
                <h2 className="text-lg font-semibold">Oppsummering</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Dette blir lagret på tilbudet.
                </p>
              </div>

              <div className="mt-5 rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm text-neutral-500">Kunde</p>
                <p className="mt-1 font-medium">
                  {customer.trim() || "Ikke fylt inn enda"}
                </p>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm text-neutral-500">E-post</p>
                <p className="mt-1 font-medium">
                  {customerEmail.trim() || "Ikke fylt inn enda"}
                </p>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm text-neutral-500">Telefon</p>
                <p className="mt-1 font-medium">
                  {customerPhone.trim() || "Ikke fylt inn enda"}
                </p>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm text-neutral-500">Tittel</p>
                <p className="mt-1 font-medium">
                  {title.trim() || "Ikke fylt inn enda"}
                </p>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm text-neutral-500">Prisform</p>
                <p className="mt-1 font-medium">
                  {priceType === "fixed" ? "Fastpris" : "Timepris"}
                </p>
              </div>

              <div className="mt-4 rounded-2xl bg-neutral-50 p-4">
                <p className="text-sm text-neutral-500">Valgte materialer</p>
                <p className="mt-1 font-medium">{selectedMaterialsCount} stk</p>
              </div>

              {selectedTemplate ? (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-blue-700">Valgt materialmal</p>
                  <p className="mt-1 text-sm font-medium text-blue-900">
                    {selectedTemplate.name}
                  </p>
                </div>
              ) : null}

              {aiSuggestion ? (
                <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4">
                  <p className="text-sm text-green-700">AI-forslag brukt</p>
                  <p className="mt-1 text-sm font-medium text-green-900">
                    {formatSuggestionSummary(aiSuggestion)}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 space-y-3 rounded-2xl bg-neutral-100 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Subtotal</span>
                  <span className="font-medium">
                    {formatCurrency(totals.subtotal)} kr
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">MVA</span>
                  <span className="font-medium">
                    {formatCurrency(totals.vat)} kr
                  </span>
                </div>

                <div className="h-px bg-neutral-200" />

                <div className="flex items-center justify-between">
                  <span className="font-medium">Totalt</span>
                  <span className="text-xl font-bold">
                    {formatCurrency(totals.total)} kr
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveOffer}
                disabled={isSaving}
                className="mt-5 w-full rounded-2xl bg-black px-4 py-4 text-sm font-medium text-white disabled:opacity-60"
              >
                {isSaving ? "Lagrer..." : "Lagre utkast"}
              </button>

              {offerId ? (
                <div className="mt-5 space-y-3">
                  <a
                    href={pdfUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white"
                  >
                    Åpne PDF
                  </a>

                  <a
                    href={pdfUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                  >
                    Last ned PDF
                  </a>

                  <button
                    type="button"
                    onClick={handleSendEmail}
                    className="block w-full rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white"
                  >
                    Send på e-post
                  </button>
                </div>
              ) : null}

              {saveError ? (
                <p className="mt-4 text-sm text-red-600">{saveError}</p>
              ) : null}

              {saveSuccess ? (
                <p className="mt-4 text-sm text-green-600">{saveSuccess}</p>
              ) : null}

              <p className="mt-3 text-xs text-neutral-500">
                Lagre først utkast. Deretter kan du åpne PDF, laste ned PDF og
                sende tilbudet på e-post direkte fra denne siden.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}