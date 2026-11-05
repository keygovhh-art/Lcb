import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const lib=read("artifacts/api-server/src/lib/gavhah-united-participation.ts");
const route=read("artifacts/api-server/src/routes/gavhah-united-workspace.ts");
const staff=read("artifacts/api-server/src/routes/gavhah-united-case-admin.ts");
const phone=read("artifacts/api-server/src/lib/gavhah-phone4-united-flow.ts");

test("Same core BLN/Donation transaction is called from web and Yemot, with member case idempotence",()=>{
 assert.match(lib,/ensureUnitedCauseCase/);
 assert.match(lib,/pg_advisory_xact_lock/);
 assert.match(lib,/source_type='featured_cause'/);
 assert.match(lib,/ON CONFLICT\(cause_id,member_id\) DO NOTHING/);
 assert.match(lib,/newUnitedPledge/);
 assert.match(lib,/newUnitedDonationIntent/);
 assert.match(route,/newUnitedPledge/);
 assert.match(route,/newUnitedDonationIntent/);
 assert.match(phone,/newUnitedPledge/);
 assert.match(phone,/newUnitedDonationIntent/);
 assert.match(route,/requestKeyValid/);
});
test("BLN beyond 2 calendar months requires staff approval, and accepted pledge has followup",()=>{
 assert.match(lib,/INTERVAL '2 months'/);
 assert.match(lib,/pending_team/);
 assert.match(lib,/accepted_bln/);
 assert.match(route,/pending_team/);
 assert.match(route,/approved_bln/);
 assert.match(lib,/INSERT INTO public\.case_followups/);
 assert.match(route,/acceptPledgeIntoCase/);
 assert.match(route,/notifyUser/);
});
test("Pledges are not money received and legacy join cannot inflate raised totals",()=>{
 const old=read("artifacts/api-server/src/routes/featured-causes.ts");
 const max=read("artifacts/api-server/src/routes/askanus.ts");
 assert.doesNotMatch(old,/amountRaised: sql`\$\{featuredCausesTable\.amountRaised\}/);
 assert.match(old,/Financial undertakings require the BLN form/);
 assert.match(max,/For official United cause cases, use the BLN undertaking/);
 assert.match(route,/submitted_for_verification/);
 assert.match(route,/verified_received_cents/);
 assert.match(route,/gavhah_united_verified_totals/);
});
test("Payment adapter cannot debit without provider; SignalWire quotas remain reserved-only",()=>{
 const settings=read("artifacts/api-server/src/routes/gavhah-cause-channels.ts");
 assert.match(settings,/automaticApiCharges:false/);
 assert.match(settings,/hosted_checkout/);
 assert.match(staff,/provider_enforcement_active=false/);
 assert.match(staff,/status='linked'/);
 assert.match(staff,/reserved/);
 assert.match(staff,/usableOnSignalWire:false/);
});
test("Case collaborators are strictly authenticated and expire, no broad admin access",()=>{
 assert.match(staff,/requireAuth/);
 assert.match(staff,/collaborator_id=\$2/);
 assert.match(staff,/revoked_at IS NULL AND a.expires_at>now\(\)/);
 assert.match(staff,/viewer/);
 assert.match(staff,/coordinator/);
 assert.match(staff,/followups/);
 assert.match(staff,/role!=="coordinator"/);
});
test("Real joined-cause web and phone user entry points are connected",()=>{
 const web=read("artifacts/gavhah/src/pages/united/index.tsx");
 const my=read("artifacts/gavhah/src/pages/my/index.tsx");
 const dashboard=read("artifacts/gavhah/src/pages/admin/index.tsx");
 const ivr=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 assert.ok(web.includes("channelKey}/${causeId}/${endpoint}"));
 assert.match(my,/UnitedMemberCaseHub/);
 assert.match(dashboard,/UnitedTeamDashboard/);
 assert.match(ivr,/digit==="4"/);
 assert.match(ivr,/nextUnitedPhone4/);
 assert.match(ivr,/phone4InputKind/);
 assert.match(phone,/Record the name of the suggested cause/);
});
test("Daily Cause stays completely independent from United and news prelude is optional",()=>{
 const migration=read("lib/db/migrations/20261103_gavhah_united_daily_independent_channels.sql");
 const phone=read("artifacts/api-server/src/lib/gavhah-phone4-united-flow.ts");
 const publicNews=read("artifacts/gavhah/src/pages/news/index.tsx");
 assert.match(migration,/channel IN \('united','daily'\)/);
 assert.match(migration,/VALUES \('united',true\),\('daily',false\)/);
 assert.match(phone,/dailyBeforeNewsSegments/);
 assert.match(phone,/data.phoneBeforeNews/);
 assert.match(publicNews,/DailyCauseNewsPrelude/);
});
