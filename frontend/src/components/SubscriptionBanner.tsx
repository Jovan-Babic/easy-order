import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { colors, font, spacing } from "@/src/theme";

type Notice = { key: string; level: "info" | "warning"; text: string };

/** What the strip at the top of the app has to say: the subscription is about
 *  to end / has ended (the account locks after the grace period), and
 *  announcements from the system owner. */
export function useTopNotices(): Notice[] {
  const { t, lang } = useApp();
  const { user } = useAuth();
  const notices: Notice[] = [];
  for (const a of user?.announcements ?? []) {
    notices.push({ key: `a-${a.id}`, level: a.level, text: lang === "en" ? a.message_en : a.message_sr });
  }
  const sub = user?.subscription;
  if (sub?.status === "grace") {
    notices.push({
      key: "sub",
      level: "warning",
      text: `${t("subscriptionGrace")} ${sub.grace_ends_at}. ${t("subscriptionContact")}`,
    });
  } else if (sub?.status === "active" && sub.days_left <= 14) {
    notices.push({
      key: "sub",
      level: "warning",
      text: `${t("subscriptionEndsIn")} ${sub.days_left} ${t("subscriptionDays")} (${sub.ends_at}). ${t("subscriptionContact")}`,
    });
  }
  return notices;
}

/** Strips at the top of the app. The first one takes the status bar inset
 *  (see TabsLayout, which then hands the screens below a zero top inset). */
export function TopBanners() {
  const insets = useSafeAreaInsets();
  const notices = useTopNotices();
  if (notices.length === 0) return null;
  return (
    <View testID="top-banners">
      {notices.map((n, i) => (
        <View
          key={n.key}
          testID={n.key === "sub" ? "subscription-banner" : "announcement-banner"}
          style={[
            styles.bar,
            n.level === "warning" ? styles.warning : styles.info,
            i === 0 && { paddingTop: insets.top + spacing.xs },
          ]}
        >
          <Text style={styles.text}>{n.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  warning: { backgroundColor: colors.warning },
  info: { backgroundColor: colors.brand },
  text: { color: colors.onBrand, fontSize: font.sm, fontWeight: "600", textAlign: "center" },
});
