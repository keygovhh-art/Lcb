import { Router } from "express";
import { db,pool } from "@workspace/db";
import { and,eq } from "drizzle-orm";
import { getSessionUserId,requireAuth } from "../middlewares/auth";
import { maxPledges,maxReceipts,maxReceiptRefunds,askanuscases,caseFollowups } from "@workspace/db/schema";

// This service is a client of Campaign Center, never a second store of team data.
// Calls originate from the Gavhah API, never the browser. Secrets stay server-side.
const router=Router();
function setup(){
 const base=process.env.GAVHAH_CONNECT_BASE_URL||"";
 const secret=process.env.GAVHAH_CONNECT_SHARED_SECRET||"";
 if(!base||secret.length<32)return null;
 try{
  const url=new URL(base);
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)return null;
  return {url,secret};
 }catch{return null;}
}
async function remote(path:string,method:"GET"|"POST",body?:object){
 const conf=setup();
 if(!conf)throw Object.assign(new Error("Campaign Connect is not configured"),{status:503});
 const url=new URL("/api/connect/service"+path,conf.url);
 const response=await fetch(url,{
  method,
  signal:AbortSignal.timeout(9000),
  headers:{"x-gavhah-connect-secret":conf.secret,...(body?{"content-type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
 });
 const parsed:unknown=await response.json().catch(()=>({}));
 const result:Record<string,unknown>=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};
 if(!response.ok){
  // Never return a remote backend's stack trace or secrets to browsers.
  const known=[400,403,404,409,429,503].includes(response.status)?response.status:502;
  throw Object.assign(new Error(typeof result?.error==="string"?result.error:"Campaign Connect service unavailable"),{status:known});
 }
 return result;
}
const asNumber=(value:unknown)=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
const endpoint=(fn:(req:any,res:any)=>Promise<void>)=>{
 return async(req:any,res:any)=>{
  try{await fn(req,res);}catch(e){
   const status=typeof (e as any)?.status==="number"?(e as any).status:502;
   res.status(status).json({error:status===502?"Campaign Connect service unavailable":String((e as Error)?.message||"Connection error")});
  }
 };
};
// Authenticated and read-only: prove the CC server, shared secret and DB
// understand the same bridge protocol. This is NOT proof of account linking.
router.get("/askanus/connect/diagnostics",requireAuth,endpoint(async(_req,res)=>{
 const configured=Boolean(setup());
 res.setHeader("Cache-Control","private, no-store");
 if(!configured){res.json({configured:false,remoteReachable:false,protocolCompatible:false});return;}
 try{
  const data=await remote("/capabilities","GET");
  const compatible=data.service==="campaign_center"&&
    data.protocol==="gavhah-connect-v1"&&data.connectedBackend===true;
  res.json({configured:true,remoteReachable:true,protocolCompatible:compatible,
   features:compatible?{
    ownAssignments:data.ownAssignments===true,
    manualFinanceShare:data.manualFinanceShare===true,
    scopedSharedFollowups:data.scopedSharedFollowups===true,
    scopedLiveRooms:data.scopedLiveRooms===true
   }:{}});
 }catch{
  // No upstream stack, secret, URL, or private data leaks to browser.
  res.json({configured:true,remoteReachable:false,protocolCompatible:false});
 }
}));
router.get("/askanus/connect/status",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 if(!setup()){res.json({configured:false,linked:false,campaigns:[]});return;}
 try{
  const result=await remote("/campaigns?gavhahUserId="+encodeURIComponent(String(uid)),"GET");
  res.setHeader("Cache-Control","private, no-store");
  res.json({configured:true,...result});
 }catch(e){
  if((e as any)?.status===403){res.json({configured:true,linked:false,campaigns:[]});return;}
  throw e;
 }
}));
router.post("/askanus/connect/redeem",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const code=String(req.body?.code||"").trim();
 if(!/^[A-Za-z0-9_-]{32}$/.test(code)){res.status(400).json({error:"Invalid single-use link code"});return;}
 const result=await remote("/redeem","POST",{gavhahUserId:uid,code});
 res.json(result);
}));
router.post("/askanus/connect/unlink",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const result=await remote("/unlink","POST",{gavhahUserId:uid});
 res.json(result);
}));
// Read-only virtual campaign hall schedule for the linked MAX user.
// Opening the URL separately requires Campaign Center Neon Auth membership.
router.get("/askanus/connect/rooms",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const campaignId=String(req.query.campaignId||"");
 if(!/^[a-f0-9-]{36}$/i.test(campaignId)){res.status(400).json({error:"Invalid campaign"});return;}
 const result=await remote("/rooms?gavhahUserId="+uid+"&campaignId="+encodeURIComponent(campaignId),"GET");
 const base=String(process.env.GAVHAH_CONNECT_BASE_URL||"").replace(/\/+$/,"");
 let origin="";
 try{const url=new URL(base);if(url.protocol==="https:")origin=url.origin;}catch{}
 res.setHeader("Cache-Control","private, no-store");
 const roomItems=Array.isArray(result.rooms)?result.rooms as Array<{id:string;title:string;room_status:string;floor_mode:string;live_program?:string|null;next_program_at?:string|null}>:[];
 res.json({mode:result.mode,rooms:roomItems.map(r=>({
  ...r,openUrl:origin?origin+"/?campaign="+encodeURIComponent(campaignId)+"&hall="+encodeURIComponent(r.id):null
 }))});
}));
router.get("/askanus/connect/assignments",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const campaignId=String(req.query.campaignId||"");
 if(!/^[a-f0-9-]{36}$/i.test(campaignId)){res.status(400).json({error:"Invalid campaign"});return;}
 const result=await remote("/assignments?gavhahUserId="+uid+"&campaignId="+encodeURIComponent(campaignId),"GET");
 res.setHeader("Cache-Control","private, no-store");
 res.json(result);
}));
// Update exactly ONE assigned Campaign Center task, without cloning the task into
// MAX or allowing access to another person's campaign work.
router.post("/askanus/connect/assignments/:id/status",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const taskId=String(req.params.id||"");
 const campaignId=String(req.body?.campaignId||"");
 const status=req.body?.status;
 if(!/^[a-f0-9-]{36}$/i.test(taskId)||!/^[a-f0-9-]{36}$/i.test(campaignId)||
   !["open","in_progress","done"].includes(status)){
  res.status(400).json({error:"Invalid assigned task update"});return;
 }
 const saved=await remote("/assignments/"+encodeURIComponent(taskId)+"/status","POST",{
  gavhahUserId:uid,campaignId,status
 });
 res.json(saved);
}));
router.post("/askanus/connect/share-followup",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const followupId=asNumber(req.body?.followupId);
 const campaignId=String(req.body?.campaignId||"");
 const shareScope=req.body?.shareScope==="assigned_managers"?"assigned_managers":"campaign";
 if(req.body?.confirmShare!==true||!followupId||!/^[a-f0-9-]{36}$/i.test(campaignId)){
  res.status(400).json({error:"Select a valid follow-up and confirm sharing"});return;
 }
 const owned=await db.select({id:caseFollowups.id}).from(caseFollowups)
  .innerJoin(askanuscases,eq(caseFollowups.caseId,askanuscases.id))
  .where(and(eq(caseFollowups.id,followupId),eq(askanuscases.userId,uid))).limit(1);
 if(!owned.length){res.status(404).json({error:"Your follow-up was not found"});return;}
 const result=await remote("/followups","POST",{
  gavhahUserId:uid,campaignId,followupId,shareScope
 });
 // Canonical MAX ID is linked, not duplicated; private note/time stays at its origin.
 res.status(result.duplicate?200:201).json({...result,source:"gavhah_max"});
}));
router.get("/askanus/connect/reversals",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 // Owner-only refund events, without exposing notes/other people's records.
 const rows=await db.select({
  id:maxReceiptRefunds.id,receiptId:maxReceiptRefunds.receiptId,amount:maxReceiptRefunds.amount,
  createdAt:maxReceiptRefunds.createdAt
 }).from(maxReceiptRefunds).where(eq(maxReceiptRefunds.userId,uid)).limit(300);
 res.setHeader("Cache-Control","private, no-store");
 res.json(rows.map(r=>({...r,amount:Number(r.amount)})));
}));
router.post("/askanus/connect/share-reversal",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const refundId=asNumber(req.body?.refundId);
 const campaignId=String(req.body?.campaignId||"");
 if(req.body?.confirmShare!==true||!refundId||!/^[a-f0-9-]{36}$/i.test(campaignId)){
  res.status(400).json({error:"Choose a valid reversal and explicitly confirm sharing"});return;
 }
 const refund=(await db.select().from(maxReceiptRefunds)
  .where(and(eq(maxReceiptRefunds.id,refundId),eq(maxReceiptRefunds.userId,uid))).limit(1))[0];
 if(!refund){res.status(404).json({error:"This reversal is not yours"});return;}
 const receipt=(await db.select().from(maxReceipts)
  .where(and(eq(maxReceipts.id,refund.receiptId),eq(maxReceipts.userId,uid))).limit(1))[0];
 if(!receipt)throw Object.assign(new Error("Original receipt not found"),{status:404});
 const result=await remote("/finance-reversals","POST",{
  gavhahUserId:uid,campaignId,originalReceiptId:receipt.id,refundId:refund.id,
  amount:Number(refund.amount).toFixed(2)
 });
 res.status(result.duplicate?200:201).json({...result,note:"Accounting correction only. No card/bank refund executed."});
}));
router.post("/askanus/connect/share-finance",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const kind=req.body?.kind,entityId=asNumber(req.body?.eventId),campaignId=String(req.body?.campaignId||"");
 if(req.body?.confirmShare!==true||!["pledge","receipt"].includes(kind)||!entityId
    || !/^[a-f0-9-]{36}$/i.test(campaignId)){
  res.status(400).json({error:"Select a valid event and confirm sharing with a campaign"});return;
 }
 // Never accept client-supplied amount, owner, verification status or contact notes.
 const owned=kind==="pledge"
  ?(await db.select().from(maxPledges).where(and(eq(maxPledges.id,entityId),eq(maxPledges.userId,uid))))[0]
  :(await db.select().from(maxReceipts).where(and(eq(maxReceipts.id,entityId),eq(maxReceipts.userId,uid))))[0];
 if(!owned){res.status(404).json({error:"Personal finance event not found"});return;}
 if(kind==="receipt"&&Number((owned as typeof maxReceipts.$inferSelect).refundedAmount)>0){
  res.status(409).json({error:"Receipt has a reversal; reconcile it before campaign sharing"});return;
 }
 const amount=Number(owned.amount).toFixed(2);
 if(!(Number(amount)>0)){res.status(409).json({error:"Invalid stored event amount"});return;}
 const result=await remote("/finance-events","POST",{
  gavhahUserId:uid,campaignId,kind,amount,sourceEventKey:kind+":"+entityId
 });
 // No contact name, number, private note, personal case or voice file transmitted.
 res.status(result.duplicate?200:201).json({...result,
  note:"Only the event amount and source ID are shared. Receipts are manually reported, not processor verified."});
}));

