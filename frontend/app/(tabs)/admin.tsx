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
  Switch,
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
import { api, ApiError, Customer, Product } from "@/src/api";
import { colors, radius, spacing, font, shadow } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { BarcodeScanner } from "@/src/components/BarcodeScanner";

type Tab = "products" | "customers";

type CountryCodeOption = {
  code: string;
  flag: string;
  label: string;
};

const DEFAULT_COUNTRY_CODES: CountryCodeOption[] = [
  { code: "+381", flag: "🇷🇸", label: "Serbia" },
  { code: "+385", flag: "🇭🇷", label: "Croatia" },
  { code: "+387", flag: "🇧🇦", label: "Bosnia and Herzegovina" },
  { code: "+421", flag: "🇸🇰", label: "Slovakia" },
  { code: "+386", flag: "🇸🇮", label: "Slovenia" },
];

const COUNTRY_CODE_LOOKUP: Record<string, CountryCodeOption> = {
  "+381": { code: "+381", flag: "🇷🇸", label: "Serbia" },
  "+1": { code: "+1", flag: "🇺🇸", label: "United States" },
  "+7": { code: "+7", flag: "🇷🇺", label: "Russia" },
  "+44": { code: "+44", flag: "🇬🇧", label: "United Kingdom" },
  "+49": { code: "+49", flag: "🇩🇪", label: "Germany" },
  "+33": { code: "+33", flag: "🇫🇷", label: "France" },
  "+61": { code: "+61", flag: "🇦🇺", label: "Australia" },
  "+91": { code: "+91", flag: "🇮🇳", label: "India" },
  "+52": { code: "+52", flag: "🇲🇽", label: "Mexico" },
  "+54": { code: "+54", flag: "🇦🇷", label: "Argentina" },
  "+41": { code: "+41", flag: "🇨🇭", label: "Switzerland" },
  "+43": { code: "+43", flag: "🇦🇹", label: "Austria" },
  "+385": { code: "+385", flag: "🇭🇷", label: "Croatia" },
  "+387": { code: "+387", flag: "🇧🇦", label: "Bosnia and Herzegovina" },
  "+421": { code: "+421", flag: "🇸🇰", label: "Slovakia" },
  "+386": { code: "+386", flag: "🇸🇮", label: "Slovenia" },
};

function parseCountryCodeConfig(rawValue?: string): CountryCodeOption[] {
  const value = (rawValue || "").trim();
  if (!value) return DEFAULT_COUNTRY_CODES;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === "string") {
            const normalized = item.trim();
            return COUNTRY_CODE_LOOKUP[normalized] || { code: normalized, flag: "🌍", label: normalized };
          }
          if (item && typeof item === "object" && typeof item.code === "string") {
            return {
              code: item.code,
              flag: item.flag || "🌍",
              label: item.label || item.code,
            };
          }
          return null;
        })
        .filter(Boolean) as CountryCodeOption[];
    }
  } catch {
    // fallback to CSV parsing below
  }

  const codes = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!codes.length) return DEFAULT_COUNTRY_CODES;

  return codes.map((code) => COUNTRY_CODE_LOOKUP[code] || { code, flag: "🌍", label: code });
}

// Must be the literal `process.env.EXPO_PUBLIC_*` form - Expo only inlines
// env vars written exactly like this at build time.
const COUNTRY_CODES = parseCountryCodeConfig(process.env.EXPO_PUBLIC_COUNTRY_CODES);
const DISCOUNT_OPTIONS = [0, 5, 15, 25, 30];

