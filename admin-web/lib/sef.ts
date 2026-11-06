// E-invoices through SEF (backend: sef.py, module `sef`).
import type { Lang } from "@/lib/i18n";

export type SefSettings = {
  enabled: boolean;
  env: "demo" | "production";
  key_set: boolean;
  key_set_at: string | null;
  key_hint: string | null;
  payment_terms_days: number;
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_check_message: string | null;
  base_url_override: string | null;
};

export type EinvoiceStatus = "sending" | "sent" | "approved" | "rejected" | "cancelled" | "storno" | "error";

export type Einvoice = {
  id: string;
  number: string;
  status: EinvoiceStatus;
  sef_status: string | null;
  sef_invoice_id: number | null;
  env: "demo" | "production";
  issue_date: string;
  due_date: string;
  delivery_date: string;
  amounts: { subtotal: number; vat: number; grand: number };
  error_code: string | null;
  error_text: string | null;
  error_http?: number | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EinvoicePreview = {
  problems: string[];
  number: string | null;
  issue_date: string;
  due_date: string | null;
  delivery_date: string | null;
  amounts: {
    subtotal: number;
    vat: number;
    grand: number;
    categories: Array<{ vat_rate: number; taxable: number; vat: number }>;
  };
  number_pending: boolean; // no number yet: it is assigned when the invoice is sent
  delivery_editable: boolean; // not shipped (client without the warehouse module): the admin picks the delivery date
  manual_numbering: boolean;
  sef: { configured: boolean; enabled: boolean; env: "demo" | "production" };
  current: Einvoice | null;
  validation: { ok: boolean; message: string | null; code?: string } | null;
  xml: string | null;
};

const FIELDS: Record<string, [string, string]> = {
  name: ["naziv", "name"],
  pib: ["PIB (9 cifara, ispravan)", "PIB (9 digits, valid)"],
  registration_number: ["matični broj (8 cifara)", "registration number (8 digits)"],
  street: ["ulica i broj", "street"],
  city: ["grad", "city"],
  postal_code: ["poštanski broj", "postal code"],
  vat_payer: ["status u sistemu PDV-a (mora biti „Da“)", "VAT status (must be “Yes”)"],
  bank_account: ["tekući račun", "bank account"],
};

const SIMPLE: Record<string, [string, string]> = {
  delivery_date: ["datum prometa (isporuke)", "delivery date"],
  no_lines: ["porudžbina nema isporučenih stavki", "the order has no shipped lines"],
  not_shipped: ["porudžbina nije otpremljena", "the order is not shipped"],
  invoice_number: ["upišite broj fakture", "enter the invoice number"],
  invoice_number_used: ["taj broj fakture je već upotrebljen", "that invoice number is already used"],
  invoice_prefix: ["firma nema prefiks brojeva faktura (podešava ga vlasnik sistema)", "the company has no invoice number prefix (set by the system owner)"],
  "buyer.missing": ["kupac više ne postoji", "the customer no longer exists"],
  delivery_after_issue: ["datum prometa je posle datuma izdavanja", "delivery date is after the issue date"],
  due_before_issue: ["rok plaćanja je pre datuma izdavanja", "due date is before the issue date"],
  issue_date_not_today: ["datum izdavanja mora biti današnji", "the issue date must be today"],
  issue_date: ["datum izdavanja nije ispravan", "issue date is not valid"],
  number: ["broj fakture", "invoice number"],
  due_date: ["rok plaćanja", "due date"],
};

/** A backend problem code as a sentence the admin can act on. */
export function problemText(code: string, lang: Lang): string {
  const i = lang === "en" ? 1 : 0;
  const [scope, rest] = code.split(/\.(.+)/);
  if (scope === "seller" || scope === "buyer") {
    const who = scope === "seller" ? (i ? "Company" : "Firma") : i ? "Customer" : "Kupac";
    return `${who}: ${FIELDS[rest]?.[i] ?? rest}`;
  }
  if (scope === "unit") {
    return i
      ? `Unit “${rest}” has no UBL code (the system owner sets it on the Units page)`
      : `Jedinica mere „${rest}“ nema UBL šifru (podešava je vlasnik sistema na stranici Jedinice mere)`;
  }
  if (scope === "vat_rate") {
    return i ? `VAT rate ${rest}% is not supported (only 10% and 20%)` : `PDV stopa ${rest}% nije podržana (samo 10% i 20%)`;
  }
  return SIMPLE[code]?.[i] ?? code;
}

export const STATUS_TEXT: Record<EinvoiceStatus, [string, string]> = {
  sending: ["Slanje u toku / nije potvrđeno", "Sending / not confirmed"],
  sent: ["Poslata na SEF", "Sent to SEF"],
  approved: ["Odobrena", "Approved"],
  rejected: ["Odbijena od kupca", "Rejected by the buyer"],
  cancelled: ["Otkazana", "Cancelled"],
  storno: ["Stornirana", "Stornoed"],
  error: ["Greška", "Error"],
};
