"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { localizedDetail } from "@/lib/errors";
import { formatDate } from "@/lib/billing";
import { Field, fieldInput } from "@/components/FormField";
import { ModuleGate } from "@/components/ModuleGate";
import type { SefSettings } from "@/lib/sef";

// The client admin connects the company to SEF: API key (stored encrypted, never shown again),
// environment, payment terms and a connection check.
export default function IntegrationsPage() {
  return (
    <ModuleGate module="sef">
      <SefSettingsPanel />
    </ModuleGate>
  );
}

function SefSettingsPanel() {
  const { t } = useLanguage();
  const [data, setData] = useState<SefSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [terms, setTerms] = useState("15");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((next: SefSettings) => {
    setData(next);
    setTerms(String(next.payment_terms_days));
  }, []);

  useEffect(() => {
    fetch("/api/integrations/sef")
      .then(async (res) => (res.ok ? apply(await res.json()) : setMessage({ ok: false, text: t("loadFailed") })))
      .catch(() => setMessage({ ok: false, text: t("loadFailed") }));
  }, [apply, t]);

  const save = async (patch: Record<string, unknown>, okText = t("sefSaved")) => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/integrations/sef", { method: "PUT", body: JSON.stringify(patch) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: localizedDetail(body.detail, t, t("actionFailed")) });
    apply(body as SefSettings);
    setApiKey("");
    setMessage({ ok: true, text: okText });
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/integrations/sef/test", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ ok: false, text: localizedDetail(body.detail, t, t("actionFailed")) });
    setMessage({ ok: body.ok, text: `${body.ok ? t("sefTestOk") : t("sefTestFailed")}${body.message ? `: ${body.message}` : ""}` });
    const fresh = await fetch("/api/integrations/sef");
    if (fresh.ok) apply(await fresh.json());
  };

  if (!data) return <p className="text-muted">{message ? message.text : t("loading")}</p>;
  const button = "rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-2xl font-extrabold text-onSurface">{t("sefTitle")}</h1>
      <p className="mb-6 text-sm text-muted">{t("sefIntro")}</p>

      <div className="space-y-5 rounded-lg bg-surfaceSecondary p-5 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-semibold text-onSurface">
          <input type="checkbox" checked={data.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} />
          {t("sefEnabled")}
        </label>

        <Field label={t("sefEnv")}>
          <select value={data.env} disabled={busy} onChange={(e) => save({ env: e.target.value })} className={fieldInput}>
            <option value="demo">{t("sefEnvDemo")}</option>
            <option value="production">{t("sefEnvProduction")}</option>
          </select>
        </Field>
        {data.env === "production" && <p className="text-sm text-warning">{t("sefEnvWarn")}</p>}

        <div>
          <p className="mb-1 text-sm font-semibold text-onSurface">
            {t("sefApiKey")}: {data.key_set ? `${t("sefKeySet")} ${data.key_hint ?? ""} (${formatDate(data.key_set_at)})` : t("sefKeyNone")}
          </p>
          <Field label={t("sefKeyNew")}>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={fieldInput}
            />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !apiKey.trim()} onClick={() => save({ api_key: apiKey })} className={`${button} bg-brand text-white`}>
              {t("sefSave")}
            </button>
            {data.key_set && (
              <button type="button" disabled={busy} onClick={() => save({ api_key: "" })} className={`${button} border border-error text-error`}>
                {t("sefKeyRemove")}
              </button>
            )}
          </div>
        </div>

        <Field label={t("sefPaymentTerms")}>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={365}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className={`${fieldInput} w-32`}
            />
            <button type="button" disabled={busy} onClick={() => save({ payment_terms_days: Number(terms) })} className={`${button} border border-brand text-brand`}>
              {t("sefSave")}
            </button>
          </div>
        </Field>

        <div className="border-t border-border pt-4">
          <button type="button" disabled={busy || !data.key_set} onClick={test} className={`${button} border border-brand text-brand`}>
            {t("sefTest")}
          </button>
          {data.last_check_at && (
            <p className={`mt-2 text-sm ${data.last_check_ok ? "text-brand" : "text-error"}`}>
              {t("sefLastCheck")}: {formatDate(data.last_check_at)} — {data.last_check_ok ? t("sefTestOk") : t("sefTestFailed")}
              {data.last_check_message ? ` (${data.last_check_message})` : ""}
            </p>
          )}
        </div>
        {message && <p className={`text-sm ${message.ok ? "text-brand" : "text-error"}`}>{message.text}</p>}
      </div>
    </div>
  );
}
