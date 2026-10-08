"use client";

import { useLanguage } from "@/lib/i18n";
import { useSession } from "@/lib/session-provider";

// Messages from the system owner (e.g. planned maintenance), for a client's users.
export function AnnouncementBanner() {
  const { lang } = useLanguage();
  const items = useSession().announcements ?? [];
  if (items.length === 0) return null;
  return (
    <>
      {items.map((a) => (
        <div
          key={a.id}
          className={`mb-4 rounded-lg border p-4 text-sm ${
            a.level === "warning" ? "border-warning bg-amber-50 text-warning" : "border-border bg-surfaceSecondary text-onSurface"
          }`}
        >
          {lang === "en" ? a.message_en : a.message_sr}
        </div>
      ))}
    </>
  );
}
