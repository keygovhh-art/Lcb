import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

const source=path=>readFileSync(path,"utf8");
const phoneSource=source("artifacts/api-server/src/lib/max-phone-result.ts");
const phoneStorage=source("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
const website=source("artifacts/gavhah/src/components/communications/max-call-desk.tsx");
const donor360=source("artifacts/gavhah/src/components/communications/donor-360.tsx");
const api=source("artifacts/api-server/src/routes/communications-max.ts");
const script=ts.transpileModule(phoneSource,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const env={exports:{},Date,Intl,JSON,Number,Error};
runInNewContext(script,env);
const {advanceMaxPhone,maxPhonePrompt,readMaxPhonePending}=env.exports;
const pending=()=>({
 stage:"choose",userId:17,contactId:21,caseId:4,contactName:"Example donor",
 at:Date.now(),expiresAt:Date.now()+600000,requestId:"a".repeat(64)
});
const choice=(x,v)=>advanceMaxPhone(x,v);

test("Not Interested is a report-only outcome, not a Do Not Call event",()=>{
 const initial=choice(pending(),"4").pending;
 assert.equal(initial.outcome,"not_interested");
 assert.equal(initial.stage,"mood");
 assert.equal(initial.doNotCallConfirmed,false);
 assert.ok(!maxPhonePrompt(initial).text.includes("activate Do Not Call"));
 const next=choice(initial,"1").pending;
 assert.equal(next.stage,"recontact_scope");
 assert.equal(next.outcome,"not_interested");
 assert.equal(next.doNotCallConfirmed,false);
});
test("Do Not Call selection requires distinct confirmation before continuing",()=>{
 const first=choice(pending(),"5").pending;
 assert.equal(first.outcome,"do_not_call");
 assert.equal(first.stage,"do_not_call_confirm");
 assert.equal(first.doNotCallConfirmed,false);
 assert.match(maxPhonePrompt(first).text,/Press 1 to CONFIRM/);
 assert.equal(choice(first,"9").pending.stage,"do_not_call_confirm");
 assert.equal(choice(first,"9").save,undefined);
 const back=choice(first,"2").pending;
 assert.equal(back.stage,"choose");
 assert.equal(back.outcome,undefined);
 assert.equal(back.doNotCallConfirmed,false);
 const confirmed=choice(first,"1").pending;
 assert.equal(confirmed.stage,"mood");
 assert.equal(confirmed.doNotCallConfirmed,true);
 const notMood=choice(confirmed,"1").pending;
 const skip=choice(notMood,"1").pending;
 assert.equal(skip.stage,"confirm");
 assert.equal(choice(skip,"1").save,true);
});
test("A forged or stale final phone state cannot bypass explicit Do Not Call confirmation",()=>{
 const fake={...pending(),stage:"confirm",outcome:"do_not_call",doNotCallConfirmed:false};
 const attempt=choice(fake,"1");
 assert.equal(attempt.save,undefined);
 assert.equal(attempt.pending.stage,"do_not_call_confirm");
 assert.equal(attempt.pending.doNotCallConfirmed,false);
 assert.equal(choice({...fake,doNotCallConfirmed:true},"1").save,true);
 const reread=readMaxPhonePending(JSON.stringify(fake));
 assert.equal(reread.doNotCallConfirmed,false);
});
test("Both website reports and direct donor-card editing require distinct opt-out confirmation",()=>{
 assert.match(website,/const \[doNotCallConfirmed,setDoNotCallConfirmed\] = useState\(false\)/);
 assert.match(website,/setOutcome\(e\.target\.value\);setDoNotCallConfirmed\(false\)/);
 assert.match(website,/doNotCallConfirmed:outcome==="do_not_call"&&doNotCallConfirmed/);
 assert.match(website,/outcome==="do_not_call"&&\(contactId===null\|\|!doNotCallConfirmed\)/);
 assert.match(api,/outcome === "do_not_call" && \(contactId === null \|\| !doNotCallConfirmed\)/);
 assert.match(api,/outcome==="do_not_call" && doNotCallConfirmed && contactId!==null/);
 assert.doesNotMatch(api,/outcome==="not_interested"\s*&&\s*.*doNotCall/);
 assert.match(api,/req\.body\?\.doNotCall===true&&!prior\.doNotCall&&req\.body\?\.confirmDoNotCall!==true/);
 assert.match(donor360,/if\(markingNotCallable&&!window\.confirm/);
 assert.match(donor360,/confirmDoNotCall:markingNotCallable/);
});
test("Phone financial and contact writes are gated on extra DNC confirmation",()=>{
 assert.match(phoneStorage,/if\(outcome==="do_not_call"&&p\.doNotCallConfirmed!==true\)/);
 assert.match(phoneStorage,/if\(outcome==="do_not_call" && p\.doNotCallConfirmed===true\)/);
 assert.match(phoneStorage,/return "Do Not Call was not confirmed\. Nothing was saved and the donor was not blocked\."/);
});
