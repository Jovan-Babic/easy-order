"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-provider";

type Role = "superadmin" | "admin" | "operator";

type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  client_id: string | null;
  active: boolean;
};

type Client = { id: string; name: string };

type CreateUserForm = {
  name: string;
  email: string;
  phoneNumber: string;
  countryCode: string;
  password: string;
  role: Role;
  client_id: string;
};

type EditUserForm = {
  name: string;
  phoneNumber: string;
  countryCode: string;
  password: string;
  role: Role;
  active: "true" | "false";
};

type CountryCodeOption = {
  code: string;
  flag: string;
  label: string;
};

const DEFAULT_COUNTRY_OPTIONS: CountryCodeOption[] = [
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
  if (!value) return DEFAULT_COUNTRY_OPTIONS;

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

  if (!codes.length) return DEFAULT_COUNTRY_OPTIONS;

  return codes.map((code) => COUNTRY_CODE_LOOKUP[code] || { code, flag: "🌍", label: code });
}

const countryOptions = parseCountryCodeConfig((process as any)?.env?.NEXT_PUBLIC_COUNTRY_CODES);
const countryCodes = countryOptions.map((item) => item.code);

const formatPhone = (countryCode: string, phoneNumber: string) => {
  const cleanNumber = phoneNumber.trim();
  return cleanNumber ? `${countryCode} ${cleanNumber}` : "";
};

const emptyCreateForm: CreateUserForm = {
  name: "",
  email: "",
  phoneNumber: "",
  countryCode: "+381",
  password: "",
  role: "operator",
  client_id: "",
};

const emptyEditForm: EditUserForm = {
  name: "",
  phoneNumber: "",
  countryCode: "+381",
  password: "",
  role: "operator",
  active: "true",
};

export default function UsersPage() {
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";

  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateUserForm>(emptyCreateForm);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditUserForm>(emptyEditForm);

  const parsePhone = (rawPhone: string | undefined) => {
    if (!rawPhone) return { countryCode: "+381", phoneNumber: "" };
    const matched = countryOptions.find((item) => rawPhone.startsWith(item.code));
    if (matched) {
      return {
        countryCode: matched.code,
        phoneNumber: rawPhone.replace(matched.code, "").trim().replace(/^\s+/, ""),
      };
    }
    return { countryCode: "+381", phoneNumber: rawPhone.replace(/^\+\d+\s?/, "").trim() };
  };

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

  const closeCreateForm = () => {
    setShowForm(false);
    setError(null);
    setForm(emptyCreateForm);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const phone = formatPhone(form.countryCode, form.phoneNumber);
    if (!form.phoneNumber.trim()) {
      setError("Phone is required");
      return;
    }
    setSaving(true);
    try {
      const payload = isSuperAdmin
        ? { ...form, phone }
        : { name: form.name, email: form.email, phone, password: form.password, role: "operator" };
      const res = await fetch("/api/users", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Failed to create user");
        return;
      }
      closeCreateForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (user: User) => {
    const parsedPhone = parsePhone(user.phone);
    setEditingUser(user);
    setEditError(null);
    setEditForm({
      name: user.name,
      phoneNumber: parsedPhone.phoneNumber,
      countryCode: parsedPhone.countryCode,
      password: "",
      role: user.role,
      active: user.active ? "true" : "false",
    });
    setShowEditForm(true);
  };

  const closeEdit = () => {
    setShowEditForm(false);
    setEditingUser(null);
    setEditError(null);
    setEditForm(emptyEditForm);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setEditError(null);
    if (!editForm.phoneNumber.trim()) {
      setEditError("Phone is required");
      return;
    }

    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name,
        phone: formatPhone(editForm.countryCode, editForm.phoneNumber),
        active: editForm.active === "true",
      };
      if (isSuperAdmin) payload.role = editForm.role;
      if (editForm.password.trim()) payload.password = editForm.password;

      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setEditError(body.detail || "Failed to update user");
        return;
      }

      closeEdit();
      await load();
    } finally {
      setEditSaving(false);
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
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <select
              value={form.countryCode}
              onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
              className="rounded-md border border-border px-3 py-2"
            >
              {countryOptions.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.code}
                </option>
              ))}
            </select>
            <input
              required
              type="tel"
              placeholder="601234567"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value.replace(/[^0-9+\s-]/g, "") })}
              className="rounded-md border border-border px-3 py-2"
            />
          </div>
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
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
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

      {showEditForm && editingUser && (
        <div className="fixed inset-0 z-30 bg-black/40 p-4 sm:p-6">
          <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl bg-surfaceSecondary p-6 shadow-xl sm:mt-12">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-onSurface">Edit user</h2>
              <button
                onClick={closeEdit}
                className="rounded-md px-3 py-2 text-sm font-semibold text-onSurfaceSecondary hover:bg-surface"
              >
                Close
              </button>
            </div>

            <form onSubmit={submitEdit} className="grid gap-3">
              <input
                required
                placeholder="Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="rounded-md border border-border px-3 py-2"
              />
              <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                <select
                  value={editForm.countryCode}
                  onChange={(e) => setEditForm({ ...editForm, countryCode: e.target.value })}
                  className="rounded-md border border-border px-3 py-2"
                >
                  {countryOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.flag} {item.code}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="tel"
                  placeholder="601234567"
                  value={editForm.phoneNumber}
                  onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value.replace(/[^0-9+\s-]/g, "") })}
                  className="rounded-md border border-border px-3 py-2"
                />
              </div>
              <input
                type="password"
                placeholder="New password (optional)"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                className="rounded-md border border-border px-3 py-2"
              />
              {isSuperAdmin && (
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">SuperAdmin</option>
                </select>
              )}
              <select
                value={editForm.active}
                onChange={(e) => setEditForm({ ...editForm, active: e.target.value as "true" | "false" })}
                className="rounded-md border border-border px-3 py-2"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>

              {editError && <p className="text-sm text-error">{editError}</p>}

              <div className="mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurfaceSecondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
                >
                  {editSaving ? "Saving..." : "Save changes"}
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
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
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
                  <td className="px-4 py-3 text-onSurfaceSecondary">{u.phone || "-"}</td>
                  <td className="px-4 py-3 capitalize text-onSurfaceSecondary">{u.role}</td>
                  <td className="px-4 py-3">
                    <span className={u.active ? "text-success" : "text-error"}>
                      {u.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(u)} className="mr-3 font-semibold text-brand hover:underline">
                      Edit
                    </button>
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
