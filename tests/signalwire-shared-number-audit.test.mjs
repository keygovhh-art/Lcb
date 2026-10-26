import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const audit=read('artifacts/api-server/src/lib/signalwire-old-route-snapshot.ts');
const boot=read('artifacts/api-server/src/index.ts');
const db=read('lib/db/migrations/20261026_signalwire_8080_old_route_audit.sql');
test('Read-only audit never changes provider number or breaks unrelated system',()=>{
 assert.match(audit,/method:"GET"/);
 assert.match(audit,/audit_state='queued'/);
 assert.match(audit,/normalizedSignalWireNumber\(detail\.phone_number\)!==NUMBER/);
 assert.match(audit,/numberSuffix:"5605"/);
 assert.doesNotMatch(audit,/method:"POST"|method:"DELETE"|UpdateIncomingPhoneNumber/);
 assert.doesNotMatch(audit,/console\.log\(token|logger\.info\(\{token/);
 assert.match(boot,/inspectExisting8080RouteOnce/);
});
test('Old route must be preserved; unknown Fabric and app handlers block any cutover',()=>{
 assert.match(audit,/!!detail\.voice_application_sid\|\|!!detail\.trunk_sid/);
 assert.match(audit,/verified_compatibility_voice_url/);
 assert.match(audit,/unresolved/);
 assert.match(audit,/https:/);
 assert.match(audit,/route_fingerprint/);
 assert.match(db,/cutover_enabled boolean NOT NULL DEFAULT false CHECK\(cutover_enabled=false\)/);
 assert.doesNotMatch(db,/DROP TABLE|DELETE FROM|TRUNCATE/);
});
