import React from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/context/AppContext";
import { api, ApiError, ExpiringItem, ExpiringResponse } from "@/src/api";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { isoToDisplay } from "@/src/utils/expiry";

type Props = {
  data: ExpiringResponse | null;
  refreshing: boolean;
  onRefresh: () => void;
};

/** Batches that are expired or close to expiring (warehouse and admin).
 *  Red = expired or the closest threshold, amber = the earlier ones. */
export function ExpiringList({ data, refreshing, onRefresh }: Props) {
  const { t, showToast } = useApp();
  const closest = data?.thresholds[0];

  const writeOff = (item: ExpiringItem) =>
    Alert.alert(`${item.product_name} · ${isoToDisplay(item.expiry_date)}`, t("writeOffConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("writeOff"),
        style: "destructive",
        onPress: async () => {
          try {
            await api.writeOffBatch(item.batch_id);
            showToast(t("stockSaved"));
            onRefresh();
          } catch (e) {
            Alert.alert(t("somethingWentWrong"), e instanceof ApiError ? e.detail : String(e));
          }
        },
      },
    ]);

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(i) => i.batch_id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, flexGrow: 1 }}
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={56} color={colors.borderStrong} />
          <Text style={styles.empty}>{t("expiringNone")}</Text>
        </View>
      }
      renderItem={({ item }) => {
        const urgent = item.days_left < 0 || (closest != null && item.days_left <= closest);
        const tone = urgent ? colors.error : colors.warning;
        return (
          <View style={styles.card} testID={`expiring-${item.batch_id}`}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{item.product_name}</Text>
              <Text style={styles.sub}>
                {isoToDisplay(item.expiry_date)} · {item.qty} {t("pieces")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
              <View style={[styles.badge, { backgroundColor: tone }]}>
                <Text style={styles.badgeText}>
                  {item.days_left < 0 ? t("expiredLabel") : `${item.days_left} ${t("daysUnit")}`}
                </Text>
              </View>
              {item.days_left < 0 && <Button title={t("writeOff")} variant="danger" onPress={() => writeOff(item)} />}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  empty: { color: colors.muted },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  name: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: font.sm, color: colors.muted },
  badge: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.md },
  badgeText: { color: "#FFFFFF", fontWeight: "700", fontSize: font.sm },
});
