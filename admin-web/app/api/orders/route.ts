import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

// Forwards the list filters (status, from_date, to_date) to FastAPI.
export async function GET(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.set("portal", "true");
  return proxyJson(await backendFetch(`/orders?${params.toString()}`));
}
