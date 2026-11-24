import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

// Forwards the period (from_date, to_date) to FastAPI.
export async function GET(req: NextRequest) {
  const params = new URLSearchParams();
  for (const key of ["from_date", "to_date"]) {
    const value = req.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return proxyJson(await backendFetch(`/stats/overview${query ? `?${query}` : ""}`));
}
