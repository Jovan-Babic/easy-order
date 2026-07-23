"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-provider";

type Product = {
  id: string;
  client_id: string;
  name: string;
  manufacturer?: string;
  price_no_vat?: number;
  vat_rate?: number;
};

type Client = { id: string; name: string };

const emptyForm = { name: "", manufacturer: "", price_no_vat: "", vat_rate: "20", client_id: "" };

export default function ProductsPage() {
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";

  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        manufacturer: form.manufacturer,
        price_no_vat: Number(form.price_no_vat) || 0,
        vat_rate: Number(form.vat_rate) || 0,
      };
      if (isSuperAdmin) payload.client_id = form.client_id;
      const res = await fetch("/api/products", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Failed to create product");
        return;
      }
      setForm(emptyForm);
      setShowForm(false);
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
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
        >
          {showForm ? "Cancel" : "New product"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-8 grid max-w-lg gap-3 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <input
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder="Manufacturer"
            value={form.manufacturer}
            onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder="Price (excl. VAT)"
            value={form.price_no_vat}
            onChange={(e) => setForm({ ...form, price_no_vat: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder="VAT rate (%)"
            value={form.vat_rate}
            onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          {isSuperAdmin && (
            <select
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="rounded-md border border-border px-3 py-2"
            >
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-1 rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create product"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-muted">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Manufacturer</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">VAT</th>
                {isSuperAdmin && <th className="px-4 py-3">Client</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-onSurface">{p.name}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{p.manufacturer || "-"}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{(p.price_no_vat ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{p.vat_rate ?? 0}%</td>
                  {isSuperAdmin && <td className="px-4 py-3 text-onSurfaceSecondary">{clientName(p.client_id)}</td>}
                  <td className="px-4 py-3">
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
