/** Multi-minyan schedules stored as newline-separated entries in legacy text columns.
 * Existing rows, approvals and schema remain backward compatible; no DB migration.
 * Never silently truncate submitted prayer times.
 */
export const MAX_MINYAN_TIMES_PER_SERVICE = 24;

export function normalizeMinyanTimes(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" && !Array.isArray(value)) {
    throw new Error("Prayer times must be text or a list of time descriptions");
  }
  const rows: unknown[] = Array.isArray(value) ? value : value.replace(/\r/g, "").split("\n");
  if (rows.some(item => typeof item !== "string")) {
    throw new Error("Each prayer time must be text");
  }
  const cleaned = (rows as string[]).map(v => v.trim()).filter(Boolean);
  if (cleaned.length > MAX_MINYAN_TIMES_PER_SERVICE) {
    throw new Error("Too many minyanim for a single prayer (maximum 24)");
  }
  if (cleaned.some(v => v.length > 100 || v.includes("\n") || v.includes("\r"))) {
    throw new Error("Each minyan time must be at most 100 characters");
  }
  if (cleaned.join("\n").length > 2400) {
    throw new Error("Minyan schedule is too long");
  }
  return cleaned.join("\n");
}

export function hasAtLeastOneMinyanTime(shacharis: string, mincha: string, maariv: string): boolean {
  return Boolean(shacharis.trim() || mincha.trim() || maariv.trim());
}

export function minyanTimesList(value: string | null | undefined): string[] {
  return (value || "").split(/\r?\n/).map(v => v.trim()).filter(Boolean);
}
