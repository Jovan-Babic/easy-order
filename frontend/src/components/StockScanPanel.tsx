import React, { useCallback, useMemo, useRef, useState } from "react";
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
import { api, ApiError, Product, StockBatch } from "@/src/api";
import { BarcodeScanner, ScanFeedback } from "@/src/components/BarcodeScanner";
import { Button } from "@/src/components/Button";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { displayToIso, formatDateInput, isoToDisplay } from "@/src/utils/expiry";

type Props = { mode: "receipt" | "count" };

/** One expiry date of a product with expiry tracking: its date and pieces.
 *  `undated` = the stock that has no date (count mode only). */
type ExpRow = { key: string; date: string; qty: string; undated?: boolean };

let rowCounter = 0;
const newRow = (init: Partial<ExpRow> = {}): ExpRow => ({ key: `r${++rowCounter}`, date: "", qty: "", ...init });
const rowDate = (r: ExpRow) => (r.undated ? "" : displayToIso(r.date) ?? "x");
const totalPieces = (rows: ExpRow[]) => rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);

/** Warehouse stock entry on the phone: scan (or search) products into a list,
 *  edit quantities, confirm once. Receipt adds, count sets the counted qty. */
export function StockScanPanel({ mode }: Props) {
  const { t, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  // Products with expiry tracking: pieces per expiry date instead of one number.
  const [rows, setRows] = useState<Record<string, ExpRow[]>>({});
  const [batchInfo, setBatchInfo] = useState<Record<string, StockBatch[]>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What the unknown-barcode sheet shows: the two choices, the new-product form or the link list.
  const [unknownMode, setUnknownMode] = useState<"choice" | "new" | "link">("choice");

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

  // Latest quantities, so several scans in a row add up before React re-renders.
  const qtyRef = useRef<Record<string, string>>({});
  qtyRef.current = qtys;
  const rowsRef = useRef<Record<string, ExpRow[]>>({});
  rowsRef.current = rows;

  const loadBatches = async (id: string) => {
    try {
      const batches = await api.productBatches(id);
      setBatchInfo((prev) => ({ ...prev, [id]: batches }));
    } catch {
      // Only informational: the entry works without it.
    }
  };

  const setProductRows = (id: string, next: ExpRow[]) => {
    rowsRef.current = { ...rowsRef.current, [id]: next };
    setRows(rowsRef.current);
  };

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Scan or pick = one more piece on that line (a fresh line starts at 1).
  const addOne = (p: Product) => {
    const id = p.id;
    if (p.track_expiry) {
      // A scan adds a piece to the latest expiry row; the date is typed on the card.
      const current = rowsRef.current[id] ?? [];
      const last = current[current.length - 1];
      setProductRows(
        id,
        last ? [...current.slice(0, -1), { ...last, qty: String((Number(last.qty) || 0) + 1) }] : [newRow({ qty: "1" })]
      );
      if (!current.length) loadBatches(id);
      setOrder((prev) => (prev.includes(id) ? prev : [id, ...prev]));
      return totalPieces(rowsRef.current[id]);
    }
    const next = (Number(qtyRef.current[id]) || 0) + 1;
    qtyRef.current = { ...qtyRef.current, [id]: String(next) };
    setQtys(qtyRef.current);
    setOrder((prev) => (prev.includes(id) ? prev : [id, ...prev]));
    return next;
  };

  const onScanned = async (code: string): Promise<ScanFeedback> => {
    let product = products.find((p) => p.barcode === code);
    if (!product) {
      try {
        product = await api.getProductByBarcode(code);
        const found = product;
        setProducts((prev) => (prev.some((p) => p.id === found.id) ? prev : [...prev, found]));
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setScanning(false);
          setUnknownCode(code);
          return { ok: false, label: `${t("productNotFound")}: ${code}` };
        }
        showToast(t("networkError"));
        return { ok: false, label: t("networkError") };
      }
    }
    const qty = addOne(product);
    return { ok: true, label: `${product.name} · ${qty}` };
  };

  const link = async (product: Product) => {
    if (!unknownCode) return;
    try {
      const updated = await api.linkBarcode(product.id, unknownCode);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, barcode: updated.barcode } : p)));
      addOne({ ...product, barcode: updated.barcode });
      showToast(t("barcodeLinked"));
      setUnknownCode(null);
    } catch (e) {
      Alert.alert(t("somethingWentWrong"), e instanceof ApiError ? e.detail : String(e));
    }
  };

  const createProduct = async (v: { name: string; manufacturer: string; pieces: string; boxes: string }) => {
    if (!unknownCode) return;
    setBusy(true);
    try {
      const created = await api.quickAddProduct({
        name: v.name.trim(),
        barcode: unknownCode,
        manufacturer: v.manufacturer.trim() || undefined,
        pieces_per_package: v.pieces ? Number(v.pieces) : undefined,
        boxes_per_transport: v.boxes ? Number(v.boxes) : undefined,
      });
      setProducts((prev) => [...prev, created]);
      addOne(created);
      showToast(t("productAdded"));
      setUnknownCode(null);
      setUnknownMode("choice");
    } catch (e) {
      Alert.alert(t("somethingWentWrong"), e instanceof ApiError ? e.detail : String(e));
    } finally {
      setBusy(false);
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
  const rowsOk = (list: ExpRow[]) =>
    list.length > 0 &&
    list.every((r) => r.qty !== "" && (mode === "count" || Number(r.qty) > 0) && rowDate(r) !== "x") &&
    new Set(list.map(rowDate)).size === list.length;
  const lineOk = (id: string) =>
    byId.get(id)?.track_expiry
      ? rowsOk(rows[id] ?? [])
      : qtys[id] !== "" && qtys[id] != null && (mode === "count" || Number(qtys[id]) > 0);
  const valid = lines.length > 0 && lines.every(lineOk) && (mode === "receipt" || note.trim() !== "");

  const confirm = async () => {
    Keyboard.dismiss();
    setBusy(true);
    try {
      const tracked = (id: string) => byId.get(id)?.track_expiry === true;
      if (mode === "receipt") {
        await api.stockReceipt(
          lines.flatMap((id) =>
            tracked(id)
              ? rows[id].map((r) => ({ product_id: id, qty: Number(r.qty), expiry_date: displayToIso(r.date)! }))
              : [{ product_id: id, qty: Number(qtys[id]) }]
          ),
          note.trim() || undefined
        );
      } else {
        await api.stockCount(
          lines.map((id) =>
            tracked(id)
              ? {
                  product_id: id,
                  batches: rows[id].map((r) => ({
                    expiry_date: r.undated ? null : displayToIso(r.date),
                    counted_qty: Number(r.qty),
                  })),
                }
              : { product_id: id, counted_qty: Number(qtys[id]) }
          ),
          note.trim()
        );
      }
      showToast(t("stockSaved"));
      setQtys({});
      setRows({});
      rowsRef.current = {};
      setBatchInfo({});
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
                  addOne(p);
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
          if (p.track_expiry) {
            return (
              <ExpiryCard
                product={p}
                mode={mode}
                rows={rows[id] ?? []}
                batches={batchInfo[id] ?? []}
                onChange={(next) => setProductRows(id, next)}
                onRemove={() => {
                  setOrder((prev) => prev.filter((x) => x !== id));
                  const { [id]: _removed, ...rest } = rowsRef.current;
                  rowsRef.current = rest;
                  setRows(rest);
                }}
              />
            );
          }
          const tracked = p.stock_qty != null;
          const book = p.stock_qty ?? 0;
          const entered = Number(qtys[id]) || 0;
          const diff = entered - book;
          return (
            <View style={styles.card}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{p.name}</Text>
                {p.active === false && <Text style={[styles.sub, { color: colors.warning }]}>{t("inactive")}</Text>}
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

      <BarcodeScanner continuous visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />

      <Modal
        visible={!!unknownCode}
        animationType="slide"
        onRequestClose={() => {
          setUnknownCode(null);
          setUnknownMode("choice");
        }}
      >
        <View style={[styles.modal, { paddingTop: insets.top + spacing.lg }]}>
          <Text style={styles.modalTitle}>{t("productNotFound")}</Text>
          <Text style={styles.sub}>{unknownCode}</Text>
          {unknownMode === "new" ? (
            <NewProductForm
              code={unknownCode ?? ""}
              busy={busy}
              onSubmit={createProduct}
              onBack={() => setUnknownMode("choice")}
            />
          ) : unknownMode === "link" ? (
            <>
              <Text style={[styles.hint, { marginTop: spacing.md }]}>{t("pickProductToLink")}</Text>
              <LinkPicker products={products} onPick={link} />
              <Button title={t("backToList")} variant="ghost" onPress={() => setUnknownMode("choice")} />
            </>
          ) : (
            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              <Button
                title={t("addNewProduct")}
                icon="add-circle-outline"
                testID="quick-add-open"
                onPress={() => setUnknownMode("new")}
              />
              <Button
                title={t("linkToExisting")}
                icon="link-outline"
                variant="secondary"
                testID="link-open"
                onPress={() => setUnknownMode("link")}
              />
              <Button
                title={t("cancel")}
                variant="ghost"
                onPress={() => {
                  setUnknownCode(null);
                  setUnknownMode("choice");
                }}
              />
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

/** Line card for a product with expiry tracking: one row per expiry date. */
function ExpiryCard({
  product,
  mode,
  rows,
  batches,
  onChange,
  onRemove,
}: {
  product: Product;
  mode: "receipt" | "count";
  rows: ExpRow[];
  batches: StockBatch[];
  onChange: (rows: ExpRow[]) => void;
  onRemove: () => void;
}) {
  const { t } = useApp();
  const update = (key: string, patch: Partial<ExpRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const dates = rows.map(rowDate);
  // Count mode: existing batches that aren't on the card yet, one tap to add.
  const addable = mode === "count" ? batches.filter((b) => !dates.includes(b.expiry_date ?? "")) : [];
  return (
    <View style={[styles.card, { alignItems: "stretch", flexDirection: "column" }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name}>{product.name}</Text>
          {!!product.barcode && <Text style={styles.sub}>{product.barcode}</Text>}
          <Text style={styles.sub}>
            {t("bookStock")}: {product.stock_qty ?? t("notTracked")}
          </Text>
          {batches.length > 0 && (
            <Text style={styles.sub}>
              {t("stockByExpiry")}:{" "}
              {batches.map((b) => `${b.expiry_date ? isoToDisplay(b.expiry_date) : t("undatedStock")} × ${b.qty}`).join(" · ")}
            </Text>
          )}
        </View>
        <Pressable hitSlop={8} accessibilityLabel={t("remove")} onPress={onRemove}>
          <Ionicons name="close-circle" size={24} color={colors.muted} />
        </Pressable>
      </View>
      {rows.map((r) => (
        <View key={r.key} style={styles.expRow}>
          {r.undated ? (
            <Text style={[styles.expDate, styles.expUndated]}>{t("undatedStock")}</Text>
          ) : (
            <TextInput
              testID={`exp-date-${product.id}`}
              style={[styles.expDate, r.date !== "" && displayToIso(r.date) === null && styles.expInvalid]}
              placeholder={t("expiryDate")}
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={10}
              value={r.date}
              onChangeText={(v) => update(r.key, { date: formatDateInput(v) })}
            />
          )}
          <TextInput
            testID={`exp-qty-${product.id}`}
            style={styles.qty}
            keyboardType="number-pad"
            value={r.qty}
            onChangeText={(v) => update(r.key, { qty: v.replace(/[^0-9]/g, "") })}
          />
          {rows.length > 1 && (
            <Pressable hitSlop={8} onPress={() => onChange(rows.filter((x) => x.key !== r.key))}>
              <Ionicons name="remove-circle-outline" size={22} color={colors.muted} />
            </Pressable>
          )}
        </View>
      ))}
      {rows.length > 0 && !rows.every((r) => r.undated || displayToIso(r.date) !== null) && (
        <Text style={[styles.sub, { color: colors.warning }]}>{t("expiryDateInvalid")}</Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
        <Pressable style={styles.chip} onPress={() => onChange([...rows, newRow()])}>
          <Ionicons name="add" size={16} color={colors.brand} />
          <Text style={styles.chipText}>{t("addExpiryRow")}</Text>
        </Pressable>
        {addable.map((b) => (
          <Pressable
            key={b.id}
            style={styles.chip}
            onPress={() =>
              onChange([
                ...rows,
                b.expiry_date ? newRow({ date: isoToDisplay(b.expiry_date) }) : newRow({ undated: true }),
              ])
            }
          >
            <Text style={styles.chipText}>{b.expiry_date ? isoToDisplay(b.expiry_date) : t("undatedStock")}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function NewProductForm({
  code,
  busy,
  onSubmit,
  onBack,
}: {
  code: string;
  busy: boolean;
  onSubmit: (v: { name: string; manufacturer: string; pieces: string; boxes: string }) => void;
  onBack: () => void;
}) {
  const { t } = useApp();
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [pieces, setPieces] = useState("");
  const [boxes, setBoxes] = useState("");
  const digits = (v: string) => v.replace(/[^0-9]/g, "");
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
      <Text style={styles.hint}>{t("newProductHint")}</Text>
      <TextInput
        testID="quick-name"
        style={styles.input}
        placeholder={t("name")}
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        testID="quick-manufacturer"
        style={styles.input}
        placeholder={t("manufacturer")}
        placeholderTextColor={colors.muted}
        value={manufacturer}
        onChangeText={setManufacturer}
      />
      <TextInput
        style={styles.input}
        placeholder={t("piecesPerPackage")}
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        value={pieces}
        onChangeText={(v) => setPieces(digits(v))}
      />
      <TextInput
        style={styles.input}
        placeholder={t("transportPackage")}
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        value={boxes}
        onChangeText={(v) => setBoxes(digits(v))}
      />
      <Button
        title={t("save")}
        testID="quick-save"
        loading={busy}
        disabled={busy || !name.trim() || !code}
        onPress={() => onSubmit({ name, manufacturer, pieces, boxes })}
      />
      <Button title={t("backToList")} variant="ghost" onPress={onBack} />
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
  expRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  expDate: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.base,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  expUndated: { color: colors.muted, borderStyle: "dashed" },
  expInvalid: { borderColor: colors.warning },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  chipText: { color: colors.brand, fontSize: font.sm, fontWeight: "600" },
  modal: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface },
});
