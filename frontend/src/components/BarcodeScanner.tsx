import React, { useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing, font } from "@/src/theme";

/** What the caller reports back for a scan, shown under the frame. */
export type ScanFeedback = { ok: boolean; label: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called once per accepted scan. Return feedback to show (and count when ok). */
  onScanned: (code: string) => void | ScanFeedback | Promise<void | ScanFeedback>;
  /** Stay open and keep counting until the user taps Done (stock entry). Default: single scan. */
  continuous?: boolean;
};

// A code counts again only after it has been out of view this long, so one
// item held in front of the camera is counted once, not every second.
const LEAVE_GAP_MS = 800;
// A new code must be read twice within this window before it is accepted -
// filters half-read and neighbouring codes.
const CONFIRM_WINDOW_MS = 700;
const FRAME_MARGIN = 12;

export function BarcodeScanner({ visible, onClose, onScanned, continuous = false }: Props) {
  const { t } = useApp();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [active, setActive] = useState(true);
  const [total, setTotal] = useState(0);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const counted = useRef<Record<string, number>>({});
  const candidate = useRef<{ code: string; hits: number; at: number } | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (visible) {
      setActive(true);
      setTotal(0);
      setFeedback(null);
      setManual("");
      counted.current = {};
      candidate.current = null;
    }
  }, [visible]);

  const accept = async (code: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const result = await onScanned(code);
    if (result) {
      setFeedback(result);
      if (result.ok) setTotal((n) => n + 1);
    } else {
      setTotal((n) => n + 1);
    }
  };

  // Frame the user aims at: centered, 80% wide.
  const frame = {
    w: area.w * 0.8,
    h: Math.min(area.h * 0.3, 190),
  };
  const frameLeft = (area.w - frame.w) / 2;
  const frameTop = (area.h - frame.h) / 2;

  const insideFrame = (e: { bounds?: any; cornerPoints?: { x: number; y: number }[] }) => {
    if (!area.w || !area.h) return true;
    let cx: number | null = null;
    let cy: number | null = null;
    if (e.cornerPoints?.length) {
      cx = e.cornerPoints.reduce((s, p) => s + p.x, 0) / e.cornerPoints.length;
      cy = e.cornerPoints.reduce((s, p) => s + p.y, 0) / e.cornerPoints.length;
    } else if (e.bounds?.origin && e.bounds?.size) {
      cx = e.bounds.origin.x + e.bounds.size.width / 2;
      cy = e.bounds.origin.y + e.bounds.size.height / 2;
    }
    // No position, or one outside the preview (different coordinate space on
    // some devices): don't guess, let the confirmation rule decide.
    if (cx == null || cy == null || cx < 0 || cy < 0 || cx > area.w || cy > area.h) return true;
    return (
      cx >= frameLeft - FRAME_MARGIN &&
      cx <= frameLeft + frame.w + FRAME_MARGIN &&
      cy >= frameTop - FRAME_MARGIN &&
      cy <= frameTop + frame.h + FRAME_MARGIN
    );
  };

  const onRead = (e: { data: string; bounds?: any; cornerPoints?: { x: number; y: number }[] }) => {
    if (!active || busy.current) return;
    const code = e.data.replace(/\s+/g, "");
    if (!code || !insideFrame(e)) return;
    const now = Date.now();
    const lastCounted = counted.current[code];
    if (lastCounted !== undefined && now - lastCounted < LEAVE_GAP_MS) {
      counted.current[code] = now; // still in view: already counted
      return;
    }
    const c = candidate.current;
    if (c && c.code === code && now - c.at < CONFIRM_WINDOW_MS) {
      c.hits += 1;
      c.at = now;
    } else {
      candidate.current = { code, hits: 1, at: now };
    }
    if ((candidate.current?.hits ?? 0) < 2) return;
    candidate.current = null;
    counted.current[code] = now;
    busy.current = true;
    accept(code).finally(() => {
      busy.current = false;
    });
    if (!continuous) setActive(false);
  };

  const submitManual = () => {
    const code = manual.replace(/\s+/g, "");
    setManual("");
    if (!code) return;
    counted.current[code] = Date.now();
    accept(code);
  };

  const granted = permission?.granted;
  const onLayout = (e: LayoutChangeEvent) =>
    setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

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
          <View style={styles.camera} onLayout={onLayout}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
              }}
              onBarcodeScanned={active ? onRead : undefined}
            />
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.frame, { left: frameLeft, top: frameTop, width: frame.w, height: frame.h }]}>
                <View style={[styles.corner, styles.tl]} />
                <View style={[styles.corner, styles.tr]} />
                <View style={[styles.corner, styles.bl]} />
                <View style={[styles.corner, styles.br]} />
                {!active && <Text style={styles.paused}>{t("scanPaused")}</Text>}
              </View>
              <Text style={[styles.hint, { top: frameTop + frame.h + spacing.md }]}>{t("scanFrameHint")}</Text>
            </View>
            {continuous && (
              <View pointerEvents="none" style={styles.counterWrap}>
                <View style={styles.counter}>
                  <Text style={styles.counterText} testID="scan-count">
                    {t("scannedCount")}: {total}
                  </Text>
                </View>
                {feedback && (
                  <View style={[styles.last, !feedback.ok && styles.lastBad]}>
                    <Text style={styles.lastText} numberOfLines={2}>
                      {feedback.label}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.camera, styles.noCamera]}>
            <Ionicons name="camera-outline" size={48} color={colors.borderStrong} />
            <Text style={styles.noCameraText}>{t("cameraPermissionNeeded")}</Text>
            {Platform.OS !== "web" && permission?.canAskAgain !== false && (
              <Button title={t("allowCamera")} onPress={() => requestPermission()} />
            )}
          </View>
        )}

        {continuous && granted && Platform.OS !== "web" && (
          <View style={styles.controls}>
            <Pressable
              testID="scan-toggle"
              style={[styles.toggle, !active && styles.toggleResume]}
              onPress={() => setActive((v) => !v)}
            >
              <Ionicons name={active ? "pause" : "play"} size={22} color={colors.onBrand} />
              <Text style={styles.toggleText}>{active ? t("scanPause") : t("scanResume")}</Text>
            </Pressable>
            <Pressable testID="scan-done" style={styles.done} onPress={onClose}>
              <Text style={styles.doneText}>{t("scanDone")}</Text>
            </Pressable>
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
            onSubmitEditing={submitManual}
          />
          <Pressable style={styles.okBtn} onPress={submitManual}>
            <Ionicons name="checkmark" size={24} color={colors.onBrand} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const CORNER = 26;
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
  frame: { position: "absolute", alignItems: "center", justifyContent: "center" },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: colors.onBrand },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.md },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.md },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.md },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.md },
  paused: {
    color: colors.onBrand,
    fontWeight: "800",
    fontSize: font.xl,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  hint: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    color: colors.onBrand,
    fontSize: font.base,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 4,
  },
  counterWrap: { position: "absolute", top: spacing.md, left: spacing.lg, right: spacing.lg, gap: spacing.sm, alignItems: "center" },
  counter: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  counterText: { color: colors.onBrand, fontSize: font.xl, fontWeight: "800" },
  last: {
    backgroundColor: "rgba(5,150,105,0.92)",
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "100%",
  },
  lastBad: { backgroundColor: "rgba(217,119,6,0.95)" },
  lastText: { color: colors.onBrand, fontSize: font.base, fontWeight: "600", textAlign: "center" },
  noCamera: { alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  noCameraText: { color: colors.onSurfaceInverse, textAlign: "center", fontSize: font.base },
  controls: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  toggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.error,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  toggleResume: { backgroundColor: colors.success },
  toggleText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "700" },
  done: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.onBrand,
    paddingHorizontal: spacing.xl,
  },
  doneText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "700" },
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
