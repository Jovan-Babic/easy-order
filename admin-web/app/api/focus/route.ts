import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET(req: NextRequest) {
  return proxyJson(await backendFetch(`/focus${req.nextUrl.search}`));
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyJson(await backendFetch("/focus", { method: "POST", body }));
}
