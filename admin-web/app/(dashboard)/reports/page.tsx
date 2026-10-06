"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { StatusBadge } from "@/components/StatusBadge";
import { OrderStatus, money } from "@/lib/orders";

type Person = { user_id?: string | null; name: string; total: number; shipped: number; rejected: number; canceled: number };
type Report = {
  order_count: number;
  by_status: Record<string, { count: number; grand: number }>;
  by_creator: Person[];
  by_handler: Person[];
  avg_hours_to_ship: number | null;
};

const STATUSES: OrderStatus[] = ["new", "in_progress", "shipped", "rejected", "canceled"];

export default function ReportsPage() {
  const { t } = useLanguage();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    try {
      const res = await fetch(`/api/reports/orders?${params.toString()}`);
      setReport(res.ok ? ((await res.json()) as Report) : null);
    } catch {
      setReport(null);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const field = "rounded-md border border-border bg-surfaceSecondary px-3 py-1.5 text-sm";
  const th = "px-4 py-3";

  const peopleTable = (title: string, rows: Person[], showCanceled: boolean) => (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted">
            <tr>
              <th className={th}>{t("reportPerson")}</th>
              <th className={`${th} text-right`}>{t("reportTotal")}</th>
              <th className={`${th} text-right`}>{t("reportShipped")}</th>
              <th className={`${th} text-right`}>{t("reportRejected")}</th>
              {showCanceled && <th className={`${th} text-right`}>{t("reportCanceled")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.user_id ?? p.name} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-onSurface">{p.name}</td>
                <td className="px-4 py-3 text-right">{p.total}</td>
                <td className="px-4 py-3 text-right">{p.shipped}</td>
                <td className="px-4 py-3 text-right">{p.rejected}</td>
                {showCanceled && <td className="px-4 py-3 text-right">{p.canceled}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">{t("reportNoData")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">{t("reports")}</h1>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-muted">
          {t("fromDate")}
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${field} ml-2`} />
        </label>
        <label className="text-xs font-semibold text-muted">
          {t("toDate")}
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${field} ml-2`} />
        </label>
        {report?.avg_hours_to_ship != null && (
          <p className="ml-auto text-sm text-onSurfaceSecondary">
            {t("avgHoursToShip")}: <strong>{report.avg_hours_to_ship}</strong>
          </p>
        )}
      </div>

      {report && (
        <>
          <section className="mb-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{t("reportByStatus")}</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {STATUSES.map((s) => (
                <div key={s} className="rounded-lg bg-surfaceSecondary p-4 shadow-sm">
                  <StatusBadge status={s} />
                  <p className="mt-2 text-2xl font-extrabold text-onSurface">{report.by_status[s]?.count ?? 0}</p>
                  <p className="text-xs text-muted">{money(report.by_status[s]?.grand ?? 0)}</p>
                </div>
              ))}
            </div>
          </section>
          {peopleTable(t("reportByCreator"), report.by_creator, true)}
          {peopleTable(t("reportByHandler"), report.by_handler, false)}
        </>
      )}
    </div>
  );
}
