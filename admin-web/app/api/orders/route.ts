import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

// Forwards the list filters (status, from_date, to_date, q) and the page (limit, skip) to FastAPI, and the
// total number of matching orders (X-Total-Count) back.
export async function GET(req: NextRequest) {
  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.set("portal", "true");
  const res = await backendFetch(`/orders?${params.toString()}`);
  const out = await proxyJson(res);
  const total = res.headers.get("X-Total-Count");
  if (total) out.headers.set("X-Total-Count", total);
  return out;
}
