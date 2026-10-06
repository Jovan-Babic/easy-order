"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { ClientFields } from "@/components/ClientFields";
import { ClientInfo } from "@/lib/orders";
import { ClientFormFields, clientPayload, deleteUploadedLogo, uploadLogo } from "@/lib/clientForm";

// Superadmin-only editor for a client's company data and invoice settings.
export function ClientEditForm({ client }: { client: ClientInfo }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [form, setForm] = useState<ClientFormFields>({
    name: client.name,
    address: client.address ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    pib: client.pib ?? "",
    registration_number: client.registration_number ?? "",
    bank_account: client.bank_account ?? "",
    logo: client.logo ?? "",
    invoice_prefix: client.invoice_prefix ?? "",
    invoice_numbering: client.invoice_numbering ?? "auto",
    invoice_next_seq: "", // only sent when the superadmin types one
    expiry_alert_days: (client.expiry_alert_days ?? [30, 15, 5]).slice().sort((a, b) => b - a).join(", "),
  });
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState(client.logo ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    let uploaded: string | null = null;
    try {
      let logo = form.logo;
      if (pendingLogo) {
        uploaded = await uploadLogo(pendingLogo);
        logo = uploaded;
      }
      const res = await fetch(`/api/clients/${client.id}`, { method: "PUT", body: JSON.stringify(clientPayload(form, logo)) });
      if (!res.ok) {
        if (uploaded) await deleteUploadedLogo(uploaded);
        const body = await res.json().catch(() => ({}));
        setMessage({ ok: false, text: typeof body.detail === "string" ? body.detail : t("saveFailed") });
        return;
      }
      setPendingLogo(null);
      setForm({ ...form, logo, invoice_next_seq: "" });
      setMessage({ ok: true, text: t("saved") });
      router.refresh();
    } catch (err) {
      if (uploaded) await deleteUploadedLogo(uploaded);
      setMessage({ ok: false, text: err instanceof Error ? err.message : t("saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 grid max-w-xl gap-3 rounded-lg bg-surfaceSecondary p-6 shadow-sm">
      <ClientFields
        form={form}
        setForm={setForm}
        logoPreview={preview}
        nextSeqHint={client.invoice_next_seq}
        onPickLogo={(file) => {
          setPendingLogo(file);
          setPreview(URL.createObjectURL(file));
        }}
        onRemoveLogo={() => {
          setPendingLogo(null);
          setPreview("");
          setForm({ ...form, logo: "" });
        }}
      />
      {message && <p className={`text-sm ${message.ok ? "text-success" : "text-error"}`}>{message.text}</p>}
      <button type="submit" disabled={saving} className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-bold text-onBrand disabled:opacity-50">
        {t("save")}
      </button>
    </form>
  );
}
