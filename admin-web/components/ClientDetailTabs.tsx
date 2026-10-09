"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientEditForm } from "@/components/ClientEditForm";
import { PaymentsPanel } from "@/components/PaymentsPanel";
import { ROLE_KEYS, SeatsEditDialog, SeatsSummary } from "@/components/SeatsPanel";
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
import { SeatsOut } from "@/lib/seats";
import { Plan, STATUS_KEYS, STATUS_STYLES, SubscriptionRow, detailOf } from "@/lib/subscriptions";

type Stats = { order_count: number; customer_count: number; product_count: number; total_grand: number } | null;
type Tab = "overview" | "users" | "subscription" | "payments" | "activity" | "notes";
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
    ["activity", t("activity")],
    ["notes", t("notes")],
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
      {tab === "activity" && <ClientActivity clientId={client.id} />}
      {tab === "notes" && <ClientNotes clientId={client.id} />}
    </div>
  );
}

function ClientUsers({ clientId }: { clientId: string }) {
  const { t } = useLanguage();
  const [users, setUsers] = useState<ClientUser[] | null>(null);
  const [seats, setSeats] = useState<SeatsOut | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(`/api/clients/${clientId}/seats`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setSeats)
      .catch(() => {});
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
      {seats?.plan_name && (
        <p className="mb-3 text-sm text-onSurfaceSecondary">
          {seats.seats.map((r) => `${t(ROLE_KEYS[r.role])}: ${r.used} / ${r.limit ?? t("seatsUnlimited")}`).join(" · ")}
        </p>
      )}
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

type Dialog = "assign" | "extend" | "cancel" | "history" | "pay" | "seats" | null;

function ClientSubscription({ clientId }: { clientId: string }) {
  const { t } = useLanguage();
  const [row, setRow] = useState<SubscriptionRow | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seats, setSeats] = useState<SeatsOut | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    const [s, p, a] = await Promise.all([fetch(`/api/subscriptions/${clientId}`), fetch("/api/plans"), fetch(`/api/clients/${clientId}/seats`)]);
    if (!s.ok || !p.ok) {
      setError(await detailOf(s.ok ? p : s, t("loadFailed")));
      return;
    }
    setRow((await s.json()).row);
    setPlans(await p.json());
    setSeats(a.ok ? await a.json() : null);
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
    <div className="grid gap-6">
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
    {seats && (
      <div>
        <div className="mb-3 flex items-center gap-4">
          <h3 className="text-base font-extrabold text-onSurface">{t("seatsTitle")}</h3>
          {row.plan_id && (
            <button className={link} onClick={() => setDialog("seats")}>
              {t("seatsEdit")}
            </button>
          )}
        </div>
        <SeatsSummary data={seats} />
      </div>
    )}
    {dialog === "seats" && seats && <SeatsEditDialog clientId={clientId} data={seats} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

type Activity = {
  last_activity_at: string | null;
  last_order_at: string | null;
  orders_30d: number;
  orders_total: number;
  users: Array<{ id: string; name: string; role: string; active: boolean; last_login_at: string | null; last_seen_at: string | null }>;
};

const when = (iso: string | null | undefined, never: string) => (iso ? new Date(iso).toLocaleString() : never);

function ClientActivity({ clientId }: { clientId: string }) {
  const { t } = useLanguage();
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(`/api/clients/${clientId}/activity`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, [clientId]);
  if (error) return <p className="text-error">{t("loadFailed")}</p>;
  if (!data) return <p className="text-muted">{t("loading")}</p>;
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={t("lastActivity")} value={when(data.last_activity_at, t("never"))} />
        <StatCard label={t("lastOrder")} value={when(data.last_order_at, t("never"))} />
        <StatCard label={t("orders30d")} value={data.orders_30d} />
        <StatCard label={t("ordersTotal")} value={data.orders_total} />
      </div>
      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">{t("name")}</th>
              <th className="px-4 py-3">{t("role")}</th>
              <th className="px-4 py-3">{t("lastLogin")}</th>
              <th className="px-4 py-3">{t("lastSeen")}</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-onSurface">
                  {u.name}
                  {!u.active && <span className="ml-2 text-xs text-muted">({t("inactive")})</span>}
                </td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{u.role}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{when(u.last_login_at, t("never"))}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{when(u.last_seen_at, t("never"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Note = { id: string; text: string; author_name: string | null; created_at: string };

function ClientNotes({ clientId }: { clientId: string }) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/notes`);
    if (!res.ok) {
      setError(await detailOf(res, t("loadFailed")));
      return;
    }
    setNotes(await res.json());
  }, [clientId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`, { method: "POST", body: JSON.stringify({ text }) });
      if (!res.ok) {
        setError(await detailOf(res, t("saveFailed")));
        return;
      }
      setText("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={add} className="mb-6 grid gap-2">
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted">{t("noteHint")}</p>
        {error && <p className="text-sm text-error">{error}</p>}
        <div>
          <button type="submit" disabled={busy || !text.trim()} className={primary}>
            {t("noteAdd")}
          </button>
        </div>
      </form>
      {notes === null ? (
        <p className="text-muted">{t("loading")}</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted">{t("noNotes")}</p>
      ) : (
        <ul className="grid gap-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-surfaceSecondary p-4 shadow-sm">
              <p className="whitespace-pre-wrap text-sm text-onSurface">{n.text}</p>
              <p className="mt-2 text-xs text-muted">
                {new Date(n.created_at).toLocaleString()} · {n.author_name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
