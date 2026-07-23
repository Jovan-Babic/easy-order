import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET() {
  return proxyJson(await backendFetch("/customers"));
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyJson(await backendFetch("/customers", { method: "POST", body }));
}
