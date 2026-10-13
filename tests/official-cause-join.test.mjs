import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = f => readFileSync(f, "utf8");
const migration = read("lib/db/migrations/20261013_official_joins_to_my_askanus.sql");
const featured = read("artifacts/api-server/src/routes/featured-causes.ts");
const projects = read("artifacts/api-server/src/routes/community-projects.ts");
const askanus = read("artifacts/api-server/src/routes/askanus.ts");
const united = read("artifacts/gavhah/src/pages/united/index.tsx");
const directory = read("artifacts/gavhah/src/pages/directory/index.tsx");
const personal = read("artifacts/gavhah/src/pages/my/index.tsx");
const schema = read("lib/db/src/schema/askanus.ts");

test("official joins are linked once to real member accounts and unique personal cases", () => {
  assert.match(schema,/sourceType: text\("source_type"\)/);
  assert.match(schema,/sourceId: integer\("source_id"\)/);
  assert.match(migration,/UNIQUE INDEX IF NOT EXISTS askanus_case_official_source_unique/);
  assert.match(migration,/user_id, source_type, source_id/);
  assert.match(migration,/featured_cause_supporters/);
  assert.match(migration,/project_members/);
  assert.match(migration,/SELECT DISTINCT ON/);
  assert.match(migration,/ON CONFLICT DO NOTHING/);
  assert.match(migration,/STAGED ONLY/);
  assert.doesNotMatch(migration,/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/);
});
test("joining a featured cause atomically saves a personal action file and is idempotent", () => {
  assert.match(featured,/router.post\("\/featured-causes\/:id\/join", requireAuth/);
  assert.match(featured,/getSessionUserId\(req\)/);
  assert.match(featured,/db.transaction\(async tx/);
  assert.match(featured,/pg_advisory_xact_lock/);
  assert.match(featured,/sourceType: "featured_cause"/);
  assert.match(featured,/sourceId: causeId/);
  assert.match(featured,/\.onConflictDoNothing\(\)/);
  assert.match(featured,/alreadyJoined: true/);
});
test("community-project joins and organizers get a private case too", () => {
  assert.match(projects,/sourceType: "community_project"/);
  assert.match(projects,/sourceId: projectId/);
  assert.match(projects,/sourceId: created.id/);
  assert.match(projects,/pg_advisory_xact_lock/);
  assert.match(projects,/alreadyJoined: true/);
});
test("joined status is account-private; private official cases retain their activity", () => {
  assert.match(askanus,/router.get\("\/me\/official-joins", requireAuth/);
  assert.match(askanus,/getSessionUserId\(req\)/);
  assert.match(askanus,/where\(eq\(featuredCauseSupportersTable.userId, userId\)\)/);
  assert.match(askanus,/where\(eq\(projectMembersTable.userId, userId\)\)/);
  assert.match(askanus,/where\(eq\(askanuscases.userId, userId\)\)/);
  assert.match(askanus,/private, no-store/);
  assert.match(askanus,/Official joined cases can be closed but not deleted/);
  assert.match(united,/איך בין אקטיוו אי״ה/);
  assert.match(united,/עפען קאמפיין אין מיין פריוואטער סיסטעם/);
  assert.match(united,/getListFeaturedCauseSupportersQueryKey/);
  assert.match(directory,/myOfficialProject/);
  assert.match(personal,/NewTaskDialog caseTitle=\{c.title\}/);
  assert.match(personal,/scrollIntoView/);
});
test("joining does not invent received funds or delete historical memberships", () => {
  assert.match(migration,/funds_promised,funds_received,goal_amount/);
  assert.match(migration,/0,0,0/);
  assert.doesNotMatch(migration,/UPDATE public\.featured_cause_supporters|DELETE FROM public\.featured_cause_supporters/);
});
