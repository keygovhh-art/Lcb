import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(p,'utf8');
const bridge=file('artifacts/api-server/src/lib/yemot-campaign-bridge.ts');
const routes=file('artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts');
const old=file('artifacts/api-server/src/lib/yemot-api-driven-phone.ts');

test('Independent existing /4444 extension routes to real Campaign Center with safe fallback',()=>{
 assert.match(routes,/CC_GAVHAH_BRIDGE_SECRET/);
 assert.match(routes,/forwardCampaign4444\(req,res\)/);
 assert.match(routes,/handleYemotApp\(req,res,phoneTree\)/);
 assert.match(old,/gavhah-campaign-4444-callback-v1/);
});
test('Verify Yemot callback first, then sign only DTMF with a separate service secret',()=>{
 assert.match(bridge,/YEMOT_ENCRYPTION_KEY/);
 assert.match(bridge,/timingSafeEqual/);
 assert.match(bridge,/campaign4444,state/);
 assert.match(bridge,/CC_GAVHAH_BRIDGE_SECRET/);
 assert.match(bridge,/X-CC-Bridge-Signature/);
 assert.match(bridge,/ApiCallId/);
 assert.match(bridge,/Object\.entries\(\{\.\.\.req\.query,\.\.\.req\.body\}\)/);
 assert.doesNotMatch(bridge,/req\.body\.phone|req\.body\.callerId/);
});
test('Do not leak secrets, private account data or use a Gavhah fallback on downstream failure',()=>{
 assert.match(bridge,/Campaign Center is temporarily unavailable/);
 assert.doesNotMatch(bridge,/from "\.\/yemot-phone-signup"|UPDATE public\.users/);
 assert.doesNotMatch(bridge,/UpdateExtension|DownloadFile|UploadFile|DeleteFile/);
 assert.match(bridge,/signal:AbortSignal\.timeout\(12000\)/);
});
