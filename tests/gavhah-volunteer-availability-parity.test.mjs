import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {validateAvailabilitySchedule,shortAvailabilityDescription} from "../artifacts/api-server/src/lib/volunteer-availability.ts";

test("All four exact availability scheduling options, plus Anytime, accept valid input",()=>{
 const t="America/New_York";
 assert.deepEqual(validateAvailabilitySchedule({mode:"anytime"}),{mode:"anytime"});
 const daily=validateAvailabilitySchedule({mode:"daily",startTime:"08:30",endTime:"17:15",timeZone:t});
 assert.equal(daily.mode,"daily");
 assert.match(shortAvailabilityDescription(daily),/08:30/);
 const weekly=validateAvailabilitySchedule({mode:"weekly",startTime:"12:00",endTime:"16:30",timeZone:t,weekDays:[5,1,3]});
 assert.deepEqual(weekly.weekDays,[1,3,5]);
 assert.equal(validateAvailabilitySchedule({mode:"once",startTime:"08:00",endTime:"09:30",date:"2026-11-15",timeZone:t}).date,"2026-11-15");
 assert.equal(validateAvailabilitySchedule({mode:"range",startTime:"10:00",endTime:"15:00",fromDate:"2026-11-06",untilDate:"2026-12-06",timeZone:t}).mode,"range");
});
test("Reject malformed times, invalid days, backward date intervals, and invalid time zone",()=>{
 const t="America/New_York";
 for(const form of [
  {mode:"daily",startTime:"25:00",endTime:"12:00",timeZone:t},
  {mode:"weekly",startTime:"11:00",endTime:"11:00",timeZone:t,weekDays:[1]},
  {mode:"weekly",startTime:"11:00",endTime:"13:00",timeZone:t,weekDays:[8]},
  {mode:"range",startTime:"09:00",endTime:"10:00",timeZone:t,fromDate:"2026-12-10",untilDate:"2026-11-06"},
  {mode:"once",startTime:"09:00",endTime:"10:00",timeZone:t,date:"2026-13-40"},
  {mode:"daily",startTime:"09:00",endTime:"10:00",timeZone:"Not/AZone"},
 ]){
  assert.throws(()=>validateAvailabilitySchedule(form));
 }
});
test("Volunteer profile form sends schedule, does not request City/Community, and help requests use Case/צוועק",()=>{
 const ui=fs.readFileSync("artifacts/gavhah/src/pages/directory/index.tsx","utf8");
 const api=fs.readFileSync("artifacts/api-server/src/routes/volunteers.ts","utf8");
 const schema=fs.readFileSync("lib/db/src/schema/volunteers.ts","utf8");
 const range=ui.slice(ui.indexOf("function RegisterVolunteerDialog"),ui.indexOf("// ---- Submit Request Dialog"));
 assert(!range.includes("City / Community"));
 assert(!range.includes('form.location.trim()'));
 assert(range.includes("<AvailabilityFields"));
 assert(range.includes("availabilitySchedule, bio"));
 assert(ui.includes("EditMyVolunteerAvailability"));
 assert(ui.includes('yi?"צוועק *":"Case *"'));
 assert(api.includes('"/volunteers/mine/availability"'));
 assert(api.includes('validateAvailabilitySchedule'));
 assert(schema.includes('availabilitySchedule: jsonb("availability_schedule")'));
});
