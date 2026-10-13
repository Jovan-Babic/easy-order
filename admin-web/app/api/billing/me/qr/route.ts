import { NextResponse } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

// IPS QR (PNG) for what the client owes now.
export async function GET() {
  const res = await backendFetch("/billing/me/qr.png");
  if (!res.ok) return proxyJson(res);
  return new NextResponse(await res.arrayBuffer(), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
