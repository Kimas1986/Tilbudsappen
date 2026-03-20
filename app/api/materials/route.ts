import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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