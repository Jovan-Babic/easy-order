"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-provider";
import { useLanguage } from "@/lib/i18n";

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
  client_id: "",
});

const discountOptions = [0, 5, 15, 25, 30];
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

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || id;

  const load = async () => {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      fetch("/api/products"),
      isSuperAdmin ? fetch("/api/clients") : Promise.resolve(null),
    ]);
    setProducts(await pRes.json());
    if (cRes) setClients(await cRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setFieldErrors({});
  };

  const openCreateForm = () => {
    setEditingId(null);
    setError(null);
    setFieldErrors({});
    setForm({ ...emptyForm(), client_id: isSuperAdmin ? clients[0]?.id || "" : "" });
    setShowForm(true);
  };

  const openEditForm = (product: Product) => {
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

    if (!form.name.trim()) nextErrors.name = "Name is required";
    if (!form.price_no_vat.trim()) nextErrors.price_no_vat = "Price is required";
    if (!Number.isFinite(price) || price < 0) nextErrors.price_no_vat = "Price must be 0 or greater";
    if (!vatRateOptions.includes(vat)) {
      nextErrors.vat_rate = "Use one of the suggested VAT options";
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      nextErrors.discount = "Discount must be between 0 and 100";
    }
    if (!discountOptions.includes(discount)) {
      nextErrors.discount = "Use one of the suggested discount options";
    }
    if (form.pieces_per_package && toInteger(form.pieces_per_package) < 0) {
      nextErrors.pieces_per_package = "Value must be 0 or greater";
    }
    if (form.boxes_per_transport && toInteger(form.boxes_per_transport) < 0) {
      nextErrors.boxes_per_transport = "Value must be 0 or greater";
    }
    if (isSuperAdmin && !form.client_id) nextErrors.client_id = "Client is required";

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const updateImageFromFile = async (file: File | null) => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Image upload failed");
        return;
      }
      const json = await res.json();
      setForm((prev) => ({ ...prev, image: json.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateForm()) return;
    setSaving(true);
    try {
      const parsedDiscount = toNumber(form.discount);
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        image: form.image,
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
      };
      if (isSuperAdmin) payload.client_id = form.client_id;
      const endpoint = editingId ? `/api/products/${editingId}` : "/api/products";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(endpoint, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Failed to save product");
        return;
      }
      closeForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
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
        <button
          onClick={openCreateForm}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
        >
          {t("newProduct")}
        </button>
      </div>

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
                  {form.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.image} alt={t("productPreview")} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">{t("noImage")}</div>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-onSurface">{t("productImage")}</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => updateImageFromFile(e.target.files?.[0] || null)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                  />
                  <input
                    placeholder={t("orPasteImageUrl")}
                    value={form.image}
                    onChange={(e) => setField("image", e.target.value)}
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
                      const selected = toNumber(form.discount) === discount;
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
                <FormField
                  label={t("boxesPerTransport")}
                  value={form.boxes_per_transport}
                  inputMode="numeric"
                  error={fieldErrors.boxes_per_transport}
                  onChange={(value) => setField("boxes_per_transport", numeric(value))}
                />
              </div>

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
                  <td className="px-4 py-3 font-semibold text-onSurface">{p.name}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{p.manufacturer || "-"}</td>
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
                    <button onClick={() => remove(p.id)} className="font-semibold text-error hover:underline">
                      {t("delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
