import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/api";

const MAX_BODY = 10_000;

// The contact form posts here; the message goes on to the backend (POST /api/public/contact), which
// validates it, applies the limits and stores it. The browser never talks to the backend directly.
export async function POST(req: NextRequest) {
  const base = backendUrl();
  if (!base) return NextResponse.json({ detail: "Not configured" }, { status: 503 });
  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ detail: "Too large" }, { status: 413 });
  try {
    const res = await fetch(`${base}/api/public/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    const out = await res.json().catch(() => ({}));
    return NextResponse.json(out, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
