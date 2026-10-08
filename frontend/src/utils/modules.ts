import type { User } from "@/src/api";

export type ModuleKey = "warehouse" | "stock" | "expiry" | "reports";

/** Whether the user's client has a module (backend `Module`; the base is always on).
 *  Superadmin and an older backend that sends no list count as "all". */
export function hasModule(user: User | null | undefined, module: ModuleKey): boolean {
  if (!user || user.role === "superadmin" || !user.modules) return true;
  return user.modules.includes(module);
}