// Only accounts explicitly joined to a Campaign Center campaign may see call assignments.
router.get("/askanus/connect/call-queue/campaigns",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 if(!setup()){res.setHeader("Cache-Control","private,no-store").json({eligible:false,configured:false,campaigns:[]});return;}
 try{
  const data=await remote("/call-queue/campaigns?gavhahUserId="+uid,"GET");
  res.setHeader("Cache-Control","private,no-store").json({configured:true,...data});
 }catch(e){
  if((e as any)?.status===403){res.json({configured:true,eligible:false,campaigns:[]});return;}
  throw e;
 }
}));
router.get("/askanus/connect/call-queue",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const campaignId=String(req.query.campaignId||"");
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId)){
  res.status(400).json({error:"Invalid campaign"});return;
 }
 const data=await remote("/call-queue?gavhahUserId="+uid+"&campaignId="+encodeURIComponent(campaignId),"GET");
 res.setHeader("Cache-Control","private,no-store").json(data);
}));
router.post("/askanus/connect/call-queue/next",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const campaignId=String(req.body?.campaignId||"");
 const country=req.body?.country;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId)||
    !["US","CA"].includes(country)){
  res.status(400).json({error:"Campaign and telephone country required"});return;
 }
 const data=await remote("/call-queue/next","POST",{gavhahUserId:uid,campaignId});
 const call=data.call as {id?:string;phone?:string;displayName?:string}|null;
 if(!call){res.json({call:null,prepared:null,dialInitiated:false});return;}
 const number=String(call.phone||"").replace(/[^\d]/g,"");
 const national=number.length===11&&number[0]==="1"?number.slice(1):number;
 const e164=/^[2-9]\d{2}[2-9]\d{6}$/.test(national)?"+1"+national:null;
 const ccContactId=String(call.id||"");
 if(!e164||!/^[0-9a-f-]{36}$/i.test(ccContactId)){
  // The remote claim expires automatically, but do not call any unsupported number.
  res.status(409).json({error:"Assigned number requires review before calling"});return;
 }
 // The Campaign Center validated team rights and claim under transaction.
 // Protect the private MAX owner's own opt-out list too.
 const blocked=await pool.query(
  "SELECT 1 FROM public.communication_contacts WHERE user_id=$1 AND do_not_call=true "+
  "AND right(regexp_replace(phone,'[^0-9]','','g'),10)=$2 LIMIT 1",
  [uid,national]);
 if(blocked.rowCount){res.status(409).json({error:"Number on your do-not-call list"});return;}
 const prepared=await pool.query(
  "INSERT INTO public.max_call_sessions(user_id,number_e164,destination_country,cc_campaign_id,cc_contact_id,cc_claimed_at) "+
  "VALUES($1,$2,$3,$4,$5,now()) "+
  "ON CONFLICT (user_id,cc_contact_id) WHERE cc_contact_id IS NOT NULL AND status='prepared' DO NOTHING RETURNING id,status",
  [uid,e164,country,campaignId,ccContactId]);
 const existing=prepared.rows[0]||(await pool.query(
  "SELECT id,status FROM public.max_call_sessions WHERE user_id=$1 AND cc_contact_id=$2 AND status='prepared' ORDER BY id DESC LIMIT 1",
  [uid,ccContactId])).rows[0];
 if(!existing){res.status(409).json({error:"Unable to prepare assigned call"});return;}
 res.setHeader("Cache-Control","private,no-store").json({
  call:{...call,phone:e164},prepared:{id:String(existing.id),status:existing.status},
  reused:!!data.reused,dialInitiated:false,recordingEnabled:false,
  message:"Campaign contact claimed and calling mode prepared; SignalWire dial must be verified before launch."
 });
}));
router.post("/askanus/connect/call-queue/:id/release",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const campaignId=String(req.body?.campaignId||"");
 if(!/^[0-9a-f-]{36}$/i.test(req.params.id)||!/^[0-9a-f-]{36}$/i.test(campaignId)){
  res.status(400).json({error:"Invalid campaign/lead ID"});return;
 }
 const running=await pool.query(
  "SELECT 1 FROM public.max_call_sessions WHERE user_id=$1 AND cc_contact_id=$2 "+
  "AND cc_campaign_id=$3 AND status IN ('initiating','ringing','in_progress') LIMIT 1",
  [uid,req.params.id,campaignId]);
 if(running.rowCount){res.status(409).json({error:"Finish or hang up your active call before releasing the campaign claim"});return;}
 const data=await remote("/call-queue/"+encodeURIComponent(req.params.id)+"/release","POST",{gavhahUserId:uid,campaignId});
 // Preserve call history; a cancelled PREPARED call does not become a recorded call.
 await pool.query(
  "UPDATE public.max_call_sessions SET status='canceled',updated_at=now() "+
  "WHERE user_id=$1 AND cc_contact_id=$2 AND cc_campaign_id=$3 AND status='prepared'",
  [uid,req.params.id,campaignId]);
 res.json(data);
}));
router.post("/askanus/connect/call-queue/:id/result",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const campaignId=String(req.body?.campaignId||"");
 const outcome=String(req.body?.outcome||"");
 const note=String(req.body?.note||"").slice(0,2000);
 if(!/^[0-9a-f-]{36}$/i.test(req.params.id)||!/^[0-9a-f-]{36}$/i.test(campaignId)||
    !["no_answer","spoke","callback","pledged","paid","not_interested","do_not_call"].includes(outcome)){
  res.status(400).json({error:"Invalid call outcome"});return;
 }
 const running=await pool.query(
  "SELECT 1 FROM public.max_call_sessions WHERE user_id=$1 AND cc_contact_id=$2 "+
  "AND cc_campaign_id=$3 AND status IN ('initiating','ringing','in_progress') LIMIT 1",
  [uid,req.params.id,campaignId]);
 if(running.rowCount){res.status(409).json({error:"Hang up the active SignalWire call before recording the outcome"});return;}
 // Save manual outcome in CC's canonical database; never imply a completed provider call.
 const data=await remote("/call-queue/"+encodeURIComponent(req.params.id)+"/result","POST",
  {gavhahUserId:uid,campaignId,outcome,note});
 res.json(data);
}));


// Internal server-only authorization. A browser cannot forge its own campaign
// membership or override a Campaign Center number on the outbound dial path.
export async function verifyMaxCampaignDialClaim(
 userId:number,campaignId:string,contactId:string
):Promise<{authorized:boolean;phone:string}>{
 if(!/^[a-f0-9-]{36}$/i.test(campaignId)||!/^[a-f0-9-]{36}$/i.test(contactId))
  throw Object.assign(Error("Invalid campaign calling claim"),{status:400});
 const result=await remote("/call-queue/"+encodeURIComponent(contactId)+"/authorize-dial","POST",{
  gavhahUserId:userId,campaignId
 });
 return {authorized:result.authorized===true,
   phone:typeof result.phone==="string"?result.phone:""};
}

export default router;
