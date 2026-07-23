import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/src/context/AppContext";
import { api, Customer, Product } from "@/src/api";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";

type Tab = "products" | "customers";

export default function AdminScreen() {
  const { t, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [permMsg, setPermMsg] = useState(false);
  const [newDisc, setNewDisc] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [p, c] = await Promise.all([api.listProducts(), api.listCustomers()]);
      setProducts(p);
      setCustomers(c);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAdd = () => {
    setEditing(null);
    setForm(tab === "products"
      ? { name: "", image: "", manufacturer: "", price_no_vat: "", vat_rate: "20", discount: 0, discounts: [0], pieces_per_package: "", boxes_per_transport: "" }
      : { name: "", address: "", email: "", phone: "", pib: "" });
    setNewDisc("");
    setPermMsg(false);
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm(
      tab === "products"
        ? {
            name: item.name,
            image: item.image || "",
            manufacturer: item.manufacturer || "",
            price_no_vat: String(item.price_no_vat ?? ""),
            vat_rate: String(item.vat_rate ?? "20"),
            discount: item.discount ?? 0,
            discounts: item.discounts && item.discounts.length ? [...item.discounts] : [item.discount ?? 0],
            pieces_per_package: String(item.pieces_per_package ?? ""),
            boxes_per_transport: String(item.boxes_per_transport ?? ""),
          }
        : { name: item.name, address: item.address || "", email: item.email || "", phone: item.phone || "", pib: item.pib || "" }
    );
    setNewDisc("");
    setPermMsg(false);
    setFormOpen(true);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    let canAskAgain = perm.canAskAgain;
    if (status !== "granted") {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = req.status;
      canAskAgain = req.canAskAgain;
    }
    if (status !== "granted") {
      if (!canAskAgain) setPermMsg(true);
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.5,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets?.[0]?.base64) {
      setForm((f: any) => ({ ...f, image: `data:image/jpeg;base64,${res.assets[0].base64}` }));
    }
  };

  const save = async () => {
    if (!form.name?.trim()) return;
    try {
      setSaving(true);
      if (tab === "products") {
        const payload = {
          name: form.name.trim(),
          image: form.image,
          manufacturer: form.manufacturer,
          price_no_vat: Number(form.price_no_vat) || 0,
          vat_rate: Number(form.vat_rate) || 0,
          discount: Number(form.discount) || 0,
          discounts: (form.discounts && form.discounts.length ? form.discounts : [Number(form.discount) || 0]),
          pieces_per_package: Number(form.pieces_per_package) || 0,
          boxes_per_transport: Number(form.boxes_per_transport) || 0,
        };
        if (editing) await api.updateProduct(editing.id, payload);
        else await api.createProduct(payload);
      } else {
        const payload = {
          name: form.name.trim(),
          address: form.address,
          email: form.email,
          phone: form.phone,
          pib: form.pib,
        };
        if (editing) await api.updateCustomer(editing.id, payload);
        else await api.createCustomer(payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setFormOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: any) => {
    if (tab === "products") await api.deleteProduct(item.id);
    else await api.deleteCustomer(item.id);
    showToast(t("delete"));
    await load();
  };

  const data = tab === "products" ? products : customers;

  const addDiscountValue = () => {
    const v = Number(newDisc);
    if (newDisc === "" || isNaN(v)) return;
    setForm((f: any) => {
      const list: number[] = f.discounts || [];
      if (list.includes(v)) return f;
      const next = [...list, v].sort((a, b) => a - b);
      return { ...f, discounts: next, discount: list.length === 0 ? v : f.discount };
    });
    setNewDisc("");
  };

  const removeDiscountValue = (v: number) => {
    setForm((f: any) => {
      const next = (f.discounts || []).filter((x: number) => x !== v);
      const newDefault = f.discount === v ? (next[0] ?? 0) : f.discount;
      return { ...f, discounts: next, discount: newDefault };
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>{t("admin")}</Text>
        <View style={styles.segment}>
          {(["products", "customers"] as Tab[]).map((s) => (
            <Pressable
              key={s}
              testID={`segment-${s}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTab(s);
              }}
              style={[styles.segBtn, tab === s && styles.segBtnActive]}
            >
              <Text style={[styles.segText, tab === s && styles.segTextActive]}>
                {s === "products" ? t("products") : t("customers")}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 90 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="albums-outline" size={48} color={colors.borderStrong} />
              <Text style={styles.mutedText}>
                {tab === "products" ? t("noProducts") : t("noCustomers")}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`admin-item-${item.id}`}>
              {tab === "products" ? (
                <Image source={{ uri: (item as Product).image || undefined }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                {tab === "products" ? (
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {(item as Product).manufacturer ? `${(item as Product).manufacturer} · ` : ""}
                    {t("priceNoVat")}: {(item as Product).price_no_vat ?? 0}
                  </Text>
                ) : (
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {(item as Customer).pib ? `PIB ${(item as Customer).pib} · ` : ""}
                    {(item as Customer).address}
                  </Text>
                )}
              </View>
              <Pressable testID={`edit-${item.id}`} hitSlop={10} onPress={() => openEdit(item)} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={22} color={colors.brand} />
              </Pressable>
              <Pressable testID={`delete-${item.id}`} hitSlop={10} onPress={() => remove(item)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={22} color={colors.error} />
              </Pressable>
            </View>
          )}
        />
      )}

      <Pressable testID="fab-add" style={[styles.fab, { bottom: insets.bottom + 16 }]} onPress={openAdd}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* Form modal */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFormOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {editing
                ? tab === "products" ? t("editProduct") : t("editCustomer")
                : tab === "products" ? t("addProduct") : t("addCustomer")}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {tab === "products" && (
                <>
                  <Pressable testID="pick-image-button" style={styles.imagePicker} onPress={pickImage}>
                    {form.image ? (
                      <Image source={{ uri: form.image }} style={styles.pickedImage} contentFit="cover" />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={32} color={colors.muted} />
                        <Text style={styles.mutedText}>{t("pickImage")}</Text>
                      </>
                    )}
                  </Pressable>
                  {permMsg && (
                    <Button title={t("settings")} variant="secondary" icon="settings-outline" onPress={() => Linking.openSettings()} testID="open-settings-button" style={{ marginBottom: spacing.md }} />
                  )}
                </>
              )}

              <FormField label={t("name")} value={form.name} onChangeText={(v) => setForm((f: any) => ({ ...f, name: v }))} testID="form-name" />

              {tab === "products" ? (
                <>
                  <FormField label={t("manufacturer")} value={form.manufacturer} onChangeText={(v) => setForm((f: any) => ({ ...f, manufacturer: v }))} testID="form-manufacturer" />
                  <FormField label={t("priceNoVat")} value={form.price_no_vat} onChangeText={(v) => setForm((f: any) => ({ ...f, price_no_vat: v.replace(/[^0-9.]/g, "") }))} keyboardType="numeric" testID="form-price" />
                  <FormField label={t("vatRate")} value={form.vat_rate} onChangeText={(v) => setForm((f: any) => ({ ...f, vat_rate: v.replace(/[^0-9.]/g, "") }))} keyboardType="numeric" testID="form-vat" />

                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={styles.fieldLabel}>{t("discountOptions")}</Text>
                    <View style={styles.discAddRow}>
                      <TextInput
                        testID="form-discount-input"
                        value={newDisc}
                        onChangeText={(v) => setNewDisc(v.replace(/[^0-9.]/g, ""))}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.borderStrong}
                        style={[styles.input, { flex: 1 }]}
                        onSubmitEditing={addDiscountValue}
                      />
                      <Pressable testID="form-add-discount" style={styles.addDiscBtn} onPress={addDiscountValue}>
                        <Ionicons name="add" size={24} color="#fff" />
                      </Pressable>
                    </View>
                    <Text style={styles.discHint}>{t("setDefault")}</Text>
                    <View style={styles.discChips}>
                      {(form.discounts || []).map((d: number) => {
                        const isDefault = form.discount === d;
                        return (
                          <Pressable
                            key={String(d)}
                            testID={`disc-chip-${d}`}
                            style={[styles.discChip, isDefault && styles.discChipDefault]}
                            onPress={() => setForm((f: any) => ({ ...f, discount: d }))}
                          >
                            {isDefault && <Ionicons name="star" size={12} color="#fff" style={{ marginRight: 4 }} />}
                            <Text style={[styles.discChipText, isDefault && styles.discChipTextDefault]}>{d}%</Text>
                            <Pressable testID={`disc-remove-${d}`} hitSlop={8} onPress={() => removeDiscountValue(d)} style={{ marginLeft: 6 }}>
                              <Ionicons name="close-circle" size={16} color={isDefault ? "#fff" : colors.muted} />
                            </Pressable>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <FormField label={t("piecesPerPackage")} value={form.pieces_per_package} onChangeText={(v) => setForm((f: any) => ({ ...f, pieces_per_package: v.replace(/[^0-9]/g, "") }))} keyboardType="numeric" testID="form-pieces" />
                  <FormField label={t("transportPackage")} value={form.boxes_per_transport} onChangeText={(v) => setForm((f: any) => ({ ...f, boxes_per_transport: v.replace(/[^0-9]/g, "") }))} keyboardType="numeric" testID="form-boxes" />
                </>
              ) : (
                <>
                  <FormField label={t("pib")} value={form.pib} onChangeText={(v) => setForm((f: any) => ({ ...f, pib: v.replace(/[^0-9]/g, "") }))} keyboardType="numeric" testID="form-pib" />
                  <FormField label={t("address")} value={form.address} onChangeText={(v) => setForm((f: any) => ({ ...f, address: v }))} testID="form-address" />
                  <FormField label={t("email")} value={form.email} onChangeText={(v) => setForm((f: any) => ({ ...f, email: v }))} keyboardType="email-address" testID="form-email" />
                  <FormField label={t("phone")} value={form.phone} onChangeText={(v) => setForm((f: any) => ({ ...f, phone: v }))} keyboardType="phone-pad" testID="form-phone" />
                </>
              )}

              <View style={{ height: spacing.md }} />
              <Button title={t("save")} icon="checkmark" onPress={save} loading={saving} disabled={!form.name?.trim()} testID="form-save-button" />
              <View style={{ height: spacing.sm }} />
              <Button title={t("cancel")} variant="ghost" onPress={() => setFormOpen(false)} testID="form-cancel-button" />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: any;
  testID: string;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        style={styles.input}
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
  headerTitle: { fontSize: font.xxl, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: 3 },
  segBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm },
  segBtnActive: { backgroundColor: colors.surfaceSecondary, ...shadow.card },
  segText: { fontSize: font.base, fontWeight: "700", color: colors.muted },
  segTextActive: { color: colors.brand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxxl },
  mutedText: { color: colors.muted, marginTop: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.brand, fontWeight: "800", fontSize: font.lg },
  itemName: { fontSize: font.lg, fontWeight: "700", color: colors.onSurface },
  itemSub: { fontSize: font.sm, color: colors.muted, marginTop: 2 },
  iconBtn: { padding: spacing.xs },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "88%",
  },
  sheetHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontSize: font.xl, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  imagePicker: {
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  pickedImage: { width: "100%", height: "100%" },
  fieldLabel: { fontSize: font.sm, color: colors.onSurfaceTertiary, fontWeight: "600", marginBottom: spacing.xs },
  discAddRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  addDiscBtn: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  discHint: { fontSize: font.sm, color: colors.muted, marginTop: spacing.sm },
  discChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  discChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  discChipDefault: { backgroundColor: colors.brand, borderColor: colors.brand },
  discChipText: { fontSize: font.base, fontWeight: "700", color: colors.onSurfaceSecondary },
  discChipTextDefault: { color: "#fff" },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: font.lg,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
});
