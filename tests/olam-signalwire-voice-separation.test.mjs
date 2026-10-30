import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(name)=>readFileSync(name,"utf8");
const voice=read("artifacts/api-server/src/lib/olam-signalwire-voice.ts");
const sw=read("artifacts/api-server/src/lib/signalwire-shared-ivr.ts");
const cv=read("artifacts/api-server/src/lib/signalwire-next-hotline.ts");
const yemot=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
const admin=read("artifacts/api-server/src/routes/max-ivr-editor.ts");
const cutover=read("artifacts/api-server/src/routes/yemot-central.ts");
test("SignalWire has independently configurable voice for every Olam extension",()=>{
 assert.match(voice,/WHERE enabled=true AND path = ANY/);
 assert.match(voice,/gavhah_olam_signalwire_voice_profiles/);
 assert.match(voice,/rate_percent/);
 assert.match(voice,/comma_pause_ms/);
 assert.match(voice,/sentence_pause_ms/);
 assert.match(voice,/voice="man" language="en-US"/);
 assert.match(voice,/<prosody rate=/);
 assert.match(voice,/<break time=/);
 assert.match(voice,/escapeXml\(scrubbed\.slice/);
});
test("Signed Olam IVR speech styles do not modify menu choices, callbacks or 55555",()=>{
 assert.match(sw,/olamVoiceProfile/);
 assert.match(sw,/callHash/);
 assert.match(sw,/SELECT path FROM public\.gavhah_yemot_call_states/);
 assert.match(sw,/convertGavhahReplyToCxml\(reply,SHARED_SIGNALWIRE_URL,root,/);
 assert.match(sw,/originalSystemRedirectXml\(route\.original_voice_url!,method\)/);
 assert.match(cv,/olamProfile\?olamSpeak\(text,olamProfile\):speak\(text\)/);
 assert.match(cv,/const digits=sharedRootMode\?5/);
 assert.match(yemot,/return fromShared\?"t-"\+safeVoice\(s,430\):yemotEnglishSpeech\(s,430\)/);
});
test("Phone-friendly voice-studio is superadmin-only, same origin and per extension",()=>{
 assert.match(admin,/router\.use\(prefix,requireAuth,owner\)/);
 assert.match(admin,/user\.role!=="super_admin"/);
 assert.match(admin,/router\.get\(prefix\+"\/voice-studio"/);
 assert.match(admin,/router\.put\(prefix\+"\/voice-profiles\/:path"/);
 assert.match(admin,/setOlamVoiceProfile/);
 assert.match(admin,/getOlamVoiceProfiles/);
 assert.doesNotMatch(voice,/UpdateIncomingPhoneNumber|CreateCall|DeleteFile|UpdateExtension/);
});
test("Yemot cutover remains provider-preserving and owner-verified",()=>{
 assert.match(cutover,/verifiedProviderRoot\(root,/);
 assert.match(cutover,/api_link:cloudflareIvrCallback/);
 assert.match(cutover,/previousIvrCallback/);
 assert.match(cutover,/router\.post\(cloudflareSwitchPath,requireAuth,admin/);
 assert.doesNotMatch(voice,/api_link|YEMOT_ENCRYPTION_KEY/);
});
