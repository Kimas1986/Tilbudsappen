"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function toNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createOffer(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const customerName = String(formData.get("customer") || "").trim();
  const customerEmail = String(formData.get("customerEmail") || "")
    .trim()
    .toLowerCase();
  const customerPhone = String(formData.get("customerPhone") || "").trim();

  const titleInput = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const priceType = String(formData.get("priceType") || "fixed");

  const fixedPrice = toNumber(String(formData.get("fixedPrice") || ""));
  const hourlyRate = toNumber(String(formData.get("hourlyRate") || ""));
  const hours = toNumber(String(formData.get("hours") || ""));
  const materials = toNumber(String(formData.get("materials") || ""));

  const vatEnabled = formData.get("vatEnabled") === "on";

  const subtotal =
    priceType === "fixed"
      ? fixedPrice + materials
      : hourlyRate * hours + materials;

  const vat = vatEnabled ? subtotal * 0.25 : 0;
  const total = subtotal + vat;

  const title =
    titleInput.length > 0
      ? titleInput
      : description.length > 0
        ? description.slice(0, 120)
        : customerName
          ? `Tilbud til ${customerName}`
          : "Tilbud";

  let customerId: string | null = null;

  if (customerEmail) {
    const { data: existingCustomer, error: existingCustomerError } =
      await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .eq("email", customerEmail)
        .maybeSingle();

    if (existingCustomerError) {
      console.error("Feil ved oppslag av kunde:", existingCustomerError);
      redirect("/offers/new");
    }

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;

      const { error: updateCustomerError } = await supabase
        .from("customers")
        .update({
          name: customerName || null,
          phone: customerPhone || null,
        })
        .eq("id", customerId)
        .eq("user_id", user.id);

      if (updateCustomerError) {
        console.error("Feil ved oppdatering av kunde:", updateCustomerError);
        redirect("/offers/new");
      }
    } else {
      const { data: newCustomer, error: insertCustomerError } = await supabase
        .from("customers")
        .insert({
          user_id: user.id,
          name: customerName || null,
          email: customerEmail,
          phone: customerPhone || null,
        })
        .select("id")
        .single();

      if (insertCustomerError || !newCustomer) {
        console.error("Feil ved opprettelse av kunde:", insertCustomerError);
        redirect("/offers/new");
      }

      customerId = newCustomer.id;
    }
  }

  const { error } = await supabase.from("offers").insert({
    user_id: user.id,
    customer_id: customerId,
    title,
    description,
    price_type: priceType,
    fixed_price: priceType === "fixed" ? fixedPrice : null,
    hourly_rate: priceType === "hourly" ? hourlyRate : null,
    hours: priceType === "hourly" ? hours : null,
    materials_cost: materials,
    vat_enabled: vatEnabled,
    vat_rate: 25,
    subtotal,
    vat_amount: vat,
    total,
    status: "draft",
  });

  if (error) {
    console.error("Feil ved lagring av tilbud:", error);
    redirect("/offers/new");
  }

  redirect("/dashboard");
}