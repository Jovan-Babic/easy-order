import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { ApiError } from "@/src/api";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { PasswordInput } from "@/src/components/PasswordInput";

// Mirrors the backend rule (server.py _password_is_strong_enough).
function isStrongEnough(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

// Shown by RouteGuard while user.must_change_password is true (invited user
// or password set by an admin). Once changed, RouteGuard moves on to the tabs.
export default function ChangePasswordScreen() {
  const { t } = useApp();
  const { changePassword, logout } = useAuth();
  const insets = useSafeAreaInsets();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!isStrongEnough(newPassword)) {
      setError(t("passwordRules"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 400 ? e.detail : t("changePasswordFailed"));
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
        <Text style={styles.title}>{t("changePassword")}</Text>
        <View style={[styles.card, shadow.card]}>
          <Text style={styles.intro}>{t("changePasswordRequired")}</Text>

          <Text style={styles.label}>{t("currentPassword")}</Text>
          <PasswordInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            autoComplete="current-password"
          />

          <Text style={styles.label}>{t("newPassword")}</Text>
          <PasswordInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            autoComplete="new-password"
          />
          <Text style={styles.hint}>{t("passwordRules")}</Text>

          <Text style={styles.label}>{t("confirmPassword")}</Text>
          <PasswordInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoComplete="new-password"
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            title={t("changePassword")}
            onPress={onSubmit}
            loading={submitting}
            disabled={!currentPassword || !newPassword || !confirmPassword}
            style={{ marginTop: spacing.lg }}
          />

          <Pressable onPress={() => logout()} style={styles.backWrap}>
            <Text style={styles.backText}>{t("logout")}</Text>
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
  intro: {
    fontSize: font.base,
    color: colors.onSurfaceSecondary,
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
  hint: {
    fontSize: font.sm,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  error: {
    color: colors.error,
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
