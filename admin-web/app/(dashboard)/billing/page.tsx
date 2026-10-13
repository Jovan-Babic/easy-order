"use client";

import { useEffect, useState } from "react";
import { ROLE_KEYS } from "@/components/SeatsPanel";
import { BillingMe, ChargeLine, formatAccount, formatDate } from "@/lib/billing";
import { localizedDetail } from "@/lib/errors";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { money } from "@/lib/payments";
import type { SeatRole } from "@/lib/seats";

const card = "rounded-lg bg-surfaceSecondary p-6 shadow-sm";

function useLineLabel() {
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

// The client's admin: what is owed, the charges (pro-forma number, lines, due date),
// payment details with the IPS QR code, and the history. Reachable while blocked.
export default function BillingPage() {
  const { t, lang } = useLanguage();
  const lineLabel = useLineLabel();
  const [data, setData] = useState<BillingMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/me").then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (res.ok) setData(body);
      else setError(localizedDetail(body.detail, t, t("loadFailed")));
    });
  }, [t]);

  if (error) return <p className="text-error">{error}</p>;
  if (!data) return <p className="text-muted">{t("loading")}</p>;
  const open = data.charges.filter((c) => c.open > 0);
  const instructions = lang === "en" ? data.instructions_en || data.instructions_sr : data.instructions_sr;

  return (
    <div className="grid max-w-4xl gap-6">
      <h1 className="text-2xl font-extrabold text-onSurface">{t("billingTitle")}</h1>

      <div className={`${card} grid gap-6 sm:grid-cols-[1fr_auto]`}>
        <div>
          <p className="text-xs font-semibold uppercase text-muted">{t("billingToPay")}</p>
          <p className={`mt-1 text-3xl font-extrabold ${data.to_pay > 0 ? "text-onSurface" : "text-success"}`}>{money(data.to_pay)}</p>
          {data.next_due_date && (
            <p className="mt-1 text-sm text-onSurfaceSecondary">
              {t("payDueDate")}: <strong>{formatDate(data.next_due_date)}</strong>
            </p>
          )}
          {data.credit > 0 && <p className="mt-1 text-sm text-success">{t("billingCredit")}: {money(data.credit)}</p>}
          <p className="mt-3 text-xs text-muted">
            {t("billingEstimate")}: {money(data.monthly_estimate)}
          </p>
          {(instructions || data.ips.account) && (
            <div className="mt-4 border-t border-border pt-4 text-sm text-onSurface">
              <p className="mb-2 font-bold">{t("billingPaymentDetails")}</p>
              {data.ips.recipient && <p>{t("setIpsRecipient")}: {data.ips.recipient}</p>}
              {data.ips.account && <p>{t("setIssuerAccount")}: {formatAccount(data.ips.account)}</p>}
              {data.ips.purpose && <p>{t("setIpsPurpose")}: {data.ips.purpose}</p>}
              {data.ips.reference && <p>{t("billingReference")}: {data.ips.reference}</p>}
              {instructions && <p className="mt-2 whitespace-pre-line text-onSurfaceSecondary">{instructions}</p>}
            </div>
          )}
        </div>
        {data.ips.available && data.to_pay > 0 && (
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/billing/me/qr" alt="IPS QR" width={200} height={200} className="mx-auto" />
            <p className="mt-1 text-xs text-muted">{t("billingQrHint")}</p>
          </div>
        )}
      </div>

      <div className={card}>
        <h2 className="mb-3 text-lg font-bold text-onSurface">{t("billingOpenCharges")}</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted">{t("billingNothingOpen")}</p>
        ) : (
          <div className="grid gap-4">
            {open.map((c) => (
              <div key={c.id} className="rounded-md border border-border p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold text-onSurface">
                    {c.number} · {formatDate(c.period_start)} - {formatDate(c.period_end)}
                  </p>
                  <p className="text-sm text-onSurfaceSecondary">
                    {t("payDueDate")}: {formatDate(c.due_date)}
                  </p>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {c.lines.map((line, i) => (
                      <tr key={i}>
                        <td className="py-1 text-onSurfaceSecondary">{lineLabel(line)}</td>
                        <td className="py-1 text-right text-onSurface">{money(line.amount)}</td>
                      </tr>
                    ))}
                    {c.note && (
                      <tr>
                        <td colSpan={2} className="py-1 text-xs text-muted">{c.note}</td>
                      </tr>
                    )}
                    <tr className="border-t border-border font-bold">
                      <td className="py-1">{t("billingChargeTotal")}</td>
                      <td className="py-1 text-right">{money(c.amount)}</td>
                    </tr>
                    {c.paid > 0 && (
                      <tr>
                        <td className="py-1 text-success">{t("billingPaid")}</td>
                        <td className="py-1 text-right text-success">−{money(c.paid)}</td>
                      </tr>
                    )}
                    <tr className="font-bold">
                      <td className="py-1">{t("billingOpenAmount")}</td>
                      <td className="py-1 text-right">{money(c.open)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={card}>
        <h2 className="mb-3 text-lg font-bold text-onSurface">{t("billingHistory")}</h2>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="py-2">{t("date")}</th>
              <th className="py-2">{t("billingEntry")}</th>
              <th className="py-2 text-right">{t("payAmount")}</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...data.charges.map((c) => ({ id: c.id, day: c.due_date ?? c.created_at, text: `${c.number ?? ""} ${formatDate(c.period_start)} - ${formatDate(c.period_end)}`, amount: c.amount, sign: 1 })),
              ...data.payments.map((p) => ({ id: p.id, day: p.paid_at ?? p.created_at, text: t("billingPayment"), amount: p.amount, sign: -1 })),
            ]
              .sort((a, b) => (a.day < b.day ? 1 : -1))
              .map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-onSurfaceSecondary">{formatDate(row.day)}</td>
                  <td className="py-2 text-onSurface">{row.text}</td>
                  <td className={`py-2 text-right font-semibold ${row.sign < 0 ? "text-success" : "text-onSurface"}`}>
                    {row.sign < 0 ? "−" : ""}
                    {money(row.amount)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {data.charges.length === 0 && data.payments.length === 0 && <p className="pt-3 text-sm text-muted">{t("billingNothingOpen")}</p>}
      </div>
    </div>
  );
}
