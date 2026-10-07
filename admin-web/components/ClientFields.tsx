"use client";

import { useLanguage } from "@/lib/i18n";
import { ClientFormFields } from "@/lib/clientForm";
import { MODULES, toggleModule } from "@/lib/modules";

const input = "rounded-md border border-border px-3 py-2";

// Company + invoice settings inputs shared by the create and edit forms.
export function ClientFields({
  form,
  setForm,
  logoPreview,
  onPickLogo,
  onRemoveLogo,
  nextSeqHint,
}: {
  form: ClientFormFields;
  setForm: (f: ClientFormFields) => void;
  logoPreview: string;
  onPickLogo: (file: File) => void;
  onRemoveLogo: () => void;
  nextSeqHint?: number | null;
}) {
  const { t } = useLanguage();
  const set = (patch: Partial<ClientFormFields>) => setForm({ ...form, ...patch });
  return (
    <>
      <h2 className="font-bold text-onSurface">{t("company")}</h2>
      <input required placeholder={t("companyName")} value={form.name} onChange={(e) => set({ name: e.target.value })} className={input} />
      <input placeholder={t("address")} value={form.address} onChange={(e) => set({ address: e.target.value })} className={input} />
      <input placeholder={t("companyEmail")} value={form.email} onChange={(e) => set({ email: e.target.value })} className={input} />
      <input placeholder={t("companyPhone")} value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={input} />
      <input placeholder={t("taxIdPib")} value={form.pib} onChange={(e) => set({ pib: e.target.value })} className={input} />

      <h2 className="mt-2 font-bold text-onSurface">{t("modules")}</h2>
      <p className="-mt-2 text-xs text-muted">{t("modulesHint")}</p>
      {MODULES.map((m) => (
        <label key={m.key} className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.modules.includes(m.key)}
            onChange={(e) => set({ modules: toggleModule(form.modules, m.key, e.target.checked) })}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-onSurface">{t(m.labelKey)}</span>
            <span className="block text-xs text-muted">{t(m.descKey)}</span>
          </span>
        </label>
      ))}

      <h2 className="mt-2 font-bold text-onSurface">{t("invoiceSettings")}</h2>
      <input placeholder={t("registrationNumber")} value={form.registration_number} onChange={(e) => set({ registration_number: e.target.value })} className={input} />
      <input placeholder={t("bankAccount")} value={form.bank_account} onChange={(e) => set({ bank_account: e.target.value })} className={input} />
      <label className="text-sm font-semibold text-onSurfaceSecondary">
        {t("invoiceNumbering")}
        <select
          value={form.invoice_numbering}
          onChange={(e) => set({ invoice_numbering: e.target.value as "auto" | "manual" })}
          className={`${input} mt-1 block w-full`}
        >
          <option value="auto">{t("numberingAuto")}</option>
          <option value="manual">{t("numberingManual")}</option>
        </select>
      </label>
      {form.invoice_numbering === "auto" && (
        <>
          <input
            placeholder={t("invoicePrefix")}
            maxLength={10}
            value={form.invoice_prefix}
            onChange={(e) => set({ invoice_prefix: e.target.value.toUpperCase() })}
            className={input}
          />
          <p className="text-xs text-muted">{t("invoicePrefixHint")}</p>
          <input
            type="number"
            min={1}
            placeholder={`${t("nextInvoiceNumber")}${nextSeqHint ? ` (${nextSeqHint})` : ""}`}
            value={form.invoice_next_seq}
            onChange={(e) => set({ invoice_next_seq: e.target.value })}
            className={input}
          />
        </>
      )}

      <label className="block text-sm font-semibold text-onSurface">
        {t("expiryAlertDays")}
        <input
          placeholder="30, 15, 5"
          value={form.expiry_alert_days}
          onChange={(e) => set({ expiry_alert_days: e.target.value })}
          className={`${input} mt-1 block w-full`}
        />
      </label>
      <p className="-mt-2 text-xs text-muted">{t("expiryAlertDaysHint")}</p>

      <div className="flex items-center gap-3">
        {logoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoPreview} alt={t("logo")} className="h-14 w-14 rounded-md border border-border object-contain" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted">{t("logo")}</div>
        )}
        <label className="cursor-pointer rounded-md border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brandSecondary">
          {t("chooseLogo")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickLogo(file);
              e.target.value = "";
            }}
          />
        </label>
        {logoPreview && (
          <button type="button" onClick={onRemoveLogo} className="text-sm font-semibold text-error hover:underline">
            {t("removeLogo")}
          </button>
        )}
      </div>
    </>
  );
}
