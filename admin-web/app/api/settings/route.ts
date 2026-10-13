import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET() {
  return proxyJson(await backendFetch("/settings"));
}

export async function PUT(req: NextRequest) {
  const body = await req.text();
  return proxyJson(await backendFetch("/settings", { method: "PUT", body }));
}
