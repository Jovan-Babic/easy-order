// Visit plan (backend: module `visits`, PLAN_OBILASCI.md V1).
export type VisitStatus = "planned" | "done" | "skipped";

export type Visit = {
  id: string;
  customer_id: string;
  customer_name: string;
  user_id: string;
  user_name: string;
  date: string;
  channel: "visit" | "call";
  status: VisitStatus;
  done_at: string | null;
  note: string | null;
  order_id: string | null;
  street: string;
  city: string;
  phone: string;
  zone_id: string | null;
  zone_name: string | null;
  last_order: string | null;
};

export type DueRow = {
  customer_id: string;
  name: string;
  street: string;
  city: string;
  phone: string;
  zone_id: string | null;
  zone_name: string | null;
  channel: "visit" | "call";
  every_days: number;
  last_visit: string | null;
  last_order: string | null;
  due_date: string;
  days_overdue: number; // > 0 late, < 0 due in that many days
  planned: Array<{ visit_id: string; user_id: string; user_name: string; date: string }>;
};

export type Zone = { id: string; name: string; active: boolean; customer_count: number };

export type VisitSettings = { plan_days: number[]; max_per_day: number };

export type Suggestion = { days: Array<{ date: string; items: DueRow[] }>; left_out: number; claimed: number };

export type VisitReport = {
  from: string;
  to: string;
  reps: Array<{ user_id: string; user_name: string; planned: number; done: number; skipped: number; overdue_planned: number; total: number; done_pct: number | null }>;
  late_customers: number;
  late_by_zone: Array<{ zone: string; count: number }>;
};

// Dates are plain YYYY-MM-DD strings built from the local calendar (no time zone shifts).
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso: string, n: number) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
export const mondayOf = (iso: string) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
};
export const WEEKDAYS: Record<"sr" | "en", string[]> = {
  sr: ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};
export const weekdayName = (iso: string, lang: "sr" | "en") => WEEKDAYS[lang][(parseIso(iso).getDay() + 6) % 7];
