"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChargeLinesTable } from "@/components/ChargeLines";
import { input, primary, secondary } from "@/components/SubscriptionDialogs";
import { LedgerCharge, formatDate } from "@/lib/billing";
import { localizedDetail } from "@/lib/errors";
import { useLanguage } from "@/lib/i18n";
import { money } from "@/lib/payments";

type DraftRow = { charge: LedgerCharge & { calculated_total?: number | null }; client_id: string; client_name: string; balance_due: number; credit: number; to_pay: number };

// Superadmin: charge drafts made on the draft day (or now), reviewed and approved
// before the clients see them.
export default function DraftsPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, { amount: string; note: string }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/billing/drafts");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ ok: false, text: localizedDetail(body.detail, t, t("loadFailed")) });
      return;
    }
    setRows(body);
    setEdits(Object.fromEntries((body as DraftRow[]).map((r) => [r.charge.id, { amount: String(r.charge.amount), note: r.charge.note ?? "" }])));
    setSelected((prev) => prev.filter((id) => (body as DraftRow[]).some((r) => r.charge.id === id)));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (url: string, method: string, body: unknown, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, { method, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: localizedDetail(typeof out.detail === "string" ? out.detail : null, t, t("saveFailed")) });
        return;
      }
      setMessage({ ok: true, text: done });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = (row: DraftRow) => {
    const e = edits[row.charge.id];
    call(`/api/billing/drafts/${row.charge.id}`, "PUT", { amount: Number(e.amount), note: e.note }, t("draftSaved"));
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-onSurface">{t("draftsTitle")}</h1>
          <p className="max-w-2xl text-sm text-muted">{t("draftsHint")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={secondary} disabled={busy} onClick={() => call("/api/billing/drafts/generate", "POST", {}, t("draftsGenerated"))}>
            {t("draftsGenerate")}
          </button>
          <button className={secondary} disabled={busy || selected.length === 0} onClick={() => call("/api/billing/drafts/approve", "POST", { ids: selected }, t("draftsApproved"))}>
            {t("draftsApproveSelected")} ({selected.length})
          </button>
          <button className={primary} disabled={busy || !rows?.length} onClick={() => window.confirm(t("draftsApproveAllConfirm")) && call("/api/billing/drafts/approve", "POST", { all: true }, t("draftsApproved"))}>
            {t("draftsApproveAll")}
          </button>
        </div>
      </div>
      {message && <p className={`text-sm ${message.ok ? "text-success" : "text-error"}`}>{message.text}</p>}
      {rows === null ? (
        <p className="text-muted">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted">{t("draftsNone")}</p>
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => {
            const c = row.charge;
            const e = edits[c.id] ?? { amount: String(c.amount), note: "" };
            return (
              <div key={c.id} className="grid gap-4 rounded-lg bg-surfaceSecondary p-5 shadow-sm md:grid-cols-[1fr_300px]">
                <div>
                  <label className="mb-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={(ev) => setSelected(ev.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))}
                    />
                    <Link href={`/clients/${row.client_id}`} className="font-bold text-brand hover:underline">
                      {row.client_name}
                    </Link>
                    <span className="text-sm text-muted">
                      {formatDate(c.period_start)} - {formatDate(c.period_end)} · {c.cycle === "annual" ? t("cycleAnnual") : c.cycle === "annual_addon" ? t("cycleAnnualAddon") : t("cycleMonthly")}
                    </span>
                  </label>
                  <ChargeLinesTable charge={c} showPaid={false} />
                  {typeof c.calculated_total === "number" && c.calculated_total !== c.amount && (
                    <p className="mt-1 text-xs text-warning">
                      {t("draftCalculated")}: {money(c.calculated_total)}
                    </p>
                  )}
                </div>
                <div className="grid content-start gap-2 text-sm">
                  <div className="rounded-md bg-surface p-3">
                    <p className="flex justify-between"><span className="text-muted">{t("draftPrevDebt")}</span><span>{money(row.balance_due)}</span></p>
                    {row.credit > 0 && <p className="flex justify-between"><span className="text-muted">{t("billingCredit")}</span><span className="text-success">−{money(row.credit)}</span></p>}
                    <p className="flex justify-between font-bold"><span>{t("billingToPay")}</span><span>{money(row.to_pay)}</span></p>
                  </div>
                  <label className="font-semibold text-onSurface">
                    {t("payAmount")}
                    <input type="number" min="0" step="0.01" value={e.amount} onChange={(ev) => setEdits({ ...edits, [c.id]: { ...e, amount: ev.target.value } })} className={`${input} mt-1`} />
                  </label>
                  <label className="font-semibold text-onSurface">
                    {t("subNote")}
                    <input value={e.note} onChange={(ev) => setEdits({ ...edits, [c.id]: { ...e, note: ev.target.value } })} className={`${input} mt-1`} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button className={secondary} disabled={busy} onClick={() => saveEdit(row)}>
                      {t("save")}
                    </button>
                    <button className={secondary} disabled={busy} onClick={() => call(`/api/billing/drafts/${c.id}`, "PUT", { free: true }, t("draftSaved"))}>
                      {t("draftFree")}
                    </button>
                    <button className="text-sm font-semibold text-error hover:underline" disabled={busy} onClick={() => window.confirm(t("draftDropConfirm")) && call(`/api/payments/${c.id}/cancel`, "POST", {}, t("draftDropped"))}>
                      {t("draftDrop")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
