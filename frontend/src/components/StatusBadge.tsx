import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApp } from "@/src/context/AppContext";
import { OrderStatus } from "@/src/api";
import { colors, radius, spacing, font } from "@/src/theme";

const STYLE: Record<OrderStatus, { bg: string; fg: string }> = {
  new: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
  in_progress: { bg: "#FEF3C7", fg: colors.warning },
  shipped: { bg: colors.brandSecondary, fg: colors.success },
  rejected: { bg: "#FEE2E2", fg: colors.error },
  canceled: { bg: colors.surfaceTertiary, fg: colors.muted },
};

const LABEL = {
  new: "statusNew",
  in_progress: "statusInProgress",
  shipped: "statusShipped",
  rejected: "statusRejected",
  canceled: "statusCanceled",
} as const;

export function StatusBadge({ status }: { status?: OrderStatus }) {
  const { t } = useApp();
  const s = status ?? "new";
  const st = STYLE[s] ?? STYLE.new;
  return (
    <View style={[styles.badge, { backgroundColor: st.bg }]} testID={`status-${s}`}>
      <Text style={[styles.text, { color: st.fg }]}>{t(LABEL[s] ?? "statusNew")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, alignSelf: "flex-start" },
  text: { fontSize: font.sm, fontWeight: "700" },
});
