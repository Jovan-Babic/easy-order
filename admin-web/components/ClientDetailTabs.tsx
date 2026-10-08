"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientEditForm } from "@/components/ClientEditForm";
import { PaymentsPanel } from "@/components/PaymentsPanel";
import { StatCard } from "@/components/StatCard";
import {
  AssignDialog,
  CancelDialog,
  ExtendDialog,
  HistoryDialog,
  PayDialog,
  link,
  primary,
} from "@/components/SubscriptionDialogs";
import { useLanguage } from "@/lib/i18n";
import { MODULES } from "@/lib/modules";
import { ClientInfo } from "@/lib/orders";
import { Plan, STATUS_KEYS, STATUS_STYLES, SubscriptionRow, detailOf } from "@/lib/subscriptions";

type Stats = { order_count: number; customer_count: number; product_count: number; total_grand: number } | null;
type Tab = "overview" | "users" | "subscription" | "payments";
type ClientUser = { id: string; name: string; email: string; phone?: string; role: string; active: boolean };

// Superadmin's page for one client: company data, its users, its subscription.
export function ClientDetailTabs({ client, stats }: { client: ClientInfo; stats: Stats }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: Array<[Tab, string]> = [
    ["overview", t("clientOverview")],
    ["users", t("users")],
    ["subscription", t("subscription")],
    ["payments", t("payments")],
  ];
  return (
    <div>
      <div className="mb-6 flex gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
              tab === key ? "border-brand bg-brandSecondary text-brand" : "border-border text-onSurfaceSecondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <>
          {stats && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Orders" value={stats.order_count} />
              <StatCard label="Customers" value={stats.customer_count} />
              <StatCard label="Products" value={stats.product_count} />
              <StatCard label="Revenue (incl. VAT)" value={stats.total_grand.toFixed(2)} />
            </div>
          )}
          <ClientEditForm client={client} />
        </>
      )}
      {tab === "users" && <ClientUsers clientId={client.id} />}
      {tab === "subscription" && <ClientSubscription clientId={client.id} />}
      {tab === "payments" && <PaymentsPanel clientId={client.id} />}
    </div>
  );
}

function ClientUsers({ clientId }: { clientId: string }) {
  const { t } = useLanguage();
  const [users, setUsers] = useState<ClientUser[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(`/api/users?client_id=${encodeURIComponent(clientId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setUsers)
      .catch(() => setError(true));
  }, [clientId]);
  const roleLabel: Record<string, string> = {
    admin: t("userRoleAdmin"),
    operator: t("userRoleOperator"),
    warehouse: t("userRoleWarehouse"),
    superadmin: t("userRoleSuperAdmin"),
  };
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Link href={`/users?client=${clientId}`} className={link}>
          {t("manageUsers")}
        </Link>
      </div>
      {error ? (
        <p className="text-error">{t("loadFailed")}</p>
      ) : users === null ? (
        <p className="text-muted">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t("name")}</th>
                <th className="px-4 py-3">{t("email")}</th>
                <th className="px-4 py-3">{t("phone")}</th>
                <th className="px-4 py-3">{t("role")}</th>
                <th className="px-4 py-3">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold text-onSurface">{u.name}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{u.email}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{u.phone || "-"}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{roleLabel[u.role] ?? u.role}</td>
                  <td className="px-4 py-3">
                    <span className={u.active ? "text-success" : "text-error"}>{u.active ? t("active") : t("inactive")}</span>
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

type Dialog = "assign" | "extend" | "cancel" | "history" | "pay" | null;

function ClientSubscription({ clientId }: { clientId: string }) {
  const { t } = useLanguage();
  const [row, setRow] = useState<SubscriptionRow | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([fetch(`/api/subscriptions/${clientId}`), fetch("/api/plans")]);
    if (!s.ok || !p.ok) {
      setError(await detailOf(s.ok ? p : s, t("loadFailed")));
      return;
    }
    setRow((await s.json()).row);
    setPlans(await p.json());
  }, [clientId, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-error">{error}</p>;
  if (!row) return <p className="text-muted">{t("loading")}</p>;
  const has = row.state.status !== "none";
  const done = async () => {
    setDialog(null);
    await load();
  };
  return (
    <div className="max-w-xl rounded-lg bg-surfaceSecondary p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[row.state.status]}`}>
          {t(STATUS_KEYS[row.state.status])}
        </span>
        <span className="font-semibold text-onSurface">{row.plan_name ?? t("noPlan")}</span>
      </div>
      <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
        <dt className="text-muted">{t("validUntil")}</dt>
        <dd className="text-onSurface">{has ? row.state.ends_at : t("subscriptionNeverEnds")}</dd>
        {has && (
          <>
            <dt className="text-muted">{t("daysLeft")}</dt>
            <dd className="text-onSurface">{row.state.days_left}</dd>
          </>
        )}
        {row.state.status === "locked" && row.state.purge_at && (
          <>
            <dt className="text-muted">{t("purgeAt")}</dt>
            <dd className="text-onSurface">
              {row.purged_at ? t("purgedAt") : row.purge_paused ? t("purgePaused") : row.state.purge_at}
            </dd>
          </>
        )}
        <dt className="text-muted">{t("modules")}</dt>
        <dd className="text-onSurface">
          {row.modules.length ? MODULES.filter((m) => row.modules.includes(m.key)).map((m) => t(m.labelKey)).join(", ") : "-"}
        </dd>
        {row.note && (
          <>
            <dt className="text-muted">{t("subNote")}</dt>
            <dd className="text-onSurface">{row.note}</dd>
          </>
        )}
      </dl>
      <div className="mt-5 flex flex-wrap gap-4">
        <button className={primary} onClick={() => setDialog("pay")}>
          {t("payAndExtend")}
        </button>
        <button className={link} onClick={() => setDialog("assign")}>
          {has ? t("changePlan") : t("assignPlan")}
        </button>
        {has && (
          <button className={link} onClick={() => setDialog("extend")}>
            {t("extend")}
          </button>
        )}
        <button className={link} onClick={() => setDialog("history")}>
          {t("history")}
        </button>
        {has && row.state.status !== "locked" && (
          <button className="font-semibold text-error hover:underline" onClick={() => setDialog("cancel")}>
            {t("cancelSubscription")}
          </button>
        )}
      </div>
      {dialog === "pay" && <PayDialog row={row} plans={plans} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "assign" && <AssignDialog row={row} plans={plans} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "extend" && <ExtendDialog row={row} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "cancel" && <CancelDialog row={row} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "history" && <HistoryDialog row={row} onClose={() => setDialog(null)} onChanged={load} />}
    </div>
  );
}
