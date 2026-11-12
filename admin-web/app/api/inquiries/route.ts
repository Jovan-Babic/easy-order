import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const query = status === "new" || status === "handled" ? `?status=${status}` : "";
  return proxyJson(await backendFetch(`/inquiries${query}`));
}
