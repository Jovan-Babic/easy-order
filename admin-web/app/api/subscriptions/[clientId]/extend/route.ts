import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const body = await req.text();
  return proxyJson(await backendFetch(`/subscriptions/${clientId}/extend`, { method: "POST", body }));
}
