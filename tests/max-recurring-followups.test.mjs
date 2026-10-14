import test from "node:test";
import assert from "node:assert/strict";
import { nextRepeatDate, isRepeatRule } from "../artifacts/api-server/src/lib/followup-recurrence.ts";
test("monthly recurring follow-up restores January 31 anchor after February",()=>{
  assert.equal(nextRepeatDate("2027-01-31","monthly",31),"2027-02-28");
  assert.equal(nextRepeatDate("2027-02-28","monthly",31),"2027-03-31");
  assert.equal(nextRepeatDate("2028-01-31","monthly",31),"2028-02-29");
  assert.equal(nextRepeatDate("2028-02-29","monthly",31),"2028-03-31");
});
test("weekly and daily recurrence cross month/year in real calendar days",()=>{
  assert.equal(nextRepeatDate("2026-12-31","daily"),"2027-01-01");
  assert.equal(nextRepeatDate("2026-12-29","weekly"),"2027-01-05");
  assert.equal(nextRepeatDate("2026-11-25","none"),null);
});
test("unknown recurrence is rejected; invalid calendar date cannot progress",()=>{
  assert.equal(isRepeatRule("monthly"),true);
  assert.equal(isRepeatRule("hourly"),false);
  assert.equal(nextRepeatDate("2027-02-31","daily"),null);
});
