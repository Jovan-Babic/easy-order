// Shapes of the FastAPI order/client responses used by the portal.
// Money amounts come from the backend (`totals`, `line_net`) - no math here.
export type OrderStatus = "new" | "in_progress" | "shipped" | "rejected" | "canceled";

export type OrderItem = {
  product_id: string;
  name: string;
  manufacturer?: string;
  price_no_vat?: number;
  vat_rate?: number;
  pieces_per_package?: number;
  ordered_qty: number;
  picked_qty?: number | null;
  discount?: number;
  additional_discount?: number;
  line_net: number;
};

export type StatusChange = {
  from_status?: string | null;
  to_status: string;
  changed_by_name?: string | null;
  changed_at: string;
  note?: string | null;
};

export type Totals = { subtotal: number; vat: number; grand: number };

export type Order = {
  id: string;
  client_id: string;
  client_name?: string;
  customer_id: string;
  customer_name: string;
  items: OrderItem[];
  totals: Totals;
  ordered_totals: Totals;
  status: OrderStatus;
  status_history: StatusChange[];
  assigned_to_name?: string | null;
  shipped_at?: string | null;
  invoice_number?: string | null;
  created_by_name?: string | null;
  created_at: string;
};

export type Customer = {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  pib?: string;
};

export type ClientInfo = {
  id: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  pib?: string;
  registration_number?: string;
  bank_account?: string;
  logo?: string;
  invoice_prefix?: string;
  invoice_numbering: "auto" | "manual";
  invoice_next_seq?: number | null;
};

export function money(value: number) {
  return value.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function discountPct(item: Pick<OrderItem, "discount" | "additional_discount">) {
  return Math.max(0, Math.min(100, (item.discount ?? 0) + (item.additional_discount ?? 0)));
}

export const STATUS_LABEL_KEYS = {
  new: "statusNew",
  in_progress: "statusInProgress",
  shipped: "statusShipped",
  rejected: "statusRejected",
  canceled: "statusCanceled",
} as const;

// Error text from a FastAPI JSON error body.
export async function errorDetail(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body.detail === "string" ? body.detail : fallback;
}
