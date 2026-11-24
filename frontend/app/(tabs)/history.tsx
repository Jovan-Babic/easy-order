import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { money } from "@/src/calc";
import { api, ApiError, Order } from "@/src/api";
import { StatusBadge } from "@/src/components/StatusBadge";
import { colors, radius, spacing, font, shadow } from "@/src/theme";

// The history loads a page at a time: the newest orders first, more on "Load more".
const PAGE = 30;
const MAX_RELOAD = 500; // the backend's largest page

export default function HistoryScreen() {
  const { t } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaded = useRef(0);

  // Coming back to the screen reloads as many orders as were showing, so the list doesn't jump back to the top page.
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const want = Math.min(MAX_RELOAD, Math.max(PAGE, loaded.current));
      const o = await api.listOrders({ limit: want });
      loaded.current = o.length;
      setOrders(o);
      setHasMore(o.length === want);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async () => {
    if (loadingMore) return;
    try {
      setLoadingMore(true);
      const next = await api.listOrders({ limit: PAGE, skip: orders.length });
      // A new order placed meanwhile shifts the pages by one: never show the same order twice.
      const known = new Set(orders.map((o) => o.id));
      const merged = [...orders, ...next.filter((o) => !known.has(o.id))];
      loaded.current = merged.length;
      setOrders(merged);
      setHasMore(next.length === PAGE);
    } catch (e) {
      Alert.alert(t("somethingWentWrong"), e instanceof ApiError ? e.detail : t("networkError"));
    } finally {
      setLoadingMore(false);
    }
  };

  const cancelOrder = (order: Order) => {
    Alert.alert(t("cancelOrder"), t("cancelOrderConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("confirm"),
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await api.changeOrderStatus(order.id, "canceled");
            setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
          } catch (e) {
            Alert.alert(t("somethingWentWrong"), e instanceof ApiError ? e.detail : String(e));
            load();
          }
        },
      },
    ]);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>{t("history")}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={56} color={colors.borderStrong} />
          <Text style={styles.mutedText}>{t("noOrders")}</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: safeBottom + 20 }}
          ListFooterComponent={
            hasMore ? (
              <Pressable testID="history-load-more" onPress={loadMore} disabled={loadingMore} style={styles.moreBtn}>
                {loadingMore ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.moreText}>{t("loadMore")}</Text>}
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable
                testID={`order-${item.id}`}
                style={styles.cardRow}
                onPress={() => router.push({ pathname: "/invoice", params: { id: item.id } })}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="document-text" size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.custName}>{item.customer_name}</Text>
                  <Text style={styles.sub}>
                    {dayjs(item.created_at).format("DD.MM.YYYY HH:mm")} · {item.items.length} {t("items")}
                  </Text>
                  <StatusBadge status={item.status} />
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
              {item.status === "shipped" &&
                item.ordered_totals &&
                item.totals &&
                item.ordered_totals.grand !== item.totals.grand && (
                  <Text style={styles.sub}>
                    {t("orderedLabel")} {money(item.ordered_totals.grand)} / {t("sentLabel")} {money(item.totals.grand)}
                  </Text>
                )}
              {item.status === "rejected" && !!item.status_history?.length && (
                <Text style={styles.reason}>
                  {t("rejectReason")}: {item.status_history[item.status_history.length - 1].note}
                </Text>
              )}
              {item.status === "new" && user?.role === "operator" && (
                <View style={styles.rowActions}>
                  <Pressable
                    testID={`edit-${item.id}`}
                    onPress={() => router.navigate({ pathname: "/", params: { edit: item.id } })}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.editText}>{t("editOrder")}</Text>
                  </Pressable>
                  <Pressable testID={`cancel-${item.id}`} onPress={() => cancelOrder(item)} style={styles.cancelBtn}>
                    <Text style={styles.cancelText}>{t("cancelOrder")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  moreBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    minHeight: 48,
  },
  moreText: { fontSize: font.base, fontWeight: "700", color: colors.brand },
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: font.xxl, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mutedText: { color: colors.muted, marginTop: spacing.md },
  card: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  reason: { fontSize: font.sm, color: colors.error },
  rowActions: { flexDirection: "row", gap: spacing.lg },
  editText: { fontSize: font.sm, fontWeight: "700", color: colors.brand },
  cancelBtn: { alignSelf: "flex-start", paddingVertical: spacing.xs },
  cancelText: { fontSize: font.sm, fontWeight: "700", color: colors.error },
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
});
