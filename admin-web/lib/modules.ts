// Optional modules a client can have (backend: Module enum, PLAN_MODULI.md).
// The base (catalog, customers, orders, invoice, Excel import) is always on.
import type { TranslationKey } from "@/lib/i18n";

export type ModuleKey = "warehouse" | "stock" | "expiry" | "reports" | "focus" | "targets";

export const MODULES: Array<{
  key: ModuleKey;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  requires: ModuleKey[];
}> = [
  { key: "warehouse", labelKey: "moduleWarehouse", descKey: "moduleWarehouseDesc", requires: [] },
  { key: "stock", labelKey: "moduleStock", descKey: "moduleStockDesc", requires: ["warehouse"] },
  { key: "expiry", labelKey: "moduleExpiry", descKey: "moduleExpiryDesc", requires: ["stock"] },
  { key: "reports", labelKey: "moduleReports", descKey: "moduleReportsDesc", requires: [] },
  { key: "focus", labelKey: "moduleFocus", descKey: "moduleFocusDesc", requires: [] },
  { key: "targets", labelKey: "moduleTargets", descKey: "moduleTargetsDesc", requires: [] },
];

export const ALL_MODULES: ModuleKey[] = MODULES.map((m) => m.key);

// Turning a module on also turns on what it needs; turning one off also turns off what needs it.
export function toggleModule(current: string[], key: ModuleKey, on: boolean): string[] {
  const next = new Set(current);
  if (on) {
    const add = (k: ModuleKey) => {
      next.add(k);
      MODULES.find((m) => m.key === k)?.requires.forEach(add);
    };
    add(key);
  } else {
    const drop = (k: ModuleKey) => {
      next.delete(k);
      MODULES.filter((m) => m.requires.includes(k)).forEach((m) => drop(m.key));
    };
    drop(key);
  }
  return ALL_MODULES.filter((k) => next.has(k));
}
