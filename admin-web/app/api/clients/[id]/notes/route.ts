import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(await backendFetch(`/clients/${id}/notes`));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return proxyJson(await backendFetch(`/clients/${id}/notes`, { method: "POST", body }));
}
