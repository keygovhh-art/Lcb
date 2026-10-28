import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const worker=readFileSync("cloudflare/gavhah/worker.ts","utf8");
const admin=readFileSync("artifacts/api-server/src/routes/yemot-voice-studio.ts","utf8");
test("Yemot Cloudflare phone callbacks are independent from SignalWire",()=>{
 assert.match(worker,/CF_YEMOT_WEBHOOKS_ENABLED/);
 assert.match(worker,/const yemotPhoneCallbacksEnabled=/);
 assert.match(worker,/const signalwirePhoneCallbacksEnabled=/);
 assert.match(worker,/path\.startsWith\("\/api\/yemot\/"\)&&!readiness\.yemotPhoneCallbacksEnabled/);
 assert.match(worker,/path\.startsWith\("\/api\/signalwire\/"\)&&!readiness\.signalwirePhoneCallbacksEnabled/);
 assert.match(worker,/providerCryptographyConfigured&&yemotOperatorEnabled/);
 assert.match(worker,/webhookSigningConfigured&&signalwireOperatorEnabled/);
 assert.match(worker,/databaseCredentialPresent&&sessionsConfigured/);
});
test("Owner dashboard does not falsely claim a provider cutover",()=>{
 assert.match(admin,/provider_summary->>'apiEndpoint' AS recorded_endpoint/);
 assert.match(admin,/providerRouteVerifiedLive:false/);
 assert.match(admin,/recordedCallback:/);
 assert.match(admin,/cloudflareCallback:/);
 assert.match(admin,/Super administrator only|Super administrator only|Super administrator/);
});
