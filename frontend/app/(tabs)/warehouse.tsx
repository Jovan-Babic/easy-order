import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { hasModule } from "@/src/utils/modules";
import { api, ApiError, ClientInfo, ExpiringResponse, Order, OrderStatus, Product } from "@/src/api";
import { Button } from "@/src/components/Button";
import { StatusBadge } from "@/src/components/StatusBadge";
import { ExpiringList } from "@/src/components/ExpiringList";
import { StockScanPanel } from "@/src/components/StockScanPanel";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { isoToDisplay } from "@/src/utils/expiry";

const QUEUE: OrderStatus[] = ["new", "in_progress"];

type Mode = "pack" | "receipt" | "count" | "expiry";

export default function WarehouseScreen() {
  const { t } = useApp();
  const { user } = useAuth();
  // Packing is the Magacin module; receipt/count need Zalihe, expiry list needs Rokovi.
  const modes = (["pack", "receipt", "count", "expiry"] as Mode[]).filter((m) =>
    m === "pack" ? true : m === "expiry" ? hasModule(user, "expiry") : hasModule(user, "stock")
  );
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [mode, setMode] = useState<Mode>("pack");
  // The warehouse home cards open a specific mode (`ts` changes on every tap).
  const params = useLocalSearchParams<{ mode?: string; ts?: string }>();
  useEffect(() => {
    if (params.mode === "pack" || (params.mode === "expiry" && hasModule(user, "expiry"))) setMode(params.mode);
  }, [params.mode, params.ts, user]);
  const [expiring, setExpiring] = useState<ExpiringResponse | null>(null);
  // Products with expiry tracking, to hint which expiry date to pack first.
  const [expiryProducts, setExpiryProducts] = useState<Record<string, Product>>({});

  const load = useCallback(async (pull = false) => {
    try {
      if (pull) setRefreshing(true);
      else setLoading(true);
      const [list, me, alerts, products] = await Promise.all([
        api.listOrders({ status: QUEUE }),
        api.getMyClient().catch(() => null),
        api.stockExpiring().catch(() => null),
        api.listProducts().catch(() => [] as Product[]),
      ]);
      setOrders(list);
      setClient(me);
      setExpiring(alerts);
      setExpiryProducts(Object.fromEntries(products.filter((p) => p.track_expiry).map((p) => [p.id, p])));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Runs one write on an order and swaps in the server's version of it.
  // Orders that left the queue (shipped/rejected) disappear from the list;
  // a 409 means someone else changed it, so reload.
  const run = async (orderId: string, action: () => Promise<Order>) => {
    setBusyId(orderId);
    try {
      const updated = await action();
      setOrders((prev) =>
        QUEUE.includes(updated.status ?? "new")
          ? prev.map((o) => (o.id === orderId ? updated : o))
          : prev.filter((o) => o.id !== orderId)
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await load(true);
      Alert.alert(t("somethingWentWrong"), e instanceof ApiError ? e.detail : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const setQty = (order: Order, productId: string, qty: number | null) =>
    run(order.id, () => api.setPickedQty(order.id, [{ product_id: productId, picked_qty: qty }]));

  const canShip = (o: Order) =>
    o.status === "in_progress" &&
    o.items.length > 0 &&
    o.items.every((i) => i.picked_qty != null) &&
    o.items.some((i) => (i.picked_qty ?? 0) > 0) &&
    (client?.invoice_numbering !== "manual" || invoiceNo.trim() !== "");

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>{t("warehouse")}</Text>
        <Text style={styles.headerSub}>{t("toPack")}</Text>
        {modes.length > 1 && (
        <View style={styles.modeRow}>
          {modes.map((m) => (
            <Pressable
              key={m}
              testID={`mode-${m}`}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                {m === "pack"
                  ? t("packing")
                  : m === "receipt"
                    ? t("stockReceiptTab")
                    : m === "count"
                      ? t("stockCountTab")
                      : `${t("expiryTab")}${expiring?.total ? ` (${expiring.total})` : ""}`}
              </Text>
            </Pressable>
          ))}
        </View>
        )}
      </View>

      {mode === "expiry" ? (
        <ExpiringList data={expiring} refreshing={refreshing} onRefresh={() => load(true)} />
      ) : mode !== "pack" ? (
        <StockScanPanel key={mode} mode={mode} />
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: safeBottom + 20, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cube-outline" size={56} color={colors.borderStrong} />
              <Text style={styles.mutedText}>{t("nothingToPack")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const checked = item.items.filter((i) => i.picked_qty != null).length;
            const open = openId === item.id;
            const busy = busyId === item.id;
            const complete = item.items.length > 0 && checked === item.items.length;
            return (
              <View style={styles.card} testID={`pack-order-${item.id}`}>
                <Pressable style={styles.cardHead} onPress={() => setOpenId(open ? null : item.id)}>
                  <View style={styles.cardIcon}>
                    <Ionicons
                      name={complete ? "checkmark-circle" : "cube"}
                      size={22}
                      color={complete ? colors.success : colors.brand}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.custName}>{item.customer_name}</Text>
                    <Text style={styles.sub}>
                      {dayjs(item.created_at).format("DD.MM.YYYY HH:mm")} · {t("pickedOf")} {checked}/
                      {item.items.length}
                    </Text>
                    <StatusBadge status={item.status} />
                  </View>
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
                </Pressable>

                {open && (
                  <>
                    {item.items.map((it) => {
                      const on = it.picked_qty != null;
                      return (
                        <View key={it.product_id} style={styles.line}>
                          <Pressable
                            testID={`pick-${item.id}-${it.product_id}`}
                            style={styles.lineMain}
                            disabled={busy}
                            onPress={() => setQty(item, it.product_id, on ? null : it.ordered_qty)}
                          >
                            <Ionicons
                              name={on ? "checkbox" : "square-outline"}
                              size={26}
                              color={on ? colors.brand : colors.muted}
                            />
                            <Text style={[styles.lineName, on && styles.lineDone]} numberOfLines={2}>
                              {it.name}
                            </Text>
                            <Text style={styles.lineQty}>
                              {it.ordered_qty} {t("pieces")}
                            </Text>
                          </Pressable>
                          {expiryProducts[it.product_id] && (
                            <Text style={styles.expiryHint}>
                              {expiryProducts[it.product_id].next_expiry
                                ? `${t("pickEarliest")}: ${isoToDisplay(expiryProducts[it.product_id].next_expiry)}`
                                : ""}
                              {(expiryProducts[it.product_id].expired_qty ?? 0) > 0
                                ? `  ·  ${t("expiredInStock")}: ${expiryProducts[it.product_id].expired_qty}`
                                : ""}
                            </Text>
                          )}
                          {on && (
                            <View style={styles.stepper}>
                              <Pressable
                                style={styles.stepBtn}
                                disabled={busy || (it.picked_qty ?? 0) <= 0}
                                onPress={() => setQty(item, it.product_id, (it.picked_qty ?? 0) - 1)}
                              >
                                <Ionicons name="remove" size={20} color={colors.brand} />
                              </Pressable>
                              <Text style={styles.stepValue}>
                                {t("sentLabel")}: {it.picked_qty} / {it.ordered_qty}
                              </Text>
                              <Pressable
                                style={styles.stepBtn}
                                disabled={busy || (it.picked_qty ?? 0) >= it.ordered_qty}
                                onPress={() => setQty(item, it.product_id, (it.picked_qty ?? 0) + 1)}
                              >
                                <Ionicons name="add" size={20} color={colors.brand} />
                              </Pressable>
                            </View>
                          )}
                        </View>
                      );
                    })}

                    {item.status === "in_progress" && !complete && (
                      <Text style={styles.hint}>{t("allCheckedHint")}</Text>
                    )}

                    {rejectingId === item.id ? (
                      <View style={styles.actions}>
                        <TextInput
                          testID={`reject-note-${item.id}`}
                          style={styles.input}
                          placeholder={t("rejectReason")}
                          value={rejectNote}
                          onChangeText={setRejectNote}
                          multiline
                        />
                        <Button
                          title={t("rejectOrder")}
                          variant="danger"
                          disabled={busy || !rejectNote.trim()}
                          loading={busy}
                          onPress={async () => {
                            await run(item.id, () => api.changeOrderStatus(item.id, "rejected", rejectNote.trim()));
                            setRejectingId(null);
                            setRejectNote("");
                          }}
                        />
                        <Button title={t("cancel")} variant="ghost" onPress={() => setRejectingId(null)} />
                      </View>
                    ) : (
                      <View style={styles.actions}>
                        {item.status === "new" ? (
                          <Button
                            title={t("takeOrder")}
                            testID={`take-${item.id}`}
                            loading={busy}
                            onPress={() => run(item.id, () => api.changeOrderStatus(item.id, "in_progress"))}
                          />
                        ) : (
                          <>
                            {client?.invoice_numbering === "manual" && (
                              <TextInput
                                testID={`invoice-no-${item.id}`}
                                style={styles.input}
                                placeholder={t("invoiceNumber")}
                                value={invoiceNo}
                                onChangeText={setInvoiceNo}
                              />
                            )}
                            <Button
                              title={t("shipOrder")}
                              testID={`ship-${item.id}`}
                              icon="send"
                              loading={busy}
                              disabled={busy || !canShip(item)}
                              onPress={() => run(item.id, () => api.changeOrderStatus(item.id, "shipped", undefined, invoiceNo.trim() || undefined))}
                            />
                            <Button
                              title={t("returnToQueue")}
                              variant="secondary"
                              disabled={busy}
                              onPress={() => run(item.id, () => api.changeOrderStatus(item.id, "new"))}
                            />
                          </>
                        )}
                        <Button
                          title={t("rejectOrder")}
                          variant="ghost"
                          disabled={busy}
                          onPress={() => {
                            setRejectNote("");
                            setRejectingId(item.id);
                          }}
                        />
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: font.xxl, fontWeight: "800", color: colors.onSurface },
  headerSub: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  modeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  modeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  modeBtnActive: { backgroundColor: colors.brand },
  modeText: { fontSize: font.base, fontWeight: "600", color: colors.onSurfaceSecondary },
  modeTextActive: { color: colors.onBrand },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mutedText: { color: colors.muted, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  custName: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  line: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  lineMain: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.md },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { fontSize: font.base, fontWeight: "600", color: colors.onSurface, minWidth: 110, textAlign: "center" },
  hint: { fontSize: font.sm, color: colors.muted, marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 60,
    backgroundColor: colors.surface,
    color: colors.onSurface,
  },
  expiryHint: { fontSize: font.sm, color: colors.warning, fontWeight: "600" },
  lineName: { flex: 1, fontSize: font.base, color: colors.onSurface },
  lineQty: { fontSize: font.base, fontWeight: "700", color: colors.onSurface },
  lineDone: { color: colors.muted, textDecorationLine: "line-through" },
});
