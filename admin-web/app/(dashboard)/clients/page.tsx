"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";

type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  pib?: string;
  active: boolean;
};

const emptyForm = { name: "", email: "", phone: "", pib: "", admin_name: "", admin_email: "", admin_password: "" };

export default function ClientsPage() {
  const { t } = useLanguage();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/clients");
    setClients(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/clients", { method: "POST", body: JSON.stringify(form) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || t("failedCreateClient"));
        return;
      }
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("clients")}</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
        >
          {showForm ? t("cancel") : t("newClient")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-8 grid max-w-xl gap-3 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <h2 className="font-bold text-onSurface">{t("company")}</h2>
          <input
            required
            placeholder={t("companyName")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder={t("companyEmail")}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder={t("companyPhone")}
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

          <h2 className="mt-2 font-bold text-onSurface">{t("firstAdminUser")}</h2>
          <input
            required
            placeholder={t("adminName")}
            value={form.admin_name}
            onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            required
            type="email"
            placeholder={t("adminEmail")}
            value={form.admin_email}
            onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            required
            type="password"
            placeholder={t("adminPassword")}
            value={form.admin_password}
            onChange={(e) => setForm({ ...form, admin_password: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
          >
            {saving ? t("creating") : t("createClient")}
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
                <th className="px-4 py-3">{t("email")}</th>
                <th className="px-4 py-3">{t("taxIdPib")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-onSurface">{c.name}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.email || "-"}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.pib || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={c.active ? "text-success" : "text-error"}>
                      {c.active ? t("active") : t("inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="font-semibold text-brand hover:underline">
                      {t("view")}
                    </Link>
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
