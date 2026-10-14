import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEEKDAYS, legacySchedule, validateSchedule, scheduleStrings, resolvedSchedule } from "../artifacts/api-server/src/lib/minyan-weekdays.ts";

test("all regular weekday options are Sunday through Friday and no seventh-day option", () => {
 assert.deepEqual([...WEEKDAYS],[0,1,2,3,4,5]);
 assert.equal(WEEKDAYS.length,6);
});
test("one selected weekday, selected multiple weekdays, and all weekdays are valid per prayer", () => {
 const result=validateSchedule({
  shacharis:[{time:"6:30",days:[0,2,4]},{time:"8:00",days:[1]}],
  mincha:[{time:"2:00",days:[0,1,2,3,4,5]}],
  maariv:[{time:"9:00",days:[3,5]}],
 });
 assert.deepEqual(result.shacharis[0].days,[0,2,4]);
 assert.deepEqual(result.shacharis[1].days,[1]);
 assert.deepEqual(result.mincha[0].days,[0,1,2,3,4,5]);
 assert.deepEqual(result.maariv[0].days,[3,5]);
 assert.deepEqual(scheduleStrings(result),{shacharis:"6:30\n8:00",mincha:"2:00",maariv:"9:00"});
});
test("each prayer independently optional, but at least one actual minyan must exist", () => {
 const onlyMincha=validateSchedule({shacharis:[],mincha:[{time:"5:00",days:[0]}],maariv:[]});
 assert.equal(onlyMincha.shacharis.length,0);
 assert.equal(onlyMincha.mincha[0].time,"5:00");
 assert.throws(()=>validateSchedule({shacharis:[],mincha:[],maariv:[]}),/At least one/i);
 assert.throws(()=>validateSchedule({shacharis:[{time:"6:30",days:[]}],mincha:[],maariv:[]}),/weekdays/);
 assert.throws(()=>validateSchedule({shacharis:[],mincha:[],maariv:[{time:"9:00",days:[6]}]}),/weekdays/);
 assert.throws(()=>validateSchedule({shacharis:[],mincha:[],maariv:[{time:"9:00",days:[1,1]}]}),/weekdays/);
 assert.throws(()=>validateSchedule({shacharis:[{time:"x".repeat(101),days:[0]}],mincha:[],maariv:[]}),/time/);
});
test("legacy minyan records are preserved and receive default six weekday recurrence", () => {
 const legacy=legacySchedule({shacharis:"6:30\n8:00",mincha:"",maariv:"9:00"});
 assert.deepEqual(legacy.shacharis[0].days,[0,1,2,3,4,5]);
 assert.equal(legacy.shacharis.length,2);
 assert.equal(resolvedSchedule({shacharis:"6:30",mincha:"",maariv:""}).shacharis[0].time,"6:30");
});
test("frontend exposes separate day controls for every service and each added minyan", () => {
 const frontend=readFileSync("artifacts/gavhah/src/pages/minyans/index.tsx","utf8");
 const backend=readFileSync("artifacts/api-server/src/routes/minyans.ts","utf8");
 const migration=readFileSync("lib/db/migrations/20261013_minyan_weekday_schedules.sql","utf8");
 assert.match(frontend,/DAY_NAMES\.map\(\(dayName,dayIndex\)/);
 assert.match(frontend,/toggleDay\(key,index,dayIndex\)/);
 assert.match(frontend,/יעדן וואכנטאג/);
 assert.match(frontend,/weekdaySchedules=preparedSchedule\(times\)/);
 assert.match(backend,/validateSchedule/);
 assert.match(backend,/weekdaySchedules:chosenSchedule/);
 assert.match(migration,/STAGING ONLY/);
 assert.doesNotMatch(migration,/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/);
});
