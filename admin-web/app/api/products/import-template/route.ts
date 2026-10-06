import { NextResponse } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

export async function GET() {
  const res = await backendFetch("/products/import-template");
  if (!res.ok) return proxyJson(res);
  return new NextResponse(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "Content-Disposition": 'attachment; filename="uvoz-artikala.xlsx"',
    },
  });
}
