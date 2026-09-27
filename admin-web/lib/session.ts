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

export type Role = "superadmin" | "admin" | "operator";

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
