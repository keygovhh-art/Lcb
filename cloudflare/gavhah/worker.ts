/**
 * Independent full Cloudflare Gavhah application: original Express API and
 * React SPA static assets live in ONE Cloudflare Worker. No Render proxy.
 * Uses the existing Neon PostgreSQL database with Worker runtime secrets.
 * The login UI now distinguishes HTTP edge failures from incorrect credentials.
 * Real phone callbacks require provider-secret and number verification.
 */
import {httpServerHandler} from "cloudflare:node";
import app from "../../artifacts/api-server/src/app-cloudflare";
import {inlineAssets} from "./generated-static-assets";

app.listen(8787);
const api=httpServerHandler({port:8787});
const mimeCache="public, max-age=600";
function nativeReadiness(env:Record<string,unknown>){
 const dbUrl=String(env.DATABASE_URL||"");
 let databaseCredentialPresent=false;
 try{
  const parsed=new URL(dbUrl);
  databaseCredentialPresent=(parsed.protocol==="postgresql:"||parsed.protocol==="postgres:")&&
   parsed.hostname.endsWith(".neon.tech")&&!!parsed.username&&!!parsed.password;
 }catch{}
 const sessionsConfigured=String(env.SESSION_STORE||"")==="postgres"&&
  String(env.SESSION_COOKIE_SECURE||"")==="true"&&
  String(env.SESSION_SECRET||"").length>=32;
 const encryptedProviderKey=String(env.YEMOT_ENCRYPTION_KEY||"");
 const providerCryptographyConfigured=encryptedProviderKey.length>=40&&
  encryptedProviderKey!=="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
 const webhookSigningConfigured=String(env.SIGNALWIRE_SIGNING_KEY||"").length>=24;
 // Yemot must never depend on SignalWire credentials or routes.
 const yemotOperatorEnabled=String(env.CF_YEMOT_WEBHOOKS_ENABLED||"")==="true";
 const signalwireOperatorEnabled=String(env.CF_PHONE_WEBHOOKS_ENABLED||"")==="true";
 const yemotPhoneCallbacksEnabled=databaseCredentialPresent&&sessionsConfigured&&
  providerCryptographyConfigured&&yemotOperatorEnabled;
 const signalwirePhoneCallbacksEnabled=databaseCredentialPresent&&sessionsConfigured&&
  webhookSigningConfigured&&signalwireOperatorEnabled;
 const phoneCallbacksEnabled=yemotPhoneCallbacksEnabled&&signalwirePhoneCallbacksEnabled;
 return {databaseCredentialPresent,sessionsConfigured,phoneCallbacksEnabled,
  yemotPhoneCallbacksEnabled,signalwirePhoneCallbacksEnabled};
}
function paused(message:string,status=503){
 return Response.json({status:"staging",message},{status,headers:{"Cache-Control":"no-store"}});
}
export default {
 async fetch(request:Request,env:unknown,ctx:unknown):Promise<Response>{
  const url=new URL(request.url);
  const values=env as Record<string,unknown>;
  const readiness=nativeReadiness(values);
  if(url.pathname==="/__gavhah/status"&&request.method==="GET"){
   return Response.json({
    hosting:"cloudflare-native",
    renderProxy:false,
    databaseCredentialsConfigured:readiness.databaseCredentialPresent,
    sessionsConfigured:readiness.sessionsConfigured,
    phoneCallbacksEnabled:readiness.phoneCallbacksEnabled,
    yemotPhoneCallbacksEnabled:readiness.yemotPhoneCallbacksEnabled,
    signalwirePhoneCallbacksEnabled:readiness.signalwirePhoneCallbacksEnabled,
    databaseReachabilityVerified:false,
    livePhoneNumberTransferred:false
   },{headers:{"Cache-Control":"no-store"}});
  }
  if(url.pathname==="/api"||url.pathname.startsWith("/api/")){
   if(!readiness.databaseCredentialPresent||!readiness.sessionsConfigured)
    return paused("Independent Cloudflare backend is awaiting its Neon and session configuration.");
   const path=url.pathname;
   if(path.startsWith("/api/yemot/")&&!readiness.yemotPhoneCallbacksEnabled)
    return paused("Yemot callback is not yet activated on Cloudflare; existing provider routing remains unchanged.");
   if(path.startsWith("/api/signalwire/")&&!readiness.signalwirePhoneCallbacksEnabled)
    return paused("Legacy SignalWire callback is locked; this has no effect on Yemot.");
   if(path.startsWith("/api/admin/hotline-migration")&&
    !["GET","HEAD","OPTIONS"].includes(request.method))
    return paused("Shared live phone-provider administration is locked on the independent Cloudflare copy.",403);
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
  // Decode the embedded asset before sending. Cloudflare handles HTTP compression.
  const headers=new Headers({
    "Content-Type":file.mime,
    "Cache-Control":path.startsWith("/assets/")?mimeCache:"no-store",
    "X-Content-Type-Options":"nosniff",
    "Referrer-Policy":"strict-origin-when-cross-origin",
    "Vary":"Accept-Encoding"
  });
  const body=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(request.method==="HEAD"?null:body,{status:200,headers});
 }
};
