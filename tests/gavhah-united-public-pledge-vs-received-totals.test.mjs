import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const route=readFileSync("artifacts/api-server/src/routes/gavhah-cause-channels.ts","utf8");
const phone=readFileSync("artifacts/api-server/src/lib/gavhah-phone4-united-flow.ts","utf8");
const web=readFileSync("artifacts/gavhah/src/pages/united/index.tsx","utf8");

test("One public endpoint derives BLN pledged and actually received from separate authoritative ledgers",()=>{
 assert.match(route,/sum\(amount_cents\)/);
 assert.match(route,/WHERE status IN \('accepted_bln','approved_bln','fulfilled'\)/);
 assert.match(route,/WHERE status='pending_team'/);
 assert.match(route,/gavhah_united_pledges/);
 assert.match(route,/gavhah_united_verified_totals/);
 assert.match(route,/pledgedDollars:/);
 assert.match(route,/verifiedRaisedDollars:/);
 assert.match(route,/pendingApprovalPledgedDollars:/);
 assert.doesNotMatch(route,/verifiedCents\s*=\s*.*amount_raised/i);
});
test("Phone United menu 4 reads both amounts before announcement and does not equate pledges with cash",()=>{
 const pledge=phone.indexOf("Total amount already undertaken, BLN:");
 const cash=phone.indexOf("Total money actually received:");
 const audio=phone.indexOf("const official=channel.messages?.announcement;");
 assert.ok(pledge>0);
 assert.ok(cash>pledge);
 assert.ok(audio>cash);
 assert.match(phone,/Total funds actually received: not yet verified/);
 assert.match(phone,/cause\.pledgedDollars/);
 assert.match(phone,/cause\.verifiedRaisedDollars/);
});
test("Public United page displays distinct clearly labeled totals in the cause summary and progress view",()=>{
 assert.match(web,/סך הכל שוין אונטערגענומען בל״נ/);
 assert.match(web,/סך הכל געלט שוין פאקטיש אריינגעקומען/);
 assert.match(web,/const pledged: number \| null =/);
 assert.match(web,/const received: number \| null =/);
 assert.match(web,/displayMoney\(pledged\)/);
 assert.match(web,/displayMoney\(received\)/);
 assert.doesNotMatch(web,/const raised = Number\(cause\?\.amountRaised/);
 assert.match(web,/Still Needed \(received\)/);
});
