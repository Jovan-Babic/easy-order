import { backendFetch, proxyJson } from "@/lib/backend";

// The caller's own tenant (invoice header data), read-only.
export async function GET() {
  return proxyJson(await backendFetch("/clients/me"));
}
