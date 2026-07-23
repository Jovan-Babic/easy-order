"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-provider";

type User = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "operator";
  client_id: string | null;
  active: boolean;
};

type Client = { id: string; name: string };

export default function UsersPage() {
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";

  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "operator", client_id: "" });

  const load = async () => {
    setLoading(true);
    const [uRes, cRes] = await Promise.all([
      fetch("/api/users"),
      isSuperAdmin ? fetch("/api/clients") : Promise.resolve(null),
    ]);
    setUsers(await uRes.json());
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
      const payload = isSuperAdmin ? form : { name: form.name, email: form.email, password: form.password, role: "operator" };
      const res = await fetch("/api/users", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Failed to create user");
        return;
      }
      setForm({ name: "", email: "", password: "", role: "operator", client_id: "" });
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">Users</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
        >
          {showForm ? "Cancel" : "New user"}
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
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          {isSuperAdmin ? (
            <>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="rounded-md border border-border px-3 py-2"
              >
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
                <option value="superadmin">SuperAdmin</option>
              </select>
              {form.role !== "superadmin" && (
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
            </>
          ) : (
            <p className="text-sm text-muted">New users are created as Operators for your company.</p>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-1 rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create user"}
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
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-onSurface">{u.name}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{u.email}</td>
                  <td className="px-4 py-3 capitalize text-onSurfaceSecondary">{u.role}</td>
                  <td className="px-4 py-3">
                    <span className={u.active ? "text-success" : "text-error"}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== session.id && (
                      <button onClick={() => remove(u.id)} className="font-semibold text-error hover:underline">
                        Delete
                      </button>
                    )}
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
