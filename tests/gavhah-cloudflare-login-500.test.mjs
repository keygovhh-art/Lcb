import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const db=readFileSync("lib/db/src/index.ts","utf8");
const auth=readFileSync("artifacts/api-server/src/routes/auth.ts","utf8");
const worker=readFileSync("cloudflare/gavhah/worker.ts","utf8");
test("Cloudflare isolates use a bounded Neon Pool without altering Render settings",()=>{
 assert.match(db,/process\.env\.CF_WORKER_RUNTIME === "1"/);
 assert.match(db,/max: 2, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 7_000/);
 assert.match(db,/process\.env\.VERCEL === "1"/);
});
test("Login verifies password, rotates session and saves before success response",()=>{
 const login=auth.slice(auth.indexOf('router.post("/auth/login"'),auth.indexOf("// The chooser"));
 assert.match(login,/await verifyAccount\(identifier,password\)/);
 assert.match(login,/req\.session\.regenerate\(/);
 assert.match(login,/await new Promise<void>\(\(resolve,reject\)=>req\.session\.save/);
 assert.ok(login.indexOf("req.session.save")<login.indexOf("res.json({user:safeUser(user)})"));
 assert.match(login,/supportCode:stage==="verification"\?"AUTH-DB"/);
 assert.doesNotMatch(login,/password:\s*password/);
});
test("Existing hotline callbacks and Cloudflare-only hosting stay intact",()=>{
 assert.match(worker,/renderProxy:false/);
 assert.match(worker,/signalwirePhoneCallbacksEnabled/);
 assert.match(worker,/yemotPhoneCallbacksEnabled/);
});
