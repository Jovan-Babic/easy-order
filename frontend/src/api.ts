const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Role = "superadmin" | "admin" | "operator" | "warehouse";

export type User = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: Role;
  client_id?: string | null;
  active: boolean;
  // True until an invited user replaces their temporary password; the
  // backend rejects every business call until then (see RouteGuard).
  must_change_password?: boolean;
  created_at: string;
  // Modules the client has (login / me); superadmin gets all.
  modules?: string[];
  // Live announcements from the system owner.
  announcements?: Array<{ id: string; level: "info" | "warning"; message_sr: string; message_en: string }>;
  // Only when the client has a subscription that is ending (active) or over (grace).
  subscription?: {
    status: "active" | "grace";
    ends_at: string;
    days_left: number;
    grace_ends_at: string;
  } | null;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type AppUpdate = {
  enabled: boolean;
  version?: string;
  download_url?: string;
  release_notes?: string;
};

export type Customer = {
  id: string;
  client_id?: string;
  name: string;
  address?: string;
  email?: string;
  phone?: string;
  pib?: string;
  created_at?: string;
};

export type Product = {
  id: string;
  client_id?: string;
  name: string;
  image?: string;
  manufacturer?: string;
  price_no_vat?: number;
  vat_rate?: number;
  discount?: number;
  discounts?: number[];
  additional_discounts?: number[];
  pieces_per_package?: number;
  boxes_per_transport?: number;
  barcode?: string | null;
  // Barcode of one box: a scan stands for pieces_per_package pieces.
  package_barcode?: string | null;
  // Only on GET /products/by-barcode: what the scanned code was and how many pieces it stands for.
  scan_unit?: "piece" | "package" | null;
  scan_qty?: number;
  // false = delisted / awaiting price; hidden from sales reps. Missing = active.
  active?: boolean;
  // Stock: null/undefined stock_qty = not tracked.
  stock_qty?: number | null;
  reserved_qty?: number;
  available_qty?: number | null;
  // Expiry tracking (warehouse/admin only; sales reps never get these).
  track_expiry?: boolean;
  expired_qty?: number;
  next_expiry?: string | null;
  created_at?: string;
};

export type StockBatch = {
  id: string;
  product_id: string;
  expiry_date: string | null; // null = stock without an expiry date
  qty: number;
  days_left: number | null;
  expired: boolean;
};

export type ExpiringItem = {
  batch_id: string;
  product_id: string;
  product_name: string;
  barcode?: string | null;
  expiry_date: string;
  qty: number;
  days_left: number; // negative = already expired
  level: string; // "expired" or the reached threshold in days
};

export type ExpiringResponse = {
  thresholds: number[];
  total: number;
  counts: Record<string, number>;
  items: ExpiringItem[];
};

export type OrderItem = {
  product_id: string;
  name: string;
  image?: string;
  manufacturer?: string;
  price_no_vat?: number;
  vat_rate?: number;
  pieces_per_package?: number;
  boxes_per_transport?: number;
  discount?: number;
  additional_discount?: number;
  ordered_qty: number;
  picked_qty?: number | null; // set by the warehouse while packing
  line_net?: number; // server-computed, only on responses
};

export type ClientInfo = {
  id: string;
  name: string;
  invoice_numbering: "auto" | "manual";
  invoice_prefix?: string;
};

export type OrderStatus = "new" | "in_progress" | "shipped" | "rejected" | "canceled";

export type StatusChange = {
  from_status?: string | null;
  to_status: string;
  changed_by_name?: string | null;
  changed_by_role?: string | null;
  changed_at: string;
  note?: string | null;
};

export type Order = {
  id: string;
  client_id?: string;
  customer_id: string;
  customer_name: string;
  items: OrderItem[];
  status?: OrderStatus;
  status_history?: StatusChange[];
  assigned_to_name?: string | null;
  shipped_at?: string | null;
  invoice_number?: string | null;
  created_by_user_id?: string | null;
  created_by_name?: string | null;
  // Server-computed (backend/calc.py), only on responses.
  totals?: { subtotal: number; vat: number; grand: number };
  // Totals by ordered quantity (differs from `totals` once shipped partially).
  ordered_totals?: { subtotal: number; vat: number; grand: number };
  created_at: string;
};

/** What the backend accepts per order line - it takes everything else
 * (name, price, VAT, ...) from the stored product. */
