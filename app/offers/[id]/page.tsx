import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import CopyLinkButton from "@/components/copy-link-button";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OfferMaterial = {
  id: string;
  material_id: string | null;
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
  id: string | null;
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
  customer_id?: string | null;
  customers?: CustomerRelation;
};

type MaterialTemplate = {
  id: string;
  name: string;
  description: string | null;
};

type SearchParams = Promise<{
  error?: string;
  success?: string;
}>;

type TemplateSyncMode = "replace" | "merge";

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
  if (status === "approved") return "bg-green-100 text-green-800";
  if (status === "draft") return "bg-yellow-100 text-yellow-800";
  if (status === "sent") return "bg-blue-100 text-blue-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  if (status === "expired") return "bg-red-200 text-red-900";
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

function buildTemplateRows(
  materials: { material_id: string | null; quantity: number | null }[],
  userId: string,
  templateId: string
) {
  const validMaterials = materials.filter((item) => item.material_id);

  return Array.from(
    new Map(
      validMaterials.map((item) => [
        item.material_id,
        {
          template_id: templateId,
          user_id: userId,
          material_id: item.material_id,
          quantity:
            Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
              ? Number(item.quantity)
              : 1,
        },
      ])
    ).values()
  );
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function getInvoiceYear() {
  return new Date().getFullYear();
}

function buildInvoiceNumber(year: number, sequence: number) {
  return `${year}-${String(sequence).padStart(4, "0")}`;
}

function parseInvoiceSequence(
  invoiceNumber: string | null | undefined,
  year: number
) {
  const value = String(invoiceNumber || "").trim();
  const match = value.match(/^(\d{4})-(\d{4})$/);

  if (!match) return null;

  const parsedYear = Number(match[1]);
  const parsedSequence = Number(match[2]);

  if (parsedYear !== year) return null;
  if (!Number.isFinite(parsedSequence)) return null;

  return parsedSequence;
}

async function generateNextInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const year = getInvoiceYear();

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("user_id", userId)
    .not("invoice_number", "is", null);

  if (error) {
    throw new Error("Kunne ikke hente eksisterende fakturanumre.");
  }

  const maxSequence = (invoices || []).reduce((max, row) => {
    const current = parseInvoiceSequence(row.invoice_number, year);
    if (current === null) return max;
    return Math.max(max, current);
  }, 0);

  return buildInvoiceNumber(year, maxSequence + 1);
}

