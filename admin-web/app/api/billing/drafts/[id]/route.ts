import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return proxyJson(await backendFetch(`/billing/drafts/${id}`, { method: "PUT", body }));
}
