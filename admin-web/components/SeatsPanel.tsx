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
        <table className="w-full text-left text-sm">
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
                <td className={`px-4 py-3 text-right ${r.limit !== null && r.used >= r.limit ? "font-bold text-warning" : "text-onSurface"}`}>
                  {r.used}
                </td>
                <td className="px-4 py-3 text-right text-onSurfaceSecondary">{r.included ?? "-"}</td>
                <td className="px-4 py-3 text-right text-onSurfaceSecondary">{r.extra}</td>
                <td className="px-4 py-3 text-right text-onSurface">{r.limit ?? t("seatsUnlimited")}</td>
                <td className="px-4 py-3 text-right text-onSurfaceSecondary">{r.price !== null ? money(r.price, data.currency) : "-"}</td>
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

const nextMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
};

// Preview first, then confirm: creates the monthly debt (package + extra accounts).
export function ChargeMonthDialog({ clientId, onClose, onDone }: { clientId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [month, setMonth] = useState(nextMonth());
  const [due, setDue] = useState("");
  const [preview, setPreview] = useState<ChargePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const { busy, error, send } = useSubmit(onDone);

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    let current = true;
    fetch(`/api/clients/${clientId}/charge-month?month=${month}`).then(async (res) => {
      if (!current) return;
      if (res.ok) {
        setPreview(await res.json());
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(await detailOf(res, t("loadFailed")));
      }
    });
    return () => {
      current = false;
    };
  }, [clientId, month, t]);

  return (
    <Modal title={t("chargeMonth")} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(`/api/clients/${clientId}/charge-month`, "POST", { month, due_date: due });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold text-onSurface">
            {t("chargeMonthLabel")}
            <input required type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="text-sm font-semibold text-onSurface">
            {t("payDueDate")}
            <input required type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${input} mt-1`} />
          </label>
        </div>
        {previewError && <p className="text-sm text-error">{previewError}</p>}
        {preview && (
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 rounded-md bg-surface p-3 text-sm">
            <dt className="text-muted">{t("seatsPackagePrice")}</dt>
            <dd className="text-right text-onSurface">{money(preview.breakdown.package, preview.currency)}</dd>
            {preview.breakdown.seats.map((s) => (
              <div key={s.role} className="contents">
                <dt className="text-muted">
                  {t(ROLE_KEYS[s.role])} × {s.extra}
                </dt>
                <dd className="text-right text-onSurface">{money(s.amount, preview.currency)}</dd>
              </div>
            ))}
            {preview.breakdown.discount_percent > 0 && (
              <>
                <dt className="text-muted">{t("seatsDiscount")}</dt>
                <dd className="text-right text-onSurface">{preview.breakdown.discount_percent}%</dd>
              </>
            )}
            <dt className="font-bold text-onSurface">{t("seatsMonthlyTotal")}</dt>
            <dd className="text-right font-bold text-onSurface">{money(preview.total, preview.currency)}</dd>
          </dl>
        )}
        {preview?.already_charged && <p className="text-sm text-warning">{t("chargeMonthAlready")}</p>}
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondary}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={busy || !preview || preview.already_charged || !due} className={primary}>
            {t("chargeMonth")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
