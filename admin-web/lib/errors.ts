import type { TranslationKey } from "@/lib/i18n";

// Backend error details the user can act on, shown in the chosen language.
const KNOWN: Record<string, TranslationKey> = {
  "Seat limit reached for this role": "errSeatLimit",
  "Unit cannot be changed: the product has stock or orders": "errUnitLocked",
  "Packaging is only for products counted in pieces": "errPackagingCount",
  "Group, base unit and factor cannot change while the unit is in use": "errUnitInUse",
  "A unit with that code already exists": "errUnitExists",
};

export const localizedDetail = (detail: unknown, t: (key: TranslationKey) => string, fallback: string): string => {
  if (typeof detail !== "string" || !detail) return fallback;
  const key = KNOWN[detail];
  return key ? t(key) : detail;
};
