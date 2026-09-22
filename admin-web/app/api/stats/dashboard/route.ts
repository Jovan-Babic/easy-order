import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams.toString();
  return proxyJson(await backendFetch(`/stats/dashboard${params ? `?${params}` : ""}`));
}
