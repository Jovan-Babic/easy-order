"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

// Below md the portal is for the superadmin only; everyone else works on a
// computer here and uses the Android app on the phone.
export function DesktopOnlyNotice() {
  const { t } = useLanguage();
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6 md:hidden">
      <div className="w-full max-w-sm rounded-lg bg-surfaceSecondary p-6 text-center shadow-sm">
        <p className="text-lg font-extrabold text-brand">Easy Order</p>
        <h1 className="mt-4 text-xl font-extrabold text-onSurface">{t("desktopOnlyTitle")}</h1>
        <p className="mt-2 text-sm text-onSurfaceSecondary">{t("desktopOnlyText")}</p>
        <button
          onClick={logout}
          className="mt-6 w-full rounded-md border border-border px-3 py-2 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary"
        >
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
