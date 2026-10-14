import { format } from "date-fns";

/**
 * Uniform public/admin display for a civil (Gregorian) date.
 * Example: Oct 8, '26 למספרם.
 *
 * Keep ISO values, API timestamps, native date inputs, scheduling, and
 * date comparisons unchanged; this function is ONLY for visible labels.
 */
export function formatGregorianYear(year: number): string {
  if (!Number.isFinite(year)) return "";
  return `'${String(Math.abs(Math.trunc(year)) % 100).padStart(2, "0")} למספרם`;
}

export function formatGregorianDate(
  value: Date | string | number | null | undefined,
  pattern = "MMM d, yyyy",
): string {
  if (value == null || value === "") return "";
  const date = value instanceof Date
    ? value
    : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00`)
      : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  // Render every supplied date style with an apostrophe and the last two
  // digits, including month/year and date-time variants.
  const marker = "__GAVHAH_CIVIL_YEAR__";
  const hasYear = /y{2,4}/.test(pattern);
  const datePattern = hasYear ? pattern : `${pattern}, yyyy`;
  const withMarker = datePattern.replace(/y{2,4}/g, `'${marker}'`);
  const rendered = format(date, withMarker)
    .replaceAll(marker, `'${format(date, "yy")}`);
  return `${rendered} למספרם`;
}

export function formatGregorianDateTime(
  value: Date | string | number | null | undefined,
): string {
  return formatGregorianDate(value, "MMM d, yyyy h:mm a");
}
