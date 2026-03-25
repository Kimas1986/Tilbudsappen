import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MaterialInput = {
  name?: string;
  supplier?: string | null;
  sku?: string | null;
  unit?: string | null;
  base_price?: number | string | null;
  waste_percent?: number | string | null;
  markup_percent?: number | string | null;
  pricing_mode?: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cleanText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");

  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBulkLine(line: string): MaterialInput | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split("|").map((part) => part.trim());

  if (parts.length < 4) {
    return null;
  }

  const [name, supplier, unit, price] = parts;

  if (!name) {
    return null;
  }

  return {
    name,
    supplier: supplier || null,
    unit: unit || "stk",
    base_price: toNumber(price, 0),
    waste_percent: 0,
    markup_percent: 0,
    pricing_mode: "manual",
  };
}

function normalizeIncomingMaterial(input: MaterialInput): MaterialInput | null {
  const name = cleanText(input.name);
  if (!name) return null;

  return {
    name,
    supplier: cleanText(input.supplier) || null,
    sku: cleanText(input.sku) || null,
    unit: cleanText(input.unit) || "stk",
    base_price: toNumber(input.base_price, 0),
    waste_percent: toNumber(input.waste_percent, 0),
    markup_percent: toNumber(input.markup_percent, 0),
    pricing_mode: cleanText(input.pricing_mode) || "manual",
  };
}

