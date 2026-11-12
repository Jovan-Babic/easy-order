import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/api";

// A fresh captcha challenge for the contact form (never cached).
export const dynamic = "force-dynamic";

export async function GET() {
  const base = backendUrl();
  if (!base) return NextResponse.json({ detail: "Not configured" }, { status: 503 });
  try {
    const res = await fetch(`${base}/api/public/challenge`, { cache: "no-store" });
    const out = await res.json().catch(() => ({}));
    return NextResponse.json(out, { status: res.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
