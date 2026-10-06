"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { errorDetail } from "@/lib/orders";

type Product = {
  id: string;
  name: string;
  manufacturer?: string;
  barcode?: string | null;
  boxes_per_transport?: number;
  stock_qty: number | null;
  reserved_qty: number;
  available_qty: number | null;
};

type Movement = {
  id: string;
  product_name: string;
  delta: number;
  balance_after: number | null;
  type: "receipt" | "adjustment" | "shipment" | "reversal";
  order_id?: string | null;
  note?: string | null;
  created_by_name?: string | null;
  created_at: string;
};

const TYPE_KEYS = {
  receipt: "stockReceiptType",
  adjustment: "stockAdjustmentType",
  shipment: "stockShipmentType",
  reversal: "stockReversalType",
} as const;

type Panel = { kind: "receipt" | "count" | "history"; product: Product };

export default function StockPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState<"pieces" | "transport">("pieces");
  const [note, setNote] = useState("");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      setProducts(res.ok ? ((await res.json()) as Product[]) : []);
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (kind: Panel["kind"], product: Product) => {
    setPanel({ kind, product });
    setQty("");
    setNote("");
    setUnit("pieces");
    setMessage(null);
    if (kind === "history") {
      const res = await fetch(`/api/stock/movements?product_id=${product.id}&limit=50`);
      setMovements(res.ok ? ((await res.json()) as Movement[]) : []);
    }
  };

  const perTransport = panel?.product.boxes_per_transport || 0;
  const pieces = useMemo(() => {
    const n = Math.trunc(Number(qty));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return unit === "transport" ? n * perTransport : n;
  }, [qty, unit, perTransport]);

  const submit = async () => {
    if (!panel || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res =
        panel.kind === "receipt"
          ? await fetch("/api/stock/receipts", {
              method: "POST",
              body: JSON.stringify({ items: [{ product_id: panel.product.id, qty: pieces }], note: note.trim() || null }),
            })
          : await fetch("/api/stock/adjustments", {
              method: "POST",
              body: JSON.stringify({ product_id: panel.product.id, counted_qty: Math.trunc(Number(qty)), note: note.trim() }),
            });
      if (!res.ok) {
        setMessage({ ok: false, text: await errorDetail(res, t("actionFailed")) });
        return;
      }
      setMessage({ ok: true, text: t("stockSaved") });
      setQty("");
      setNote("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || (p.manufacturer ?? "").toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
  });

  const canSubmit =
    panel?.kind === "receipt" ? pieces > 0 : panel?.kind === "count" ? qty !== "" && Number(qty) >= 0 && note.trim() !== "" : false;
  const input = "rounded-md border border-border px-3 py-2 text-sm";
  const th = "px-4 py-3";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">{t("stock")}</h1>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("stockSearch")}
        className={`${input} mb-4 w-full max-w-sm`}
      />

      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className={th}>{t("productName")}</th>
              <th className={`${th} text-right`}>{t("stockOnHand")}</th>
              <th className={`${th} text-right`}>{t("stockReserved")}</th>
              <th className={`${th} text-right`}>{t("stockAvailable")}</th>
              <th className={`${th} text-right`}>{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-onSurface">
                  {p.name}
                  {p.manufacturer && <span className="block text-xs font-normal text-muted">{p.manufacturer}</span>}
                </td>
                {p.stock_qty === null ? (
                  <td colSpan={3} className="px-4 py-3 text-right text-muted">{t("stockNotTracked")}</td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-right">{p.stock_qty}</td>
                    <td className="px-4 py-3 text-right">{p.reserved_qty}</td>
                    <td className={`px-4 py-3 text-right font-bold ${(p.available_qty ?? 0) < 0 ? "text-error" : "text-onSurface"}`}>
                      {p.available_qty}
                    </td>
                  </>
                )}
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {(["receipt", "count", "history"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => open(kind, p)}
                      className="ml-2 rounded-md border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brandSecondary"
                    >
                      {kind === "receipt" ? t("stockReceipt") : kind === "count" ? t("stockCount") : t("stockHistory")}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {panel && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 sm:p-8">
          <div className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-extrabold text-onSurface">
                {panel.kind === "receipt" ? t("stockReceipt") : panel.kind === "count" ? t("stockCount") : t("stockHistory")}
                {": "}
                {panel.product.name}
              </h2>
              <button type="button" onClick={() => setPanel(null)} className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold">
                {t("close")}
              </button>
            </div>

            {panel.kind === "history" ? (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border uppercase text-muted">
                  <tr>
                    <th className="px-2 py-2">{t("stockWhen")}</th>
                    <th className="px-2 py-2">{t("stockMovementType")}</th>
                    <th className="px-2 py-2 text-right">{t("stockDelta")}</th>
                    <th className="px-2 py-2 text-right">{t("stockBalance")}</th>
                    <th className="px-2 py-2">{t("stockWho")}</th>
                    <th className="px-2 py-2">{t("note")}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-2 py-2">{new Date(m.created_at).toLocaleString()}</td>
                      <td className="px-2 py-2">{t(TYPE_KEYS[m.type] ?? "stockReceiptType")}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${m.delta < 0 ? "text-error" : "text-success"}`}>
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </td>
                      <td className="px-2 py-2 text-right">{m.balance_after ?? "—"}</td>
                      <td className="px-2 py-2">{m.created_by_name ?? "—"}</td>
                      <td className="px-2 py-2">{m.note ?? ""}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-4 text-center text-muted">{t("stockNoMovements")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div className="grid gap-3">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder={panel.kind === "count" ? t("stockCounted") : t("stockQty")}
                    className={`${input} flex-1`}
                  />
                  {panel.kind === "receipt" && (
                    <select value={unit} onChange={(e) => setUnit(e.target.value as "pieces" | "transport")} className={input}>
                      <option value="pieces">{t("stockUnitPieces")}</option>
                      {perTransport > 0 && <option value="transport">{t("stockUnitTransport")}</option>}
                    </select>
                  )}
                </div>
                {panel.kind === "receipt" && perTransport > 0 && (
                  <p className="text-xs text-muted">
                    {t("stockPiecesIn")} {perTransport} {t("stockUnitPieces")}
                    {unit === "transport" && pieces > 0 ? ` → ${pieces} ${t("stockUnitPieces")}` : ""}
                  </p>
                )}
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={panel.kind === "count" ? t("stockNoteRequired") : t("stockNoteOptional")}
                  className={input}
                />
                {message && <p className={`text-sm ${message.ok ? "text-success" : "text-error"}`}>{message.text}</p>}
                <button
                  type="button"
                  disabled={busy || !canSubmit}
                  onClick={submit}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50"
                >
                  {t("save")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