function makeMaterialKey(name: unknown, supplier: unknown) {
  return `${normalizeText(name)}__${normalizeText(supplier)}`;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const [{ data: materials, error: materialsError }, { data: templates, error: templatesError }] =
      await Promise.all([
        supabase
          .from("materials")
          .select(
            "id, name, supplier, unit, base_price, waste_percent, markup_percent, pricing_mode"
          )
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
        supabase
          .from("material_templates")
          .select(
            `
            id,
            name,
            description,
            created_at,
            material_template_items(
              id,
              material_id,
              quantity,
              materials(
                id,
                name,
                supplier,
                unit,
                base_price,
                waste_percent,
                markup_percent,
                pricing_mode
              )
            )
          `
          )
          .eq("user_id", user.id)
          .order("name", { ascending: true }),
      ]);

    if (materialsError) {
      console.error("Feil ved henting av materialer:", materialsError);

      return NextResponse.json(
        { error: "Kunne ikke hente materialer" },
        { status: 500 }
      );
    }

    if (templatesError) {
      console.error("Feil ved henting av materialmaler:", templatesError);

      return NextResponse.json(
        { error: "Kunne ikke hente materialmaler" },
        { status: 500 }
      );
    }

    const normalizedTemplates = Array.isArray(templates)
      ? templates.map((template) => {
          const rawItems = Array.isArray(template.material_template_items)
            ? template.material_template_items
            : [];

          const items = rawItems
            .map((item) => {
              const material = Array.isArray(item.materials)
                ? item.materials[0]
                : item.materials;

              if (!material?.id) {
                return null;
              }

              return {
                id: item.id,
                materialId: material.id,
                quantity: Number(item.quantity || 0),
                material: {
                  id: material.id,
                  name: material.name || "",
                  supplier: material.supplier || null,
                  unit: material.unit || "stk",
                  base_price: Number(material.base_price || 0),
                  waste_percent: Number(material.waste_percent || 0),
                  markup_percent: Number(material.markup_percent || 0),
                  pricing_mode: material.pricing_mode || "manual",
                },
              };
            })
            .filter(Boolean);

          return {
            id: template.id,
            name: template.name || "",
            description: template.description || "",
            created_at: template.created_at || null,
            items,
          };
        })
      : [];

    return NextResponse.json({
      materials: materials || [],
      templates: normalizedTemplates,
    });
  } catch (error) {
    console.error("Materials API error:", error);

    return NextResponse.json(
      { error: "Uventet feil ved henting av materialer" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Ugyldig request body" }, { status: 400 });
    }

    const bulkText =
      typeof body.bulkText === "string"
        ? body.bulkText
        : typeof body.bulk === "string"
        ? body.bulk
        : "";

    const rawItems: MaterialInput[] = Array.isArray(body.items)
      ? body.items
      : bulkText
      ? bulkText
          .split(/\r?\n/)
          .map((line) => parseBulkLine(line))
          .filter((item): item is MaterialInput => Boolean(item))
      : [body as MaterialInput];

    const normalizedItems = rawItems
      .map((item) => normalizeIncomingMaterial(item))
      .filter((item): item is MaterialInput => Boolean(item));

    if (!normalizedItems.length) {
      return NextResponse.json(
        { error: "Fant ingen gyldige materialer å lagre" },
        { status: 400 }
      );
    }

    const dedupedMap = new Map<string, MaterialInput>();

    for (const item of normalizedItems) {
      const key = makeMaterialKey(item.name, item.supplier);
      dedupedMap.set(key, item);
    }

    const dedupedItems = Array.from(dedupedMap.values());

    const { data: existingMaterials, error: existingError } = await supabase
      .from("materials")
      .select(
        "id, name, supplier, unit, sku, base_price, waste_percent, markup_percent, pricing_mode"
      )
      .eq("user_id", user.id);

    if (existingError) {
      console.error("Feil ved henting av eksisterende materialer:", existingError);

      return NextResponse.json(
        { error: "Kunne ikke lese eksisterende materialer" },
        { status: 500 }
      );
    }

    const existingByKey = new Map<
      string,
      {
        id: string;
        name: string;
        supplier: string | null;
        unit: string | null;
        sku: string | null;
        base_price: number | null;
        waste_percent: number | null;
        markup_percent: number | null;
        pricing_mode: string | null;
      }
    >();

    for (const existing of existingMaterials || []) {
      existingByKey.set(makeMaterialKey(existing.name, existing.supplier), existing);
    }

    const toInsert: Array<Record<string, unknown>> = [];
    const toUpdate: Array<{ id: string; values: Record<string, unknown> }> = [];

    for (const item of dedupedItems) {
      const key = makeMaterialKey(item.name, item.supplier);
      const existing = existingByKey.get(key);

      if (existing) {
        toUpdate.push({
          id: existing.id,
          values: {
            name: item.name,
            supplier: item.supplier ?? null,
            sku: item.sku ?? existing.sku ?? null,
            unit: item.unit ?? existing.unit ?? "stk",
            base_price: toNumber(item.base_price, Number(existing.base_price || 0)),
            waste_percent: toNumber(
              item.waste_percent,
              Number(existing.waste_percent || 0)
            ),
            markup_percent: toNumber(
              item.markup_percent,
              Number(existing.markup_percent || 0)
            ),
            pricing_mode: item.pricing_mode ?? existing.pricing_mode ?? "manual",
            last_updated_at: new Date().toISOString(),
          },
        });
      } else {
        toInsert.push({
          user_id: user.id,
          name: item.name,
          supplier: item.supplier ?? null,
          sku: item.sku ?? null,
          unit: item.unit ?? "stk",
          base_price: toNumber(item.base_price, 0),
          waste_percent: toNumber(item.waste_percent, 0),
          markup_percent: toNumber(item.markup_percent, 0),
          pricing_mode: item.pricing_mode ?? "manual",
          last_updated_at: new Date().toISOString(),
        });
      }
    }

    for (const update of toUpdate) {
      const { error } = await supabase
        .from("materials")
        .update(update.values)
        .eq("id", update.id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Feil ved oppdatering av materiale:", error, update);

        return NextResponse.json(
          { error: "Kunne ikke oppdatere eksisterende materialer" },
          { status: 500 }
        );
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("materials").insert(toInsert);

      if (error) {
        console.error("Feil ved opprettelse av materialer:", error, toInsert);

        return NextResponse.json(
          { error: "Kunne ikke opprette nye materialer" },
          { status: 500 }
        );
      }
    }

    const { data: materials, error: materialsError } = await supabase
      .from("materials")
      .select(
        "id, name, supplier, unit, base_price, waste_percent, markup_percent, pricing_mode"
      )
      .eq("user_id", user.id)
      .order("name", { ascending: true });

    if (materialsError) {
      console.error("Feil ved henting av oppdaterte materialer:", materialsError);

      return NextResponse.json(
        { error: "Materialene ble lagret, men kunne ikke hentes ut igjen" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      inserted: toInsert.length,
      updated: toUpdate.length,
      totalProcessed: dedupedItems.length,
      materials: materials || [],
    });
  } catch (error) {
    console.error("Materials POST API error:", error);

    return NextResponse.json(
      { error: "Uventet feil ved lagring av materialer" },
      { status: 500 }
    );
  }
}