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
    const hourlyRateRaw = String(
      formData.get("hourly_rate_default") || ""
    ).trim();
    const pricing = String(
      formData.get("pricing_preference") || "auto"
    ).trim();
    const tone = String(formData.get("tone") || "professional").trim();
    const terms = String(formData.get("default_terms") || "").trim();

    const companyName = String(formData.get("company_name") || "").trim();
    const companyEmail = String(formData.get("company_email") || "").trim();
    const contactName = String(formData.get("contact_name") || "").trim();
    const contactPhone = String(formData.get("contact_phone") || "").trim();
    const companyAddress = String(
      formData.get("company_address") || ""
    ).trim();
    const companyPostcode = String(
      formData.get("company_postcode") || ""
    ).trim();
    const companyCity = String(formData.get("company_city") || "").trim();
    const orgNumber = String(formData.get("org_number") || "").trim();
    const bankAccount = String(formData.get("bank_account") || "").trim();
    const iban = String(formData.get("iban") || "").trim();
    const bic = String(formData.get("bic") || "").trim();

    const offerValidDaysRaw = String(
      formData.get("offer_valid_days") || ""
    ).trim();

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
        company_email: companyEmail,
        contact_name: contactName,
        contact_phone: contactPhone,
        company_address: companyAddress,
        company_postcode: companyPostcode,
        company_city: companyCity,
        org_number: orgNumber,
        bank_account: bankAccount,
        iban,
        bic,
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
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <h1 className="text-2xl font-bold">Innstillinger</h1>

          <p className="mt-2 text-sm text-neutral-500">
            Her kan du lære opp AI-assistenten din og fylle inn bedriftsprofil
            som brukes i tilbud, faktura, e-post og PDF.
          </p>

          <form action={saveSettings} className="mt-8 space-y-8">
            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Bedriftsprofil</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Denne informasjonen brukes i faktura, PDF og utsendinger.
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium">Firmanavn</label>
                  <input
                    name="company_name"
                    defaultValue={settings?.company_name || ""}
                    placeholder="F.eks. Stoum Invest AS"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">E-post</label>
                  <input
                    name="company_email"
                    defaultValue={settings?.company_email || ""}
                    placeholder="F.eks. post@firma.no"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">
                      Kontaktperson
                    </label>
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
                      placeholder="F.eks. 95855519"
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium">Adresse</label>
                  <input
                    name="company_address"
                    defaultValue={settings?.company_address || ""}
                    placeholder="F.eks. Storgata 1"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-[180px_1fr]">
                  <div>
                    <label className="block text-sm font-medium">
                      Postnummer
                    </label>
                    <input
                      name="company_postcode"
                      defaultValue={settings?.company_postcode || ""}
                      placeholder="F.eks. 7010"
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">Poststed</label>
                    <input
                      name="company_city"
                      defaultValue={settings?.company_city || ""}
                      placeholder="F.eks. Trondheim"
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">
                      Organisasjonsnummer
                    </label>
                    <input
                      name="org_number"
                      defaultValue={settings?.org_number || ""}
                      placeholder="F.eks. 123456789"
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Kontonummer
                    </label>
                    <input
                      name="bank_account"
                      defaultValue={settings?.bank_account || ""}
                      placeholder="F.eks. 1234.56.78901"
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">IBAN</label>
                    <input
                      name="iban"
                      defaultValue={settings?.iban || ""}
                      placeholder="F.eks. NO93..."
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      BIC / SWIFT
                    </label>
                    <input
                      name="bic"
                      defaultValue={settings?.bic || ""}
                      placeholder="F.eks. DNBANOKKXXX"
                      className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                    />
                  </div>
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
                  <label className="block text-sm font-medium">
                    Standard timepris
                  </label>
                  <input
                    name="hourly_rate_default"
                    type="number"
                    defaultValue={settings?.hourly_rate_default || ""}
                    placeholder="F.eks. 950"
                    className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">
                    Foretrukket prisform
                  </label>
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
                  <label className="block text-sm font-medium">
                    Standard forbehold
                  </label>
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