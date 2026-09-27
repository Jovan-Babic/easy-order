import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/session";
import { backendFetch } from "@/lib/backend";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await backendFetch("/auth/change-password", { method: "POST", body });
  if (!res.ok) {
    return new NextResponse(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
  }

  // The backend bumps token_version on a password change, so the current
  // cookie is dead - swap in the fresh token it returns.
  const data = await res.json();
  const store = await cookies();
  store.set(COOKIE_NAME, data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return NextResponse.json({ user: data.user });
}
