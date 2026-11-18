// One display format for dates in the app: 06.10.2026 (14:30). Values sent to the backend stay ISO (YYYY-MM-DD).
import dayjs from "dayjs";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-06" or a timestamp -> "06.10.2026" (a timestamp in local time). */
export function formatDate(value: string | null | undefined, empty = ""): string {
  if (!value) return empty;
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  const d = dayjs(value);
  return d.isValid() ? d.format("DD.MM.YYYY") : value;
}

/** Timestamp -> "06.10.2026 14:30" (local time). */
export function formatDateTime(value: string | null | undefined, empty = ""): string {
  if (!value) return empty;
  if (DATE_ONLY.test(value)) return formatDate(value);
  const d = dayjs(value);
  return d.isValid() ? d.format("DD.MM.YYYY HH:mm") : value;
}
