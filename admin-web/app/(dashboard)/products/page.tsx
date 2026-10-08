"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-provider";
import { useLanguage } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ImportModal } from "@/components/ImportModal";

type Product = {
  id: string;
  client_id: string;
  name: string;
  image?: string;
  manufacturer?: string;
  price_no_vat?: number;
  vat_rate?: number;
  discount?: number;
  discounts?: number[];
  additional_discounts?: number[];
  pieces_per_package?: number;
  boxes_per_transport?: number;
  barcode?: string | null;
  package_barcode?: string | null;
  active?: boolean;
  track_expiry?: boolean;
};

type Client = { id: string; name: string };

type ProductFormState = {
  name: string;
  image: string;
  manufacturer: string;
  price_no_vat: string;
  vat_rate: string;
  discount: string;
  additional_discounts: number[];
  pieces_per_package: string;
  boxes_per_transport: string;
  barcode: string;
  package_barcode: string;
  active: boolean;
  track_expiry: boolean;
  client_id: string;
};

type FieldErrors = Partial<Record<keyof ProductFormState, string>>;

const emptyForm = (): ProductFormState => ({
  name: "",
  image: "",
  manufacturer: "",
  price_no_vat: "",
  vat_rate: "20",
  discount: "0",
  additional_discounts: [0],
  pieces_per_package: "",
  boxes_per_transport: "",
  barcode: "",
  package_barcode: "",
  active: true,
  track_expiry: false,
  client_id: "",
});

const discountOptions = [0, 5, 15, 25, 30];
// Keep in sync with IMAGE_MAX_BYTES in backend/server.py (Vercel caps request bodies at 4.5 MB).
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const additionalDiscountOptions = Array.from({ length: 16 }, (_, i) => i);
const vatRateOptions = [0, 10, 20];

const numeric = (value: string) => value.replace(/[^0-9.,]/g, "");
const normalizeDecimal = (value: string) => value.replace(",", ".");

const toNumber = (value: string) => {
  const n = Number(normalizeDecimal(value));
  return Number.isFinite(n) ? n : 0;
};

const toInteger = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

