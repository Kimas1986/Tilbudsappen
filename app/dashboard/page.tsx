import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OfferRow = {
  id: string;
  title: string | null;
  total: number | null;
  status: string;
  description: string | null;
  created_at: string | null;
  valid_until: string | null;
  approved_at: string | null;
  customers:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

function isExpired(validUntil: string | null) {
  if (!validUntil) return false;
  const date = new Date(validUntil);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
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

function getCustomerName(offer: OfferRow) {
  if (Array.isArray(offer.customers)) {
    return offer.customers[0]?.name || "Uten kunde";
  }

  return offer.customers?.name || "Uten kunde";
}

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

function getStatusCount(offers: OfferRow[], status: string) {
  return offers.filter((offer) => getDisplayStatus(offer) === status).length;
}

function sumOfferValues(offers: OfferRow[], statuses?: string[]) {
  return offers.reduce((sum, offer) => {
    const displayStatus = getDisplayStatus(offer);

    if (statuses && !statuses.includes(displayStatus)) {
      return sum;
    }

    return sum + Number(offer.total || 0);
  }, 0);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("Feil ved henting av bruker på dashboard:", userError);
  }

  if (!user) {
    redirect("/login");
  }

  async function deleteOffer(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const offerId = String(formData.get("offerId") || "").trim();

    if (!offerId) {
      redirect("/dashboard");
    }

    await supabase
      .from("offers")
      .delete()
      .eq("id", offerId)
      .eq("user_id", user.id);

    redirect("/dashboard");
  }

  const { data: offers, error } = await supabase
    .from("offers")
    .select(
      "id, title, total, status, description, created_at, valid_until, approved_at, customers(name)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Feil ved henting av tilbud:", error);
  }

  const typedOffers = (offers as OfferRow[] | null) || [];

  const draftCount = getStatusCount(typedOffers, "draft");
  const sentCount = getStatusCount(typedOffers, "sent");
  const approvedCount = getStatusCount(typedOffers, "approved");
  const expiredCount = getStatusCount(typedOffers, "expired");

  const totalSentValue = sumOfferValues(typedOffers, ["sent"]);
  const totalApprovedValue = sumOfferValues(typedOffers, ["approved"]);
  const totalDraftValue = sumOfferValues(typedOffers, ["draft"]);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-neutral-500">Tilbudsapp</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                Dashboard
              </h1>
              <p className="mt-4 text-neutral-600">Du er logget inn som:</p>
              <p className="mt-2 inline-flex rounded-2xl bg-neutral-100 px-4 py-3 font-medium">
                {user.email}
              </p>
              <p className="mt-4 max-w-2xl text-sm text-neutral-600">
                Her ser du status på tilbudene dine, hva som ligger ute akkurat nå
                og kan gå rett videre til tilbud, økonomi, fakturaer og materialer.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[420px]">
              <a
                href="/offers/new"
                className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-medium text-white"
              >
                + Nytt tilbud
              </a>

              <a
                href="/economy"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Økonomi
              </a>

              <a
                href="/materials"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Materialdatabase
              </a>

              <a
                href="/invoices"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Fakturaer
              </a>

              <a
                href="/settings"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Innstillinger
              </a>

              <a
                href="/logout"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Logg ut
              </a>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-yellow-50 p-5 ring-1 ring-yellow-100">
              <p className="text-sm text-yellow-800">Utkast</p>
              <p className="mt-2 text-2xl font-bold text-yellow-900">
                {draftCount}
              </p>
              <p className="mt-2 text-sm text-yellow-900/80">
                {formatCurrency(totalDraftValue)} kr i utkast
              </p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100">
              <p className="text-sm text-blue-800">Sendt</p>
              <p className="mt-2 text-2xl font-bold text-blue-900">
                {sentCount}
              </p>
              <p className="mt-2 text-sm text-blue-900/80">
                {formatCurrency(totalSentValue)} kr ute hos kunder
              </p>
            </div>

            <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100">
              <p className="text-sm text-green-800">Godkjent</p>
              <p className="mt-2 text-2xl font-bold text-green-900">
                {approvedCount}
              </p>
              <p className="mt-2 text-sm text-green-900/80">
                {formatCurrency(totalApprovedValue)} kr godkjent
              </p>
            </div>

            <div className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-100">
              <p className="text-sm text-red-800">Utløpt</p>
              <p className="mt-2 text-2xl font-bold text-red-900">
                {expiredCount}
              </p>
              <p className="mt-2 text-sm text-red-900/80">
                Trenger oppfølging
              </p>
            </div>
          </div>

          <div className="mt-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Dine tilbud</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Kundenavn ligger øverst, med pris, dato, status og jobbtittel
                  under.
                </p>
              </div>
            </div>

            {typedOffers.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-neutral-50 p-6 ring-1 ring-black/5">
                <p className="text-neutral-500">Ingen tilbud enda.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {typedOffers.map((offer) => {
                  const displayStatus = getDisplayStatus(offer);

                  return (
                    <div
                      key={offer.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-4 transition hover:bg-neutral-50"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <a href={`/offers/${offer.id}`} className="min-w-0 flex-1">
                          <p className="truncate text-lg font-semibold">
                            {getCustomerName(offer)}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                            <span>{formatCurrency(offer.total)} kr</span>
                            <span>•</span>
                            <span>{formatDate(offer.created_at)}</span>
                            {offer.title ? (
                              <>
                                <span>•</span>
                                <span className="truncate">{offer.title}</span>
                              </>
                            ) : null}
                          </div>

                          <p className="mt-2 text-sm text-neutral-500">
                            Gyldig til: {formatDate(offer.valid_until)}
                          </p>

                          {offer.description ? (
                            <p className="mt-2 line-clamp-2 text-sm text-neutral-500">
                              {offer.description}
                            </p>
                          ) : null}
                        </a>

                        <div className="flex flex-col items-start gap-3 lg:items-end">
                          <span
                            className={`rounded-lg px-3 py-1 text-sm font-medium ${getStatusClasses(
                              displayStatus
                            )}`}
                          >
                            {getStatusLabel(displayStatus)}
                          </span>

                          <div className="flex gap-2">
                            <a
                              href={`/offers/${offer.id}`}
                              className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-900"
                            >
                              Åpne
                            </a>

                            <form action={deleteOffer}>
                              <input type="hidden" name="offerId" value={offer.id} />
                              <button
                                type="submit"
                                className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700"
                              >
                                Slett
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}