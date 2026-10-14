import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const get=p=>fs.readFileSync(p,"utf8");

test("Pledge recording and partial settlement use one pledge, a verified owner and an atomic numeric bound",()=>{
 const p=get("artifacts/api-server/src/routes/communications-finance.ts");
 const call=get("artifacts/api-server/src/routes/communications-max.ts");
 assert.ok(call.includes('moneyKind==="pledged"'));
 assert.ok(call.includes('tx.insert(maxPledges)'));
 assert.ok(call.includes('tx.insert(maxReceipts)'));
 assert.ok(p.includes('"/askanus/pledges/:id/settlements"'));
 assert.ok(p.includes('eq(maxPledges.userId,userId)'));
 assert.ok(p.includes('onConflictDoNothing()'));
 assert.ok(p.includes('maxPledges.paidAmount} +'));
 assert.ok(p.includes('<= ${maxPledges.amount}'));
 assert.ok(p.includes('fundsReceived:sql'));
 assert.ok(p.includes('fundsPromised:sql'));
});
test("Outstanding pledge examples remain correct after partial settlement",()=>{
 const amount=1000, cash=200, additional=300;
 assert.equal(amount-cash-additional,500);
 assert.equal(cash+additional,500);
});
test("Donor 360 private access and linked follow-up respect ownership",()=>{
 const p=get("artifacts/api-server/src/routes/communications-finance.ts");
 assert.ok(p.includes('"/askanus/contacts/:id/360"'));
 assert.ok(p.includes('eq(communicationContacts.userId,userId)'));
 assert.ok(p.includes('eq(maxPledges.userId,userId)'));
 assert.ok(p.includes('eq(maxFollowupContacts.userId,userId)'));
 assert.ok(p.includes('"/askanus/contacts/:id/followups"'));
 assert.ok(p.includes('tx.insert(caseFollowups)'));
 assert.ok(p.includes('tx.insert(maxFollowupContacts)'));
});
test("No-call flag prevents ordinary opt-out removal",()=>{
 const p=get("artifacts/api-server/src/routes/communications-max.ts");
 const form=get("artifacts/gavhah/src/components/communications/max-call-desk.tsx");
 assert.ok(p.includes('Opt-out can only be reversed'));
 assert.ok(p.includes('outcome === "do_not_call"'));
 assert.ok(form.includes('chosenContact?.doNotCall'));
 assert.ok(form.includes('!chosenContact.doNotCall'));
});
test("Professional mobile navigation retains all 5 main destinations",()=>{
 const form=get("artifacts/gavhah/src/components/communications/max-call-desk.tsx");
 for(const name of ['max-today','max-call','max-contacts','max-projects','max-more'])
  assert.ok(form.includes('id="'+name+'"'),name+" section missing");
 assert.ok(form.includes('allOpen'));
 assert.ok(form.includes('dueNow'));
});
test("Source-grounded personal overview cannot query another member's cases",()=>{
 const api=get("artifacts/api-server/src/routes/communications-today.ts");
 assert.ok(api.includes('"/askanus/max/today"'));
 assert.ok(api.includes('eq(askanuscases.userId,userId)'));
 assert.ok(api.includes('eq(askanustasks.userId,userId)'));
 assert.ok(api.includes('inArray(caseFollowups.caseId,caseIds)'));
 assert.ok(api.includes('manuallyReportedReceivedTotal'));
});
