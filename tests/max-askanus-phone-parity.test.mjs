import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const yemot=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
const keypad=read("artifacts/api-server/src/lib/yemot-askanus-keypad.ts");
const actions=read("artifacts/api-server/src/lib/max-askanus-keypad.ts");
const signalwire=read("artifacts/api-server/src/lib/signalwire-shared-ivr.ts");
const tree=read("artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts");
test("My Askanus advanced phone engine is available ONLY inside Yemot",()=>{
 assert.match(yemot,/import \{yemotAskanusKeypad\}/);
 assert.match(yemot,/yemotEntry=!fromShared&&!from4444/);
 assert.match(yemot,/yemotInside=!fromShared&&!from4444/);
 assert.match(yemot,/path===""&&digit==="88"/);
 assert.match(yemot,/path==="12"&&digit==="7"/);
 assert.match(yemot,/memberAllowed\(client,\{\.\.\.s,member_id:userId\}\)/);
 assert.doesNotMatch(signalwire,/advancedAskanusPhone|handledAskanus|yemotAskanusKeypad/);
 assert.doesNotMatch(yemot,/For the advanced My Askanus keypad, press eight eight followed by pound/);
 assert.match(tree,/"7":leaf\("Advanced My Askanus phone workspace/);
});
test("Yemot sends provider-native keypad response, never SignalWire cXML",()=>{
 assert.match(yemot,/yemotEnglishRead\(spoken,"iv"\+step,reply\.digits\)/);
 assert.match(yemot,/reply\.digits/);
 assert.match(yemot,/await client\.query\("COMMIT"\)/);
 assert.match(keypad,/gavhah_yemot_askanus_keypad_sessions/);
 assert.match(keypad,/FOR UPDATE/);
 assert.doesNotMatch(keypad,/<Gather|<Say|CallSid|SHARED_SIGNALWIRE_URL|convertGavhahReplyToCxml/i);
});
test("My Askanus shares website database without copying private records",()=>{
 for(const name of ["askanus_tasks","askanus_cases","askanus_notes","case_followups",
   "communication_contacts","max_pledges"]){
  assert.ok(keypad.includes(name),name);
 }
 assert.match(keypad,/WHERE user_id=\$1/);
 assert.match(keypad,/WHERE c\.user_id=\$1/);
 assert.match(keypad,/if\(!userId\)/);
});
test("Yemot-only account link and two-step approvals",()=>{
 assert.match(yemot,/exactSecret\(req\)/);
 assert.match(yemot,/linked_until/);
 assert.match(keypad,/Press 1 a SECOND TIME/);
 assert.match(actions,/confirm_key_money_first/);
 assert.match(actions,/confirm_key_money_final/);
 assert.match(actions,/confirm_key_contact_dnc/);
 assert.doesNotMatch(actions,/stripe|PaymentIntent|chargeCard/i);
});
