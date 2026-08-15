import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL || (process.env.NODE_ENV !== "production" ? "http://localhost:8000" : "");

function requireBackendUrl() {
  if (!BACKEND_URL) {
    throw new Error("BACKEND_URL is not configured. Set BACKEND_URL to your FastAPI base URL in deployment environment variables.");
  }
  return BACKEND_URL;
}

// Server-to-server call to FastAPI, forwarding the session cookie as a
// Bearer token. Never called from the browser - route handlers are the only
// callers, so this never crosses browser CORS.
export async function backendFetch(path: string, init?: RequestInit) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${requireBackendUrl()}/api${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });
}

// Proxies a backend response 1:1 into a Next.js route handler response,
// so route handlers stay one-liners instead of each repeating status/json
// plumbing.
export async function proxyJson(res: Response) {
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
