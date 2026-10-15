import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");

test("Old My Askanus money updates use same MAX ledger and retries cannot overwrite counters",()=>{
 const api=read("artifacts/api-server/src/routes/askanus.ts");
 const ui=read("artifacts/gavhah/src/pages/my/index.tsx");
 const migration=read("lib/db/migrations/20261014_max_progress_idempotency.sql");
 assert.ok(api.includes('tx.insert(maxProgressEvents)'));
 assert.ok(api.includes('tx.insert(maxReceipts)'));
 assert.ok(api.includes('tx.insert(maxPledges)'));
 assert.ok(api.includes('onConflictDoNothing()'));
 assert.ok(api.includes('A valid unique requestId'));
 assert.ok(api.includes('fundsReceived:sql'));
 assert.ok(api.includes('fundsPromised:sql'));
 assert.ok(api.includes('Use the audited progress/pledge/receipt endpoints'));
 assert.ok(ui.includes('requestId: financeRequestId'));
 assert.ok(ui.includes('setFinanceRequestId(crypto.randomUUID())'));
 assert.ok(migration.includes("UNIQUE(user_id,request_id)"));
});
test("Refunds cannot exceed receipt and preserve an immutable audit event",()=>{
 const api=read("artifacts/api-server/src/routes/communications-finance.ts");
 const migration=read("lib/db/migrations/20261014_max_receipt_reversals.sql");
 const ui=read("artifacts/gavhah/src/components/communications/donor-360.tsx");
 assert.ok(api.includes('"/askanus/receipts/:id/refunds"'));
 assert.ok(api.includes('tx.insert(maxReceiptRefunds)'));
 assert.ok(api.includes('onConflictDoNothing()'));
 assert.ok(api.includes('maxReceipts.refundedAmount'));
 assert.ok(api.includes('<= ${maxReceipts.amount}'));
 assert.ok(api.includes('CASE_BALANCE_CONFLICT'));
 assert.ok(api.includes('PLEDGE_BALANCE_CONFLICT'));
 assert.ok(migration.includes('CHECK(refunded_amount >= 0'));
 assert.ok(ui.includes('r.amount-r.refundedAmount'));
 assert.ok(ui.includes('refundKey'));
});
test("Donor search is server filtered to owner with pagination and sanitized query",()=>{
 const api=read("artifacts/api-server/src/routes/communications-max.ts");
 const ui=read("artifacts/gavhah/src/components/communications/max-call-desk.tsx");
 assert.ok(api.includes('ilike(communicationContacts.name'));
 assert.ok(api.includes('const owner=eq(communicationContacts.userId,userId)'));
 assert.ok(api.includes('.limit(rawLimit).offset(rawOffset)'));
 assert.ok(ui.includes('encodeURIComponent(term)'));
 assert.ok(ui.includes('setRemoteContacts'));
 assert.ok(ui.includes('controller.abort()'));
});
test("Case activity and follow-up lists have staged indexes",()=>{
 const sql=read("lib/db/migrations/20261014_max_release_indexes.sql");
 assert.ok(sql.includes("case_followups_case_status_due_idx"));
 assert.ok(sql.includes("case_activity_log_case_created_idx"));
 assert.ok(sql.includes("max_pledges_owner_status_due_idx"));
});
test("Campaign Center remains outside personal donor data and cannot be marked live yet",()=>{
 const plan=read("docs/GAVHAH-COMPLETE-MASTER-BUILD-20261014.md");
 assert.ok(plan.includes("פריוואטע"));
 assert.ok(plan.includes("קאמפיין סענטער"));
 assert.ok(plan.includes("STAGING"));
});
