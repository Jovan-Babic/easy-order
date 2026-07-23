import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { useAuth } from "@/src/context/AuthContext";
import { api, Customer, Product, OrderItem } from "@/src/api";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { LangToggle } from "@/src/components/LangToggle";
import { Button } from "@/src/components/Button";
import { LOGOUT } from "@/constants/testIds";

export default function OrderCatalog() {
  const { t } = useApp();
  const { logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [discountSel, setDiscountSel] = useState<Record<string, number>>({});
  const [discountPickerFor, setDiscountPickerFor] = useState<Product | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [manuFilter, setManuFilter] = useState<string>("__all__");

  const load = useCallback(async () => {
    try {
      setError(false);
      setLoading(true);
      const [p, c] = await Promise.all([api.listProducts(), api.listCustomers()]);
      setProducts(p);
      setCustomers(c);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setQty = (id: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: value.replace(/[^0-9]/g, "") }));
  };

  const filteredCustomers = useMemo(
    () =>
      customers.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      ),
    [customers, search]
  );

  const orderedCount = useMemo(
    () => Object.values(drafts).filter((q) => Number(q) > 0).length,
    [drafts]
  );

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.manufacturer) set.add(p.manufacturer);
    });
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      const matchManu = manuFilter === "__all__" || (p.manufacturer || "") === manuFilter;
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.manufacturer || "").toLowerCase().includes(q);
      return matchManu && matchSearch;
    });
  }, [products, manuFilter, productSearch]);

  const confirm = async () => {
    if (!selected) return;
    const items: OrderItem[] = products
      .filter((p) => Number(drafts[p.id]) > 0)
      .map((p) => ({
        product_id: p.id,
        name: p.name,
        image: p.image,
        manufacturer: p.manufacturer,
        price_no_vat: p.price_no_vat,
        vat_rate: p.vat_rate,
        pieces_per_package: p.pieces_per_package,
        boxes_per_transport: p.boxes_per_transport,
        discount: discountSel[p.id] ?? p.discount ?? 0,
        ordered_qty: Number(drafts[p.id]) || 0,
      }));
    if (items.length === 0) return;
    try {
      setSubmitting(true);
      const order = await api.createOrder({
        customer_id: selected.id,
        customer_name: selected.name,
        items,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDrafts({});
      router.push({ pathname: "/invoice", params: { id: order.id } });
    } finally {
      setSubmitting(false);
    }
  };

  const canConfirm = !!selected && orderedCount > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerRow}>
          <Text style={styles.appName}>Easy Order</Text>
          <View style={styles.headerActions}>
            <LangToggle />
            <Pressable
              testID={LOGOUT.button}
              onPress={() => logout()}
              style={styles.logoutBtn}
              hitSlop={8}
            >
              <Ionicons name="log-out-outline" size={22} color={colors.muted} />
            </Pressable>
          </View>
        </View>
        <Pressable
          testID="customer-picker-button"
          style={styles.customerBtn}
          onPress={() => setPicking(true)}
        >
          <Ionicons name="business-outline" size={20} color={colors.brand} />
          <Text
            style={[styles.customerBtnText, !selected && { color: colors.muted }]}
            numberOfLines={1}
          >
            {selected ? selected.name : t("selectCustomer")}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        <View style={styles.productSearchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="product-search-input"
            placeholder={`${t("products")} / ${t("manufacturer")}`}
            placeholderTextColor={colors.muted}
            value={productSearch}
            onChangeText={setProductSearch}
            style={styles.productSearchInput}
          />
          {productSearch.length > 0 && (
            <Pressable testID="clear-product-search" onPress={() => setProductSearch("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
        {manufacturers.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
            contentContainerStyle={styles.chipRowContent}
          >
            {[{ key: "__all__", label: t("allManufacturers") }, ...manufacturers.map((m) => ({ key: m, label: m }))].map(
              (c) => {
                const active = manuFilter === c.key;
                return (
                  <Pressable
                    key={c.key}
                    testID={`manu-chip-${c.key}`}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setManuFilter(c.key);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                  </Pressable>
                );
              }
            )}
          </ScrollView>
        )}
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.mutedText}>{t("loading")}</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
          <Button title={t("retry")} onPress={load} variant="secondary" style={{ marginTop: spacing.lg }} testID="retry-button" />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={56} color={colors.borderStrong} />
          <Text style={styles.mutedText}>{t("noProducts")}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={{
              padding: spacing.lg,
              paddingBottom: insets.bottom + 110,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {filteredProducts.length === 0 ? (
              <View style={{ alignItems: "center", paddingTop: spacing.xxxl }}>
                <Ionicons name="search-outline" size={48} color={colors.borderStrong} />
                <Text style={styles.mutedText}>{t("noProducts")}</Text>
              </View>
            ) : null}
            {filteredProducts.map((p) => {
              return (
                <View key={p.id} style={styles.card} testID={`product-card-${p.id}`}>
                  <View style={styles.cardTop}>
                    <Pressable
                      testID={`product-image-${p.id}`}
                      onPress={() => p.image && setZoomImage(p.image)}
                    >
                      <Image
                        source={{ uri: p.image || undefined }}
                        style={styles.pImage}
                        contentFit="cover"
                        transition={200}
                      />
                      <View style={styles.zoomHint}>
                        <Ionicons name="expand-outline" size={12} color="#fff" />
                      </View>
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pName}>{p.name}</Text>
                      {!!p.manufacturer && (
                        <Text style={styles.pManufacturer}>{p.manufacturer}</Text>
                      )}
                      <View style={styles.metaRow}>
                        <Meta label={t("priceNoVat")} value={String(p.price_no_vat ?? 0)} />
                        <Meta label={t("piecesPerPackage")} value={String(p.pieces_per_package ?? 0)} />
                        <Meta label={t("transportPackage")} value={String(p.boxes_per_transport ?? 0)} />
                      </View>
                    </View>
                  </View>

                  <View style={styles.inputsRow}>
                    <View style={styles.discountBadge}>
                      <Text style={styles.fieldLabel}>{t("discount")}</Text>
                      <Pressable
                        testID={`discount-dropdown-${p.id}`}
                        style={styles.discountDropdown}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setDiscountPickerFor(p);
                        }}
                      >
                        <Text style={styles.discountValue} testID={`discount-value-${p.id}`}>
                          {discountSel[p.id] ?? p.discount ?? 0}%
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={colors.muted} />
                      </Pressable>
                    </View>
                    <Field
                      label={t("orderedPieces")}
                      value={drafts[p.id] || ""}
                      onChangeText={(v) => setQty(p.id, v)}
                      testID={`qty-input-${p.id}`}
                      placeholder="0"
                      highlight
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Sticky confirm */}
          <BlurView intensity={40} tint="light" style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            {orderedCount > 0 && (
              <Text style={styles.footerHint} testID="ordered-count">
                {orderedCount} {t("items")}
              </Text>
            )}
            <Button
              title={t("confirm")}
              icon="checkmark-circle"
              onPress={confirm}
              disabled={!canConfirm}
              loading={submitting}
              testID="confirm-button"
            />
            {!selected && (
              <Text style={styles.footerWarn}>{t("selectCustomerFirst")}</Text>
            )}
          </BlurView>
        </KeyboardAvoidingView>
      )}

      {/* Customer picker modal */}
      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPicking(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t("selectCustomer")}</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              testID="customer-search-input"
              placeholder={t("search")}
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
          </View>
          <FlatList
            data={filteredCustomers}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={[styles.mutedText, { textAlign: "center", marginTop: spacing.xl }]}>
                {t("noCustomers")}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                testID={`customer-option-${item.id}`}
                style={styles.custRow}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelected(item);
                  setPicking(false);
                }}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.custName}>{item.name}</Text>
                  {!!item.address && <Text style={styles.custSub} numberOfLines={1}>{item.address}</Text>}
                </View>
                {selected?.id === item.id && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* Discount dropdown */}
      <Modal
        visible={!!discountPickerFor}
        transparent
        animationType="fade"
        onRequestClose={() => setDiscountPickerFor(null)}
      >
        <Pressable style={styles.centerBackdrop} onPress={() => setDiscountPickerFor(null)}>
          {discountPickerFor && (
          <View style={styles.discountMenu}>
            <Text style={styles.discountMenuTitle}>{discountPickerFor?.name}</Text>
            {(discountPickerFor?.discounts && discountPickerFor.discounts.length > 0
              ? discountPickerFor.discounts
              : [discountPickerFor?.discount ?? 0]
            ).map((opt) => {
              const pid = discountPickerFor!.id;
              const current = discountSel[pid] ?? discountPickerFor?.discount ?? 0;
              const active = current === opt;
              return (
                <Pressable
                  key={String(opt)}
                  testID={`discount-option-${opt}`}
                  style={[styles.discountOption, active && styles.discountOptionActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setDiscountSel((prev) => ({ ...prev, [pid]: opt }));
                    setDiscountPickerFor(null);
                  }}
                >
                  <Text style={[styles.discountOptionText, active && styles.discountOptionTextActive]}>
                    {opt}%
                  </Text>
                  {active && <Ionicons name="checkmark" size={18} color={colors.brand} />}
                </Pressable>
              );
            })}
          </View>
          )}
        </Pressable>
      </Modal>

      {/* Fullscreen image zoom */}
      <Modal
        visible={!!zoomImage}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomImage(null)}
      >
        <Pressable style={styles.zoomBackdrop} testID="image-zoom-overlay" onPress={() => setZoomImage(null)}>
          <Image
            source={{ uri: zoomImage || undefined }}
            style={styles.zoomImage}
            contentFit="contain"
          />
          <View style={[styles.zoomClose, { top: insets.top + spacing.md }]}>
            <Ionicons name="close" size={28} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  testID,
  placeholder,
  highlight,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  testID: string;
  placeholder?: string;
  highlight?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor={colors.borderStrong}
        style={[styles.input, highlight && styles.inputHighlight]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  appName: { fontSize: font.xxl, fontWeight: "800", color: colors.onSurface },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoutBtn: { padding: spacing.xs },
  customerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  customerBtnText: { flex: 1, fontSize: font.lg, fontWeight: "700", color: colors.brand },
  productSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productSearchInput: { flex: 1, paddingVertical: spacing.md, fontSize: font.base, color: colors.onSurface },
  discountBadge: { flex: 1 },
  discountDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceTertiary,
  },
  discountValue: { fontSize: font.lg, fontWeight: "700", color: colors.onSurfaceSecondary },
  zoomHint: {
    position: "absolute",
    right: 4,
    bottom: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radius.sm,
    padding: 3,
  },
  centerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  discountMenu: {
    width: "80%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  discountMenuTitle: {
    fontSize: font.base,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  discountOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  discountOptionActive: { backgroundColor: colors.brandSecondary },
  discountOptionText: { fontSize: font.lg, fontWeight: "700", color: colors.onSurfaceSecondary },
  discountOptionTextActive: { color: colors.brand },
  zoomBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomImage: { width: "100%", height: "80%" },
  zoomClose: {
    position: "absolute",
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: { marginTop: spacing.md, height: 56 },
  chipRowContent: { gap: spacing.sm, paddingRight: spacing.md, alignItems: "center" },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: font.base, fontWeight: "700", color: colors.onSurfaceSecondary },
  chipTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  mutedText: { color: colors.muted, fontSize: font.base, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadow.card,
  },
  cardTop: { flexDirection: "row", gap: spacing.md },
  pImage: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  pName: { fontSize: font.lg, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.xs },
  pManufacturer: { fontSize: font.sm, fontWeight: "600", color: colors.brand, marginBottom: spacing.sm },
  metaRow: { flexDirection: "row", gap: spacing.sm },
  meta: { flex: 1 },
  metaLabel: { fontSize: 10, color: colors.muted, fontWeight: "600" },
  metaValue: { fontSize: font.base, color: colors.onSurfaceSecondary, fontWeight: "700" },
  inputsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  fieldLabel: { fontSize: font.sm, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: font.lg,
    fontWeight: "700",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  inputHighlight: { borderColor: colors.brand, backgroundColor: colors.brandSecondary },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "rgba(243,244,246,0.7)",
  },
  footerHint: { textAlign: "center", color: colors.brand, fontWeight: "700", marginBottom: spacing.xs },
  footerWarn: { textAlign: "center", color: colors.warning, fontSize: font.sm, marginTop: spacing.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "75%",
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: font.base, color: colors.onSurface },
  custRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.brand, fontWeight: "800", fontSize: font.lg },
  custName: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  custSub: { fontSize: font.sm, color: colors.muted },
});
