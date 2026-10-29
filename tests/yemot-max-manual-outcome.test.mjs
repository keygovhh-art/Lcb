import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
const read=path=>readFileSync(path,"utf8");
const phone=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
const sections=read("artifacts/api-server/src/lib/yemot-section-batch1.ts");
const workflow=read("artifacts/api-server/src/lib/max-phone-result.ts");
const dateRules=read("artifacts/api-server/src/lib/max-calling-workflow.ts");
function loadTs(code){
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports:{},Date,Intl,JSON,Number,Error};
 runInNewContext(js,context);
 return context.exports;
}
const fns=loadTs(workflow), clock=loadTs(dateRules);
const pending={
 stage:"choose",userId:17,contactId:34,caseId:4,contactName:"Donor",
 expiresAt:Date.now()+15*60000,at:Date.now(),requestId:"a".repeat(64)
};
const click=(p,key)=>fns.advanceMaxPhone(p,key).pending;
test("Existing MAX phone is manual after-call and never dials a donor",()=>{
 assert.match(phone,/readMaxPhonePending/);
 assert.match(phone,/advanceMaxPhone/);
 assert.match(sections,/Press nine to enter a manual call result/);
 assert.doesNotMatch(phone,/dialContact\(/);
 assert.match(phone,/WHERE id=\$1 AND user_id=\$2 FOR UPDATE/);
 assert.match(phone,/owned\.do_not_call/);
});
test("No-answer callback menu accepts 10 minutes, custom 1..60, 1 hour and next 24 hours",()=>{
 let x=click(pending,"2");
 assert.equal(x.outcome,"no_answer");assert.equal(x.stage,"callback");
 const ten=click(x,"1");assert.equal(ten.callbackKind,"ten_minutes");assert.equal(ten.stage,"mood");
 const mins=click(x,"2");assert.equal(mins.stage,"callback_minutes");
 assert.equal(click(mins,"60").callbackMinutes,60);
 assert.equal(fns.advanceMaxPhone(mins,"61").error!==undefined,true);
 const hours=click(x,"4");assert.equal(hours.stage,"callback_hours");
 const chosen=click(hours,"7");assert.equal(chosen.stage,"callback_exact_choice");
 assert.equal(click(click(chosen,"2"),"46").callbackMinuteOfHour,46);
});
test("Donation requires explicit received/pledged status and amount, then mood can stay not_entered",()=>{
 let p=click(pending,"1");
 assert.equal(p.stage,"donation_kind");
 p=click(p,"1");p=click(p,"500");
 assert.equal(p.stage,"mood");assert.equal(p.amount,500);
 p=click(p,"1");assert.equal(p.mood,"not_entered");
 p=click(p,"2");assert.equal(p.recontactScope,"same_purpose");
 p=click(p,"1");assert.equal(p.recontactMonths,6);
 assert.equal(p.stage,"confirm");
 assert.equal(fns.advanceMaxPhone(p,"1").save,true);
});
test("Very warm, generous, and warm+generous categories are separate",()=>{
 let p=click(click(click(pending,"1"),"2"),"250");
 assert.equal(click(p,"7").mood,"very_warm");
 assert.equal(click(p,"8").mood,"gave_generously");
 assert.equal(click(p,"9").mood,"warm_and_gave_generously");
 assert.equal(fns.advanceMaxPhone(click(pending,"4"),"8").error!==undefined,true);
});
test("Phone reports have owner lock, idempotency, correct finance and recontact safety",()=>{
 for(const fragment of [
  "SELECT id,name,do_not_call,preferred_timezone FROM public.communication_contacts",
  "status!='closed' FOR UPDATE",
  "ON CONFLICT(user_id,request_id) DO NOTHING RETURNING id",
  "INSERT INTO public.max_pledges",
  "INSERT INTO public.max_receipts",
  "INSERT INTO public.case_followups",
  "INSERT INTO public.max_donor_recontact",
  "WHERE id=$1 AND user_id=$2",
  "Press one to review the next contact"
 ])assert.ok(phone.includes(fragment),fragment);
 assert.match(phone,/if\(outcome==="do_not_call" && p\.doNotCallConfirmed===true\)/);
 assert.match(phone,/if\(outcome==="do_not_call"&&p\.doNotCallConfirmed!==true\)/);
});
test("Callback timestamp respects true minutes and caller timezone; future period exact calendar months",()=>{
 const start=new Date("2026-10-29T20:46:00.000Z");
 const ten=clock.computeMaxCallback({kind:"ten_minutes"},start,"America/New_York");
 assert.equal(ten.time,"16:56");
 assert.equal(ten.date,"2026-10-29");
 const seven=clock.computeMaxCallback({kind:"hours",hours:7},start,"America/New_York");
 assert.equal(seven.time,"23:46");
 const exact=clock.computeMaxCallback({kind:"hours",hours:7,minuteOfHour:20},start,"America/New_York");
 assert.equal(exact.time,"23:20");
 assert.throws(()=>clock.computeMaxCallback({kind:"minutes",minutes:65},start));
 assert.equal(clock.computeMaxRecontact({scope:"same_purpose",afterMonths:1},new Date("2026-01-31T10:00:00.000Z")).toISOString(),"2026-02-28T10:00:00.000Z");
});
