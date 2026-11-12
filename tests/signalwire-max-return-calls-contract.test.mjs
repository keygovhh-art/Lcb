import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [callback,api,shared,yemot,ui,migration]=await Promise.all([
 read('artifacts/api-server/src/lib/signalwire-max-return-calls.ts'),
 read('artifacts/api-server/src/routes/max-return-calls.ts'),
 read('artifacts/api-server/src/lib/signalwire-shared-ivr.ts'),
 read('artifacts/api-server/src/lib/yemot-api-driven-phone.ts'),
 read('artifacts/gavhah/src/components/communications/max-return-calls-panel.tsx'),
 read('lib/db/migrations/20261103_max_signalwire_return_calls.sql')
]);
test('Personal callback is off by default and never hijacks unrelated shared line calls',()=>{
 assert.match(migration,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(callback,/OLAM_RETURN_CALL_ROUTING_ENABLED/);
 assert.match(callback,/maybeHandleOlamReturnCall/);
 assert.match(shared,/if\(await maybeHandleOlamReturnCall\(req,res\)\)\{\s*diagnostic\("completed","outbound_return_call_handled",res\.statusCode\);\s*return;\s*\}/);
 assert.match(callback,/provider_call_id IS NOT NULL/);
 assert.match(callback,/s\.direction='outbound'/);
 assert.match(callback,/p\.enabled=true/);
 assert.match(callback,/if\(recent\.length\)return false/);
 assert.match(callback,/Caller ID is only a hint/);
});
test('Donor gets 1 for the right volunteer or 2 for voluntary voicemail',()=>{
 assert.match(callback,/press 1\. To leave a message, press 2/);
 assert.match(callback,/buildOlamTwoAttemptGather/);
 assert.match(callback,/key!=="1"&&key!=="2"/);
 assert.match(callback,/maxLength="120"/);
 assert.match(callback,/RecordingSid/);
 assert.doesNotMatch(callback,/record-from-start|record-from-answer/);
 assert.match(migration,/Only caller-initiated voicemail/);
});
test('Status checks use authenticated member heartbeat and never interrupt a live call',()=>{
 assert.match(callback,/max_agent_activity/);
 assert.match(callback,/channel==="yemot"/);
 assert.match(callback,/channel==="olam"/);
 assert.match(callback,/status IN \('initiating','ringing','in_progress'\)/);
 assert.match(callback,/if\(busy\)/);
 assert.match(callback,/kind='yemot'/);
 assert.match(yemot,/noteYemotReturnCalls/);
 assert.match(callback,/Incoming call on Olam Chesed Communications/);
 assert.match(ui,/chimeOn&&fresh.length/);
 assert.match(ui,/olam_chime_delivered|seen\.current/);
});
test('Personal recording and number only play after explicit preference, authenticated callback and owner access',()=>{
 assert.match(callback,/share_callback_number/);
 assert.match(callback,/unavailable_audio_enabled/);
 assert.match(callback,/unavailable_audio_version/);
 assert.match(callback,/checkSignalWireSignature/);
 assert.match(callback,/timingSafeEqual/);
 assert.match(api,/sameOrigin/);
 assert.match(api,/owner_user_id=\$1/);
 assert.match(api,/unavailable-audio/);
 assert.match(api,/voicemails\/:id\/audio/);
 assert.match(ui,/return-calls\/voicemails/);
});
