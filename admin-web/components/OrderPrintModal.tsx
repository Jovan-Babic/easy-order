"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";
import { ClientInfo, Customer, Order, discountPct, money } from "@/lib/orders";
import { StatusBadge } from "@/components/StatusBadge";

// Print-friendly invoice / delivery note (pick list without prices). The
// surrounding page needs the `orders-page` class so globals.css can hide
// everything but this overlay when printing.
export function OrderPrintModal({
  order,
  initialMode = "invoice",
  onClose,
}: {
  order: Order;
  initialMode?: "invoice" | "delivery";
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const session = useSession();
  const isSuperAdmin = session.role === "superadmin";
  const [mode, setMode] = useState<"invoice" | "delivery">(initialMode);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [customers, clientRes] = await Promise.all([
        fetch("/api/customers").then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch(isSuperAdmin ? `/api/clients/${order.client_id}` : "/api/my-client")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (cancelled) return;
      setCustomer((customers as Customer[]).find((c) => c.id === order.customer_id) ?? null);
      setClient(clientRes as ClientInfo | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [order.client_id, order.customer_id, isSuperAdmin]);

  const shipped = order.status === "shipped";
  // A shipped order is invoiced by what was packed; lines with nothing sent are left out.
  const lines = order.items
    .map((item) => ({ item, qty: shipped && item.picked_qty != null ? item.picked_qty : item.ordered_qty }))
    .filter(({ qty }) => !shipped || qty > 0);
  const isInvoice = mode === "invoice";

  return (
    <div className="print-overlay fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="print-modal mx-auto max-w-4xl rounded-lg bg-white shadow-xl">
        <div className="no-print flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex gap-2">
            {(["invoice", "delivery"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                  mode === m ? "border-brand bg-brandSecondary text-brand" : "border-border text-onSurfaceSecondary"
                }`}
              >
                {m === "invoice" ? t("invoiceDoc") : t("deliveryNote")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary"
          >
            {t("close")}
          </button>
        </div>

        <article className="print-document p-6 text-onSurface sm:p-10">
          <div className="document-header mb-6 flex items-start justify-between border-b-2 border-brand pb-4">
            <div className="flex items-start gap-4">
              {client?.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={client.logo} alt="" className="h-16 w-16 object-contain" />
              )}
              <div>
                <p className="text-2xl font-extrabold text-brand">{client?.name ?? "Easy Order"}</p>
                {client && (
                  <div className="mt-1 text-xs text-muted">
                    {client.address && <p>{client.address}</p>}
                    {client.pib && <p>{t("taxIdPib")}: {client.pib}{client.registration_number ? ` · ${t("regNo")}: ${client.registration_number}` : ""}</p>}
                    {client.bank_account && <p>{t("bank")}: {client.bank_account}</p>}
                    {(client.phone || client.email) && <p>{[client.phone, client.email].filter(Boolean).join(" · ")}</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right text-sm text-muted">
              <p className="text-base font-extrabold uppercase tracking-wide text-onSurface">
                {isInvoice ? t("invoiceDoc") : t("deliveryNote")}
              </p>
              {order.invoice_number && <p>{t("invoiceNumber")}: <strong>{order.invoice_number}</strong></p>}
              <p>{new Date(order.shipped_at || order.created_at).toLocaleString()}</p>
              <p>{t("orderNumber")}: {order.id.slice(0, 8)}</p>
              <div className="no-print mt-1"><StatusBadge status={order.status} /></div>
            </div>
          </div>

          <div className="mb-6 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <p><strong>{t("customer")}:</strong> {order.customer_name}</p>
            {customer?.pib && <p><strong>{t("taxIdPib")}:</strong> {customer.pib}</p>}
            {customer?.address && <p><strong>{t("address")}:</strong> {customer.address}</p>}
            {customer?.phone && <p><strong>{t("phone")}:</strong> {customer.phone}</p>}
            {customer?.email && <p><strong>{t("email")}:</strong> {customer.email}</p>}
            {order.created_by_name && <p><strong>{t("createdBy")}:</strong> {order.created_by_name}</p>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-brand text-xs uppercase text-muted">
                <tr>
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">{t("productName")}</th>
                  <th className="px-2 py-2 text-right">{isInvoice ? t("orderedPieces") : t("pickedQty")}</th>
                  {isInvoice && (
                    <>
                      <th className="px-2 py-2 text-right">{t("priceExclVat")}</th>
                      <th className="px-2 py-2 text-right">{t("discount")}</th>
                      <th className="px-2 py-2 text-right">{t("lineTotal")}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.map(({ item, qty }, index) => (
                  <tr key={`${item.product_id}-${index}`} className="border-b border-border">
                    <td className="px-2 py-3">{index + 1}</td>
                    <td className="px-2 py-3 font-semibold">
                      {item.name}
                      {item.manufacturer && <span className="block text-xs font-normal text-muted">{item.manufacturer}</span>}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {isInvoice || shipped ? qty : (
                        <span className="inline-block min-w-12 border-b border-borderStrong text-right">
                          {item.picked_qty ?? ""}
                        </span>
                      )}
                      {!isInvoice && ` / ${item.ordered_qty}`}
                    </td>
                    {isInvoice && (
                      <>
                        <td className="px-2 py-3 text-right">{money(item.price_no_vat ?? 0)}</td>
                        <td className="px-2 py-3 text-right">{discountPct(item)}%</td>
                        <td className="px-2 py-3 text-right font-semibold">{money(item.line_net)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isInvoice && (
            <div className="ml-auto mt-6 max-w-xs space-y-2 text-sm">
              <div className="flex justify-between"><span>{t("subtotal")}</span><span>{money(order.totals.subtotal)}</span></div>
              <div className="flex justify-between"><span>{t("vat")}</span><span>{money(order.totals.vat)}</span></div>
              <div className="flex justify-between border-t-2 border-brand pt-2 text-lg font-extrabold text-brand">
                <span>{t("grandTotal")}</span><span>{money(order.totals.grand)}</span>
              </div>
              {shipped && order.ordered_totals.grand !== order.totals.grand && (
                <p className="text-xs text-muted">{t("orderedLabel")}: {money(order.ordered_totals.grand)}</p>
              )}
            </div>
          )}
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
  );
}
