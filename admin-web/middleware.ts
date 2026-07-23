import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session || session.role === "operator") {
    // admin-web is SuperAdmin/Admin only - Operators only get the mobile
    // app, and their login never gets a cookie set here in the first place,
    // but this also covers an expired/invalid/tampered cookie.
    if (isApi) {
      return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const isSuperAdminOnly = pathname.startsWith("/clients") || pathname.startsWith("/api/clients");
  if (isSuperAdminOnly && session.role !== "superadmin") {
    // Also enforced server-side by the FastAPI route guard as defense in
    // depth - this is a UX redirect, not the only gate.
    if (isApi) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
