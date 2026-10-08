import { jwtVerify } from "jose";

export const COOKIE_NAME = process.env.COOKIE_NAME || "eo_session";

const DEV_JWT_SECRET = "dev-insecure-secret-change-me";

// Must match backend/server.py's JWT_SECRET - the backend issues the token,
// this app only verifies/reads it (never re-signs one of its own).
// Resolved lazily (not at import) so `next build` doesn't need the secret.
function getSecret(): Uint8Array | null {
  const value = process.env.JWT_SECRET;
  if (value) return new TextEncoder().encode(value);
  if (process.env.NODE_ENV === "production") {
    // Fail closed: the dev fallback is public, so accepting tokens signed
    // with it in production would let anyone forge a session.
    console.error("JWT_SECRET is not set - rejecting all sessions");
    return null;
  }
  return new TextEncoder().encode(DEV_JWT_SECRET);
}

export type Role = "superadmin" | "admin" | "operator" | "warehouse";

// Warehouse staff get a slice of the portal: orders (+ the warehouse module
// from phase 5) and the app download page. Everything else is admin-only.
// This is a UX gate - FastAPI enforces the same per role.
const WAREHOUSE_PATHS = ["/orders", "/warehouse", "/app", "/change-password", "/api/orders", "/api/customers", "/api/products", "/api/my-client", "/stock", "/api/stock"];

export function homePath(role: Role): string {
  return role === "warehouse" ? "/warehouse" : "/dashboard";
}

export function isPathAllowed(role: Role, pathname: string): boolean {
  if (role === "operator") return false; // mobile only
  if (role === "warehouse") {
    return WAREHOUSE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  const superadminOnly = ["/clients", "/subscriptions", "/payments", "/announcements", "/audit", "/api/clients", "/api/subscriptions", "/api/plans", "/api/payments", "/api/superadmin", "/api/announcements", "/api/audit"];
  if (superadminOnly.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return role === "superadmin";
  return true;
}

export type SessionClaims = {
  sub: string;
  email: string;
  role: Role;
  client_id: string | null;
};

export async function verifyToken(token: string): Promise<SessionClaims | null> {
  const secret = getSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      role: payload.role as Role,
      client_id: (payload.client_id as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
