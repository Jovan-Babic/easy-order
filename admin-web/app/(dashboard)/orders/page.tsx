"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";

type Order = {
  id: string;
  client_id: string;
  client_name?: string;
  customer_id: string;
  customer_name: string;
  items: {
    name: string;
    manufacturer?: string;
    price_no_vat?: number;
    ordered_qty: number;
    discount?: number;
    additional_discount?: number;
    vat_rate?: number;
  }[];
  created_at: string;
};

type Customer = {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  pib?: string;
};

function discount(item: Order["items"][number]) {
  return Math.max(0, Math.min(100, (item.discount ?? 0) + (item.additional_discount ?? 0)));
}

function lineNet(item: Order["items"][number]) {
  return (item.price_no_vat ?? 0) * item.ordered_qty * (1 - discount(item) / 100);
}

function money(value: number) {
  return value.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const { t } = useLanguage();
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/orders"), fetch("/api/customers")])
      .then(async ([ordersResponse, customersResponse]) => {
        if (!ordersResponse.ok) throw new Error("Failed to load orders");
        const orderList = (await ordersResponse.json()) as Order[];
        const customerList = customersResponse.ok ? ((await customersResponse.json()) as Customer[]) : [];
        setOrders(orderList);
        setCustomers(Object.fromEntries(customerList.map((customer) => [customer.id, customer])));
      })
      .catch(() => {
        setOrders([]);
        setCustomers({});
      });
  }, []);

  return (
    <div className="orders-page">
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">{t("orders")}</h1>
      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              {isSuperAdmin && <th className="px-4 py-3">{t("client")}</th>}
              <th className="px-4 py-3">{t("customer")}</th>
              <th className="px-4 py-3">{t("items")}</th>
              <th className="px-4 py-3">{t("date")}</th>
              <th className="no-print px-4 py-3 text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                {isSuperAdmin && <td className="px-4 py-3 text-onSurfaceSecondary">{o.client_name ?? o.client_id}</td>}
                <td className="px-4 py-3 font-semibold text-onSurface">{o.customer_name}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{o.items.length}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">
                  {new Date(o.created_at).toLocaleDateString()}
                </td>
                <td className="no-print px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(o)}
                    className="rounded-md border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brandSecondary"
                  >
                    {t("details")}
                  </button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={isSuperAdmin ? 5 : 4} className="px-4 py-6 text-center text-muted">
                  {t("noOrdersYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <div className="print-overlay fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="print-modal mx-auto max-w-4xl rounded-lg bg-white shadow-xl">
            <div className="no-print flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-xl font-extrabold text-onSurface">{t("orderDetails")}</h2>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary"
              >
                {t("close")}
              </button>
            </div>

            <article className="print-document p-6 text-onSurface sm:p-10">
              {(() => {
                const customer = customers[selectedOrder.customer_id];
                return (
                  <>
              <div className="document-header mb-6 flex items-start justify-between border-b-2 border-brand pb-4">
                <div>
                  <p className="text-2xl font-extrabold text-brand">Easy Order</p>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">{t("orderDetails")}</p>
                </div>
                <div className="text-right text-sm text-muted">
                  <p>{new Date(selectedOrder.created_at).toLocaleString()}</p>
                  <p>{t("orderNumber")}: {selectedOrder.id}</p>
                </div>
              </div>

              <div className="mb-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                {isSuperAdmin && <p><strong>{t("client")}:</strong> {selectedOrder.client_name ?? selectedOrder.client_id}</p>}
                <p><strong>{t("customer")}:</strong> {selectedOrder.customer_name}</p>
                {customer?.pib && <p><strong>{t("taxIdPib")}:</strong> {customer.pib}</p>}
                {customer?.address && <p><strong>{t("address")}:</strong> {customer.address}</p>}
                {customer?.phone && <p><strong>{t("phone")}:</strong> {customer.phone}</p>}
                {customer?.email && <p><strong>{t("email")}:</strong> {customer.email}</p>}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b-2 border-brand text-xs uppercase text-muted">
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">{t("productName")}</th>
                      <th className="px-2 py-2 text-right">{t("orderedPieces")}</th>
                      <th className="px-2 py-2 text-right">{t("priceExclVat")}</th>
                      <th className="px-2 py-2 text-right">{t("discount")}</th>
                      <th className="px-2 py-2 text-right">{t("lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item, index) => (
                      <tr key={`${selectedOrder.id}-${item.name}-${index}`} className="border-b border-border">
                        <td className="px-2 py-3">{index + 1}</td>
                        <td className="px-2 py-3 font-semibold">
                          {item.name}
                          {item.manufacturer && <span className="block text-xs font-normal text-muted">{item.manufacturer}</span>}
                        </td>
                        <td className="px-2 py-3 text-right">{item.ordered_qty}</td>
                        <td className="px-2 py-3 text-right">{money(item.price_no_vat ?? 0)}</td>
                        <td className="px-2 py-3 text-right">{discount(item)}%</td>
                        <td className="px-2 py-3 text-right font-semibold">{money(lineNet(item))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(() => {
                const subtotal = selectedOrder.items.reduce((sum, item) => sum + lineNet(item), 0);
                const vat = selectedOrder.items.reduce((sum, item) => sum + lineNet(item) * ((item.vat_rate ?? 0) / 100), 0);
                return (
                  <div className="ml-auto mt-6 max-w-xs space-y-2 text-sm">
                    <div className="flex justify-between"><span>{t("subtotal")}</span><span>{money(subtotal)}</span></div>
                    <div className="flex justify-between"><span>{t("vat")}</span><span>{money(vat)}</span></div>
                    <div className="flex justify-between border-t-2 border-brand pt-2 text-lg font-extrabold text-brand">
                      <span>{t("grandTotal")}</span><span>{money(subtotal + vat)}</span>
                    </div>
                  </div>
                );
              })()}
                  </>
                );
              })()}
            </article>

            <div className="no-print flex justify-end border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md bg-brand px-4 py-2 font-bold text-onBrand hover:opacity-90"
              >
                {t("printPdf")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
