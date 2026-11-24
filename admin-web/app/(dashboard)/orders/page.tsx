"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EinvoiceModal } from "@/components/EinvoiceModal";
import { OrderPrintModal } from "@/components/OrderPrintModal";
import { PAGE_SIZE, Pager } from "@/components/Pager";
import { StatusBadge } from "@/components/StatusBadge";
import { Order, OrderStatus, STATUS_LABEL_KEYS, money } from "@/lib/orders";
import { formatDate } from "@/lib/format";

const STATUSES = Object.keys(STATUS_LABEL_KEYS) as OrderStatus[];

export default function OrdersPage() {
  const { t } = useLanguage();
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  const canSef = (session.role === "admin" || session.role === "superadmin") && session.modules.includes("sef");
  // Without the warehouse module there is no shipping: a new order is invoiced directly (a superadmin sees every client's orders).
  const hasWarehouse = session.role !== "superadmin" && session.modules.includes("warehouse");
  const [einvoiceOrderId, setEinvoiceOrderId] = useState<string | null>(null);
  const canDelete = session.role === "superadmin" || session.role === "admin";
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState(""); // what is sent: the typed text, a moment after the last key
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  // A different filter starts from the first page again.
  useEffect(() => {
    setPage(0);
  }, [statusFilter, fromDate, toDate, search]);

  // One page at a time (PAGE_SIZE orders, newest first); the backend says how many match in all.
  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), skip: String(page * PAGE_SIZE) });
    if (statusFilter) params.set("status", statusFilter);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    if (search) params.set("q", search);
    try {
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load orders");
      const rows = (await res.json()) as Order[];
      const count = Number(res.headers.get("X-Total-Count") ?? rows.length);
      // The last order of the last page was deleted: step back instead of showing an empty page.
      if (rows.length === 0 && page > 0 && count > 0) {
        setPage(Math.max(0, Math.ceil(count / PAGE_SIZE) - 1));
        return;
      }
      setOrders(rows);
      setTotal(count);
    } catch {
      setOrders([]);
      setTotal(0);
    }
  }, [statusFilter, fromDate, toDate, search, page]);

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
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={t("ordersSearch")}
          aria-label={t("ordersSearch")}
          className={`${field} w-64`}
        />
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
              <th className="no-print sticky-actions px-4 py-3 text-right">{t("actions")}</th>
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
                <td className="px-4 py-3 text-onSurfaceSecondary">{formatDate(o.created_at)}</td>
                <td className="no-print sticky-actions px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(o)}
                    className="rounded-md border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brandSecondary"
                  >
                    {t("details")}
                  </button>
                  {canSef && (o.status === "shipped" || (o.status === "new" && !hasWarehouse)) && (
                    <button
                      type="button"
                      onClick={() => setEinvoiceOrderId(o.id)}
                      className="ml-2 rounded-md border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brandSecondary"
                    >
                      {t("sefInvoice")}
                    </button>
                  )}
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
      <Pager page={page} total={total} onPage={setPage} />

      {selectedOrder && <OrderPrintModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      {einvoiceOrderId && <EinvoiceModal orderId={einvoiceOrderId} onClose={() => setEinvoiceOrderId(null)} />}
      {pendingDelete && (
        <ConfirmDialog itemName={pendingDelete.customer_name} onCancel={() => setPendingDelete(null)} onConfirm={remove} />
      )}
    </div>
  );
}
