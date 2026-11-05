import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");

test("News phone submenu retains 1, 3 and 4 and omits Featured 2",()=>{
 const map=read("artifacts/api-server/src/lib/gavhah-news-phone-layout.ts");
 const studio=read("artifacts/api-server/src/routes/yemot-voice-studio.ts");
 assert.ok(map.includes('"1": {title:"Important and critical news"'));
 assert.ok(map.includes('"3": {title:"Read an update by article number"'));
 assert.ok(map.includes('"4": {title:"All updates, newest first"'));
 assert.ok(!map.includes('title:"Featured updates"'));
 assert.ok(!studio.includes('Press 2 for featured updates'));
});
test("Public News page no longer duplicates Featured section; news records unaffected",()=>{
 const web=read("artifacts/gavhah/src/pages/news/index.tsx");
 assert.ok(!web.includes('featured.slice(0, 2).map'));
 assert.ok(!web.includes('const featured = filtered'));
 assert.ok(web.includes('{filtered.map(a =>'));
});
test("Askanim phone 2 advertises only options 1 and forum record 1",()=>{
 const map=read("artifacts/api-server/src/lib/gavhah-main-phone-layout.ts");
 const voice=read("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 const flow=read("artifacts/api-server/src/lib/gavhah-askanim-phone-flow.ts");
 assert.ok(map.includes('"9702":{"1":"97021"}'));
 assert.ok(map.includes('"97021":{"1":"970211"}'));
 assert.ok(voice.includes('nextAskanimPhoneState'));
 assert.ok(voice.includes('askanimPhoneSpeech'));
 assert.ok(voice.includes('sendAskanimRead'));
 assert.ok(flow.includes('Press pound when finished'));
 for(const digit of ['digit==="2"','digit==="3"','digit==="4"','digit==="5"','digit==="6"'])
   assert.ok(flow.includes(digit));
 assert.ok(flow.includes('publishPhoneForumVoice'));
});
test("Public website voice calls the same discussion entities and audio API",()=>{
 const recorder=read("artifacts/gavhah/src/components/news/forum-voice-recorder.tsx");
 const routes=read("artifacts/api-server/src/routes/forum-voice.ts");
 const listing=read("artifacts/gavhah/src/pages/forum/index.tsx");
 const detail=read("artifacts/gavhah/src/pages/forum/detail.tsx");
 for(const part of ['mediaDevices.getUserMedia','new MediaRecorder','פובליצירן יעצט','איבעררעדן','אויסמעקן','/api/discussions/voice'])
   assert.ok(recorder.includes(part),part);
 assert.ok(routes.includes('requireAuth'));
 assert.ok(routes.includes('originAllowed(req)'));
 assert.ok(routes.includes('audio_data,mime_type,fingerprint'));
 assert.ok(routes.includes('FROM public.gavhah_discussion_voice_posts'));
 assert.ok(listing.includes('ForumVoiceRecorder'));
 assert.ok(detail.includes('ForumVoicePlayer'));
});
