"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { EVENT_KEYS, Plan, SubscriptionEvent, SubscriptionRow, detailOf } from "@/lib/subscriptions";

export const input = "w-full rounded-md border border-border px-3 py-2 text-sm";
export const primary = "rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50";
export const secondary = "rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurfaceSecondary";
export const link = "font-semibold text-brand hover:underline";

export const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-black/40 p-4 sm:p-6">
      <div className="mx-auto mt-10 w-full max-w-lg rounded-2xl bg-surfaceSecondary p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-onSurface">{title}</h2>
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm font-semibold text-onSurfaceSecondary hover:bg-surface">
            {t("close")}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useSubmit(onDone: () => void) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (url: string, method: string, body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method, body: JSON.stringify(body) });
      if (!res.ok) {
        setError(await detailOf(res, t("saveFailed")));
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, send };
}

export function AssignDialog({ row, plans, onClose, onDone }: { row: SubscriptionRow; plans: Plan[]; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const usable = plans.filter((p) => p.active || p.id === row.plan_id);
  const [planId, setPlanId] = useState(row.plan_id ?? usable[0]?.id ?? "");
  const [endsAt, setEndsAt] = useState(row.state.ends_at && row.state.ends_at > inDays(0) ? row.state.ends_at : inDays(365));
  const [note, setNote] = useState("");
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={`${row.client_name} · ${row.plan_id ? t("changePlan") : t("assignPlan")}`} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(`/api/subscriptions/${row.client_id}/assign`, "POST", { plan_id: planId, ends_at: endsAt, note: note || null });
        }}
      >
        <label className="text-sm font-semibold text-onSurface">
          {t("plan")}
          <select required value={planId} onChange={(e) => setPlanId(e.target.value)} className={`${input} mt-1`}>
            {usable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("validUntil")}
          <input required type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("subNote")}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} mt-1`} />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={secondary}>
            {t("cancel")}
          </button>
          <button type="submit" disabled={busy || !planId} className={primary}>
            {t("save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ExtendDialog({ row, onClose, onDone }: { row: SubscriptionRow; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [months, setMonths] = useState("12");
  const [endsAt, setEndsAt] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={`${row.client_name} · ${t("extend")}`} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(`/api/subscriptions/${row.client_id}/extend`, "POST", {
            ...(endsAt ? { ends_at: endsAt } : { months: Number(months) }),
            note: note || null,
          });
        }}
      >
        <p className="text-sm text-muted">
          {t("validUntil")}: {row.state.ends_at}
        </p>
        <label className="text-sm font-semibold text-onSurface">
          {t("extendMonths")}
          <select value={months} disabled={!!endsAt} onChange={(e) => setMonths(e.target.value)} className={`${input} mt-1`}>
            {[1, 3, 6, 12, 24].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("extendExactDate")}
          <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-sm font-semibold text-onSurface">
          {t("subNote")}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${input} mt-1`} />
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

export function CancelDialog({ row, onClose, onDone }: { row: SubscriptionRow; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={`${row.client_name} · ${t("cancelSubscription")}`} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-sm text-onSurfaceSecondary">{t("cancelSubscriptionConfirm")}</p>
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
            onClick={() => send(`/api/subscriptions/${row.client_id}/cancel`, "POST", { note: note || null })}
            className="rounded-md bg-error px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {t("cancelSubscription")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function HistoryDialog({ row, onClose, onChanged }: { row: SubscriptionRow; onClose: () => void; onChanged: () => void }) {
  const { t } = useLanguage();
  const [events, setEvents] = useState<SubscriptionEvent[] | null>(null);
  const [current, setCurrent] = useState(row);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/subscriptions/${row.client_id}`);
    if (!res.ok) {
      setError(await detailOf(res, t("loadFailed")));
      return;
    }
    const body = await res.json();
    setEvents(body.events);
    setCurrent(body.row);
  }, [row.client_id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePurge = async () => {
    const res = await fetch(`/api/subscriptions/${row.client_id}/purge-pause`, {
      method: "POST",
      body: JSON.stringify({ paused: !current.purge_paused }),
    });
    if (!res.ok) setError(await detailOf(res, t("saveFailed")));
    else {
      await load();
      onChanged();
    }
  };

  const locked = current.state.status === "locked";
  return (
    <Modal title={`${row.client_name} · ${t("history")}`} onClose={onClose}>
      <div className="grid gap-3">
        {locked && current.state.purge_at && (
          <div className="rounded-md border border-border p-3 text-sm">
            <p className="text-onSurface">
              {t("purgeAt")}: <strong>{current.purged_at ? t("purgedAt") : current.purge_paused ? t("purgePaused") : current.state.purge_at}</strong>
            </p>
            <div className="mt-2 flex gap-4">
              <a className={link} href={`/api/subscriptions/${row.client_id}/export`}>
                {t("exportData")}
              </a>
              {!current.purged_at && (
                <button className={link} onClick={togglePurge}>
                  {current.purge_paused ? t("resumePurge") : t("pausePurge")}
                </button>
              )}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
        {events === null ? (
          <p className="text-muted">{t("loading")}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted">{t("historyEmpty")}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
            {events.map((e) => (
              <li key={e.id} className="py-2">
                <p className="font-semibold text-onSurface">
                  {t(EVENT_KEYS[e.type] ?? "history")}
                  {e.plan_name ? ` · ${e.plan_name}` : ""}
                  {e.ends_at ? ` · ${t("validUntil")} ${e.ends_at}` : ""}
                </p>
                {e.data && <p className="text-xs text-muted">{Object.entries(e.data).map(([k, v]) => `${k}: ${v}`).join(", ")}</p>}
                {e.note && <p className="text-xs text-onSurfaceSecondary">{e.note}</p>}
                <p className="text-xs text-muted">
                  {new Date(e.created_at).toLocaleString()} · {e.actor_name}
                  {e.source !== "manual" ? ` · ${e.source}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

