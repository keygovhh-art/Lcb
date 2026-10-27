import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 RESERVED_OTHER_SYSTEM_NUMBERS,
 normalizedSignalWireNumber,
 isProtectedSignalWireNumber,
 classifySignalWireNumber
} from '../artifacts/api-server/src/lib/signalwire-number-safety.ts';
const read=p=>readFileSync(p,'utf8');
const creds=read('artifacts/api-server/src/routes/signalwire-credentials.ts');
const migration=read('artifacts/api-server/src/routes/hotline-migration.ts');
const callback=read('artifacts/api-server/src/lib/signalwire-next-hotline.ts');
const ui=read('artifacts/gavhah/src/pages/admin/signalwire.tsx');
test('8080655605 belongs to another system and is protected in any normalized presentation',()=>{
 assert.ok(RESERVED_OTHER_SYSTEM_NUMBERS.has('8080655605'));
 assert.ok(RESERVED_OTHER_SYSTEM_NUMBERS.has('6056558080'));
 for(const p of ['8080655605','(808) 065-5605','+18080655605','1-808-065-5605']){
  assert.equal(normalizedSignalWireNumber(p),'8080655605');
  assert.equal(isProtectedSignalWireNumber(p),true);
 }
 assert.equal(isProtectedSignalWireNumber('+18085551234'),false);
 for(const p of ['+16056558080','(605) 655-8080','6056558080','1 605-655-8080']){
  assert.equal(normalizedSignalWireNumber(p),'6056558080');
  assert.equal(isProtectedSignalWireNumber(p),true);
 }
});
test('Even apparently unused reserved number cannot be selected',()=>{
 const r=classifySignalWireNumber({phone_number:'+18080655605',
  friendly_name:'Other owner system',capabilities:{voice:true},
  voice_url:null,voice_application_sid:null,trunk_sid:null});
 assert.equal(r.reserved,true);
 assert.equal(r.canConsider,false);
 assert.equal(r.reason,'reserved_for_another_system');
});
test('Never treat voice_url, application, fallback, or trunk assignment as free',()=>{
 for(const p of [
  {voice_url:'https://other.example/ivr'},
  {voice_application_sid:'12345'},
  {voice_fallback_url:'https://another.example/backup'},
  {trunk_sid:'sip-trunk'}
 ]){
  const r=classifySignalWireNumber({
   phone_number:'+18085551234',capabilities:{voice:true},...p});
  assert.equal(r.voiceAssigned,true);
  assert.equal(r.canConsider,false);
 }
});
test('Unknown SignalWire Fabric routing is explicitly subject to manual check',()=>{
 const r=classifySignalWireNumber({
  phone_number:'+18085551234',capabilities:{voice:true},
  voice_url:null,voice_application_sid:null});
 assert.equal(r.reason,'needs_provider_route_review');
 assert.equal(r.canConsider,true);
});
test('Inventory uses only GET, never reconfigures provider or leaks API token',()=>{
 assert.match(creds,/router.get\("\/numbers"/);
 assert.match(creds,/readSignalWireInventory/);
 assert.match(creds,/IncomingPhoneNumbers\?PageSize=1000/);
 assert.match(creds,/method:"GET"/);
 assert.match(creds,/secret:"NEVER_RETURNED"/);
 assert.match(creds,/next_page_uri/);
 assert.doesNotMatch(creds,/UpdateIncomingPhoneNumber|Calls\.create/);
});
test('Selection and callback refuse the reserved number regardless of DB state',()=>{
 assert.match(migration,/isProtectedSignalWireNumber\(candidateNumber\)/);
 assert.match(migration,/assertSafeSignalWireCandidate\(existing.candidate_number\)/);
 assert.match(callback,/isProtectedSignalWireNumber\(called\)/);
 assert.match(callback,/This number is reserved for another system/);
});
test('Mobile admin shows inventory and confirms testing does not alter other routes',()=>{
 assert.match(ui,/605\) 655-8080/);
 assert.match(ui,/request\("numbers"\)/);
 assert.match(ui,/n.reserved/);
 assert.match(ui,/n.voiceAssigned/);
 assert.match(ui,/window.confirm/);
 assert.match(ui,/נישט געענדערט|גארנישט טוישן|נישט אריבערגעפירט/u);
 assert.match(ui,/candidateNumber:n.number/);
});