export default function ProductsPage() {
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  // Fields of modules the client doesn't have are hidden (the backend ignores them too).
  const hasWarehouse = session.modules.includes("warehouse");
  const hasExpiry = session.modules.includes("expiry");
  const { t } = useLanguage();

  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [showImport, setShowImport] = useState(false);
  // A newly picked image stays local until "Save"; nothing is uploaded before that.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || id;

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/products"),
        isSuperAdmin ? fetch("/api/clients") : Promise.resolve(null),
      ]);
      if (!pRes.ok) throw new Error();
      setProducts(await pRes.json());
      if (cRes?.ok) setClients(await cRes.json());
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearPendingImage = () => {
    setPendingFile(null);
    setPreviewUrl(null);
  };

  const closeForm = () => {
    clearPendingImage();
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setFieldErrors({});
  };

  const openCreateForm = () => {
    clearPendingImage();
    setEditingId(null);
    setError(null);
    setFieldErrors({});
    setForm({ ...emptyForm(), client_id: isSuperAdmin ? clients[0]?.id || "" : "" });
    setShowForm(true);
  };

  const openEditForm = (product: Product) => {
    clearPendingImage();
    setEditingId(product.id);
    setError(null);
    setForm({
      name: product.name || "",
      image: product.image || "",
      manufacturer: product.manufacturer || "",
      price_no_vat: String(product.price_no_vat ?? ""),
      vat_rate: String(product.vat_rate ?? "20"),
      discount: String(product.discount ?? 0),
      additional_discounts: product.additional_discounts && product.additional_discounts.length
        ? product.additional_discounts.filter((v) => Number.isInteger(v) && v >= 0 && v <= 15)
        : [0],
      pieces_per_package: String(product.pieces_per_package ?? ""),
      boxes_per_transport: String(product.boxes_per_transport ?? ""),
      barcode: product.barcode || "",
      package_barcode: product.package_barcode || "",
      active: product.active !== false,
      track_expiry: product.track_expiry === true,
      client_id: product.client_id || "",
    });
    setFieldErrors({});
    setShowForm(true);
  };

  const setField = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validateForm = () => {
    const nextErrors: FieldErrors = {};
    const price = toNumber(form.price_no_vat);
    const vat = toNumber(form.vat_rate);
    const discount = toNumber(form.discount);

    if (!form.name.trim()) nextErrors.name = t("nameRequired");
    if (!form.price_no_vat.trim()) nextErrors.price_no_vat = t("priceRequired");
    if (!Number.isFinite(price) || price < 0) nextErrors.price_no_vat = t("valueNonNegative");
    if (!vatRateOptions.includes(vat)) nextErrors.vat_rate = t("vatInvalid");
    // Any 0-100 value is valid (the backend accepts it). The chips are just
    // shortcuts - a product saved elsewhere with e.g. 10% must stay editable.
    // toNumber() turns garbage like "1.2.3" into 0, so check the raw input too.
    const discountParses = Number.isFinite(Number(normalizeDecimal(form.discount.trim() || "0")));
    if (!discountParses || discount < 0 || discount > 100) nextErrors.discount = t("discountInvalid");
    if (form.pieces_per_package && toInteger(form.pieces_per_package) < 0) {
      nextErrors.pieces_per_package = t("valueNonNegative");
    }
    if (form.boxes_per_transport && toInteger(form.boxes_per_transport) < 0) {
      nextErrors.boxes_per_transport = t("valueNonNegative");
    }
    if (form.package_barcode.trim() && !(toInteger(form.pieces_per_package) > 0)) {
      nextErrors.package_barcode = t("boxNeedsPieces");
    }
    if (form.package_barcode.trim() && form.package_barcode.trim() === form.barcode.trim()) {
      nextErrors.package_barcode = t("boxBarcodeDiffers");
    }
    if (isSuperAdmin && !form.client_id) nextErrors.client_id = t("clientRequired");

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const selectImageFile = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t("imageTooLarge"));
      return;
    }
    setError(null);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const deleteUploadedImage = (url: string) =>
    fetch(`/api/upload-image?url=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(() => {});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateForm()) return;
    setSaving(true);
    let uploadedUrl: string | null = null;
    try {
      let imageUrl = form.image;
      if (pendingFile) {
        const formData = new FormData();
        formData.append("file", pendingFile);
        const upRes = await fetch("/api/upload-image", { method: "POST", body: formData });
        if (!upRes.ok) {
          const body = await upRes.json().catch(() => ({}));
          setError(body.detail || t("imageUploadFailed"));
          return;
        }
        uploadedUrl = (await upRes.json()).url;
        imageUrl = uploadedUrl as string;
      }
      const parsedDiscount = toNumber(form.discount);
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        image: imageUrl,
        manufacturer: form.manufacturer,
        price_no_vat: toNumber(form.price_no_vat),
        vat_rate: toNumber(form.vat_rate),
        discount: parsedDiscount,
        discounts: [parsedDiscount],
        additional_discounts: (form.additional_discounts || [0])
          .map((v) => Math.trunc(Number(v)))
          .filter((v) => Number.isInteger(v) && v >= 0 && v <= 15),
        pieces_per_package: toInteger(form.pieces_per_package),
        boxes_per_transport: toInteger(form.boxes_per_transport),
        barcode: form.barcode.trim(),
        package_barcode: form.package_barcode.trim(),
        active: form.active,
        track_expiry: form.track_expiry,
      };
      if (isSuperAdmin) payload.client_id = form.client_id;
      const endpoint = editingId ? `/api/products/${editingId}` : "/api/products";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(endpoint, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        if (uploadedUrl) await deleteUploadedImage(uploadedUrl);
        const body = await res.json().catch(() => ({}));
        setError(body.detail || t("productSaveFailed"));
        return;
      }
      closeForm();
      await load();
    } catch (err) {
      if (uploadedUrl) await deleteUploadedImage(uploadedUrl);
      setError(err instanceof Error ? err.message : t("productSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/products/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail || t("deleteFailed"));
      return;
    }
    setError(null);
    await load();
  };

  const toggleAdditionalDiscount = (value: number) => {
    setForm((prev) => {
      const current = prev.additional_discounts || [0];
      const exists = current.includes(value);
      let next = exists ? current.filter((x) => x !== value) : [...current, value];
      next = Array.from(new Set(next)).filter((x) => x >= 0 && x <= 15).sort((a, b) => a - b);
      if (next.length === 0) next = [0];
      if (!next.includes(0)) next = [0, ...next].sort((a, b) => a - b);
      return { ...prev, additional_discounts: next };
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("products")}</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowImport(true)}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurface"
          >
            {t("importButton")}
          </button>
          <button
            onClick={openCreateForm}
            className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
          >
            {t("newProduct")}
          </button>
        </div>
      </div>
      {showImport && (
        <ImportModal
          clients={clients}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}

      {!showForm && error && <p className="mb-4 text-sm text-error">{error}</p>}

      {showForm && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-black/40 p-4 sm:p-6">
          <div className="mx-auto mt-6 max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surfaceSecondary p-6 shadow-xl sm:mt-12">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-onSurface">{editingId ? t("editProduct") : t("addProduct")}</h2>
              <button
                onClick={closeForm}
                className="rounded-md px-3 py-2 text-sm font-semibold text-onSurfaceSecondary hover:bg-surface"
              >
                {t("close")}
              </button>
            </div>

            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <div className="h-32 w-32 overflow-hidden rounded-lg border border-border bg-surface">
                  {previewUrl || form.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl || form.image} alt={t("productPreview")} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">{t("noImage")}</div>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-onSurface">{t("productImage")}</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => selectImageFile(e.target.files?.[0] || null)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                  />
                  <input
                    placeholder={t("orPasteImageUrl")}
                    value={form.image}
                    onChange={(e) => {
                      clearPendingImage();
                      setField("image", e.target.value);
                    }}
                    className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  label={t("name")}
                  value={form.name}
                  required
                  error={fieldErrors.name}
                  onChange={(value) => setField("name", value)}
                />
                <FormField
                  label={t("manufacturer")}
                  value={form.manufacturer}
                  onChange={(value) => setField("manufacturer", value)}
                />
                <FormField
                  label={t("priceExclVat")}
                  value={form.price_no_vat}
                  inputMode="decimal"
                  error={fieldErrors.price_no_vat}
                  onChange={(value) => setField("price_no_vat", numeric(value))}
                />
                <div>
                  <label className="mb-1 block text-sm font-semibold text-onSurface">{t("vatRate")}</label>
                  <div className="flex flex-wrap gap-2">
                    {vatRateOptions.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setField("vat_rate", String(rate))}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          toNumber(form.vat_rate) === rate
                            ? "border-brand bg-brand text-onBrand"
                            : "border-border text-onSurfaceSecondary hover:bg-surface"
                        }`}
                      >
                        {rate}%
                      </button>
                    ))}
                  </div>
                  {fieldErrors.vat_rate && <p className="mt-1 text-xs text-error">{fieldErrors.vat_rate}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-semibold text-onSurface">{t("defaultDiscount")}</label>
                  <div className="flex flex-wrap gap-2">
                    {discountOptions.map((discount) => {
                      const selected = form.discount.trim() !== "" && toNumber(form.discount) === discount;
                      return (
                        <button
                          key={discount}
                          type="button"
                          onClick={() => setField("discount", String(discount))}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            selected
                              ? "border-brand bg-brand text-onBrand"
                              : "border-border text-onSurfaceSecondary hover:bg-surface"
                          }`}
                        >
                          {discount}%
                        </button>
                      );
                    })}
                    {/* Chips are shortcuts; any 0-100 value can be typed (only admins edit products). */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted">{t("orEnterDiscount")}</span>
                      <input
                        inputMode="decimal"
                        value={form.discount}
                        onChange={(e) => setField("discount", numeric(e.target.value))}
                        aria-label={t("defaultDiscount")}
                        className={`w-20 rounded-md border px-2 py-1 text-right text-xs ${
                          fieldErrors.discount ? "border-error" : "border-border"
                        }`}
                      />
                      <span className="text-xs text-muted">%</span>
                    </div>
                  </div>
                  {fieldErrors.discount && <p className="mt-1 text-xs text-error">{fieldErrors.discount}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-semibold text-onSurface">{t("additionalDiscountOptions")}</label>
                  <div className="flex flex-wrap gap-2">
                    {additionalDiscountOptions.map((discount) => {
                      const selected = (form.additional_discounts || [0]).includes(discount);
                      return (
                        <button
                          key={discount}
                          type="button"
                          onClick={() => toggleAdditionalDiscount(discount)}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            selected
                              ? "border-brand bg-brand text-onBrand"
                              : "border-border text-onSurfaceSecondary hover:bg-surface"
                          }`}
                        >
                          {discount}%
                        </button>
                      );
                    })}
                  </div>
                </div>
                <FormField
                  label={t("piecesPerPackage")}
                  value={form.pieces_per_package}
                  inputMode="numeric"
                  error={fieldErrors.pieces_per_package}
                  onChange={(value) => setField("pieces_per_package", numeric(value))}
                />
                {hasWarehouse && (
                  <FormField
                    label={t("barcode")}
                    value={form.barcode}
                    error={fieldErrors.barcode}
                    onChange={(value) => setField("barcode", value.replace(/[^A-Za-z0-9-]/g, ""))}
                  />
                )}
                {hasWarehouse && (
                  <>
                    <FormField
                      label={t("packageBarcode")}
                      value={form.package_barcode}
                      error={fieldErrors.package_barcode}
                      onChange={(value) => setField("package_barcode", value.replace(/[^A-Za-z0-9-]/g, ""))}
                    />
                    <p className="-mt-2 text-xs text-muted sm:col-span-2">{t("packageBarcodeHint")}</p>
                  </>
                )}
                <FormField
                  label={t("boxesPerTransport")}
                  value={form.boxes_per_transport}
                  inputMode="numeric"
                  error={fieldErrors.boxes_per_transport}
                  onChange={(value) => setField("boxes_per_transport", numeric(value))}
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-onSurface">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setField("active", e.target.checked)}
                />
                {t("productActive")}
              </label>
              <p className="-mt-2 text-xs text-muted">{t("productActiveHelp")}</p>

              {hasExpiry && (
                <>
                  <label className="flex items-center gap-2 text-sm font-semibold text-onSurface">
                    <input
                      type="checkbox"
                      checked={form.track_expiry}
                      onChange={(e) => setField("track_expiry", e.target.checked)}
                    />
                    {t("productTrackExpiry")}
                  </label>
                  <p className="-mt-2 text-xs text-muted">{t("productTrackExpiryHelp")}</p>
                </>
              )}

              {isSuperAdmin && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-onSurface">{t("client")}</label>
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) => setField("client_id", e.target.value)}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.client_id ? "border-error" : "border-border"}`}
                  >
                    <option value="">{t("selectClient")}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.client_id && <p className="mt-1 text-xs text-error">{fieldErrors.client_id}</p>}
                </div>
              )}

              {error && <p className="text-sm text-error">{error}</p>}

              <div className="mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurfaceSecondary"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
                >
                  {saving ? t("saving") : editingId ? t("saveChanges") : t("createProduct")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t("image")}</th>
                <th className="px-4 py-3">{t("name")}</th>
                <th className="px-4 py-3">{t("manufacturer")}</th>
                {hasWarehouse && <th className="px-4 py-3">{t("barcode")}</th>}
                {hasWarehouse && <th className="px-4 py-3">{t("packageBarcode")}</th>}
                <th className="px-4 py-3">{t("productPrice")}</th>
                <th className="px-4 py-3">{t("defaultDiscount")}</th>
                <th className="px-4 py-3">{t("additionalDiscountOptions")}</th>
                <th className="px-4 py-3">{t("vat")}</th>
                <th className="px-4 py-3">{t("packaging")}</th>
                {isSuperAdmin && <th className="px-4 py-3">{t("client")}</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="h-10 w-10 overflow-hidden rounded-md bg-surface">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-onSurface">
                    {p.name}
                    {p.active === false && (
                      <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
                        {t("productInactive")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{p.manufacturer || "-"}</td>
                  {hasWarehouse && <td className="px-4 py-3 text-onSurfaceSecondary">{p.barcode || "-"}</td>}
                  {hasWarehouse && <td className="px-4 py-3 text-onSurfaceSecondary">{p.package_barcode || "-"}</td>}
                  <td className="px-4 py-3 text-onSurfaceSecondary">{(p.price_no_vat ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{p.discount ?? 0}%</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{(p.additional_discounts && p.additional_discounts.length ? p.additional_discounts : [0]).map((d) => `${d}%`).join(", ")}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{p.vat_rate ?? 0}%</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">
                    {(p.pieces_per_package ?? 0)}/{(p.boxes_per_transport ?? 0)}
                  </td>
                  {isSuperAdmin && <td className="px-4 py-3 text-onSurfaceSecondary">{clientName(p.client_id)}</td>}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEditForm(p)}
                      className="mr-3 font-semibold text-brand hover:underline"
                    >
                      {t("edit")}
                    </button>
                    <button onClick={() => setPendingDelete(p)} className="font-semibold text-error hover:underline">
                      {t("delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog itemName={pendingDelete.name} onCancel={() => setPendingDelete(null)} onConfirm={remove} />
      )}
    </div>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  required?: boolean;
  error?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  onChange: (value: string) => void;
};

function FormField({ label, value, required, error, inputMode, onChange }: FormFieldProps) {
  return (
    <label>
      <span className="mb-1 block text-sm font-semibold text-onSurface">{label}</span>
      <input
        required={required}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border px-3 py-2 text-sm ${error ? "border-error" : "border-border"}`}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </label>
  );
}
