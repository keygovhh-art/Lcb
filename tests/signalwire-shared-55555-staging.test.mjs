import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const shared=read('artifacts/api-server/src/lib/signalwire-shared-ivr.ts');
const existing=read('artifacts/api-server/src/lib/signalwire-next-hotline.ts');
const engine=read('artifacts/api-server/src/lib/yemot-api-driven-phone.ts');
const routes=read('artifacts/api-server/src/routes/index.ts');
const settings=read('artifacts/api-server/src/routes/signalwire-credentials.ts');
const page=read('artifacts/gavhah/src/pages/admin/signalwire.tsx');

test('New staged shared handler never modifies SignalWire number or the existing route',()=>{
 assert.match(shared,/SHARED_E164="\+16056558080"/);
 assert.match(shared,/SHARED_SIGNALWIRE_URL=/);
 assert.match(shared,/sharedRouteReady\(route\)/);
 assert.match(shared,/cutover_enabled!==false/);
 assert.match(shared,/original_voice_url/);
 assert.match(shared,/originalSystemRedirectXml/);
 assert.match(shared,/SHARED_SIGNALWIRE_URL/);
 assert.doesNotMatch(shared,/method:"PUT"|method:"PATCH"|UpdateIncomingPhoneNumber|Numbers\.update|CreateCall|Calls\.create/);
 assert.match(routes,/router.post\("\/signalwire\/shared-ivr"/);
});

test('SignalWire is now Olam Hachesed ONLY; original phone number route remains unchanged',()=>{
 assert.match(engine,/Welcome to Olam Hachesed Communications and MAX/);
 assert.doesNotMatch(engine,/const sharedSignalwireRoot="[^"]*Press 4444/);
 assert.doesNotMatch(engine,/const sharedSignalwireRoot="[^"]*55555/);
 assert.doesNotMatch(shared,/digits===LEGACY_EXTENSION/);
 assert.match(shared,/convertGavhahReplyToCxml\(reply,SHARED_SIGNALWIRE_URL,false\)/);
 assert.doesNotMatch(shared,/fetch\(route\.original_voice_url/);
 assert.match(shared,/u.protocol!=="https:"/);
 assert.match(shared,/originalSystemRedirectXml/); // Archived utility is retained for rollback only.
});

test('Shared webhook checks provider HMAC, telephone number and existing verified snapshot',()=>{
 assert.match(shared,/checkSignalWireSignature\(signingKey,signature,SHARED_SIGNALWIRE_URL,form\)/);
 assert.match(shared,/normalizedSignalWireNumber\(called\)!=="6056558080"/);
 assert.match(shared,/req\.method!=="POST"/);
 assert.match(shared,/original_call_handler!=="laml_webhooks"/);
 assert.match(shared,/route_fingerprint/);
 assert.match(shared,/x-signalwire-signature/);
});

test('Share existing Gavhah membership and MAX phone engine, without mixing with Yemot or Campaign Center',()=>{
 assert.match(shared,/handleYemotApp\(proxy,capture,phoneTree\)/);
 assert.match(engine,/req\.path\.endsWith\("\/shared-ivr"\)/);
 assert.match(engine,/gavhah-shared-55555-v1:/);
 assert.match(engine,/timingSafeEqual/);
 assert.match(engine,/const fromNext=req\.path\.endsWith\("\/next-ivr"\)\|\|fromShared/);
 assert.match(engine,/if\(fromNext&&!fromShared\)/);
 assert.match(engine,/menuPrompt\(path,tree,ready4444,fromNext,fromShared\)/);
 assert.match(engine,/sharedSignalwireRoot/);
 assert.match(existing,/sharedRootMode\?5/);
 assert.match(existing,/xml\(actionUrl\)/);
});

test('Admin only describes staged route and warns real calls and signing key unverified',()=>{
 assert.match(settings,/stagedSharedIvrUrl/);
 assert.match(settings,/sharedIvrSigningKeyReady/);
 assert.match(settings,/livePhoneTestPassed:false/);
 assert.match(settings,/cutoverEnabled:false/);
 assert.match(page,/sharedIvrSigningKeyReady/);
 assert.match(page,/livePhoneTestPassed/);
 assert.match(page,/55555־פארבינדונג/);
});
test('MAX keypad adds owner-scoped donor360 and idempotent reports to the SAME website database',()=>{
 const max=read('artifacts/api-server/src/lib/olam-hachesed-phone-max.ts');
 assert.match(max,/FROM public.communication_contacts WHERE user_id=\$1/);
 assert.match(max,/FROM public.max_pledges WHERE user_id=\$1/);
 assert.match(max,/FROM public.max_receipts WHERE user_id=\$1/);
 assert.match(max,/DO NOT CALL/);
 assert.match(max,/ON CONFLICT\(user_id,request_id\) DO NOTHING/);
 assert.match(max,/public.max_followup_contacts/);
 assert.match(engine,/telephoneMAXContact360/);
 assert.match(engine,/logMAXPhoneOutcome/);
 assert.match(engine,/memberAllowed\(client/);
});
