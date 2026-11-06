import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function POST(req: NextRequest) {
  return proxyJson(await backendFetch(`/integrations/sef/test${req.nextUrl.search}`, { method: "POST" }));
}
