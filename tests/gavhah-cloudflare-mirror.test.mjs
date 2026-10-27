import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync('cloudflare/gavhah/mirror-worker.js','utf8');
test('Read-only public preview does not forward user credentials or enable provider/admin writes',()=>{
 assert.match(worker,/https:\/\/gavhah\.onrender\.com/);
 assert.match(worker,/request\.method!=="GET"&&request\.method!=="HEAD"/);
 assert.match(worker,/status:405/);
 assert.match(worker,/startsWith\("\/api\/admin"\)/);
 assert.match(worker,/startsWith\("\/api\/signalwire"\)/);
 assert.match(worker,/startsWith\("\/api\/yemot"\)/);
 assert.match(worker,/for\(const name of \["Set-Cookie"/);
 assert.match(worker,/Cache-Control","private, no-store"/);
 assert.doesNotMatch(worker,/req\.headers|DATABASE_URL|NEON_API_KEY|SIGNALWIRE_SIGNING_KEY|process\.env/);
});
