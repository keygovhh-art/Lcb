import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  partitionCaseFollowups, updateCaseFollowupCompletion, removeCaseFollowup,
} from "../artifacts/gavhah/src/lib/case-followup-history.ts";

const followups = [
  { id: 1, caseId: 22, note: "Called family", completed: false },
  { id: 2, caseId: 22, note: "Helped get appointment", completed: true },
  { id: 3, caseId: 22, note: "Find another volunteer", completed: false },
  { id: 4, caseId: 22, note: "Delivered supplies", completed: true },
];

test("completed follow-ups persist in a distinct visible history, retaining their notes", () => {
  const { open, history } = partitionCaseFollowups(followups);
  assert.deepEqual(open.map(f => f.id), [1, 3]);
  assert.deepEqual(history.map(f => f.id), [2, 4]);
  assert.equal(history[0].note, "Helped get appointment");
  assert.equal(history[1].note, "Delivered supplies");
  assert.equal(followups.length, 4);
});

test("ticking a checkbox moves just that follow-up from open to history; never deletes", () => {
  const updated = updateCaseFollowupCompletion(followups, 1, true);
  const { open, history } = partitionCaseFollowups(updated);
  assert.deepEqual(open.map(f => f.id), [3]);
  assert.deepEqual(history.map(f => f.id), [1, 2, 4]);
  assert.equal(updated.length, 4);
  assert.equal(followups[0].completed, false);
});

test("restoring a completed follow-up returns it to open without losing details", () => {
  const restored = updateCaseFollowupCompletion(followups, 2, false);
  assert.deepEqual(partitionCaseFollowups(restored).open.map(f => f.id), [1, 2, 3]);
  assert.equal(restored[1].note, "Helped get appointment");
});

test("explicit deletion removes only the chosen follow-up, not anyone else's record", () => {
  const removed = removeCaseFollowup(followups, 2);
  assert.deepEqual(removed.map(f => f.id), [1, 3, 4]);
  assert.equal(removeCaseFollowup(followups, 999).length, followups.length);
  assert.equal(followups.length, 4);
});

test("owner-only server route enforces authenticated parent-case ownership inside DELETE", () => {
  const api = readFileSync("artifacts/api-server/src/routes/askanus.ts", "utf8");
  const schema = readFileSync("lib/db/src/schema/askanus.ts", "utf8");
  const spec = readFileSync("lib/api-spec/openapi.yaml", "utf8");
  assert.match(api, /router.delete\("\/askanus\/followups\/:id", requireAuth/);
  assert.match(api, /tx.delete\(caseFollowups\)\.where\(and\(/);
  assert.match(api, /ac\.id\s*=\s*\$\{caseFollowups\.caseId\}/);
  assert.match(api, /ac\.user_id\s*=\s*\$\{userId\}/);
  assert.match(api, /Number\.isSafeInteger\(id\)/);
  assert.match(api, /res\.status\(404\)/);
  assert.match(api, /followup_explicitly_deleted/);
  assert.match(api, /maxHistoryEvents/);
  assert.match(spec, /operationId: deleteCaseFollowup/);
  assert.match(schema, /completed: boolean\("completed"\)\.notNull\(\)\.default\(false\)/);
});

test("member history is discoverable, deliberate deletion has confirmation and a server result check", () => {
  const panel = readFileSync("artifacts/gavhah/src/components/askanus/case-followups.tsx", "utf8");
  const page = readFileSync("artifacts/gavhah/src/pages/my/index.tsx", "utf8");
  assert.match(panel, /Follow-up היסטאריע/);
  assert.match(panel, /history\.map\(item => entry\(item, true\)\)/);
  assert.match(panel, /useState\(true\)/);
  assert.match(panel, /window\.confirm\(/);
  assert.match(panel, /method: "DELETE"/);
  assert.match(panel, /credentials: "include"/);
  assert.match(panel, /result\.ok !== true \|\| result\.deletedId !== item\.id/);
  assert.match(panel, /removeCaseFollowup\(items, item\.id\)/);
  assert.match(panel, /updateCaseFollowupCompletion\(items, item\.id, updated\.completed\)/);
  assert.match(panel, /disabled=\{busy\}/);
  assert.match(page, /<CaseFollowups caseId=\{c\.id\} followups=\{c\.followUpNotes\}/);
  assert.doesNotMatch(page, /handleToggleFollowup|openFollowups\.slice\(0, 2\)/);
});
