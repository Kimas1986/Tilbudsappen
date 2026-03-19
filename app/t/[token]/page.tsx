import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatCurrency(value: number | null) {
  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("no-NO");
  } catch {
    return "-";
  }
}

function isOfferExpired(validUntil: string | null) {
  if (!validUntil) return false;

  const expiry = new Date(validUntil);

  if (Number.isNaN(expiry.getTime())) {
    return false;
  }

  return expiry.getTime() < Date.now();
}

export default async function PublicOfferPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();

  const { data: offer, error } = await supabase
    .from("offers")
    .select("*, customers(*), user_id")
    .eq("share_token", token)
    .single();

  if (error || !offer) {
    notFound();
  }

  const { data: settings } = await supabase
    .from("ai_settings")
    .select("company_name, contact_name, contact_phone")
    .eq("user_id", offer.user_id)
    .maybeSingle();

  const isApproved = offer.status === "approved";
  const isExpired = isOfferExpired(offer.valid_until);

  async function approveOffer() {
    "use server";

    const supabase = await createClient();

    const { data: currentOffer, error } = await supabase
      .from("offers")
      .select("id, status, valid_until")
      .eq("id", offer.id)
      .single();

    if (error || !currentOffer) {
      return;
    }

    const expired = isOfferExpired(currentOffer.valid_until);

    if (currentOffer.status === "approved" || expired) {
      return;
    }

    await supabase
      .from("offers")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", offer.id);
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">
              {settings?.company_name || "Tilbud"}
            </h1>

            <p className="mt-2 text-sm text-neutral-500">
              {settings?.contact_name || ""}
            </p>

            {settings?.contact_phone ? (
              <p className="text-sm text-neutral-500">
                {settings.contact_phone}
              </p>
            ) : null}
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              {offer.title || "Tilbud"}
            </h2>

            <p className="mt-2 text-sm text-neutral-500">
              Opprettet: {formatDate(offer.created_at)}
            </p>

            <p
              className={`text-sm font-medium ${
                isExpired ? "text-red-700" : "text-red-600"
              }`}
            >
              Gyldig til: {formatDate(offer.valid_until)}
            </p>
          </div>

          <div className="mb-6">
            <p className="whitespace-pre-wrap">{offer.description || "-"}</p>
          </div>

          <div className="mb-6 rounded-2xl bg-neutral-100 p-5">
            <p className="text-sm text-neutral-500">Totalt</p>
            <p className="mt-1 text-2xl font-bold">
              {formatCurrency(offer.total)} kr
            </p>
          </div>

          {isApproved ? (
            <div className="rounded-2xl bg-green-100 p-4 text-green-800">
              <p className="font-medium">Tilbud er godkjent ✅</p>
            </div>
          ) : isExpired ? (
            <div className="rounded-2xl bg-red-100 p-4 text-red-800">
              <p className="font-medium">Tilbudet er utløpt</p>
              <p className="mt-1 text-sm">
                Ta kontakt dersom du ønsker et oppdatert tilbud.
              </p>
            </div>
          ) : (
            <form action={approveOffer}>
              <button
                type="submit"
                className="w-full rounded-2xl bg-black px-4 py-4 text-lg font-medium text-white"
              >
                Godkjenn tilbud
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}