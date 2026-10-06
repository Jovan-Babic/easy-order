import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const kind = req.nextUrl.searchParams.get("kind") === "client_logo" ? "client_logo" : "product";
  return proxyJson(await backendFetch(`/upload-image?kind=${kind}`, {
    method: "POST",
    body: formData,
  }));
}

export async function DELETE(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  return proxyJson(await backendFetch(`/upload-image?url=${encodeURIComponent(url)}`, { method: "DELETE" }));
}
