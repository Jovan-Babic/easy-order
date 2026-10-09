// Types + helpers for payments and debts (PLAN_SUPERADMIN.md, phase C).
import type { TranslationKey } from "@/lib/i18n";

export type PaymentStatus = "expected" | "received" | "canceled";
export type PaymentMethod = "bank" | "card" | "cash" | "other";
export type PaymentKind = "subscription" | "setup" | "other";

export type Payment = {
  id: string;
  client_id: string;
  client_name: string | null;
  status: PaymentStatus;
  amount: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  method: PaymentMethod | null;
  note: string | null;
  plan_name: string | null;
  period_months: number | null;
  kind: PaymentKind;
  period: string | null;
  created_by: string | null;
  created_at: string;
  overdue: boolean;
};

export type PaymentTotals = { received: number; expected: number; overdue_total: number; overdue_count: number };

export const METHOD_KEYS: Record<PaymentMethod, TranslationKey> = {
  bank: "methodBank",
  card: "methodCard",
  cash: "methodCash",
  other: "methodOther",
};

export const KIND_KEYS: Record<PaymentKind, TranslationKey> = {
  subscription: "kindSubscription",
  setup: "kindSetup",
  other: "kindOther",
};

export const PAYMENT_STATUS_KEYS: Record<PaymentStatus, TranslationKey> = {
  expected: "payExpected",
  received: "payReceived",
  canceled: "payCanceled",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  expected: "bg-amber-100 text-warning",
  received: "bg-brandSecondary text-success",
  canceled: "bg-surfaceTertiary text-muted",
};

export const money = (value: number, currency = "RSD") =>
  `${value.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export const todayIso = () => new Date().toISOString().slice(0, 10);

// CSV the way Excel in Serbian locale opens it: semicolons, BOM, quoted text.
export function paymentsCsv(rows: Payment[]): string {
  const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Klijent", "Status", "Iznos", "Valuta", "Datum uplate", "Rok", "Način", "Paket", "Meseci", "Napomena"];
  const lines = rows.map((p) =>
    [p.client_name, p.status, p.amount, p.currency, p.paid_at, p.due_date, p.method, p.plan_name, p.period_months, p.note]
      .map(cell)
      .join(";")
  );
  return "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n");
}
