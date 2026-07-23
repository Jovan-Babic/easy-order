import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useApp } from "@/src/context/AppContext";
import { colors, radius, spacing, font } from "@/src/theme";
import { Lang } from "@/src/i18n";

export function LangToggle() {
  const { lang, setLang } = useApp();
  const options: Lang[] = ["sr", "en"];
  return (
    <View style={styles.wrap} testID="lang-toggle">
      {options.map((o) => {
        const active = lang === o;
        return (
          <Pressable
            key={o}
            testID={`lang-${o}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setLang(o);
            }}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.txt, active && styles.txtActive]}>
              {o.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 3,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  pillActive: { backgroundColor: colors.brand },
  txt: { fontSize: font.sm, fontWeight: "700", color: colors.muted },
  txtActive: { color: "#fff" },
});
