import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../artifacts/api-server/src/lib/signalwire-max-outbound.ts',import.meta.url),'utf8');
const bridge=await readFile(new URL('../artifacts/api-server/src/routes/communications-connect.ts',import.meta.url),'utf8');
const cc=await readFile(new URL('../artifacts/api-server/src/routes/max-calling-workspace.ts',import.meta.url),'utf8');
const schema=await readFile(new URL('../lib/db/migrations/20261103_max_calls_campaign_workspace.sql',import.meta.url),'utf8');

test('Only separate and explicitly enabled Olam SignalWire project may bill outbound calls',()=>{
 assert.match(source,/OLAM_SIGNALWIRE_CALLING_ENABLED/);
 assert.match(source,/OLAM_SIGNALWIRE_SPACE/);
 assert.match(source,/OLAM_SIGNALWIRE_API_TOKEN/);
 assert.match(source,/OLAM_SIGNALWIRE_SIGNING_KEY/);
 assert.match(source,/OLAM_SIGNALWIRE_CALLBACK_BASE/);
 assert.match(source,/if\(!c\)throw/);
 assert.match(source,/gavhah_olam_chesed_access/);
 assert.match(source,/gavhah_olam_signalwire_agent_numbers/);
});
test('DNC, campaign claim, country lookup and concurrency gate precede call creation',()=>{
 const last=(name)=>source.indexOf(name);
 assert.ok(last('await authorizeCampaign')>=0);
 assert.ok(last('do_not_call=true')>last('await authorizeCampaign'));
 assert.ok(last('await providerNumberCheck')>last('do_not_call=true'));
 assert.ok(last('await providerNumberCheck')<last('new URLSearchParams({'));
 assert.match(source,/status='prepared'/);
 assert.match(schema,/max_call_sessions_one_live_per_agent_idx/);
 assert.match(bridge,/verifyMaxCampaignDialClaim/);
 assert.match(bridge,/authorize-dial/);
});
test('Only real provider statuses set duration and recording is disabled',()=>{
 assert.match(source,/Record:"false"/);
 assert.match(source,/record="do-not-record"/);
 assert.doesNotMatch(source,/record-from-answer|record-from-ringing/);
 assert.match(source,/duration_seconds=CASE WHEN/);
 assert.match(source,/CallDuration/);
 assert.match(source,/checkSignalWireSignature/);
 assert.match(source,/timingSafeEqual/);
 assert.match(source,/Status:"completed"|status=row.status==="in_progress"\?"completed"/);
 assert.match(cc,/placeOlamMaxOutboundCall/);
 assert.match(cc,/endOlamMaxOutboundCall/);
});
