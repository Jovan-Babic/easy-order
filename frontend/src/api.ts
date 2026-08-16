const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Role = "superadmin" | "admin" | "operator";

export type User = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: Role;
  client_id?: string | null;
  active: boolean;
  created_at: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  user: User;
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
  created_at?: string;
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
};

export type Order = {
  id: string;
  client_id?: string;
  customer_id: string;
  customer_name: string;
  items: OrderItem[];
  created_at: string;
};

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
  if (res.status === 401) {
    onUnauthorized?.();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    req<TokenResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => req<User>("/auth/me"),
  logout: () => req<{ ok: boolean }>("/auth/logout", { method: "POST" }),

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

  // orders
  listOrders: (customerId?: string) =>
    req<Order[]>(`/orders${customerId ? `?customer_id=${customerId}` : ""}`),
  getOrder: (id: string) => req<Order>(`/orders/${id}`),
  createOrder: (o: Partial<Order>) =>
    req<Order>("/orders", { method: "POST", body: JSON.stringify(o) }),
  deleteOrder: (id: string) =>
    req<{ ok: boolean }>(`/orders/${id}`, { method: "DELETE" }),
};
