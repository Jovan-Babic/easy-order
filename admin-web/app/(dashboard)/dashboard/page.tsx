import { backendFetch } from "@/lib/backend";
import { StatCard } from "@/components/StatCard";
import { ByClientChart } from "@/components/ByClientChart";

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

export default async function DashboardPage() {
  const res = await backendFetch("/stats/overview");
  const stats: StatsResponse = await res.json();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">
        {stats.scope === "global" ? "All clients" : stats.totals.client_name}
      </h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Orders" value={stats.totals.order_count} />
        <StatCard label="Customers" value={stats.totals.customer_count} />
        <StatCard label="Products" value={stats.totals.product_count} />
        <StatCard label="Revenue (incl. VAT)" value={stats.totals.total_grand.toFixed(2)} />
      </div>

      {stats.scope === "global" && (
        <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold text-onSurface">Revenue by client</h2>
          <ByClientChart rows={stats.by_client} />
        </div>
      )}
    </div>
  );
}
