import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const load=path=>fs.readFileSync(path,'utf8');
const phone=load('artifacts/api-server/src/routes/yemot-whole-platform-ivr.ts');
const ivr=load('artifacts/api-server/src/lib/yemot-api-driven-phone.ts');

test('Gavhah existing phone number is Gavhah-only in proposed release',()=>{
 assert.match(ivr,/Welcome to Gavhah\. Press 1 for Gavhah/);
 assert.doesNotMatch(ivr,/Press 2 for Campaign Center/);
 assert.doesNotMatch(phone,/"2":group\("Campaign Center"/);
 assert.match(phone,/"2":leaf\("Campaign Center uses a separate phone number"/);
 assert.match(phone,/Please call the separate Campaign Center number/);
});
test('Existing Gavhah sign-up and provider management are preserved',()=>{
 assert.match(ivr,/path==="" && digit==="8"/);
 assert.match(ivr,/path==="" && digit==="0"/);
 assert.match(phone,/"1":group\("Gavhah/);
 assert.match(phone,/"5":leaf\("Create a Gavhah website member by phone"/);
});
