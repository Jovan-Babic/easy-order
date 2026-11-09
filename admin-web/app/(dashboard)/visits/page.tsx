"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModuleGate } from "@/components/ModuleGate";
import { Field, fieldInput } from "@/components/FormField";
import { localizedDetail } from "@/lib/errors";
import { useLanguage } from "@/lib/i18n";
import {
  DueRow, Suggestion, Visit, VisitReport, VisitSettings, Zone,
  addDays, isoDate, mondayOf, weekdayName, WEEKDAYS,
} from "@/lib/visits";

type Rep = { id: string; name: string };
type Tab = "plan" | "due" | "zones" | "report";

// The admin's side of the visit plan (module `visits`): the plan of each sales rep, what is due, zones, a report.
export default function VisitsPage() {
  return (
    <ModuleGate module="visits">
      <VisitsTabs />
    </ModuleGate>
  );
}

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") + "." : "-");

function useApi() {
  const { t } = useLanguage();
  return useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(localizedDetail(body.detail, t, t("actionFailed")));
      return body;
    },
    [t],
  );
}

function VisitsTabs() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("plan");
  const [reps, setReps] = useState<Rep[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const api = useApi();
  const loadZones = useCallback(() => api("/api/zones").then(setZones).catch(() => setZones([])), [api]);

  useEffect(() => {
    api("/api/users")
      .then((users: Array<{ id: string; name: string; role: string; active?: boolean }>) =>
        setReps(users.filter((u) => u.role === "operator" && u.active !== false).map((u) => ({ id: u.id, name: u.name }))),
      )
      .catch(() => setReps([]));
    loadZones();
  }, [api, loadZones]);

  const tabs: Array<[Tab, string]> = [
    ["plan", t("visitsTabPlan")],
    ["due", t("visitsTabDue")],
    ["zones", t("visitsTabZones")],
    ["report", t("visitsTabReport")],
  ];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold text-onSurface">{t("visitsTitle")}</h1>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === key ? "border-brand text-brand" : "border-transparent text-muted hover:text-onSurface"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "plan" && <PlanTab reps={reps} />}
      {tab === "due" && <DueTab reps={reps} zones={zones} />}
      {tab === "zones" && <ZonesTab zones={zones} reload={loadZones} />}
      {tab === "report" && <ReportTab />}
    </div>
  );
}

const btn = "rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50";

// ---------------------------------------------------------------- plan

