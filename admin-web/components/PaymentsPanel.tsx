"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, input, link, primary, secondary, useSubmit } from "@/components/SubscriptionDialogs";
import { useLanguage } from "@/lib/i18n";
import { ChargeMonthDialog } from "@/components/SeatsPanel";
import { SeatsOut } from "@/lib/seats";
import {
  KIND_KEYS,
  METHOD_KEYS,
  PAYMENT_STATUS_KEYS,
  PAYMENT_STATUS_STYLES,
  Payment,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  PaymentTotals,
  money,
  paymentsCsv,
  todayIso,
} from "@/lib/payments";
import { detailOf } from "@/lib/subscriptions";

type ClientOption = { id: string; name: string };
type Dialog =
  | { kind: "new"; status: "received" | "expected" }
  | { kind: "receive" | "cancel"; payment: Payment }
  | { kind: "month" }
  | null;

const stat = "rounded-lg bg-surfaceSecondary p-4 shadow-sm";

// Payments and debts, kept by hand. With `clientId` it is that client's tab,
// without it the superadmin's overall list.
export function PaymentsPanel({ clientId }: { clientId?: string }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<Payment[]>([]);
  const [totals, setTotals] = useState<PaymentTotals>({ received: 0, expected: 0, overdue_total: 0, overdue_count: 0 });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientFilter, setClientFilter] = useState("");
  const [status, setStatus] = useState<"" | PaymentStatus>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const effectiveClient = clientId ?? clientFilter;

  useEffect(() => {
    if (clientId) return;
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : []))
      .then(setClients)
      .catch(() => {});
  }, [clientId]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (effectiveClient) params.set("client_id", effectiveClient);
    if (status) params.set("status", status);
    if (from) params.set("from_date", from);
    if (to) params.set("to_date", to);
    const res = await fetch(`/api/payments?${params.toString()}`);
    if (!res.ok) {
      setError(await detailOf(res, t("loadFailed")));
      setLoading(false);
      return;
    }
    const body = await res.json();
    setItems(body.items);
    setTotals(body.totals);
    setError(null);
    setLoading(false);
  }, [effectiveClient, status, from, to, t]);

  useEffect(() => {
    load();
  }, [load]);

  const done = async () => {
    setDialog(null);
    await load();
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([paymentsCsv(items)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `uplate-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={stat}>
          <p className="text-xs font-semibold uppercase text-muted">{t("payTotalReceived")}</p>
          <p className="mt-1 text-xl font-extrabold text-onSurface">{money(totals.received)}</p>
        </div>
        <div className={stat}>
          <p className="text-xs font-semibold uppercase text-muted">{t("payTotalDebt")}</p>
          <p className="mt-1 text-xl font-extrabold text-onSurface">{money(totals.expected)}</p>
        </div>
        <div className={stat}>
          <p className="text-xs font-semibold uppercase text-muted">{t("payTotalOverdue")}</p>
          <p className={`mt-1 text-xl font-extrabold ${totals.overdue_count ? "text-error" : "text-onSurface"}`}>
            {money(totals.overdue_total)}
            {totals.overdue_count > 0 && <span className="ml-2 text-sm font-semibold">({totals.overdue_count})</span>}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-surfaceSecondary p-4 shadow-sm">
        {!clientId && (
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-md border border-border px-3 py-2 text-sm">
            <option value="">{t("allClientsFilter")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select value={status} onChange={(e) => setStatus(e.target.value as "" | PaymentStatus)} className="rounded-md border border-border px-3 py-2 text-sm">
          <option value="">{t("payAllStatuses")}</option>
          {(["received", "expected", "canceled"] as PaymentStatus[]).map((s) => (
            <option key={s} value={s}>
              {t(PAYMENT_STATUS_KEYS[s])}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-border px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-border px-3 py-2 text-sm" />
        <div className="ml-auto flex flex-wrap gap-3">
          <button className={secondary} onClick={exportCsv} disabled={items.length === 0}>
            {t("payExportCsv")}
          </button>
          {clientId && (
            <button className={secondary} onClick={() => setDialog({ kind: "month" })}>
              {t("chargeMonth")}
            </button>
          )}
          <button className={secondary} onClick={() => setDialog({ kind: "new", status: "expected" })}>
            {t("newCharge")}
          </button>
          <button className={primary} onClick={() => setDialog({ kind: "new", status: "received" })}>
            {t("newPayment")}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-error">{error}</p>}
      {loading ? (
        <p className="text-muted">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t("date")}</th>
                {!clientId && <th className="px-4 py-3">{t("client")}</th>}
                <th className="px-4 py-3 text-right">{t("payAmount")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                <th className="px-4 py-3">{t("payMethod")}</th>
                <th className="px-4 py-3">{t("plan")}</th>
                <th className="px-4 py-3">{t("subNote")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-onSurfaceSecondary">
                    {p.paid_at ?? p.due_date}
                    {p.status === "expected" && <span className="block text-xs text-muted">{t("payDueDate")}</span>}
                  </td>
                  {!clientId && (
                    <td className="px-4 py-3">
                      <Link href={`/clients/${p.client_id}`} className="font-semibold text-brand hover:underline">
                        {p.client_name ?? p.client_id}
                      </Link>
                    </td>
                  )}
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${p.status === "canceled" ? "text-muted line-through" : "text-onSurface"}`}>
                    {money(p.amount, p.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${PAYMENT_STATUS_STYLES[p.status]}`}>
                      {t(PAYMENT_STATUS_KEYS[p.status])}
                    </span>
                    {p.overdue && <span className="ml-2 text-xs font-bold text-error">{t("payOverdue")}</span>}
                  </td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{p.method ? t(METHOD_KEYS[p.method as PaymentMethod]) : "-"}</td>
                  <td className="px-4 py-3 text-xs text-onSurfaceSecondary">
                    {p.kind !== "subscription" ? t(KIND_KEYS[p.kind]) : (p.plan_name ?? "-")}
                    {p.period ? ` · ${p.period}` : p.period_months ? ` · ${p.period_months} ${t("payPeriodShort")}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-onSurfaceSecondary">{p.note ?? ""}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {p.status === "expected" && (
                      <button className={`${link} mr-3`} onClick={() => setDialog({ kind: "receive", payment: p })}>
                        {t("payReceive")}
                      </button>
                    )}
                    {p.status !== "canceled" && (
                      <button className="font-semibold text-error hover:underline" onClick={() => setDialog({ kind: "cancel", payment: p })}>
                        {t("payCancel")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted">
                    {t("payNone")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "new" && (
        <NewPaymentDialog status={dialog.status} clientId={clientId} clients={clients} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === "month" && clientId && <ChargeMonthDialog clientId={clientId} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "receive" && <ReceiveDialog payment={dialog.payment} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "cancel" && <CancelPaymentDialog payment={dialog.payment} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

function MethodSelect({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  const { t } = useLanguage();
  return (
    <label className="text-sm font-semibold text-onSurface">
      {t("payMethod")}
      <select value={value} onChange={(e) => onChange(e.target.value as PaymentMethod)} className={`${input} mt-1`}>
        {(["bank", "card", "cash", "other"] as PaymentMethod[]).map((m) => (
          <option key={m} value={m}>
            {t(METHOD_KEYS[m])}
          </option>
        ))}
      </select>
    </label>
  );
}

function Buttons({ busy, disabled, onClose }: { busy: boolean; disabled?: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} className={secondary}>
        {t("cancel")}
      </button>
      <button type="submit" disabled={busy || disabled} className={primary}>
        {t("save")}
      </button>
    </div>
  );
}

function NewPaymentDialog({
  status,
  clientId,
  clients,
  onClose,
  onDone,
}: {
  status: "received" | "expected";
  clientId?: string;
  clients: ClientOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useLanguage();
  const [client, setClient] = useState(clientId ?? "");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(status === "received" ? todayIso() : "");
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<PaymentKind>("subscription");
  const [pkg, setPkg] = useState<SeatsOut | null>(null);
  const [amountTouched, setAmountTouched] = useState(false);

  const touchedRef = useRef(false);
  const kindRef = useRef<PaymentKind>("subscription");
  touchedRef.current = amountTouched;
  kindRef.current = kind;

  // The client's package: its monthly amount fills the field (still editable).
  useEffect(() => {
    setPkg(null);
    if (!client) return;
    let current = true;
    fetch(`/api/clients/${client}/seats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: SeatsOut | null) => {
        if (!current || !body) return;
        setPkg(body);
        if (!touchedRef.current && kindRef.current === "subscription") {
          setAmount(body.monthly_total !== null ? String(body.monthly_total) : "");
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [client]);
  const { busy, error, send } = useSubmit(onDone);
  const received = status === "received";
  return (
    <Modal title={received ? t("newPayment") : t("newCharge")} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send("/api/payments", "POST", {
            client_id: client,
            status,
            amount: Number(amount),
            ...(received ? { paid_at: day, method } : { due_date: day }),
            note: note || null,
            kind,
          });
        }}
      >
        {!received && <p className="text-xs text-muted">{t("chargeHint")}</p>}
        <label className="text-sm font-semibold text-onSurface">
          {t("payKind")}
          <select
            value={kind}
            onChange={(e) => {
              const next = e.target.value as PaymentKind;
              setKind(next);
              // Package amount only makes sense for a package charge.
              if (!amountTouched) setAmount(next === "subscription" && pkg?.monthly_total != null ? String(pkg.monthly_total) : "");
            }}
            className={`${input} mt-1`}
          >
            {(["subscription", "setup", "other"] as PaymentKind[]).map((k) => (
              <option key={k} value={k}>
                {t(KIND_KEYS[k])}
              </option>
            ))}
          </select>
        </label>
        {!clientId && (
          <select required value={client} onChange={(e) => setClient(e.target.value)} className={input}>
            <option value="">{t("selectClient")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <label className="text-sm font-semibold text-onSurface">
          {t("payAmount")}
          <input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => {
              setAmount(e.target.value);
              setAmountTouched(true);
            }} className={`${input} mt-1`} />
          {kind === "subscription" && pkg?.plan_name && pkg.monthly_total !== null && (
            <span className="mt-1 block text-xs font-normal text-muted">
              {t("chargePackageHint")}: {pkg.plan_name} · {money(pkg.monthly_total, pkg.currency)}
            </span>
          )}
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {received ? t("payDate") : t("payDueDate")}
          <input required type="date" max={received ? todayIso() : undefined} value={day} onChange={(e) => setDay(e.target.value)} className={`${input} mt-1`} />
        </label>
        {received && <MethodSelect value={method} onChange={setMethod} />}
        <label className="text-sm font-semibold text-onSurface">
          {t("subNote")}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} mt-1`} />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <Buttons busy={busy} disabled={!client || !amount} onClose={onClose} />
      </form>
    </Modal>
  );
}

function ReceiveDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState(String(payment.amount));
  const [day, setDay] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [note, setNote] = useState(payment.note ?? "");
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={`${payment.client_name ?? ""} · ${t("payReceive")}`} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(`/api/payments/${payment.id}/receive`, "POST", { amount: Number(amount), paid_at: day, method, note: note || null });
        }}
      >
        <label className="text-sm font-semibold text-onSurface">
          {t("payAmount")}
          <input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("payDate")}
          <input required type="date" max={todayIso()} value={day} onChange={(e) => setDay(e.target.value)} className={`${input} mt-1`} />
        </label>
        <MethodSelect value={method} onChange={setMethod} />
        <label className="text-sm font-semibold text-onSurface">
          {t("subNote")}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} mt-1`} />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <Buttons busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}

function CancelPaymentDialog({ payment, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={`${payment.client_name ?? ""} · ${t("payCancel")}`} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-sm text-onSurfaceSecondary">
          {money(payment.amount, payment.currency)} — {t("payCancelConfirm")}
        </p>
        <label className="text-sm font-semibold text-onSurface">
          {t("subNote")}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} mt-1`} />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondary}>
            {t("cancel")}
          </button>
          <button
            disabled={busy}
            onClick={() => send(`/api/payments/${payment.id}/cancel`, "POST", { note: note || null })}
            className="rounded-md bg-error px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {t("payCancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
