import React, { useState } from "react";
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useApp } from "@/src/context/AppContext";
import { colors, spacing } from "@/src/theme";

// TextInput for passwords with a show/hide "eye" toggle. Takes the same props
// as TextInput (style included), so screens keep their own input styling.
export function PasswordInput({ style, ...props }: Omit<TextInputProps, "secureTextEntry">) {
  const { t } = useApp();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        {...props}
        style={[style, styles.input]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={10}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityLabel={visible ? t("hidePassword") : t("showPassword")}
        testID={props.testID ? `${props.testID}-toggle` : undefined}
      >
        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "center" },
  // Room for the icon so long passwords don't run under it.
  input: { paddingRight: spacing.xxl + spacing.sm },
  toggle: { position: "absolute", right: spacing.md },
});
