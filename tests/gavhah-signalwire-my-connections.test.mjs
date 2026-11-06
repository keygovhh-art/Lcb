import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(p,"utf8");
test("My Connections keypad exists only on signed SignalWire Gavhah next hotline",()=>{
 const engine=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 const handler=read("artifacts/api-server/src/lib/signalwire-next-hotline.ts");
 const menu=read("artifacts/api-server/src/lib/gavhah-signalwire-my-connections.ts");
 assert(engine.includes('req.body?.signalwireProvider==="gavhah"'));
 assert(handler.includes('signalwireProvider:"gavhah"'));
 assert(engine.includes("fromGavhahSignalWire&&isSignalWireConnectionsPath(path)"));
 assert(menu.includes('digit==="1"'));
 assert(menu.includes('digit==="2"'));
 assert(menu.includes('digit==="3"'));
 assert(menu.includes('digit==="4"'));
 assert(menu.includes('path==="970392"'));
 assert(menu.includes('path==="970395"'));
 assert(menu.includes("next.page*8+n-1"));
 assert(menu.includes("Be'ezras Hashem. My Connections."));
});
test("Never disclose contact numbers without mutual member consent AND final staff authorization",()=>{
 const menu=read("artifacts/api-server/src/lib/gavhah-signalwire-my-connections.ts");
 assert(menu.includes("hasReleaseAuthorization(item.state)"));
 assert(menu.includes('["accepted","connected"].includes(item.state.stage)'));
 assert(menu.includes('partner.rows[0]?.status==="active"'));
 assert(menu.includes("verifiedUserId"));
 assert(menu.includes("Contact details remain confidential"));
});
test("SignalWire private phone form uses signed callbacks, active pairing and staff-only transcription",()=>{
 const next=read("artifacts/api-server/src/lib/signalwire-next-hotline.ts");
 const migration=read("lib/db/migrations/20261106_signalwire_my_connections_voice_intake.sql");
 assert(next.includes("checkSignalWireSignature(signingKey,signature,SIGNALWIRE_URL,form)"));
 assert(next.includes("allowPrivateFormRecording=false"));
 assert(next.includes('if(!allowPrivateFormRecording)'));
 assert(next.includes('linked_until>now()'));
 assert(next.includes('row.status!=="active"'));
 assert(next.includes('"970393","970394"'));
 assert(next.includes("savePrivateSignalWireFormRecording"));
 assert(next.includes('RecordingSid'));
 assert(next.includes("Needs staff review")||next.includes("staff review"));
 assert(migration.includes("recording_sid text NOT NULL UNIQUE"));
 assert(migration.includes("'needs_transcription'"));
 assert(!next.includes('StartCall('));
});
test("Olam Chesed number and Yemot ordinary calling unchanged by My Connections implementation",()=>{
 const shared=read("artifacts/api-server/src/lib/signalwire-shared-ivr.ts");
 const next=read("artifacts/api-server/src/lib/signalwire-next-hotline.ts");
 const core=read("artifacts/api-server/src/lib/gavhah-signalwire-my-connections.ts");
 assert(shared.includes('SHARED_E164="+16056558080"'));
 assert(next.includes('isProtectedSignalWireNumber(called)'));
 assert(core.includes("Connected only to the owner-verified SignalWire"));
 assert(!/UpdateExtension|CallExtensionBridging|RunCampaign/.test(core));
});
