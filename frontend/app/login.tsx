import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { LOGIN } from "@/constants/testIds";

export default function LoginScreen() {
  const { t } = useApp();
  const { login, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      // SuperAdmin's real workspace is the admin web portal - the mobile
      // Admin CRUD form has no UI for the client_id a SuperAdmin write needs.
      if (user.role === "superadmin") {
        await logout();
        setError(t("useWebPortal"));
      }
    } catch {
      setError(t("invalidCredentials"));
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
        <Text style={styles.title}>{t("appName")}</Text>
        <View style={[styles.card, shadow.card]}>
          <Text style={styles.label}>{t("email")}</Text>
          <TextInput
            testID={LOGIN.emailInput}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@company.com"
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.label}>{t("password")}</Text>
          <TextInput
            testID={LOGIN.passwordInput}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            testID={LOGIN.submitButton}
            title={t("login")}
            onPress={onSubmit}
            loading={submitting}
            disabled={!email.trim() || !password}
            style={{ marginTop: spacing.lg }}
          />
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
});
