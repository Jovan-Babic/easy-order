"use client";

import { PaymentsPanel } from "@/components/PaymentsPanel";
import { useLanguage } from "@/lib/i18n";

export default function PaymentsPage() {
  const { t } = useLanguage();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">{t("payments")}</h1>
      <PaymentsPanel />
    </div>
  );
}
