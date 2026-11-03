import type { TranslationKey } from "@/lib/i18n";

// Backend error details the user can act on, shown in the chosen language.
const KNOWN: Record<string, TranslationKey> = {
  "Seat limit reached for this role": "errSeatLimit",
  "Subscription blocked": "errSubscriptionBlocked",
  "Unit cannot be changed: the product has stock or orders": "errUnitLocked",
  "Packaging is only for products counted in pieces": "errPackagingCount",
  "Group, base unit and factor cannot change while the unit is in use": "errUnitInUse",
  "A unit with that code already exists": "errUnitExists",
  "Customer has orders - deactivate the customer instead of deleting it": "errCustomerHasOrders",
  "Product is on orders - set it inactive instead of deleting it": "errProductHasOrders",
  "User has orders - deactivate the account instead of deleting it": "errUserHasOrders",
  "Use change-password to change your own password": "errOwnPassword",
};

// FastAPI validation errors arrive as a list of { loc, msg }: show them as "field: message".
export const validationText = (detail: unknown): string | null => {
  if (!Array.isArray(detail)) return null;
  const parts = detail
    .map((d) => {
      const field = Array.isArray(d?.loc) ? String(d.loc[d.loc.length - 1]) : "";
      const msg = typeof d?.msg === "string" ? d.msg.replace(/^Value error, /, "") : "";
      return msg ? (field && field !== "body" ? `${field}: ${msg}` : msg) : "";
    })
    .filter(Boolean);
  return parts.length ? parts.join("; ") : null;
};

export const localizedDetail = (detail: unknown, t: (key: TranslationKey) => string, fallback: string): string => {
  const validation = validationText(detail);
  if (validation) return validation;
  if (typeof detail !== "string" || !detail) return fallback;
  const key = KNOWN[detail];
  return key ? t(key) : detail;
};