export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const errorMessage = String(resolvedSearchParams?.error || "").trim();
  const successMessage = String(resolvedSearchParams?.success || "").trim();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  async function createInvoiceFromOffer() {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const { data: existingInvoice, error: existingInvoiceError } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("offer_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingInvoiceError) {
      console.error(
        "Feil ved oppslag av eksisterende faktura:",
        existingInvoiceError
      );
      redirect(`/offers/${id}?error=Kunne+ikke+sjekke+eksisterende+faktura`);
    }

    if (existingInvoice?.id) {
      redirect(`/invoices/${existingInvoice.id}`);
    }

    const { data: sourceOffer, error: sourceOfferError } = await supabase
      .from("offers")
      .select(
        `
        id,
        user_id,
        customer_id,
        title,
        description,
        status,
        subtotal,
        vat_amount,
        total,
        customers(name, email, phone)
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (sourceOfferError || !sourceOffer) {
      console.error("Feil ved henting av tilbud for faktura:", sourceOfferError);
      redirect(`/offers/${id}?error=Fant+ikke+tilbudet`);
    }

    if (sourceOffer.status !== "approved") {
      redirect(
        `/offers/${id}?error=Faktura+kan+bare+opprettes+fra+godkjente+tilbud`
      );
    }

    const { data: sourceMaterials, error: sourceMaterialsError } = await supabase
      .from("offer_materials")
      .select(
        "id, material_name, supplier, unit, quantity, unit_price, line_total"
      )
      .eq("offer_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (sourceMaterialsError) {
      console.error(
        "Feil ved henting av materiallinjer for faktura:",
        sourceMaterialsError
      );
      redirect(`/offers/${id}?error=Kunne+ikke+hente+materiallinjer`);
    }

    const customerRelation = Array.isArray(sourceOffer.customers)
      ? sourceOffer.customers[0] || null
      : sourceOffer.customers || null;

    const customerName = customerRelation?.name || "Kunde";
    const invoiceTitle =
      String(sourceOffer.title || "").trim() || `Faktura til ${customerName}`;
    const invoiceDescription =
      String(sourceOffer.description || "").trim() ||
      "Faktura opprettet fra godkjent tilbud.";

    const subtotal = toNumber(sourceOffer.subtotal);
    const vatAmount = toNumber(sourceOffer.vat_amount);
    const total = toNumber(sourceOffer.total);

    let invoiceNumber = "";

    try {
      invoiceNumber = await generateNextInvoiceNumber(supabase, user.id);
    } catch (error) {
      console.error("Feil ved generering av fakturanummer:", error);
      redirect(`/offers/${id}?error=Kunne+ikke+generere+fakturanummer`);
    }

    const { data: createdInvoice, error: createdInvoiceError } = await supabase
      .from("invoices")
      .insert({
        user_id: user.id,
        offer_id: sourceOffer.id,
        customer_id: sourceOffer.customer_id || null,
        invoice_number: invoiceNumber,
        title: invoiceTitle,
        description: invoiceDescription,
        status: "draft",
        subtotal,
        vat_amount: vatAmount,
        total,
        due_date: addDays(14),
      })
      .select("id, invoice_number")
      .single();

    if (createdInvoiceError || !createdInvoice) {
      console.error("Feil ved opprettelse av faktura:", createdInvoiceError);
      redirect(`/offers/${id}?error=Kunne+ikke+opprette+faktura`);
    }

    const invoiceLineRows =
      sourceMaterials && sourceMaterials.length > 0
        ? sourceMaterials.map((item) => ({
            invoice_id: createdInvoice.id,
            user_id: user.id,
            source_offer_material_id: item.id,
            line_type: "item",
            title: item.material_name || "Materiale",
            description: item.supplier || null,
            quantity:
              Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
                ? Number(item.quantity)
                : 1,
            unit: item.unit || "stk",
            unit_price: toNumber(item.unit_price),
            line_total: toNumber(item.line_total),
          }))
        : [
            {
              invoice_id: createdInvoice.id,
              user_id: user.id,
              source_offer_material_id: null,
              line_type: "item",
              title: invoiceTitle,
              description: invoiceDescription,
              quantity: 1,
              unit: "stk",
              unit_price: subtotal,
              line_total: subtotal,
            },
          ];

    const { error: invoiceLinesError } = await supabase
      .from("invoice_lines")
      .insert(invoiceLineRows);

    if (invoiceLinesError) {
      console.error("Feil ved opprettelse av fakturalinjer:", invoiceLinesError);

      await supabase
        .from("invoices")
        .delete()
        .eq("id", createdInvoice.id)
        .eq("user_id", user.id);

      redirect(`/offers/${id}?error=Kunne+ikke+opprette+fakturalinjer`);
    }

    redirect(`/invoices/${createdInvoice.id}`);
  }

  async function createTemplateFromOffer(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const offerId = String(formData.get("offerId") || "").trim();
    const templateName = String(formData.get("templateName") || "").trim();
    const templateDescription = String(
      formData.get("templateDescription") || ""
    ).trim();

    if (!offerId) {
      redirect("/dashboard");
    }

    if (!templateName) {
      redirect(`/offers/${offerId}?error=Du+m%C3%A5+gi+materialmalen+et+navn`);
    }

    const { data: sourceOffer, error: sourceOfferError } = await supabase
      .from("offers")
      .select("id, title, description")
      .eq("id", offerId)
      .eq("user_id", user.id)
      .single();

    if (sourceOfferError || !sourceOffer) {
      console.error("Feil ved henting av tilbud for mal:", sourceOfferError);
      redirect(`/offers/${offerId}?error=Kunne+ikke+hente+tilbudet`);
    }

    const { data: sourceMaterials, error: sourceMaterialsError } = await supabase
      .from("offer_materials")
      .select("material_id, quantity")
      .eq("offer_id", offerId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (sourceMaterialsError) {
      console.error(
        "Feil ved henting av materialer for mal:",
        sourceMaterialsError
      );
      redirect(`/offers/${offerId}?error=Kunne+ikke+hente+materiallinjer`);
    }

    const rows = buildTemplateRows(sourceMaterials || [], user.id, "temp");

    if (rows.length === 0) {
      redirect(
        `/offers/${offerId}?error=Tilbudet+m%C3%A5+ha+materialer+fra+materialdatabasen+for+%C3%A5+lage+mal`
      );
    }

    const description =
      templateDescription || String(sourceOffer.description || "").trim() || null;

    const { data: createdTemplate, error: createTemplateError } = await supabase
      .from("material_templates")
      .insert({
        user_id: user.id,
        name: templateName,
        description,
      })
      .select("id")
      .single();

    if (createTemplateError || !createdTemplate) {
      console.error(
        "Feil ved opprettelse av mal fra tilbud:",
        createTemplateError
      );
      redirect(`/offers/${offerId}?error=Kunne+ikke+opprette+materialmal`);
    }

    const insertRows = buildTemplateRows(
      sourceMaterials || [],
      user.id,
      createdTemplate.id
    );

    const { error: insertItemsError } = await supabase
      .from("material_template_items")
      .insert(insertRows);

    if (insertItemsError) {
      console.error(
        "Feil ved opprettelse av mallinjer fra tilbud:",
        insertItemsError
      );

      await supabase
        .from("material_templates")
        .delete()
        .eq("id", createdTemplate.id)
        .eq("user_id", user.id);

      redirect(`/offers/${offerId}?error=Kunne+ikke+lagre+mallinjer`);
    }

    redirect(`/offers/${offerId}?success=Materialmal+opprettet+fra+tilbudet`);
  }

  async function updateExistingTemplateFromOffer(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const offerId = String(formData.get("offerId") || "").trim();
    const templateId = String(formData.get("templateId") || "").trim();
    const syncMode = (String(formData.get("syncMode") || "replace").trim() ||
      "replace") as TemplateSyncMode;
    const overwriteName =
      String(formData.get("overwriteName") || "").trim() === "on";
    const overwriteDescription =
      String(formData.get("overwriteDescription") || "").trim() === "on";

    if (!offerId) {
      redirect("/dashboard");
    }

    if (!templateId) {
      redirect(
        `/offers/${offerId}?error=Velg+en+eksisterende+materialmal+f%C3%B8rst`
      );
    }

    const [
      { data: sourceOffer, error: sourceOfferError },
      { data: template, error: templateError },
      { data: sourceMaterials, error: sourceMaterialsError },
    ] = await Promise.all([
      supabase
        .from("offers")
        .select("id, title, description")
        .eq("id", offerId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("material_templates")
        .select("id, name, description")
        .eq("id", templateId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("offer_materials")
        .select("material_id, quantity")
        .eq("offer_id", offerId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

    if (sourceOfferError || !sourceOffer) {
      console.error(
        "Feil ved henting av tilbud for maloppdatering:",
        sourceOfferError
      );
      redirect(`/offers/${offerId}?error=Kunne+ikke+hente+tilbudet`);
    }

    if (templateError || !template) {
      console.error("Feil ved henting av materialmal:", templateError);
      redirect(`/offers/${offerId}?error=Kunne+ikke+hente+materialmal`);
    }

    if (sourceMaterialsError) {
      console.error(
        "Feil ved henting av materialer for maloppdatering:",
        sourceMaterialsError
      );
      redirect(`/offers/${offerId}?error=Kunne+ikke+hente+materiallinjer`);
    }

    const incomingRows = buildTemplateRows(
      sourceMaterials || [],
      user.id,
      templateId
    );

    if (incomingRows.length === 0) {
      redirect(
        `/offers/${offerId}?error=Tilbudet+m%C3%A5+ha+materialer+fra+materialdatabasen+for+%C3%A5+oppdatere+mal`
      );
    }

    const templateUpdatePayload: {
      name?: string;
      description?: string | null;
    } = {};

    if (overwriteName) {
      templateUpdatePayload.name =
        String(sourceOffer.title || "").trim() || template.name;
    }

    if (overwriteDescription) {
      templateUpdatePayload.description =
        String(sourceOffer.description || "").trim() || null;
    }

    if (Object.keys(templateUpdatePayload).length > 0) {
      const { error: updateTemplateError } = await supabase
        .from("material_templates")
        .update(templateUpdatePayload)
        .eq("id", templateId)
        .eq("user_id", user.id);

      if (updateTemplateError) {
        console.error(
          "Feil ved oppdatering av materialmal:",
          updateTemplateError
        );
        redirect(`/offers/${offerId}?error=Kunne+ikke+oppdatere+maldetaljer`);
      }
    }

    if (syncMode === "replace") {
      const { error: deleteItemsError } = await supabase
        .from("material_template_items")
        .delete()
        .eq("template_id", templateId)
        .eq("user_id", user.id);

      if (deleteItemsError) {
        console.error(
          "Feil ved tømming av eksisterende mallinjer:",
          deleteItemsError
        );
        redirect(
          `/offers/${offerId}?error=Kunne+ikke+t%C3%B8mme+eksisterende+mallinjer`
        );
      }

      const { error: insertItemsError } = await supabase
        .from("material_template_items")
        .insert(incomingRows);

      if (insertItemsError) {
        console.error("Feil ved oppdatering av mallinjer:", insertItemsError);
        redirect(`/offers/${offerId}?error=Kunne+ikke+oppdatere+mallinjer`);
      }

      redirect(
        `/offers/${offerId}?success=Materialmal+ble+erstattet+med+materialene+fra+tilbudet`
      );
    }

    const { data: existingItems, error: existingItemsError } = await supabase
      .from("material_template_items")
      .select("id, material_id, quantity")
      .eq("template_id", templateId)
      .eq("user_id", user.id);

    if (existingItemsError) {
      console.error(
        "Feil ved henting av eksisterende mallinjer:",
        existingItemsError
      );
      redirect(
        `/offers/${offerId}?error=Kunne+ikke+hente+eksisterende+mallinjer`
      );
    }

    const existingMap = new Map(
      (existingItems || []).map((item) => [item.material_id, item])
    );

    const rowsToInsert: {
      template_id: string;
      user_id: string;
      material_id: string | null;
      quantity: number;
    }[] = [];

    const updates = incomingRows
      .map((row) => {
        const existing = existingMap.get(row.material_id);

        if (!existing) {
          rowsToInsert.push(row);
          return null;
        }

        return {
          id: existing.id,
          quantity: row.quantity,
        };
      })
      .filter(Boolean) as { id: string; quantity: number }[];

    for (const updateRow of updates) {
      const { error: updateItemError } = await supabase
        .from("material_template_items")
        .update({
          quantity: updateRow.quantity,
        })
        .eq("id", updateRow.id)
        .eq("user_id", user.id);

      if (updateItemError) {
        console.error(
          "Feil ved oppdatering av eksisterende mallinje:",
          updateItemError
        );
        redirect(
          `/offers/${offerId}?error=Kunne+ikke+oppdatere+eksisterende+mallinje`
        );
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insertNewItemsError } = await supabase
        .from("material_template_items")
        .insert(rowsToInsert);

      if (insertNewItemsError) {
        console.error(
          "Feil ved innlegging av nye mallinjer:",
          insertNewItemsError
        );
        redirect(`/offers/${offerId}?error=Kunne+ikke+legge+til+nye+mallinjer`);
      }
    }

    redirect(
      `/offers/${offerId}?success=Materialmal+ble+oppdatert+uten+%C3%A5+slette+andre+linjer`
    );
  }

  const [
    { data: offer, error },
    { data: templates, error: templatesError },
    { data: existingInvoice, error: existingInvoiceError },
  ] = await Promise.all([
    supabase
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
        customer_id,
        customers(name, email, phone)
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("material_templates")
      .select("id, name, description")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, status, invoice_number")
      .eq("offer_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (error || !offer) {
    notFound();
  }

  if (templatesError) {
    console.error("Feil ved henting av materialmaler:", templatesError);
  }

  if (existingInvoiceError) {
    console.error(
      "Feil ved henting av eksisterende faktura:",
      existingInvoiceError
    );
  }

  const typedOffer = offer as OfferRow;
  const materialTemplates = (templates as MaterialTemplate[] | null) || [];

  const { data: offerMaterials, error: offerMaterialsError } = await supabase
    .from("offer_materials")
    .select(
      "id, material_id, material_name, supplier, unit, quantity, unit_price, waste_percent, markup_percent, line_total"
    )
    .eq("offer_id", typedOffer.id as string)
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
  const defaultTemplateName =
    String(typedOffer.title || "").trim() || "Ny materialmal";

  const totalMaterialRows = materials.length;
  const linkedMaterialRows = materials.filter((item) => item.material_id).length;
  const missingLinkedMaterialRows = totalMaterialRows - linkedMaterialRows;
  const canCreateTemplate = linkedMaterialRows > 0;
  const canCreateInvoice = displayStatus === "approved";
  const existingInvoiceId = String(existingInvoice?.id || "").trim();
  const existingInvoiceNumber = String(existingInvoice?.invoice_number || "").trim();

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-4 pb-28 sm:px-6 sm:py-6 sm:pb-32 lg:px-8 lg:py-8 lg:pb-10">
        <div className="rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Tilbud</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                {typedOffer.title || "Tilbud"}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                <span>Opprettet {formatDateTime(typedOffer.created_at)}</span>
                <span className="hidden sm:inline">•</span>
                <span>Gyldig til {formatDate(typedOffer.valid_until)}</span>
                {typedOffer.approved_at ? (
                  <>
                    <span className="hidden sm:inline">•</span>
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
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Tilbake til dashboard
              </Link>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {successMessage}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5 sm:p-5">
              <p className="text-sm text-neutral-500">Totalpris</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(typedOffer.total)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5 sm:p-5">
              <p className="text-sm text-neutral-500">Arbeid</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(laborValue)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5 sm:p-5">
              <p className="text-sm text-neutral-500">Materialer</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(typedOffer.materials_cost)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5 sm:p-5">
              <p className="text-sm text-neutral-500">MVA</p>
              <p className="mt-2 text-2xl font-bold">
                {formatCurrency(typedOffer.vat_amount)} kr
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
            <section className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5 sm:p-5">
              <h2 className="text-lg font-semibold">Tilbudsinnhold</h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  <p className="mt-1 font-medium break-words">{customer.name}</p>
                  <div className="mt-2 grid gap-2 text-sm text-neutral-500 sm:grid-cols-2">
                    <span className="break-words">E-post: {customer.email || "-"}</span>
                    <span className="break-words">Telefon: {customer.phone || "-"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
                <p className="text-sm text-neutral-500">Beskrivelse</p>
                <p className="mt-2 whitespace-pre-wrap break-words">
                  {typedOffer.description || "-"}
                </p>
              </div>
            </section>

            <section className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5 sm:p-5 lg:sticky lg:top-6">
              <h2 className="text-lg font-semibold">Handlinger og maler</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Herfra kan du åpne PDF, sende e-post, dele kundelenken, lage
                faktura og bygge materialmaler fra tilbudet.
              </p>

              <div className="mt-4 grid gap-3">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white"
                >
                  Åpne PDF
                </a>

                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                >
                  Last ned PDF
                </a>

                <form action={sendUrl} method="post">
                  <button
                    type="submit"
                    className="w-full min-h-[48px] rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white"
                  >
                    Send tilbud på e-post
                  </button>
                </form>

                {existingInvoiceId ? (
                  <Link
                    href={`/invoices/${existingInvoiceId}`}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-green-600 px-4 py-3 text-center text-sm font-medium text-white"
                  >
                    Åpne faktura
                  </Link>
                ) : (
                  <form action={createInvoiceFromOffer}>
                    <button
                      type="submit"
                      disabled={!canCreateInvoice}
                      className="w-full min-h-[48px] rounded-2xl bg-green-600 px-4 py-3 text-center text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Lag faktura
                    </button>
                  </form>
                )}

                <Link
                  href="/materials"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-900"
                >
                  Åpne materialmaler
                </Link>
              </div>

              {!canCreateInvoice && !existingInvoiceId ? (
                <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
                  Faktura kan først opprettes når tilbudet er godkjent.
                </div>
              ) : null}

              {existingInvoiceId ? (
                <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                  Dette tilbudet har allerede en faktura koblet til seg
                  {existingInvoiceNumber ? ` (nr. ${existingInvoiceNumber})` : ""}.
                </div>
              ) : null}

              <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-sm font-medium text-neutral-900">
                  Materialgrunnlag for mal
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Materiallinjer totalt</p>
                    <p className="mt-1 text-lg font-bold">{totalMaterialRows}</p>
                  </div>

                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Kan brukes i mal</p>
                    <p className="mt-1 text-lg font-bold">{linkedMaterialRows}</p>
                  </div>

                  <div className="rounded-2xl bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Mangler kobling</p>
                    <p className="mt-1 text-lg font-bold">{missingLinkedMaterialRows}</p>
                  </div>
                </div>

                <p className="mt-3 text-sm text-neutral-600">
                  Bare materialer som er koblet til materialdatabasen blir med i
                  materialmaler.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-900">
                  Lag ny materialmal fra dette tilbudet
                </p>
                <p className="mt-1 text-sm text-emerald-800">
                  Lager en ny mal basert på materialene i dette tilbudet.
                </p>

                <form action={createTemplateFromOffer} className="mt-4 space-y-3">
                  <input type="hidden" name="offerId" value={typedOffer.id || ""} />

                  <div>
                    <label className="block text-sm font-medium text-emerald-900">
                      Navn på mal
                    </label>
                    <input
                      name="templateName"
                      defaultValue={defaultTemplateName}
                      className="mt-2 min-h-[48px] w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                      placeholder="F.eks. Lettvegg standard"
                      disabled={!canCreateTemplate}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-emerald-900">
                      Beskrivelse
                    </label>
                    <textarea
                      name="templateDescription"
                      rows={3}
                      defaultValue={typedOffer.description || ""}
                      className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3"
                      placeholder="Kort beskrivelse av hva malen brukes til"
                      disabled={!canCreateTemplate}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!canCreateTemplate}
                    className="w-full min-h-[48px] rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Lag materialmal fra tilbud
                  </button>
                </form>
              </div>

              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900">
                  Oppdater eksisterende materialmal fra dette tilbudet
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Velg om malen skal erstattes helt, eller om vi bare skal
                  oppdatere og legge til materialer.
                </p>

                <form action={updateExistingTemplateFromOffer} className="mt-4 space-y-3">
                  <input type="hidden" name="offerId" value={typedOffer.id || ""} />

                  <div>
                    <label className="block text-sm font-medium text-amber-900">
                      Velg materialmal
                    </label>
                    <select
                      name="templateId"
                      defaultValue=""
                      className="mt-2 min-h-[48px] w-full rounded-2xl border border-amber-200 bg-white px-4 py-3"
                      disabled={!canCreateTemplate || materialTemplates.length === 0}
                    >
                      <option value="">Velg eksisterende materialmal</option>
                      {materialTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-amber-900">
                      Oppdateringsmåte
                    </label>

                    <div className="mt-2 space-y-3 rounded-2xl bg-white p-4">
                      <label className="flex items-start gap-3 text-sm text-amber-900">
                        <input
                          type="radio"
                          name="syncMode"
                          value="replace"
                          defaultChecked
                          className="mt-1 h-4 w-4"
                          disabled={!canCreateTemplate || materialTemplates.length === 0}
                        />
                        <span>
                          <span className="block font-medium">Erstatt hele malen</span>
                          <span className="block text-amber-800">
                            Sletter eksisterende mallinjer og legger inn nøyaktig
                            det som finnes i dette tilbudet.
                          </span>
                        </span>
                      </label>

                      <label className="flex items-start gap-3 text-sm text-amber-900">
                        <input
                          type="radio"
                          name="syncMode"
                          value="merge"
                          className="mt-1 h-4 w-4"
                          disabled={!canCreateTemplate || materialTemplates.length === 0}
                        />
                        <span>
                          <span className="block font-medium">
                            Legg til og oppdater kun matchende materialer
                          </span>
                          <span className="block text-amber-800">
                            Beholder andre linjer i malen, oppdaterer antall på
                            materialer som finnes fra før, og legger til nye.
                          </span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl bg-white p-4">
                    <label className="flex items-start gap-3 text-sm text-amber-900">
                      <input
                        type="checkbox"
                        name="overwriteName"
                        className="mt-1 h-4 w-4"
                        disabled={!canCreateTemplate || materialTemplates.length === 0}
                      />
                      <span>Oppdater også navn på malen fra tilbudstittelen</span>
                    </label>

                    <label className="flex items-start gap-3 text-sm text-amber-900">
                      <input
                        type="checkbox"
                        name="overwriteDescription"
                        className="mt-1 h-4 w-4"
                        disabled={!canCreateTemplate || materialTemplates.length === 0}
                      />
                      <span>Oppdater også beskrivelse på malen fra tilbudsteksten</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={!canCreateTemplate || materialTemplates.length === 0}
                    className="w-full min-h-[48px] rounded-2xl bg-amber-500 px-4 py-3 text-center text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Oppdater valgt materialmal
                  </button>
                </form>

                {materialTemplates.length === 0 ? (
                  <p className="mt-3 text-sm text-amber-900">
                    Du har ingen materialmaler enda. Lag en ny først.
                  </p>
                ) : null}
              </div>

              <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4">
                <p className="text-sm text-neutral-500">Kundelenke</p>

                <p className="mt-2 break-all rounded-xl bg-neutral-100 px-3 py-3 text-sm">
                  {publicUrl || "Mangler delingslenke"}
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  {publicUrl ? (
                    <>
                      <Link
                        href={publicUrl}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-black px-4 py-3 text-center text-sm font-medium text-white"
                      >
                        Åpne kundelenke
                      </Link>

                      <CopyLinkButton url={publicUrl} offerId={typedOffer.id || ""} />
                    </>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-2xl border border-neutral-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">Materialer</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Materialer som er lagt inn på tilbudet.
                </p>
              </div>

              <div className="inline-flex w-fit rounded-xl bg-neutral-100 px-3 py-2 text-sm font-medium">
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

                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
                            <span>{item.supplier || "Ukjent leverandør"}</span>
                            <span className="hidden sm:inline">•</span>
                            <span>{item.unit || "stk"}</span>
                          </div>
                        </div>

                        <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
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

          <section className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 sm:p-5">
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

          <section className="mt-6 rounded-2xl bg-neutral-100 p-4 sm:p-5">
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 gap-3">
            {existingInvoiceId ? (
              <Link
                href={`/invoices/${existingInvoiceId}`}
                className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-green-600 px-4 py-4 text-center text-sm font-medium text-white"
              >
                Åpne faktura
              </Link>
            ) : (
              <form action={createInvoiceFromOffer}>
                <button
                  type="submit"
                  disabled={!canCreateInvoice}
                  className="w-full min-h-[52px] rounded-2xl bg-green-600 px-4 py-4 text-center text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Lag faktura
                </button>
              </form>
            )}

            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-black px-4 py-4 text-center text-sm font-medium text-white"
            >
              Åpne PDF
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}