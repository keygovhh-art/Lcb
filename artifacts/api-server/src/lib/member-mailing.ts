import type { MemberMailing } from "@workspace/db";
export type MailingInput = {
  recipient: string; addressLine1: string; addressLine2: string | null;
  city: string; state: string; postalCode: string; country: string;
  uspsConsent: boolean;
};
const line = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export function parseMailingInput(raw: unknown): { value: MailingInput | null; error?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { value: null, error: "Mailing address must be an object" };
  }
  const x = raw as Record<string, unknown>;
  const recipient = line(x.recipient, 120);
  const addressLine1 = line(x.addressLine1, 180);
  const addressLine2 = line(x.addressLine2, 180) || null;
  const city = line(x.city, 120);
  const state = line(x.state, 100);
  const postalCode = line(x.postalCode, 30);
  const country = line(x.country || "US", 2).toUpperCase();
  if (!recipient || !addressLine1 || !city || !state || !postalCode) {
    return { value: null, error: "A provided address needs a recipient, street, city, state and ZIP/postal code" };
  }
  if (country !== "US") return { value: null, error: "USPS domestic mailing is available for US addresses only" };
  if (typeof x.uspsConsent !== "boolean") {
    return { value: null, error: "Please explicitly choose Yes or No for permission to send USPS mail" };
  }
  return { value: { recipient, addressLine1, addressLine2, city, state, postalCode, country, uspsConsent: x.uspsConsent } };
}
export function mailingValues(userId: number, data: MailingInput) {
  return {
    userId, ...data,
    consentAt: data.uspsConsent ? new Date() : null,
    addressUpdatedAt: new Date(),
  };
}
export function publicMailingStatus(row: MemberMailing | null) {
  return !row ? "no_address" : !row.uspsConsent ? "do_not_send" : row.mailingHold ? "on_hold" : "permission_yes";
}
