"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { localizedDetail } from "@/lib/errors";
import { money } from "@/lib/orders";
import { useHasModule } from "@/lib/session-provider";

type PeriodType = "month" | "quarter" | "year";
type Metric = "revenue" | "orders" | "customers" | "focus_revenue";
type Row = {
  user_id: string;
  user_name: string;
  targets: Partial<Record<Metric, number>>;
  achieved: Partial<Record<Metric, number>>;
  previous_year: Partial<Record<Metric, number>>;
  pct: Partial<Record<Metric, number>>;
};
type Progress = { period_type: PeriodType; period: string; from_date: string; to_date: string; rows: Row[] };

const METRIC_KEY: Record<Metric, TranslationKey> = {
  revenue: "targetsMetricRevenue",
  orders: "targetsMetricOrders",
  customers: "targetsMetricCustomers",
  focus_revenue: "targetsMetricFocus",
};
const PERIOD_KEY: Record<PeriodType, TranslationKey> = {
  month: "targetsMonth",
  quarter: "targetsQuarter",
  year: "targetsYear",
};

function currentPeriod(type: PeriodType) {
  const now = new Date();
  const y = now.getFullYear();
  if (type === "year") return String(y);
  if (type === "quarter") return `${y}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  return `${y}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(type: PeriodType, period: string, delta: number) {
  if (type === "year") return String(Number(period) + delta);
  if (type === "quarter") {
    const [y, q] = period.split("-Q").map(Number);
    const index = y * 4 + (q - 1) + delta;
    return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
  }
  const [y, m] = period.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

const isMoney = (m: Metric) => m === "revenue" || m === "focus_revenue";
const show = (m: Metric, v: number | undefined) => (isMoney(m) ? money(v ?? 0) : String(Math.round(v ?? 0)));

export default function TargetsPage() {
  const { t } = useLanguage();
  const hasFocus = useHasModule("focus");
  const metrics = useMemo<Metric[]>(() => (hasFocus ? ["revenue", "orders", "customers", "focus_revenue"] : ["revenue", "orders", "customers"]), [hasFocus]);
  const [type, setType] = useState<PeriodType>("month");
  const [period, setPeriod] = useState(currentPeriod("month"));
  const [data, setData] = useState<Progress | null>(null);
  const [edit, setEdit] = useState<Record<string, Partial<Record<Metric, string>>>>({});
  const [growth, setGrowth] = useState("10");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/targets/progress?period_type=${type}&period=${period}`);
      if (res.ok) {
        const body = (await res.json()) as Progress;
        setData(body);
        const next: Record<string, Partial<Record<Metric, string>>> = {};
        body.rows.forEach((r) => {
          next[r.user_id] = {};
          (Object.keys(r.targets) as Metric[]).forEach((m) => (next[r.user_id][m] = String(r.targets[m] ?? "")));
        });
        setEdit(next);
      }
    } catch {
      setMessage({ ok: false, text: t("loadFailed") });
    }
  }, [type, period, t]);

  useEffect(() => {
    load();
  }, [load]);

  const changeType = (next: PeriodType) => {
    setType(next);
    setPeriod(currentPeriod(next));
    setMessage(null);
  };

  const setCell = (userId: string, m: Metric, value: string) =>
    setEdit((prev) => ({ ...prev, [userId]: { ...prev[userId], [m]: value } }));

  const saveRow = async (row: Row) => {
    setBusy(true);
    setMessage(null);
    const values: Record<string, number | null> = {};
    metrics.forEach((m) => {
      const raw = (edit[row.user_id]?.[m] ?? "").replace(",", ".").trim();
      values[m] = raw === "" ? null : Number(raw);
    });
    try {
      const res = await fetch("/api/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: row.user_id, period_type: type, period, values }),
      });
      if (!res.ok) {
        const out = await res.json().catch(() => ({}));
        setMessage({ ok: false, text: localizedDetail(out.detail, t, t("saveFailed")) });
      } else {
        setMessage({ ok: true, text: t("targetsSaved") });
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const copyPrevious = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/targets/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_type: type, from_period: shiftPeriod(type, period, -1), to_period: period }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ ok: true, text: t("targetsCopied").replace("{n}", String(out.copied ?? 0)) });
        await load();
      } else {
        setMessage({ ok: false, text: localizedDetail(out.detail, t, t("saveFailed")) });
      }
    } finally {
      setBusy(false);
    }
  };

  // Fills the empty fields with last year's result + the chosen growth (not saved until "Save").
  const suggest = () => {
    if (!data) return;
    const factor = 1 + (Number(growth.replace(",", ".")) || 0) / 100;
    setEdit((prev) => {
      const next = { ...prev };
      data.rows.forEach((r) => {
        const cells = { ...(next[r.user_id] ?? {}) };
        metrics.forEach((m) => {
          const before = r.previous_year[m] ?? 0;
          if (!(cells[m] ?? "").trim() && before > 0) cells[m] = String(Math.round(before * factor));
        });
        next[r.user_id] = cells;
      });
      return next;
    });
  };

  const primary = "rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50";
  const secondary = "rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-onSurface hover:bg-surfaceTertiary disabled:opacity-50";

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-onSurface">{t("targets")}</h1>
      <p className="mb-5 text-sm text-muted">{t("targetsIntro")}</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["month", "quarter", "year"] as PeriodType[]).map((p) => (
            <button
              key={p}
              onClick={() => changeType(p)}
              className={`px-3 py-1.5 text-sm font-semibold ${type === p ? "bg-brand text-white" : "bg-surfaceSecondary text-onSurface hover:bg-surfaceTertiary"}`}
            >
              {t(PERIOD_KEY[p])}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button className={secondary} onClick={() => setPeriod(shiftPeriod(type, period, -1))} aria-label="prev">‹</button>
          <span className="min-w-24 text-center font-bold text-onSurface">{period}</span>
          <button className={secondary} onClick={() => setPeriod(shiftPeriod(type, period, 1))} aria-label="next">›</button>
        </div>
        <button className={secondary} disabled={busy} onClick={copyPrevious}>{t("targetsCopyPrev")}</button>
        <div className="ml-auto flex items-end gap-2">
          <label className="text-xs font-semibold text-muted">
            {t("targetsSuggestPct")}
            <input
              inputMode="decimal"
              value={growth}
              onChange={(e) => setGrowth(e.target.value)}
              className="ml-2 w-16 rounded-md border border-border bg-surfaceSecondary px-2 py-1.5 text-sm"
            />
          </label>
          <button className={secondary} onClick={suggest}>{t("targetsSuggest")}</button>
        </div>
      </div>

      {message && <p className={`mb-3 text-sm font-semibold ${message.ok ? "text-success" : "text-error"}`}>{message.text}</p>}

      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">{t("targetsRep")}</th>
              {metrics.map((m) => (
                <th key={m} className="px-4 py-3">{t(METRIC_KEY[m])}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.user_id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3 font-semibold text-onSurface">{r.user_name}</td>
                {metrics.map((m) => {
                  const pct = r.pct[m];
                  const before = r.previous_year[m] ?? 0;
                  const achieved = r.achieved[m] ?? 0;
                  const delta = before > 0 ? ((achieved - before) / before) * 100 : null;
                  return (
                    <td key={m} className="min-w-40 px-4 py-3">
                      <label className="block text-xs font-semibold text-muted">
                        {t("targetsTarget")}
                        <input
                          inputMode="decimal"
                          value={edit[r.user_id]?.[m] ?? ""}
                          onChange={(e) => setCell(r.user_id, m, e.target.value)}
                          className="mt-1 block w-full rounded-md border border-border px-2 py-1.5 text-sm font-normal text-onSurface"
                        />
                      </label>
                      <p className="mt-2 text-xs text-muted">{t("targetsAchieved")}: <strong className="text-onSurface">{show(m, achieved)}</strong></p>
                      {pct != null && (
                        <div className="mt-1 h-2 overflow-hidden rounded bg-surfaceTertiary">
                          <div className={`h-full ${pct >= 100 ? "bg-success" : "bg-brand"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      )}
                      {pct != null && <p className="text-xs font-bold text-onSurface">{pct}%</p>}
                      <p className="mt-1 text-xs text-muted">
                        {t("targetsPrevYear")}: {show(m, before)}
                        {delta != null && (
                          <span className={delta >= 0 ? " text-success" : " text-error"}> ({delta >= 0 ? "+" : ""}{delta.toFixed(1)}%)</span>
                        )}
                      </p>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right">
                  <button className={primary} disabled={busy} onClick={() => saveRow(r)}>{t("targetsSave")}</button>
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={metrics.length + 2} className="px-4 py-6 text-center text-muted">{t("targetsNoReps")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
