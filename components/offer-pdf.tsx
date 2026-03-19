import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

type Props = {
  offer: any;
  company?: {
    name?: string;
    contact_person?: string;
    phone?: string;
  };
};

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
  },
  section: {
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    marginBottom: 10,
  },
  bold: {
    fontWeight: "bold",
  },
});

export default function OfferPdf({ offer, company }: Props) {
  return (
    <Document>
      <Page style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.title}>Tilbud</Text>
        </View>

        <View style={styles.section}>
          <Text>Kunde: {offer.customer_name || "-"}</Text>
          <Text>Dato: {new Date().toLocaleDateString("no-NO")}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.bold}>{offer.title}</Text>
          <Text>{offer.description}</Text>
        </View>

        <View style={styles.section}>
          <Text>Subtotal: {offer.subtotal} kr</Text>
          <Text>MVA: {offer.vat_amount} kr</Text>
          <Text style={styles.bold}>Totalt: {offer.total} kr</Text>
        </View>

        {company ? (
          <View style={styles.section}>
            <Text>{company.name}</Text>
            <Text>{company.contact_person}</Text>
            <Text>{company.phone}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}