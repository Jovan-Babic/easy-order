"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lang, TranslationKey, useLanguage } from "@/lib/i18n";

type NavUser = {
  name: string;
  email: string;
  role: "superadmin" | "admin";
};

const NAV_ITEMS: Array<{ href: string; labelKey: TranslationKey; roles: readonly string[] }> = [
  { href: "/dashboard", labelKey: "dashboard", roles: ["superadmin", "admin"] },
  { href: "/clients", labelKey: "clients", roles: ["superadmin"] },
  { href: "/users", labelKey: "users", roles: ["superadmin", "admin"] },
  { href: "/products", labelKey: "products", roles: ["superadmin", "admin"] },
  { href: "/customers", labelKey: "customers", roles: ["superadmin", "admin"] },
  { href: "/orders", labelKey: "orders", roles: ["superadmin", "admin"] },
  { href: "/app", labelKey: "app", roles: ["superadmin", "admin"] },
];

const showAppMenu = process.env.NEXT_PUBLIC_SHOW_APP_MENU === "true";

export function Sidebar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-screen w-60 flex-shrink-0 flex-col border-r border-border bg-surfaceSecondary">
      <div className="px-5 py-6">
        <p className="text-lg font-extrabold text-brand">Easy Order</p>
        <p className="text-xs text-muted">{t("adminPortal")}</p>
      </div>
      <nav className="flex-1 px-3">
        {NAV_ITEMS.filter((item) => {
          if (item.href === "/app" && !showAppMenu) {
            return false;
          }
          return item.roles.includes(user.role);
        }).map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-1 block rounded-md px-3 py-2 text-sm font-semibold ${
                active ? "bg-brandSecondary text-brand" : "text-onSurfaceSecondary hover:bg-surfaceTertiary"
              }`}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-4">
        <div className="mb-3">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">{t("language")}</label>
          <select
            value={lang}
            onChange={(event) => setLang(event.target.value as Lang)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-onSurface"
          >
            <option value="sr">SR</option>
            <option value="en">EN</option>
          </select>
        </div>
        <p className="truncate text-sm font-semibold text-onSurface">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
        <p className="mb-3 text-xs uppercase text-muted">{user.role}</p>
        <button
          onClick={logout}
          className="w-full rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary"
        >
          {t("logout")}
        </button>
      </div>
    </aside>
  );
}
