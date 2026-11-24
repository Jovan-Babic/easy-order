"use client";

import { useEffect, useState } from "react";
import { ByClientChart } from "@/components/ByClientChart";
import { DashboardAnalytics, DashboardStats } from "@/components/DashboardAnalytics";
import { StatCard } from "@/components/StatCard";
import { SuperadminDashboard } from "@/components/SuperadminDashboard";
import { formatMoney, last12MonthsStart } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";

type ClientStats = {
  client_id: string;
  client_name: string;
  order_count: number;
  customer_count: number;
  product_count: number;
  total_net: number;
  total_vat: number;
  total_grand: number;
};

type StatsResponse = {
  scope: "global" | "client";
  totals: ClientStats;
  by_client: ClientStats[];
};

// The system owner gets owner-level cards; a client's admin gets the charts.
export default function DashboardPage() {
  const session = useSession();
  return session.role === "superadmin" ? <SuperadminDashboard /> : <ClientDashboard />;
}

function ClientDashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  // Opens on the last 12 months, not on every order ever placed; "all dates" is one click away.
  const [fromDate, setFromDate] = useState(last12MonthsStart);
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    setLoading(true);
    Promise.all([
      fetch(`/api/stats/overview${params.toString() ? `?${params.toString()}` : ""}`),
      fetch(`/api/stats/dashboard${params.toString() ? `?${params.toString()}` : ""}`),
    ])
      .then(async ([overviewResponse, dashboardResponse]) => {
        if (!overviewResponse.ok || !dashboardResponse.ok) throw new Error("Failed to load dashboard stats");
        return Promise.all([overviewResponse.json(), dashboardResponse.json()]);
      })
      .then(([overview, dashboardStats]) => {
        setStats(overview);
        setDashboard(dashboardStats);
      })
      .catch(() => {
        setStats(null);
        setDashboard(null);
      })
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  if (loading || !stats || !dashboard) {
    return <p className="text-muted">{t("loading")}</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">
        {stats.scope === "global" ? t("allClients") : stats.totals.client_name}
      </h1>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-surfaceSecondary p-4 shadow-sm">
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-muted">
          {t("dashFromDate")}
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-md border border-border px-3 py-2 text-sm font-normal text-onSurface" />
        </label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-wide text-muted">
          {t("dashToDate")}
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-md border border-border px-3 py-2 text-sm font-normal text-onSurface" />
        </label>
        {(fromDate !== last12MonthsStart() || toDate) && (
          <button type="button" onClick={() => { setFromDate(last12MonthsStart()); setToDate(""); }} className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary">
            {t("dashLast12")}
          </button>
        )}
        {(fromDate || toDate) && (
          <button type="button" onClick={() => { setFromDate(""); setToDate(""); }} className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary">
            {t("dashAllDates")}
          </button>
        )}
        {fromDate === last12MonthsStart() && !toDate && <p className="pb-2 text-xs text-muted">{t("dashLast12")}</p>}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label={t("ordersCount")} value={stats.totals.order_count} />
        <StatCard label={t("customersCount")} value={stats.totals.customer_count} />
        <StatCard label={t("productsCount")} value={stats.totals.product_count} />
        <StatCard label={t("revenueInclVat")} value={formatMoney(dashboard.summary.total_grand)} />
        <StatCard label={t("dashAverageOrder")} value={formatMoney(dashboard.summary.average_order_value)} />
        <StatCard label={t("dashActiveCustomers")} value={dashboard.summary.active_customer_count} />
      </div>

      <DashboardAnalytics stats={dashboard} />

      {stats.scope === "global" && (
        <div className="mt-8 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-onSurface">{t("revenueByClient")}</h2>
          <ByClientChart rows={stats.by_client} />
        </div>
      )}
    </div>
  );
}
