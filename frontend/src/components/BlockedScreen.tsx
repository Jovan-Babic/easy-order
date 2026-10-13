import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { Button } from "@/src/components/Button";
import { colors, font, radius, spacing } from "@/src/theme";

/** Shown instead of the app while the client is blocked on calendar billing.
 *  Only the admin can be signed in then (sales reps and the warehouse can't log
 *  in at all); the details and the IPS QR code are on the portal page "Zaduženja". */
export function BlockedScreen() {
  const { t } = useApp();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const billing = user?.billing;
  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]} testID="blocked-screen">
      <View style={styles.card}>
        <Text style={styles.title}>{t("billingBlockedTitle")}</Text>
        <Text style={styles.text}>{t(billing?.lock_reason === "manual" ? "billingBlockedManual" : "billingBlocked")}</Text>
        {typeof billing?.to_pay === "number" && (
          <Text style={styles.amount}>
            {t("billingToPay")}: {billing.to_pay.toFixed(2)} RSD
          </Text>
        )}
        <Text style={styles.hint}>{t("billingSeePortal")}</Text>
        <Button title={t("logout")} variant="ghost" onPress={() => logout()} testID="blocked-logout" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.xl, fontWeight: "800", color: colors.error },
  text: { fontSize: font.base, color: colors.onSurface },
  amount: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: font.sm, color: colors.muted },
});
