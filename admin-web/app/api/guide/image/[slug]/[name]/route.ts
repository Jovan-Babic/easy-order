import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";

// Screenshots of the user guide: the browser asks the portal, the portal asks the backend.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  const res = await backendFetch(`/guide/image/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`);
  if (!res.ok) return new NextResponse(null, { status: res.status });
  return new NextResponse(await res.arrayBuffer(), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
