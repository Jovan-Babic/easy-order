"use client";

import { useLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";

// Tells a client's users that the subscription is about to end or has ended
// (the account is locked after the grace period). Nothing for superadmin or
// for clients without a subscription.
export function SubscriptionBanner() {
  const { t } = useLanguage();
  const sub = useSession().subscription;
  if (!sub) return null;
  if (sub.status === "grace") {
    return (
      <div className="mb-6 rounded-lg border border-warning bg-amber-50 p-4 text-sm text-warning">
        {t("bannerGrace")} <strong>{sub.grace_ends_at}</strong>. {t("bannerContact")}
      </div>
    );
  }
  if (sub.status === "active" && typeof sub.days_left === "number" && sub.days_left <= 14) {
    return (
      <div className="mb-6 rounded-lg border border-warning bg-amber-50 p-4 text-sm text-warning">
        {t("bannerEndsSoon")} <strong>{sub.days_left}</strong> {t("bannerDays")} ({sub.ends_at}). {t("bannerContact")}
      </div>
    );
  }
  return null;
}
