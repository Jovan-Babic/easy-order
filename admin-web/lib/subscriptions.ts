// Types + helpers for the superadmin "Subscriptions" section (PLAN_PRETPLATE.md).
import type { TranslationKey } from "@/lib/i18n";

export type SubState = {
  status: "none" | "active" | "grace" | "locked";
  ends_at?: string;
  days_left?: number | null;
  grace_ends_at?: string;
  locked_since?: string | null;
  purge_at?: string | null;
};

export type SubscriptionRow = {
  client_id: string;
  client_name: string;
  client_active: boolean;
  plan_id: string | null;
  plan_name: string | null;
  modules: string[];
  note: string | null;
  purge_paused: boolean;
  purged_at: string | null;
  state: SubState;
};

export type SubscriptionEvent = {
  id: string;
  type: string;
  plan_name: string | null;
  ends_at: string | null;
  note: string | null;
  actor_name: string | null;
  source: string;
  data: Record<string, number | string> | null;
  created_at: string;
};

export type Plan = {
  id: string;
  name: string;
  description?: string;
  modules: string[];
  active: boolean;
  prices?: Record<string, number>; // months -> amount
  currency?: string;
};

export const STATUS_KEYS: Record<SubState["status"], TranslationKey> = {
  none: "subNone",
  active: "subActive",
  grace: "subGrace",
  locked: "subLocked",
};

export const STATUS_STYLES: Record<SubState["status"], string> = {
  none: "bg-surfaceTertiary text-muted",
  active: "bg-brandSecondary text-success",
  grace: "bg-amber-100 text-warning",
  locked: "bg-red-100 text-error",
};

export const EVENT_KEYS: Record<string, TranslationKey> = {
  assigned: "eventAssigned",
  extended: "eventExtended",
  canceled: "eventCanceled",
  purge_paused: "eventPurgePaused",
  purge_resumed: "eventPurgeResumed",
  purged: "eventPurged",
  payment_received: "eventPaymentReceived",
  charge_created: "eventChargeCreated",
  payment_canceled: "eventPaymentCanceled",
};

export const detailOf = async (res: Response, fallback: string) => {
  const body = await res.json().catch(() => ({}));
  return typeof body.detail === "string" ? body.detail : fallback;
};
