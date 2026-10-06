import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { api, ApiError, Product } from "@/src/api";
import { BarcodeScanner } from "@/src/components/BarcodeScanner";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing, font, shadow } from "@/src/theme";

type Props = { mode: "receipt" | "count" };

/** Warehouse stock entry on the phone: scan (or search) products into a list,
 *  edit quantities, confirm once. Receipt adds, count sets the counted qty. */
export function StockScanPanel({ mode }: Props) {
  const { t, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await api.listProducts());
    } catch {
      showToast(t("networkError"));
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Scan or pick = one more piece on that line (a fresh line starts at 1).
  const addOne = (id: string) => {
    setQtys((prev) => ({ ...prev, [id]: String((Number(prev[id]) || 0) + 1) }));
    setOrder((prev) => (prev.includes(id) ? prev : [id, ...prev]));
  };

  const onScanned = async (code: string) => {
    const local = products.find((p) => p.barcode === code);
    if (local) return addOne(local.id);
    try {
      const found = await api.getProductByBarcode(code);
      setProducts((prev) => (prev.some((p) => p.id === found.id) ? prev : [...prev, found]));
      addOne(found.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setScanning(false);
        setUnknownCode(code);
      } else {
        showToast(t("networkError"));
      }
    }
  };

  const link = async (product: Product) => {
    if (!unknownCode) return;
    try {
      const updated = await api.linkBarcode(product.id, unknownCode);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, barcode: updated.barcode } : p)));
      addOne(product.id);
      showToast(t("barcodeLinked"));
      setUnknownCode(null);
    } catch (e) {
      Alert.alert(t("somethingWentWrong"), e instanceof ApiError ? e.detail : String(e));
    }
  };

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.manufacturer || "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [products, search]);

  const lines = order.filter((id) => byId.has(id));
  const valid =
    lines.length > 0 &&
    lines.every((id) => qtys[id] !== "" && qtys[id] != null && (mode === "count" || Number(qtys[id]) > 0)) &&
    (mode === "receipt" || note.trim() !== "");

  const confirm = async () => {
    Keyboard.dismiss();
    setBusy(true);
    try {
      if (mode === "receipt") {
        await api.stockReceipt(
          lines.map((id) => ({ product_id: id, qty: Number(qtys[id]) })),
          note.trim() || undefined
        );
      } else {
        await api.stockCount(
          lines.map((id) => ({ product_id: id, counted_qty: Number(qtys[id]) })),
          note.trim()
        );
      }
      showToast(t("stockSaved"));
      setQtys({});
      setOrder([]);
      setNote("");
      await load();
    } catch (e) {
      Alert.alert(t("somethingWentWrong"), e instanceof ApiError ? e.detail : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={lines}
        keyExtractor={(id) => id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Button title={t("scanBarcode")} icon="barcode-outline" onPress={() => setScanning(true)} testID="scan-button" />
            <TextInput
              testID="stock-search"
              style={styles.input}
              placeholder={t("searchOrScan")}
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
            />
            {matches.map((p) => (
              <Pressable
                key={p.id}
                style={styles.match}
                onPress={() => {
                  addOne(p.id);
                  setSearch("");
                }}
              >
                <Text style={styles.matchName}>{p.name}</Text>
                <Ionicons name="add-circle" size={22} color={colors.brand} />
              </Pressable>
            ))}
            {mode === "count" && <Text style={styles.hint}>{t("countHint")}</Text>}
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>{t("scanToStart")}</Text>}
        renderItem={({ item: id }) => {
          const p = byId.get(id)!;
          const tracked = p.stock_qty != null;
          const book = p.stock_qty ?? 0;
          const entered = Number(qtys[id]) || 0;
          const diff = entered - book;
          return (
            <View style={styles.card}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{p.name}</Text>
                {!!p.barcode && <Text style={styles.sub}>{p.barcode}</Text>}
                <Text style={styles.sub}>
                  {t("bookStock")}: {tracked ? book : t("notTracked")}
                  {mode === "receipt" && entered > 0 ? ` → ${book + entered}` : ""}
                  {mode === "count" && qtys[id] !== "" ? ` · ${t("difference")}: ${diff > 0 ? "+" : ""}${diff}` : ""}
                </Text>
              </View>
              <TextInput
                testID={`qty-${id}`}
                style={styles.qty}
                keyboardType="number-pad"
                value={qtys[id] ?? ""}
                onChangeText={(v) => setQtys((prev) => ({ ...prev, [id]: v.replace(/[^0-9]/g, "") }))}
              />
              <Pressable
                hitSlop={8}
                accessibilityLabel={t("remove")}
                onPress={() => {
                  setOrder((prev) => prev.filter((x) => x !== id));
                  setQtys((prev) => {
                    const next = { ...prev };
                    delete next[id];
                    return next;
                  });
                }}
              >
                <Ionicons name="close-circle" size={24} color={colors.muted} />
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          lines.length > 0 ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <TextInput
                testID="stock-note"
                style={styles.input}
                placeholder={mode === "count" ? t("countNote") : t("receiptNote")}
                placeholderTextColor={colors.muted}
                value={note}
                onChangeText={setNote}
              />
              <Button
                title={mode === "count" ? t("confirmCount") : t("confirmReceipt")}
                testID="stock-confirm"
                loading={busy}
                disabled={busy || !valid}
                onPress={confirm}
              />
            </View>
          ) : null
        }
      />

      <BarcodeScanner visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />

      <Modal visible={!!unknownCode} animationType="slide" onRequestClose={() => setUnknownCode(null)}>
        <View style={[styles.modal, { paddingTop: insets.top + spacing.lg }]}>
          <Text style={styles.modalTitle}>{t("productNotFound")}</Text>
          <Text style={styles.sub}>{unknownCode}</Text>
          <Text style={[styles.hint, { marginTop: spacing.md }]}>{t("pickProductToLink")}</Text>
          <LinkPicker products={products} onPick={link} />
          <Button title={t("cancel")} variant="ghost" onPress={() => setUnknownCode(null)} />
        </View>
      </Modal>
    </View>
  );
}

function LinkPicker({ products, onPick }: { products: Product[]; onPick: (p: Product) => void }) {
  const { t } = useApp();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => !s || p.name.toLowerCase().includes(s)).slice(0, 30);
  }, [products, q]);
  return (
    <View style={{ flex: 1, marginVertical: spacing.md }}>
      <TextInput
        style={styles.input}
        placeholder={t("search")}
        placeholderTextColor={colors.muted}
        value={q}
        onChangeText={setQ}
      />
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable style={styles.match} onPress={() => onPick(item)}>
            <Text style={styles.matchName}>
              {item.name}
              {item.barcode ? `  (${item.barcode})` : ""}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
  },
  match: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  matchName: { flex: 1, color: colors.onSurface, fontSize: font.base },
  hint: { fontSize: font.sm, color: colors.muted },
  empty: { textAlign: "center", color: colors.muted, marginTop: spacing.xl },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  name: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  sub: { fontSize: font.sm, color: colors.muted },
  qty: {
    width: 72,
    textAlign: "center",
    fontSize: font.lg,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  modal: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
});
