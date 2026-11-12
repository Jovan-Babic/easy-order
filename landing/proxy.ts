import { NextRequest, NextResponse } from "next/server";

// "/" (and any path that doesn't start with a language) is the Serbian site, served from /sr
// without showing it in the address; "/sr/..." itself redirects to the clean address.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/en" || pathname.startsWith("/en/")) return NextResponse.next();
  const url = req.nextUrl.clone();
  if (pathname === "/sr" || pathname.startsWith("/sr/")) {
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url);
  }
  url.pathname = `/sr${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Not for the API, Next's own files, metadata routes and anything with a file extension (images, icons).
  matcher: ["/((?!api|_next|sitemap.xml|robots.txt|.*\\..*).*)"],
};
