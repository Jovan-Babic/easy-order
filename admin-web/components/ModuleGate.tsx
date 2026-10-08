"use client";

import { useLanguage } from "@/lib/i18n";
import { useHasModule } from "@/lib/session-provider";

// Page-level guard for a module: the sidebar hides the entry, this covers a
// typed URL or a bookmark. The backend refuses the data anyway (403).
export function ModuleGate({ module, children }: { module: string; children: React.ReactNode }) {
  const { t } = useLanguage();
  const enabled = useHasModule(module);
  if (!enabled) {
    return (
      <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
        <p className="font-semibold text-onSurface">{t("moduleNotEnabled")}</p>
        <p className="mt-1 text-sm text-muted">{t("moduleNotEnabledHint")}</p>
      </div>
    );
  }
  return <>{children}</>;
}
