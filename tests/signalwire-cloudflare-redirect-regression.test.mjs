import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(name)=>readFileSync(name,"utf8");

const files=[
 "artifacts/api-server/src/routes/signalwire-credentials.ts",
 "artifacts/api-server/src/lib/signalwire-old-route-snapshot.ts",
 "artifacts/api-server/src/routes/signalwire-voice-switch.ts"
];

test("Cloudflare SignalWire fetch never uses unsupported redirect:error",()=>{
 for(const path of files){
  const content=read(path);
  assert.doesNotMatch(content,/redirect\s*:\s*["']error["']/,path);
  assert.match(content,/redirect:"manual"/,path);
  assert.match(content,/status\s*>=\s*300\s*&&\s*\w+\.status\s*<\s*400/,path);
  assert.match(content,/type\s*===\s*"opaqueredirect"/,path);
 }
});

test("SignalWire credentials never follow redirects carrying Authorization",()=>{
 for(const path of files){
  const code=read(path);
  assert.match(code,/Authorization:auth|Authorization:c\.auth/,path);
  assert.match(code,/redirect:"manual"/,path);
  assert.doesNotMatch(code,/redirect:"follow"/,path);
 }
});

test("SignalWire Calling changes remain explicit and limited to calling address",()=>{
 const src=read(files[2]);
 assert.match(src,/MOVE_6056558080_CALLING_ONLY/);
 assert.match(src,/expectedCallingResourceId/);
 assert.match(src,/phone_number_addresses\/.*?calling\.id/);
 assert.match(src,/RESTORE_6056558080_CALLING_ONLY/);
 assert.match(src,/messaging\.resource_id!==x\.messaging\.resource_id/);
});
