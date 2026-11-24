"use client";

import { useLanguage } from "@/lib/i18n";

export const PAGE_SIZE = 50;

// "1-50 of 312" with Previous / Next. Hidden while everything fits on one page.
export function Pager({ page, total, onPage, pageSize = PAGE_SIZE }: { page: number; total: number; onPage: (page: number) => void; pageSize?: number }) {
  const { t } = useLanguage();
  if (total <= pageSize) return total > 0 ? <p className="no-print mt-3 text-xs text-muted">{t("pagerTotal")}: {total}</p> : null;
  const pages = Math.ceil(total / pageSize);
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const btn = "rounded-md border border-border bg-surfaceSecondary px-3 py-1.5 text-sm font-semibold text-onSurfaceSecondary hover:bg-surfaceTertiary disabled:opacity-40";
  return (
    <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">
        {from}-{to} {t("pagerOf")} {total}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>
          ‹ {t("pagerPrevious")}
        </button>
        <span className="text-xs text-muted">
          {page + 1} / {pages}
        </span>
        <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          {t("pagerNext")} ›
        </button>
      </div>
    </div>
  );
}

// A list that is loaded whole (products, customers): search and paging happen in the browser.
// `fields` gives the texts of a row that the search looks in.
export function matchesSearch(search: string, fields: Array<string | null | undefined>) {
  const needle = search.trim().toLowerCase();
  return !needle || fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

export function pageOf<T>(rows: T[], page: number, pageSize = PAGE_SIZE): { visible: T[]; page: number } {
  const last = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const current = Math.min(page, last); // rows were filtered or deleted: never past the last page
  return { visible: rows.slice(current * pageSize, (current + 1) * pageSize), page: current };
}
