"use client";

import { useCallback, useEffect, useState } from "react";
import { ChargeLinesTable } from "@/components/ChargeLines";
import { Modal, input, link, primary, secondary, useSubmit } from "@/components/SubscriptionDialogs";
import { LedgerCharge, LedgerPayment, formatDate } from "@/lib/billing";
import { localizedDetail } from "@/lib/errors";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { METHOD_KEYS, PaymentMethod, money, todayIso } from "@/lib/payments";

type Balance = { balance_due: number; credit: number; monthly_amount: number; charges: LedgerCharge[]; payments: LedgerPayment[] };
type State = { status: string; ends_at?: string; billing_cycle?: string; lock_reason?: string | null; due_extension_until?: string | null };
type Dialog = "enroll" | "pay" | "extend" | null;
type EmailLog = {
  id: string; event: string; subject: string; recipients: string[]; sent_to: string[]; sent: boolean;
  skipped: string | null; errors: string[]; created_at: string;
};
type Emails = { billing_emails: boolean; accounting_email: string | null; recipients: string[]; log: EmailLog[] };

const EVENT_KEYS: Record<string, TranslationKey> = {
  issued: "billingEventIssued", reminder: "billingEventReminder", warning: "billingEventWarning",
  blocked: "billingEventBlocked", paid: "billingEventPaid", annual_expiry: "billingEventAnnual",
};
const SKIP_KEYS: Record<string, TranslationKey> = {
  disabled: "billingEmailSkipDisabled", no_recipients: "billingEmailSkipNoRecipients", smtp_off: "billingEmailSkipSmtp",
};

