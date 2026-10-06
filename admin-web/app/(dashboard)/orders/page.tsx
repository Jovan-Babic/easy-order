"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OrderPrintModal } from "@/components/OrderPrintModal";
import { StatusBadge } from "@/components/StatusBadge";
import { Order, OrderStatus, STATUS_LABEL_KEYS, money } from "@/lib/orders";

const STATUSES = Object.keys(STATUS_LABEL_KEYS) as OrderStatus[];

export default function OrdersPage() {
  const { t } = useLanguage();
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  const canDelete = session.role === "superadmin" || session.role === "admin";
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    try {
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load orders");
      setOrders((await res.json()) as Order[]);
    } catch {
      setOrders([]);
    }
  }, [statusFilter, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!pendingDelete) return;
    const response = await fetch(`/api/orders/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    if (!response.ok) {
      // Only new orders can be deleted; the backend says so with a 409.
      const body = await response.json().catch(() => ({}));
      setError(typeof body.detail === "string" ? body.detail : t("actionFailed"));
      return;
    }
    setError(null);
    if (selectedOrder?.id === pendingDelete.id) setSelectedOrder(null);
    await load();
  };

  const field = "rounded-md border border-border bg-surfaceSecondary px-3 py-1.5 text-sm";

  return (
    <div className="orders-page">
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">{t("orders")}</h1>

      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={field}>
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(STATUS_LABEL_KEYS[s])}</option>
          ))}
        </select>
        <label className="text-xs font-semibold text-muted">
          {t("fromDate")}
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${field} ml-2`} />
        </label>
        <label className="text-xs font-semibold text-muted">
          {t("toDate")}
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${field} ml-2`} />
        </label>
      </div>
      {error && <p className="no-print mb-3 text-sm text-error">{error}</p>}

      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              {isSuperAdmin && <th className="px-4 py-3">{t("client")}</th>}
              <th className="px-4 py-3">{t("customer")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3">{t("invoiceNumber")}</th>
              <th className="px-4 py-3">{t("items")}</th>
              <th className="px-4 py-3 text-right">{t("grandTotal")}</th>
              <th className="px-4 py-3">{t("createdBy")}</th>
              <th className="px-4 py-3">{t("date")}</th>
              <th className="no-print px-4 py-3 text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                {isSuperAdmin && <td className="px-4 py-3 text-onSurfaceSecondary">{o.client_name ?? o.client_id}</td>}
                <td className="px-4 py-3 font-semibold text-onSurface">{o.customer_name}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{o.invoice_number || "—"}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{o.items.length}</td>
                <td className="px-4 py-3 text-right font-semibold text-onSurface">{money(o.totals.grand)}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{o.created_by_name || "—"}</td>
                <td className="px-4 py-3 text-onSurfaceSecondary">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="no-print px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(o)}
                    className="rounded-md border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brandSecondary"
                  >
                    {t("details")}
                  </button>
                  {canDelete && o.status === "new" && (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(o)}
                      className="ml-2 rounded-md border border-error px-3 py-1.5 text-sm font-semibold text-error hover:bg-red-50"
                    >
                      {t("delete")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={isSuperAdmin ? 9 : 8} className="px-4 py-6 text-center text-muted">
                  {t("noOrdersYet")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedOrder && <OrderPrintModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      {pendingDelete && (
        <ConfirmDialog itemName={pendingDelete.customer_name} onCancel={() => setPendingDelete(null)} onConfirm={remove} />
      )}
    </div>
  );
}
