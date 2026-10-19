import { redirect } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { Sidebar } from "@/components/Sidebar";
import { DesktopOnlyNotice } from "@/components/DesktopOnlyNotice";
import { SessionProvider } from "@/lib/session-provider";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const res = await backendFetch("/auth/me");
  if (!res.ok) {
    // Middleware already guards this in practice; this is defense in depth
    // for the case where the cookie decodes but the user is gone (e.g. an
    // in-memory backend restart wiped it).
    redirect("/login");
  }
  const user = await res.json();
  if (user.must_change_password) {
    // Invited user (or password set by an admin): the backend rejects every
    // business call until the temporary password is replaced.
    redirect("/change-password?required=1");
  }

  const phoneAllowed = user.role === "superadmin";

  return (
    <SessionProvider user={user}>
      {/* On phones the portal is for the superadmin only (PWA); the others use it on a computer and the Android app on the phone. */}
      {!phoneAllowed && <DesktopOnlyNotice />}
      <div className={phoneAllowed ? "md:flex" : "hidden md:flex"}>
        <Sidebar user={user} />
        <main className="min-h-screen min-w-0 flex-1 bg-surface p-4 md:p-8">
          <AnnouncementBanner />
          <SubscriptionBanner />
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}
