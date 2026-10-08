"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ClientFields } from "@/components/ClientFields";
import { Plan, STATUS_KEYS, STATUS_STYLES, SubState } from "@/lib/subscriptions";
import { ClientFormFields, clientPayload, deleteUploadedLogo, emptyClientFields, uploadLogo } from "@/lib/clientForm";

type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  pib?: string;
  active: boolean;
  subscription?: { plan_name?: string | null } | null;
  subscription_state?: SubState | null;
  user_count?: number | null;
};

const emptyAdmin = { admin_name: "", admin_email: "" };

// The first admin gets a generated temporary password by email; it only
// comes back in the response when that email could not be sent.
type InviteNotice = { email: string; sent: boolean; temporaryPassword?: string | null };

export default function ClientsPage() {
  const { t } = useLanguage();
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  // Optional: start the client on a package (then the modules come from it).
  const [planId, setPlanId] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ClientFormFields>(emptyClientFields);
  const [admin, setAdmin] = useState(emptyAdmin);
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null);
  const [inviteNotice, setInviteNotice] = useState<InviteNotice | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [res, plansRes] = await Promise.all([fetch("/api/clients"), fetch("/api/plans")]);
      if (!res.ok) throw new Error();
      setClients(await res.json());
      if (plansRes.ok) setPlans((await plansRes.json()) as Plan[]);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    let uploaded: string | null = null;
    try {
      if (pendingLogo) uploaded = await uploadLogo(pendingLogo);
      const payload = {
        ...clientPayload(form, uploaded ?? ""),
        ...admin,
        ...(planId ? { plan_id: planId, subscription_ends_at: endsAt } : {}),
      };
      const res = await fetch("/api/clients", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        if (uploaded) await deleteUploadedLogo(uploaded);
        const body = await res.json().catch(() => ({}));
        setError(body.detail || t("failedCreateClient"));
        return;
      }
      const created = await res.json();
      setInviteNotice({
        email: created.admin_user.email,
        sent: created.invite_sent,
        temporaryPassword: created.temporary_password,
      });
      setForm(emptyClientFields);
      setPlanId("");
      setEndsAt("");
      setAdmin(emptyAdmin);
      setPendingLogo(null);
      setLogoPreview("");
      setShowForm(false);
      await load();
    } catch (err) {
      if (uploaded) await deleteUploadedLogo(uploaded);
      setError(err instanceof Error ? err.message : t("failedCreateClient"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/clients/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    if (!res.ok) {
      setError(t("failedDeleteClient"));
      return;
    }
    await load();
  };

  const activate = async (c: Client) => {
    const res = await fetch(`/api/clients/${c.id}/activate`, { method: "POST" });
    if (!res.ok) {
      setError(t("failedActivateClient"));
      return;
    }
    await load();
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
          <h2 className="font-bold text-onSurface">{t("plan")}</h2>
          <select
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              if (e.target.value && !endsAt) setEndsAt(new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10));
            }}
            className="rounded-md border border-border px-3 py-2"
          >
            <option value="">{t("noPlan")}</option>
            {plans
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          {planId && (
            <label className="text-sm font-semibold text-onSurface">
              {t("validUntil")}
              <input
                required
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border px-3 py-2"
              />
            </label>
          )}
          <ClientFields
            hideModules={!!planId}
            form={form}
            setForm={setForm}
            logoPreview={logoPreview}
            onPickLogo={(file) => {
              setPendingLogo(file);
              setLogoPreview(URL.createObjectURL(file));
            }}
            onRemoveLogo={() => {
              setPendingLogo(null);
              setLogoPreview("");
            }}
          />

          <h2 className="mt-2 font-bold text-onSurface">{t("firstAdminUser")}</h2>
          <input
            required
            placeholder={t("adminName")}
            value={admin.admin_name}
            onChange={(e) => setAdmin({ ...admin, admin_name: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <input
            required
            type="email"
            placeholder={t("adminEmail")}
            value={admin.admin_email}
            onChange={(e) => setAdmin({ ...admin, admin_email: e.target.value })}
            className="rounded-md border border-border px-3 py-2"
          />
          <p className="text-sm text-muted">{t("inviteInfo")}</p>

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

      {inviteNotice && (
        <div
          className={`mb-6 flex items-start justify-between gap-4 rounded-lg border p-4 text-sm ${
            inviteNotice.sent ? "border-success bg-surfaceSecondary" : "border-error bg-surfaceSecondary"
          }`}
        >
          <div>
            {inviteNotice.sent ? (
              <p className="text-onSurface">
                {t("inviteSentTo")} <strong>{inviteNotice.email}</strong>
              </p>
            ) : (
              <>
                <p className="text-onSurface">{t("inviteNotSent")}</p>
                <p className="mt-2 font-mono text-base font-bold text-onSurface">{inviteNotice.temporaryPassword}</p>
              </>
            )}
          </div>
          <button onClick={() => setInviteNotice(null)} className="font-semibold text-onSurfaceSecondary hover:underline">
            {t("close")}
          </button>
        </div>
      )}

      {!showForm && error && <p className="mb-4 text-sm text-error">{error}</p>}

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
                <th className="px-4 py-3">{t("plan")}</th>
                <th className="px-4 py-3">{t("subscription")}</th>
                <th className="px-4 py-3">{t("users")}</th>
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
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.subscription?.plan_name ?? "-"}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const state = c.subscription_state ?? { status: "none" as const };
                      return (
                        <>
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[state.status]}`}>
                            {t(STATUS_KEYS[state.status])}
                          </span>
                          {state.ends_at && <p className="mt-1 text-xs text-muted">{state.ends_at}</p>}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{c.user_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={c.active ? "text-success" : "text-error"}>
                      {c.active ? t("active") : t("inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/clients/${c.id}`} className="font-semibold text-brand hover:underline">
                        {t("view")}
                      </Link>
                      {c.active ? (
                        <button onClick={() => setPendingDelete(c)} className="font-semibold text-error hover:underline">
                          {t("delete")}
                        </button>
                      ) : (
                        <button onClick={() => activate(c)} className="font-semibold text-success hover:underline">
                          {t("activate")}
                        </button>
                      )}
                    </div>
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
