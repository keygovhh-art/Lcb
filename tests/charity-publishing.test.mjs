import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCampaignState, parseFutureSchedule, validatePhone,
  validateExtension, validateDonationUrl, validateButtonText,
  isPublishedNow, isButtonStyle, isButtonLayout,
} from "../artifacts/api-server/src/lib/charity-editor.ts";

test("waiting line, scheduled, live, archived states are distinct", () => {
  for (const state of ["live", "queued", "scheduled", "archived"])
    assert.equal(isCampaignState(state), true);
  assert.equal(isCampaignState("pending"), false);
  const now = new Date("2026-10-12T14:00:00.000Z");
  const due = new Date("2026-10-12T13:00:00.000Z");
  const later = new Date("2026-10-13T13:00:00.000Z");
  assert.equal(isPublishedNow("queued", false, due, now), false);
  assert.equal(isPublishedNow("archived", false, due, now), false);
  assert.equal(isPublishedNow("scheduled", false, later, now), false);
  assert.equal(isPublishedNow("scheduled", false, due, now), true);
  assert.equal(isPublishedNow("live", true, null, now), true);
  assert.equal(isPublishedNow("live", false, null, now), false);
  assert.equal(parseFutureSchedule("2026-10-13T13:00:00.000Z", now)?.toISOString(), later.toISOString());
  assert.equal(parseFutureSchedule("2026-10-12T13:00:00.000Z", now), null);
  assert.equal(parseFutureSchedule("2026-10-13T13:00", now), null);
});

test("phone, DTMF extension, external link and button labels are validated", () => {
  assert.equal(validatePhone("+1 (605) 313-8165"), "+16053138165");
  assert.equal(validateExtension("#3333"), "#3333");
  assert.equal(validateExtension("*444"), "*444");
  assert.throws(() => validatePhone("tel:+16053138165"), /phone number/i);
  assert.throws(() => validateExtension("#33,123"), /extension/i);
  assert.equal(validateDonationUrl("https://donations.example.org/pay?amount=50"), "https://donations.example.org/pay?amount=50");
  for (const bad of ["javascript:alert(1)", "http://example.com", "https://127.0.0.1/", "https://localhost/", "https://staff:pass@example.com/"]) {
    assert.throws(() => validateDonationUrl(bad), /secure|https/i);
  }
  assert.equal(validateButtonText("גיב א נדבה אויפן טעלעפאן"), "גיב א נדבה אויפן טעלעפאן");
  assert.throws(() => validateButtonText("x".repeat(66)), /65/);
  assert.equal(isButtonStyle("gold"), true);
  assert.equal(isButtonLayout("inline"), true);
  assert.equal(isButtonStyle("javascript"), false);
});

test("endpoints do not leak queue or future scheduled campaigns", () => {
  const api = readFileSync("artifacts/api-server/src/routes/charity.ts", "utf8");
  const schema = readFileSync("lib/db/src/schema/charity.ts", "utf8");
  const sql = readFileSync("lib/db/migrations/20261012_charity_release_queue_donations.sql", "utf8");
  const admin = readFileSync("artifacts/gavhah/src/components/admin/charity-management.tsx", "utf8");
  const publicPage = readFileSync("artifacts/gavhah/src/pages/charity/index.tsx", "utf8");
  const buttons = readFileSync("artifacts/gavhah/src/components/shared/campaign-donation-actions.tsx", "utf8");
  assert.match(api, /const publicCampaign =/);
  assert.match(api, /lte\(charitiesTable.scheduledAt, new Date\(\)\)/);
  assert.match(api, /requireAdmin/);
  assert.match(api, /publicationState === "scheduled"/);
  assert.match(api, /Cache-Control", "no-store"/);
  assert.match(admin, /Waiting Line/);
  assert.match(admin, /Schedule for Later/);
  assert.match(admin, /Go Live Now/);
  assert.match(admin, /Feature Today/);
  assert.match(admin, /Edit campaign/);
  assert.match(admin, /CampaignDonationActions/);
  assert.match(publicPage, /CampaignDonationActions/);
  assert.match(buttons, /encodeURIComponent\(ext\)/);
  assert.match(buttons, /referrerPolicy="no-referrer"/);
  assert.match(schema, /scheduled_at/);
  assert.match(sql, /STAGED ONLY/);
  assert.doesNotMatch(sql, /\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
});
