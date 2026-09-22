"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DashboardProduct = {
  product_id: string;
  name: string;
  manufacturer?: string;
  ordered_qty: number;
  order_count: number;
  total_net: number;
  total_vat: number;
  total_grand: number;
};

export type DashboardStats = {
  summary: {
    order_count: number;
    customer_count: number;
    product_count: number;
    active_customer_count: number;
    total_net: number;
    total_vat: number;
    total_grand: number;
    average_order_value: number;
    average_items_per_order: number;
  };
  revenue_by_period: Array<{
    period: string;
    order_count: number;
    total_net: number;
    total_vat: number;
    total_grand: number;
  }>;
  top_products: DashboardProduct[];
  top_customers: Array<{
    customer_id: string;
    customer_name: string;
    order_count: number;
    total_grand: number;
  }>;
  recent_orders: Array<{
    id: string;
    customer_name: string;
    item_count: number;
    total_grand: number;
    created_at: string;
  }>;
};

const money = (value: number) => value.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DashboardAnalytics({ stats }: { stats: DashboardStats }) {
  const [selectedProduct, setSelectedProduct] = useState<DashboardProduct | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardStats["revenue_by_period"][number] | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const visibleProducts = showAllProducts ? stats.top_products : stats.top_products.slice(0, 10);

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm xl:col-span-2">
        <h2 className="mb-1 text-lg font-bold text-onSurface">Promet kroz vreme</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Svaka tačka predstavlja jedan mesec. <strong className="text-brand">Ukupno sa PDV-om</strong> je iznos koji se naplaćuje kupcu,
          dok je <strong className="text-amber-700">Neto promet</strong> vrednost robe bez PDV-a. Razlika između linija predstavlja PDV. Kliknite na tačku za detalje meseca.
        </p>
        <div className="my-5 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label="Ukupno sa PDV-om" value={money(stats.summary.total_grand)} />
          <Metric label="Neto promet" value={money(stats.summary.total_net)} />
          <Metric label="PDV" value={money(stats.summary.total_vat)} />
        </div>
        {stats.revenue_by_period.length === 0 ? <p className="text-sm text-muted">Nema podataka za izabrani period.</p> : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.revenue_by_period} margin={{ left: 8, right: 12 }} onClick={(event) => {
              const label = (event as { activeLabel?: string } | undefined)?.activeLabel;
              if (label) setSelectedPeriod(stats.revenue_by_period.find((period) => period.period === label) || null);
            }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} label={{ value: "Mesec", position: "insideBottom", offset: -5 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => money(Number(value))} label={{ value: "Iznos", angle: -90, position: "insideLeft" }} />
              <Tooltip
                labelFormatter={(label) => `Mesec: ${label}`}
                formatter={(value, name) => [money(Number(value)), name === "Ukupno sa PDV-om" ? "Ukupno sa PDV-om" : "Neto promet"]}
              />
              <Legend verticalAlign="top" height={36} />
              <Line
                type="monotone"
                dataKey="total_grand"
                name="Ukupno sa PDV-om"
                stroke="#1A4D2E"
                strokeWidth={3}
                dot={(point: { cx?: number; cy?: number; index?: number; payload?: DashboardStats["revenue_by_period"][number] }) => {
                  const period = point.payload || (typeof point.index === "number" ? stats.revenue_by_period[point.index] : undefined);
                  const openPeriod = () => {
                    if (period) setSelectedPeriod(period);
                  };
                  return (
                  <circle
                    cx={point.cx}
                    cy={point.cy}
                    r={4}
                    fill="#1A4D2E"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                    onClick={openPeriod}
                    onMouseDown={openPeriod}
                  />
                  );
                }}
                activeDot={{ r: 7, cursor: "pointer" }}
              />
              <Line type="monotone" dataKey="total_net" name="Neto promet" stroke="#D97706" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-onSurface">Prodaja artikala</h2>
            <p className="text-sm text-muted">Kliknite na stubić da otvorite detalje artikla</p>
          </div>
          <div className="flex shrink-0 rounded-md border border-border p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setShowAllProducts(false)}
              className={`rounded px-2 py-1 ${!showAllProducts ? "bg-brand text-onBrand" : "text-muted hover:text-onSurface"}`}
            >
              Top 10
            </button>
            <button
              type="button"
              onClick={() => setShowAllProducts(true)}
              className={`rounded px-2 py-1 ${showAllProducts ? "bg-brand text-onBrand" : "text-muted hover:text-onSurface"}`}
            >
              Svi proizvodi
            </button>
          </div>
        </div>
        {stats.top_products.length === 0 ? <p className="text-sm text-muted">Nema prodaje za izabrani period.</p> : (
          <div className={showAllProducts ? "max-h-[560px] overflow-y-auto pr-2" : ""}>
            <ResponsiveContainer width="100%" height={Math.max(340, visibleProducts.length * 46)}>
            <BarChart data={visibleProducts} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [money(Number(value)), "Promet"]} />
              <Bar dataKey="total_grand" fill="#1A4D2E" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(bar) => {
                const product = (bar as { payload?: DashboardProduct })?.payload;
                if (product) setSelectedProduct(product);
              }} />
            </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold text-onSurface">Najbolji kupci</h2>
        <p className="mb-4 text-sm text-muted">Kupci rangirani po ukupnom prometu</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="py-2">Kupac</th><th className="py-2 text-right">Porudžbine</th><th className="py-2 text-right">Promet</th></tr></thead>
            <tbody>
              {stats.top_customers.map((customer) => <tr key={customer.customer_id} className="border-b border-border last:border-0"><td className="py-3 font-semibold text-onSurface">{customer.customer_name}</td><td className="py-3 text-right text-onSurfaceSecondary">{customer.order_count}</td><td className="py-3 text-right font-semibold text-brand">{money(customer.total_grand)}</td></tr>)}
            </tbody>
          </table>
          {stats.top_customers.length === 0 && <p className="pt-3 text-sm text-muted">Nema podataka.</p>}
        </div>
      </section>

      {selectedProduct && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProduct(null)}>
          <div className="w-full max-w-md rounded-lg bg-surfaceSecondary p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wide text-brand">Detalji artikla</p><h2 className="mt-1 text-xl font-extrabold text-onSurface">{selectedProduct.name}</h2><p className="text-sm text-muted">{selectedProduct.manufacturer || ""}</p></div>
              <button type="button" onClick={() => setSelectedProduct(null)} className="text-2xl leading-none text-muted hover:text-onSurface" aria-label="Zatvori">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Prodato komada" value={String(selectedProduct.ordered_qty)} />
              <Metric label="Porudžbine" value={String(selectedProduct.order_count)} />
              <Metric label="Neto promet" value={money(selectedProduct.total_net)} />
              <Metric label="Ukupno sa PDV-om" value={money(selectedProduct.total_grand)} />
            </div>
          </div>
        </div>
      )}

      {selectedPeriod && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && setSelectedPeriod(null)}>
          <div className="w-full max-w-md rounded-lg bg-surfaceSecondary p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wide text-brand">Detalji prometa</p><h2 className="mt-1 text-xl font-extrabold text-onSurface">{selectedPeriod.period}</h2><p className="text-sm text-muted">Pregled izabranog meseca</p></div>
              <button type="button" onClick={() => setSelectedPeriod(null)} className="text-2xl leading-none text-muted hover:text-onSurface" aria-label="Zatvori">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Porudžbine" value={String(selectedPeriod.order_count)} />
              <Metric label="Neto promet" value={money(selectedPeriod.total_net)} />
              <Metric label="PDV" value={money(selectedPeriod.total_vat)} />
              <Metric label="Ukupno sa PDV-om" value={money(selectedPeriod.total_grand)} />
            </div>
          </div>
        </div>
      )}

      <section className="rounded-lg bg-surfaceSecondary p-6 shadow-sm xl:col-span-2">
        <h2 className="mb-4 text-lg font-bold text-onSurface">Poslednje porudžbine</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="py-2">Kupac</th><th className="py-2">Datum</th><th className="py-2 text-right">Stavke</th><th className="py-2 text-right">Ukupno</th></tr></thead><tbody>{stats.recent_orders.map((order) => <tr key={order.id} className="border-b border-border last:border-0"><td className="py-3 font-semibold text-onSurface">{order.customer_name}</td><td className="py-3 text-onSurfaceSecondary">{new Date(order.created_at).toLocaleDateString("sr-RS")}</td><td className="py-3 text-right text-onSurfaceSecondary">{order.item_count}</td><td className="py-3 text-right font-semibold text-brand">{money(order.total_grand)}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-surface p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-bold text-onSurface">{value}</p></div>;
}
