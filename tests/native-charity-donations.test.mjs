import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NATIVE_CHECKOUT_INTEGRATED, nativeDonationDefaults,
  mayOfferNativeCheckout, validateNativePreferences,
} from "../artifacts/api-server/src/lib/native-charity-donations.ts";

test("no native checkout is implemented; all gates must be true", () => {
  assert.equal(NATIVE_CHECKOUT_INTEGRATED, false);
  for (const integration of [false, true])
    for (const global of [false, true])
      for (const campaign of [false, true])
        for (const published of [false, true])
          assert.equal(mayOfferNativeCheckout(integration, global, campaign, published),
            integration && global && campaign && published);
  assert.equal(mayOfferNativeCheckout(NATIVE_CHECKOUT_INTEGRATED, true, true, true), false);
  assert.equal(nativeDonationDefaults.enabled, false);
  assert.equal(nativeDonationDefaults.sendReceipt, false);
  assert.equal(nativeDonationDefaults.allowRecurring, false);
});

test("admin cannot activate an unimplemented native payment processor", () => {
  assert.throws(() => validateNativePreferences({ enabled: true }, nativeDonationDefaults), /not integrated/i);
  assert.equal(validateNativePreferences({ enabled: false }, nativeDonationDefaults).enabled, false);
  assert.equal(validateNativePreferences({ minimumAmount: 5, maximumAmount: 500, suggestedAmounts: "10,18,36" }, nativeDonationDefaults).maximumAmount, 500);
  assert.throws(() => validateNativePreferences({ minimumAmount: 100, maximumAmount: 10, suggestedAmounts: "100" }, nativeDonationDefaults), /minimum/i);
  assert.throws(() => validateNativePreferences({ defaultButtonText: "x".repeat(66) }, nativeDonationDefaults), /1–65/i);
  assert.throws(() => validateNativePreferences({ sendReceipt: "yes" }, nativeDonationDefaults), /true or false/i);
  assert.throws(() => validateNativePreferences({ suggestedAmounts: "0,10" }, nativeDonationDefaults), /min\/max/i);
  assert.throws(() => validateNativePreferences({ suggestedAmounts: "18,18" }, nativeDonationDefaults), /unique/i);
  assert.throws(() => validateNativePreferences({ suggestedAmounts: "1,2,3,4,5,6,7,8,9" }, nativeDonationDefaults), /eight/i);
});

test("own donation settings are not publicly editable or linked to any checkout", () => {
  const route = readFileSync("artifacts/api-server/src/routes/charity.ts","utf8");
  const schema = readFileSync("lib/db/src/schema/charity.ts","utf8");
  const migration = readFileSync("lib/db/migrations/20261012_charity_release_queue_donations.sql","utf8");
  const admin = readFileSync("artifacts/gavhah/src/components/admin/native-donation-settings.tsx","utf8");
  const campaigns = readFileSync("artifacts/gavhah/src/components/admin/charity-management.tsx","utf8");
  assert.match(route, /router.get\("\/admin\/charity\/native-settings", requireAdmin/);
  assert.match(route, /router.patch\("\/admin\/charity\/native-settings", requireAdmin/);
  assert.match(route, /validateNativePreferences/);
  assert.match(route, /nativeDonationEnabled/);
  assert.match(schema, /charity_native_donation_settings/);
  assert.match(migration, /DEFAULT false/);
  assert.match(admin, /disabled={!value.integrationReady \|\| busy}/);
  assert.match(admin, /No card, bank data, charge/);
  assert.match(campaigns, /nativeDonationEnabled/);
  assert.match(campaigns, /Preview only \(unavailable\)/);
  assert.doesNotMatch(route, /cardNumber|cvv|cvc|paymentIntent|chargeCard/i);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});