export type OrderLineInput = {
  product_id: string;
  ordered_qty: number;
  discount?: number;
  additional_discount?: number;
};

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, body: string) {
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.detail === "string") detail = parsed.detail;
    } catch {
      // not JSON - keep the raw text
    }
    super(`API ${status}: ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

// Pushed in by AuthContext — api.ts is a plain module, not a hook, so it
// can't useContext itself.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

let onPasswordChangeRequired: (() => void) | null = null;
export function setPasswordChangeRequiredHandler(fn: (() => void) | null) {
  onPasswordChangeRequired = fn;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    // A wrong password on the login screen is also a 401 - that must not
    // look like "session expired".
    onUnauthorized?.();
  }
  if (!res.ok) {
    const error = new ApiError(res.status, await res.text());
    if (res.status === 403 && error.detail === "Password change required") {
      onPasswordChangeRequired?.();
    }
    throw error;
  }
  return res.json();
}

export const api = {
  checkAppUpdate: () => req<AppUpdate>("/app/update"),

  // auth
  login: (email: string, password: string) =>
    req<TokenResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => req<User>("/auth/me"),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  requestPasswordReset: (email: string, channel: "web" | "mobile" = "mobile") =>
    req<{ ok: boolean; message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email, channel }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<TokenResponse>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    req<{ ok: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  // customers
  listCustomers: () => req<Customer[]>("/customers"),
  createCustomer: (c: Partial<Customer>) =>
    req<Customer>("/customers", { method: "POST", body: JSON.stringify(c) }),
  updateCustomer: (id: string, c: Partial<Customer>) =>
    req<Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteCustomer: (id: string) =>
    req<{ ok: boolean }>(`/customers/${id}`, { method: "DELETE" }),

  // products
  listProducts: () => req<Product[]>("/products"),
  createProduct: (p: Partial<Product>) =>
    req<Product>("/products", { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id: string, p: Partial<Product>) =>
    req<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProduct: (id: string) =>
    req<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" }),
  uploadProductImage: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await req<{ url: string }>('/upload-image', {
      method: 'POST',
      body: formData,
    });
    return response.url;
  },
  // Cleanup when a product write fails after its image was uploaded on "Save".
  deleteUploadedImage: (url: string) =>
    req<{ ok: boolean }>(`/upload-image?url=${encodeURIComponent(url)}`, { method: 'DELETE' }),

  // orders
  listOrders: (opts?: { customerId?: string; status?: OrderStatus[] }) => {
    const qs = new URLSearchParams();
    if (opts?.customerId) qs.set("customer_id", opts.customerId);
    (opts?.status ?? []).forEach((s) => qs.append("status", s));
    const q = qs.toString();
    return req<Order[]>(`/orders${q ? `?${q}` : ""}`);
  },
  updateOrder: (id: string, o: { customer_id: string; items: OrderLineInput[] }) =>
    req<Order>(`/orders/${id}`, { method: "PUT", body: JSON.stringify(o) }),
  changeOrderStatus: (id: string, status: OrderStatus, note?: string, invoiceNumber?: string) =>
    req<Order>(`/orders/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note, invoice_number: invoiceNumber }),
    }),
  getMyClient: () => req<ClientInfo>("/clients/me"),
  getProductByBarcode: (code: string) => req<Product>(`/products/by-barcode/${encodeURIComponent(code)}`),
  linkBarcode: (id: string, barcode: string, kind: "piece" | "package" = "piece") =>
    req<Product>(`/products/${id}/barcode`, { method: "POST", body: JSON.stringify({ barcode, kind }) }),
  quickAddProduct: (p: {
    name: string;
    barcode: string;
    barcode_kind?: "piece" | "package";
    manufacturer?: string;
    pieces_per_package?: number;
    boxes_per_transport?: number;
  }) => req<Product>("/products/quick", { method: "POST", body: JSON.stringify(p) }),
  productBatches: (id: string) => req<StockBatch[]>(`/products/${id}/batches`),
  stockExpiring: () => req<ExpiringResponse>("/stock/expiring"),
  writeOffBatch: (batchId: string) =>
    req<{ ok: boolean }>(`/stock/batches/${batchId}/writeoff`, { method: "POST", body: JSON.stringify({}) }),
  stockReceipt: (items: { product_id: string; qty: number; expiry_date?: string }[], note?: string) =>
    req<{ ok: boolean; count: number }>("/stock/receipts", { method: "POST", body: JSON.stringify({ items, note }) }),
  stockCount: (
    items: { product_id: string; counted_qty?: number; batches?: { expiry_date: string | null; counted_qty: number }[] }[],
    note: string
  ) =>
    req<{ ok: boolean; count: number }>("/stock/adjustments/batch", {
      method: "POST",
      body: JSON.stringify({ items, note }),
    }),
  setPickedQty: (id: string, items: { product_id: string; picked_qty: number | null }[]) =>
    req<Order>(`/orders/${id}/items`, { method: "PATCH", body: JSON.stringify({ items }) }),
  getOrder: (id: string) => req<Order>(`/orders/${id}`),
  createOrder: (o: { customer_id: string; items: OrderLineInput[] }) =>
    req<Order>("/orders", { method: "POST", body: JSON.stringify(o) }),
  deleteOrder: (id: string) =>
    req<{ ok: boolean }>(`/orders/${id}`, { method: "DELETE" }),
};
