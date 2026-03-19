import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type OfferRow = {
  id: string;
  title: string | null;
  total: number | null;
  created_at: string | null;
  status: string;
  description: string | null;
  customer_id: string | null;
  valid_until: string | null;
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
  return new Date(value).toLocaleDateString("no-NO");
}

function getStatusCount(offers: OfferRow[], status: string) {
  return offers.filter((offer) => getDisplayStatus(offer) === status).length;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      "id, title, total, created_at, status, description, customer_id, valid_until, customers(name)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Feil ved henting av tilbud:", error);
  }

  const typedOffers = (offers as OfferRow[] | null) || [];
  const draftCount = getStatusCount(typedOffers, "draft");
  const sentCount = getStatusCount(typedOffers, "sent");
  const approvedCount = getStatusCount(typedOffers, "approved");

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="mt-4 text-neutral-600">Du er logget inn som:</p>
              <p className="mt-2 rounded-2xl bg-neutral-100 px-4 py-3 font-medium">
                {user.email}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:w-56">
              <a
                href="/offers/new"
                className="rounded-2xl bg-black px-5 py-3 text-center text-sm font-medium text-white"
              >
                + Nytt tilbud
              </a>

              <a
                href="/materials"
                className="rounded-2xl border border-neutral-300 px-5 py-3 text-center text-sm font-medium text-neutral-900"
              >
                Materialdatabase
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

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-yellow-50 p-4 ring-1 ring-yellow-100">
              <p className="text-sm text-yellow-800">Utkast</p>
              <p className="mt-2 text-2xl font-bold text-yellow-900">
                {draftCount}
              </p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100">
              <p className="text-sm text-blue-800">Sendt</p>
              <p className="mt-2 text-2xl font-bold text-blue-900">
                {sentCount}
              </p>
            </div>

            <div className="rounded-2xl bg-green-50 p-4 ring-1 ring-green-100">
              <p className="text-sm text-green-800">Godkjent</p>
              <p className="mt-2 text-2xl font-bold text-green-900">
                {approvedCount}
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl bg-neutral-50 p-5 ring-1 ring-black/5">
            <h2 className="text-lg font-semibold">Innstillinger</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Her kan du justere bedriftsprofil, gyldighet på tilbud og AI-oppsett.
            </p>

            <div className="mt-4">
              <a
                href="/settings"
                className="inline-flex rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
              >
                Åpne innstillinger
              </a>
            </div>
          </div>

          <div className="mt-10">
            <h2 className="text-lg font-semibold">Dine tilbud</h2>

            {typedOffers.length === 0 ? (
              <p className="mt-4 text-neutral-500">Ingen tilbud enda</p>
            ) : (
              <div className="mt-4 space-y-3">
                {typedOffers.map((offer) => {
                  const displayStatus = getDisplayStatus(offer);

                  return (
                    <div
                      key={offer.id}
                      className="rounded-xl border p-4 transition hover:bg-neutral-50"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <a href={`/offers/${offer.id}`} className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {getCustomerName(offer)}
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
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

                          <p className="mt-1 text-sm text-neutral-500">
                            Gyldig til: {formatDate(offer.valid_until)}
                          </p>

                          {offer.description ? (
                            <p className="mt-2 line-clamp-2 text-sm text-neutral-500">
                              {offer.description}
                            </p>
                          ) : null}
                        </a>

                        <div className="flex flex-col items-start gap-3 sm:items-end">
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