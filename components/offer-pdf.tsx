import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

type OfferMaterial = {
  material_name?: string | null;
  supplier?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
};

type OfferCustomer =
  | {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    }
  | {
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    }[]
  | null;

type OfferData = {
  title?: string | null;
  created_at?: string | null;
  valid_until?: string | null;
  description?: string | null;
  price_type?: string | null;
  fixed_price?: number | string | null;
  hourly_rate?: number | string | null;
  hours?: number | string | null;
  materials_cost?: number | string | null;
  subtotal?: number | string | null;
  vat_amount?: number | string | null;
  total?: number | string | null;
  vat_enabled?: boolean | null;
  customers?: OfferCustomer;
  customer_name?: string | null;
};

type Props = {
  offer: OfferData;
  materials?: OfferMaterial[];
  company?: {
    name?: string;
    contact_person?: string;
    phone?: string;
  };
};

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function formatCurrency(value: number | string | null | undefined) {
  const amount = toNumber(value);

  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number | string | null | undefined) {
  const amount = toNumber(value);

  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("no-NO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

function getCustomerName(
  customers: OfferCustomer | undefined,
  fallback?: string | null
) {
  if (Array.isArray(customers)) {
    return customers[0]?.name || fallback || "-";
  }

  return customers?.name || fallback || "-";
}

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 10,
    color: "#171717",
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  companyName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 6,
  },
  companyMeta: {
    fontSize: 10,
    color: "#525252",
    marginBottom: 2,
  },
  titleBlock: {
    marginBottom: 14,
  },
  offerLabel: {
    fontSize: 9,
    color: "#737373",
    marginBottom: 4,
  },
  offerTitle: {
    fontSize: 17,
    fontWeight: "bold",
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 9,
    color: "#525252",
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    marginBottom: 7,
    fontWeight: "bold",
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 12,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
  },
  infoCard: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    padding: 10,
  },
  label: {
    fontSize: 9,
    color: "#737373",
    marginBottom: 4,
  },
  value: {
    fontSize: 11,
    fontWeight: "bold",
  },
  customerValue: {
    fontSize: 11,
  },
  descriptionText: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  materialHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    marginBottom: 4,
  },
  materialHeaderText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#525252",
  },
  materialRow: {
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  materialTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  materialName: {
    fontSize: 10,
    fontWeight: "bold",
  },
  materialSupplier: {
    fontSize: 9,
    color: "#737373",
  },
  materialValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  materialDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  materialDetailText: {
    fontSize: 9,
    color: "#525252",
  },
  pricingCard: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fafafa",
  },
  pricingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pricingLabel: {
    fontSize: 10,
    color: "#525252",
  },
  pricingValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d4d4d4",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },
  totalValue: {
    fontSize: 12,
    fontWeight: "bold",
  },
  footer: {
    marginTop: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
  },
  footerText: {
    fontSize: 9,
    color: "#737373",
    lineHeight: 1.4,
  },
});

export default function OfferPdf({ offer, materials = [], company }: Props) {
  const customerName = getCustomerName(offer.customers, offer.customer_name);
  const priceType =
    offer.price_type === "hourly" ? "Timepris" : "Fastpris";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>{company?.name || "Tilbud"}</Text>
          {company?.contact_person ? (
            <Text style={styles.companyMeta}>{company.contact_person}</Text>
          ) : null}
          {company?.phone ? (
            <Text style={styles.companyMeta}>{company.phone}</Text>
          ) : null}
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.offerLabel}>Tilbud</Text>
          <Text style={styles.offerTitle}>{offer.title || "Tilbud"}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Opprettet: {formatDate(offer.created_at)}
            </Text>
            <Text style={styles.metaText}>
              Gyldig til: {formatDate(offer.valid_until)}
            </Text>
          </View>
        </View>

        <View style={[styles.section, styles.infoGrid]}>
          <View style={styles.infoCard}>
            <Text style={styles.label}>Kunde</Text>
            <Text style={styles.customerValue}>{customerName}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.label}>Prisform</Text>
            <Text style={styles.value}>{priceType}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.label}>Totalt</Text>
            <Text style={styles.value}>{formatCurrency(offer.total)} kr</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beskrivelse</Text>
          <View style={styles.card}>
            <Text style={styles.descriptionText}>{offer.description || "-"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prisdetaljer</Text>
          <View style={styles.infoGrid}>
            {offer.price_type === "fixed" ? (
              <View style={styles.infoCard}>
                <Text style={styles.label}>Fastpris</Text>
                <Text style={styles.value}>
                  {formatCurrency(offer.fixed_price)} kr
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.infoCard}>
                  <Text style={styles.label}>Timepris</Text>
                  <Text style={styles.value}>
                    {formatCurrency(offer.hourly_rate)} kr
                  </Text>
                </View>

                <View style={styles.infoCard}>
                  <Text style={styles.label}>Timer</Text>
                  <Text style={styles.value}>{formatNumber(offer.hours)}</Text>
                </View>
              </>
            )}

            <View style={styles.infoCard}>
              <Text style={styles.label}>Materialer</Text>
              <Text style={styles.value}>
                {formatCurrency(offer.materials_cost)} kr
              </Text>
            </View>
          </View>
        </View>

        {materials.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Materialer</Text>

            <View style={styles.card}>
              <View style={styles.materialHeader}>
                <Text style={styles.materialHeaderText}>Materiale</Text>
                <Text style={styles.materialHeaderText}>Linjesum</Text>
              </View>

              {materials.map((item, index) => (
                <View key={index} style={styles.materialRow}>
                  <View style={styles.materialTop}>
                    <View>
                      <Text style={styles.materialName}>
                        {item.material_name || "Materiale"}
                      </Text>
                      {item.supplier ? (
                        <Text style={styles.materialSupplier}>{item.supplier}</Text>
                      ) : null}
                    </View>

                    <Text style={styles.materialValue}>
                      {formatCurrency(item.line_total)} kr
                    </Text>
                  </View>

                  <View style={styles.materialDetails}>
                    <Text style={styles.materialDetailText}>
                      Antall: {formatNumber(item.quantity)} {item.unit || "stk"}
                    </Text>
                    <Text style={styles.materialDetailText}>
                      Enhetspris: {formatCurrency(item.unit_price)} kr
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prisoppsummering</Text>

          <View style={styles.pricingCard}>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Subtotal</Text>
              <Text style={styles.pricingValue}>
                {formatCurrency(offer.subtotal)} kr
              </Text>
            </View>

            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>MVA</Text>
              <Text style={styles.pricingValue}>
                {formatCurrency(offer.vat_amount)} kr
              </Text>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Totalt</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(offer.total)} kr
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Tilbudet gjelder til og med {formatDate(offer.valid_until)}.
          </Text>
          <Text style={styles.footerText}>
            Eventuelle tillegg som følge av skjulte eller uforutsette forhold
            kommer i tillegg dersom ikke annet er avtalt.
          </Text>
        </View>
      </Page>
    </Document>
  );
}