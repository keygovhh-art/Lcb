import test from "node:test";
import assert from "node:assert/strict";
import {localClock,localHorizon,reminderStatus,validIanaTimeZone}
  from "../artifacts/api-server/src/lib/max-reminder-clock.ts";

test("New York DST shift never invents 2 AM wall-clock time",()=>{
  assert.deepEqual(localClock(new Date("2026-03-08T06:59:00Z"),"America/New_York"),
    {date:"2026-03-08",time:"01:59"});
  assert.deepEqual(localClock(new Date("2026-03-08T07:00:00Z"),"America/New_York"),
    {date:"2026-03-08",time:"03:00"});
});
test("Due time is based on each follow-up's specific timezone",()=>{
  const f={dueDate:"2026-10-14",dueTime:"19:30",timeZone:"America/New_York"};
  assert.equal(reminderStatus(f,"UTC",new Date("2026-10-14T20:00:00Z")),"today");
  assert.equal(reminderStatus(f,"UTC",new Date("2026-10-14T23:30:00Z")),"due");
  assert.equal(reminderStatus({...f,dueTime:null},"UTC",new Date("2026-10-14T01:00:00Z")),"upcoming");
});
test("Date-only reminder uses viewer locale, not arbitrary server UTC",()=>{
  const f={dueDate:"2026-10-14",dueTime:null,timeZone:null};
  assert.equal(reminderStatus(f,"America/New_York",new Date("2026-10-14T01:00:00Z")),"upcoming");
  assert.equal(reminderStatus(f,"America/New_York",new Date("2026-10-14T05:00:00Z")),"due");
});
test("Invalid IANA zone rejected and horizon is calendar-aware",()=>{
  assert.equal(validIanaTimeZone("America/New_York"),true);
  assert.equal(validIanaTimeZone("Not/AZone"),false);
  assert.equal(localHorizon(new Date("2026-10-13T20:00:00Z"),"America/New_York",2),"2026-10-15");
});
