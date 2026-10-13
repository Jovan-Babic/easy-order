"use client";

import { ROLE_KEYS } from "@/components/SeatsPanel";
import { ChargeLine, LedgerCharge } from "@/lib/billing";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { money } from "@/lib/payments";
import type { SeatRole } from "@/lib/seats";

export function useLineLabel() {
  const { t } = useLanguage();
  return (line: ChargeLine) => {
    if (line.kind === "seats" || line.kind === "seats_prorated") {
      const role = t(ROLE_KEYS[(line.role ?? "operator") as SeatRole] ?? ("userRoleOperator" as TranslationKey));
      const months = line.months && line.months > 1 ? ` × ${line.months} ${t("billingMonths")}` : "";
      const what = line.kind === "seats_prorated" ? t("billingSeatsToYearEnd") : t("billingExtraSeats");
      return `${what}: ${role} ${line.qty} × ${money(line.unit_price ?? 0)}${months}`;
    }
    if (line.kind === "discount") return `${t("seatsDiscount")} ${line.label}`;
    if (line.kind === "free") return t("billingFreeMonth");
    return line.label;
  };
}

// Lines of one charge with its total, what was paid and what is left.
export function ChargeLinesTable({ charge, showPaid = true }: { charge: LedgerCharge; showPaid?: boolean }) {
  const { t } = useLanguage();
  const lineLabel = useLineLabel();
  return (
    <table className="w-full text-sm">
      <tbody>
        {charge.lines.map((line, i) => (
          <tr key={i}>
            <td className="py-1 text-onSurfaceSecondary">{lineLabel(line)}</td>
            <td className="py-1 text-right text-onSurface">{money(line.amount)}</td>
          </tr>
        ))}
        {charge.note && (
          <tr>
            <td colSpan={2} className="py-1 text-xs text-muted">{charge.note}</td>
          </tr>
        )}
        <tr className="border-t border-border font-bold">
          <td className="py-1">{t("billingChargeTotal")}</td>
          <td className="py-1 text-right">{money(charge.amount)}</td>
        </tr>
        {showPaid && charge.paid > 0 && (
          <tr>
            <td className="py-1 text-success">{t("billingPaid")}</td>
            <td className="py-1 text-right text-success">−{money(charge.paid)}</td>
          </tr>
        )}
        {showPaid && (
          <tr className="font-bold">
            <td className="py-1">{t("billingOpenAmount")}</td>
            <td className="py-1 text-right">{money(charge.open)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
