// Expiry dates: typed as DD.MM.YYYY on the phone, sent to the backend as YYYY-MM-DD.

/** Keeps only digits and inserts the dots while typing (12122026 -> 12.12.2026). */
export function formatDateInput(text: string): string {
  const d = text.replace(/[^0-9]/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/** "12.12.2026" -> "2026-12-12"; null when it isn't a real calendar date. */
export function displayToIso(text: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "2026-12-12" -> "12.12.2026" (empty/undefined -> ""). */
export function isoToDisplay(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}
