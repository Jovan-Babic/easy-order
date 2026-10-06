import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params = new URLSearchParams();
  params.set("dry_run", req.nextUrl.searchParams.get("dry_run") === "false" ? "false" : "true");
  const clientId = req.nextUrl.searchParams.get("client_id");
  if (clientId) params.set("client_id", clientId);
  return proxyJson(await backendFetch(`/customers/import?${params}`, { method: "POST", body: formData }));
}
