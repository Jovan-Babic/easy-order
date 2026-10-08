"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MODULES, toggleModule } from "@/lib/modules";
import {
  EVENT_KEYS,
  Plan,
  STATUS_KEYS,
  STATUS_STYLES,
  SubscriptionEvent,
  SubscriptionRow,
  detailOf,
} from "@/lib/subscriptions";

const input = "w-full rounded-md border border-border px-3 py-2 text-sm";
const primary = "rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50";
const secondary = "rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurfaceSecondary";
const link = "font-semibold text-brand hover:underline";

const inDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

type Dialog =
  | { kind: "assign" | "extend" | "cancel" | "history"; row: SubscriptionRow }
  | { kind: "plan"; plan: Plan | null }
  | null;

export default function SubscriptionsPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"subs" | "plans">("subs");
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [soonOnly, setSoonOnly] = useState(false);
  const [pendingDeletePlan, setPendingDeletePlan] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([fetch("/api/subscriptions"), fetch("/api/plans")]);
      if (!s.ok || !p.ok) throw new Error();
      setRows(await s.json());
      setPlans(await p.json());
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const done = async () => {
    setDialog(null);
    await load();
  };

  const visible = rows.filter(
    (r) => !soonOnly || r.state.status === "grace" || r.state.status === "locked" || (r.state.status === "active" && (r.state.days_left ?? 999) <= 30)
  );

  const deletePlan = async () => {
    if (!pendingDeletePlan) return;
    const res = await fetch(`/api/plans/${pendingDeletePlan.id}`, { method: "DELETE" });
    setPendingDeletePlan(null);
    if (!res.ok) setError(await detailOf(res, t("deleteFailed")));
    else {
      setError(null);
      await load();
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-onSurface">{t("subscriptions")}</h1>
        {tab === "plans" && (
          <button onClick={() => setDialog({ kind: "plan", plan: null })} className={primary}>
            {t("newPlan")}
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        {(["subs", "plans"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
              tab === k ? "border-brand bg-brandSecondary text-brand" : "border-border text-onSurfaceSecondary"
            }`}
          >
            {k === "subs" ? t("subscriptions") : t("plans")}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-error">{error}</p>}
      {loading ? (
        <p className="text-muted">{t("loading")}</p>
      ) : tab === "subs" ? (
        <>
          <label className="mb-3 flex items-center gap-2 text-sm text-onSurfaceSecondary">
            <input type="checkbox" checked={soonOnly} onChange={(e) => setSoonOnly(e.target.checked)} />
            {t("subExpiringOnly")}
          </label>
          {plans.filter((p) => p.active).length === 0 && <p className="mb-3 text-sm text-muted">{t("noPlans")}</p>}
          <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">{t("client")}</th>
                  <th className="px-4 py-3">{t("plan")}</th>
                  <th className="px-4 py-3">{t("status")}</th>
                  <th className="px-4 py-3">{t("validUntil")}</th>
                  <th className="px-4 py-3">{t("daysLeft")}</th>
                  <th className="px-4 py-3">{t("modules")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const has = r.state.status !== "none";
                  return (
                    <tr key={r.client_id} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3 font-semibold text-onSurface">
                        {r.client_name}
                        {!r.client_active && <span className="ml-2 text-xs text-muted">({t("inactive")})</span>}
                      </td>
                      <td className="px-4 py-3 text-onSurfaceSecondary">{r.plan_name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLES[r.state.status]}`}>
                          {t(STATUS_KEYS[r.state.status])}
                        </span>
                        {r.state.status === "locked" && r.state.purge_at && (
                          <p className="mt-1 text-xs text-muted">
                            {r.purged_at ? t("purgedAt") : r.purge_paused ? t("purgePaused") : `${t("purgeAt")}: ${r.state.purge_at}`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-onSurfaceSecondary">{has ? r.state.ends_at : t("subscriptionNeverEnds")}</td>
                      <td className="px-4 py-3 text-onSurfaceSecondary">{has && r.state.days_left != null ? r.state.days_left : "-"}</td>
                      <td className="px-4 py-3 text-xs text-onSurfaceSecondary">
                        {r.modules.length ? MODULES.filter((m) => r.modules.includes(m.key)).map((m) => t(m.labelKey)).join(", ") : "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button className={`${link} mr-3`} onClick={() => setDialog({ kind: "assign", row: r })}>
                          {has ? t("changePlan") : t("assignPlan")}
                        </button>
                        {has && (
                          <button className={`${link} mr-3`} onClick={() => setDialog({ kind: "extend", row: r })}>
                            {t("extend")}
                          </button>
                        )}
                        <button className={`${link} mr-3`} onClick={() => setDialog({ kind: "history", row: r })}>
                          {t("history")}
                        </button>
                        {has && r.state.status !== "locked" && (
                          <button className="font-semibold text-error hover:underline" onClick={() => setDialog({ kind: "cancel", row: r })}>
                            {t("cancelSubscription")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t("plan")}</th>
                <th className="px-4 py-3">{t("modules")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-onSurface">{p.name}</p>
                    {p.description && <p className="text-xs text-muted">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-onSurfaceSecondary">
                    {p.modules.length ? MODULES.filter((m) => p.modules.includes(m.key)).map((m) => t(m.labelKey)).join(", ") : "-"}
                  </td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">{p.active ? t("active") : t("inactive")}</td>
                  <td className="px-4 py-3 text-right">
                    <button className={`${link} mr-3`} onClick={() => setDialog({ kind: "plan", plan: p })}>
                      {t("edit")}
                    </button>
                    <button className="font-semibold text-error hover:underline" onClick={() => setPendingDeletePlan(p)}>
                      {t("delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    {t("noPlans")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "assign" && <AssignDialog row={dialog.row} plans={plans} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "extend" && <ExtendDialog row={dialog.row} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "cancel" && <CancelDialog row={dialog.row} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "history" && <HistoryDialog row={dialog.row} onClose={() => setDialog(null)} onChanged={load} />}
      {dialog?.kind === "plan" && <PlanDialog plan={dialog.plan} onClose={() => setDialog(null)} onDone={done} />}
      {pendingDeletePlan && (
        <ConfirmDialog itemName={pendingDeletePlan.name} onCancel={() => setPendingDeletePlan(null)} onConfirm={deletePlan} />
      )}
    </div>
  );
}

function useSubmit(onDone: () => void) {
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

function AssignDialog({ row, plans, onClose, onDone }: { row: SubscriptionRow; plans: Plan[]; onClose: () => void; onDone: () => void }) {
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

function ExtendDialog({ row, onClose, onDone }: { row: SubscriptionRow; onClose: () => void; onDone: () => void }) {
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

function CancelDialog({ row, onClose, onDone }: { row: SubscriptionRow; onClose: () => void; onDone: () => void }) {
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

function HistoryDialog({ row, onClose, onChanged }: { row: SubscriptionRow; onClose: () => void; onChanged: () => void }) {
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

function PlanDialog({ plan, onClose, onDone }: { plan: Plan | null; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [modules, setModules] = useState<string[]>(plan?.modules ?? []);
  const [active, setActive] = useState(plan?.active ?? true);
  const [apply, setApply] = useState(false);
  const { busy, error, send } = useSubmit(onDone);
  return (
    <Modal title={plan ? t("editPlan") : t("newPlan")} onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(plan ? `/api/plans/${plan.id}` : "/api/plans", plan ? "PUT" : "POST", {
            name,
            description,
            modules,
            active,
            apply_to_clients: apply,
          });
        }}
      >
        <input required placeholder={t("planName")} value={name} onChange={(e) => setName(e.target.value)} className={input} />
        <input placeholder={t("planDescription")} value={description} onChange={(e) => setDescription(e.target.value)} className={input} />
        <p className="text-xs text-muted">{t("planModulesHint")}</p>
        {MODULES.map((m) => (
          <label key={m.key} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={modules.includes(m.key)}
              onChange={(e) => setModules(toggleModule(modules, m.key, e.target.checked))}
              className="mt-1"
            />
            <span>
              <span className="font-semibold text-onSurface">{t(m.labelKey)}</span>
              <span className="block text-xs text-muted">{t(m.descKey)}</span>
            </span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm font-semibold text-onSurface">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("planActive")}
        </label>
        {plan && (
          <label className="flex items-center gap-2 text-sm text-onSurfaceSecondary">
            <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
            {t("applyToClients")}
          </label>
        )}
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
