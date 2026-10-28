test("Unauthenticated visitors reach existing same-origin sign-in without bypassing owner gate",()=>{
 const redirect=src.indexOf('router.get(cloudflareSwitchPath,async(req,res,next)=>');
 const protectedPage=src.indexOf('router.get(cloudflareSwitchPath,requireAuth,admin');
 assert.ok(redirect>0&&protectedPage>redirect);
 assert.match(src,/res.redirect\(303,"\/login\?return=%2Fapi%2Fadmin%2Fyemot%2Fcloudflare-switch"\)/);
 assert.match(src,/const user=await getCurrentSessionUser\(req\)/);
 assert.match(src,/if\(!user\)/);
 assert.match(src,/router\.get\(cloudflareSwitchPath\+"\/verify",requireAuth,admin/);
 assert.match(src,/router\.post\(cloudflareSwitchPath,requireAuth,admin/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const src=readFileSync("artifacts/api-server/src/routes/yemot-central.ts","utf8");
const live=readFileSync("cloudflare/gavhah/worker.ts","utf8");

test("Yemot owner switch only changes root API callback on original existing hotline",()=>{
 assert.match(src,/const cloudflareIvrCallback="https:\/\/gavhah-cloudflare-native\.keygovhh\.workers\.dev\/api\/yemot\/ivr"/);
 assert.match(src,/const previousIvrCallback="https:\/\/gavhah\.onrender\.com\/api\/yemot\/ivr"/);
 assert.match(src,/conn\.line_number!=="6055621286"/);
 assert.match(src,/item\.target_path!=="\/"/);
 assert.match(src,/path:"ivr2:\/",type:"api",api_link:cloudflareIvrCallback/);
 assert.match(src,/readProviderRoot\(providerToken\)/);
 assert.match(src,/rollback|rolledBack|originalCallback/i);
 assert.doesNotMatch(src,/UploadTextFile|FileAction|DeleteFile/);
 const cutoverAction=src.slice(src.indexOf("router.post(cloudflareSwitchPath,"));
 assert.ok(!cutoverAction.includes("api_add_0:"));
});
test("Only authenticated owner and explicit same-origin POST may activate the change",()=>{
 assert.match(src,/router\.post\(cloudflareSwitchPath,requireAuth,admin/);
 assert.match(src,/req\.get\("origin"\)/);
 assert.match(src,/isSameOrigin\(req\)/);
 assert.match(src,/SWITCH_ONLY_YEMOT_TO_CLOUDFLARE/);
 assert.match(src,/SELECT state,target_path,callback_hash/);
 assert.match(src,/FOR UPDATE/);
 assert.match(src,/timingSafeEqual\(a,b\)/);
 assert.match(src,/getLiveCloudflareSwitchStatus/);
});
test("Yemot read-only preflight rejects a changed secret or callback",()=>{
 assert.match(src,/yemotProviderCall\(token,"GetTextFile"/);
 assert.match(src,/api_add_0/);
 assert.match(src,/entryKey=/);
 assert.match(src,/createHash\("sha256"\)\.update\(supplied\)/);
 assert.match(src,/safeToSwitch=keyOk&&providerEndpoint===previousIvrCallback/);
 assert.match(src,/item\.saved_callback!==previousIvrCallback/);
});
test("Cloudflare independent Yemot API enabled, SignalWire and secret never leaked",()=>{
 assert.match(live,/yemotPhoneCallbacksEnabled/);
 assert.match(live,/CF_YEMOT_WEBHOOKS_ENABLED/);
 assert.match(src,/let providerToken=""/);
 assert.match(src,/providerToken="";lock.release\(\)/);
 assert.match(src,/Cloudflare is already recorded/);
 assert.match(src,/physicalCallTest:false/);
});
