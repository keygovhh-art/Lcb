import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("artifacts/api-server/src/routes/communications-connect.ts","utf8");
const ui=readFileSync("artifacts/gavhah/src/components/communications/gavhah-connect-panel.tsx","utf8");

test("MAX explicitly expects a task ARRAY and preserves authorized task shape",()=>{
 assert.match(source,/remote<unknown\[\]>/);
 assert.match(source,/"GET",undefined,"array"/);
 assert.match(source,/Array\.isArray\(parsed\)/);
 assert.match(source,/result\.map\(row=>/);
 for(const field of ["id","title","kind","priority","status","due_at"]){
  assert.match(source,new RegExp("task\\."+field.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
 }
 assert.doesNotMatch(source,/const result:Record<string,unknown>=parsed&&typeof parsed/);
 assert.match(source,/Invalid campaign assignment response/);
});
test("Remote handshake is distinct from account linking and never claims unsupported providers",()=>{
 assert.match(source,/router\.get\("\/askanus\/connect\/diagnostics"/);
 assert.match(source,/remote\("\/capabilities","GET"\)/);
 assert.match(source,/found\.protocol!=="gavhah-connect-v1"/);
 assert.match(source,/personalDonorSync:false,automaticPhoneCalls:false,verifiedPaymentProcessor:false/);
 assert.match(ui,/\/api\/askanus\/connect\/diagnostics/);
 assert.match(ui,/serverConnectionVerified/);
 assert.match(ui,/די גבהה־API האט באשטעטיגט א פארבינדונג/);
});
test("Sharing remains explicit per source event and private notes remain local",()=>{
 assert.match(source,/req\.body\?\.confirmShare!==true/g);
 assert.match(source,/eq\(askanuscases\.userId,uid\)/);
 assert.match(source,/eq\(maxReceipts\.userId,uid\)/);
 assert.match(source,/return parsed as T/);
 assert.match(source,/redirect:"error"/);
 assert.doesNotMatch(source,/headers:\s*\{[^}]*"?Authorization"?\s*:/);
});
