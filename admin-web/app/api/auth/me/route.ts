import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET() {
  return proxyJson(await backendFetch("/auth/me"));
}
