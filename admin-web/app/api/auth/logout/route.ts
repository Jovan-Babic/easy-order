import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/session";
import { backendFetch } from "@/lib/backend";

export async function POST() {
  try {
    await backendFetch("/auth/logout", { method: "POST" });
  } catch {
    // stateless JWT - nothing server-side to worry about if this fails
  }
  const store = await cookies();
  store.delete(COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
