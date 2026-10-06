import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return proxyJson(await backendFetch(`/orders/${id}/items`, { method: "PATCH", body }));
}
