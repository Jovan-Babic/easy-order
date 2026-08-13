"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-provider";

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
  pieces_per_package: "",
  boxes_per_transport: "",
  client_id: "",
});

const discountOptions = [0, 5, 15, 25, 30];
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">Products</h1>
        <button
          onClick={openCreateForm}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
        >
          New product
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-30 bg-black/40 p-4 sm:p-6">
          <div className="mx-auto mt-6 w-full max-w-2xl rounded-2xl bg-surfaceSecondary p-6 shadow-xl sm:mt-12">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-onSurface">{editingId ? "Edit product" : "Add product"}</h2>
              <button
                onClick={closeForm}
                className="rounded-md px-3 py-2 text-sm font-semibold text-onSurfaceSecondary hover:bg-surface"
              >
                Close
              </button>
            </div>

            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <div className="h-32 w-32 overflow-hidden rounded-lg border border-border bg-surface">
                  {form.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.image} alt="Product preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">No image</div>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-onSurface">Product image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => updateImageFromFile(e.target.files?.[0] || null)}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Or paste image URL"
                    value={form.image}
                    onChange={(e) => setField("image", e.target.value)}
                    className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  label="Name"
                  value={form.name}
                  required
                  error={fieldErrors.name}
                  onChange={(value) => setField("name", value)}
                />
                <FormField
                  label="Manufacturer"
                  value={form.manufacturer}
                  onChange={(value) => setField("manufacturer", value)}
                />
                <FormField
                  label="Price (excl. VAT)"
                  value={form.price_no_vat}
                  inputMode="decimal"
                  error={fieldErrors.price_no_vat}
                  onChange={(value) => setField("price_no_vat", numeric(value))}
                />
                <div>
                  <label className="mb-1 block text-sm font-semibold text-onSurface">VAT rate (%)</label>
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
                  <label className="mb-1 block text-sm font-semibold text-onSurface">Default discount (%)</label>
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
                <FormField
                  label="Pieces per package"
                  value={form.pieces_per_package}
                  inputMode="numeric"
                  error={fieldErrors.pieces_per_package}
                  onChange={(value) => setField("pieces_per_package", numeric(value))}
                />
                <FormField
                  label="Boxes per transport"
                  value={form.boxes_per_transport}
                  inputMode="numeric"
                  error={fieldErrors.boxes_per_transport}
                  onChange={(value) => setField("boxes_per_transport", numeric(value))}
                />
              </div>

              {isSuperAdmin && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-onSurface">Client</label>
                  <select
                    required
                    value={form.client_id}
                    onChange={(e) => setField("client_id", e.target.value)}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.client_id ? "border-error" : "border-border"}`}
                  >
                    <option value="">Select client...</option>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Save changes" : "Create product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">VAT</th>
                <th className="px-4 py-3">Packaging</th>
                {isSuperAdmin && <th className="px-4 py-3">Client</th>}
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
                      Edit
                    </button>
                    <button onClick={() => remove(p.id)} className="font-semibold text-error hover:underline">
                      Delete
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
