// Calendar billing as the client's admin sees it (PLAN_NAPLATA_KALENDARSKA.md, N3).
export type ChargeLine = {
  kind: "package" | "seats" | "seats_prorated" | "discount" | "manual" | "free" | string;
  label: string;
  amount: number;
  role?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  months?: number | null;
};

export type LedgerCharge = {
  id: string;
  status: "draft" | "expected" | "canceled";
  number: string | null;
  amount: number;
  paid: number;
  open: number;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  cycle: string | null;
  lines: ChargeLine[];
  note: string | null;
  created_at: string;
};

export type LedgerPayment = { id: string; amount: number; paid_at: string | null; method: string | null; note: string | null; created_at: string };

export type BillingMe = {
  client_name: string;
  state: { status: string; lock_reason?: string | null; ends_at?: string };
  to_pay: number;
  credit: number;
  next_due_date: string | null;
  monthly_estimate: number;
  charges: LedgerCharge[];
  payments: LedgerPayment[];
  instructions_sr: string;
  instructions_en: string;
  ips: { available: boolean; recipient: string | null; account: string | null; payment_code: string | null; purpose: string | null; reference: string | null; amount: number };
};

// Banner data delivered in /auth/me (amounts only for the admin).
export type BillingNotice = {
  status: string;
  lock_reason?: string | null;
  next_due_date: string | null;
  late: boolean;
  blocks_on: string | null;
  to_pay?: number;
  credit?: number;
};

export const formatAccount = (acc: string | null) => (acc && acc.length === 18 ? `${acc.slice(0, 3)}-${acc.slice(3, 16)}-${acc.slice(16)}` : acc ?? "");

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}.`;
};
