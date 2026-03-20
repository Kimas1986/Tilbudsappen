import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type PreviousOffer = {
  title: string | null;
  description: string | null;
  price_type: string | null;
  hourly_rate: number | null;
  hours: number | null;
  materials_cost: number | null;
  fixed_price: number | null;
  total: number | null;
};

type AiSettings = {
  trade: string | null;
  hourly_rate_default: number | null;
  pricing_preference: "fixed" | "hourly" | "auto" | null;
  tone: "short" | "professional" | "sales" | null;
  default_terms: string | null;
};

type ParsedSuggestion = {
  title: string;
  description: string;
  priceType: "fixed" | "hourly";
  hours: number;
  hourlyRate: number;
  materials: number;
  fixedPrice: number;
};

function buildToneInstruction(tone: AiSettings["tone"]) {
  if (tone === "short") {
    return "Skriv kort, stramt og rett på sak.";
  }

  if (tone === "sales") {
    return "Skriv profesjonelt, litt salgsvennlig og tillitsvekkende.";
  }

  return "Skriv profesjonelt, tydelig og ryddig.";
}

function buildPricingInstruction(
  pricingPreference: AiSettings["pricing_preference"]
) {
  if (pricingPreference === "fixed") {
    return "Foretrekk fastpris hvis jobben er tydelig avgrenset.";
  }

  if (pricingPreference === "hourly") {
    return "Foretrekk timepris hvis omfanget er usikkert eller kan variere.";
  }

  return "Velg fastpris for små og avgrensede jobber, ellers timepris ved usikkerhet.";
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function clampMinimum(value: number, minimum: number) {
  return value < minimum ? minimum : value;
}

function buildExamplesText(previousOffers: PreviousOffer[]) {
  return previousOffers
    .map((offer, index) => {
      return [
        `Eksempel ${index + 1}:`,
        `Tittel: ${offer.title || "-"}`,
        `Beskrivelse: ${offer.description || "-"}`,
        `Prisform: ${offer.price_type || "-"}`,
        `Timepris: ${offer.hourly_rate ?? 0}`,
        `Timer: ${offer.hours ?? 0}`,
        `Materialer: ${offer.materials_cost ?? 0}`,
        `Fastpris: ${offer.fixed_price ?? 0}`,
        `Total: ${offer.total ?? 0}`,
      ].join("\n");
    })
    .join("\n\n");
}

function buildSettingsText(settings: AiSettings | null) {
  return [
    settings?.trade ? `Fagområde: ${settings.trade}` : null,
    settings?.hourly_rate_default != null
      ? `Standard timesats: ${settings.hourly_rate_default} kr`
      : null,
    settings?.pricing_preference
      ? `Foretrukket prisform: ${settings.pricing_preference}`
      : null,
    settings?.tone ? `Foretrukket tone: ${settings.tone}` : null,
    settings?.default_terms
      ? `Standard forbehold: ${settings.default_terms}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeSuggestion(
  parsed: Record<string, unknown>,
  settings: AiSettings | null,
  input: string
): ParsedSuggestion {
  const defaultHourlyRate = clampMinimum(
    normalizeNumber(settings?.hourly_rate_default ?? 0),
    650
  );

  const requestedPriceType =
    parsed.priceType === "hourly" ? "hourly" : "fixed";

  let hours = normalizeNumber(parsed.hours);
  let hourlyRate = normalizeNumber(parsed.hourlyRate);
  let materials = normalizeNumber(parsed.materials);
  let fixedPrice = normalizeNumber(parsed.fixedPrice);

  hours = clampMinimum(hours, requestedPriceType === "hourly" ? 1 : 0);
  hourlyRate = clampMinimum(
    hourlyRate,
    requestedPriceType === "hourly" ? defaultHourlyRate : 0
  );
  materials = clampMinimum(materials, 0);
  fixedPrice = clampMinimum(fixedPrice, 0);

  if (requestedPriceType === "fixed" && fixedPrice === 0) {
    const derivedFromHourly =
      hours > 0 && hourlyRate > 0 ? hours * hourlyRate : 0;
    fixedPrice = clampMinimum(derivedFromHourly, 1500);
  }

  if (requestedPriceType === "hourly" && hourlyRate === 0) {
    hourlyRate = defaultHourlyRate;
  }

  const cleanTitle = String(parsed.title || "").trim();
  const cleanDescription = String(parsed.description || "").trim();

  return {
    title: cleanTitle || `Tilbud – ${input}`,
    description:
      cleanDescription ||
      "Arbeidet utføres fagmessig etter nærmere avtale. Eventuelle tillegg som følge av skjulte eller uforutsette forhold kommer i tillegg.",
    priceType: requestedPriceType,
    hours: roundMoney(hours),
    hourlyRate: roundMoney(hourlyRate),
    materials: roundMoney(materials),
    fixedPrice: roundMoney(fixedPrice),
  };
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY mangler" },
        { status: 500 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke logget inn" }, { status: 401 });
    }

    const body = await request.json();
    const input = String(body?.input || "").trim();

    if (!input) {
      return NextResponse.json({ error: "Mangler input" }, { status: 400 });
    }

    const [{ data: previousOffers }, { data: aiSettings }] = await Promise.all([
      supabase
        .from("offers")
        .select(
          "title, description, price_type, hourly_rate, hours, materials_cost, fixed_price, total"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("ai_settings")
        .select(
          "trade, hourly_rate_default, pricing_preference, tone, default_terms"
        )
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const settings = (aiSettings || null) as AiSettings | null;
    const examplesText = buildExamplesText(
      ((previousOffers || []) as PreviousOffer[]).filter(
        (offer) => offer.title || offer.description
      )
    );
    const settingsText = buildSettingsText(settings);

    const systemInstructions = [
      "Du hjelper håndverkere i Norge å lage raske og brukbare tilbudsutkast på norsk bokmål.",
      "Du skal returnere realistiske forslag til tittel, beskrivelse og prisoppsett.",
      settings?.trade
        ? `Brukeren jobber som: ${settings.trade}.`
        : "Tilpass forslaget til vanlig håndverksarbeid.",
      buildToneInstruction(settings?.tone || "professional"),
      buildPricingInstruction(settings?.pricing_preference || "auto"),
      settings?.hourly_rate_default != null
        ? `Bruk standard timesats ${settings.hourly_rate_default} kr som utgangspunkt hvis timepris er naturlig.`
        : "Velg en realistisk timesats for norsk håndverksarbeid hvis timepris er mest naturlig.",
      "Tittelen skal være kort, tydelig og passe i en tilbudsliste.",
      "Beskrivelsen skal være klar for kunde, konkret og profesjonell.",
      "Beskrivelsen skal normalt være 2 til 5 setninger.",
      settings?.default_terms
        ? `Ta med eller hensynta dette standardforbeholdet når det passer naturlig: ${settings.default_terms}`
        : "Ta med et kort og nøkternt forbehold om uforutsette forhold når det passer naturlig.",
      "Vurder jobbens størrelse nøkternt.",
      "For små oppdrag skal timer, materialer og pris ikke bli urimelig høye.",
      "For tydelig avgrensede småjobber er fastpris ofte best.",
      "For mer åpne eller usikre jobber er timepris ofte best.",
      "Ikke skriv lange forklaringer.",
      "Returner bare data som passer schemaet.",
    ].join(" ");

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      text: {
        format: {
          type: "json_schema",
          name: "offer_suggestion",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: {
                type: "string",
              },
              description: {
                type: "string",
              },
              priceType: {
                type: "string",
                enum: ["fixed", "hourly"],
              },
              hours: {
                type: "number",
              },
              hourlyRate: {
                type: "number",
              },
              materials: {
                type: "number",
              },
              fixedPrice: {
                type: "number",
              },
            },
            required: [
              "title",
              "description",
              "priceType",
              "hours",
              "hourlyRate",
              "materials",
              "fixedPrice",
            ],
          },
        },
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: systemInstructions,
            },
          ],
        },
        ...(settingsText
          ? [
              {
                role: "user" as const,
                content: [
                  {
                    type: "input_text" as const,
                    text:
                      "Her er faste innstillinger for denne håndverkeren:\n\n" +
                      settingsText,
                  },
                ],
              },
            ]
          : []),
        ...(examplesText
          ? [
              {
                role: "user" as const,
                content: [
                  {
                    type: "input_text" as const,
                    text:
                      "Her er noen tidligere tilbud fra samme håndverker. " +
                      "Bruk dem som referanse for stil og prisnivå, men ikke kopier ordrett:\n\n" +
                      examplesText,
                  },
                ],
              },
            ]
          : []),
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Lag et konkret tilbudsutkast basert på dette:",
                input,
                "",
                "Svar med realistisk tittel, beskrivelse og prisoppsett.",
                "Prisene skal være nøkterne og praktisk brukbare som førsteutkast.",
              ].join("\n"),
            },
          ],
        },
      ],
    });

    const raw = response.output_text?.trim();

    if (!raw) {
      return NextResponse.json(
        { error: "AI returnerte tomt svar" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sanitized = sanitizeSuggestion(parsed, settings, input);

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("AI feil:", error);

    return NextResponse.json(
      { error: "Kunne ikke generere forslag" },
      { status: 500 }
    );
  }
}