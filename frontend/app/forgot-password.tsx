import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { api } from "@/src/api";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { FORGOT_PASSWORD } from "@/constants/testIds";

export default function ForgotPasswordScreen() {
  const { t } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!email.trim()) return;
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const response = await api.requestPasswordReset(email.trim(), "mobile");
      setMessage(response.message || t("resetEmailSent"));
    } catch {
      setError(t("resetRequestFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}> 
        <Text style={styles.title}>{t("forgotPasswordTitle")}</Text>
        <View style={[styles.card, shadow.card]}>
          <Text style={styles.description}>{t("forgotPasswordDescription")}</Text>
          <Text style={styles.label}>{t("email")}</Text>
          <TextInput
            testID={FORGOT_PASSWORD.emailInput}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@company.com"
            placeholderTextColor={colors.muted}
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {message && <Text style={styles.success}>{message}</Text>}

          <Button
            testID={FORGOT_PASSWORD.submitButton}
            title={t("sendResetLink")}
            onPress={onSubmit}
            loading={submitting}
            disabled={!email.trim()}
            style={{ marginTop: spacing.lg }}
          />

          <Pressable
            testID={FORGOT_PASSWORD.backToLoginLink}
            onPress={() => router.replace("/login")}
            style={styles.backWrap}
          >
            <Text style={styles.backText}>{t("backToLogin")}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.xl },
  title: {
    fontSize: font.xxl,
    fontWeight: "800",
    color: colors.brand,
    textAlign: "center",
    marginBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  description: {
    color: colors.onSurfaceSecondary,
    fontSize: font.base,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: font.base,
    fontWeight: "600",
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.lg,
    color: colors.onSurface,
  },
  error: {
    color: colors.error,
    fontSize: font.base,
    marginTop: spacing.md,
  },
  success: {
    color: colors.success,
    fontSize: font.base,
    marginTop: spacing.md,
  },
  backWrap: {
    alignSelf: "center",
    marginTop: spacing.lg,
  },
  backText: {
    color: colors.brand,
    fontSize: font.base,
    fontWeight: "600",
  },
});
