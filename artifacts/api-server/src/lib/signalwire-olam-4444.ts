import {createHmac} from "node:crypto";
import type {Request,Response} from "express";
import {pool} from "@workspace/db";
import {handleYemotApp} from "./yemot-api-driven-phone";
import {phoneTree} from "../routes/yemot-whole-platform-ivr";
import {checkSignalWireSignature,convertGavhahReplyToCxml} from "./signalwire-next-hotline";
import {normalizedSignalWireNumber} from "./signalwire-number-safety";
import {sharedRouteReady} from "./signalwire-shared-ivr";

/**
 * Extension-only Olam Hachesed branch: the existing number's root Voice URL
 * remains at its original owner. ONLY its menu option 4444 may delegate here.
 * This code never changes SignalWire phone-number settings, the old 55555
 * mapping, or the separate Campaign Center/Yemot 4444 configuration.
 */
export const OLAM_4444_URL=process.env.CF_WORKER_RUNTIME==="1"
 ? "https://gavhah-cloudflare-native.keygovhh.workers.dev/api/signalwire/olam-4444"
 : "https://gavhah.onrender.com/api/signalwire/olam-4444";

type Route={
 requested_number:string;old_extension:string;audit_state:string;
 original_voice_url:string|null;original_voice_method:string|null;
 original_call_handler:string|null;route_fingerprint:string|null;cutover_enabled:boolean
};

export async function signalWireOlam4444(req:Request,res:Response):Promise<void>{
 const signingKey=String(process.env.SIGNALWIRE_SIGNING_KEY||"");
 const signature=String(req.get("x-signalwire-signature")||
  req.get("x-twilio-signature")||"");
 const form=req.body as Record<string,string>|undefined;
 if(req.method!=="POST"||req.originalUrl!=="/api/signalwire/olam-4444"||
  !checkSignalWireSignature(signingKey,signature,OLAM_4444_URL,form)){
  res.status(403).type("text/plain").send("Invalid SignalWire signature");
  return;
 }
 const callId=String(form!.CallSid||"");
 const called=String(form!.To||"");
 const digits=typeof form!.Digits==="string"?form!.Digits:undefined;
 if(!/^[A-Za-z0-9_.:-]{8,160}$/.test(callId)||
  normalizedSignalWireNumber(called)!=="6056558080"||
  (digits!==undefined&&!/^\d{0,16}$/.test(digits))){
  res.status(400).type("text/plain").send("Invalid call data");
  return;
 }
 const route=(await pool.query<Route>(
  "SELECT requested_number,old_extension,audit_state,original_voice_url,"+
  "original_voice_method,original_call_handler,route_fingerprint,cutover_enabled "+
  "FROM public.gavhah_signalwire_shared_route WHERE id=1")).rows[0];
 if(!sharedRouteReady(route)||signingKey.length<24){
  res.status(503).type("text/plain").send("Olam branch not prepared");
  return;
 }
 // The phone engine independently checks this server-derived access proof.
 // Caller ID never grants access to cases, money or personal records.
 const entryKey=createHmac("sha256",signingKey)
  .update("gavhah-shared-55555-v1:"+route.route_fingerprint).digest("hex");
 let status=200,reply="";
 const capture={
  status(code:number){status=code;return this;},
  type(_mime:string){return this;},
  set(_key:string,_value:string){return this;},
  send(body:unknown){reply=String(body??"");return this;}
 } as unknown as Response;
 const proxy={
  path:"/signalwire/shared-ivr",
  body:{
   ApiCallId:callId,
   entryKey,
   phoneBranch:"olam4444",
   // Original root's 4444 keypress belongs to routing, not this submenu.
   ...(digits===undefined||digits==="4444"?{}:{signalwireDigits:digits})
  },
  query:{}
 } as unknown as Request;
 await handleYemotApp(proxy,capture,phoneTree);
 if(status!==200){
  res.status(status).type("text/plain").send("Olam Hachesed telephone action unavailable");
  return;
 }
 // This is a single-digit SUBMENU, never a five-digit replacement root.
 res.status(200).type("application/xml; charset=utf-8")
  .set("Cache-Control","no-store")
  .send(convertGavhahReplyToCxml(reply,OLAM_4444_URL,false));
}
