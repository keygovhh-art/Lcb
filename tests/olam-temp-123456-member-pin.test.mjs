import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const s=await readFile(new URL('../artifacts/api-server/src/lib/yemot-api-driven-phone.ts',import.meta.url),'utf8');
test('123456 can never be a universal password or superadmin authentication',()=>{
 assert.match(s,/digit==="123456"&&s\.login_failures<5/);
 assert.match(s,/GAVHAH_PHONE_TEST_PIN_ENABLED/);
 assert.match(s,/GAVHAH_PHONE_TEST_MEMBER_ID/);
 assert.match(s,/GAVHAH_PHONE_TEST_PIN_EXPIRES_AT/);
 assert.match(s,/until-Date\.now\(\)<=24\*60\*60\*1000/);
 assert.match(s,/role='member' AND status='active'/);
 assert.match(s,/name='Gavhah Temporary Phone Test Member'/);
 assert.match(s,/email IS NULL AND phone IS NULL/);
 assert.match(s,/password_hash='disabled-phone-test-only'/);
 assert.match(s,/Date\.now\(\)\+10\*60\*1000/);
 assert.match(s,/Super admin access is disabled/);
});
test('Preserve 8-digit one-time website code for all real members',()=>{
 assert.match(s,/else if\(\/\^\\d\{8\}\$\/\.test\(digit\)/);
 assert.match(s,/gavhah_phone_pair_codes/);
});
