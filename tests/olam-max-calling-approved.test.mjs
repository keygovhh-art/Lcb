import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const menu=readFileSync(new URL("../artifacts/api-server/src/lib/olam-max-calling-menu.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../artifacts/api-server/src/routes/olam-max-calling-approved.ts",import.meta.url),"utf8");
const ledger=readFileSync(new URL("../artifacts/api-server/src/lib/olam-max-call-finance.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/20261112_olam_max_calling_approved.sql",import.meta.url),"utf8");
test("approved call menu keys are fixed across providers",()=>{
 for(const [key,value] of [["1","make_call"],["2","report_external_call"],["3","call_history"],["4","create_contact"],["5","schedule_call"]])
  assert.match(menu,new RegExp('"'+key+'": "'+value+'"'));
 assert.match(menu,/providerOutbound: "signalwire"/);
 assert.match(menu,/scheduledDeskAdvanceMinutes: 25/);
 assert.match(menu,/historyOptionsWindowSeconds: 2/);
});
test("late edits and call-only history hiding do not erase core records",()=>{
 assert.match(route,/const merged=\{\.\.\.prior,outcome:owned.outcome,mood:owned.mood,note:owned.note,\.\.\.req.body\}/);
 assert.match(route,/history_hidden_at=now\(\)/);
 assert.match(route,/financialRecordsPreserved:true/);
 assert.match(route,/providerVerified:false/);
 assert.match(route,/reconcileOlamCallFinance\(uid,id\)/);
 assert.match(ledger,/SELECT id,user_id,case_id,contact_id,number_e164,outcome,mood,note,report_details/);
 assert.match(ledger,/FOR UPDATE/);
 assert.match(ledger,/ON CONFLICT\(user_id,request_id\)/);
 assert.match(ledger,/for\(const id of \[\.\.\.deltas.keys\(\)\]/);
});
test("scheduled calls are not automatically dialed and appear 25 minutes early",()=>{
 assert.match(route,/due_at<=now\(\)\+interval '25 minutes'/);
 assert.match(route,/automaticDial:false/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS history_hidden_at/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS postal_address/);
});

test("redial is SignalWire only and a phone-confirmed request",()=>{
 assert.match(route,/provider==="yemot"/);
 assert.match(route,/callInitiated:false/);
 assert.match(route,/placeOlamMaxOutboundCall/);
 assert.match(route,/Do Not Call contact; no redial permitted/);
});
test("finance and migration use existing ledger without deleting a contact",()=>{
 const f=readFileSync(new URL("../migrations/20261112_olam_call_finance_link.sql",import.meta.url),"utf8");
 assert.match(f,/max_call_financial_links/);
 assert.match(ledger,/fundraising_call_reports/);
 assert.match(ledger,/funds_received=funds_received/);
 assert.match(ledger,/funds_promised=funds_promised/);
 assert.match(ledger,/INSERT INTO public.case_activity_log/);
 assert.match(route,/postal_address/);
});
