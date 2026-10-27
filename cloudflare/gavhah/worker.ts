/**
 * Independent full Cloudflare Gavhah application: original Express API and
 * React SPA static assets live in ONE Cloudflare Worker. No Render proxy.
 * Uses the existing Neon PostgreSQL database with Worker runtime secrets.
 * Real phone callbacks require provider-secret and number verification.
 */
import {httpServerHandler} from "cloudflare:node";
import app from "../../artifacts/api-server/src/app-cloudflare";
import {inlineAssets} from "./generated-static-assets";

app.listen(8787);
const api=httpServerHandler({port:8787});
const mimeCache="public, max-age=600";
function configuration(){
 const db=String(process.env.DATABASE_URL||"");
 // A dummy URI can compile and pass a local smoke test, but MUST NOT
 // expose private APIs or callers in the public Cloudflare preview.
 const genuineNeon=/^postgres(?:ql)?:\/\//.test(db)&&
  /^([a-z0-9.-]+\.neon\.tech)$/i.test((()=>{try{return new URL(db).hostname;}catch{return "";}})()) &&
  !db.includes("placeholder")&&!db.includes("dummy");
 const sessionReady=String(process.env.SESSION_SECRET||"").length>=32 &&
  process.env.SESSION_STORE==="postgres" &&
  process.env.SESSION_COOKIE_SECURE==="true";
 const yemotReady=String(process.env.YEMOT_ENCRYPTION_KEY||"").length>=40 &&
  String(process.env.YEMOT_ENCRYPTION_KEY)!=="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
 const signalwireReady=String(process.env.SIGNALWIRE_SIGNING_KEY||"").length>=24;
 return {neon:genuineNeon,sessions:sessionReady,yemot:yemotReady,signalwire:signalwireReady};
}
const SIGNALWIRE_CALLBACK=/^\/api\/signalwire(?:\/|$)/;
const YEMOT_CALLBACK=/^\/api\/yemot(?:\/|$)/;
const PROVIDER_ADMIN=/^\/api\/admin\/hotline-migration(?:\/|$)/;
export default {
 async fetch(request:Request,env:unknown,ctx:unknown):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==="/__gavhah/status"){
   if(request.method!=="GET"&&request.method!=="HEAD")
    return new Response("Method not allowed",{status:405,headers:{Allow:"GET, HEAD"}});
   const s=configuration();
   return new Response(JSON.stringify({
    service:"gavhah",hosting:"cloudflare-native",renderProxy:false,
    originalNeonProjectPreserved:true,
    embeddedWebsite:true,backendRuntimeDeployed:true,
    databaseCredentialsReady:s.neon,secureSessionReady:s.sessions,
    yemotSecretsReady:s.yemot,signalwireSignatureReady:s.signalwire,
    databaseConnectionTested:false,loginEndToEndTested:false,
    independentPhoneCallTested:false,providerNumberChanged:false,
    usableForPrivateApi:s.neon&&s.sessions,
    telephoneCallbacksEnabled:process.env.CF_PHONE_CALLBACKS_ENABLED==="true",
    status:s.neon&&s.sessions?"awaiting-live-verification":"staging-blocked"
   }),{status:200,headers:{"Content-Type":"application/json; charset=utf-8",
     "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
  if(url.pathname==="/api"||url.pathname.startsWith("/api/")){
   const s=configuration();
   if(!s.neon||!s.sessions){
    return new Response(JSON.stringify({error:"Cloudflare API is staged but its Neon or session secrets are not configured. Existing Render service is unaffected."}),{
     status:503,headers:{"Content-Type":"application/json; charset=utf-8",
     "Cache-Control":"no-store","Retry-After":"120"}});
   }
   // Original Render telephony ownership is protected. Even the standalone
   // copy must not mutate existing provider number routes.
   if(PROVIDER_ADMIN.test(url.pathname)&&!["GET","HEAD","OPTIONS"].includes(request.method)){
    return new Response(JSON.stringify({error:"Cloudflare staging cannot change the original live phone provider routing."}),{
     status:403,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
   }
   if((SIGNALWIRE_CALLBACK.test(url.pathname)&&!s.signalwire)||
      (YEMOT_CALLBACK.test(url.pathname)&&!s.yemot)||
      ((SIGNALWIRE_CALLBACK.test(url.pathname)||YEMOT_CALLBACK.test(url.pathname))&&
       process.env.CF_PHONE_CALLBACKS_ENABLED!=="true")){
    return new Response(JSON.stringify({error:"Separate Cloudflare hotline callback is staged; signing keys and separate phone routing require verified live-call testing."}),{
     status:503,headers:{"Content-Type":"application/json; charset=utf-8",
     "Cache-Control":"no-store"}});
   }
   return api.fetch(request,env,ctx);
  }
  if(request.method!=="GET"&&request.method!=="HEAD")
   return new Response("Method not allowed",{status:405,headers:{Allow:"GET, HEAD"}});
  const path=url.pathname;
  const file=inlineAssets[path] || (path.startsWith("/assets/")?undefined:inlineAssets["/index.html"]);
  if(!file)return new Response("Not found",{status:404});
  // Build output is gzip-compressed and inlined into the Worker script itself;
  // no Cloudflare Pages, Render, CDN, or separate assets upload is required.
  const raw=atob(file.base64);
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  const gzipAccepted=/\bgzip\b/.test(request.headers.get("accept-encoding")||"");
  const headers=new Headers({
    "Content-Type":file.mime,
    "Cache-Control":path.startsWith("/assets/")?mimeCache:"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"strict-origin-when-cross-origin",
    "Vary":"Accept-Encoding"
  });
  const body=gzipAccepted?bytes:new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  if(gzipAccepted)headers.set("Content-Encoding","gzip");
  return new Response(request.method==="HEAD"?null:body,{status:200,headers});
 }
};
