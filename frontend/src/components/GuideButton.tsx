import React from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/context/AppContext";
import { colors, spacing } from "@/src/theme";

/** "?" in the header of the start screens: opens the user guide of the signed-in user's role. */
export function GuideButton() {
  const router = useRouter();
  const { t } = useApp();
  return (
    <Pressable
      testID="guide-button"
      accessibilityLabel={t("guideOpen")}
      onPress={() => router.push("/guide" as never)}
      hitSlop={8}
      style={{ padding: spacing.xs }}
    >
      <Ionicons name="help-circle-outline" size={24} color={colors.muted} />
    </Pressable>
  );
}
