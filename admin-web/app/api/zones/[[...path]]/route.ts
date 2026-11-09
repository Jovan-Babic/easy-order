import { NextRequest } from "next/server";
import { backendFetch, proxyJson } from "@/lib/backend";

async function forward(req: NextRequest, params: Promise<{ path?: string[] }>) {
  const { path = [] } = await params;
  const target = `/zones${path.length ? "/" : ""}${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET" && req.method !== "DELETE";
  return proxyJson(await backendFetch(target, { method: req.method, ...(hasBody ? { body: await req.text() } : {}) }));
}

type Ctx = { params: Promise<{ path?: string[] }> };
export const GET = (req: NextRequest, { params }: Ctx) => forward(req, params);
export const POST = (req: NextRequest, { params }: Ctx) => forward(req, params);
export const PUT = (req: NextRequest, { params }: Ctx) => forward(req, params);
export const DELETE = (req: NextRequest, { params }: Ctx) => forward(req, params);
