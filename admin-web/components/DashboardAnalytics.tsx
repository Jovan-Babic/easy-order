"use client";

import { useState } from "react";
import { formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { lineQtyLabel } from "@/lib/units";
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
  ordered_qty: number; // whole base units (g, ml, mm, kom)
  unit_symbol?: string;
  unit_factor?: number;
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

const money = (value: number) => formatMoney(value);

// A long product name would wrap into several lines and overlap its neighbours: one line, cut with "…"
// (the full name is in the tooltip and the details dialog).
const AXIS_NAME_CHARS = 22;
const shortName = (name: string) => (name.length > AXIS_NAME_CHARS ? `${name.slice(0, AXIS_NAME_CHARS - 1)}…` : name);

export function DashboardAnalytics({ stats }: { stats: DashboardStats }) {
  const { t, lang } = useLanguage();
  const [selectedProduct, setSelectedProduct] = useState<DashboardProduct | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardStats["revenue_by_period"][number] | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const visibleProducts = showAllProducts ? stats.top_products : stats.top_products.slice(0, 10);
  const grandName = t("dashTotalWithVat");
  const netName = t("dashNetRevenue");

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="min-w-0 rounded-lg bg-surfaceSecondary p-6 shadow-sm xl:col-span-2">
        <h2 className="mb-1 text-lg font-bold text-onSurface">{t("dashRevenueOverTime")}</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted">{t("dashRevenueHint")}</p>
        <div className="my-5 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label={grandName} value={money(stats.summary.total_grand)} />
          <Metric label={netName} value={money(stats.summary.total_net)} />
          <Metric label={t("dashVat")} value={money(stats.summary.total_vat)} />
        </div>
        {stats.revenue_by_period.length === 0 ? <p className="text-sm text-muted">{t("dashNoDataPeriod")}</p> : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.revenue_by_period} margin={{ top: 4, left: 4, right: 16, bottom: 8 }} onClick={(event) => {
              const label = (event as { activeLabel?: string } | undefined)?.activeLabel;
              if (label) setSelectedPeriod(stats.revenue_by_period.find((period) => period.period === label) || null);
            }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis width={72} tick={{ fontSize: 12 }} tickFormatter={(value) => formatMoneyShort(Number(value), lang)} />
              <Tooltip
                labelFormatter={(label) => `${t("dashMonth")}: ${label}`}
                formatter={(value, name) => [money(Number(value)), String(name)]}
              />
              <Legend verticalAlign="top" height={36} />
              <Line
                type="monotone"
                dataKey="total_grand"
                name={grandName}
                stroke="#1A4D2E"
                strokeWidth={3}
                dot={(point: { cx?: number; cy?: number; index?: number; payload?: DashboardStats["revenue_by_period"][number] }) => {
                  const period = point.payload || (typeof point.index === "number" ? stats.revenue_by_period[point.index] : undefined);
                  const openPeriod = () => {
                    if (period) setSelectedPeriod(period);
                  };
                  return (
                    <circle
                      key={`dot-${point.index}`}
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
              <Line type="monotone" dataKey="total_net" name={netName} stroke="#D97706" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="min-w-0 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-onSurface">{t("dashProductSales")}</h2>
            <p className="text-sm text-muted">{t("dashProductSalesHint")}</p>
          </div>
          <div className="flex shrink-0 rounded-md border border-border p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setShowAllProducts(false)}
              className={`rounded px-2 py-1 ${!showAllProducts ? "bg-brand text-onBrand" : "text-muted hover:text-onSurface"}`}
            >
              {t("dashTop10")}
            </button>
            <button
              type="button"
              onClick={() => setShowAllProducts(true)}
              className={`rounded px-2 py-1 ${showAllProducts ? "bg-brand text-onBrand" : "text-muted hover:text-onSurface"}`}
            >
              {t("dashAllProducts")}
            </button>
          </div>
        </div>
        {stats.top_products.length === 0 ? <p className="text-sm text-muted">{t("dashNoSales")}</p> : (
          <div className={showAllProducts ? "max-h-[560px] overflow-y-auto pr-2" : ""}>
            <ResponsiveContainer width="100%" height={Math.max(300, visibleProducts.length * 40 + 40)}>
              <BarChart data={visibleProducts} layout="vertical" margin={{ top: 4, left: 4, right: 16, bottom: 4 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(value) => formatMoneyShort(Number(value), lang)} />
                <YAxis type="category" dataKey="name" width={150} interval={0} tick={{ fontSize: 11 }} tickFormatter={(name) => shortName(String(name))} />
                <Tooltip formatter={(value) => [money(Number(value)), t("dashRevenue")]} labelFormatter={(label) => String(label)} />
                <Bar dataKey="total_grand" fill="#1A4D2E" minPointSize={2} radius={[0, 4, 4, 0]} cursor="pointer" isAnimationActive={false} onClick={(bar) => {
                  const product = (bar as { payload?: DashboardProduct })?.payload;
                  if (product) setSelectedProduct(product);
                }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-bold text-onSurface">{t("dashTopCustomers")}</h2>
        <p className="mb-4 text-sm text-muted">{t("dashTopCustomersHint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="py-2">{t("dashCustomer")}</th>
                <th className="py-2 text-right">{t("dashOrders")}</th>
                <th className="py-2 text-right">{t("dashRevenue")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_customers.map((customer) => (
                <tr key={customer.customer_id} className="border-b border-border last:border-0">
                  <td className="py-3 font-semibold text-onSurface">{customer.customer_name}</td>
                  <td className="py-3 text-right text-onSurfaceSecondary">{customer.order_count}</td>
                  <td className="whitespace-nowrap py-3 pl-3 text-right font-semibold text-brand">{money(customer.total_grand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.top_customers.length === 0 && <p className="pt-3 text-sm text-muted">{t("dashNoData")}</p>}
        </div>
      </section>

      {selectedProduct && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProduct(null)}>
          <div className="w-full max-w-md rounded-lg bg-surfaceSecondary p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("dashProductDetails")}</p>
                <h2 className="mt-1 text-xl font-extrabold text-onSurface">{selectedProduct.name}</h2>
                <p className="text-sm text-muted">{selectedProduct.manufacturer || ""}</p>
              </div>
              <button type="button" onClick={() => setSelectedProduct(null)} className="text-2xl leading-none text-muted hover:text-onSurface" aria-label={t("close")}>&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric
                label={!selectedProduct.unit_symbol || selectedProduct.unit_symbol === "kom" ? t("dashSoldPieces") : t("dashSold")}
                value={lineQtyLabel(selectedProduct.ordered_qty, selectedProduct)}
              />
              <Metric label={t("dashOrders")} value={String(selectedProduct.order_count)} />
              <Metric label={netName} value={money(selectedProduct.total_net)} />
              <Metric label={grandName} value={money(selectedProduct.total_grand)} />
            </div>
          </div>
        </div>
      )}

      {selectedPeriod && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && setSelectedPeriod(null)}>
          <div className="w-full max-w-md rounded-lg bg-surfaceSecondary p-6 shadow-xl" role="dialog" aria-modal="true">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand">{t("dashPeriodDetails")}</p>
                <h2 className="mt-1 text-xl font-extrabold text-onSurface">{selectedPeriod.period}</h2>
                <p className="text-sm text-muted">{t("dashPeriodHint")}</p>
              </div>
              <button type="button" onClick={() => setSelectedPeriod(null)} className="text-2xl leading-none text-muted hover:text-onSurface" aria-label={t("close")}>&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label={t("dashOrders")} value={String(selectedPeriod.order_count)} />
              <Metric label={netName} value={money(selectedPeriod.total_net)} />
              <Metric label={t("dashVat")} value={money(selectedPeriod.total_vat)} />
              <Metric label={grandName} value={money(selectedPeriod.total_grand)} />
            </div>
          </div>
        </div>
      )}

      <section className="min-w-0 rounded-lg bg-surfaceSecondary p-6 shadow-sm xl:col-span-2">
        <h2 className="mb-4 text-lg font-bold text-onSurface">{t("dashRecentOrders")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="py-2">{t("dashCustomer")}</th>
                <th className="py-2">{t("dashDate")}</th>
                <th className="py-2 text-right">{t("dashItems")}</th>
                <th className="py-2 text-right">{t("dashTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_orders.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="py-3 font-semibold text-onSurface">{order.customer_name}</td>
                  <td className="py-3 text-onSurfaceSecondary">{formatDate(order.created_at)}</td>
                  <td className="py-3 text-right text-onSurfaceSecondary">{order.item_count}</td>
                  <td className="whitespace-nowrap py-3 text-right font-semibold text-brand">{money(order.total_grand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-surface p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 font-bold text-onSurface">{value}</p></div>;
}
