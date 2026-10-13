import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=p=>readFileSync(p,"utf8");
const base=source("artifacts/api-server/src/routes/groups.ts");
const advanced=source("artifacts/api-server/src/routes/group-advanced.ts");
const schema=source("lib/db/src/schema/groups.ts");
const migration=source("lib/db/migrations/20261013_groups_advanced_moderation.sql");
const admin=source("artifacts/gavhah/src/components/groups/group-management.tsx");
const extras=source("artifacts/gavhah/src/components/groups/group-post-extras.tsx");
const page=source("artifacts/gavhah/src/pages/groups/detail.tsx");
test("founder is protected and only elevated system admins may transfer ownership",()=>{
 assert.match(base,/Group founder protected; only Gavhah system administration/);
 assert.match(base,/target\.userId===group\.ownerId/);
 assert.match(base,/Only the group founder may add\/remove admins/);
 assert.match(advanced,/router\.patch\("\/admin\/groups\/:id\/owner",requireAdmin/);
 assert.match(advanced,/isSystemAdmin\(getSessionUserRole\(req\)\)/);
 assert.match(advanced,/role:"owner"/);
 assert.match(admin,/באשיצט/);
});
test("member approval suspension removal reactivation and delegated moderation are restricted",()=>{
 assert.match(base,/\["suspended","removed"\]\.includes\(existing\.status\)/);
 assert.match(base,/\["approved","rejected","suspended","removed"\]/);
 assert.match(base,/Only the group founder may add\/remove admins/);
 assert.match(base,/targetAdmin&&!actorIsOwner&&!systemAdmin/);
 assert.match(base,/memberCount:sql/);
 assert.match(admin,/מאכן אדמין/);
 assert.match(admin,/סוספענדירן/);
 assert.match(admin,/רעאקטיווירן/);
});
test("reply and post review are enforced on server; pending content filtered from public",()=>{
 assert.match(base,/moderationStatus:!manager&&group\.postApproval\?"pending":"approved"/);
 assert.match(base,/rows\.filter\(row => row\.moderationStatus==="approved"/);
 assert.match(base,/membersCanPost/);
 assert.match(advanced,/router\.get\("\/groups\/:id\/moderation",requireAuth/);
 assert.match(advanced,/replyApproval\?"pending":"approved"/);
 assert.match(advanced,/Replies disabled/);
 assert.match(advanced,/Replies are locked/);
 assert.match(advanced,/router\.patch\("\/groups\/:id\/posts\/:postId\/review"/);
 assert.match(advanced,/router\.patch\("\/groups\/:id\/posts\/:postId\/replies\/:replyId\/review"/);
 assert.match(page,/<GroupManagement/);
 assert.match(page,/<GroupPostExtras/);
});
test("view counts are unique to signed-in members, and downvote counts are secret",()=>{
 assert.match(schema,/group_post_views_post_user_unique/);
 assert.match(schema,/group_post_downvotes_post_user_unique/);
 assert.match(advanced,/router\.post\("\/groups\/:id\/posts\/:postId\/view",requireAuth/);
 assert.match(advanced,/\.onConflictDoNothing\(\)/);
 assert.match(base,/const \{downvotes, \.\.\.withoutDownvotes\}=safe/);
 assert.match(base,/views:group\.showViewCounts\|\|manager\?row\.views:null/);
 assert.match(advanced,/res\.json\(\{downvoted:result\}\)/);
 assert.match(extras,/post\.downvotes/);
 assert.match(extras,/manager&&typeof post\.downvotes/);
});
test("group reports cannot disclose staff-only or shared routing to group admins",()=>{
 assert.match(schema,/toStaff: boolean\("to_staff"\)/);
 assert.match(schema,/groupStatus: text\("group_status"\)/);
 assert.match(schema,/postExcerpt: text\("post_excerpt"\)/);
 assert.match(advanced,/postExcerpt:post.content.slice\(0,4000\)/);
 assert.match(advanced,/postExcerpt:r.postExcerpt/);
 // Staff reports are retained when moderators delete a reported post/group.
 const reportSchema=schema.slice(schema.indexOf("export const groupReportsTable"));
 assert.doesNotMatch(reportSchema,/onDelete:"cascade"/);
 const reportMigration=migration.slice(migration.indexOf("CREATE TABLE IF NOT EXISTS public.group_post_reports"));
 assert.doesNotMatch(reportMigration,/REFERENCES public\.group_(?:posts|groups)\(id\) ON DELETE CASCADE/);
 assert.match(schema,/staffStatus: text\("staff_status"\)/);
 assert.match(advanced,/eq\(groupReportsTable\.toGroup,true\)/);
 assert.match(advanced,/status:r\.groupStatus/);
 assert.match(advanced,/status:r\.staffStatus/);
 assert.match(advanced,/res\.json\(\{ok:true\}\)/);
 assert.match(advanced,/Explicit allowlist, never serialize toStaff or staffStatus/);
 assert.doesNotMatch(admin,/report\.toStaff|report\.staffStatus/);
 assert.match(extras,/<option value="staff">/);
 assert.match(extras,/<option value="both">/);
});
test("post owners and admins have deletion controls, pin lock options and safe counters",()=>{
 assert.match(advanced,/router\.patch\("\/groups\/:id\/posts\/:postId\/options"/);
 assert.match(base,/desc\(groupPostsTable\.isPinned\)/);
 assert.match(base,/post\.moderationStatus==="approved"/);
 assert.match(extras,/פינען פאוסט/);
 assert.match(extras,/לאקן רעפלייען/);
 assert.match(page,/post\.authorId === user\.id \|\| canManageGroup/);
});
test("production data is protected until explicit release authorization",()=>{
 assert.match(migration,/STAGING ONLY/);
 assert.doesNotMatch(migration,/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/);
 assert.match(admin,/גרופ אדמיניסטראציע/);
});
