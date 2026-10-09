import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const month = req.nextUrl.searchParams.get("month") || "";
  return proxyJson(await backendFetch(`/clients/${id}/charge-month?month=${encodeURIComponent(month)}`));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return proxyJson(await backendFetch(`/clients/${id}/charge-month`, { method: "POST", body }));
}
