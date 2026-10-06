import React, { useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing, font } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called for every distinct scan; the scanner stays open (continuous mode). */
  onScanned: (code: string) => void;
};

const SAME_CODE_PAUSE_MS = 1500;

export function BarcodeScanner({ visible, onClose, onScanned }: Props) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const emit = (raw: string) => {
    const code = raw.replace(/\s+/g, "");
    if (!code) return;
    const now = Date.now();
    if (last.current.code === code && now - last.current.at < SAME_CODE_PAUSE_MS) return;
    last.current = { code, at: now };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onScanned(code);
  };

  const granted = permission?.granted;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("scanBarcode")}</Text>
          <Pressable onPress={onClose} hitSlop={12} testID="scanner-close">
            <Ionicons name="close" size={28} color={colors.onBrand} />
          </Pressable>
        </View>

        {granted && Platform.OS !== "web" ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
            }}
            onBarcodeScanned={({ data }) => emit(data)}
          />
        ) : (
          <View style={[styles.camera, styles.noCamera]}>
            <Ionicons name="camera-outline" size={48} color={colors.borderStrong} />
            <Text style={styles.noCameraText}>{t("cameraPermissionNeeded")}</Text>
            {Platform.OS !== "web" && permission?.canAskAgain !== false && (
              <Button title={t("allowCamera")} onPress={() => requestPermission()} />
            )}
          </View>
        )}

        <View style={[styles.manualRow, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <TextInput
            testID="scanner-manual-input"
            style={styles.input}
            placeholder={t("enterBarcode")}
            placeholderTextColor={colors.muted}
            value={manual}
            onChangeText={(v) => setManual(v.replace(/[^A-Za-z0-9-]/g, ""))}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => {
              emit(manual);
              setManual("");
            }}
          />
          <Pressable
            style={styles.okBtn}
            onPress={() => {
              emit(manual);
              setManual("");
            }}
          >
            <Ionicons name="checkmark" size={24} color={colors.onBrand} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceInverse },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  title: { color: colors.onBrand, fontSize: font.xl, fontWeight: "700" },
  camera: { flex: 1 },
  noCamera: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  noCameraText: { color: colors.onSurfaceInverse, textAlign: "center", fontSize: font.base },
  manualRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.onSurface,
  },
  okBtn: {
    width: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
});
