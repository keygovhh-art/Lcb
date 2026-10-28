import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const phone=readFileSync("artifacts/api-server/src/lib/yemot-api-driven-phone.ts","utf8");
const sections=readFileSync("artifacts/api-server/src/lib/yemot-section-batch1.ts","utf8");

test("Yemot MAX call outcomes are a manual AFTER-call report, not dialing",()=>{
 assert.match(phone,/const manualOutcomes:Record<string,string>/);
 for(const outcome of ["spoke","no_answer","callback","not_interested","do_not_call"]){
  assert.ok(phone.includes('"'+outcome+'"'),outcome);
 }
 assert.match(sections,/Press nine to enter a manual call result/);
 assert.match(phone,/No actual call was placed and no payment was collected/);
 assert.ok(!phone.includes("dialContact("));
});
test("Phone verification, single owned case and Do Not Call are enforced",()=>{
 assert.match(phone,/memberAllowed\(client,\{\.\.\.s,member_id:userId\}\)/);
 assert.match(phone,/WHERE user_id=\$1 AND do_not_call=false/);
 assert.match(phone,/matchingCase\.rows\.length>1/);
 assert.match(phone,/WHERE id=\$1 AND user_id=\$2 FOR UPDATE/);
 assert.match(phone,/status!='closed' FOR UPDATE/);
 assert.match(phone,/owned\.do_not_call/);
 assert.match(phone,/SET do_not_call=true/);
 assert.match(phone,/expiresAt:Date\.now\(\)\+5\*60\*1000/);
});
test("Saved reports match website data model; double-confirmed and idempotent",()=>{
 assert.match(phone,/confirmationPrompt/);
 assert.match(phone,/else if\(digit==="5"\)\{\s*feedback=\(await recordConfirmedManualResult/);
 assert.match(phone,/INSERT INTO public\.fundraising_call_reports/);
 assert.match(phone,/INSERT INTO public\.case_activity_log/);
 assert.match(phone,/ON CONFLICT\(user_id,request_id\) DO NOTHING/);
 assert.match(phone,/VALUES \(\$1,\$2,\$3,\$4,\$5,'none',0,\$6,\$7,'neutral'\)/);
 assert.match(phone,/action_flash=\$15/);
 assert.match(phone,/reportMode,manualFlash\]/);
});
test("No custom recordings or TTS can override pending confirmation",()=>{
 assert.match(phone,/!manualFlash&&!goToProviderManagement/);
 assert.match(phone,/if\(path==="141"&&readManualResultPending\(manualFlash\)\)/);
});
