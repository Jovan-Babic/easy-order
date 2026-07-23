import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/session";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return new NextResponse(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  }

  const data = await res.json();

  if (data.user?.role === "operator") {
    // admin-web is explicitly the SuperAdmin/Admin portal - Operators only
    // get the mobile app. Don't set a cookie for a role that middleware
    // would reject on every request anyway.
    return NextResponse.json({ detail: "Operators must use the mobile app" }, { status: 403 });
  }

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
