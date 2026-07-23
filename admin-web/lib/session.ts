import { jwtVerify } from "jose";

export const COOKIE_NAME = process.env.COOKIE_NAME || "eo_session";

// Must match backend/server.py's JWT_SECRET - the backend issues the token,
// this app only verifies/reads it (never re-signs one of its own).
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-insecure-secret-change-me",
);

export type Role = "superadmin" | "admin" | "operator";

export type SessionClaims = {
  sub: string;
  email: string;
  role: Role;
  client_id: string | null;
};

export async function verifyToken(token: string): Promise<SessionClaims | null> {
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
