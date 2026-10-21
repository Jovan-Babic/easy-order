"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Lang, TranslationKey, useLanguage } from "@/lib/i18n";

type NavUser = {
  name: string;
  email: string;
  role: "superadmin" | "admin" | "warehouse";
  modules?: string[];
};

const NAV_ITEMS: Array<{ href: string; labelKey: TranslationKey; roles: readonly string[]; module?: string }> = [
  { href: "/dashboard", labelKey: "dashboard", roles: ["superadmin", "admin"] },
  { href: "/clients", labelKey: "clients", roles: ["superadmin"] },
  { href: "/subscriptions", labelKey: "subscriptions", roles: ["superadmin"] },
  { href: "/payments", labelKey: "payments", roles: ["superadmin"] },
  { href: "/billing-drafts", labelKey: "draftsTitle", roles: ["superadmin"] },
  { href: "/users", labelKey: "users", roles: ["superadmin", "admin"] },
  { href: "/seats", labelKey: "seatsTitle", roles: ["admin"] },
  { href: "/billing", labelKey: "billingTitle", roles: ["admin"] },
  { href: "/announcements", labelKey: "announcements", roles: ["superadmin"] },
  { href: "/audit", labelKey: "audit", roles: ["superadmin"] },
  { href: "/units", labelKey: "units", roles: ["superadmin"] },
  { href: "/settings", labelKey: "settings", roles: ["superadmin"] },
  // The system owner doesn't work with a client's business data (products,
  // customers, orders, warehouse, stock, reports): those pages stay reachable
  // by URL, they just aren't in the menu.
  { href: "/products", labelKey: "products", roles: ["admin"] },
  { href: "/customers", labelKey: "customers", roles: ["admin"] },
  { href: "/warehouse", labelKey: "warehouse", roles: ["admin", "warehouse"], module: "warehouse" },
  { href: "/reports", labelKey: "reports", roles: ["admin"], module: "reports" },
  { href: "/focus", labelKey: "focus", roles: ["admin"], module: "focus" },
  { href: "/stock", labelKey: "stock", roles: ["admin", "warehouse"], module: "stock" },
  { href: "/orders", labelKey: "orders", roles: ["admin", "warehouse"] },
  { href: "/app", labelKey: "app", roles: ["superadmin", "admin", "warehouse"] },
];

const showAppMenu = process.env.NEXT_PUBLIC_SHOW_APP_MENU === "true";

export function Sidebar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  // Phones: the menu is a drawer behind the ☰ button in a top bar; from md up it is always shown.
  const [open, setOpen] = useState(false);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const items = NAV_ITEMS.filter((item) => {
    if (item.href === "/app" && !showAppMenu && user.role !== "superadmin") {
      return false;
    }
    if (item.module && user.role !== "superadmin" && !(user.modules ?? []).includes(item.module)) {
      return false;
    }
    return item.roles.includes(user.role);
  });
  const current = items.find((item) => pathname.startsWith(item.href));

  return (
    <>
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surfaceSecondary px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("menu")}
          className="-ml-1 rounded-md p-1.5 text-onSurface hover:bg-surfaceTertiary"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <p className="truncate text-base font-extrabold text-brand">{current ? t(current.labelKey) : "Easy Order"}</p>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surfaceSecondary transition-transform duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:w-60 md:flex-shrink-0 md:translate-x-0 ${
          open ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between px-5 py-6">
          <div>
            <p className="text-lg font-extrabold text-brand">Easy Order</p>
            <p className="text-xs text-muted">{t("adminPortal")}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("close")}
            className="-mr-2 rounded-md p-1.5 text-muted hover:bg-surfaceTertiary md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
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
          <Link
            href="/change-password"
            onClick={() => setOpen(false)}
            className="mb-2 block w-full rounded-md border border-border px-3 py-1.5 text-center text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary"
          >
            {t("changePassword")}
          </Link>
          <button
            onClick={logout}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary"
          >
            {t("logout")}
          </button>
        </div>
      </aside>
    </>
  );
}
