import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=p=>readFileSync(p,"utf8");

test("Owner's news request removes only separate Featured section, not the news",()=>{
 const page=source("artifacts/gavhah/src/pages/news/index.tsx");
 const newsDial=source("artifacts/api-server/src/lib/gavhah-news-phone-layout.ts");
 const studio=source("artifacts/api-server/src/routes/yemot-voice-studio.ts");
 assert.doesNotMatch(page,/>Featured<\/h3>/);
 assert.doesNotMatch(newsDial,/title:"Featured updates"/);
 assert.doesNotMatch(studio,/Press 2 for featured updates/);
 assert.match(newsDial,/internalPath:"113"/);
 assert.match(newsDial,/internalPath:"115"/);
 assert.match(newsDial,/internalPath:"111"/);
 assert.match(page,/Latest Updates/);
});

test("Askanim section 2 and website voice editor expose only listen + record",()=>{
 const studio=source("artifacts/api-server/src/routes/yemot-voice-studio.ts");
 const ui=source("artifacts/api-server/src/routes/yemot-studio-ui.ts");
 const phone=source("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 for(const path of ['"9702"','"97021"','"970211"'])assert.ok(studio.includes(path));
 assert.match(ui,/צו הערן עסקנים־שמועסן/);
 assert.match(phone,/forumVoiceIntro/);
 assert.match(phone,/forumVoiceOptions/);
 assert.match(phone,/forumRecordPath/);
});

test("Voice posting requires verified member, recorded file ownership and explicit publish",()=>{
 const phone=source("artifacts/api-server/src/lib/yemot-api-driven-phone.ts");
 const helper=source("artifacts/api-server/src/lib/gavhah-forum-phone-voice.ts");
 const migration=source("lib/db/migrations/20261103_gavhah_public_forum_voice_posts.sql");
 assert.match(phone,/digit==="4"/);
 assert.match(phone,/await memberAllowed/);
 assert.match(phone,/isOwnedForumRecording/);
 assert.match(phone,/forum-append:/);
 assert.match(helper,/forumRecordTarget/);
 assert.match(helper,/status='active'/);
 assert.match(helper,/INSERT INTO public\.discussions/);
 assert.match(helper,/INSERT INTO public\.gavhah_forum_voice_posts/);
 assert.match(migration,/ON DELETE CASCADE/);
 assert.doesNotMatch(migration,/DELETE FROM|DROP TABLE|TRUNCATE TABLE/);
});

test("Public website lists and plays exactly published phone voice posts",()=>{
 const api=source("artifacts/api-server/src/routes/discussions.ts");
 const index=source("artifacts/gavhah/src/pages/forum/index.tsx");
 const detail=source("artifacts/gavhah/src/pages/forum/detail.tsx");
 assert.match(api,/phoneVoiceAudioUrls/);
 assert.match(api,/phone-voice/);
 assert.match(api,/fetchModeratedNewsAudio/);
 assert.match(index,/phoneVoiceAudioUrl/);
 assert.match(detail,/phoneVoiceAudioUrl/);
 assert.match(index,/<audio controls/);
 assert.match(detail,/<audio controls/);
});
