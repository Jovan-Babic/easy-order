import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  return proxyJson(await backendFetch(`/customers/${id}`, { method: "PUT", body }));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyJson(await backendFetch(`/customers/${id}`, { method: "DELETE" }));
}
