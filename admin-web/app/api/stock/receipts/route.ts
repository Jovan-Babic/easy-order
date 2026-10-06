import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyJson(await backendFetch("/stock/receipts", { method: "POST", body }));
}
