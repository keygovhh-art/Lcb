import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync("cloudflare/gavhah/full-web-proxy.js","utf8");
const PREVIEW="https://gavhah-cloudflare-copy.keygovhh.workers.dev";
function setup(response){
 const logs=[];
 const ctx={URL,Headers,Request,Response,Set,console,
  addEventListener(_type,_fn){},
  fetch:async(url,options)=>{logs.push({url,options});return response||new Response("ok",{status:200});}
 };
 vm.runInNewContext(source,ctx);
 return {logs,call:async(path,options)=>ctx.handle(new Request(PREVIEW+path,options)),ctx};
}
test("public webpages forward to fixed Render origin without caching",async()=>{
 const x=setup(new Response("PUBLIC",{headers:{"Content-Type":"text/html"}}));
 const r=await x.call("/news?foo=1");
 assert.equal(r.status,200);
 assert.equal(await r.text(),"PUBLIC");
 assert.equal(x.logs[0].url,"https://gavhah.onrender.com/news?foo=1");
 assert.equal(r.headers.get("cache-control"),"private, no-store");
});
test("same-origin login posts are accepted and session cookies are preserved",async()=>{
 const x=setup(new Response("ok",{headers:{"Set-Cookie":"connect.sid=abc; Secure; HttpOnly; SameSite=Lax"}}));
 const r=await x.call("/api/auth/login",{method:"POST",headers:{"Origin":PREVIEW,"Content-Type":"application/json","Cookie":"connect.sid=old","X-Forwarded-For":"6.6.6.6"},body:'{"username":"test"}'});
 assert.equal(r.status,200);
 assert.equal(x.logs[0].options.method,"POST");
 assert.equal(x.logs[0].options.headers.get("origin"),"https://gavhah.onrender.com");
 assert.equal(x.logs[0].options.headers.get("cookie"),"connect.sid=old");
 assert.equal(x.logs[0].options.headers.get("x-forwarded-host"),"gavhah.onrender.com");
 assert.notEqual(x.logs[0].options.headers.get("x-forwarded-for"),"6.6.6.6");
 assert.equal(r.headers.get("Set-Cookie"),"connect.sid=abc; Secure; HttpOnly; SameSite=Lax");
});
test("cross-site and unmarked mutating requests are rejected",async()=>{
 const x=setup();
 for(const origin of [null,"https://evil.example","https://gavhah.onrender.com"]){
  const headers=origin?{Origin:origin}:{};
  assert.equal((await x.call("/api/users",{method:"POST",headers,body:"bad"})).status,403);
 }
 assert.equal(x.logs.length,0);
});
test("external callback and provider settings cannot be changed via preview",async()=>{
 const x=setup();
 for(const path of ["/api/signalwire/shared-ivr","/api/yemot/next-ivr","/api/admin/hotline-migration/signalwire/connection"]){
  const r=await x.call(path,{method:"POST",headers:{Origin:PREVIEW},body:"none"});
  assert.equal(r.status,403);
 }
 assert.equal(x.logs.length,0);
});
test("internal redirects are mapped back to Cloudflare copy",async()=>{
 const x=setup(new Response(null,{status:302,headers:{Location:"https://gavhah.onrender.com/login?next=%2Fmy"}}));
 const r=await x.call("/my");
 assert.equal(r.headers.get("location"),PREVIEW+"/login?next=%2Fmy");
});
test("reject unexpected host or method before reaching Render",async()=>{
 const x=setup();
 assert.equal((await x.ctx.handle(new Request("https://evil.example/foo"))).status,421);
 const unsupported={url:PREVIEW+"/foo",method:"TRACE",headers:new Headers()};
 assert.equal((await x.ctx.handle(unsupported)).status,405);
 assert.equal(x.logs.length,0);
});
