"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { link } from "@/components/SubscriptionDialogs";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { detailOf } from "@/lib/subscriptions";

type Inquiry = {
  id: string;
  created_at: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  message: string;
  plan: string | null;
  lang: string;
  status: "new" | "handled";
  handled_at: string | null;
  handled_by: string | null;
  email_sent: boolean;
};
type Filter = "new" | "handled" | "all";

const FILTERS: Array<{ key: Filter; label: TranslationKey }> = [
  { key: "new", label: "inquiryFilterNew" },
  { key: "handled", label: "inquiryFilterHandled" },
  { key: "all", label: "inquiryFilterAll" },
];

const when = (iso: string) => new Date(iso).toLocaleString("sr-RS", { dateStyle: "short", timeStyle: "short" });

// Superadmin: messages from the website contact form (landing/).
export default function InquiriesPage() {
  const { t } = useLanguage();
  const [filter, setFilter] = useState<Filter>("new");
  const [items, setItems] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Inquiry | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/inquiries${filter === "all" ? "" : `?status=${filter}`}`);
    if (res.ok) {
      setItems(await res.json());
      setError(null);
    } else setError(await detailOf(res, t("loadFailed")));
    setLoading(false);
  }, [filter, t]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (item: Inquiry, status: Inquiry["status"]) => {
    const res = await fetch(`/api/inquiries/${item.id}`, { method: "PUT", body: JSON.stringify({ status }) });
    if (!res.ok) setError(await detailOf(res, t("saveFailed")));
    else await load();
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const res = await fetch(`/api/inquiries/${pendingDelete.id}`, { method: "DELETE" });
    setPendingDelete(null);
    if (!res.ok) setError(await detailOf(res, t("deleteFailed")));
    else await load();
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold text-onSurface">{t("inquiries")}</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("inquiriesHint")}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${filter === f.key ? "bg-brandSecondary text-brand" : "text-onSurfaceSecondary hover:bg-surfaceTertiary"}`}
          >
            {t(f.label)}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-error">{error}</p>}
      {loading ? (
        <p className="text-muted">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="rtable w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t("inquiryFrom")}</th>
                <th className="px-4 py-3">{t("inquiryMessage")}</th>
                <th className="px-4 py-3">{t("inquiryReceived")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-onSurface">{q.company || q.name}</p>
                    {q.company && <p className="text-xs text-onSurfaceSecondary">{q.name}</p>}
                    {q.email && (
                      <a className={`${link} block text-xs`} href={`mailto:${q.email}`}>
                        {q.email}
                      </a>
                    )}
                    {q.phone && (
                      <a className={`${link} block text-xs`} href={`tel:${q.phone.replace(/[^0-9+]/g, "")}`}>
                        {q.phone}
                      </a>
                    )}
                  </td>
                  <td data-label={t("inquiryMessage")} className="max-w-md px-4 py-3 text-onSurfaceSecondary">
                    <p className="whitespace-pre-wrap">{q.message}</p>
                    {q.plan && (
                      <p className="mt-1 text-xs text-muted">
                        {t("inquiryPlan")}: {q.plan}
                      </p>
                    )}
                  </td>
                  <td data-label={t("inquiryReceived")} className="whitespace-nowrap px-4 py-3 text-xs text-onSurfaceSecondary">
                    {when(q.created_at)} · {q.lang.toUpperCase()}
                    {!q.email_sent && <p className="text-muted">{t("inquiryNoEmail")}</p>}
                    {q.status === "handled" && q.handled_at && (
                      <p className="text-muted">
                        {t("inquiryHandledBy")}: {q.handled_by} · {when(q.handled_at)}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button className={`${link} mr-3`} onClick={() => setStatus(q, q.status === "new" ? "handled" : "new")}>
                      {t(q.status === "new" ? "inquiryMarkHandled" : "inquiryMarkNew")}
                    </button>
                    <button className="font-semibold text-error hover:underline" onClick={() => setPendingDelete(q)}>
                      {t("delete")}
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    {t("inquiryNone")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog itemName={pendingDelete.company || pendingDelete.name} onCancel={() => setPendingDelete(null)} onConfirm={remove} />
      )}
    </div>
  );
}
