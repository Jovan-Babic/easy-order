// One display format for the whole portal: dates 06.10.2026 (14:30), amounts 450.535,04.
// Values sent to the backend stay ISO (YYYY-MM-DD from <input type="date">); this is only for showing them.

const pad = (n: number) => String(n).padStart(2, "0");
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-10-06" or a timestamp -> "06.10.2026" (a timestamp in local time). */
export function formatDate(value: string | Date | null | undefined, empty = ""): string {
  if (!value) return empty;
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  const d = toDate(value);
  return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : String(value);
}

/** Timestamp -> "06.10.2026 14:30" (local time); a plain date stays a date. */
export function formatDateTime(value: string | Date | null | undefined, empty = ""): string {
  if (!value) return empty;
  if (typeof value === "string" && DATE_ONLY.test(value)) return formatDate(value);
  const d = toDate(value);
  return d ? `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : String(value);
}

/** 450535.04 -> "450.535,04" (with " RSD" when a currency is given). */
export function formatMoney(value: number | null | undefined, currency?: string): string {
  const n = (value ?? 0).toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${n} ${currency}` : n;
}

/** Short amount for chart axes: 450535 -> "450,5 hilj." / "450.5k". */
export function formatMoneyShort(value: number, lang: "sr" | "en" = "sr"): string {
  const abs = Math.abs(value);
  const [div, sr, en] = abs >= 1e6 ? [1e6, "mil.", "M"] : abs >= 1e3 ? [1e3, "hilj.", "k"] : [1, "", ""];
  const n = (value / div).toLocaleString(lang === "sr" ? "sr-RS" : "en-US", { maximumFractionDigits: 1 });
  return div === 1 ? n : lang === "sr" ? `${n} ${sr}` : `${n}${en}`;
}
