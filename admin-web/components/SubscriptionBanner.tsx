"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { formatDate } from "@/lib/billing";
import { useLanguage } from "@/lib/i18n";
import { money } from "@/lib/payments";
import { useSession } from "@/lib/session-provider";

// Tells a client's users that the subscription is about to end or has ended
// (the account is locked after the grace period). Clients on calendar billing
// get the charge instead: due, late (blocks on ...) or blocked. Nothing for the
// superadmin or for clients without a subscription.
export function SubscriptionBanner() {
  const { t } = useLanguage();
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const sub = session.subscription;
  const billing = session.billing;
  const isAdmin = session.role === "admin";
  const blocked = !!billing && sub?.status === "locked";

  // A blocked admin only has the billing page (the backend refuses the rest).
  useEffect(() => {
    if (blocked && isAdmin && !pathname.startsWith("/billing") && !pathname.startsWith("/change-password")) {
      router.replace("/billing");
    }
  }, [blocked, isAdmin, pathname, router]);

  if (!sub) return null;
  if (billing) {
    const amount = isAdmin && typeof billing.to_pay === "number" ? ` ${t("billingToPay")}: ${money(billing.to_pay)}.` : "";
    const link = isAdmin && !pathname.startsWith("/billing") ? (
      <Link href="/billing" className="ml-2 font-bold underline">
        {t("billingOpen")}
      </Link>
    ) : null;
    if (blocked) {
      return (
        <div className="mb-6 rounded-lg border border-error bg-red-50 p-4 text-sm text-error">
          {t(billing.lock_reason === "manual" ? "billingBlockedManual" : "billingBlocked")}
          {amount}
          {link}
        </div>
      );
    }
    if (billing.late) {
      return (
        <div className="mb-6 rounded-lg border border-warning bg-amber-50 p-4 text-sm text-warning">
          {t("billingLate")} <strong>{formatDate(billing.blocks_on)}</strong>.{amount}
          {link}
        </div>
      );
    }
    if (isAdmin && billing.next_due_date && (billing.to_pay ?? 0) > 0) {
      return (
        <div className="mb-6 rounded-lg border border-border bg-surfaceSecondary p-4 text-sm text-onSurface">
          {t("billingDue")} <strong>{formatDate(billing.next_due_date)}</strong>.{amount}
          {link}
        </div>
      );
    }
    return null;
  }
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
