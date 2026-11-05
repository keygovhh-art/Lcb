import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {conferenceOpen,validConferenceExtension} from
 "../artifacts/api-server/src/lib/gavhah-unified-conference.ts";
const file=p=>readFileSync(p,"utf8");
const now=Date.parse("2026-11-05T17:00:00.000Z");
const normal={
 enabled:true,provider_confirmed:true,listener_extension:"/123/4",
 moderator_extension:"/123/5",mode:"lecture",waiting_room:true,
 entry_mode:"members",scheduled_start_at:"2026-11-05T16:00:00.000Z",
 scheduled_end_at:"2026-11-05T18:00:00.000Z",override_state:"schedule",override_until:null
};
test("unified conference requires real verified provider and cannot open a fictional bridge",()=>{
 assert.equal(conferenceOpen(normal,now),true);
 assert.equal(conferenceOpen({...normal,provider_confirmed:false},now),false);
 assert.equal(conferenceOpen({...normal,enabled:false},now),false);
 assert.equal(conferenceOpen({...normal,listener_extension:null},now),false);
 assert.equal(validConferenceExtension("/12/4"),"/12/4");
 assert.equal(validConferenceExtension("https://invalid"),null);
 assert.equal(validConferenceExtension("/../4"),null);
});
test("management override beats schedule, expires back to schedule, but cannot override provider safety",()=>{
 assert.equal(conferenceOpen({...normal,override_state:"force_closed"},now),false);
 assert.equal(conferenceOpen({...normal,override_state:"force_open",scheduled_start_at:null},now),true);
 assert.equal(conferenceOpen({...normal,override_state:"force_closed",override_until:"2026-11-05T16:00:00Z"},now),true);
 assert.equal(conferenceOpen({...normal,override_state:"force_open",provider_confirmed:false},now),false);
});
test("main keypad 8 keeps groups 1-4 and gives options 5/6 one shared room",()=>{
 const phone=file("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 const map=file("artifacts/api-server/src/lib/gavhah-main-phone-layout.ts");
 assert.match(map,/"9708":\{"1":"161","2":"167","3":"164","4":"162","5":"97085","6":"97086"/);
 assert.match(phone,/nextMinyan7/);
 assert.match(phone,/path==="97085"\|\|path==="97086"/);
 assert.match(phone,/conferenceGate/);
 assert.match(phone,/go_to_folder=/);
 assert.match(phone,/role!=="moderator"/);
});
test("blacklist takes precedence over whitelist and moderator; anonymous users cannot join",()=>{
 const source=file("artifacts/api-server/src/lib/gavhah-unified-conference.ts");
 assert.match(source,/if\(!userId\)/);
 assert.match(source,/memberships\.has\("blacklist"\)/);
 assert.ok(source.indexOf('memberships.has("blacklist")')<source.indexOf('if(!conferenceOpen(s))'));
 assert.match(source,/entry_mode|entryMode/);
});
test("admin panel cannot self-certify physical provider room; audit protects schedule/permissions",()=>{
 const route=file("artifacts/api-server/src/routes/gavhah-unified-conference.ts");
 assert.match(route,/requireAdmin/);
 assert.match(route,/sameOrigin/);
 assert.match(route,/providerConfirmed===true/);
 assert.match(route,/Provider verification cannot be self-certified/);
 assert.match(route,/gavhah_unified_conference_events/);
 assert.match(route,/providerMicrophoneChanged:false/);
});
