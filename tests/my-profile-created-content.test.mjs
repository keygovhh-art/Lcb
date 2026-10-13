import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=path=>readFileSync(path,"utf8");
const api=source("artifacts/api-server/src/routes/me-created-content.ts");
const profile=source("artifacts/gavhah/src/pages/profile/index.tsx");
const component=source("artifacts/gavhah/src/components/profile/my-created-content.tsx");
const routes=source("artifacts/api-server/src/routes/index.ts");
const volunteers=source("artifacts/api-server/src/routes/volunteers.ts");
const directory=source("artifacts/gavhah/src/pages/directory/index.tsx");
const charity=source("artifacts/api-server/src/routes/charity.ts");
const charitySchema=source("lib/db/src/schema/charity.ts");
const migration=source("lib/db/migrations/20261013_charity_creator_identity.sql");

test("My Creations is private to active verified session and never reads a supplied account ID",()=>{
 assert.match(api,/router\.get\("\/me\/created-content", requireAuth/);
 assert.match(api,/const userId = getSessionUserId\(req\)!/);
 for(const column of [
  "groupsTable.ownerId,userId","communityProjectsTable.ownerId,userId",
  "causeSubmissionsTable.userId,userId","charitiesTable.createdByUserId,userId",
  "minyansTable.submittedByUserId,userId","discussionsTable.authorId,userId",
  "groupPostsTable.authorId,userId","askanuscases.userId,userId",
  "volunteerProfilesTable.userId,userId","helpRequestsTable.userId,userId",
 ]) assert(api.includes(column),column+" must use session account");
 assert.doesNotMatch(api,/req\.query\.userId|req\.body\.userId|req\.params\.userId/);
 assert.match(api,/private, no-store/);
 assert.match(routes,/router\.use\(meCreatedContentRouter\)/);
});
test("one account can request help and register as a volunteer independently",()=>{
 assert.match(volunteers,/router\.post\("\/volunteers", requireAuth/);
 assert.match(volunteers,/router\.post\("\/help-requests", requireAuth/);
 const volunteerRoute=volunteers.slice(volunteers.indexOf('router.post("/volunteers"'),volunteers.indexOf('router.get("/volunteers/:id"'));
 const helpRoute=volunteers.slice(volunteers.indexOf('router.post("/help-requests"'),volunteers.indexOf('router.get("/help-requests/:id"'));
 assert.doesNotMatch(volunteerRoute,/helpRequestsTable/);
 assert.doesNotMatch(helpRoute,/volunteerProfilesTable/);
 assert.match(api,/offersHelp: volunteerProfiles.length>0/);
 assert.match(api,/needsHelp: helpRequests.length>0/);
 assert.match(component,/data\?\.roles\.needsHelp/);
 assert.match(component,/data\?\.roles\.offersHelp/);
 assert.match(directory,/id="help-center"/);
});
test("Private requests and case notes never leak into a public user directory",()=>{
 assert.match(profile,/<MyCreatedContent\s*\/>/);
 assert.match(component,/queryKey:\["\/api\/me\/created-content",user\?\.id\]/);
 assert.match(component,/credentials:"include",cache:"no-store"/);
 assert.match(component,/פריוואט/);
 assert.doesNotMatch(api,/res\.json\(groups\)/);
 assert.doesNotMatch(api,/contactInfo|passwordHash|memberContactMethodsTable/);
 assert.match(api,/type:OwnedItemType/);
 assert.match(api,/helpRequests\.forEach/);
});
test("My Profile explicitly separates owned items, following and saved",()=>{
 assert.match(profile,/<Tabs defaultValue="created"/);
 assert.match(profile,/<TabsTrigger value="created"/);
 assert.match(profile,/<TabsTrigger value="following"/);
 assert.match(profile,/<TabsTrigger value="saved"/);
 assert.match(profile,/דאס איז נישט די Follow-up היסטאריע אין מיין עסקנות/);
 assert.match(component,/וואס איך האב שוין געעפנט/);
});
test("Future official charity campaigns use immutable creator ID, never guessed by organizer name",()=>{
 assert.match(charitySchema,/createdByUserId: integer\("created_by_user_id"\)/);
 assert.match(charity,/createdByUserId: getSessionUserId\(req\)!/);
 assert.match(charity,/function publicCharity/);
 assert.match(charity,/res\.json\(all\.map\(publicCharity\)\)/);
 assert.match(api,/charitiesTable\.createdByUserId,userId/);
 assert.match(migration,/STAGING ONLY/);
 assert.doesNotMatch(migration,/\bDROP\b|\bTRUNCATE\b|\bUPDATE public\.charities\b/);
});
