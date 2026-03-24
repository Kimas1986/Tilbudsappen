import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendPushToSubscriptions } from "@/lib/push/send";

type PublicOffer = {
  id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  total: number | null;
  subtotal: number | null;
  vat_amount: number | null;
  vat_enabled: boolean | null;
  status: string;
  created_at: string | null;
  valid_until: string | null;
  approved_at: string | null;
  share_token: string | null;
};

type CompanySettings = {
  company_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
};

type SearchParams = Promise<{
  success?: string;
}>;

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

function formatDateTime(value: string | null) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("no-NO");
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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: SearchParams;
}) {
  const { token } = await params;
  const resolvedSearchParams = await searchParams;
  const successMessage = String(resolvedSearchParams?.success || "").trim();

  const supabase = await createClient();

  const { data: offer, error } = await supabase
    .from("offers")
    .select(
      "id, user_id, title, description, total, subtotal, vat_amount, vat_enabled, status, created_at, valid_until, approved_at, share_token"
    )
    .eq("share_token", token)
    .single();

  if (error || !offer) {
    notFound();
  }

  const typedOffer = offer as PublicOffer;

  const { data: settings } = await supabase
    .from("ai_settings")
    .select("company_name, contact_name, contact_phone")
    .eq("user_id", typedOffer.user_id)
    .maybeSingle();

  const companySettings = (settings || null) as CompanySettings | null;

  const isApproved = typedOffer.status === "approved";
  const isExpired = isOfferExpired(typedOffer.valid_until);

  async function approveOffer() {
    "use server";

    const supabase = await createClient();

    const { data: currentOffer, error } = await supabase
      .from("offers")
      .select("id, user_id, title, total, status, valid_until, share_token")
      .eq("id", typedOffer.id)
      .single();

    if (error || !currentOffer) {
      redirect(`/t/${token}`);
    }

    const expired = isOfferExpired(currentOffer.valid_until);

    if (currentOffer.status === "approved") {
      redirect(`/t/${token}?success=already-approved`);
    }

    if (expired) {
      redirect(`/t/${token}`);
    }

    const approvedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("offers")
      .update({
        status: "approved",
        approved_at: approvedAt,
      })
      .eq("id", typedOffer.id);

    if (updateError) {
      redirect(`/t/${token}`);
    }

    try {
      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", currentOffer.user_id);

      if (subscriptionsError) {
        console.error("Feil ved henting av push subscriptions:", subscriptionsError);
      } else {
        const validSubscriptions = ((subscriptions as PushSubscriptionRow[] | null) || [])
          .filter((item) => item.endpoint && item.p256dh && item.auth);

        if (validSubscriptions.length > 0) {
          await sendPushToSubscriptions(validSubscriptions, {
            title: "Tilbud godkjent",
            body: `${
              String(currentOffer.title || "").trim() || "Et tilbud"
            } er godkjent${currentOffer.total ? ` • ${formatCurrency(currentOffer.total)} kr` : ""}.`,
            url: `/offers/${currentOffer.id}`,
          });
        }
      }
    } catch (pushError) {
      console.error("Feil ved sending av push:", pushError);
    }

    redirect(`/t/${token}?success=approved`);
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="border-b border-neutral-200 pb-6">
            <p className="text-sm font-medium text-neutral-500">Tilbud</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              {companySettings?.company_name || "Tilbud"}
            </h1>

            {(companySettings?.contact_name || companySettings?.contact_phone) && (
              <div className="mt-3 space-y-1 text-sm text-neutral-500">
                {companySettings?.contact_name ? (
                  <p>{companySettings.contact_name}</p>
                ) : null}

                {companySettings?.contact_phone ? (
                  <p>{companySettings.contact_phone}</p>
                ) : null}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold">
                {typedOffer.title || "Tilbud"}
              </h2>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <span>Opprettet {formatDate(typedOffer.created_at)}</span>
                <span>•</span>
                <span
                  className={isExpired ? "font-medium text-red-700" : undefined}
                >
                  Gyldig til {formatDate(typedOffer.valid_until)}
                </span>
                {typedOffer.approved_at ? (
                  <>
                    <span>•</span>
                    <span>Godkjent {formatDateTime(typedOffer.approved_at)}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl bg-neutral-100 px-4 py-3 text-right">
              <p className="text-sm text-neutral-500">Totalt</p>
              <p className="mt-1 text-2xl font-bold">
                {formatCurrency(typedOffer.total)} kr
              </p>
            </div>
          </div>

          {successMessage === "approved" ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Tilbudet er nå godkjent.
            </div>
          ) : null}

          {successMessage === "already-approved" ? (
            <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Tilbudet var allerede godkjent.
            </div>
          ) : null}

          <div className="mt-8 rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
            <p className="text-sm text-neutral-500">Beskrivelse</p>
            <p className="mt-2 whitespace-pre-wrap leading-7">
              {typedOffer.description || "-"}
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Subtotal</p>
              <p className="mt-1 text-lg font-bold">
                {formatCurrency(typedOffer.subtotal)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">MVA</p>
              <p className="mt-1 text-lg font-bold">
                {formatCurrency(typedOffer.vat_amount)} kr
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-50 p-4 ring-1 ring-black/5">
              <p className="text-sm text-neutral-500">Totalt</p>
              <p className="mt-1 text-lg font-bold">
                {formatCurrency(typedOffer.total)} kr
              </p>
            </div>
          </div>

          <div className="mt-8">
            {isApproved ? (
              <div className="rounded-2xl bg-green-100 p-5 text-green-800">
                <p className="text-lg font-semibold">Tilbudet er godkjent ✅</p>
                <p className="mt-2 text-sm">
                  Takk. Tilbudet er registrert som godkjent.
                </p>
              </div>
            ) : isExpired ? (
              <div className="rounded-2xl bg-red-100 p-5 text-red-800">
                <p className="text-lg font-semibold">Tilbudet er utløpt</p>
                <p className="mt-2 text-sm">
                  Ta kontakt dersom du ønsker et oppdatert tilbud.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 p-5">
                <h3 className="text-lg font-semibold">Godkjenn tilbud</h3>
                <p className="mt-2 text-sm text-neutral-600">
                  Når du trykker på knappen under, registreres tilbudet som
                  godkjent.
                </p>

                <form action={approveOffer} className="mt-4">
                  <button
                    type="submit"
                    className="w-full cursor-pointer rounded-2xl bg-black px-4 py-4 text-lg font-medium text-white"
                  >
                    Godkjenn tilbud
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}