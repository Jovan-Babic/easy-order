import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { Sidebar } from "@/components/Sidebar";
import { SessionProvider } from "@/lib/session-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const res = await backendFetch("/auth/me");
  if (!res.ok) {
    // Middleware already guards this in practice; this is defense in depth
    // for the case where the cookie decodes but the user is gone (e.g. an
    // in-memory backend restart wiped it).
    redirect("/login");
  }
  const user = await res.json();

  return (
    <SessionProvider user={user}>
      <div className="flex">
        <Sidebar user={user} />
        <main className="min-h-screen flex-1 bg-surface p-8">{children}</main>
      </div>
    </SessionProvider>
  );
}
