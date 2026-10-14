import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = path => fs.readFileSync(path,"utf8");
test("manual call outcome credits the same owned My Askanus case once",()=>{
  const api = read("artifacts/api-server/src/routes/communications-max.ts");
  assert.match(api,/\/askanus\/cases\/:id\/call-reports/);
  assert.match(api,/eq\(askanuscases\.userId,userId\)/);
  assert.match(api,/db\.transaction\(/);
  assert.match(api,/onConflictDoNothing\(\)/);
  assert.match(api,/eq\(fundraisingCallReports\.requestId,requestId\)/);
  assert.match(api,/caseActivityLog/);
  assert.match(api,/caseFollowups/);
  assert.match(api,/fundsReceived: sql/);
  assert.match(api,/fundsPromised: sql/);
});
test("financial records have a per-member idempotency constraint",()=>{
  const migration = read("lib/db/migrations/20261014_gavhah_max_communication.sql");
  assert.match(migration,/UNIQUE \(user_id,request_id\)/);
  assert.match(migration,/REFERENCES askanus_cases\(id\)/);
  assert.match(migration,/REFERENCES communication_contacts\(id\)/);
});
test("follow-up edits use the existing shared case_followups and server authorization",()=>{
  const api = read("artifacts/api-server/src/routes/askanus.ts");
  const ui = read("artifacts/gavhah/src/components/askanus/case-followups.tsx");
  assert.match(api,/router\.patch\("\/askanus\/followups\/:id"/);
  assert.match(api,/ac\.user_id =/);
  assert.match(ui,/method: "PATCH"/);
  assert.match(ui,/setEditingId/);
  assert.match(ui,/onUpdated\(\)/);
});
test("MAX and My Askanus share case API, never claim calls are provider verified",()=>{
  const max = read("artifacts/gavhah/src/components/communications/max-call-desk.tsx");
  const my = read("artifacts/gavhah/src/pages/my/index.tsx");
  assert.match(max,/request<PersonalCase\[\]>\("\/api\/askanus\/cases"\)/);
  assert.match(max,/CaseFollowups/);
  assert.match(max,/tel:/);
  assert.match(my,/href="\/communications"/);
  assert.match(max,/קיין טעלעפאן־פארבינדונג איז נאכנישט אקטיוו/);
});