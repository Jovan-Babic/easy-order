"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session-provider";
import { useLanguage } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Field, fieldInput } from "@/components/FormField";
import { ImportModal } from "@/components/ImportModal";
import { localizedDetail } from "@/lib/errors";

type Customer = {
  id: string;
  client_id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  pib?: string;
  registration_number?: string;
  street?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  visit_every_days?: number | null;
  visit_channel?: "visit" | "call";
  zone_id?: string | null;
  invoice_missing?: string[];
  active?: boolean;
};

type Client = { id: string; name: string };

const emptyForm = {
  name: "", address: "", email: "", phone: "", pib: "",
  registration_number: "", street: "", city: "", postal_code: "", country: "RS", client_id: "",
  visit_every_days: "", visit_channel: "visit", zone_id: "",
};

export default function CustomersPage() {
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  const { t } = useLanguage();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Visit plan fields (module `visits`): how often the shop is visited, how, and its zone.
  const hasVisits = session.modules.includes("visits") && !isSuperAdmin;
  const [zones, setZones] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!hasVisits) return;
    fetch("/api/zones").then((r) => (r.ok ? r.json() : [])).then(setZones).catch(() => setZones([]));
  }, [hasVisits]);

  const openEdit = (c: Customer) => {
    setError(null);
    setEditingId(c.id);
    setForm({
      name: c.name, address: c.address ?? "", email: c.email ?? "", phone: c.phone ?? "", pib: c.pib ?? "",
      registration_number: c.registration_number ?? "", street: c.street ?? "", city: c.city ?? "",
      postal_code: c.postal_code ?? "", country: c.country || "RS", client_id: c.client_id,
      visit_every_days: c.visit_every_days ? String(c.visit_every_days) : "", visit_channel: c.visit_channel ?? "visit", zone_id: c.zone_id ?? "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  };

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
        registration_number: form.registration_number,
        street: form.street,
        city: form.city,
        postal_code: form.postal_code,
        country: form.country || "RS",
      };
      if (hasVisits) {
        payload.visit_every_days = Number(form.visit_every_days) || 0; // 0 = not in rotation
        payload.visit_channel = form.visit_channel;
        payload.zone_id = form.zone_id; // "" = no zone
      }
      if (isSuperAdmin && !editingId) payload.client_id = form.client_id;
      const res = await fetch(editingId ? `/api/customers/${editingId}` : "/api/customers", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(localizedDetail(body.detail, t, t("failedCreateCustomer")));
        return;
      }
      closeForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/customers/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(localizedDetail(body.detail, t, t("deleteFailed")));
      return;
    }
    setError(null);
    await load();
  };

  // A customer with order history is deactivated, not deleted: sales reps no longer see it, old orders stay intact.
  const toggleActive = async (c: Customer) => {
    const res = await fetch(`/api/customers/${c.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: c.name, address: c.address ?? "", email: c.email ?? "", phone: c.phone ?? "", pib: c.pib ?? "", active: c.active === false }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(localizedDetail(body.detail, t, t("failedUpdateUser")));
      return;
    }
    setError(null);
    await load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("customers")}</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowImport(true)}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurface"
          >
            {t("importButton")}
          </button>
          <button
            onClick={() => (showForm ? closeForm() : setShowForm(true))}
            className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand"
          >
            {showForm ? t("cancel") : t("newCustomer")}
          </button>
        </div>
      </div>
      {showImport && (
        <ImportModal
          kind="customers"
          clients={clients}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}

      {showForm && (
        <form onSubmit={submit} className="mb-8 grid max-w-lg gap-3 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <Field label={t("name")}>
            <input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldInput} />
          </Field>
          <Field label={t("address")}>
            <input maxLength={300} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={fieldInput} />
          </Field>
          <Field label={t("email")}>
            <input type="email" maxLength={120} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={fieldInput} />
          </Field>
          <Field label={t("phone")}>
            <input maxLength={40} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={fieldInput} />
          </Field>
          <Field label={t("taxIdPib")}>
            <input inputMode="numeric" pattern="[0-9]{6,15}" title="6-15" maxLength={15} value={form.pib} onChange={(e) => setForm({ ...form, pib: e.target.value })} className={fieldInput} />
          </Field>
          <Field label={t("registrationNumber")}>
            <input inputMode="numeric" pattern="[0-9]{6,15}" title="6-15" maxLength={15} value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} className={fieldInput} />
          </Field>
          <p className="-mb-1 mt-1 text-xs text-muted">{t("customerInvoiceHint")}</p>
          <Field label={t("street")}>
            <input maxLength={100} value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} className={fieldInput} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("city")}>
              <input maxLength={100} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={fieldInput} />
            </Field>
            <Field label={t("postalCode")}>
              <input maxLength={20} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className={fieldInput} />
            </Field>
            <Field label={t("country")}>
              <input maxLength={2} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} className={fieldInput} />
            </Field>
          </div>
          {hasVisits && (
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("visitEvery")}>
                <select value={form.visit_every_days} onChange={(e) => setForm({ ...form, visit_every_days: e.target.value })} className={fieldInput}>
                  <option value="">{t("visitNotInRotation")}</option>
                  {[7, 14, 30].map((d) => (
                    <option key={d} value={String(d)}>{t("visitEveryDays").replace("{n}", String(d))}</option>
                  ))}
                  {form.visit_every_days && ![7, 14, 30].includes(Number(form.visit_every_days)) && (
                    <option value={form.visit_every_days}>{t("visitEveryDays").replace("{n}", form.visit_every_days)}</option>
                  )}
                </select>
              </Field>
              <Field label={t("visitChannel")}>
                <select value={form.visit_channel} onChange={(e) => setForm({ ...form, visit_channel: e.target.value as "visit" | "call" })} className={fieldInput}>
                  <option value="visit">{t("visitChannelVisit")}</option>
                  <option value="call">{t("visitChannelCall")}</option>
                </select>
              </Field>
              <Field label={t("visitZone")}>
                <select value={form.zone_id} onChange={(e) => setForm({ ...form, zone_id: e.target.value })} className={fieldInput}>
                  <option value="">{t("visitNoZone")}</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {isSuperAdmin && !editingId && (
            <Field label={t("client")}>
              <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className={fieldInput}>
                <option value="">{t("selectClient")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="mt-1 rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
          >
            {saving ? t("creating") : editingId ? t("saveChanges") : t("createCustomer")}
          </button>
        </form>
      )}

      {error && !showForm && <p className="mb-3 text-sm text-error">{error}</p>}
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
                <th className="px-4 py-3">{t("invoiceData")}</th>
                {isSuperAdmin && <th className="px-4 py-3">{t("client")}</th>}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-onSurface">
                    {c.name}
                    {c.active === false && <span className="ml-2 rounded bg-border px-2 py-0.5 text-xs font-normal text-muted">{t("inactive")}</span>}
                  </td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.address || "-"}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.email || "-"}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.phone || "-"}</td>
                  <td className="px-4 py-3 text-xs">
                    {!c.invoice_missing?.length ? (
                      <span className="text-success">{t("invoiceDataComplete")}</span>
                    ) : (
                      <span className="text-muted" title={c.invoice_missing.map((f) => t(`missing_${f}` as never)).join(", ")}>
                        {t("invoiceDataMissing")}: {c.invoice_missing.map((f) => t(`missing_${f}` as never)).join(", ")}
                      </span>
                    )}
                  </td>
                  {isSuperAdmin && <td className="px-4 py-3 text-onSurfaceSecondary">{clientName(c.client_id)}</td>}
                  <td className="space-x-4 px-4 py-3">
                    <button onClick={() => openEdit(c)} className="font-semibold text-brand hover:underline">
                      {t("edit")}
                    </button>
                    <button onClick={() => toggleActive(c)} className="font-semibold text-onSurfaceSecondary hover:underline">
                      {c.active === false ? t("activate") : t("deactivate")}
                    </button>
                    <button onClick={() => setPendingDelete(c)} className="font-semibold text-error hover:underline">
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
