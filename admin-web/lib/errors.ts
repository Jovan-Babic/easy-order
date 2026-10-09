import type { TranslationKey } from "@/lib/i18n";

// Backend error details the user can act on, shown in the chosen language.
const KNOWN: Record<string, TranslationKey> = {
  "Seat limit reached for this role": "errSeatLimit",
};

export const localizedDetail = (detail: unknown, t: (key: TranslationKey) => string, fallback: string): string => {
  if (typeof detail !== "string" || !detail) return fallback;
  const key = KNOWN[detail];
  return key ? t(key) : detail;
};
