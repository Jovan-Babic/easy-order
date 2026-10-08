"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { detailOf } from "@/lib/subscriptions";

type Entry = {
  id: string;
  created_at: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_name: string | null;
  client_id: string | null;
  data: Record<string, unknown> | null;
};

const AREAS = ["client.", "subscription.", "plan.", "user.", "announcement."];
const PAGE = 50;

// Read-only log of what the superadmin did (clients, plans, subscriptions, payments, users, announcements).
export default function AuditPage() {
  const { t } = useLanguage();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [area, setArea] = useState("");
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (skip: number) => {
      const params = new URLSearchParams({ limit: String(PAGE), skip: String(skip) });
      if (area) params.set("action", area);
      const res = await fetch(`/api/audit?${params.toString()}`);
      if (!res.ok) {
        setError(await detailOf(res, t("loadFailed")));
        setLoading(false);
        return;
      }
      const rows: Entry[] = await res.json();
      setEntries((prev) => (skip === 0 ? rows : [...prev, ...rows]));
      setMore(rows.length === PAGE);
      setError(null);
      setLoading(false);
    },
    [area, t]
  );

  useEffect(() => {
    setLoading(true);
    load(0);
  }, [load]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">{t("audit")}</h1>
      <select value={area} onChange={(e) => setArea(e.target.value)} className="mb-4 rounded-md border border-border px-3 py-2 text-sm">
        <option value="">{t("auditAll")}</option>
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {a}*
          </option>
        ))}
      </select>
      {error && <p className="mb-3 text-sm text-error">{error}</p>}
      {loading ? (
        <p className="text-muted">{t("loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t("date")}</th>
                <th className="px-4 py-3">{t("auditActor")}</th>
                <th className="px-4 py-3">{t("auditAction")}</th>
                <th className="px-4 py-3">{t("auditTarget")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-onSurfaceSecondary">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-onSurface">{e.actor_name ?? "-"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-onSurface">{e.action}</td>
                  <td className="px-4 py-3 text-onSurfaceSecondary">
                    {e.client_id && e.target_type === "client" ? (
                      <Link href={`/clients/${e.client_id}`} className="font-semibold text-brand hover:underline">
                        {e.target_name ?? e.client_id}
                      </Link>
                    ) : (
                      e.target_name ?? "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {e.data ? Object.entries(e.data).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : ""}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    {t("auditEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {more && !loading && (
        <button onClick={() => load(entries.length)} className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-semibold text-onSurfaceSecondary">
          {t("auditMore")}
        </button>
      )}
    </div>
  );
}
