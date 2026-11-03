import {createHmac,timingSafeEqual} from "node:crypto";
import type {Request,Response} from "express";
import {pool} from "@workspace/db";
import {checkSignalWireSignature} from "./signalwire-next-hotline";

/**
 * Olam Chesed Communication ONLY. This does not reuse the Gavhah replacement
 * telephone project's verified API key and does not touch Yemot or 4444.
 * All billable calls require explicit provider credentials, verified agent
 * callback numbers and a live membership / opt-out / country check.
 * Telephone flow: desk click -> verified agent's phone rings -> on pickup,
 * provider automatically calls the target -> both legs bridge without audio
 * recording. The browser never holds a privileged SignalWire token.
 */
type Config={
 space:string;project:string;token:string;from:string;signingKey:string;
 publicBase:string;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const e164=/^\+1[2-9]\d{2}[2-9]\d{6}$/;
const sid=/^[a-zA-Z0-9_.:-]{8,160}$/;
const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
function cfg():Config|null{
 if(process.env.OLAM_SIGNALWIRE_CALLING_ENABLED!=="true")return null;
 const space=String(process.env.OLAM_SIGNALWIRE_SPACE||"").toLowerCase();
 const project=String(process.env.OLAM_SIGNALWIRE_PROJECT_ID||"");
 const token=String(process.env.OLAM_SIGNALWIRE_API_TOKEN||"");
 const from=String(process.env.OLAM_SIGNALWIRE_FROM||"");
 const signingKey=String(process.env.OLAM_SIGNALWIRE_SIGNING_KEY||"");
 const base=String(process.env.OLAM_SIGNALWIRE_CALLBACK_BASE||"");
 if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.signalwire\.com$/.test(space)||
    !uuid.test(project)||token.length<24||!e164.test(from)||signingKey.length<32)return null;
 try{
  const u=new URL(base);
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||
     !["gavhah-cloudflare-native.keygovhh.workers.dev","gavhah.onrender.com"].includes(u.hostname))return null;
  return {space,project,token,from,signingKey,publicBase:u.origin};
 }catch{return null;}
}
function callUrl(c:Config,path:string){
 return "https://"+c.space+"/api/laml/2010-04-01/Accounts/"+encodeURIComponent(c.project)+path;
}
function authenticated(c:Config){return "Basic "+Buffer.from(c.project+":"+c.token).toString("base64")}
function hash(c:Config,id:string,part:string){
 return createHmac("sha256",c.signingKey).update("olam-max-outbound-20261103:"+id+":"+part).digest("hex");
}
function callback(c:Config,sessionId:string,part:"bridge"|"agent"|"donor"){
 const path=part==="bridge"?"/api/signalwire/max/bridge/"+sessionId:
  "/api/signalwire/max/status/"+sessionId+"/"+part;
 return c.publicBase+path+"?mac="+hash(c,sessionId,part);
}
const apiJson=async(c:Config,path:string)=>{
 const response=await fetch("https://"+c.space+path,{
  headers:{Authorization:authenticated(c),Accept:"application/json"},
  signal:AbortSignal.timeout(9000),redirect:"error",cache:"no-store"
 });
 if(!response.ok)throw Object.assign(Error("SignalWire number lookup unavailable"),{status:502});
 return response.json() as Promise<any>;
};
async function providerNumberCheck(c:Config,number:string,country:"US"|"CA"){
 const info=await apiJson(c,"/api/relay/rest/lookup/phone_number/"+encodeURIComponent(number));
 if(info?.valid_number!==true||info?.e164!==number||info?.country_code!==country)
  throw Object.assign(Error("SignalWire could not verify US/Canada destination"),{status:409});
}
async function agent(userId:number){
 const r=await pool.query<{phone_e164:string}>(
  "SELECT p.phone_e164 FROM public.gavhah_olam_signalwire_agent_numbers p "+
  "JOIN public.gavhah_olam_chesed_access a ON a.user_id=p.user_id "+
  "WHERE p.user_id=$1 AND p.revoked_at IS NULL AND p.verified_at IS NOT NULL "+
  "AND a.status='linked'",[userId]);
 return r.rows[0]?.phone_e164||null;
}
export async function signalwireMaxReadyForUser(userId:number):Promise<boolean>{
 if(!cfg())return false;
 try{return !!await agent(userId)}catch{return false}
}
type CallRow={
 id:string;user_id:number;number_e164:string;destination_country:string;
 status:string;cc_campaign_id:string|null;cc_contact_id:string|null;
 provider_call_id:string|null;
};
export async function placeOlamMaxOutboundCall(userId:number,sessionId:string,
 authorizeCampaign:(uid:number,cid:string,contact:string)=>Promise<{phone:string;authorized:boolean}>){
 const c=cfg();
 if(!c)throw Object.assign(Error("The dedicated Olam SignalWire calling account is not active"),{status:503});
 if(!/^\d{1,18}$/.test(sessionId))throw Object.assign(Error("Invalid prepared call"),{status:400});
 const target=await pool.query<CallRow>(
  "SELECT id::text,user_id,number_e164,destination_country,status,cc_campaign_id::text,cc_contact_id::text,provider_call_id "+
  "FROM public.max_call_sessions WHERE id=$1 AND user_id=$2",[sessionId,userId]);
 const row=target.rows[0];
 if(!row||row.status!=="prepared")throw Object.assign(Error("Call is missing or already claimed"),{status:409});
 const callbackPhone=await agent(userId);
 if(!callbackPhone||!e164.test(callbackPhone))throw Object.assign(Error("Your verified callback telephone is missing"),{status:403});
 if(row.number_e164===callbackPhone)throw Object.assign(Error("Cannot call the verified agent's own number"),{status:409});
 if(!e164.test(row.number_e164)||!["US","CA"].includes(row.destination_country))
  throw Object.assign(Error("Invalid outbound number"),{status:400});
 if(row.cc_campaign_id||row.cc_contact_id){
  if(!row.cc_campaign_id||!row.cc_contact_id)
   throw Object.assign(Error("Missing Campaign Center contact ownership"),{status:409});
  const valid=await authorizeCampaign(userId,row.cc_campaign_id,row.cc_contact_id);
  const normalized=String(valid.phone||"").replace(/\D/g,"");
  if(!valid.authorized||normalized.slice(-10)!==row.number_e164.slice(-10))
   throw Object.assign(Error("Campaign Center changed this contact or revoked access"),{status:409});
 }
 const dnc=await pool.query(
  "SELECT 1 FROM public.communication_contacts WHERE user_id=$1 AND do_not_call=true "+
  "AND RIGHT(regexp_replace(phone,'[^0-9]','','g'),10)=$2 LIMIT 1",
  [userId,row.number_e164.slice(-10)]);
 if(dnc.rowCount)throw Object.assign(Error("Number is on the Do Not Call list"),{status:409});
 const recent=await pool.query(
  "SELECT COUNT(*)::int AS n FROM public.max_call_sessions WHERE user_id=$1 "+
  "AND status IN ('initiating','ringing','in_progress') AND id<>$2",[userId,sessionId]);
 if(recent.rows[0]?.n>0)throw Object.assign(Error("Another calling session is active"),{status:409});
 // Verify actual ISO country, not merely NANP +1 (which spans territories).
 await providerNumberCheck(c,row.number_e164,row.destination_country as "US"|"CA");
 // Atomic exactly-once transition: provider calls are never auto-retried.
 const claimed=await pool.query(
  "UPDATE public.max_call_sessions SET status='initiating',started_at=now(),updated_at=now() "+
  "WHERE id=$1 AND user_id=$2 AND status='prepared' RETURNING id",[sessionId,userId]);
 if(!claimed.rowCount)throw Object.assign(Error("Call was already initiated"),{status:409});
 const body=new URLSearchParams({
  To:callbackPhone,From:c.from,Url:callback(c,sessionId,"bridge"),Method:"POST",
  StatusCallback:callback(c,sessionId,"agent"),StatusCallbackMethod:"POST",
  StatusCallbackEvent:"initiated ringing answered completed",Record:"false"
 });
 let response:globalThis.Response;
 try{
  response=await fetch(callUrl(c,"/Calls.json"),{
   method:"POST",headers:{Authorization:authenticated(c),
    "Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},
   body,redirect:"error",signal:AbortSignal.timeout(13000)
  });
 }catch{
  // A timeout may mean the provider DID place the call; don't free it for retry.
  throw Object.assign(Error("SignalWire response uncertain; check the provider before retrying"),{status:503});
 }
 if(!response.ok){
  // Only a definite provider rejection permits moving out of 'initiating'.
  if(response.status>=400&&response.status<500){
   await pool.query("UPDATE public.max_call_sessions SET status='failed',updated_at=now() "+
    "WHERE id=$1 AND user_id=$2 AND status='initiating' AND provider_call_id IS NULL",[sessionId,userId]);
  }
  throw Object.assign(Error("SignalWire rejected the outbound agent call"),{status:response.status>=500?503:409});
 }
 const result:unknown=await response.json().catch(()=>null);
 const object=result&&typeof result==="object"&&!Array.isArray(result)?result as {sid?:unknown;id?:unknown}:{};
 const callId=String(object.sid||object.id||"");
 if(!sid.test(callId))throw Object.assign(Error("Provider accepted request without a valid call ID; check account"),{status:503});
 await pool.query(
  "UPDATE public.max_call_sessions SET provider_call_id=$1,status='ringing',updated_at=now() "+
  "WHERE id=$2 AND user_id=$3 AND status IN ('initiating','ringing') AND "+
  "(provider_call_id IS NULL OR provider_call_id=$1)",[callId,sessionId,userId]);
 return {dialInitiated:true,providerReady:true,callIdPresent:true,agentPhoneEnding:callbackPhone.slice(-4),
  recordingEnabled:false,message:"SignalWire is calling your verified phone. The donor will dial when you answer."};
}
async function verifiedWebhook(req:Request,res:Response,part:"bridge"|"agent"|"donor"){
 const c=cfg();
 if(!c){res.sendStatus(503);return null;}
 const id=String(req.params.id||"");
 const mac=String(req.query.mac||"");
 const form=req.body;
 if(req.method!=="POST"||!/^\d{1,18}$/.test(id)||!/^[a-f0-9]{64}$/.test(mac)||
    !timingSafeEqual(Buffer.from(mac,"hex"),Buffer.from(hash(c,id,part),"hex"))){
  res.sendStatus(403);return null;
 }
 const exact=callback(c,id,part);
 const signature=String(req.get("x-signalwire-signature")||req.get("x-twilio-signature")||"");
 if(!checkSignalWireSignature(c.signingKey,signature,exact,form)){
  res.sendStatus(403);return null;
 }
 const row=(await pool.query<CallRow>(
  "SELECT id::text,user_id,number_e164,destination_country,status,cc_campaign_id::text,cc_contact_id::text,provider_call_id "+
  "FROM public.max_call_sessions WHERE id=$1",[id])).rows[0];
 if(!row||!["initiating","ringing","in_progress","completed","failed","busy","no_answer"].includes(row.status)){
  res.sendStatus(404);return null;
 }
 return {c,row,form:form as Record<string,string>};
}
export async function signalwireMaxAgentBridge(req:Request,res:Response){
 const v=await verifiedWebhook(req,res,"bridge");
 if(!v)return;
 const callId=String(v.form.CallSid||"");
 if(!sid.test(callId)||v.row.provider_call_id&&v.row.provider_call_id!==callId){
  res.sendStatus(403);return;
 }
 const updated=await pool.query(
  "UPDATE public.max_call_sessions SET provider_call_id=COALESCE(provider_call_id,$1),status='in_progress',updated_at=now() "+
  "WHERE id=$2 AND status IN ('initiating','ringing','in_progress') AND "+
  "(provider_call_id IS NULL OR provider_call_id=$1) RETURNING number_e164",
  [callId,v.row.id]);
 if(!updated.rowCount){res.sendStatus(409);return;}
 const target=updated.rows[0].number_e164;
 const donorCallback=callback(v.c,v.row.id,"donor");
 const cxml='<?xml version="1.0" encoding="UTF-8"?><Response>'+
  '<Say voice="man">Connecting your assigned call.</Say>'+
  '<Dial callerId="'+esc(v.c.from)+'" record="do-not-record" timeout="35">'+
  '<Number statusCallback="'+esc(donorCallback)+'" statusCallbackEvent="initiated ringing answered completed" '+
  'statusCallbackMethod="POST">'+esc(target)+'</Number></Dial><Hangup/></Response>';
 res.status(200).type("application/xml; charset=utf-8").set("Cache-Control","no-store").send(cxml);
}
export async function signalwireMaxCallStatus(req:Request,res:Response){
 const part=String(req.params.part||"");
 if(part!=="agent"&&part!=="donor"){res.sendStatus(404);return;}
 const v=await verifiedWebhook(req,res,part);
 if(!v)return;
 if(part==="agent"&&v.row.provider_call_id&&
    v.form.CallSid!==v.row.provider_call_id){res.sendStatus(403);return;}
 const state=String(v.form.CallStatus||"").toLowerCase();
 const updates:Record<string,string>={"queued":"ringing","initiated":"ringing","ringing":"ringing",
  "in-progress":"in_progress","answered":"in_progress","completed":"completed",
  "busy":"busy","no-answer":"no_answer","failed":"failed","canceled":"canceled"};
 const final=new Set(["completed","busy","no_answer","failed","canceled"]);
 const result=updates[state];
 if(!result){res.sendStatus(200);return;}
 if(part==="donor"){
  if(result==="in_progress"){
   await pool.query("UPDATE public.max_call_sessions SET status='in_progress',answered_at=COALESCE(answered_at,now()),"+
    "updated_at=now() WHERE id=$1 AND status IN ('initiating','ringing','in_progress')",[v.row.id]);
  }else if(final.has(result)){
   const secs=Number(v.form.CallDuration??v.form.Duration??NaN);
   await pool.query("UPDATE public.max_call_sessions SET status=$2,ended_at=now(),"+
    "duration_seconds=CASE WHEN $3::integer IS NOT NULL THEN $3 ELSE duration_seconds END,updated_at=now() "+
    "WHERE id=$1 AND status NOT IN ('completed','failed','no_answer','busy','canceled')",
    [v.row.id,result,Number.isSafeInteger(secs)&&secs>=0?secs:null]);
  }
 }else if(final.has(result)){
  // The agent leg may finish while the donor never answered. Do not invent
  // donor duration or a successful donor conversation.
  await pool.query("UPDATE public.max_call_sessions SET status=CASE WHEN answered_at IS NOT NULL THEN 'completed' ELSE $2 END,"+
   "ended_at=COALESCE(ended_at,now()),updated_at=now() "+
   "WHERE id=$1 AND status NOT IN ('completed','failed','no_answer','busy','canceled')",
   [v.row.id,result]);
 }else if(result==="ringing"){
  await pool.query("UPDATE public.max_call_sessions SET status='ringing',updated_at=now() "+
   "WHERE id=$1 AND status='initiating'",[v.row.id]);
 }
 res.status(200).json({received:true});
}
