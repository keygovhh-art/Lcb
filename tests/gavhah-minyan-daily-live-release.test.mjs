import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  upcomingEvents,exactLocalTripTime,validGeo
} from "../artifacts/api-server/src/lib/gavhah-minyan-route-engine.ts";
const read=(f)=>readFileSync(f,"utf8");
test("Approved minyans get stable dial IDs; pending do not; no DROP TRIGGER",()=>{
 const m=read("lib/db/migrations/20261104_gavhah_minyan_stable_ids_schedule_and_navigation.sql");
 assert.match(m,/dial_code INTEGER NOT NULL UNIQUE/);
 assert.match(m,/WHERE m.status='approved'/);
 assert.match(m,/ON CONFLICT\(minyan_id\) DO NOTHING/);
 assert.doesNotMatch(m,/DROP TRIGGER/);
 assert.match(m,/pg_trigger/);
});
test("Future minyan start time uses actual DST and rejects skipped wall clock",()=>{
 assert.equal(exactLocalTripTime("2026-03-08",2,30,"America/New_York"),null);
 assert.equal(new Date(exactLocalTripTime("2026-11-05",8,34,"America/New_York")).toISOString(),
  "2026-11-05T13:34:00.000Z");
});
test("Repeating minyan schedule every 20 minutes, in New York timezone",()=>{
 const from=Date.parse("2026-11-05T11:00:00Z"),to=Date.parse("2026-11-05T16:00:00Z");
 const place={
  id:55,dialCode:1000,name:"Verified Minyan",address:"1 Main St, Monroe, NY",city:"Monroe",
  timezone:"America/New_York",point:{latitude:41.32,longitude:-74.18},rules:[{
   prayer:"shacharis",weekDay:4,time:"08:00",intervalMinutes:20,untilTime:"09:00",
   rtOffsetMinutes:null
  }]
 };
 const events=upcomingEvents(place,from,to);
 assert.deepEqual(events.map(x=>x.localTime),["8:00 AM","8:20 AM","8:40 AM","9:00 AM"]);
});
test("Rabbeinu Tam offsets are only used with verified daily zman data",()=>{
 const from=Date.parse("2026-11-05T11:00:00Z"),to=Date.parse("2026-11-06T04:00:00Z");
 const base={id:56,dialCode:1001,name:"Verified RT",address:"1 Main St, Monsey, NY",city:"Monsey",
  timezone:"America/New_York",point:{latitude:41.1,longitude:-74.0},rules:[{
   prayer:"maariv",weekDay:4,time:null,intervalMinutes:null,untilTime:null,rtOffsetMinutes:25
  }]};
 assert.deepEqual(upcomingEvents(base,from,to),[]);
 const time="2026-11-06T00:00:00.000Z";
 const result=upcomingEvents({...base,zmanim:{"2026-11-05":time}},from,to);
 assert.equal(result.length,1);
 assert.equal(result[0].startsAt,"2026-11-05T23:35:00.000Z");
});
test("No GPS guessing and routing requires a configured provider",()=>{
 assert.equal(validGeo({latitude:200,longitude:0}),false);
 const engine=read("artifacts/api-server/src/lib/gavhah-minyan-route-engine.ts");
 assert.match(engine,/ROUTING_NOT_CONFIGURED/);
 assert.match(engine,/GOOGLE_MAPS_API_KEY/);
 assert.match(engine,/TRAFFIC_AWARE/);
 assert.match(engine,/GEO.*NOT_CONFIGURED|GEOCODING_NOT_CONFIGURED/);
 assert.match(engine,/avoided|input\.avoid/);
});
test("Phone keypad 7 and Today's Cause 6 use distinct channels, secure submission review",()=>{
 const phone=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 const minyan=read("artifacts/api-server/src/lib/gavhah-phone7-minyan-flow.ts");
 const daily=read("artifacts/api-server/src/lib/gavhah-phone6-daily-flow.ts");
 const united=read("artifacts/api-server/src/lib/gavhah-phone4-united-flow.ts");
 assert.match(phone,/nextMinyan7/);assert.match(phone,/nextDailyPhone6/);
 assert.match(phone,/digit==="7"/);assert.match(phone,/digit==="6"/);
 assert.match(minyan,/status='approved'/);
 assert.match(minyan,/gavhah_minyan_phone_submissions/);
 assert.match(minyan,/safeRecord/);
 assert.match(daily,/newDailyPledge/);
 assert.match(daily,/newDailyDonationIntent/);
 assert.match(daily,/readCauseChannel\(c,"daily"\)/);
 assert.match(united,/readCauseChannel\(client,"united"\)/);
});
test("The two causes never share their pledge tables or count money before staff verification",()=>{
 const daily=read("artifacts/api-server/src/routes/gavhah-daily-workspace.ts");
 const united=read("artifacts/api-server/src/routes/gavhah-united-workspace.ts");
 assert.match(daily,/gavhah_daily_pledges/);assert.match(daily,/gavhah_daily_verified_totals/);
 assert.doesNotMatch(daily,/gavhah_united_pledges/);
 assert.match(united,/gavhah_united_pledges/);
 assert.match(united,/gavhah_united_verified_totals/);
 assert.match(daily,/submit.*for_verification|submitted_for_verification/);
});
