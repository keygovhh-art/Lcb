import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeMinyanTimes, hasAtLeastOneMinyanTime,
  minyanTimesList, MAX_MINYAN_TIMES_PER_SERVICE,
} from "../artifacts/api-server/src/lib/minyan-times.ts";

test("A single prayer is sufficient; all three empty is rejected", () => {
  assert.equal(hasAtLeastOneMinyanTime("7:00", "", ""), true);
  assert.equal(hasAtLeastOneMinyanTime("", "2:00 PM", ""), true);
  assert.equal(hasAtLeastOneMinyanTime("", "", "9:00 PM"), true);
  assert.equal(hasAtLeastOneMinyanTime("", "", ""), false);
  assert.equal(hasAtLeastOneMinyanTime(" ", "\n", "\t"), false);
});

test("Multiple separately entered times are preserved in order, without legacy DB migrations", () => {
  assert.equal(normalizeMinyanTimes(["6:15", "", "7:00", "8:00"]), "6:15\n7:00\n8:00");
  assert.equal(normalizeMinyanTimes("6:15\r\n7:00\n8:00"), "6:15\n7:00\n8:00");
  assert.deepEqual(minyanTimesList("6:15\n7:00\n8:00"), ["6:15", "7:00", "8:00"]);
  assert.equal(normalizeMinyanTimes(undefined), "");
  assert.equal(normalizeMinyanTimes(""), "");
  assert.equal(normalizeMinyanTimes("6:15 AM, 7 AM"), "6:15 AM, 7 AM"); // Existing records preserved
  assert.equal(MAX_MINYAN_TIMES_PER_SERVICE, 24);
  assert.throws(() => normalizeMinyanTimes(Array(25).fill("7:00")), /maximum 24/);
  assert.throws(() => normalizeMinyanTimes(["7:00", 900]), /must be text/);
  assert.throws(() => normalizeMinyanTimes("x".repeat(101)), /at most 100/);
});

test("No individual prayer is marked required, and + Add More creates separate input controls", () => {
  const front = readFileSync("artifacts/gavhah/src/pages/minyans/index.tsx","utf8");
  const api = readFileSync("artifacts/api-server/src/routes/minyans.ts","utf8");
  const schema = readFileSync("lib/db/src/schema/minyans.ts","utf8");
  const spec = readFileSync("lib/api-spec/openapi.yaml","utf8");
  const admin = readFileSync("artifacts/gavhah/src/pages/admin/index.tsx","utf8");
  assert.match(front, /לכל הפחות איינס/);
  assert.match(front, /לייג צו נאך א מנין/);
  assert.match(front, /addTime\(key\)/);
  assert.match(front, /removeTime\(key, index\)/);
  assert.match(front, /timeEntries\(times\.shacharis\)/);
  assert.match(front, /timeEntries\(times\.mincha\)/);
  assert.match(front, /timeEntries\(times\.maariv\)/);
  assert.doesNotMatch(front, /Shacharis Times \*/);
  assert.doesNotMatch(front, /Mincha Times \*/);
  assert.doesNotMatch(front, /Maariv Times \*/);
  assert.doesNotMatch(front, /COMMUNITIES|setCommunity|form\.community|All communities|Select community/);
  assert.doesNotMatch(api, /all three minyan times are required|if \(community\)/);
  assert.match(api, /hasAtLeastOneMinyanTime/);
  assert.match(api, /normalizeMinyanTimes/);
  assert.match(api, /community: ""/); // Old NOT NULL column, not a classification
  assert.match(schema, /shacharis: text\("shacharis"\)\.notNull\(\)/);
  assert.match(spec, /required: \[synagogueName, city, country\]/);
  assert.doesNotMatch(admin, /m\.community/);
});

test("Admin updates can clear individual services but not the final remaining service", () => {
  const api = readFileSync("artifacts/api-server/src/routes/minyans.ts","utf8");
  assert.match(api, /shacharis === undefined \? existing\.shacharis : shacharis/);
  assert.match(api, /mincha === undefined \? existing\.mincha : mincha/);
  assert.match(api, /maariv === undefined \? existing\.maariv : maariv/);
  assert.match(api, /if \(!hasAtLeastOneMinyanTime\(nextShacharis, nextMincha, nextMaariv\)\)/);
  assert.doesNotMatch(api, /cleanShacharis\.slice\(0, 160\)/);
});
