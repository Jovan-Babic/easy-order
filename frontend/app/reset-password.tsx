import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { api } from "@/src/api";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { RESET_PASSWORD } from "@/constants/testIds";

export default function ResetPasswordScreen() {
  const { t } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = useMemo(() => (typeof params.token === "string" ? params.token : ""), [params.token]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setMessage(null);

    if (!token) {
      setError(t("missingResetToken"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      await api.resetPassword(token, newPassword);
      setMessage(t("resetPasswordSuccess"));
      setTimeout(() => {
        router.replace("/login");
      }, 800);
    } catch {
      setError(t("resetFailed"));
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
        <Text style={styles.title}>{t("resetPasswordTitle")}</Text>
        <View style={[styles.card, shadow.card]}>
          <Text style={styles.label}>{t("newPassword")}</Text>
          <TextInput
            testID={RESET_PASSWORD.newPasswordInput}
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            autoComplete="new-password"
          />

          <Text style={styles.label}>{t("confirmPassword")}</Text>
          <TextInput
            testID={RESET_PASSWORD.confirmPasswordInput}
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            autoComplete="new-password"
          />

          {error && <Text style={styles.error}>{error}</Text>}
          {message && <Text style={styles.success}>{message}</Text>}

          <Button
            testID={RESET_PASSWORD.submitButton}
            title={t("resetPassword")}
            onPress={onSubmit}
            loading={submitting}
            disabled={!newPassword || !confirmPassword}
            style={{ marginTop: spacing.lg }}
          />

          <Pressable
            testID={RESET_PASSWORD.backToLoginLink}
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
