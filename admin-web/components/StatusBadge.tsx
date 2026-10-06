"use client";

import { useLanguage } from "@/lib/i18n";
import { OrderStatus, STATUS_LABEL_KEYS } from "@/lib/orders";

const STYLES: Record<OrderStatus, string> = {
  new: "bg-surfaceTertiary text-onSurfaceTertiary",
  in_progress: "bg-amber-100 text-warning",
  shipped: "bg-brandSecondary text-success",
  rejected: "bg-red-100 text-error",
  canceled: "bg-surfaceTertiary text-muted",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useLanguage();
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STYLES[status] ?? STYLES.new}`}>
      {t(STATUS_LABEL_KEYS[status] ?? "statusNew")}
    </span>
  );
}
