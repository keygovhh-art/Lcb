import {createHmac} from "node:crypto";
import type {Request,Response} from "express";
import {pool} from "@workspace/db";
import {handleYemotApp} from "./yemot-api-driven-phone";
import {phoneTree} from "../routes/yemot-whole-platform-ivr";
import {checkSignalWireSignature,convertGavhahReplyToCxml} from "./signalwire-next-hotline";
import {normalizedSignalWireNumber} from "./signalwire-number-safety";

/**
 * STAGED ONLY: the provider-owned +1 (605) 655-8080 webhook is NOT changed
 * by this module. When separately approved and physically tested, this will
 * make Gavhah the root and delegate 55555 to the saved original provider
 * cXML webhook using SignalWire's <Redirect> instruction.
 *
 * The old system's original URL is NEVER sent to the dashboard, logged,
 * replaced, fetched server-side, or altered by this code.
 */
export const SHARED_SIGNALWIRE_URL=process.env.CF_WORKER_RUNTIME==="1"
 ? "https://gavhah-cloudflare-native.keygovhh.workers.dev/api/signalwire/shared-ivr"
 : "https://gavhah.onrender.com/api/signalwire/shared-ivr";
export const SHARED_E164="+16056558080";
export const LEGACY_EXTENSION="55555";

export function xmlEscape(input:string):string{
 return input.replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function cxml(body:string):string{
 return '<?xml version="1.0" encoding="UTF-8"?><Response>'+body+"</Response>";
}
export function originalSystemRedirectXml(url:string,method:"POST"|"GET"):string{
 const u=new URL(url);
 if(u.protocol!=="https:"||u.username||u.password||
    u.hostname==="gavhah.onrender.com"||u.hash||url.length>1800){
  throw Error("The saved original voice URL is not a safe external HTTPS target");
 }
 return cxml('<Redirect method="'+method+'">'+xmlEscape(url)+"</Redirect>");
}
type SharedRoute={
 requested_number:string;old_extension:string;audit_state:string;
 original_voice_url:string|null;original_voice_method:string|null;
 original_call_handler:string|null;route_fingerprint:string|null;cutover_enabled:boolean
};
export function sharedRouteReady(r:SharedRoute|null):boolean{
 if(!r)return false;
 if(r.requested_number!=="6056558080"||r.old_extension!==LEGACY_EXTENSION||
  r.audit_state!=="verified_compatibility_voice_url"||
  r.original_call_handler!=="laml_webhooks"||
  !/^[a-f0-9]{64}$/.test(r.route_fingerprint||"")||
  !r.original_voice_url)return false;
 try{
  const target=new URL(r.original_voice_url);
  return target.protocol==="https:"&&target.hostname!=="gavhah.onrender.com"&&
   !target.username&&!target.password&&!target.hash&&target.href.length<=1800;
 }catch{return false;}
}
export async function signalWireSharedHotline(req:Request,res:Response):Promise<void>{
 const signingKey=String(process.env.SIGNALWIRE_SIGNING_KEY||"");
 const signature=String(req.get("x-signalwire-signature")||
   req.get("x-twilio-signature")||"");
 const form=req.body as Record<string,string>;
 if(req.method!=="POST"||req.originalUrl!=="/api/signalwire/shared-ivr"||
  !checkSignalWireSignature(signingKey,signature,SHARED_SIGNALWIRE_URL,form)){
  res.status(403).type("text/plain").send("Invalid SignalWire callback signature");
  return;
 }
 const callId=String(form.CallSid||"");
 const called=String(form.To||"");
 const digits=typeof form.Digits==="string"?form.Digits:undefined;
 if(!/^[A-Za-z0-9_.:-]{8,160}$/.test(callId)||
  normalizedSignalWireNumber(called)!=="6056558080"||
  (digits!==undefined&&!/^\d{0,16}$/.test(digits))){
  res.status(400).type("text/plain").send("Invalid SignalWire call or keypad input");
  return;
 }
 const route=(await pool.query<SharedRoute>(
  "SELECT requested_number,old_extension,audit_state,original_voice_url,"+
  "original_voice_method,original_call_handler,route_fingerprint,cutover_enabled "+
  "FROM public.gavhah_signalwire_shared_route WHERE id=1")).rows[0];
 if(!sharedRouteReady(route)||signingKey.length<24){
  res.status(503).type("text/plain").send("Shared SignalWire IVR is not prepared");
  return;
 }
 // In addition to the provider signature, the existing Gavhah phone engine
 // separately verifies the per-route derived HMAC. A raw caller ID NEVER
 // grants access to a private member record.
 const entryKey=createHmac("sha256",signingKey)
  .update("gavhah-shared-55555-v1:"+route.route_fingerprint).digest("hex");
 const callHash=createHmac("sha256",entryKey).update(callId).digest("hex");
 if(digits===LEGACY_EXTENSION){
  const state=(await pool.query<{path:string}>(
   "SELECT path FROM public.gavhah_yemot_call_states WHERE call_hash=$1",
   [callHash])).rows[0];
  // Only from the shared ROOT menu; the previous system is never reached
  // inadvertently from within a Gavhah personal/finance submenu.
  if(!state||!state.path){
   try{
    const method=route.original_voice_method==="GET"?"GET":"POST";
    res.status(200).type("application/xml; charset=utf-8")
     .set("Cache-Control","no-store")
     .send(originalSystemRedirectXml(route.original_voice_url!,method));
   }catch{
    res.status(503).type("text/plain").send("Saved original system route is unsafe");
   }
   return;
  }
 }
 // The same GV Neon phone engine handles news, members, MAX, tasks and phone
 // account pairing. No second database, no copy of account records.
 let status=200,reply="";
 const capture={
  status(code:number){status=code;return this;},
  type(_kind:string){return this;},
  set(_key:string,_value:string){return this;},
  send(body:unknown){reply=String(body??"");return this;}
 } as unknown as Response;
 const proxy={
  path:"/signalwire/shared-ivr",
  body:{ApiCallId:callId,entryKey,...(digits===undefined?{}:{signalwireDigits:digits})},
  query:{}
 } as unknown as Request;
 await handleYemotApp(proxy,capture,phoneTree);
 if(status!==200){
  res.status(status).type("text/plain").send("Gavhah phone engine unavailable");
  return;
 }
 const root=reply.startsWith("read=t-Welcome to Olam Hachesed Communications, MAX.");
 res.status(200).type("application/xml; charset=utf-8")
  .set("Cache-Control","no-store")
  .send(convertGavhahReplyToCxml(reply,SHARED_SIGNALWIRE_URL,root));
}
