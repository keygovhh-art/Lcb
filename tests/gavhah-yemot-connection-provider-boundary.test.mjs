import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");

test("Gavhah member connections are served from verified Yemot keypad, not SignalWire",()=>{
 const phone=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 const connections=read("artifacts/api-server/src/lib/gavhah-yemot-my-connections.ts");
 const intake=read("artifacts/api-server/src/lib/gavhah-phone3-community-flow.ts");
 assert(phone.includes('from "./gavhah-yemot-my-connections"'));
 assert(phone.includes('path==="9703"&&digit==="9"&&!fromShared'));
 assert(phone.includes('isGavhahConnectionsPath(path)&&!fromShared'));
 assert(phone.includes('nextGavhahConnections(client'));
 assert(phone.includes('speakGavhahConnections(client'));
 assert(connections.includes('path==="97039"'));
 assert(connections.includes('hasReleaseAuthorization(item.state)'));
 assert(connections.includes('"a Gavhah member"'));
 assert(intake.includes('For your private Gavhah connections press nine.'));
});
test("Volunteer/helper registrations use existing real private Yemot wizard",()=>{
 const phone=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 assert(phone.includes('path==="97039"&&(digit==="2"||digit==="3")'));
 assert(phone.includes('await nextPhone3State(client,{path:"97031"'));
 assert(phone.includes('digit==="2"?"1":"2"'));
 const connections=read("artifacts/api-server/src/lib/gavhah-yemot-my-connections.ts");
 assert(!connections.includes("970393"));
 assert(!connections.includes("970394"));
});
test("Olam Hachesed Communication keeps its separate SignalWire webhook",()=>{
 const index=read("artifacts/api-server/src/routes/index.ts");
 const migration=read("artifacts/api-server/src/lib/signalwire-next-hotline.ts");
 assert(index.includes('router.post("/signalwire/shared-ivr"'));
 assert(index.includes('router.post("/signalwire/max/bridge/:id"'));
 assert(migration.includes("stage!==\"testing\""));
 // Existing migration candidate cannot access Olam's separately protected numbers.
 assert(migration.includes('isProtectedSignalWireNumber(called)'));
});
