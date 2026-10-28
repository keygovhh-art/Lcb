import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(p,'utf8');
const creds=src('artifacts/api-server/src/routes/signalwire-credentials.ts');
const ui=src('artifacts/gavhah/src/pages/admin/signalwire.tsx');
test('Private owner-only shared route status reports provider state; writes require separate superadmin route',()=>{
 assert.match(creds,/router\.get\("\/shared-route"/);
 assert.match(creds,/router\.post\("\/shared-route\/recheck"/);
 assert.match(creds,/inspectExisting8080RouteOnce\(\)/);
 assert.match(creds,/cutoverEnabled:!!r\?\.cutover_enabled/);
 assert.match(creds,/providerRouteUnchanged:!r\?\.cutover_enabled/);
 assert.match(creds,/signalwireVoiceSwitchRouter/);
 assert.doesNotMatch(creds,/UpdateIncomingPhoneNumber|VoiceUrl=/);
});
test('Replacing SignalWire credentials invalidates any old provider route snapshot',()=>{
 assert.match(creds,/provider_number_sid=NULL,original_voice_url=NULL,original_voice_method=NULL/);
 assert.match(creds,/audit_state='queued'/);
 assert.match(creds,/WHERE id=1 AND cutover_enabled=false/);
});
test('Phone-first admin sees number not found and must not lose old system',()=>{
 assert.match(ui,/605\) 655-8080/);
 assert.match(ui,/55555/);
 assert.match(ui,/oldRoute\.state==="not_found"/);
 assert.match(ui,/status\.verified/);
 assert.match(ui,/shared-route\/recheck/);
 assert.match(ui,/דער סיסטעם בלייבט אומגעענדערט|די סיסטעם בלייבט אומגעענדערט/u);
});

test('Route review stores Native API handler type privately without exposing credentials',()=>{
 assert.match(creds,/original_provider_api,original_call_handler/);
 assert.match(creds,/oldCallHandler:r\?\.original_call_handler/);
 assert.match(creds,/original_route_details=NULL/);
 assert.match(ui,/oldRoute\.oldCallHandler/);
 assert.doesNotMatch(creds,/res\.json\(\{.*token_ciphertext/s);
});

test('MAX cutover is gated to one verified calling resource, preserves SMS and exposes reversible rollback',()=>{
 const ops=src('artifacts/api-server/src/routes/signalwire-voice-switch.ts');
 const worker=src('cloudflare/gavhah/worker.ts');
 assert.match(ops,/phone_number_addresses/);
 assert.match(ops,/handler_type==="calling"/);
 assert.match(ops,/handler_type==="messaging"/);
 assert.match(ops,/MOVE_6056558080_CALLING_ONLY/);
 assert.match(ops,/RESTORE_6056558080_CALLING_ONLY/);
 assert.match(ops,/original_route_details/);
 assert.match(ops,/primary_request_url===CALLBACK/);
 assert.match(ops,/primary_request_method==="POST"/);
 assert.match(ops,/router\.post\("\/voice-switch\/apply"/);
 assert.match(worker,/voice-switch\/apply/);
 assert.match(worker,/voice-switch\/rollback/);
 assert.match(ui,/voice-switch\/preflight/);
 assert.match(ui,/voice-switch\/apply/);
 assert.match(ui,/voice-switch\/rollback/);
});
