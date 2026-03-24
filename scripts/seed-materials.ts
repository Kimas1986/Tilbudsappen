import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔑 DIN USER ID
const USER_ID = "8ac6dc01-ce30-4cbe-871b-63dd87057afe";

if (!SUPABASE_URL) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL mangler i .env.local");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY mangler i .env.local");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function seedMaterials() {
  const materials = [
    { name: "2x4 konstruksjonsvirke", base_price: 45, unit: "m", supplier: "Byggmakker" },
    { name: "2x6 konstruksjonsvirke", base_price: 65, unit: "m", supplier: "Byggmakker" },
    { name: "48x98 impregnert", base_price: 55, unit: "m", supplier: "Byggmakker" },
    { name: "Terrassebord 28x120", base_price: 35, unit: "m", supplier: "Byggmakker" },

    { name: "Gipsplate 120x240", base_price: 120, unit: "stk", supplier: "Byggmakker" },
    { name: "OSB plate 12mm", base_price: 220, unit: "stk", supplier: "Byggmakker" },
    { name: "Kryssfiner 15mm", base_price: 450, unit: "stk", supplier: "Byggmakker" },

    { name: "Glava isolasjon 100mm", base_price: 80, unit: "m2", supplier: "Byggmakker" },
    { name: "Glava isolasjon 150mm", base_price: 110, unit: "m2", supplier: "Byggmakker" },

    { name: "Treskruer 5x80 (200 stk)", base_price: 180, unit: "pakke", supplier: "Byggmakker" },
    { name: "Spiker 90mm", base_price: 95, unit: "kg", supplier: "Byggmakker" },
    { name: "Gipsskruer", base_price: 120, unit: "pakke", supplier: "Byggmakker" },

    { name: "Interiørmaling hvit 10L", base_price: 900, unit: "spann", supplier: "Byggmakker" },
    { name: "Grunning 10L", base_price: 700, unit: "spann", supplier: "Byggmakker" },

    { name: "Fugemasse", base_price: 79, unit: "stk", supplier: "Byggmakker" },
    { name: "Byggskum", base_price: 129, unit: "stk", supplier: "Byggmakker" },
    { name: "Dampsperre", base_price: 25, unit: "m2", supplier: "Byggmakker" },
  ];

  const payload = materials.map((m) => ({
    user_id: USER_ID,
    name: m.name,
    supplier: m.supplier,
    unit: m.unit,
    base_price: m.base_price,
    waste_percent: 10,
    markup_percent: 15,
    pricing_mode: "manual",
  }));

  const { error } = await supabase.from("materials").insert(payload);

  if (error) {
    console.error("❌ Feil:", error);
    process.exit(1);
  }

  console.log("✅ Materialer lagt inn!");
  process.exit(0);
}

seedMaterials();