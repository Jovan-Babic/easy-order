"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type NavUser = {
  name: string;
  email: string;
  role: "superadmin" | "admin";
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", roles: ["superadmin", "admin"] },
  { href: "/clients", label: "Clients", roles: ["superadmin"] },
  { href: "/users", label: "Users", roles: ["superadmin", "admin"] },
  { href: "/products", label: "Products", roles: ["superadmin", "admin"] },
  { href: "/customers", label: "Customers", roles: ["superadmin", "admin"] },
  { href: "/orders", label: "Orders", roles: ["superadmin", "admin"] },
] as const;

export function Sidebar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-screen w-60 flex-shrink-0 flex-col border-r border-border bg-surfaceSecondary">
      <div className="px-5 py-6">
        <p className="text-lg font-extrabold text-brand">Easy Order</p>
        <p className="text-xs text-muted">Admin portal</p>
      </div>
      <nav className="flex-1 px-3">
        {NAV_ITEMS.filter((item) => (item.roles as readonly string[]).includes(user.role)).map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-1 block rounded-md px-3 py-2 text-sm font-semibold ${
                active ? "bg-brandSecondary text-brand" : "text-onSurfaceSecondary hover:bg-surfaceTertiary"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-4">
        <p className="truncate text-sm font-semibold text-onSurface">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
        <p className="mb-3 text-xs uppercase text-muted">{user.role}</p>
        <button
          onClick={logout}
          className="w-full rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
