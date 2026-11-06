import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET(req: NextRequest) {
  return proxyJson(await backendFetch(`/integrations/sef${req.nextUrl.search}`));
}

export async function PUT(req: NextRequest) {
  const body = await req.text();
  return proxyJson(await backendFetch("/integrations/sef", { method: "PUT", body }));
}
