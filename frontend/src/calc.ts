import { Order, OrderItem } from "@/src/api";

export function effectiveDiscountPct(it: OrderItem): number {
  const supplier = it.discount ?? 0;
  const additional = it.additional_discount ?? 0;
  return Math.max(0, Math.min(100, supplier + additional));
}

/** Quantity that counts for money: ordered, except on a shipped order where
 * what the warehouse actually packed (picked_qty) wins. Mirrors backend/calc.py. */
export function effectiveQty(it: OrderItem, shipped = false): number {
  if (shipped && it.picked_qty != null) return it.picked_qty;
  return it.ordered_qty ?? 0;
}

export function isShipped(order: Order): boolean {
  return order.status === "shipped";
}

/** Lines that appear on the invoice: a shipped order drops lines with nothing sent. */
export function invoiceLines(order: Order): OrderItem[] {
  return isShipped(order) ? order.items.filter((it) => effectiveQty(it, true) > 0) : order.items;
}

export function lineNet(it: OrderItem, shipped = false): number {
  const price = it.price_no_vat ?? 0;
  const qty = effectiveQty(it, shipped);
  const supplier = it.discount ?? 0;
  const additional = it.additional_discount ?? 0;
  const totalDiscount = Math.max(0, Math.min(100, supplier + additional));
  return price * qty * (1 - totalDiscount / 100);
}

export function lineVat(it: OrderItem, shipped = false): number {
  return lineNet(it, shipped) * ((it.vat_rate ?? 0) / 100);
}

export type Totals = { subtotal: number; vat: number; grand: number };

export function computeTotals(order: Order): Totals {
  const shipped = isShipped(order);
  let subtotal = 0;
  let vat = 0;
  for (const it of order.items) {
    subtotal += lineNet(it, shipped);
    vat += lineVat(it, shipped);
  }
  return { subtotal, vat, grand: subtotal + vat };
}

export function money(n: number): string {
  return n.toLocaleString("sr-RS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
