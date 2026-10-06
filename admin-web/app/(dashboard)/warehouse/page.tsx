"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";
import { OrderPrintModal } from "@/components/OrderPrintModal";
import { StatusBadge } from "@/components/StatusBadge";
import { ClientInfo, Customer, Order, OrderStatus, errorDetail } from "@/lib/orders";

const QUEUE: OrderStatus[] = ["new", "in_progress"];

export default function WarehousePage() {
  const { t } = useLanguage();
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const load = useCallback(async () => {
    const qs = QUEUE.map((s) => `status=${s}`).join("&");
    try {
      const [ordersRes, customersRes] = await Promise.all([fetch(`/api/orders?${qs}`), fetch("/api/customers")]);
      if (!ordersRes.ok) throw new Error();
      setOrders((await ordersRes.json()) as Order[]);
      const list = customersRes.ok ? ((await customersRes.json()) as Customer[]) : [];
      setCustomers(Object.fromEntries(list.map((c) => [c.id, c])));
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const selectedClientId = selected?.client_id;

  // Numbering mode is per client: the caller's own client, or (superadmin)
  // the client of the selected order.
  useEffect(() => {
    if (isSuperAdmin && !selectedClientId) return;
    fetch(isSuperAdmin ? `/api/clients/${selectedClientId}` : "/api/my-client")
      .then((r) => (r.ok ? r.json() : null))
      .then(setClient)
      .catch(() => {});
  }, [isSuperAdmin, selectedClientId]);

  const manualNumbering = client?.invoice_numbering === "manual";

  const select = (id: string | null) => {
    setSelectedId(id);
    setRejecting(false);
    setRejectNote("");
    setInvoiceNumber("");
    setError(null);
  };

  // One write on the selected order; the response replaces it in the list
  // (or removes it once it leaves the queue). A 409 means someone else got
  // there first, so reload.
  const run = async (url: string, init: RequestInit) => {
    if (!selected) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        setError(await errorDetail(res, t("actionFailed")));
        if (res.status === 409) await load();
        return false;
      }
      const updated = (await res.json()) as Order;
      setOrders((prev) =>
        QUEUE.includes(updated.status) ? prev.map((o) => (o.id === updated.id ? updated : o)) : prev.filter((o) => o.id !== updated.id)
      );
      if (!QUEUE.includes(updated.status)) setSelectedId(null);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: OrderStatus, extra: Record<string, unknown> = {}) =>
    run(`/api/orders/${selected!.id}/status`, { method: "POST", body: JSON.stringify({ status, ...extra }) });

  const setPicked = (productId: string, qty: number | null) =>
    run(`/api/orders/${selected!.id}/items`, {
      method: "PATCH",
      body: JSON.stringify({ items: [{ product_id: productId, picked_qty: qty }] }),
    });

  const allChecked = !!selected && selected.items.every((i) => i.picked_qty != null);
  const anyPicked = !!selected && selected.items.some((i) => (i.picked_qty ?? 0) > 0);
  const canShip = selected?.status === "in_progress" && allChecked && anyPicked && (!manualNumbering || invoiceNumber.trim() !== "");

  const btn = "rounded-md px-4 py-2 text-sm font-bold disabled:opacity-50";

  return (
    <div className="orders-page">
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">{t("warehouse")}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          {QUEUE.map((status) => {
            const list = orders.filter((o) => o.status === status);
            return (
              <section key={status}>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
                  <StatusBadge status={status} /> <span className="ml-1">{list.length}</span>
                </h2>
                <div className="space-y-2">
                  {list.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => select(o.id)}
                      className={`block w-full rounded-lg border bg-surfaceSecondary p-3 text-left shadow-sm hover:border-brand ${
                        o.id === selectedId ? "border-brand" : "border-border"
                      }`}
                    >
                      <p className="font-semibold text-onSurface">{o.customer_name}</p>
                      <p className="text-xs text-muted">
                        {new Date(o.created_at).toLocaleString()} · {o.items.length} {t("items")}
                        {o.assigned_to_name ? ` · ${t("assignedTo")}: ${o.assigned_to_name}` : ""}
                      </p>
                    </button>
                  ))}
                  {list.length === 0 && <p className="text-sm text-muted">{t("queueEmpty")}</p>}
                </div>
              </section>
            );
          })}
        </div>

        <div>
          {!selected ? (
            <p className="rounded-lg bg-surfaceSecondary p-6 text-sm text-muted shadow-sm">{t("noOrdersToPack")}</p>
          ) : (
            <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-extrabold text-onSurface">{selected.customer_name}</h2>
                  {(() => {
                    const c = customers[selected.customer_id];
                    return c ? (
                      <p className="text-xs text-muted">
                        {[c.address, c.phone, c.email].filter(Boolean).join(" · ")}
                      </p>
                    ) : null;
                  })()}
                </div>
                <StatusBadge status={selected.status} />
              </div>

              <table className="mb-4 w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="px-2 py-2">{t("productName")}</th>
                    <th className="px-2 py-2 text-right">{t("orderedLabel")}</th>
                    <th className="px-2 py-2 text-right">{t("pickedQty")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.product_id} className="border-b border-border last:border-0">
                      <td className="px-2 py-2 font-semibold text-onSurface">
                        {item.name}
                        {!!item.pieces_per_package && (
                          <span className="block text-xs font-normal text-muted">
                            {t("packaging")}: {item.pieces_per_package}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">{item.ordered_qty}</td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            min={0}
                            max={item.ordered_qty}
                            disabled={busy}
                            defaultValue={item.picked_qty ?? ""}
                            key={`${item.product_id}-${item.picked_qty ?? "x"}`}
                            onBlur={(e) => {
                              const v = e.target.value;
                              const next = v === "" ? null : Math.max(0, Math.min(item.ordered_qty, Math.trunc(Number(v))));
                              if (next !== (item.picked_qty ?? null)) setPicked(item.product_id, next);
                            }}
                            className="w-20 rounded-md border border-border px-2 py-1 text-right"
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPicked(item.product_id, item.ordered_qty)}
                            className="rounded-md border border-brand px-2 py-1 text-xs font-semibold text-brand hover:bg-brandSecondary disabled:opacity-50"
                          >
                            {t("pickAll")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selected.status === "in_progress" && !allChecked && (
                <p className="mb-3 text-xs text-muted">{t("checkAllItems")}</p>
              )}
              {error && <p className="mb-3 text-sm text-error">{error}</p>}

              {rejecting ? (
                <div className="mb-4 grid gap-2">
                  <textarea
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder={t("rejectReason")}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !rejectNote.trim()}
                      onClick={async () => {
                        if (await setStatus("rejected", { note: rejectNote.trim() })) select(null);
                      }}
                      className={`${btn} bg-error text-white`}
                    >
                      {t("rejectOrder")}
                    </button>
                    <button type="button" onClick={() => setRejecting(false)} className={`${btn} border border-border`}>
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {selected.status === "new" ? (
                    <button type="button" disabled={busy} onClick={() => setStatus("in_progress")} className={`${btn} bg-brand text-onBrand`}>
                      {t("takeOrder")}
                    </button>
                  ) : (
                    <>
                      {manualNumbering && (
                        <input
                          value={invoiceNumber}
                          onChange={(e) => setInvoiceNumber(e.target.value)}
                          placeholder={t("invoiceNumber")}
                          className="w-44 rounded-md border border-border px-3 py-2 text-sm"
                        />
                      )}
                      <button
                        type="button"
                        disabled={busy || !canShip}
                        onClick={() => setStatus("shipped", manualNumbering ? { invoice_number: invoiceNumber.trim() } : {})}
                        className={`${btn} bg-brand text-onBrand`}
                      >
                        {t("shipOrder")}
                      </button>
                      <button type="button" disabled={busy} onClick={() => setStatus("new")} className={`${btn} border border-border`}>
                        {t("returnToQueue")}
                      </button>
                    </>
                  )}
                  <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={`${btn} border border-error text-error`}>
                    {t("rejectOrder")}
                  </button>
                  <button type="button" onClick={() => setPrinting(selected)} className={`${btn} border border-border`}>
                    {t("deliveryNote")}
                  </button>
                </div>
              )}

              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">{t("statusHistory")}</h3>
              <ul className="space-y-1 text-xs text-onSurfaceSecondary">
                {[...selected.status_history].reverse().map((h, i) => (
                  <li key={i}>
                    {new Date(h.changed_at).toLocaleString()} · {h.changed_by_name ?? "—"} · {h.from_status ?? "∅"} → {h.to_status}
                    {h.note ? ` · ${h.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {printing && <OrderPrintModal order={printing} initialMode="delivery" onClose={() => setPrinting(null)} />}
    </div>
  );
}
