import {createHmac,createHash,timingSafeEqual} from "node:crypto";
import type {Request,Response} from "express";
import {pool} from "@workspace/db";
import {buildOlamTwoAttemptGather} from "./signalwire-olam-silence-policy";
import {handleYemotApp} from "./yemot-api-driven-phone";
import {phoneTree} from "../routes/yemot-whole-platform-ivr";
import {isProtectedSignalWireNumber,normalizedSignalWireNumber} from "./signalwire-number-safety";

/**
 * SignalWire Compatibility API cXML sandbox for the FUTURE Olam Hachesed line.
 * Only POST requests with valid project signing-key HMAC and matching called
 * number are admitted. Caller ID is NEVER membership authentication.
 * Provider credentials, old Yemot config, and existing /4444 are untouched.
 */
export const SIGNALWIRE_URL=process.env.CF_WORKER_RUNTIME==="1"
 ? "https://gavhah-cloudflare-native.keygovhh.workers.dev/api/signalwire/next-ivr"
 : "https://gavhah.onrender.com/api/signalwire/next-ivr";

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
export function convertGavhahReplyToCxml(reply:string,actionUrl=SIGNALWIRE_URL,sharedRootMode=false,menuAudioUrl:string|null=null,olamFourSecondRetries=false,retryAudioUrl:string|null=null,allowPrivateFormRecording=false):string{
 const found=/^read=t-([\s\S]*)=(iv|ln|ar|rg)(\d+),no,(\d+),(\d+),(\d+),No,no(?:,.*)?$/.exec(reply);
 if(found){
  const [,prompt,mode,,maxDigits,,timeout]=found;
  // Gavhah menu is one choice per press. The existing Yemot root has a
  // four-digit 4444 shortcut, but that Campaign Center shortcut belongs to
  // the OLD phone number, not the new SignalWire GV-only number.
  const digits=sharedRootMode?5:mode==="iv"?1:Math.min(16,Math.max(1,Number(maxDigits)||1));
  // Olam Chesed Communication: exactly two opportunities, 4 seconds of
  // silence after each prompt. An empty Gather falls through to the next
  // instruction (actionOnEmptyResult=false), WITHOUT an extra webhook.
  // This is intentionally limited to Olam's SignalWire line, not Yemot.
  const first=(menuAudioUrl&&mode==="iv"?'<Play>'+xml(menuAudioUrl)+'</Play>':speak(prompt));
  if(olamFourSecondRetries){
   const retry=retryAudioUrl?'<Play>'+xml(retryAudioUrl)+'</Play>':
     menuAudioUrl&&mode==="iv"?'<Play>'+xml(menuAudioUrl)+'</Play>':
     speak("Please enter your selection again.");
   return responseXml(buildOlamTwoAttemptGather(actionUrl,digits,first,retry));
  }
  const seconds=Math.min(18,Math.max(5,Number(timeout)||8));
  const gathering='<Gather input="dtmf" action="'+xml(actionUrl)+'" method="POST" '+
    'numDigits="'+digits+'" finishOnKey="#" timeout="'+seconds+'">'+first+'</Gather>';
  return responseXml(gathering+speak("No selection received. Please call again.")+"<Hangup/>");
 }
 const recording=/^read=t-([\s\S]*)=rr\d+,,record$/.exec(reply);
 if(recording){
  if(!allowPrivateFormRecording){
   return responseXml(speak("This recording option is not connected to the signed SignalWire private intake. Please use your Gavhah account.")+"<Hangup/>");
  }
  return responseXml(speak(recording[1])+
    '<Record action="'+xml(actionUrl)+'" method="POST" maxLength="180" finishOnKey="#" playBeep="true"/>');
 }
 if(reply.startsWith("id_list_message=t-"))
  return responseXml(speak(reply.slice("id_list_message=t-".length))+"<Hangup/>");
 return responseXml(speak("This telephone action is not available through the new provider yet.")+"<Hangup/>");
}
async function savePrivateSignalWireFormRecording(res:Response,form:SimpleForm,callHash:string):Promise<void>{
 const urlText=String(form.RecordingUrl||""),sid=String(form.RecordingSid||"");
 const duration=Number(form.RecordingDuration||"0");
 let safe=false;
 try{
  const u=new URL(urlText);
  safe=u.protocol==="https:"&&!u.username&&!u.password&&!u.hash&&urlText.length<=1600&&
   (u.hostname==="signalwire.com"||u.hostname.endsWith(".signalwire.com")||
    u.hostname==="signalwire.cloud"||u.hostname.endsWith(".signalwire.cloud"));
 }catch{}
 if(!safe||!/^[A-Za-z0-9_-]{8,128}$/.test(sid)||
   !Number.isSafeInteger(duration)||duration<1||duration>180){
  res.status(400).type("text/plain").send("Invalid SignalWire recording input");return;
 }
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const duplicate=await client.query(
   "SELECT id FROM public.gavhah_signalwire_form_intake WHERE recording_sid=$1 AND call_hash=$2",
   [sid,callHash]);
  if(duplicate.rows.length){
   await client.query("COMMIT");
   res.type("application/xml; charset=utf-8")
    .send(responseXml(speak("This private application was already saved for Gavhah staff review.")+"<Hangup/>"));
   return;
  }
  const state=await client.query<{path:string;member_id:number;status:string}>(
   "SELECT c.path,c.member_id,u.status FROM public.gavhah_yemot_call_states c "+
   "JOIN public.users u ON u.id=c.member_id "+
   "WHERE c.call_hash=$1 AND c.linked_until>now() FOR UPDATE OF c",[callHash]);
  const row=state.rows[0];
  if(!row||!["970393","970394"].includes(row.path)||row.status!=="active"){
   await client.query("ROLLBACK");
   res.status(403).type("text/plain").send("Member verification required for private intake");return;
  }
  const kind=row.path==="970393"?"volunteer":"help";
  const inserted=await client.query<{id:number}>(
   "INSERT INTO public.gavhah_signalwire_form_intake "+
   "(member_id,kind,call_hash,recording_sid,recording_url,recording_duration_seconds) "+
   "VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
   [row.member_id,kind,callHash,sid,urlText,duration]);
  const ref=inserted.rows[0].id;
  await client.query("INSERT INTO public.support_messages "+
   "(user_id,name,email,type,subject,message,status) "+
   "VALUES($1,$2,$3,'signalwire_private_intake',$4,$5,'open')",[
    row.member_id,"Verified Gavhah phone member","signalwire@internal.invalid",
    "Private "+kind+" phone application #"+ref,
    "Staff-only recorded application. Member authenticated by Gavhah pairing code. "+
    "Recording URL: "+urlText+". Transcribe and verify the detailed site form fields. "+
    "Check contact-sharing preferences and obtain consent before any introductions. "+
    "Nothing becomes public automatically."
   ]);
  await client.query("UPDATE public.gavhah_yemot_call_states "+
   "SET path='9703',phone_page=0,selected_item_id=NULL,updated_at=now() WHERE call_hash=$1",[callHash]);
  await client.query("COMMIT");
  res.status(200).type("application/xml; charset=utf-8")
   .set("Cache-Control","no-store")
   .send(responseXml(speak("Your private "+kind+" application was saved for Gavhah staff review. "+
    "It will not appear publicly. Your reference number is "+ref+". Thank you.")+"<Hangup/>"));
 }catch{
  await client.query("ROLLBACK").catch(()=>{});
  res.status(503).type("text/plain").send("Private voice intake could not be saved");
 }finally{client.release();}
}

