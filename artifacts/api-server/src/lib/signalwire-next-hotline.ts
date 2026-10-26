import {createHmac,createHash,timingSafeEqual} from "node:crypto";
import type {Request,Response} from "express";
import {pool} from "@workspace/db";
import {handleYemotApp} from "./yemot-api-driven-phone";
import {phoneTree} from "../routes/yemot-whole-platform-ivr";

/**
 * SignalWire Compatibility API cXML sandbox for the FUTURE Olam Hachesed line.
 * Only POST requests with valid project signing-key HMAC and matching called
 * number are admitted. Caller ID is NEVER membership authentication.
 * Provider credentials, old Yemot config, and existing /4444 are untouched.
 */
export const SIGNALWIRE_URL="https://gavhah.onrender.com/api/signalwire/next-ivr";

type SimpleForm=Record<string,string>;
export function checkSignalWireSignature(signingKey:string,signature:string,url:string,body:unknown):boolean{
 if(signingKey.length<24||!/^[A-Za-z0-9+/]{27}=$/.test(signature))return false;
 if(!body||typeof body!=="object"||Array.isArray(body))return false;
 const params=body as Record<string,unknown>;
 if(Object.keys(params).length>80)return false;
 if(Object.values(params).some(v=>typeof v!=="string"||v.length>4000))return false;
 // SignalWire Compatibility cXML signs the POST URL and sorted form parameters.
 // https://signalwire.com/docs/compatibility-api/guides/webhook-security
 const base=url+Object.keys(params).sort().map(k=>k+params[k]).join("");
 const expected=createHmac("sha1",signingKey).update(base).digest("base64");
 return expected.length===signature.length&&
   timingSafeEqual(Buffer.from(expected,"ascii"),Buffer.from(signature,"ascii"));
}
const xml=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
function responseXml(body:string){
 return '<?xml version="1.0" encoding="UTF-8"?><Response>'+body+'</Response>';
}
const speak=(text:string)=>'<Say voice="man" language="en-US">'+
 xml(text.replace(/[\u0590-\u05ff\u0600-\u06ff]/g," ").slice(0,3200))+'</Say>';
export function convertGavhahReplyToCxml(reply:string):string{
 const found=/^read=t-([\s\S]*)=(iv|ln|ar|rg)(\d+),no,(\d+),(\d+),(\d+),No,no(?:,.*)?$/.exec(reply);
 if(found){
  const [,prompt,mode,,maxDigits,,timeout]=found;
  // Gavhah menu is one choice per press. The existing Yemot root has a
  // four-digit 4444 shortcut, but that Campaign Center shortcut belongs to
  // the OLD phone number, not the new SignalWire GV-only number.
  const digits=mode==="iv"?1:Math.min(16,Math.max(1,Number(maxDigits)||1));
  const seconds=Math.min(18,Math.max(5,Number(timeout)||8));
  const gather='<Gather input="dtmf" action="'+SIGNALWIRE_URL+'" method="POST" '+
   'numDigits="'+digits+'" finishOnKey="#" timeout="'+seconds+'">'+
   speak(prompt)+'</Gather>';
  return responseXml(gather+speak("No selection received. Please call again.")+"<Hangup/>");
 }
 if(/^read=t-[\s\S]*=rr\d+,,record$/.test(reply)){
  // Refuse to claim audio recording is saved: provider-specific webhook/media
  // import is a separate release gate; no fake recording links or caller data.
  return responseXml(speak("This audio recording option needs the new provider recording integration. Please use the website until it is tested.")+"<Hangup/>");
 }
 if(reply.startsWith("id_list_message=t-"))
  return responseXml(speak(reply.slice("id_list_message=t-".length))+"<Hangup/>");
 return responseXml(speak("This telephone action is not available through the new provider yet.")+"<Hangup/>");
}
function normalizedPhone(raw:string){
 const digits=raw.replace(/\D/g,"");
 return digits.startsWith("1")&&digits.length===11?digits.slice(1):digits;
}
export async function signalWireNextHotline(req:Request,res:Response){
 const signingKey=String(process.env.SIGNALWIRE_SIGNING_KEY||"");
 const signature=String(req.get("x-signalwire-signature")||
   req.get("x-twilio-signature")||"");
 const form=req.body as SimpleForm;
 if(req.method!=="POST"||req.originalUrl!=="/api/signalwire/next-ivr"||
   !checkSignalWireSignature(signingKey,signature,SIGNALWIRE_URL,form)){
  res.status(403).type("text/plain").send("Invalid SignalWire callback signature");
  return;
 }
 const callId=String(form.CallSid||"");
 const called=String(form.To||"");
 const digit=typeof form.Digits==="string"?form.Digits:undefined;
 if(!/^[A-Za-z0-9_.:-]{8,160}$/.test(callId)||
    !/^\+?[0-9]{7,15}$/.test(called)||
    (digit!==undefined&&!/^[0-9]{0,16}$/.test(digit))){
  res.status(400).type("text/plain").send("Invalid telephone call input");
  return;
 }
 const r=await pool.query(
  "SELECT provider_kind,candidate_number,stage,generation,callback_hash "+
  "FROM public.gavhah_hotline_migration WHERE id=1");
 const config=r.rows[0];
 if(config?.provider_kind!=="signalwire"||config.stage!=="testing"||
    normalizedPhone(String(config.candidate_number||""))!==normalizedPhone(called)||
    !/^[a-f0-9]{32}$/.test(String(config.generation||""))||
    !/^[a-f0-9]{64}$/.test(String(config.callback_hash||""))){
  res.status(503).type("text/plain").send("New hotline is not prepared for this number");
  return;
 }
 const entryKey=createHmac("sha256",signingKey)
  .update("gavhah-signalwire-next-ivr-v1:"+config.generation).digest("hex");
 const fingerprint=createHash("sha256").update(entryKey).digest("hex");
 if(!timingSafeEqual(Buffer.from(fingerprint,"hex"),Buffer.from(config.callback_hash,"hex"))){
  res.status(503).type("text/plain").send("New hotline signing key has changed. Prepare a new test.");
  return;
 }
 // Adapt SignalWire DTMF into existing Gavhah IVR engine instead of creating a
 // second copy of tasks, menus, database actions, membership and donor logic.
 let status=200,providerReply="";
 const capture={
  status(code:number){status=code;return this;},
  type(_kind:string){return this;},
  set(_key:string,_value:string){return this;},
  send(value:unknown){providerReply=String(value??"");return this;}
 } as unknown as Response;
 const proxyRequest={
  path:"/yemot/next-ivr",
  body:{ApiCallId:callId,entryKey,...(digit===undefined?{}:{signalwireDigits:digit})},
  query:{}
 } as unknown as Request;
 await handleYemotApp(proxyRequest,capture,phoneTree);
 if(status!==200){
  res.status(status).type("text/plain").send("Gavhah phone access unavailable");
  return;
 }
 res.status(200).type("application/xml; charset=utf-8")
  .set("Cache-Control","no-store").send(convertGavhahReplyToCxml(providerReply));
}
