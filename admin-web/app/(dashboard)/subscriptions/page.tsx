"use client";

import { useCallback, useEffect, useState } from "react";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MODULES, toggleModule } from "@/lib/modules";
import { ROLE_KEYS } from "@/components/SeatsPanel";
import { SEAT_ROLES } from "@/lib/seats";
import { Plan, STATUS_KEYS, STATUS_STYLES, SubscriptionRow, detailOf } from "@/lib/subscriptions";
import {
  AssignDialog,
  CancelDialog,
  ExtendDialog,
  HistoryDialog,
  Modal,
  PayDialog,
  link,
  primary,
  secondary,
  input,
  useSubmit,
} from "@/components/SubscriptionDialogs";

const PRICE_PERIODS = [1, 3, 6, 12];

type Dialog =
  | { kind: "assign" | "extend" | "cancel" | "history" | "pay"; row: SubscriptionRow }
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
                        <button className={`${link} mr-3`} onClick={() => setDialog({ kind: "pay", row: r })}>
                          {t("payAndExtend")}
                        </button>
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
                <th className="px-4 py-3">{t("planPrices")}</th>
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
                  <td className="px-4 py-3 text-xs text-onSurfaceSecondary">
                    {Object.entries(p.prices ?? {}).length
                      ? Object.entries(p.prices ?? {}).map(([months, amount]) => `${months} ${t("payPeriodShort")}: ${amount}`).join(" · ")
                      : "-"}
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
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    {t("noPlans")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "assign" && <AssignDialog row={dialog.row} plans={plans} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "pay" && <PayDialog row={dialog.row} plans={plans} onClose={() => setDialog(null)} onDone={done} />}
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

function PlanDialog({ plan, onClose, onDone }: { plan: Plan | null; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [modules, setModules] = useState<string[]>(plan?.modules ?? []);
  const [active, setActive] = useState(plan?.active ?? true);
  const [apply, setApply] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(PRICE_PERIODS.map((m) => [String(m), plan?.prices?.[String(m)] ? String(plan.prices[String(m)]) : ""]))
  );
  const [included, setIncluded] = useState<Record<string, string>>(
    Object.fromEntries(SEAT_ROLES.map((r) => [r, plan?.included_seats?.[r] !== undefined ? String(plan.included_seats[r]) : ""]))
  );
  const [seatPrices, setSeatPrices] = useState<Record<string, string>>(
    Object.fromEntries(SEAT_ROLES.map((r) => [r, plan?.seat_prices?.[r] !== undefined ? String(plan.seat_prices[r]) : ""]))
  );
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
            included_seats: Object.fromEntries(Object.entries(included).filter(([, v]) => v !== "").map(([r, v]) => [r, Math.max(0, Math.floor(Number(v)))])),
            seat_prices: Object.fromEntries(Object.entries(seatPrices).filter(([, v]) => v !== "").map(([r, v]) => [r, Math.max(0, Number(v))])),
            // Prices of other periods (set elsewhere) are kept by sending them back.
            prices: {
              ...Object.fromEntries(Object.entries(plan?.prices ?? {}).filter(([m]) => !PRICE_PERIODS.includes(Number(m)))),
              ...Object.fromEntries(Object.entries(prices).filter(([, v]) => v !== "" && Number(v) > 0).map(([m, v]) => [m, Number(v)])),
            },
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
        <p className="text-sm font-semibold text-onSurface">{t("planPrices")}</p>
        <div className="grid grid-cols-2 gap-3">
          {PRICE_PERIODS.map((m) => (
            <label key={m} className="text-xs font-semibold text-onSurfaceSecondary">
              {t(`periodMonths${m}` as TranslationKey)}
              <input
                type="number"
                min="0"
                step="0.01"
                value={prices[String(m)]}
                onChange={(e) => setPrices({ ...prices, [String(m)]: e.target.value })}
                className={`${input} mt-1`}
              />
            </label>
          ))}
        </div>
        <p className="-mt-2 text-xs text-muted">{t("planPricesHint")}</p>
        <p className="text-sm font-semibold text-onSurface">{t("planSeatsTitle")}</p>
        <p className="-mt-2 text-xs text-muted">{t("planSeatsHint")}</p>
        <div className="grid grid-cols-3 gap-3">
          {SEAT_ROLES.map((r) => (
            <div key={r} className="grid gap-1">
              <span className="text-xs font-semibold text-onSurfaceSecondary">{t(ROLE_KEYS[r])}</span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder={t("planIncluded")}
                value={included[r]}
                onChange={(e) => setIncluded({ ...included, [r]: e.target.value })}
                className={input}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("planSeatPrice")}
                value={seatPrices[r]}
                onChange={(e) => setSeatPrices({ ...seatPrices, [r]: e.target.value })}
                className={input}
              />
            </div>
          ))}
        </div>
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
