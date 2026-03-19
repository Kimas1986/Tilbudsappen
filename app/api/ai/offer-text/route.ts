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

function buildToneInstruction(tone: AiSettings["tone"]) {
  if (tone === "short") {
    return "Skriv kort, stramt og rett på sak.";
  }

  if (tone === "sales") {
    return "Skriv profesjonelt, men litt salgsvennlig og tillitsvekkende.";
  }

  return "Skriv profesjonelt, tydelig og ryddig.";
}

function buildPricingInstruction(
  pricingPreference: AiSettings["pricing_preference"]
) {
  if (pricingPreference === "fixed") {
    return "Foretrekk fastpris hvis det er mulig å avgrense jobben.";
  }

  if (pricingPreference === "hourly") {
    return "Foretrekk timepris hvis ikke jobben er helt tydelig avgrenset.";
  }

  return "Velg fastpris for små og avgrensede jobber, ellers timepris ved mer usikkerhet.";
}

export async function POST(request: Request) {
  try {
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
      return NextResponse.json(
        { error: "Mangler input" },
        { status: 400 }
      );
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

    const examplesText = ((previousOffers || []) as PreviousOffer[])
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

    const settingsText = [
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

    const systemInstructions = [
      "Du hjelper håndverkere å lage tilbud på norsk.",
      "Svar med realistiske forslag til tittel, tekst og prisoppsett.",
      settings?.trade
        ? `Brukeren jobber som: ${settings.trade}.`
        : "Tilpass forslaget til vanlig håndverksarbeid.",
      buildToneInstruction(settings?.tone || "professional"),
      buildPricingInstruction(settings?.pricing_preference || "auto"),
      settings?.hourly_rate_default != null
        ? `Bruk standard timesats ${settings.hourly_rate_default} kr som utgangspunkt hvis ikke noe annet er mer naturlig.`
        : "Velg en realistisk timesats hvis timepris er mest naturlig.",
      "Tittelen skal være kort og tydelig, og passe i en tilbudsliste.",
      "Beskrivelsen skal være profesjonell, konkret og klar for kunde.",
      settings?.default_terms
        ? `Ta med eller hensynta dette standardforbeholdet i beskrivelsen når det passer: ${settings.default_terms}`
        : "Ta med et kort, nøkternt forbehold om uforutsette forhold når det passer naturlig.",
      "Ikke skriv for langt.",
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
              text: input,
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

    const parsed = JSON.parse(raw);

    return NextResponse.json({
      title: String(parsed.title || ""),
      description: String(parsed.description || ""),
      priceType: parsed.priceType === "hourly" ? "hourly" : "fixed",
      hours: Number(parsed.hours || 0),
      hourlyRate: Number(parsed.hourlyRate || 0),
      materials: Number(parsed.materials || 0),
      fixedPrice: Number(parsed.fixedPrice || 0),
    });
  } catch (error) {
    console.error("AI feil:", error);

    return NextResponse.json(
      { error: "Kunne ikke generere forslag" },
      { status: 500 }
    );
  }
}