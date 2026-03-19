import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

type OfferMaterial = {
  material_name?: string;
  quantity?: number | string;
  unit?: string;
  unit_price?: number | string;
  line_total?: number | string;
};

type Props = {
  offer: any;
  materials?: OfferMaterial[];
  company?: {
    name?: string;
    contact_person?: string;
    phone?: string;
  };
};

function formatCurrency(value: number | string | null | undefined) {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;

  return new Intl.NumberFormat("no-NO", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
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

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    color: "#171717",
    fontFamily: "Helvetica",
  },
  section: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    marginBottom: 12,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "bold",
  },
  bold: {
    fontWeight: "bold",
  },
  meta: {
    color: "#525252",
    marginBottom: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  materialRow: {
    paddingTop: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
});

export default function OfferPdf({ offer, materials = [], company }: Props) {
  return (
    <Document>
      <Page style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.title}>{company?.name || "Tilbud"}</Text>
          {company?.contact_person ? (
            <Text style={styles.meta}>{company.contact_person}</Text>
          ) : null}
          {company?.phone ? <Text style={styles.meta}>{company.phone}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.subtitle}>{offer.title || "Tilbud"}</Text>
          <Text style={styles.meta}>
            Opprettet: {formatDate(offer.created_at)}
          </Text>
          <Text style={styles.meta}>
            Gyldig til: {formatDate(offer.valid_until)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.subtitle}>Kunde</Text>
          <Text>{offer.customers?.name || offer.customer_name || "-"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.subtitle}>Beskrivelse</Text>
          <Text>{offer.description || "-"}</Text>
        </View>

        {materials.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.subtitle}>Materialer</Text>

            <View style={styles.card}>
              {materials.map((item, index) => (
                <View key={index} style={styles.materialRow}>
                  <Text style={styles.bold}>
                    {item.material_name || "Materiale"}
                  </Text>

                  <View style={styles.row}>
                    <Text>
                      {item.quantity || 0} {item.unit || "stk"}
                    </Text>
                    <Text>{formatCurrency(item.unit_price)} kr/enhet</Text>
                    <Text>{formatCurrency(item.line_total)} kr</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.subtitle}>Pris</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text>Subtotal</Text>
              <Text>{formatCurrency(offer.subtotal)} kr</Text>
            </View>

            <View style={styles.row}>
              <Text>MVA</Text>
              <Text>{formatCurrency(offer.vat_amount)} kr</Text>
            </View>

            <View style={[styles.row, { marginTop: 8 }]}>
              <Text style={styles.bold}>Totalt</Text>
              <Text style={styles.bold}>{formatCurrency(offer.total)} kr</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}