import { Order, OrderItem } from "@/src/api";

export function effectiveDiscountPct(it: OrderItem): number {
  const supplier = it.discount ?? 0;
  const additional = it.additional_discount ?? 0;
  const factor = (1 - supplier / 100) * (1 - additional / 100);
  return (1 - factor) * 100;
}

export function lineNet(it: OrderItem): number {
  const price = it.price_no_vat ?? 0;
  const qty = it.ordered_qty ?? 0;
  const supplier = it.discount ?? 0;
  const additional = it.additional_discount ?? 0;
  return price * qty * (1 - supplier / 100) * (1 - additional / 100);
}

export function lineVat(it: OrderItem): number {
  return lineNet(it) * ((it.vat_rate ?? 0) / 100);
}

export type Totals = { subtotal: number; vat: number; grand: number };

export function computeTotals(order: Order): Totals {
  let subtotal = 0;
  let vat = 0;
  for (const it of order.items) {
    subtotal += lineNet(it);
    vat += lineVat(it);
  }
  return { subtotal, vat, grand: subtotal + vat };
}

export function money(n: number): string {
  return n.toLocaleString("sr-RS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
