import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { colors, font, spacing } from "@/src/theme";

/** Whether the banner has something to say (also used to hand the status bar
 *  inset to it instead of to the screens below). */
export function useSubscriptionNotice() {
  const { user } = useAuth();
  const sub = user?.subscription;
  if (!sub) return null;
  if (sub.status === "grace") return { kind: "grace" as const, sub };
  if (sub.status === "active" && sub.days_left <= 14) return { kind: "soon" as const, sub };
  return null;
}

/** Strip at the top of the app: the client's subscription is about to end or
 *  has ended (the account locks after the grace period). */
export function SubscriptionBanner() {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const notice = useSubscriptionNotice();
  if (!notice) return null;
  const { kind, sub } = notice;
  const text =
    kind === "grace"
      ? `${t("subscriptionGrace")} ${sub.grace_ends_at}. ${t("subscriptionContact")}`
      : `${t("subscriptionEndsIn")} ${sub.days_left} ${t("subscriptionDays")} (${sub.ends_at}). ${t("subscriptionContact")}`;
  return (
    <View testID="subscription-banner" style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.warning,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  text: { color: colors.onBrand, fontSize: font.sm, fontWeight: "600", textAlign: "center" },
});
