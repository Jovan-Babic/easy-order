import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "@/src/context/AppContext";
import { colors, font, radius, spacing } from "@/src/theme";

// A link to a screen that doesn't exist: our own message and a way back, instead of the router's default page.
export default function NotFoundScreen() {
  const { t } = useApp();
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <Ionicons name="alert-circle-outline" size={56} color={colors.borderStrong} />
      <Text style={styles.text}>{t("screenNotFound")}</Text>
      <Pressable testID="not-found-home" onPress={() => router.replace("/")} style={styles.button}>
        <Text style={styles.buttonText}>{t("backToStart")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.surface, gap: spacing.lg },
  text: { fontSize: font.lg, color: colors.onSurface, textAlign: "center" },
  button: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, minHeight: 48, justifyContent: "center" },
  buttonText: { color: colors.onBrand, fontSize: font.base, fontWeight: "700" },
});
