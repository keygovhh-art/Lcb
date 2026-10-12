/** Pure, independently testable safety rules for charity campaign publication. */
export type CampaignState = "live" | "queued" | "scheduled" | "archived";
export type CampaignButtonStyle = "classic" | "gold" | "outline" | "soft";
export type CampaignButtonLayout = "stacked" | "inline";

export const isCampaignState = (value: unknown): value is CampaignState =>
  value === "live" || value === "queued" || value === "scheduled" || value === "archived";

export function parseFutureSchedule(value: unknown, now = new Date()): Date | null {
  if (typeof value !== "string" || !/^(?:\d{4})-(?:\d{2})-(?:\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime() ? date : null;
}

export function validatePhone(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 50) throw new Error("Invalid phone number");
  const clean = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(clean)) throw new Error("Phone number must contain 7–15 digits, optionally starting with +");
  return clean;
}

export function validateExtension(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Invalid extension");
  const clean = value.trim().replace(/\s+/g, "");
  if (!/^[#*]?\d{1,12}$/.test(clean)) throw new Error("Extension must be digits, optionally prefixed with # or *");
  return clean;
}

export function validateDonationUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 1600) throw new Error("Invalid donation URL");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Donation link must be a valid https URL"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || !host ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]" ||
      /^(?:10|127|169\.254|192\.168)\./.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("Donation link must be an external, secure https address");
  }
  url.hash = ""; // Never include browser fragments or password-reset tokens in donations.
  return url.toString();
}

export function validateButtonText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 65)
    throw new Error("Button text must contain at most 65 characters");
  return value.trim();
}
export const isButtonStyle = (v: unknown): v is CampaignButtonStyle =>
  v === "classic" || v === "gold" || v === "outline" || v === "soft";
export const isButtonLayout = (v: unknown): v is CampaignButtonLayout =>
  v === "stacked" || v === "inline";

/** Deadline checks happen at read time. Works without cron on Render Free, even after sleeping. */
export function isPublishedNow(state: string, isActive: boolean, scheduledAt: Date | null, now = new Date()): boolean {
  return (state === "live" && isActive) ||
    (state === "scheduled" && scheduledAt != null && scheduledAt.getTime() <= now.getTime());
}
