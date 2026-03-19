import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import CopyLinkButton from "@/components/copy-link-button";
import { createClient } from "@/lib/supabase/server";

function getStatusLabel(status: string) {
  if (status === "approved") return "Godkjent";
  if (status === "draft") return "Utkast";
  if (status === "sent") return "Sendt";
  if (status === "rejected") return "Avslått";
  return status;
}

function getStatusClasses(status: string) {
  if (status === "approved") {
    return "bg-green-100 text-green-800";
  }

  if (status === "draft") {
    return "bg-yellow-100 text-yellow-800";
  }

  if (status === "sent") {
    return "bg-blue-100 text-blue-800";
  }

  if (status === "rejected") {
    return "bg-red-100 text-red-800";
  }

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

export default async function OfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: offer, error } = await supabase
    .from("offers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !offer) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const publicUrl = `${baseUrl}/t/${offer.share_token}`;
  const pdfUrl = `/api/offers/${offer.id}/pdf`;
  const sendUrl = `/api/offers/${offer.id}/send`;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">{offer.title || "Tilbud"}</h1>

              <p className="mt-2 text-sm text-neutral-500">
                Opprettet{" "}
                {offer.created_at
                  ? new Date(offer.created_at).toLocaleString("no-NO")
                  : "-"}
              </p>

              <p className="mt-1 text-sm text-neutral-500">
                Gyldig til {formatDate(offer.valid_until)}
              </p>
            </div>

            <span
              className={`w-fit rounded-lg px-3 py-1 text-sm font-medium ${getStatusClasses(
                offer.status
              )}`}
            >
              {getStatusLabel(offer.status)}
            </span>
          </div>

          <div className="mt-6">
            <p className="text-sm text-neutral-500">Beskrivelse</p>
            <p className="mt-1 whitespace-pre-wrap">{offer.description || "-"}</p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-neutral-100 p-4">
              <p className="text-sm text-neutral-500">Prisform</p>
              <p className="mt-1 font-medium">
                {offer.price_type === "fixed" ? "Fastpris" : "Timepris"}
              </p>
            </div>

            <div className="rounded-2xl bg-neutral-100 p-4">
              <p className="text-sm text-neutral-500">MVA</p>
              <p className="mt-1 font-medium">
                {offer.vat_enabled ? "Ja" : "Nei"}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-2 rounded-2xl bg-neutral-100 p-4">
            <p>Subtotal: {offer.subtotal} kr</p>
            <p>MVA: {offer.vat_amount} kr</p>
            <p className="text-lg font-bold">Totalt: {offer.total} kr</p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-neutral-900 px-4 py-2 text-center text-white"
            >
              Åpne PDF
            </a>

            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-neutral-300 px-4 py-2 text-center"
            >
              Last ned PDF
            </a>

            <form action={sendUrl} method="post">
              <button
                type="submit"
                className="w-full rounded-2xl bg-blue-600 px-4 py-2 text-center text-white sm:w-auto"
              >
                Send tilbud på e-post
              </button>
            </form>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-200 p-4">
            <p className="text-sm text-neutral-500">Kundelenke</p>

            <p className="mt-2 break-all rounded-xl bg-neutral-100 px-3 py-2 text-sm">
              {publicUrl}
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Link
                href={publicUrl}
                className="rounded-2xl bg-black px-4 py-2 text-center text-white"
              >
                Åpne kundelenke
              </Link>

              <CopyLinkButton url={publicUrl} offerId={offer.id} />

              <Link
                href="/dashboard"
                className="rounded-2xl border border-neutral-300 px-4 py-2 text-center"
              >
                Tilbake
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}