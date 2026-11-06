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
  // Quantities are whole base units (g, ml, mm, kom); the price is per unit_factor of them.
  const factor = it.unit_factor || 1;
  return (price * qty / factor) * (1 - totalDiscount / 100);
}

export function lineVat(it: OrderItem, shipped = false): number {
  return lineNet(it, shipped) * ((it.vat_rate ?? 0) / 100);
}

export type Totals = { subtotal: number; vat: number; grand: number };

/** Round half up to 2 decimals on the shortest decimal form (1.005 gives 1.01).
 * Mirrors backend/calc.py round2. */
export function round2(value: number): number {
  if (Math.abs(value) < 1e-9) return 0;
  const text = String(value);
  if (text.includes("e")) return Math.round(value * 100) / 100;
  const sign = value < 0 ? -1 : 1;
  return (sign * Number(Math.round(Number(Math.abs(Number(text)) + "e2")) + "e-2")) || 0;
}

/** Totals as the e-invoice states them (backend/calc.py invoice_amounts): every line
 * rounded to 2 decimals, the base of a VAT rate = sum of its rounded lines, VAT =
 * round(base x rate). Keep in sync with the backend. */
export function computeTotals(order: Order): Totals {
  const shipped = isShipped(order);
  const taxable = new Map<number, number>();
  for (const it of order.items) {
    if (effectiveQty(it, shipped) <= 0) continue;
    const rate = it.vat_rate ?? 20;
    taxable.set(rate, round2((taxable.get(rate) ?? 0) + round2(lineNet(it, shipped))));
  }
  let subtotal = 0;
  let vat = 0;
  for (const [rate, base] of taxable) {
    subtotal += base;
    vat += round2((base * rate) / 100);
  }
  subtotal = round2(subtotal);
  vat = round2(vat);
  return { subtotal, vat, grand: round2(subtotal + vat) };
}

export function money(n: number): string {
  return n.toLocaleString("sr-RS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
