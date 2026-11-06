"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { localizedDetail } from "@/lib/errors";
import { formatDate } from "@/lib/billing";
import { money } from "@/lib/orders";
import { Einvoice, EinvoicePreview, STATUS_TEXT, problemText } from "@/lib/sef";

// Issuing the e-invoice of a shipped order: what is missing, the amounts SEF will get,
// an optional validation on the demo SEF, sending, the status, cancel and storno.
export function EinvoiceModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const [preview, setPreview] = useState<EinvoicePreview | null>(null);
  const [current, setCurrent] = useState<Einvoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [action, setAction] = useState<"cancel" | "storno" | null>(null);
  const [comment, setComment] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  // what the admin typed (delivery date, manual invoice number) goes with every preview / send
  const typed = useCallback(
    () => ({
      ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
      ...(invoiceNumber.trim() ? { invoice_number: invoiceNumber.trim() } : {}),
    }),
    [deliveryDate, invoiceNumber],
  );

  const fail = useCallback(
    (body: { detail?: unknown }) => {
      const detail = body?.detail as { sef_error?: string; problems?: string[] } | string | undefined;
      if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        if (detail.sef_error) return setError(`SEF: ${detail.sef_error}`);
        if (detail.problems) return setError(detail.problems.map((p) => problemText(p, lang)).join("; "));
      }
      setError(localizedDetail(detail, t, t("actionFailed")));
    },
    [lang, t],
  );

  const loadPreview = useCallback(
    async (extra: Record<string, unknown> = {}) => {
      const res = await fetch(`/api/orders/${orderId}/einvoice/preview`, { method: "POST", body: JSON.stringify({ ...typed(), ...extra }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return fail(body);
      setPreview(body as EinvoicePreview);
      setCurrent((body as EinvoicePreview).current);
      return body as EinvoicePreview;
    },
    [orderId, fail, typed],
  );

  // First load only; later reloads follow the "Check" button so typing does not fire a request per key.
  useEffect(() => {
    loadPreview().then((out) => {
      if (out?.delivery_editable && out.delivery_date) setDeliveryDate(out.delivery_date);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const validate = () =>
    run(async () => {
      const out = await loadPreview({ validate_on_sef: true });
      if (out?.validation) {
        if (out.validation.ok) setInfo(t("sefValidationOk"));
        else setError(`${t("sefValidationFailed")} ${out.validation.message ?? ""}`);
      }
    });

  const send = () =>
    run(async () => {
      if (!window.confirm(t("sefSendConfirm"))) return;
      const res = await fetch(`/api/orders/${orderId}/einvoice`, { method: "POST", body: JSON.stringify(typed()) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return fail(body);
      setCurrent(body as Einvoice);
      if ((body as Einvoice).status === "error" || (body as Einvoice).error_text) setError((body as Einvoice).error_text);
    });

  const refresh = () =>
    run(async () => {
      const res = await fetch(`/api/orders/${orderId}/einvoice`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return fail(body);
      setCurrent(body.current);
      if (body.refresh_error) setError(`${t("sefRefreshFailed")} ${body.refresh_error}`);
    });

  const act = () =>
    run(async () => {
      if (!action || !comment.trim()) return;
      const res = await fetch(`/api/orders/${orderId}/einvoice/${action}`, { method: "POST", body: JSON.stringify({ comment }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return fail(body);
      setCurrent(body as Einvoice);
      setAction(null);
      setComment("");
    });

  const showXml = () =>
    run(async () => {
      const res = await fetch(`/api/orders/${orderId}/einvoice/xml`);
      if (res.ok) setXml(await res.text());
      else {
        const out = await loadPreview({ include_xml: true });
        setXml(out?.xml ?? null);
      }
    });

  const issued = current && ["sending", "sent", "approved", "rejected"].includes(current.status);
  const canRetry = current?.status === "sending" && !current.sef_invoice_id;
  const ready = preview?.sef.configured && preview.sef.enabled;
  const btn = "rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-extrabold text-onSurface">
            {t("sefModalTitle")} {preview?.number ? `· ${preview.number}` : ""}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-onSurface">
            {t("close")}
          </button>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm">
          {!preview && !error && <p className="text-muted">{t("loading")}</p>}
          {preview && !ready && <p className="rounded-md bg-amber-50 p-3 text-warning">{t("sefNotReady")}</p>}

          {current && (
            <div className="rounded-md border border-border p-3">
              <p className="font-semibold text-onSurface">
                {t("sefStatus")}: {STATUS_TEXT[current.status]?.[lang === "en" ? 1 : 0] ?? current.status}
                {current.sef_status ? ` (${current.sef_status})` : ""}
              </p>
              <p className="mt-1 text-muted">
                {t("sefNumber")}: {current.number} · {t("sefSefId")}: {current.sef_invoice_id ?? "—"} · {t("sefEnvLabel")}: {current.env}
              </p>
              {current.error_text && (
                <p className="mt-1 text-error">
                  {t("sefError")}: {current.error_text}
                  {current.error_code ? ` [${current.error_code}]` : ""}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {issued && (
                  <button type="button" disabled={busy} onClick={refresh} className={`${btn} border border-brand text-brand`}>
                    {t("sefRefresh")}
                  </button>
                )}
                {canRetry && (
                  <button type="button" disabled={busy} onClick={send} className={`${btn} bg-brand text-white`}>
                    {t("sefRetry")}
                  </button>
                )}
                {current.sef_invoice_id && ["sent", "approved", "rejected"].includes(current.status) && (
                  <>
                    <button type="button" disabled={busy} onClick={() => setAction("cancel")} className={`${btn} border border-error text-error`}>
                      {t("sefCancel")}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setAction("storno")} className={`${btn} border border-error text-error`}>
                      {t("sefStorno")}
                    </button>
                  </>
                )}
              </div>
              {action && (
                <div className="mt-3 space-y-2">
                  <input
                    value={comment}
                    maxLength={500}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t("sefComment")}
                    className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  />
                  <button type="button" disabled={busy || !comment.trim()} onClick={act} className={`${btn} bg-error text-white`}>
                    {t("sefConfirmAction")} ({action === "cancel" ? t("sefCancel") : t("sefStorno")})
                  </button>
                </div>
              )}
            </div>
          )}

          {preview && (!issued || current?.status === "error") && (
            <>
              {preview.problems.length > 0 && (
                <div className="rounded-md bg-red-50 p-3 text-error">
                  <p className="font-semibold">{t("sefProblems")}</p>
                  <ul className="ml-5 list-disc">
                    {preview.problems.map((p) => (
                      <li key={p}>{problemText(p, lang)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.manual_numbering && preview.number_pending && (
                <label className="block text-xs text-muted">
                  {t("sefNumber")}
                  <input
                    value={invoiceNumber}
                    maxLength={100}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    onBlur={() => loadPreview()}
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm text-onSurface"
                  />
                </label>
              )}
              {!preview.manual_numbering && preview.number_pending && <p className="text-muted">{t("sefNumberPending")}</p>}
              <dl className="grid grid-cols-3 gap-2 text-onSurface">
                <div><dt className="text-xs text-muted">{t("sefIssueDate")}</dt><dd>{formatDate(preview.issue_date)}</dd></div>
                <div>
                  <dt className="text-xs text-muted">{t("sefDeliveryDate")}</dt>
                  <dd>
                    {preview.delivery_editable ? (
                      <input
                        type="date"
                        value={deliveryDate}
                        max={preview.issue_date}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        onBlur={() => loadPreview()}
                        className="rounded-md border border-border px-2 py-1 text-sm"
                      />
                    ) : (
                      formatDate(preview.delivery_date) || "—"
                    )}
                  </dd>
                </div>
                <div><dt className="text-xs text-muted">{t("sefDueDate")}</dt><dd>{formatDate(preview.due_date) || "—"}</dd></div>
              </dl>
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-muted">
                  <tr><th className="py-1">{t("sefAmounts")}</th><th className="py-1 text-right">{t("sefNet")}</th><th className="py-1 text-right">{t("sefVat")}</th></tr>
                </thead>
                <tbody>
                  {preview.amounts.categories.map((c) => (
                    <tr key={c.vat_rate} className="border-t border-border">
                      <td className="py-1">{c.vat_rate}%</td>
                      <td className="py-1 text-right">{money(c.taxable)}</td>
                      <td className="py-1 text-right">{money(c.vat)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border font-bold">
                    <td className="py-1">{t("sefTotal")}</td>
                    <td className="py-1 text-right">{money(preview.amounts.subtotal)}</td>
                    <td className="py-1 text-right">{money(preview.amounts.vat)}</td>
                  </tr>
                  <tr className="border-t border-border font-bold">
                    <td className="py-1" colSpan={2}>{t("sefPayable")}</td>
                    <td className="py-1 text-right">{money(preview.amounts.grand)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || preview.problems.length > 0 || !ready} onClick={validate} className={`${btn} border border-brand text-brand`}>
                  {t("sefValidate")}
                </button>
                <button type="button" disabled={busy || preview.problems.length > 0 || !ready} onClick={send} className={`${btn} bg-brand text-white`}>
                  {t("sefSend")}
                </button>
              </div>
            </>
          )}

          {info && <p className="text-brand">{info}</p>}
          {error && <p className="text-error">{error}</p>}

          <div>
            <button type="button" disabled={busy || (preview?.problems.length ?? 1) > 0 && !current} onClick={showXml} className="text-sm font-semibold text-brand underline disabled:opacity-40">
              {t("sefXml")}
            </button>
            {xml && <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-surfaceSecondary p-3 text-xs">{xml}</pre>}
          </div>
        </div>
      </div>
    </div>
  );
}
