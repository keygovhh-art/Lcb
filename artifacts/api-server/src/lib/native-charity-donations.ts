/**
 * Native payments are NOT yet implemented. Do not expose any payment link or
 * accept card details without a completed, verified and authorized gateway.
 * A DB setting or client request must never bypass this hard gate.
 */
export const NATIVE_CHECKOUT_INTEGRATED = false;

export type NativeDonationConfiguration = {
  enabled: boolean;
  defaultButtonText: string;
  minimumAmount: number;
  maximumAmount: number;
  suggestedAmounts: string;
  allowCustomAmount: boolean;
  allowRecurring: boolean;
  allowAnonymous: boolean;
  sendReceipt: boolean;
};

export const nativeDonationDefaults: NativeDonationConfiguration = {
  enabled: false, defaultButtonText: "Donate Securely",
  minimumAmount: 1, maximumAmount: 10000,
  suggestedAmounts: "18,36,72,180",
  allowCustomAmount: true, allowRecurring: false,
  allowAnonymous: false, sendReceipt: false,
};

export function mayOfferNativeCheckout(
  integrationReady: boolean, globalEnabled: boolean,
  campaignEnabled: boolean, publicCampaign: boolean,
): boolean {
  return integrationReady && globalEnabled && campaignEnabled && publicCampaign;
}
export function validateNativePreferences(
  input: Record<string, unknown>, defaults: NativeDonationConfiguration,
  integrationReady = NATIVE_CHECKOUT_INTEGRATED,
): NativeDonationConfiguration {
  const settings = { ...defaults };
  for (const key of ["enabled", "allowCustomAmount", "allowRecurring", "allowAnonymous", "sendReceipt"] as const) {
    if (key in input) {
      if (typeof input[key] !== "boolean") throw new Error(key + " must be true or false");
      settings[key] = input[key] as boolean;
    }
  }
  if (settings.enabled && !integrationReady)
    throw new Error("Own donation checkout is not integrated and cannot be activated");
  if ("defaultButtonText" in input) {
    if (typeof input.defaultButtonText !== "string" || !input.defaultButtonText.trim() ||
        input.defaultButtonText.trim().length > 65) throw new Error("Button label must be 1–65 characters");
    settings.defaultButtonText = input.defaultButtonText.trim();
  }
  for (const key of ["minimumAmount", "maximumAmount"] as const) {
    if (key in input) {
      const value = input[key];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1000000)
        throw new Error(key + " must be an integer between 1 and 1000000");
      settings[key] = value;
    }
  }
  if (settings.minimumAmount > settings.maximumAmount) throw new Error("Minimum must not exceed maximum");
  if ("suggestedAmounts" in input) {
    if (typeof input.suggestedAmounts !== "string") throw new Error("Amounts must be a comma-separated string");
    const v = input.suggestedAmounts.trim();
    if (v && !/^\d+(?:\s*,\s*\d+){0,7}$/.test(v))
      throw new Error("Use up to eight amounts separated by commas");
    const amounts = v ? v.split(",").map(x => Number(x.trim())) : [];
    if (amounts.some(n => !Number.isSafeInteger(n) || n < settings.minimumAmount || n > settings.maximumAmount) ||
        new Set(amounts).size !== amounts.length)
      throw new Error("Suggested amounts must be unique and within min/max");
    settings.suggestedAmounts = amounts.join(",");
  } else if (settings.suggestedAmounts.split(",").map(Number).some(n =>
    n < settings.minimumAmount || n > settings.maximumAmount))
    throw new Error("Suggested amounts must fit the min/max limits");
  return settings;
}
