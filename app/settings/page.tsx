import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: settings, error: settingsError } = await supabase
    .from("ai_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsError) {
    console.error("Feil ved henting av innstillinger:", settingsError);
  }

  async function saveSettings(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const trade = String(formData.get("trade") || "").trim();
    const hourlyRateRaw = String(formData.get("hourly_rate_default") || "").trim();
    const pricing = String(formData.get("pricing_preference") || "auto").trim();
    const tone = String(formData.get("tone") || "professional").trim();
    const terms = String(formData.get("default_terms") || "").trim();

    const companyName = String(formData.get("company_name") || "").trim();
    const contactName = String(formData.get("contact_name") || "").trim();
    const contactPhone = String(formData.get("contact_phone") || "").trim();

    const offerValidDaysRaw = String(formData.get("offer_valid_days") || "").trim();

    const hourlyRate = Number(hourlyRateRaw || 0);
    const offerValidDays = Number(offerValidDaysRaw || 14);

    const { error } = await supabase.from("ai_settings").upsert(
      {
        user_id: user.id,
        trade,
        hourly_rate_default: Number.isFinite(hourlyRate) ? hourlyRate : 0,
        pricing_preference: pricing,
        tone,
        default_terms: terms,
        company_name: companyName,
        contact_name: contactName,
        contact_phone: contactPhone,
        offer_valid_days:
          Number.isFinite(offerValidDays) && offerValidDays > 0
            ? Math.round(offerValidDays)
            : 14,
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) {
      console.error("Feil ved lagring av innstillinger:", error);
      redirect("/settings");
    }

    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <h1 className="text-2xl font-bold">Innstillinger</h1>

          <p className="mt-2 text-sm text-neutral-500">
            Her kan du både lære opp AI-assistenten din og fylle inn bedriftsprofil
            som brukes i tilbud og e-post.
          </p>

          <form action={saveSettings} className="mt-8 space-y-8">
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Bedriftsprofil</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Denne informasjonen brukes i utsending av tilbud og senere i PDF/signatur.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium">Firmanavn</label>
                  <input
                    name="company_name"
                    defaultValue={settings?.company_name || ""}
                    placeholder="F.eks. Stoum Bygg AS"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Kontaktperson</label>
                  <input
                    name="contact_name"
                    defaultValue={settings?.contact_name || ""}
                    placeholder="F.eks. Kim Andre Stoum"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Telefon</label>
                  <input
                    name="contact_phone"
                    defaultValue={settings?.contact_phone || ""}
                    placeholder="F.eks. 900 00 000"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Tilbud gyldig i antall dager
                  </label>
                  <input
                    name="offer_valid_days"
                    type="number"
                    min={1}
                    defaultValue={settings?.offer_valid_days || 14}
                    placeholder="F.eks. 14"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>
              </div>
            </section>

            <section className="border-t border-neutral-200 pt-8">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">AI-innstillinger</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Dette gjør at AI lager mer treffsikre tilbud for deg.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium">Fagområde</label>
                  <input
                    name="trade"
                    defaultValue={settings?.trade || ""}
                    placeholder="F.eks. snekker"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Standard timepris</label>
                  <input
                    name="hourly_rate_default"
                    type="number"
                    defaultValue={settings?.hourly_rate_default || ""}
                    placeholder="F.eks. 950"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Foretrukket prisform</label>
                  <select
                    name="pricing_preference"
                    defaultValue={settings?.pricing_preference || "auto"}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  >
                    <option value="auto">Auto</option>
                    <option value="fixed">Fastpris</option>
                    <option value="hourly">Timepris</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium">Skrivestil</label>
                  <select
                    name="tone"
                    defaultValue={settings?.tone || "professional"}
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  >
                    <option value="short">Kort</option>
                    <option value="professional">Profesjonell</option>
                    <option value="sales">Litt salgsvennlig</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium">Standard forbehold</label>
                  <textarea
                    name="default_terms"
                    defaultValue={settings?.default_terms || ""}
                    rows={4}
                    placeholder="F.eks. Eventuelle skjulte feil eller uforutsette forhold kan påvirke endelig pris."
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>
              </div>
            </section>

            <button
              type="submit"
              className="w-full rounded-2xl bg-black px-4 py-4 text-white"
            >
              Lagre innstillinger
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}