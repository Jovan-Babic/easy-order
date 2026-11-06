"use client";

import { useCallback, useEffect, useState } from "react";
import { Field, fieldInput } from "@/components/FormField";
import { formatDate } from "@/lib/billing";
import { localizedDetail } from "@/lib/errors";
import { useLanguage } from "@/lib/i18n";
import type { SefEnv, SefSettings } from "@/lib/sef";

const ENVS: SefEnv[] = ["demo", "production"];

// SEF tab of the Integrations page: the company's connection to the e-invoicing system.
// Demo and production keep a key each (never shown again after saving); `env` picks the one used.
// A superadmin works on one client at a time (`clientId`).
export function SefIntegration({ clientId }: { clientId?: string }) {
  const { t } = useLanguage();
  const [data, setData] = useState<SefSettings | null>(null);
  const [keys, setKeys] = useState<Record<SefEnv, string>>({ demo: "", production: "" });
  const [terms, setTerms] = useState("15");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const query = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";

  const apply = useCallback((next: SefSettings) => {
    setData(next);
    setTerms(String(next.payment_terms_days));
  }, []);

  useEffect(() => {
    setData(null);
    setMessage(null);
    setKeys({ demo: "", production: "" });
    fetch(`/api/integrations/sef${query}`)
      .then(async (res) => (res.ok ? apply(await res.json()) : setMessage({ ok: false, text: t("loadFailed") })))
      .catch(() => setMessage({ ok: false, text: t("loadFailed") }));
  }, [apply, query, t]);

  const save = async (patch: Record<string, unknown>, okText = t("sefSaved")) => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/integrations/sef", { method: "PUT", body: JSON.stringify({ ...patch, ...(clientId ? { client_id: clientId } : {}) }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: localizedDetail(body.detail, t, t("actionFailed")) });
    apply(body as SefSettings);
    setKeys({ demo: "", production: "" });
    setMessage({ ok: true, text: okText });
  };

  const test = async (env: SefEnv) => {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/integrations/sef/test?env=${env}${clientId ? `&client_id=${encodeURIComponent(clientId)}` : ""}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: localizedDetail(body.detail, t, t("actionFailed")) });
    setMessage({ ok: body.ok, text: `${body.ok ? t("sefTestOk") : t("sefTestFailed")}${body.message ? `: ${body.message}` : ""}` });
    const fresh = await fetch(`/api/integrations/sef${query}`);
    if (fresh.ok) apply(await fresh.json());
  };

  if (!data) return <p className="text-muted">{message ? message.text : t("loading")}</p>;
  const button = "rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50";
  const envName = (env: SefEnv) => t(env === "demo" ? "sefEnvDemo" : "sefEnvProduction");

  return (
    <div className="max-w-2xl">
      <p className="mb-6 text-sm text-muted">{t("sefIntro")}</p>

      <div className="space-y-5 rounded-lg bg-surfaceSecondary p-5 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-semibold text-onSurface">
          <input type="checkbox" checked={data.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} />
          {t("sefEnabled")}
        </label>

        <Field label={t("sefEnvUsed")}>
          <select value={data.env} disabled={busy} onChange={(e) => save({ env: e.target.value })} className={fieldInput}>
            {ENVS.map((env) => (
              <option key={env} value={env}>{envName(env)}</option>
            ))}
          </select>
        </Field>
        {data.env === "production" && <p className="text-sm text-warning">{t("sefEnvWarn")}</p>}
        {!data.key_set && <p className="text-sm text-error">{t("sefKeyMissingForEnv")}</p>}

        {ENVS.map((env) => {
          const info = data.keys[env];
          return (
            <div key={env} className={`rounded-md border p-4 ${env === data.env ? "border-brand" : "border-border"}`}>
              <p className="font-semibold text-onSurface">
                {t("sefApiKey")} — {envName(env)} {env === data.env && <span className="ml-1 text-xs font-bold text-brand">({t("sefInUse")})</span>}
              </p>
              <p className="mb-2 text-sm text-muted">
                {info.set ? `${t("sefKeySet")} ${info.hint ?? ""} (${formatDate(info.set_at)})` : t("sefKeyNone")}
              </p>
              <Field label={t("sefKeyNew")}>
                <input
                  type="password"
                  autoComplete="off"
                  value={keys[env]}
                  onChange={(e) => setKeys({ ...keys, [env]: e.target.value })}
                  className={fieldInput}
                />
              </Field>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy || !keys[env].trim()} onClick={() => save({ api_key: keys[env], key_env: env })} className={`${button} bg-brand text-white`}>
                  {t("sefSave")}
                </button>
                {info.set && (
                  <>
                    <button type="button" disabled={busy} onClick={() => test(env)} className={`${button} border border-brand text-brand`}>
                      {t("sefTest")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => save({ api_key: "", key_env: env })} className={`${button} border border-error text-error`}>
                      {t("sefKeyRemove")}
                    </button>
                  </>
                )}
              </div>
              {info.last_check_at && (
                <p className={`mt-2 text-sm ${info.last_check_ok ? "text-brand" : "text-error"}`}>
                  {t("sefLastCheck")}: {formatDate(info.last_check_at)} — {info.last_check_ok ? t("sefTestOk") : t("sefTestFailed")}
                  {info.last_check_message ? ` (${info.last_check_message})` : ""}
                </p>
              )}
            </div>
          );
        })}

        <Field label={t("sefPaymentTerms")}>
          <div className="flex gap-2">
            <input type="number" min={0} max={365} value={terms} onChange={(e) => setTerms(e.target.value)} className={`${fieldInput} w-32`} />
            <button type="button" disabled={busy} onClick={() => save({ payment_terms_days: Number(terms) })} className={`${button} border border-brand text-brand`}>
              {t("sefSave")}
            </button>
          </div>
        </Field>
        {message && <p className={`text-sm ${message.ok ? "text-brand" : "text-error"}`}>{message.text}</p>}
      </div>
    </div>
  );
}
