"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { TranslationKey, useLanguage } from "@/lib/i18n";
import { money } from "@/lib/payments";

type Overview = {
  clients: { total: number; active: number; inactive: number; locked: number };
  users: { total: number; by_role: Record<string, number> };
  subscriptions: { active: number; ending_30d: number; grace: number; locked: number; none: number };
  payments: { currency: string; received_month: number; received_year: number; expected_total: number; overdue_total: number; overdue_count: number };
  attention: Array<{ client_id: string; client_name: string; reason: string; date: string | null; plan_name: string | null }>;
};

const REASON_KEYS: Record<string, TranslationKey> = {
  locked: "attentionLocked",
  purge_soon: "attentionPurgeSoon",
  payment_overdue: "attentionPaymentOverdue",
  grace: "attentionGrace",
  ending_soon: "attentionEndingSoon",
};

const REASON_STYLES: Record<string, string> = {
  locked: "bg-red-100 text-error",
  purge_soon: "bg-red-100 text-error",
  payment_overdue: "bg-red-100 text-error",
  grace: "bg-amber-100 text-warning",
  ending_soon: "bg-amber-100 text-warning",
};

type SystemStatus = {
  environment: string;
  smtp_configured: boolean;
  cloudinary_configured: boolean;
  auto_purge_enabled: boolean;
  app_version: string | null;
  cron: { configured: boolean; status: "ok" | "late" | "never" | "disabled"; last_run_at: string | null; live: boolean | null };
};

const CRON_KEYS: Record<SystemStatus["cron"]["status"], TranslationKey> = {
  ok: "cronOk",
  late: "cronLate",
  never: "cronNever",
  disabled: "cronDisabled",
};

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-0">
      <span className="text-sm text-onSurfaceSecondary">{label}</span>
      <span className={`text-sm font-semibold ${bad ? "text-error" : "text-onSurface"}`}>{value}</span>
    </div>
  );
}

// Is the daily job running, is mail/image storage set up.
function SystemCard() {
  const { t } = useLanguage();
  const [sys, setSys] = useState<SystemStatus | null>(null);
  useEffect(() => {
    fetch("/api/superadmin/system")
      .then((res) => (res.ok ? res.json() : null))
      .then(setSys)
      .catch(() => {});
  }, []);
  if (!sys) return null;
  const set = (on: boolean) => (on ? t("sysConfigured") : t("sysNotConfigured"));
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("systemStatus")}</h2>
      <div className="max-w-xl overflow-hidden rounded-lg bg-surfaceSecondary shadow-sm">
        <Row label={t("sysCron")} value={t(CRON_KEYS[sys.cron.status])} bad={sys.cron.status !== "ok"} />
        <Row label={t("lastRun")} value={sys.cron.last_run_at ? new Date(sys.cron.last_run_at).toLocaleString() : t("never")} />
        <Row label={t("sysAutoPurge")} value={sys.auto_purge_enabled ? t("sysOn") : t("sysOff")} />
        <Row label={t("sysSmtp")} value={set(sys.smtp_configured)} bad={!sys.smtp_configured} />
        <Row label={t("sysCloudinary")} value={set(sys.cloudinary_configured)} bad={!sys.cloudinary_configured} />
        <Row label={t("sysAppVersion")} value={sys.app_version ?? "-"} />
        <Row label={t("sysEnvironment")} value={sys.environment} />
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">{children}</div>
    </section>
  );
}

// Dashboard of the system owner: clients, users, subscriptions and what needs attention.
export function SuperadminDashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/superadmin/overview")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-error">{t("loadFailed")}</p>;
  if (!data) return <p className="text-muted">{t("loading")}</p>;
  const { clients, users, subscriptions, payments, attention } = data;
  const rsd = (v: number) => money(v, payments.currency);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-onSurface">{t("dashboard")}</h1>

      <Section title={t("clients")}>
        <StatCard label={t("overviewTotal")} value={clients.total} />
        <StatCard label={t("overviewActive")} value={clients.active} />
        <StatCard label={t("overviewDeactivated")} value={clients.inactive} />
        <StatCard label={t("subLocked")} value={clients.locked} />
      </Section>

      <Section title={t("users")}>
        <StatCard label={t("overviewTotal")} value={users.total} />
        <StatCard label={t("userRoleAdmin")} value={users.by_role.admin ?? 0} />
        <StatCard label={t("userRoleOperator")} value={users.by_role.operator ?? 0} />
        <StatCard label={t("userRoleWarehouse")} value={users.by_role.warehouse ?? 0} />
      </Section>

      <Section title={t("subscriptions")}>
        <StatCard label={t("subActive")} value={subscriptions.active} />
        <StatCard label={t("overviewEnding30")} value={subscriptions.ending_30d} />
        <StatCard label={t("subGrace")} value={subscriptions.grace} />
        <StatCard label={t("subLocked")} value={subscriptions.locked} />
        <StatCard label={t("subNone")} value={subscriptions.none} />
      </Section>

      <Section title={t("payments")}>
        <StatCard label={t("overviewReceivedMonth")} value={rsd(payments.received_month)} />
        <StatCard label={t("overviewReceivedYear")} value={rsd(payments.received_year)} />
        <StatCard label={t("overviewDebt")} value={rsd(payments.expected_total)} />
        <StatCard label={t("overviewOverdue")} value={`${rsd(payments.overdue_total)} (${payments.overdue_count})`} />
      </Section>

      <SystemCard />

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t("needsAttention")}</h2>
        <div className="overflow-x-auto rounded-lg bg-surfaceSecondary shadow-sm">
          {attention.length === 0 ? (
            <p className="p-5 text-sm text-muted">{t("needsAttentionEmpty")}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <tbody>
                {attention.map((a) => (
                  <tr key={`${a.client_id}-${a.reason}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${a.client_id}`} className="font-semibold text-brand hover:underline">
                        {a.client_name}
                      </Link>
                      {a.plan_name && <span className="ml-2 text-xs text-muted">{a.plan_name}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${REASON_STYLES[a.reason]}`}>
                        {t(REASON_KEYS[a.reason])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-onSurfaceSecondary">{a.date ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