function PlanTab({ reps }: { reps: Rep[] }) {
  const { t, lang } = useLanguage();
  const api = useApi();
  const [repId, setRepId] = useState("");
  const [week, setWeek] = useState(mondayOf(isoDate(new Date())));
  const [visits, setVisits] = useState<Visit[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!repId) return setVisits([]);
    try {
      setVisits(await api(`/api/visits/plan?from=${week}&to=${addDays(week, 6)}&user_id=${repId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, repId, week]);
  useEffect(() => {
    setSuggestion(null);
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const suggest = () =>
    run(async () => {
      const from = week < isoDate(new Date()) ? isoDate(new Date()) : week;
      setSuggestion(await api("/api/visits/plan/suggest", { method: "POST", body: JSON.stringify({ from, to: addDays(week, 6), user_id: repId }) }));
    });
  const accept = () =>
    run(async () => {
      if (!suggestion) return;
      const items = suggestion.days.flatMap((d) => d.items.map((r) => ({ customer_id: r.customer_id, date: d.date })));
      await api("/api/visits/plan", { method: "POST", body: JSON.stringify({ items, user_id: repId }) });
      setSuggestion(null);
      await load();
    });
  const move = (v: Visit, date: string) =>
    run(async () => {
      await api(`/api/visits/${v.id}`, { method: "PUT", body: JSON.stringify({ date }) });
      await load();
    });
  const remove = (v: Visit) =>
    run(async () => {
      await api(`/api/visits/${v.id}`, { method: "DELETE" });
      await load();
    });

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const statusText = { planned: t("visitStatusPlanned"), done: t("visitStatusDone"), skipped: t("visitStatusSkipped") } as const;
  const statusColor = { planned: "text-onSurfaceSecondary", done: "text-brand", skipped: "text-warning" } as const;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-muted">
          {t("visitsRep")}
          <select value={repId} onChange={(e) => setRepId(e.target.value)} className="mt-1 block rounded-md border border-border bg-surfaceSecondary px-3 py-2 text-sm text-onSurface">
            <option value="">{t("visitsPickRep")}</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <button type="button" className={`${btn} border border-border`} onClick={() => setWeek(addDays(week, -7))}>{t("visitsPrevWeek")}</button>
        <span className="pb-2 text-sm font-semibold text-onSurface">{fmt(week)} – {fmt(addDays(week, 6))}</span>
        <button type="button" className={`${btn} border border-border`} onClick={() => setWeek(addDays(week, 7))}>{t("visitsNextWeek")}</button>
        <button type="button" className={`${btn} border border-border`} onClick={() => setWeek(mondayOf(isoDate(new Date())))}>{t("visitsThisWeek")}</button>
        <button type="button" disabled={busy || !repId} className={`${btn} bg-brand text-white`} onClick={suggest}>{t("visitsSuggest")}</button>
      </div>
      {error && <p className="mb-3 text-sm text-error">{error}</p>}

      {suggestion && (
        <div className="mb-5 rounded-lg border border-brand bg-surfaceSecondary p-4">
          <p className="mb-2 text-sm text-muted">{t("visitsSuggestHint")}</p>
          {suggestion.days.length === 0 && <p className="text-sm text-onSurface">{t("visitsNothingDue")}</p>}
          {suggestion.days.map((d) => (
            <div key={d.date} className="mb-2">
              <p className="text-sm font-bold text-onSurface">{weekdayName(d.date, lang)}, {fmt(d.date)}</p>
              <ul className="ml-5 list-disc text-sm text-onSurfaceSecondary">
                {d.items.map((r) => (
                  <li key={r.customer_id}>{r.name}{r.zone_name ? ` (${r.zone_name})` : ""}</li>
                ))}
              </ul>
            </div>
          ))}
          {suggestion.left_out > 0 && <p className="text-xs text-muted">{t("visitsLeftOut").replace("{n}", String(suggestion.left_out))}</p>}
          {suggestion.claimed > 0 && <p className="text-xs text-muted">{t("visitsClaimed").replace("{n}", String(suggestion.claimed))}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy || suggestion.days.length === 0} className={`${btn} bg-brand text-white`} onClick={accept}>{t("visitsAccept")}</button>
            <button type="button" className={`${btn} border border-border`} onClick={() => setSuggestion(null)}>{t("visitsDiscard")}</button>
          </div>
        </div>
      )}

      {repId && visits.length === 0 && !suggestion && <p className="text-muted">{t("visitsEmptyPlan")}</p>}
      <div className="space-y-4">
        {days.map((d) => {
          const list = visits.filter((v) => v.date === d);
          if (list.length === 0) return null;
          return (
            <div key={d} className="rounded-lg bg-surfaceSecondary p-4 shadow-sm">
              <p className="mb-2 font-bold text-onSurface">{weekdayName(d, lang)}, {fmt(d)}</p>
              <ul className="divide-y divide-border text-sm">
                {list.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="font-semibold text-onSurface">{v.customer_name}</span>
                    <span className="text-muted">{[v.street, v.city].filter(Boolean).join(", ")}</span>
                    {v.zone_name && <span className="rounded bg-brandSecondary px-2 text-xs text-brand">{v.zone_name}</span>}
                    <span className="text-xs text-muted">{v.channel === "call" ? t("visitChannelCall") : t("visitChannelVisit")}</span>
                    <span className={`text-xs font-semibold ${statusColor[v.status]}`}>{statusText[v.status]}</span>
                    {v.note && <span className="text-xs italic text-muted">„{v.note}“</span>}
                    {v.status === "planned" && (
                      <span className="ml-auto flex items-center gap-2">
                        <input type="date" min={isoDate(new Date())} value={v.date} onChange={(e) => e.target.value && move(v, e.target.value)} className="rounded-md border border-border px-2 py-1 text-xs" />
                        <button type="button" disabled={busy} onClick={() => remove(v)} className="text-xs font-semibold text-error hover:underline">{t("visitsRemove")}</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- due

function DueTab({ reps, zones }: { reps: Rep[]; zones: Zone[] }) {
  const { t } = useLanguage();
  const api = useApi();
  const [horizon, setHorizon] = useState("7");
  const [zoneId, setZoneId] = useState("");
  const [rows, setRows] = useState<DueRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [repId, setRepId] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ horizon_days: horizon });
    if (zoneId) qs.set("zone_id", zoneId);
    try {
      setRows(await api(`/api/visits/due?${qs.toString()}`));
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }, [api, horizon, zoneId]);
  useEffect(() => {
    setPicked(new Set());
    load();
  }, [load]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const add = async () => {
    setMessage(null);
    try {
      const out = await api("/api/visits/plan", {
        method: "POST",
        body: JSON.stringify({ items: [...picked].map((id) => ({ customer_id: id, date })), user_id: repId }),
      });
      setMessage({ ok: true, text: `${t("visitsAdded").replace("{n}", String(out.created.length))}${out.warnings.length ? ` ${t("visitsAddedWarn")}` : ""}` });
      setPicked(new Set());
      await load();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  };
  const dueText = (r: DueRow) =>
    r.days_overdue > 0 ? t("visitsLate").replace("{n}", String(r.days_overdue)) : r.days_overdue === 0 ? t("visitsDueToday") : t("visitsDueIn").replace("{n}", String(-r.days_overdue));

  const grouped = useMemo(() => {
    const map = new Map<string, DueRow[]>();
    rows.forEach((r) => map.set(r.zone_name ?? "", [...(map.get(r.zone_name ?? "") ?? []), r]));
    return [...map.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])));
  }, [rows]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-muted">
          {t("visitsHorizon")}
          <select value={horizon} onChange={(e) => setHorizon(e.target.value)} className="mt-1 block rounded-md border border-border bg-surfaceSecondary px-3 py-2 text-sm text-onSurface">
            {[0, 7, 14, 30].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          {t("visitZone")}
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="mt-1 block rounded-md border border-border bg-surfaceSecondary px-3 py-2 text-sm text-onSurface">
            <option value="">{t("visitsAllZones")}</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
        {picked.size > 0 && (
          <>
            <label className="text-xs font-semibold text-muted">
              {t("visitsRep")}
              <select value={repId} onChange={(e) => setRepId(e.target.value)} className="mt-1 block rounded-md border border-border bg-surfaceSecondary px-3 py-2 text-sm text-onSurface">
                <option value="">{t("visitsPickRep")}</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted">
              {t("visitsPickDate")}
              <input type="date" min={isoDate(new Date())} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-md border border-border px-3 py-2 text-sm text-onSurface" />
            </label>
            <button type="button" disabled={!repId || !date} onClick={add} className={`${btn} bg-brand text-white`}>{t("visitsAddToPlan")} ({picked.size})</button>
          </>
        )}
      </div>
      {message && <p className={`mb-3 text-sm ${message.ok ? "text-brand" : "text-error"}`}>{message.text}</p>}
      {rows.length === 0 && <p className="text-muted">{t("visitsNothingDue")}</p>}
      <div className="space-y-4">
        {grouped.map(([zone, list]) => (
          <div key={zone} className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
            <p className="border-b border-border px-4 py-2 text-sm font-bold text-onSurface">{zone || t("visitNoZone")}</p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="w-8 px-4 py-2" />
                  <th className="px-2 py-2">{t("visitsColCustomer")}</th>
                  <th className="px-2 py-2">{t("visitsColLastVisit")}</th>
                  <th className="px-2 py-2">{t("visitsColLastOrder")}</th>
                  <th className="px-2 py-2">{t("visitsColDue")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.customer_id} className="border-t border-border">
                    <td className="px-4 py-2"><input type="checkbox" checked={picked.has(r.customer_id)} onChange={() => toggle(r.customer_id)} /></td>
                    <td className="px-2 py-2">
                      <span className="font-semibold text-onSurface">{r.name}</span>
                      <span className="ml-2 text-xs text-muted">{[r.street, r.city].filter(Boolean).join(", ")}</span>
                      {r.planned.length > 0 && (
                        <span className="ml-2 text-xs text-warning">{r.planned.map((p) => t("visitsInPlanOf").replace("{name}", p.user_name).replace("{date}", fmt(p.date))).join("; ")}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-onSurfaceSecondary">{r.last_visit ? fmt(r.last_visit) : t("visitsNever")}</td>
                    <td className="px-2 py-2 text-onSurfaceSecondary">{fmt(r.last_order)}</td>
                    <td className={`px-2 py-2 font-semibold ${r.days_overdue > 0 ? "text-error" : "text-onSurface"}`}>{dueText(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- zones + settings

function ZonesTab({ zones, reload }: { zones: Zone[]; reload: () => Promise<unknown> | void }) {
  const { t, lang } = useLanguage();
  const api = useApi();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<VisitSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api("/api/visits/settings").then(setSettings).catch(() => setSettings(null));
  }, [api]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const saveSettings = async (next: VisitSettings) => {
    setSettings(next);
    setSaved(false);
    try {
      await api("/api/visits/settings", { method: "PUT", body: JSON.stringify(next) });
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-lg bg-surfaceSecondary p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-onSurface">{t("visitsZonesTitle")}</h2>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) run(async () => { await api("/api/zones", { method: "POST", body: JSON.stringify({ name }) }); setName(""); });
          }}
        >
          <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("visitsZoneName")} className={`${fieldInput} flex-1`} />
          <button type="submit" className={`${btn} bg-brand text-white`}>{t("visitsZoneAdd")}</button>
        </form>
        <ul className="divide-y divide-border text-sm">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center gap-3 py-2">
              <input
                defaultValue={z.name}
                maxLength={80}
                onBlur={(e) => e.target.value.trim() && e.target.value !== z.name && run(() => api(`/api/zones/${z.id}`, { method: "PUT", body: JSON.stringify({ name: e.target.value }) }))}
                className="flex-1 rounded-md border border-transparent px-2 py-1 font-semibold text-onSurface hover:border-border"
              />
              <span className="text-xs text-muted">{t("visitsZoneCustomers").replace("{n}", String(z.customer_count))}</span>
              <button type="button" onClick={() => run(() => api(`/api/zones/${z.id}`, { method: "DELETE" }))} className="text-xs font-semibold text-error hover:underline">{t("delete")}</button>
            </li>
          ))}
        </ul>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </section>

      {settings && (
        <section className="rounded-lg bg-surfaceSecondary p-5 shadow-sm">
          <h2 className="mb-3 font-bold text-onSurface">{t("visitsSettings")}</h2>
          <p className="mb-1 text-sm font-semibold text-onSurface">{t("visitsPlanDays")}</p>
          <div className="mb-3 flex flex-wrap gap-3">
            {WEEKDAYS[lang].map((label, i) => (
              <label key={i} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={settings.plan_days.includes(i)}
                  onChange={(e) => {
                    const days = e.target.checked ? [...settings.plan_days, i] : settings.plan_days.filter((d) => d !== i);
                    if (days.length) saveSettings({ ...settings, plan_days: days.sort() });
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <Field label={t("visitsMaxPerDay")}>
            <input type="number" min={1} max={60} value={settings.max_per_day} onChange={(e) => saveSettings({ ...settings, max_per_day: Math.max(1, Number(e.target.value) || 1) })} className={`${fieldInput} w-32`} />
          </Field>
          {saved && <p className="mt-2 text-sm text-brand">{t("sefSaved")}</p>}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- report

function ReportTab() {
  const { t } = useLanguage();
  const api = useApi();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [report, setReport] = useState<VisitReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = isoDate(new Date());
    const from = period === "week" ? mondayOf(today) : addDays(today, -30);
    const to = period === "week" ? addDays(mondayOf(today), 6) : today;
    api(`/api/visits/report?from=${from}&to=${to}`).then(setReport).catch((e) => setError(e.message));
  }, [api, period]);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {(["week", "month"] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={`${btn} border ${period === p ? "border-brand text-brand" : "border-border text-onSurface"}`}>
            {p === "week" ? t("visitsReportWeek") : t("visitsReportMonth")}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      {report && (
        <>
          <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">{t("visitsRep")}</th>
                  <th className="px-4 py-3 text-right">{t("visitsRepPlanned")}</th>
                  <th className="px-4 py-3 text-right">{t("visitsRepDone")}</th>
                  <th className="px-4 py-3 text-right">{t("visitsRepSkipped")}</th>
                  <th className="px-4 py-3 text-right">{t("visitsRepOverdue")}</th>
                  <th className="px-4 py-3 text-right">{t("visitsRepPct")}</th>
                </tr>
              </thead>
              <tbody>
                {report.reps.map((r) => (
                  <tr key={r.user_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold text-onSurface">{r.user_name}</td>
                    <td className="px-4 py-3 text-right">{r.planned}</td>
                    <td className="px-4 py-3 text-right">{r.done}</td>
                    <td className="px-4 py-3 text-right">{r.skipped}</td>
                    <td className={`px-4 py-3 text-right ${r.overdue_planned ? "font-bold text-error" : ""}`}>{r.overdue_planned}</td>
                    <td className="px-4 py-3 text-right">{r.done_pct === null ? "-" : `${r.done_pct}%`}</td>
                  </tr>
                ))}
                {report.reps.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{t("visitsNoReps")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm font-semibold text-onSurface">{t("visitsLateCustomers")}: {report.late_customers}</p>
          {report.late_by_zone.length > 0 && (
            <ul className="mt-1 text-sm text-onSurfaceSecondary">
              {report.late_by_zone.map((z) => (
                <li key={z.zone}>{z.zone || t("visitNoZone")}: {z.count}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
