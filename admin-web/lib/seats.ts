// Types for package accounts and the monthly amount (PLAN_SUPERADMIN.md, phase G).
export const SEAT_ROLES = ["admin", "warehouse", "operator"] as const;
export type SeatRole = (typeof SEAT_ROLES)[number];

export type SeatRow = {
  role: SeatRole;
  used: number;
  included: number | null;
  extra: number;
  limit: number | null; // null = unlimited
  price: number | null; // monthly price of one extra account
};

export type SeatsOut = {
  plan_name: string | null;
  currency: string;
  seats: SeatRow[];
  package_price: number | null;
  extra_amount: number;
  discount_percent: number;
  monthly_total: number | null;
};

export type ChargePreview = {
  month: string;
  already_charged: boolean;
  total: number;
  currency: string;
  breakdown: {
    package: number;
    seats: Array<{ role: SeatRole; extra: number; price: number; amount: number }>;
    discount_percent: number;
    total: number;
  };
};