// Supplier discount typed by the admin: "7,5" / "7.5" -> 7.5; empty -> 0;
// anything unparsable or outside 0-100 -> null (rejected on save).
function parseDiscount(raw: string | number | undefined): number | null {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (text === "") return 0;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function parsePhone(rawPhone?: string) {
  const value = (rawPhone || "").trim();
  if (!value) {
    return { countryCode: "+381", phoneNumber: "" };
  }

  const match = value.match(/^\s*(\+\d{1,4})\s*(.*)$/);
  if (match) {
    const countryCode = COUNTRY_CODES.some((item) => item.code === match[1]) ? match[1] : "+381";
    const phoneNumber = match[2].replace(/\D/g, "");
    return { countryCode, phoneNumber };
  }

  return { countryCode: "+381", phoneNumber: value.replace(/\D/g, "") };
}

function formatPhone(countryCode: string, phoneNumber: string) {
  const normalized = (phoneNumber || "").replace(/\D/g, "");
  if (!normalized) return "";
  return `${countryCode || "+381"} ${normalized}`;
}

export default function AdminScreen() {
  const { t, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 12);
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [countryCodeOpen, setCountryCodeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permMsg, setPermMsg] = useState(false);
  // Picked image stays local until "Save"; nothing is uploaded before that.
  const [pendingImage, setPendingImage] = useState<{ uri: string; name: string; type: string } | null>(null);
  const additionalDiscountOptions = Array.from({ length: 16 }, (_, i) => i);

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

  const closeForm = () => {
    setFormOpen(false);
    setPendingImage(null);
  };

  const openAdd = () => {
    setPendingImage(null);
    setEditing(null);
    setForm(tab === "products"
      ? { name: "", image: "", manufacturer: "", price_no_vat: "", vat_rate: "20", discount: "0", discounts: [...DISCOUNT_OPTIONS], additional_discounts: [0], pieces_per_package: "", boxes_per_transport: "", barcode: "", active: true }
      : { name: "", address: "", email: "", phone: "", countryCode: "+381", phoneNumber: "", pib: "" });
    setCountryCodeOpen(false);
    setPermMsg(false);
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    const customerPhone = parsePhone(item.phone || "");
    setPendingImage(null);
    setEditing(item);
    setForm(
      tab === "products"
        ? {
            name: item.name,
            image: item.image || "",
            manufacturer: item.manufacturer || "",
            price_no_vat: String(item.price_no_vat ?? ""),
            vat_rate: String(item.vat_rate ?? "20"),
            // Keep whatever the product has - it used to be reset to 0 when it
            // wasn't one of the chips, silently wiping e.g. a 10% discount.
            discount: String(item.discount ?? 0),
            discounts: [...DISCOUNT_OPTIONS],
            additional_discounts: item.additional_discounts && item.additional_discounts.length
              ? item.additional_discounts.filter((v: number) => Number.isInteger(v) && v >= 0 && v <= 15)
              : [0],
            pieces_per_package: String(item.pieces_per_package ?? ""),
            boxes_per_transport: String(item.boxes_per_transport ?? ""),
            barcode: item.barcode ?? "",
            active: item.active !== false,
          }
        : {
            name: item.name,
            address: item.address || "",
            email: item.email || "",
            phone: item.phone || "",
            countryCode: customerPhone.countryCode,
            phoneNumber: customerPhone.phoneNumber,
            pib: item.pib || "",
          }
    );
    setCountryCodeOpen(false);
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
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    // Backend limit (IMAGE_MAX_BYTES) - checked here too so the user gets a
    // clear message instead of a failed upload. fileSize can be missing.
    if ((res.assets[0].fileSize ?? 0) > 4 * 1024 * 1024) {
      showToast?.(t("imageTooLarge"));
      return;
    }

    // Only keep the local file + preview; it is uploaded on "Save" (see save()).
    setPendingImage({
      uri: res.assets[0].uri,
      name: res.assets[0].fileName || `product-${Date.now()}.jpg`,
      type: res.assets[0].mimeType || "image/jpeg",
    });
  };

  const save = async () => {
    if (!form.name?.trim()) return;
    const discountValue = parseDiscount(form.discount);
    if (tab === "products" && discountValue === null) {
      showToast(t("discountInvalid"));
      return;
    }
    let uploadedUrl: string | null = null;
    try {
      setSaving(true);
      if (tab === "products") {
        let imageUrl = form.image;
        if (pendingImage) {
          try {
            uploadedUrl = await api.uploadProductImage(pendingImage as unknown as File);
          } catch (error) {
            console.error("Image upload failed", error);
            // 413/415 from the backend carry a readable reason (too large / wrong type).
            showToast?.(error instanceof ApiError ? error.detail : "Image upload failed");
            return;
          }
          imageUrl = uploadedUrl;
        }
        const payload = {
          name: form.name.trim(),
          image: imageUrl,
          manufacturer: form.manufacturer,
          price_no_vat: Number(form.price_no_vat) || 0,
          vat_rate: Number(form.vat_rate) || 0,
          discount: discountValue ?? 0,
          discounts: [...DISCOUNT_OPTIONS],
          additional_discounts: (form.additional_discounts && form.additional_discounts.length
            ? form.additional_discounts
                .map((v: number) => Math.trunc(Number(v)))
                .filter((v: number) => Number.isInteger(v) && v >= 0 && v <= 15)
            : [0]),
          pieces_per_package: Number(form.pieces_per_package) || 0,
          boxes_per_transport: Number(form.boxes_per_transport) || 0,
          barcode: String(form.barcode ?? "").trim(),
          active: form.active !== false,
        };
        if (editing) await api.updateProduct(editing.id, payload);
        else await api.createProduct(payload);
      } else {
        const payload = {
          name: form.name.trim(),
          address: form.address,
          email: form.email,
          phone: formatPhone(form.countryCode || "+381", form.phoneNumber || ""),
          pib: form.pib,
        };
        if (editing) await api.updateCustomer(editing.id, payload);
        else await api.createCustomer(payload);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      closeForm();
      await load();
    } catch (error) {
      // The product wasn't saved - don't leave the just-uploaded image orphaned.
      if (uploadedUrl) api.deleteUploadedImage(uploadedUrl).catch(() => {});
      throw error;
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

  const toggleAdditionalDiscount = (value: number) => {
    setForm((f: any) => {
      const current: number[] = f.additional_discounts || [0];
      const exists = current.includes(value);
      let next = exists ? current.filter((x) => x !== value) : [...current, value];
      next = Array.from(new Set(next)).filter((x) => x >= 0 && x <= 15).sort((a, b) => a - b);
      if (next.length === 0) next = [0];
      if (!next.includes(0)) next = [0, ...next].sort((a, b) => a - b);
      return { ...f, additional_discounts: next };
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
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: safeBottom + 90 }}
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
                <Text style={styles.itemName}>
                  {item.name}
                  {tab === "products" && (item as Product).active === false ? `  · ${t("inactive")}` : ""}
                </Text>
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

      <Pressable testID="fab-add" style={[styles.fab, { bottom: safeBottom + 16 }]} onPress={openAdd}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* Form modal */}
      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={closeForm}>
        <Pressable style={styles.backdrop} onPress={closeForm} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.sheet, { paddingBottom: safeBottom + spacing.lg }]}>
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
                    {pendingImage || form.image ? (
                      <Image source={{ uri: pendingImage?.uri || form.image }} style={styles.pickedImage} contentFit="cover" />
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
                    <Text style={styles.discHint}>{t("setDefault")}</Text>
                    <View style={styles.discChips}>
                      {DISCOUNT_OPTIONS.map((d) => {
                        const isDefault = form.discount !== "" && parseDiscount(form.discount) === d;
                        return (
                          <Pressable
                            key={String(d)}
                            testID={`disc-chip-${d}`}
                            style={[styles.discChip, isDefault && styles.discChipDefault]}
                            onPress={() => setForm((f: any) => ({ ...f, discount: String(d) }))}
                          >
                            {isDefault && <Ionicons name="star" size={12} color="#fff" style={{ marginRight: 4 }} />}
                            <Text style={[styles.discChipText, isDefault && styles.discChipTextDefault]}>{d}%</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {/* Chips are shortcuts; any 0-100 value can be typed (only admins edit products). */}
                    <View style={styles.discInputRow}>
                      <Text style={[styles.discHint, { marginTop: 0 }]}>{t("orEnterDiscount")}</Text>
                      <TextInput
                        testID="form-discount-input"
                        value={form.discount}
                        onChangeText={(v) => setForm((f: any) => ({ ...f, discount: v.replace(/[^0-9.,]/g, "") }))}
                        keyboardType="decimal-pad"
                        style={styles.discInput}
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                      />
                      <Text style={[styles.discHint, { marginTop: 0 }]}>%</Text>
                    </View>
                  </View>

                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={styles.fieldLabel}>{t("additionalDiscountOptions")}</Text>
                    <View style={styles.discChips}>
                      {additionalDiscountOptions.map((d) => {
                        const selected = (form.additional_discounts || [0]).includes(d);
                        return (
                          <Pressable
                            key={`add-${d}`}
                            testID={`additional-disc-chip-${d}`}
                            style={[styles.discChip, selected && styles.discChipDefault]}
                            onPress={() => toggleAdditionalDiscount(d)}
                          >
                            <Text style={[styles.discChipText, selected && styles.discChipTextDefault]}>{d}%</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <FormField label={t("piecesPerPackage")} value={form.pieces_per_package} onChangeText={(v) => setForm((f: any) => ({ ...f, pieces_per_package: v.replace(/[^0-9]/g, "") }))} keyboardType="numeric" testID="form-pieces" />
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <FormField label={t("barcode")} value={form.barcode ?? ""} onChangeText={(v) => setForm((f: any) => ({ ...f, barcode: v.replace(/[^A-Za-z0-9-]/g, "") }))} testID="form-barcode" />
                    </View>
                    <Pressable testID="form-barcode-scan" onPress={() => setScanOpen(true)} style={{ padding: spacing.md }} hitSlop={8}>
                      <Ionicons name="barcode-outline" size={28} color={colors.brand} />
                    </Pressable>
                  </View>
                  <BarcodeScanner
                    visible={scanOpen}
                    onClose={() => setScanOpen(false)}
                    onScanned={(code) => {
                      setForm((f: any) => ({ ...f, barcode: code }));
                      setScanOpen(false);
                    }}
                  />
                  <FormField label={t("transportPackage")} value={form.boxes_per_transport} onChangeText={(v) => setForm((f: any) => ({ ...f, boxes_per_transport: v.replace(/[^0-9]/g, "") }))} keyboardType="numeric" testID="form-boxes" />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
                    <View style={{ flex: 1, paddingRight: spacing.md }}>
                      <Text style={{ fontSize: font.base, fontWeight: "600", color: colors.onSurface }}>{t("productActive")}</Text>
                      <Text style={{ fontSize: font.sm, color: colors.muted }}>{t("productActiveHelp")}</Text>
                    </View>
                    <Switch
                      testID="form-active"
                      value={form.active !== false}
                      onValueChange={(v) => setForm((f: any) => ({ ...f, active: v }))}
                    />
                  </View>
                </>
              ) : (
                <>
                  <FormField label={t("pib")} value={form.pib} onChangeText={(v) => setForm((f: any) => ({ ...f, pib: v.replace(/[^0-9]/g, "") }))} keyboardType="numeric" testID="form-pib" />
                  <FormField label={t("address")} value={form.address} onChangeText={(v) => setForm((f: any) => ({ ...f, address: v }))} testID="form-address" />
                  <FormField label={t("email")} value={form.email} onChangeText={(v) => setForm((f: any) => ({ ...f, email: v }))} keyboardType="email-address" testID="form-email" />
                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={styles.fieldLabel}>{t("phone")}</Text>
                    <View style={styles.phoneRow}>
                      <Pressable
                        onPress={() => setCountryCodeOpen((open) => !open)}
                        style={styles.countryCodeButton}
                        testID="phone-country-code"
                      >
                        <Text style={styles.countryCodeText}>
                          {COUNTRY_CODES.find((item) => item.code === (form.countryCode || "+381"))?.flag ?? "🇷🇸"}
                          {` ${form.countryCode || "+381"}`}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={colors.muted} />
                      </Pressable>

                      <TextInput
                        testID="form-phone"
                        value={form.phoneNumber || ""}
                        onChangeText={(v) => setForm((f: any) => ({ ...f, phoneNumber: v.replace(/\D/g, "") }))}
                        keyboardType="phone-pad"
                        style={[styles.input, { flex: 1 }]}
                      />
                    </View>

                    {countryCodeOpen && (
                      <View style={styles.countryCodeDropdown}>
                        {COUNTRY_CODES.map((item) => (
                          <Pressable
                            key={item.code}
                            onPress={() => {
                              setForm((f: any) => ({ ...f, countryCode: item.code }));
                              setCountryCodeOpen(false);
                            }}
                            style={[
                              styles.countryCodeOption,
                              (form.countryCode || "+381") === item.code && styles.countryCodeOptionSelected,
                            ]}
                          >
                            <Text style={[
                              styles.countryCodeOptionText,
                              (form.countryCode || "+381") === item.code && styles.countryCodeOptionTextSelected,
                            ]}>{item.flag} {item.code} {item.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              )}

              <View style={{ height: spacing.md }} />
              <Button title={t("save")} icon="checkmark" onPress={save} loading={saving} disabled={!form.name?.trim()} testID="form-save-button" />
              <View style={{ height: spacing.sm }} />
              <Button title={t("cancel")} variant="ghost" onPress={closeForm} testID="form-cancel-button" />
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
  discInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  discInput: {
    minWidth: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: font.base,
    color: colors.onSurface,
    textAlign: "right",
  },
  discChipTextDefault: { color: "#fff" },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  countryCodeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 92,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  countryCodeText: {
    fontSize: font.lg,
    color: colors.onSurface,
    fontWeight: "700",
    marginRight: spacing.xs,
  },
  countryCodeDropdown: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  countryCodeOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countryCodeOptionSelected: {
    backgroundColor: colors.brandTertiary,
  },
  countryCodeOptionText: {
    fontSize: font.base,
    fontWeight: "600",
    color: colors.onSurface,
  },
  countryCodeOptionTextSelected: {
    color: colors.brand,
  },
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
