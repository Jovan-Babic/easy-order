import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, TargetMe, TargetMetric, TargetMonth } from "@/src/api";
import { hasModule } from "@/src/utils/modules";
import { colors, radius, spacing, font, shadow } from "@/src/theme";

const isMoney = (m: TargetMetric) => m === "revenue" || m === "focus_revenue";
const whole = (v: number) => Math.round(v).toLocaleString("sr-RS");
const fmt = (m: TargetMetric, v: number | undefined) => (isMoney(m) ? `${whole(v ?? 0)} RSD` : whole(v ?? 0));
// Per-day amounts of a count (orders, customers) are small: one decimal, e.g. 0,5.
const fmtDaily = (m: TargetMetric, v: number) =>
  isMoney(m) || v >= 10 ? fmt(m, v) : (Math.round(v * 10) / 10).toLocaleString("sr-RS");
const monthLabel = (period: string) => `${period.slice(5, 7)}.${period.slice(0, 4)}`;

export default function ProgressScreen() {
  const { t } = useApp();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<TargetMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const metrics: TargetMetric[] = hasModule(user, "focus")
    ? ["revenue", "orders", "customers", "focus_revenue"]
    : ["revenue", "orders", "customers"];
  const label: Record<TargetMetric, string> = {
    revenue: t("progressMetricRevenue"),
    orders: t("progressMetricOrders"),
    customers: t("progressMetricCustomers"),
    focus_revenue: t("progressMetricFocus"),
  };

  const load = useCallback(async () => {
    try {
      setData(await api.myTargets());
    } catch {
      // keep what was shown; pull to refresh retries
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

  const hasAnyTarget = !!data && metrics.some((m) => (data.targets[m] ?? 0) > 0);

  const renderHistory = (h: TargetMonth) => {
    const withTarget = metrics.filter((m) => (h.targets[m] ?? 0) > 0);
    const shown: TargetMetric[] = withTarget.length ? withTarget : ["revenue"];
    return (
      <View key={h.period} style={styles.historyRow}>
        <Text style={styles.historyMonth}>{monthLabel(h.period)}</Text>
        <View style={{ flex: 1 }}>
          {shown.map((m) => (
            <View key={m} style={styles.historyLine}>
              <Text style={styles.historyLabel}>{label[m]}</Text>
              <Text style={styles.historyValue}>
                {fmt(m, h.achieved[m])}
                {(h.targets[m] ?? 0) > 0 ? ` / ${fmt(m, h.targets[m])}  (${h.pct[m] ?? 0}%)` : ""}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>{t("progress")}</Text>
        {data && <Text style={styles.headerSub}>{t("progressMonth")} · {monthLabel(data.period)}</Text>}
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : !data ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          {!hasAnyTarget && <Text style={styles.note}>{t("progressNoTarget")}</Text>}
          {metrics
            .filter((m) => hasAnyTarget ? (data.targets[m] ?? 0) > 0 || m === "revenue" : m === "revenue" || m === "orders")
            .map((m) => {
              const target = data.targets[m] ?? 0;
              const achieved = data.achieved[m] ?? 0;
              const pct = data.pct[m] ?? 0;
              const left = Math.max(0, target - achieved);
              return (
                <View key={m} style={styles.card} testID={`progress-${m}`}>
                  <Text style={styles.cardTitle}>{label[m]}</Text>
                  <Text style={styles.bigValue}>
                    {fmt(m, achieved)}
                    {target > 0 && <Text style={styles.ofText}> {t("progressOf")} {fmt(m, target)}</Text>}
                  </Text>
                  {target > 0 && (
                    <>
                      <View style={styles.bar}>
                        <View style={[styles.barFill, { width: `${Math.min(100, pct)}%` }, pct >= 100 && { backgroundColor: colors.success }]} />
                      </View>
                      <Text style={styles.pct}>{pct}%</Text>
                      {left > 0 ? (
                        <>
                          <Text style={styles.line}>{t("progressLeft").replace("{n}", fmt(m, left))}</Text>
                          {data.daily_needed[m] != null && data.days_left > 0 && (
                            <Text style={styles.line}>
                              {t("progressPerDay").replace("{n}", fmtDaily(m, data.daily_needed[m] ?? 0)).replace("{d}", String(data.days_left))}
                            </Text>
                          )}
                          <Text style={styles.lineMuted}>{t("progressProjection").replace("{n}", fmt(m, data.projection[m]))}</Text>
                        </>
                      ) : (
                        <Text style={styles.reached}>{t("progressReached")}</Text>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          <Text style={styles.sectionTitle}>{t("progressHistory")}</Text>
          <View style={styles.card}>{data.history.map(renderHistory)}</View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
  headerSub: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  note: { color: colors.muted, fontSize: font.base, marginBottom: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadow.card },
  cardTitle: { fontSize: font.sm, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  bigValue: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
  ofText: { fontSize: font.base, fontWeight: "600", color: colors.muted },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginTop: spacing.md },
  barFill: { height: "100%", backgroundColor: colors.brand },
  pct: { fontSize: font.base, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xs },
  line: { fontSize: font.base, color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  lineMuted: { fontSize: font.sm, color: colors.muted, marginTop: spacing.xs },
  reached: { fontSize: font.base, fontWeight: "800", color: colors.success, marginTop: spacing.sm },
  sectionTitle: { fontSize: font.sm, fontWeight: "800", color: colors.muted, textTransform: "uppercase", marginBottom: spacing.sm },
  historyRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyMonth: { width: 64, fontWeight: "800", color: colors.onSurface },
  historyLine: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  historyLabel: { fontSize: font.sm, color: colors.muted, flexShrink: 1 },
  historyValue: { fontSize: font.sm, color: colors.onSurface, fontWeight: "600" },
});
