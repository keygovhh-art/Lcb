import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const gateway=read('artifacts/api-server/src/lib/yemot-api-driven-phone.ts');
const signup=read('artifacts/api-server/src/lib/yemot-phone-signup.ts');
const config=read('artifacts/api-server/src/lib/yemot-root-voice-repair.ts');
const auth=read('artifacts/api-server/src/routes/auth.ts');
const menu=read('artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts');
const schema=read('lib/db/migrations/20261017_gavhah_phone_member_signup.sql');

test('root explicitly requests male TTS and never replaces recordings or root directories',()=>{
 assert.match(config,/voice:"ymMale",tts_voice:"ymMale"/);
 assert.doesNotMatch(config,/voice:"ymFemale"/);
 assert.match(config,/UpdateExtension/);
 assert.match(config,/api_log:"no"/);
 assert.match(config,/r\.line_number!=="6055621286"/);
 assert.doesNotMatch(config,/UploadFile|DeleteFile|UploadTextFile/);
});
test('the published Gavhah phone menu has real registration, and a password input',()=>{
 assert.match(menu,/"5":leaf\("Create a Gavhah website member by phone"/);
 assert.match(gateway,/path==="185"\?"rg"/);
 assert.match(gateway,/path==="" && digit==="8"/);
 assert.match(gateway,/To create a website member account, press 8/);
 assert.match(gateway,/mode==="registration"/);
 assert.match(gateway,/\[name,"no","16","1","18","No","no"\]/);
 assert.match(gateway,/enrollFromKeypad\(client,callHash,digit\)/);
 assert.match(gateway,/pendingPhoneSignup\(client,callHash\)/);
 assert.match(gateway,/cancelPhoneSignup\(client,callHash\)/);
});
test('account is canonical Gavhah website member, not caller-ID identity or Campaign Center Neon account',()=>{
 assert.match(signup,/INSERT INTO public\.users/);
 assert.match(signup,/INSERT INTO public\.gavhah_phone_member_logins/);
 assert.match(signup,/hashPassword\(entered\)/);
 assert.match(signup,/verifyPassword\(entered,pending\.password_hash\)/);
 assert.match(signup,/pg_advisory_xact_lock/);
 assert.match(signup,/pending\.attempts\+1/);
 assert.match(gateway,/Date\.now\(\)\+30\*60\*1000/);
 assert.match(auth,/memberNumber=\/\^M\(/);
 assert.match(auth,/SELECT user_id FROM public\.gavhah_phone_member_logins/);
 assert.match(auth,/verifyPassword\(password,user\.passwordHash\)/);
 assert.doesNotMatch(signup,/ApiPhone|ApiCallerId|CallerID|callerId/);
 assert.doesNotMatch(signup,/INSERT INTO public\.cc_/);
});
test('migration has immutable member mapping and rate/confirmation tables',()=>{
 assert.match(schema,/member_no varchar\(10\) PRIMARY KEY/);
 assert.match(schema,/user_id integer NOT NULL UNIQUE/);
 assert.match(schema,/gavhah_phone_signup_pending/);
 assert.match(schema,/gavhah_phone_signup_events/);
});
