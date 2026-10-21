import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET(req: NextRequest) {
  return proxyJson(await backendFetch(`/focus/report${req.nextUrl.search}`));
}
