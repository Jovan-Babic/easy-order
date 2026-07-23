import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search;
  return proxyJson(await backendFetch(`/users${qs}`));
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyJson(await backendFetch("/users", { method: "POST", body }));
}
