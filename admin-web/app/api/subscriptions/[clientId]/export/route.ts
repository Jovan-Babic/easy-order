import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";

// Downloads what the scheduled purge would delete, as a JSON file.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const res = await backendFetch(`/subscriptions/${clientId}/export`);
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      ...(res.ok ? { "Content-Disposition": `attachment; filename="export-${clientId}.json"` } : {}),
    },
  });
}
