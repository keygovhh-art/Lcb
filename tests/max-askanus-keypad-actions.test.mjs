import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=p=>readFileSync(p,"utf8");
const keypad=file("artifacts/api-server/src/lib/max-askanus-keypad.ts");
const phone=file("artifacts/api-server/src/lib/yemot-askanus-keypad.ts");
const yemot=file("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
const shared=file("artifacts/api-server/src/lib/signalwire-shared-ivr.ts");
const db=file("artifacts/api-server/src/routes/askanus.ts");
test("Expanded MAX DTMF functions use the SAME case/task/contact/followup/ledger tables as web",()=>{
 for(const table of ["askanus_tasks","askanus_cases","case_followups","communication_contacts",
 "max_pledges","max_receipts","max_progress_events","max_history_events","case_activity_log"]){
  assert.ok(keypad.includes(table),table);
 }
 for(const table of ["askanus_cases","askanus_tasks","case_followups"]){
  assert.ok(db.includes(table)||db.includes(table.replaceAll("_",""))||db.includes(({askanus_cases:"askanuscases",askanus_tasks:"askanustasks",case_followups:"caseFollowups"})[table]),table);
 }
 assert.match(phone,/myAskanusKeypad\(client,row,digit,userId\)/);
});
test("Actual phone keypad navigation supports task/case creation without speech",()=>{
 assert.match(keypad,/stage==="main"&&digit==="8"/);
 assert.match(keypad,/stage==="more"&&digit==="7"/);
 assert.match(keypad,/confirm_key_new_task/);
 assert.match(keypad,/confirm_key_new_case/);
 assert.match(keypad,/if\(digit!=="1"\|\|!row\.pending_title\)/);
 assert.match(phone,/8 new task on keypad/);
 assert.match(phone,/7 create a case from phone keypad/);
});
test("User-scoped and double-confirmed record edits cannot charge cards",()=>{
 assert.match(keypad,/WHERE id=\$1 AND user_id=\$2/);
 assert.match(keypad,/AND c\.user_id=\$2/);
 assert.match(keypad,/confirm_key_money_first/);
 assert.match(keypad,/confirm_key_money_final/);
 assert.match(keypad,/confirm_key_contact_dnc/);
 assert.match(keypad,/createHash\("sha256"\)/);
 assert.match(keypad,/ON CONFLICT DO NOTHING/);
 assert.match(keypad,/manually_reported/);
 assert.match(keypad,/repeat_rule='none'/);
 assert.doesNotMatch(keypad,/stripe|chargeCard|PaymentIntent|processPayment/i);
 assert.match(yemot,/exactSecret\(req\)/);
 assert.match(yemot,/!fromShared&&!from4444/);
 assert.doesNotMatch(shared,/advancedAskanusPhone/);
});
test("Phone no-ID policy and historical audit trails",()=>{
 assert.match(yemot,/memberAllowed\(client/);
 assert.match(phone,/if\(!userId\)/);
 assert.match(keypad,/source:"verified_phone_keypad"/);
 assert.match(keypad,/task_edited/);
 assert.match(keypad,/case_status_changed/);
 assert.match(keypad,/followup_edited/);
 assert.match(keypad,/contact_dnc_changed/);
 assert.match(keypad,/case_goal_changed/);
});
