"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
        setError(body.detail || "Failed to create client");
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
        <h1 className="text-2xl font-extrabold text-onSurface">Clients</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
        >
          {showForm ? "Cancel" : "New client"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-8 grid max-w-xl gap-3 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <h2 className="font-bold text-onSurface">Company</h2>
          <input
            required
            placeholder="Company name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder="Company email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder="Company phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            placeholder="Tax ID (PIB)"
            value={form.pib}
            onChange={(e) => setForm({ ...form, pib: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />

          <h2 className="mt-2 font-bold text-onSurface">First Admin user</h2>
          <input
            required
            placeholder="Admin name"
            value={form.admin_name}
            onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            required
            type="email"
            placeholder="Admin email"
            value={form.admin_email}
            onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            required
            type="password"
            placeholder="Admin password"
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
            {saving ? "Creating..." : "Create client"}
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
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Tax ID</th>
                <th className="px-4 py-3">Status</th>
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
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="font-semibold text-brand hover:underline">
                      View
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
