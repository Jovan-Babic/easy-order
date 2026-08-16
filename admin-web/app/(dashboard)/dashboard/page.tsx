"use client";

import { useEffect, useState } from "react";
import { ByClientChart } from "@/components/ByClientChart";
import { StatCard } from "@/components/StatCard";
import { useLanguage } from "@/lib/i18n";

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

export default function DashboardPage() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    fetch("/api/stats/overview")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load dashboard stats");
        return res.json();
      })
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  if (!stats) {
    return <p className="text-muted">{t("loading")}</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">
        {stats.scope === "global" ? t("allClients") : stats.totals.client_name}
      </h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={t("ordersCount")} value={stats.totals.order_count} />
        <StatCard label={t("customersCount")} value={stats.totals.customer_count} />
        <StatCard label={t("productsCount")} value={stats.totals.product_count} />
        <StatCard label={t("revenueInclVat")} value={stats.totals.total_grand.toFixed(2)} />
      </div>

      {stats.scope === "global" && (
        <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-onSurface">{t("revenueByClient")}</h2>
          <ByClientChart rows={stats.by_client} />
        </div>
      )}
    </div>
  );
}
