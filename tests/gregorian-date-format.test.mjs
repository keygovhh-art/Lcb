import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatGregorianDate, formatGregorianDateTime, formatGregorianYear } from "../artifacts/gavhah/src/lib/gregorian-date.ts";

test("all civil date labels use the last two year digits, apostrophe and למספרם",()=>{
  assert.equal(formatGregorianYear(2026),"'26 למספרם");
  assert.equal(formatGregorianYear(2027),"'27 למספרם");
  assert.equal(formatGregorianDate("2026-10-08"),"Oct 8, '26 למספרם");
  assert.equal(formatGregorianDate("2027-01-03"),"Jan 3, '27 למספרם");
  assert.equal(formatGregorianDate("2026-10-08","MMMM yyyy"),"October '26 למספרם");
  assert.equal(formatGregorianDate("2026-10-08","MMM d"),"Oct 8, '26 למספרם");
  assert.equal(formatGregorianDate(new Date(2026,9,8,9,15),"MMM d, yyyy 'at' h:mm a"),
    "Oct 8, '26 at 9:15 AM למספרם");
  assert.equal(formatGregorianDateTime(new Date(2026,9,8,9,15)),"Oct 8, '26 9:15 AM למספרם");
  assert.equal(formatGregorianDate(null),"");
  assert.equal(formatGregorianDate("not a date"),"");
});

test("underlying ISO dates, scheduling and browser date inputs are not rewritten",()=>{
  const calendar=readFileSync("artifacts/gavhah/src/pages/reservations/index.tsx","utf8");
  const minyan=readFileSync("artifacts/gavhah/src/pages/minyans/index.tsx","utf8");
  const charity=readFileSync("artifacts/gavhah/src/components/admin/charity-management.tsx","utf8");
  assert.match(calendar,/const dateStr = \(day: number\) => `\$\{viewYear\}-/);
  assert.match(calendar,/formatGregorianYear\(viewYear\)/);
  assert.match(minyan,/const EVERY_WEEKDAY = \[0,1,2,3,4,5\]/);
  assert.match(charity,/\.toISOString\(\)/);
  assert.match(charity,/formatGregorianDate/);
});
