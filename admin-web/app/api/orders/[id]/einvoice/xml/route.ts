import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backend";

// The UBL XML that was sent (or would be sent), for checking by hand.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await backendFetch(`/orders/${encodeURIComponent(id)}/einvoice/xml`);
  return new Response(await res.text(), {
    status: res.status,
    headers: { "Content-Type": res.ok ? "application/xml" : "application/json" },
  });
}
