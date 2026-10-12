import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await req.text();
  return proxyJson(await backendFetch(`/units/${encodeURIComponent(code)}`, { method: "PUT", body }));
}
