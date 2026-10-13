"use client";

import { useCallback, useEffect, useState } from "react";
import { input, primary } from "@/components/SubscriptionDialogs";
import { localizedDetail } from "@/lib/errors";
import { TranslationKey, useLanguage } from "@/lib/i18n";

type Kind = "day" | "number" | "bool" | "text" | "textarea" | "days";
type Field = { key: string; label: TranslationKey; kind: Kind; hint?: TranslationKey };
type Tab = "billing" | "payment" | "issuer" | "email";

const TABS: Array<{ key: Tab; label: TranslationKey; fields: Field[] }> = [
  {
    key: "billing",
    label: "settingsTabBilling",
    fields: [
      { key: "draft_day", label: "setDraftDay", kind: "day", hint: "setDraftDayHint" },
      { key: "due_day", label: "setDueDay", kind: "day" },
      { key: "block_after_day", label: "setBlockAfterDay", kind: "day", hint: "setBlockAfterDayHint" },
      { key: "first_month_free", label: "setFirstMonthFree", kind: "bool" },
      { key: "reminder_days", label: "setReminderDays", kind: "number", hint: "setReminderDaysHint" },
      { key: "purge_after_days", label: "setPurgeAfterDays", kind: "number", hint: "setPurgeAfterDaysHint" },
      { key: "expiry_alert_days", label: "setExpiryAlertDays", kind: "days", hint: "setExpiryAlertDaysHint" },
    ],
  },
  {
    key: "payment",
    label: "settingsTabPayment",
    fields: [
      { key: "payment_instructions_sr", label: "setInstructionsSr", kind: "textarea" },
      { key: "payment_instructions_en", label: "setInstructionsEn", kind: "textarea" },
      { key: "ips_account", label: "setIpsAccount", kind: "text", hint: "setIpsAccountHint" },
      { key: "ips_recipient_name", label: "setIpsRecipient", kind: "text" },
      { key: "ips_payment_code", label: "setIpsCode", kind: "text" },
      { key: "ips_purpose", label: "setIpsPurpose", kind: "text" },
      { key: "ips_reference_from_number", label: "setIpsReference", kind: "bool" },
    ],
  },
  {
    key: "issuer",
    label: "settingsTabIssuer",
    fields: [
      { key: "issuer_name", label: "setIssuerName", kind: "text" },
      { key: "issuer_address", label: "setIssuerAddress", kind: "text" },
      { key: "issuer_pib", label: "setIssuerPib", kind: "text" },
      { key: "issuer_account", label: "setIssuerAccount", kind: "text" },
      { key: "issuer_note", label: "setIssuerNote", kind: "textarea" },
    ],
  },
  {
    key: "email",
    label: "settingsTabEmail",
    fields: [
      { key: "billing_from_email", label: "setFromEmail", kind: "text", hint: "setFromEmailHint" },
      { key: "billing_from_name", label: "setFromName", kind: "text" },
      { key: "billing_reply_to", label: "setReplyTo", kind: "text" },
      { key: "bilingual_emails", label: "setBilingual", kind: "bool" },
    ],
  },
];

type Values = Record<string, unknown>;

const toText = (kind: Kind, value: unknown) =>
  kind === "days" ? (Array.isArray(value) ? value.join(", ") : "") : value === null || value === undefined ? "" : String(value);

// Superadmin: business values that are not in env (billing cycle, payment details, issuer, email).
export default function SettingsPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>("billing");
  const [values, setValues] = useState<Values | null>(null);
  const [defaults, setDefaults] = useState<Values>({});
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = useCallback((body: { values: Values; defaults: Values }) => {
    setValues(body.values);
    setDefaults(body.defaults);
    const next: Record<string, string | boolean> = {};
    TABS.flatMap((x) => x.fields).forEach((f) => {
      next[f.key] = f.kind === "bool" ? Boolean(body.values[f.key]) : toText(f.kind, body.values[f.key]);
    });
    setForm(next);
  }, []);

  useEffect(() => {
    fetch("/api/settings").then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (res.ok) apply(body);
      else setMessage({ ok: false, text: localizedDetail(body.detail, t, t("loadFailed")) });
    });
  }, [apply, t]);

  const current = TABS.find((x) => x.key === tab)!;

  const save = async () => {
    if (!values) return;
    // Only what changed; an emptied field goes back to its default.
    const body: Record<string, unknown> = {};
    for (const f of current.fields) {
      const now = form[f.key];
      const before = f.kind === "bool" ? Boolean(values[f.key]) : toText(f.kind, values[f.key]);
      if (now === before) continue;
      if (f.kind === "bool") body[f.key] = now;
      else if (now === "") body[f.key] = null;
      else if (f.kind === "day" || f.kind === "number") body[f.key] = Number(now);
      else if (f.kind === "days") body[f.key] = String(now).split(/[,\s]+/).filter(Boolean).map(Number);
      else body[f.key] = now;
    }
    if (Object.keys(body).length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", { method: "PUT", body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(out.detail) ? t("saveFailed") : out.detail;
        setMessage({ ok: false, text: localizedDetail(detail, t, t("saveFailed")) });
        return;
      }
      apply(out);
      setMessage({ ok: true, text: t("settingsSaved") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-extrabold text-onSurface">{t("settings")}</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("settingsHint")}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => {
              setTab(x.key);
              setMessage(null);
            }}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${tab === x.key ? "bg-brandSecondary text-brand" : "text-onSurfaceSecondary hover:bg-surfaceTertiary"}`}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      {!values ? (
        message ? <p className="text-error">{message.text}</p> : <p className="text-muted">{t("loading")}</p>
      ) : (
        <div className="max-w-2xl rounded-lg bg-surfaceSecondary p-6 shadow-sm">
          <div className="grid gap-4">
            {current.fields.map((f) =>
              f.kind === "bool" ? (
                <label key={f.key} className="flex items-center gap-2 text-sm font-semibold text-onSurface">
                  <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />
                  {t(f.label)}
                </label>
              ) : (
                <label key={f.key} className="text-sm font-semibold text-onSurface">
                  {t(f.label)}
                  {f.kind === "textarea" ? (
                    <textarea
                      rows={3}
                      value={String(form[f.key] ?? "")}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className={`${input} mt-1`}
                    />
                  ) : (
                    <input
                      type={f.kind === "day" || f.kind === "number" ? "number" : "text"}
                      min={f.kind === "day" ? 1 : undefined}
                      max={f.kind === "day" ? 28 : undefined}
                      value={String(form[f.key] ?? "")}
                      placeholder={toText(f.kind, defaults[f.key])}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className={`${input} mt-1`}
                    />
                  )}
                  {f.hint && <span className="mt-1 block text-xs font-normal text-muted">{t(f.hint)}</span>}
                </label>
              ),
            )}
          </div>
          {message && <p className={`mt-4 text-sm ${message.ok ? "text-success" : "text-error"}`}>{message.text}</p>}
          <div className="mt-5 flex justify-end">
            <button type="button" disabled={busy} onClick={save} className={primary}>
              {t("save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
