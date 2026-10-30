import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const src=readFileSync("artifacts/api-server/src/routes/yemot-central.ts","utf8");
const verify=src.slice(src.indexOf('router.get(cloudflareSwitchPath+"/verify"'),src.indexOf('router.post(cloudflareSwitchPath,requireAuth,admin'));
const cutover=src.slice(src.indexOf('router.post(cloudflareSwitchPath,requireAuth,admin'),src.indexOf('export default router;'));
test("Yemot verification errors are actionable and never throw generic 500",()=>{
 assert.match(verify,/ENCRYPTED_TOKEN_UNREADABLE/);
 assert.match(verify,/PROVIDER_HTTP_403/);
 assert.match(verify,/PROVIDER_API_/);
 assert.match(src,/private.call2all.co.il/);
 assert.match(verify,/PROVIDER_UNREACHABLE/);
 assert.match(verify,/PROVIDER_ROOT_UNRECOGNIZED/);
 assert.match(verify,/PROVIDER_MISMATCH/);
 assert.match(verify,/safeToSwitch:false/);
 assert.match(verify,/stage="fingerprint"/);
 assert.match(verify,/finally\{token="";\}/);
 assert.doesNotMatch(verify,/res\.json\(\{token|console\.log\(token/);
});
test("No provider mutation whatsoever occurs in verification",()=>{
 assert.doesNotMatch(verify,/UpdateExtension|INSERT INTO|UPDATE public|DELETE FROM|method:"POST"/);
 assert.match(verify,/readProviderRoot\(token\)/);
 assert.match(verify,/verifiedProviderRoot/);
 assert.match(src,/verifiedProviderRoot\(before,item\.callback_hash\)/);
 assert.match(cutover,/api_link:cloudflareIvrCallback/);
 assert.match(cutover,/readProviderRoot\(providerToken\)/);
 assert.match(cutover,/isSameOrigin\(req\)/);
 assert.match(cutover,/SWITCH_ONLY_YEMOT_TO_CLOUDFLARE/);
});
