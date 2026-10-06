import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { api, Order } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { colors, radius, spacing, font, shadow } from "@/src/theme";

// Per-device check-off state: order id -> product ids already packed.
// Kept locally until the backend gets picked_qty (RBAC_PLAN.md phase 3).
const PICKED_KEY = "warehouse_picked_v1";
type PickedMap = Record<string, string[]>;

export default function WarehouseScreen() {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
  const [orders, setOrders] = useState<Order[]>([]);
  const [picked, setPicked] = useState<PickedMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (pull = false) => {
    try {
      if (pull) setRefreshing(true);
      else setLoading(true);
      const [o, raw] = await Promise.all([
        api.listOrders(),
        storage.getItem<string>(PICKED_KEY, "{}"),
      ]);
      const toPack = o.filter((x) => !x.status || x.status === "new" || x.status === "in_progress");
      let map: PickedMap = {};
      try {
        map = JSON.parse(raw || "{}");
      } catch {
        map = {};
      }
      // Drop state of orders no longer in the queue.
      const ids = new Set(toPack.map((x) => x.id));
      map = Object.fromEntries(Object.entries(map).filter(([id]) => ids.has(id)));
      setOrders(toPack);
      setPicked(map);
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

  const toggle = (orderId: string, productId: string) => {
    setPicked((prev) => {
      const cur = new Set(prev[orderId] ?? []);
      if (cur.has(productId)) cur.delete(productId);
      else cur.add(productId);
      const next = { ...prev, [orderId]: Array.from(cur) };
      storage.setItem(PICKED_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>{t("warehouse")}</Text>
        <Text style={styles.headerSub}>{t("toPack")}</Text>
      </View>

      {loading ? (
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
            const done = picked[item.id] ?? [];
            const open = openId === item.id;
            const complete = item.items.length > 0 && done.length >= item.items.length;
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
                  <View style={{ flex: 1 }}>
                    <Text style={styles.custName}>{item.customer_name}</Text>
                    <Text style={styles.sub}>
                      {dayjs(item.created_at).format("DD.MM.YYYY HH:mm")} · {t("pickedOf")} {done.length}/
                      {item.items.length}
                    </Text>
                  </View>
                  <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
                </Pressable>
                {open &&
                  item.items.map((it) => {
                    const on = done.includes(it.product_id);
                    return (
                      <Pressable
                        key={it.product_id}
                        testID={`pick-${item.id}-${it.product_id}`}
                        style={styles.line}
                        onPress={() => toggle(item.id, it.product_id)}
                      >
                        <Ionicons
                          name={on ? "checkbox" : "square-outline"}
                          size={26}
                          color={on ? colors.brand : colors.muted}
                        />
                        <Text style={[styles.lineName, on && styles.lineDone]} numberOfLines={2}>
                          {it.name}
                        </Text>
                        <Text style={[styles.lineQty, on && styles.lineDone]}>
                          {it.ordered_qty} {t("pieces")}
                        </Text>
                      </Pressable>
                    );
                  })}
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  lineName: { flex: 1, fontSize: font.base, color: colors.onSurface },
  lineQty: { fontSize: font.base, fontWeight: "700", color: colors.onSurface },
  lineDone: { color: colors.muted, textDecorationLine: "line-through" },
});
