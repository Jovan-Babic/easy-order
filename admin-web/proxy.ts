import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, homePath, isPathAllowed, verifyToken } from "@/lib/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session || session.role === "operator") {
    // Operators only get the mobile app, and their login never gets a
    // cookie set here in the first place, but this also covers an
    // expired/invalid/tampered cookie.
    if (isApi) {
      return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (!isPathAllowed(session.role, pathname)) {
    // Also enforced server-side by the FastAPI route guards as defense in
    // depth - this is a UX redirect, not the only gate.
    if (isApi) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = homePath(session.role);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|forgot-password|reset-password|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
