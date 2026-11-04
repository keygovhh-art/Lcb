import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");

test("Keypad 3 presents approved projects automatically, and 1 opens only options 1/2",()=>{
 const map=read("artifacts/api-server/src/lib/gavhah-main-phone-layout.ts");
 const api=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 const flow=read("artifacts/api-server/src/lib/gavhah-phone3-community-flow.ts");
 assert.match(map,/"9703":\{"1":"97031"\}/);
 assert.match(map,/"97031":\{"1":"970311","2":"970312"\}/);
 assert.match(api,/digit==="3"/);
 assert.match(api,/nextPhone3State/);
 assert.match(api,/phone3WantsRecording/);
 assert.match(api,/phone3Speech/);
 assert.match(flow,/WHERE status='active'/);
 assert.match(flow,/Press one for options/);
});
test("All private phone3 submissions are bound to verified member, never caller ID, and require explicit submit",()=>{
 const api=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 const flow=read("artifacts/api-server/src/lib/gavhah-phone3-community-flow.ts");
 assert.match(api,/memberAllowed\(client,\{\.\.\.s,member_id:userId\}\)/);
 assert.match(flow,/memberId:userId/);
 assert.match(flow,/validRecordedPath/);
 assert.match(flow,/draft|d\.stage==="confirm"/);
 assert.match(flow,/digit==="1"/);
 assert.match(flow,/SELECT count\(\*\)::text AS n FROM public.gavhah_phone3_intake/);
 const migration=read("lib/db/migrations/20261103_gavhah_phone3_private_intake_community_review.sql");
 assert.match(migration,/DEFAULT 'pending'/);
 assert.match(flow,/gavhah_phone3_intake/);
 assert.doesNotMatch(flow,/caller.?id/i);
});
test("Public project creation must always be pending and cannot be made active by owner",()=>{
 const route=read("artifacts/api-server/src/routes/community-projects.ts");
 const ui=read("artifacts/gavhah/src/pages/directory/index.tsx");
 assert.match(route,/status: "pending"/);
 assert.match(route,/p\.status !== "pending"/);
 assert.match(route,/Publication changes require staff approval/);
 assert.match(route,/Use the team review endpoint/);
 assert.match(route,/admin\/community-projects\/pending/);
 assert.match(route,/admin\/community-projects\/:id\/review/);
 assert.match(route,/gavhah_project_review_log/);
 assert.doesNotMatch(ui,/Your project is now listed in the directory/);
 assert.match(ui,/שיקן צום טיעם פאר באשטעטיגונג/);
});
test("Phone audio is private and staff review workspace actually allows playback and approval",()=>{
 const admin=read("artifacts/api-server/src/routes/gavhah-phone3-intake.ts");
 const panel=read("artifacts/gavhah/src/components/admin/community-review-workspace.tsx");
 const dashboard=read("artifacts/gavhah/src/pages/admin/index.tsx");
 assert.match(admin,/requireAdmin/);
 assert.match(admin,/validRecordedPath/);
 assert.match(admin,/fetchModeratedNewsAudio/);
 assert.match(admin,/private,no-store/);
 assert.match(panel,/\/api\/admin\/gavhah-phone3\/intake/);
 assert.match(panel,/community-projects\/pending/);
 assert.match(panel,/באשטעטיגן און פובליצירן/);
 assert.match(dashboard,/CommunityReviewWorkspace/);
 assert.match(dashboard,/value="community-review"/);
});
