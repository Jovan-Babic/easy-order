import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  return proxyJson(await backendFetch("/upload-image", {
    method: "POST",
    body: formData,
  }));
}

export async function DELETE(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  return proxyJson(await backendFetch(`/upload-image?url=${encodeURIComponent(url)}`, { method: "DELETE" }));
}
