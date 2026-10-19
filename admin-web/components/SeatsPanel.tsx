"use client";

import { useEffect, useState } from "react";
import { Modal, input, primary, secondary, useSubmit } from "@/components/SubscriptionDialogs";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { money } from "@/lib/payments";
import { ChargePreview, SEAT_ROLES, SeatRole, SeatsOut } from "@/lib/seats";
import { detailOf } from "@/lib/subscriptions";

export const ROLE_KEYS: Record<SeatRole, TranslationKey> = {
  admin: "userRoleAdmin",
  warehouse: "userRoleWarehouse",
  operator: "userRoleOperator",
};

// Accounts used / allowed per role and the monthly amount. Shared by the
// superadmin's client tab and the client admin's own page.
export function SeatsSummary({ data }: { data: SeatsOut }) {
  const { t } = useLanguage();
  if (!data.plan_name) return <p className="text-muted">{t("seatsNoPlan")}</p>;
  return (
    <div>
      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="rtable w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">{t("role")}</th>
              <th className="px-4 py-3 text-right">{t("seatsUsed")}</th>
              <th className="px-4 py-3 text-right">{t("seatsIncluded")}</th>
              <th className="px-4 py-3 text-right">{t("seatsExtra")}</th>
              <th className="px-4 py-3 text-right">{t("seatsLimit")}</th>
              <th className="px-4 py-3 text-right">{t("seatsPrice")}</th>
            </tr>
          </thead>
          <tbody>
            {data.seats.map((r) => (
              <tr key={r.role} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-onSurface">{t(ROLE_KEYS[r.role])}</td>
                <td data-label={t("seatsUsed")} className={`px-4 py-3 text-right ${r.limit !== null && r.used >= r.limit ? "font-bold text-warning" : "text-onSurface"}`}>
                  {r.used}
                </td>
                <td data-label={t("seatsIncluded")} className="px-4 py-3 text-right text-onSurfaceSecondary">{r.included ?? "-"}</td>
                <td data-label={t("seatsExtra")} className="px-4 py-3 text-right text-onSurfaceSecondary">{r.extra}</td>
                <td data-label={t("seatsLimit")} className="px-4 py-3 text-right text-onSurface">{r.limit ?? t("seatsUnlimited")}</td>
                <td data-label={t("seatsPrice")} className="px-4 py-3 text-right text-onSurfaceSecondary">{r.price !== null ? money(r.price, data.currency) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 grid max-w-sm grid-cols-[1fr_auto] gap-y-1 text-sm">
        <dt className="text-muted">{t("seatsPackagePrice")}</dt>
        <dd className="text-right text-onSurface">{data.package_price !== null ? money(data.package_price, data.currency) : "-"}</dd>
        <dt className="text-muted">{t("seatsExtraAmount")}</dt>
        <dd className="text-right text-onSurface">{money(data.extra_amount, data.currency)}</dd>
        {data.discount_percent > 0 && (
          <>
            <dt className="text-muted">{t("seatsDiscount")}</dt>
            <dd className="text-right text-onSurface">{data.discount_percent}%</dd>
          </>
        )}
        <dt className="font-bold text-onSurface">{t("seatsMonthlyTotal")}</dt>
        <dd className="text-right font-bold text-onSurface">{data.monthly_total !== null ? money(data.monthly_total, data.currency) : "-"}</dd>
      </dl>
    </div>
  );
}

export function SeatsEditDialog({
  clientId,
  data,
  onClose,
  onDone,
}: {
  clientId: string;
  data: SeatsOut;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [extra, setExtra] = useState<Record<string, string>>(
    Object.fromEntries(SEAT_ROLES.map((r) => [r, String(data.seats.find((s) => s.role === r)?.extra ?? 0)]))
  );
  const [discount, setDiscount] = useState(String(data.discount_percent || 0));
  const { busy, error, send } = useSubmit(onDone);
  const roles = SEAT_ROLES.filter((r) => data.seats.some((s) => s.role === r));
  return (
    <Modal title={t("seatsEdit")} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(`/api/subscriptions/${clientId}/seats`, "PUT", {
            extra_seats: Object.fromEntries(roles.map((r) => [r, Math.max(0, Math.floor(Number(extra[r]) || 0))])),
            discount_percent: Number(discount) || 0,
          });
        }}
      >
        <p className="text-xs text-muted">{t("seatsEditHint")}</p>
        <div className="grid grid-cols-3 gap-3">
          {roles.map((r) => (
            <label key={r} className="text-xs font-semibold text-onSurfaceSecondary">
              {t(ROLE_KEYS[r])}
              <input type="number" min="0" step="1" value={extra[r]} onChange={(e) => setExtra({ ...extra, [r]: e.target.value })} className={`${input} mt-1`} />
            </label>
          ))}
        </div>
        <label className="text-sm font-semibold text-onSurface">
          {t("seatsDiscount")}
          <input type="number" min="0" max="100" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${input} mt-1`} />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondary}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={busy} className={primary}>
            {t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
