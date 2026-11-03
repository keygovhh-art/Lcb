import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildOlamTwoAttemptGather} from '../artifacts/api-server/src/lib/signalwire-olam-silence-policy.ts';

test('Olam SignalWire: exact two 4-second chances, then hang up silently',()=>{
 const xml=buildOlamTwoAttemptGather('https://example.org/api/signalwire/shared-ivr',1,
  '<Say>Enter your selection.</Say>','<Say>Please enter your selection again.</Say>');
 assert.equal((xml.match(/<Gather /g)||[]).length,2);
 assert.equal((xml.match(/timeout="4"/g)||[]).length,2);
 assert.equal((xml.match(/actionOnEmptyResult="false"/g)||[]).length,2);
 assert.match(xml,/<\/Gather><Gather /);
 assert.match(xml,/<\/Gather><Hangup\/>$/);
 assert.equal((xml.match(/<Hangup\/>/g)||[]).length,1);
 assert.doesNotMatch(xml,/final|last chance|last attempt|goodbye|third/i);
 assert.equal((xml.match(/<Say>/g)||[]).length,2);
});
test('Olam gathering keeps typed input action URL and secures XML attributes',()=>{
 const xml=buildOlamTwoAttemptGather('https://example.org/webhook?first=1&next=2',5,
  '<Play>https://cdn.example.org/audio.wav</Play>','<Say>Try again</Say>');
 assert.equal((xml.match(/numDigits="5"/g)||[]).length,2);
 assert.match(xml,/action="https:\/\/example.org\/webhook\?first=1&amp;next=2"/);
 assert.equal((xml.match(/<Play>/g)||[]).length,1);
 assert.throws(()=>buildOlamTwoAttemptGather('http://example.com',1,'',''),/HTTPS/);
});
test('The signed SignalWire shared handler activates new Olam-only retry policy',async()=>{
 const handler=await readFile(new URL('../artifacts/api-server/src/lib/signalwire-shared-ivr.ts',import.meta.url),'utf8');
 const converter=await readFile(new URL('../artifacts/api-server/src/lib/signalwire-next-hotline.ts',import.meta.url),'utf8');
 assert.match(handler,/convertGavhahReplyToCxml\(reply,SHARED_SIGNALWIRE_URL/);
 assert.match(handler,/true,await olamMenuAudioUrl\("retry"\)/);
 assert.match(converter,/buildOlamTwoAttemptGather\(actionUrl,digits,first,retry\)/);
});
