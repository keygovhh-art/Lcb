import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=p=>readFileSync(p,"utf8");
const phone=file("artifacts/api-server/src/lib/max-askanus-phone.ts");
const bridge=file("artifacts/api-server/src/lib/signalwire-shared-ivr.ts");
const tree=file("artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts");
const web=file("artifacts/api-server/src/routes/askanus.ts");
test("Only paired linked website member can open the expanded personal IVR",()=>{
 assert.match(phone,/s\.linked_until>now\(\)/);
 assert.match(phone,/u\.status NOT IN \('banned','suspended'\)/);
 assert.match(phone,/member_id IS NOT NULL/);
 assert.match(phone,/row\.user_id!==userId/);
 assert.match(bridge,/checkSignalWireSignature/);
 assert.match(bridge,/advancedAskanusPhone/);
 assert.match(bridge,/atAskanusMenu:state\?\.path==="12"/);
 assert.match(bridge,/if\(digits!=="55555"\)/);
 assert.match(tree,/"7":leaf\("Advanced My Askanus phone workspace/);
});
test("Same Neon source of truth as /my, no parallel records",()=>{
 for(const name of ["askanus_tasks","askanus_cases","askanus_notes","case_followups",
  "communication_contacts","max_pledges","fundraising_call_reports"]){
  assert.ok(phone.includes(name),name);
 }
 for(const name of ["askanus_tasks","askanus_cases","askanus_notes"]){
  assert.ok(web.includes(name)||web.includes(name.replaceAll("_","")),name);
 }
 assert.match(phone,/WHERE user_id=\$1/);
 assert.match(phone,/WHERE f\.id=\$1 AND c\.user_id=\$2/);
});
test("Sensitive write flows have explicit two-action confirmation",()=>{
 assert.match(phone,/confirm_create/);
 assert.match(phone,/Press 1 to SAVE/);
 assert.match(phone,/confirm_toggle/);
 assert.match(phone,/Press 1 AGAIN to confirm/);
 assert.match(phone,/if\(digit==="1"&&row\.pending_title\)/);
 assert.match(phone,/await client\.query\("BEGIN"\)/);
 assert.match(phone,/FOR UPDATE/);
 assert.match(phone,/ROLLBACK/);
 assert.match(phone,/Recurring followups require calendar logic/);
 assert.doesNotMatch(phone,/INSERT INTO public\.max_receipts/);
 assert.doesNotMatch(phone,/UPDATE public\.max_pledges/);
});
test("Speech is not published until readback and English constraint declared",()=>{
 assert.match(phone,/input="speech" language="en-US"/);
 assert.match(phone,/Speech was not understood/);
 assert.match(phone,/English speech recognition/);
 assert.match(phone,/cleanSpeech\(speech\)/);
});