// Superadmin, one client: calendar billing (enroll, balance, charges, payments, block).
export function BillingPanel({ clientId }: { clientId: string }) {
  const { t } = useLanguage();
  const [state, setState] = useState<State | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [qr, setQr] = useState(false);
  const [emails, setEmails] = useState<Emails | null>(null);

  const load = useCallback(async () => {
    const [s, b, m] = await Promise.all([
      fetch(`/api/subscriptions/${clientId}`), fetch(`/api/billing/clients/${clientId}`), fetch(`/api/billing/clients/${clientId}/emails`),
    ]);
    if (!s.ok) {
      const body = await s.json().catch(() => ({}));
      setError(localizedDetail(body.detail, t, t("loadFailed")));
      return;
    }
    setState((await s.json()).row.state);
    setBalance(b.ok ? await b.json() : null);
    setEmails(m.ok ? await m.json() : null);
  }, [clientId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const done = async () => {
    setDialog(null);
    await load();
  };
  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) {
      const out = await res.json().catch(() => ({}));
      setError(localizedDetail(out.detail, t, t("saveFailed")));
      return;
    }
    setError(null);
    await load();
  };

  if (error && !state) return <p className="text-error">{error}</p>;
  if (!state) return <p className="text-muted">{t("loading")}</p>;
  const calendar = !!state.billing_cycle;

  return (
    <div className="grid max-w-4xl gap-6">
      {error && <p className="text-sm text-error">{error}</p>}
      {!calendar ? (
        <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <p className="text-sm text-muted">{t("billingNeedsPlan")}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 rounded-lg bg-surfaceSecondary p-6 shadow-sm sm:grid-cols-4">
            <Figure label={t("billingToPay")} value={money(balance?.balance_due ?? 0)} strong />
            <Figure label={t("billingCredit")} value={money(balance?.credit ?? 0)} />
            <Figure label={t("seatsMonthlyTotal")} value={money(balance?.monthly_amount ?? 0)} />
            <Figure
              label={t("validUntil")}
              value={`${formatDate(state.ends_at)} · ${state.billing_cycle === "annual" ? t("cycleAnnual") : t("cycleMonthly")}`}
            />
            <div className="flex flex-wrap items-center gap-4 sm:col-span-4">
              <button className={primary} onClick={() => setDialog("pay")}>
                {t("billingRecordPayment")}
              </button>
              <button className={link} onClick={() => setDialog("extend")}>
                {state.due_extension_until ? `${t("billingDueExtended")} ${formatDate(state.due_extension_until)}` : t("billingExtendDue")}
              </button>
              {state.lock_reason === "manual" ? (
                <button className={link} onClick={() => post(`/api/subscriptions/${clientId}/unblock`, {})}>
                  {t("billingUnblock")}
                </button>
              ) : (
                <button className="font-semibold text-error hover:underline" onClick={() => window.confirm(t("billingBlockConfirm")) && post(`/api/subscriptions/${clientId}/block`, {})}>
                  {t("billingBlock")}
                </button>
              )}
              <button className={link} onClick={() => setDialog("enroll")}>
                {t("billingChangeCycle")}
              </button>
              <button className={link} onClick={() => setQr(!qr)}>
                {t("billingShowQr")}
              </button>
              {state.status === "locked" && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-error">
                  {t(state.lock_reason === "manual" ? "lockManual" : state.lock_reason === "debt" ? "lockDebt" : "subLocked")}
                </span>
              )}
            </div>
            {qr && (
              <div className="sm:col-span-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/billing/clients/${clientId}/qr?ts=${Date.now()}`} alt="IPS QR" width={180} height={180} />
                <p className="text-xs text-muted">{t("billingQrPreviewHint")}</p>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
            <h3 className="mb-3 text-base font-extrabold text-onSurface">{t("billingCharges")}</h3>
            {(balance?.charges ?? []).length === 0 && <p className="text-sm text-muted">{t("billingNothingOpen")}</p>}
            <div className="grid gap-3">
              {(balance?.charges ?? []).map((c) => (
                <div key={c.id} className="rounded-md border border-border p-4">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <p className="font-bold text-onSurface">
                      {c.status === "draft" ? t("draftLabel") : c.number} · {formatDate(c.period_start)} - {formatDate(c.period_end)}
                    </p>
                    <p className="text-onSurfaceSecondary">
                      {c.due_date ? `${t("payDueDate")}: ${formatDate(c.due_date)}` : ""}
                    </p>
                  </div>
                  <ChargeLinesTable charge={c} showPaid={c.status !== "draft"} />
                  {c.status !== "draft" && (
                    <button className="mt-2 text-xs font-semibold text-error hover:underline" onClick={() => window.confirm(t("billingCancelChargeConfirm")) && post(`/api/payments/${c.id}/cancel`, {})}>
                      {t("payCancel")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
            <h3 className="mb-3 text-base font-extrabold text-onSurface">{t("billingPayments")}</h3>
            <table className="w-full text-left text-sm">
              <tbody>
                {(balance?.payments ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-2 text-onSurfaceSecondary">{formatDate(p.paid_at)}</td>
                    <td className="py-2 text-onSurfaceSecondary">{p.method ? t(METHOD_KEYS[p.method as PaymentMethod]) : ""}</td>
                    <td className="py-2 text-xs text-muted">{p.note ?? ""}</td>
                    <td className="py-2 text-right font-semibold text-success">{money(p.amount)}</td>
                    <td className="py-2 text-right">
                      <button className="text-xs font-semibold text-error hover:underline" onClick={() => window.confirm(t("billingCancelPaymentConfirm")) && post(`/api/payments/${p.id}/cancel`, {})}>
                        {t("payCancel")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(balance?.payments ?? []).length === 0 && <p className="text-sm text-muted">{t("payNone")}</p>}
          </div>

          {emails && <EmailsCard clientId={clientId} emails={emails} onSaved={setEmails} />}
        </>
      )}
      {dialog === "enroll" && <EnrollDialog clientId={clientId} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "pay" && <LedgerPayDialog clientId={clientId} emailsOn={emails?.billing_emails ?? true} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === "extend" && <ExtendDueDialog clientId={clientId} current={state.due_extension_until ?? null} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className={`mt-1 ${strong ? "text-2xl font-extrabold" : "text-base font-semibold"} text-onSurface`}>{value}</p>
    </div>
  );
}

function Buttons({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} className={secondary}>
        {t("cancel")}
      </button>
      <button type="submit" disabled={busy} className={primary}>
        {t("save")}
      </button>
    </div>
  );
}

function EnrollDialog({ clientId, onClose, onDone }: { clientId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={t("billingChangeCycle")} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); send(`/api/billing/clients/${clientId}/enroll`, "POST", { cycle }); }}>
        <p className="text-xs text-muted">{t("billingChangeCycleHint")}</p>
        <select value={cycle} onChange={(e) => setCycle(e.target.value as "monthly" | "annual")} className={input}>
          <option value="monthly">{t("cycleMonthly")}</option>
          <option value="annual">{t("cycleAnnual")}</option>
        </select>
        {error && <p className="text-sm text-error">{localizedDetail(error, t, error)}</p>}
        <Buttons busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function LedgerPayDialog({ clientId, emailsOn, onClose, onDone }: { clientId: string; emailsOn: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [receipt, setReceipt] = useState(false);
  const [emailsEnabled, setEmailsEnabled] = useState(emailsOn);
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [note, setNote] = useState("");
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={t("billingRecordPayment")} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); send("/api/billing/payments", "POST", {
        client_id: clientId, amount: Number(amount), paid_at: day, method, note: note || null,
        send_receipt: receipt && emailsEnabled, billing_emails: emailsEnabled === emailsOn ? null : emailsEnabled,
      }); }}>
        <p className="text-xs text-muted">{t("billingRecordPaymentHint")}</p>
        <label className="text-sm font-semibold text-onSurface">
          {t("payAmount")}
          <input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("payDate")}
          <input required type="date" max={todayIso()} value={day} onChange={(e) => setDay(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("payMethod")}
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={`${input} mt-1`}>
            {(Object.keys(METHOD_KEYS) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>{t(METHOD_KEYS[m])}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("subNote")}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-onSurface">
          <input type="checkbox" checked={emailsEnabled} onChange={(e) => setEmailsEnabled(e.target.checked)} />
          {t("billingEmailsOn")}
        </label>
        <label className={`flex items-center gap-2 text-sm ${emailsEnabled ? "text-onSurface" : "text-muted"}`}>
          <input type="checkbox" disabled={!emailsEnabled} checked={receipt && emailsEnabled} onChange={(e) => setReceipt(e.target.checked)} />
          {t("billingSendReceipt")}
        </label>
        {error && <p className="text-sm text-error">{localizedDetail(error, t, error)}</p>}
        <Buttons busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function EmailsCard({ clientId, emails, onSaved }: { clientId: string; emails: Emails; onSaved: (e: Emails) => void }) {
  const { t } = useLanguage();
  const [accounting, setAccounting] = useState(emails.accounting_email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (body: { billing_emails?: boolean; accounting_email?: string }) => {
    setBusy(true);
    const res = await fetch(`/api/billing/clients/${clientId}/emails`, { method: "PUT", body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(localizedDetail(out.detail, t, t("saveFailed")));
      return;
    }
    setError(null);
    setAccounting(out.accounting_email ?? "");
    onSaved(out);
  };

  return (
    <div className="rounded-lg bg-surfaceSecondary p-6 shadow-sm">
      <h3 className="mb-3 text-base font-extrabold text-onSurface">{t("billingEmails")}</h3>
      <div className="grid gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-onSurface">
          <input type="checkbox" disabled={busy} checked={emails.billing_emails} onChange={(e) => save({ billing_emails: e.target.checked })} />
          {t("billingEmailsOn")}
        </label>
        <p className="text-xs text-muted">{t("billingEmailsHint")}</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); save({ accounting_email: accounting.trim() }); }}>
          <label className="grow text-sm font-semibold text-onSurface">
            {t("billingAccountingEmail")}
            <input type="email" value={accounting} onChange={(e) => setAccounting(e.target.value)} className={`${input} mt-1`} />
          </label>
          <button type="submit" disabled={busy || accounting.trim() === (emails.accounting_email ?? "")} className={secondary}>
            {t("save")}
          </button>
        </form>
        <p className="text-sm text-onSurfaceSecondary">
          {t("billingRecipients")}: {emails.recipients.length ? emails.recipients.join(", ") : t("billingNoRecipients")}
        </p>
        {error && <p className="text-sm text-error">{error}</p>}
      </div>
      <h4 className="mb-2 mt-5 text-sm font-bold text-onSurface">{t("billingEmailLog")}</h4>
      {emails.log.length === 0 ? (
        <p className="text-sm text-muted">{t("billingEmailNone")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <tbody>
            {emails.log.map((x) => (
              <tr key={x.id} className="border-b border-border align-top last:border-0">
                <td className="whitespace-nowrap py-2 pr-3 text-onSurfaceSecondary">{formatDate(x.created_at.slice(0, 10))}</td>
                <td className="py-2 pr-3 font-semibold text-onSurface">{EVENT_KEYS[x.event] ? t(EVENT_KEYS[x.event]) : x.event}</td>
                <td className="py-2 pr-3 text-xs text-muted">{x.subject}</td>
                <td className="py-2 text-right text-xs">
                  {x.sent ? (
                    <span className="text-success" title={x.sent_to.join(", ")}>{t("billingEmailSent")}</span>
                  ) : x.skipped ? (
                    <span className="text-muted">{SKIP_KEYS[x.skipped] ? t(SKIP_KEYS[x.skipped]) : x.skipped}</span>
                  ) : (
                    <span className="text-error" title={x.errors.join("\n")}>{t("billingEmailFailed")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ExtendDueDialog({ clientId, current, onClose, onDone }: { clientId: string; current: string | null; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [until, setUntil] = useState(current ?? "");
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={t("billingExtendDue")} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); send(`/api/subscriptions/${clientId}/extend-due`, "POST", { until: until || null }); }}>
        <p className="text-xs text-muted">{t("billingExtendDueHint")}</p>
        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={input} />
        {error && <p className="text-sm text-error">{localizedDetail(error, t, error)}</p>}
        <Buttons busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}
