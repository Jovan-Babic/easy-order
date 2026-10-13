import { NextRequest, NextResponse } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

// The IPS QR the client sees, for checking it from the superadmin side.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await backendFetch(`/billing/clients/${id}/qr.png`);
  if (!res.ok) return proxyJson(res);
  return new NextResponse(await res.arrayBuffer(), { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
}
