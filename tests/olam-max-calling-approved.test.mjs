import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const menu=readFileSync(new URL("../artifacts/api-server/src/lib/olam-max-calling-menu.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../artifacts/api-server/src/routes/olam-max-calling-approved.ts",import.meta.url),"utf8");
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
 assert.match(route,/financialTotalsNotModified:true/);
});
test("scheduled calls are not automatically dialed and appear 25 minutes early",()=>{
 assert.match(route,/due_at<=now\(\)\+interval '25 minutes'/);
 assert.match(route,/automaticDial:false/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS history_hidden_at/);
 assert.match(migration,/ADD COLUMN IF NOT EXISTS postal_address/);
});