// Normalization and protected number list are shared with admin preflight.
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
 const privateRecording=typeof form.RecordingUrl==="string"&&form.RecordingUrl.length>0;
 if(isProtectedSignalWireNumber(called)){
  // Defense in depth: even a stale or corrupted staging row must not answer
  // calls belonging to the owner's separate SignalWire application.
  res.status(403).type("text/plain").send("This number is reserved for another system");
  return;
 }
 if(!/^[A-Za-z0-9_.:-]{8,160}$/.test(callId)||
    !/^\+?[0-9]{7,15}$/.test(called)||
    (digit!==undefined&&!/^[0-9]{0,16}$/.test(digit)&&!(privateRecording&&digit==="#"))){
  res.status(400).type("text/plain").send("Invalid telephone call input");
  return;
 }
 const r=await pool.query(
  "SELECT provider_kind,candidate_number,stage,generation,callback_hash "+
  "FROM public.gavhah_hotline_migration WHERE id=1");
 const config=r.rows[0];
 if(config?.provider_kind!=="signalwire"||config.stage!=="testing"||
    normalizedSignalWireNumber(String(config.candidate_number||""))!==normalizedSignalWireNumber(called)||
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
 if(privateRecording){
  await savePrivateSignalWireFormRecording(res,form,
   createHmac("sha256",entryKey).update(callId).digest("hex"));
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
  body:{ApiCallId:callId,entryKey,signalwireProvider:"gavhah",...(digit===undefined?{}:{signalwireDigits:digit})},
  query:{}
 } as unknown as Request;
 await handleYemotApp(proxyRequest,capture,phoneTree);
 if(status!==200){
  res.status(status).type("text/plain").send("Gavhah phone access unavailable");
  return;
 }
 const current=await pool.query<{path:string}>(
  "SELECT path FROM public.gavhah_yemot_call_states WHERE call_hash=$1",
  [createHmac("sha256",entryKey).update(callId).digest("hex")]);
 const allowRecording=/^97039[34]$/.test(current.rows[0]?.path||"");
 res.status(200).type("application/xml; charset=utf-8")
  .set("Cache-Control","no-store").send(convertGavhahReplyToCxml(providerReply,SIGNALWIRE_URL,false,null,false,null,allowRecording));
}
