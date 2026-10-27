import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function PUT(req: NextRequest) {
  const body = await req.text();
  return proxyJson(await backendFetch("/targets", { method: "PUT", body }));
}
