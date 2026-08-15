import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import dayjs from "dayjs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { api, Order } from "@/src/api";
import { buildInvoiceText, buildInvoiceHtml } from "@/src/invoice";
import { computeTotals, lineNet, money } from "@/src/calc";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";

export default function InvoiceScreen() {
  const { t, lang, showToast } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPib, setCustomerPib] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerAddress, setCustomerAddress] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const o = await api.getOrder(id);
      setOrder(o);
      const customers = await api.listCustomers();
      const c = customers.find((x) => x.id === o.customer_id);
      setCustomerEmail(c?.email || "");
      setCustomerPib(c?.pib || "");
      setCustomerPhone(c?.phone || "");
      setCustomerAddress(c?.address || "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const contact = { pib: customerPib, phone: customerPhone, address: customerAddress, email: customerEmail };

  const copy = async () => {
    if (!order) return;
    await Clipboard.setStringAsync(buildInvoiceText(order, lang, contact));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast(t("copied"));
  };

  const sendEmail = async () => {
    if (!order) return;
    const body = buildInvoiceText(order, lang, contact);
    const subject = `${t("invoiceTitle")} - ${order.customer_name}`;
    const available = await MailComposer.isAvailableAsync().catch(() => false);
    if (available) {
      let attachments: string[] = [];
      try {
        const { uri } = await Print.printToFileAsync({ html: buildInvoiceHtml(order, lang, contact) });
        attachments = [uri];
      } catch (e) {
        attachments = [];
      }
      await MailComposer.composeAsync({
        recipients: customerEmail ? [customerEmail] : [],
        subject,
        body,
        attachments,
      });
    } else {
      const url = `mailto:${customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      Linking.openURL(url);
    }
  };

  const exportPdf = async () => {
    if (!order) return;
    try {
      const html = buildInvoiceHtml(order, lang, contact);
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync().catch(() => false);
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      } else {
        showToast(uri);
      }
    } catch (e) {
      showToast(t("pdfError"));
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="invoice-back" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("invoice")}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : !order ? (
        <View style={styles.center}>
          <Text style={styles.mutedText}>—</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: safeBottom + 120 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.receipt} testID="invoice-receipt">
              <View style={styles.receiptHead}>
                <Ionicons name="storefront" size={26} color={colors.brand} />
                <Text style={styles.brandTitle}>Easy Order</Text>
              </View>
              <Text style={styles.docTitle}>{t("invoiceTitle")}</Text>

              <View style={styles.metaBlock}>
                <Row label={t("customer")} value={order.customer_name} bold />
                {!!customerPib && <Row label={t("pib")} value={customerPib} />}
                {!!customerAddress && <Row label={t("address")} value={customerAddress} />}
                {!!customerPhone && <Row label={t("phone")} value={customerPhone} />}
                <Row label={t("date")} value={dayjs(order.created_at).format("DD.MM.YYYY HH:mm")} />
                {!!customerEmail && <Row label={t("email")} value={customerEmail} />}
              </View>

              <View style={styles.divider} />

              {order.items.map((it, i) => (
                <View key={i} style={styles.item} testID={`invoice-item-${i}`}>
                  <Text style={styles.itemName}>{i + 1}. {it.name}</Text>
                  {!!it.manufacturer && <Row label={t("manufacturer")} value={it.manufacturer} />}
                  <Row label={t("priceNoVat")} value={money(it.price_no_vat ?? 0)} />
                  <Row label={t("orderedPieces")} value={String(it.ordered_qty)} />
                  <Row label={t("discount")} value={`${it.discount ?? 0}%`} />
                  <Row label={t("vatRate")} value={`${it.vat_rate ?? 0}%`} />
                  <Row label={t("lineTotal")} value={money(lineNet(it))} bold />
                </View>
              ))}

              <View style={styles.divider} />

              {(() => {
                const tot = computeTotals(order);
                return (
                  <View style={styles.totalsBlock} testID="invoice-totals">
                    <Row label={t("subtotal")} value={money(tot.subtotal)} />
                    <Row label={t("vat")} value={money(tot.vat)} />
                    <View style={styles.grandRow}>
                      <Text style={styles.grandLabel}>{t("grandTotal")}</Text>
                      <Text style={styles.grandValue} testID="grand-total">{money(tot.grand)}</Text>
                    </View>
                  </View>
                );
              })()}
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: safeBottom + spacing.sm }]}>
            <View style={styles.footerRow}>
              <Button title={t("sendEmail")} icon="mail" onPress={sendEmail} testID="send-email-button" style={{ flex: 1 }} />
              <Button title={t("exportPdf")} icon="document-text" variant="secondary" onPress={exportPdf} testID="export-pdf-button" style={{ flex: 1 }} />
            </View>
            <View style={{ height: spacing.sm }} />
            <Button title={t("copyInvoice")} icon="copy" variant="secondary" onPress={copy} testID="copy-invoice-button" />
          </View>
        </>
      )}
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: "800", color: colors.onSurface }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mutedText: { color: colors.muted },
  receipt: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  receiptHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center" },
  brandTitle: { fontSize: font.xl, fontWeight: "800", color: colors.brand },
  docTitle: {
    textAlign: "center",
    fontSize: font.base,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 2,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  metaBlock: { gap: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  item: {
    marginBottom: spacing.lg,
    gap: 2,
  },
  totalsBlock: { gap: spacing.xs },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 2,
    borderTopColor: colors.brand,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  grandLabel: { fontSize: font.lg, fontWeight: "800", color: colors.brand },
  grandValue: { fontSize: font.xl, fontWeight: "800", color: colors.brand },
  footerRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "stretch",
  },
  itemName: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  rowLabel: { fontSize: font.base, color: colors.muted },
  rowValue: { fontSize: font.base, color: colors.onSurfaceSecondary, fontWeight: "600" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow.card,
  },
});
