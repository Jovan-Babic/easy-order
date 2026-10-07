import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api";
import { LangToggle } from "@/src/components/LangToggle";
import { LOGOUT } from "@/constants/testIds";
import { colors, radius, spacing, font, shadow } from "@/src/theme";

type Counts = { newOrders: number; inProgress: number; expiring: number };

/** Warehouse start screen: a few cards with live counts, each opening the
 *  matching mode of the Magacin tab. Warehouse staff don't order anything. */
export default function HomeScreen() {
  const { t } = useApp();
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try {
      const [orders, alerts] = await Promise.all([
        api.listOrders({ status: ["new", "in_progress"] }),
        api.stockExpiring().catch(() => null),
      ]);
      setCounts({
        newOrders: orders.filter((o) => (o.status ?? "new") === "new").length,
        inProgress: orders.filter((o) => o.status === "in_progress").length,
        expiring: alerts?.total ?? 0,
      });
    } catch {
      setCounts((prev) => prev ?? { newOrders: 0, inProgress: 0, expiring: 0 });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // `ts` makes the param change on every tap, so the Magacin tab reacts even
  // when the same mode is opened twice.
  const open = (mode: "pack" | "expiry") =>
    router.navigate({ pathname: "/warehouse", params: { mode, ts: String(Date.now()) } } as never);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>Easy Order</Text>
            {!!user?.name && <Text style={styles.sub}>{user.name}</Text>}
          </View>
          <LangToggle />
          <Pressable testID={LOGOUT.button} onPress={() => logout()} hitSlop={8} style={{ padding: spacing.xs }}>
            <Ionicons name="log-out-outline" size={22} color={colors.muted} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {!counts ? (
          <ActivityIndicator color={colors.brand} size="large" style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Pressable testID="card-orders" style={styles.card} onPress={() => open("pack")}>
              <Ionicons name="cube-outline" size={32} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t("orders")}</Text>
                <Text style={styles.cardLine}>
                  {t("statusNew")}: {counts.newOrders}
                </Text>
                <Text style={styles.cardLine}>
                  {t("statusInProgress")}: {counts.inProgress}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.muted} />
            </Pressable>

            <Pressable testID="card-expiry" style={styles.card} onPress={() => open("expiry")}>
              <Ionicons
                name="time-outline"
                size={32}
                color={counts.expiring > 0 ? colors.warning : colors.brand}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t("expiringSoon")}</Text>
                <Text style={styles.cardLine}>{counts.expiring}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.muted} />
            </Pressable>
          </>
        )}
      </ScrollView>
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  appName: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: font.sm, color: colors.muted },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardTitle: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface, marginBottom: 2 },
  cardLine: { fontSize: font.base, color: colors.onSurfaceSecondary },
});
