"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-provider";
import { useLanguage } from "@/lib/i18n";

type Customer = {
  id: string;
  client_id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  pib?: string;
};

type Client = { id: string; name: string };

const emptyForm = { name: "", address: "", email: "", phone: "", pib: "", client_id: "" };

export default function CustomersPage() {
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  const { t } = useLanguage();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || id;

  const load = async () => {
    setLoading(true);
    const [custRes, cliRes] = await Promise.all([
      fetch("/api/customers"),
      isSuperAdmin ? fetch("/api/clients") : Promise.resolve(null),
    ]);
    setCustomers(await custRes.json());
    if (cliRes) setClients(await cliRes.json());
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
        address: form.address,
        email: form.email,
        phone: form.phone,
        pib: form.pib,
      };
      if (isSuperAdmin) payload.client_id = form.client_id;
      const res = await fetch("/api/customers", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || t("failedCreateCustomer"));
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
    if (!confirm("Delete this customer?")) return;
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("customers")}</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
        >
          {showForm ? t("cancel") : t("newCustomer")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-8 grid max-w-lg gap-3 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <input
            required
            placeholder={t("name")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder={t("address")}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder={t("email")}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder={t("phone")}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder={t("taxIdPib")}
            value={form.pib}
            onChange={(e) => setForm({ ...form, pib: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          {isSuperAdmin && (
            <select
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="rounded-md border border-border px-3 py-2"
            >
              <option value="">{t("selectClient")}</option>
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
            {saving ? t("creating") : t("createCustomer")}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-muted">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t("name")}</th>
                <th className="px-4 py-3">{t("address")}</th>
                <th className="px-4 py-3">{t("email")}</th>
                <th className="px-4 py-3">{t("phone")}</th>
                {isSuperAdmin && <th className="px-4 py-3">{t("client")}</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-onSurface">{c.name}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.address || "-"}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.email || "-"}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.phone || "-"}</td>
                  {isSuperAdmin && <td className="px-4 py-3 text-onSurfaceSecondary">{clientName(c.client_id)}</td>}
                  <td className="px-4 py-3">
                    <button onClick={() => remove(c.id)} className="font-semibold text-error hover:underline">
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
