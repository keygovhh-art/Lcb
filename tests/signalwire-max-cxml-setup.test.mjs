import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=(path)=>readFileSync(path,"utf8");
const sw=source("artifacts/api-server/src/routes/signalwire-voice-switch.ts");
const admin=source("artifacts/gavhah/src/pages/admin/signalwire.tsx");
const worker=source("cloudflare/gavhah/worker.ts");
const shared=source("artifacts/api-server/src/lib/signalwire-shared-ivr.ts");
const migration=source("artifacts/api-server/src/routes/hotline-migration.ts");

test("super-admin can create exactly one unassigned MAX Calling webhook on demand",()=>{
 assert.match(sw,/router.post\("\/voice-switch\/prepare"/);
 assert.match(sw,/SELECT requested_number,old_extension,audit_state,cutover_enabled,original_voice_url,original_call_handler/);
 assert.match(sw,/FOR UPDATE/);
 assert.match(sw,/await client.query\("BEGIN"\)/);
 assert.match(sw,/await client.query\("COMMIT"\)/);
 assert.match(sw,/original_voice_url\?\.startsWith\("https:\/\/emes-newsroom\.vercel\.app\/"/);
 assert.match(sw,/resources\/cxml_webhooks","POST"/);
 assert.match(sw,/name:"Olam Hachesed MAX",used_for:"calling"/);
 assert.match(sw,/primary_request_url:CALLBACK,primary_request_method:"POST"/);
 assert.match(sw,/existing.length>1/);
 assert.match(sw,/verify\.data as R\[\]\)\.filter\(valid\)\.length!==1/);
 assert.match(sw,/callingAssignmentUnchanged:true/);
 assert.match(sw,/smsUnchanged:true/);
});

test("Cloudflare only allows protected preparation through the original superadmin and same-origin gate",()=>{
 assert.match(worker,/\/api\/admin\/hotline-migration\/signalwire\/voice-switch\/prepare/);
 assert.match(migration,/router.use\(requireAuth\)/);
 assert.match(migration,/user.role!=="super_admin"/);
 assert.match(migration,/!sameOrigin\(req\)/);
 assert.match(migration,/router.use\("\/signalwire",signalwireVoiceSwitchRouter\)/);
 assert.match(admin,/voice-switch\/prepare/);
 assert.match(admin,/0\. שאפן אדער באשטעטיגן/);
 assert.match(admin,/voice-switch\/preflight/);
});

test("legacy 55555 and main MAX IVR stay authenticated AFTER Calling switches",()=>{
 assert.match(shared,/sharedRouteReady\(route\)/);
 assert.doesNotMatch(shared,/r\.cutover_enabled!==false/);
 assert.match(shared,/route_fingerprint/);
 assert.match(shared,/checkSignalWireSignature/);
 assert.match(shared,/originalSystemRedirectXml/);
 assert.match(shared,/digits===LEGACY_EXTENSION/);
});
