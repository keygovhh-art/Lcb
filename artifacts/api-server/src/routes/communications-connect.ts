import { Router } from "express";
import { db } from "@workspace/db";
import { and,eq } from "drizzle-orm";
import { getSessionUserId,requireAuth } from "../middlewares/auth";
import { maxPledges,maxReceipts } from "@workspace/db/schema";

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
 const result=await response.json().catch(()=>({}));
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
router.get("/askanus/connect/assignments",requireAuth,endpoint(async(req,res)=>{
 const uid=getSessionUserId(req)!;
 const campaignId=String(req.query.campaignId||"");
 if(!/^[a-f0-9-]{36}$/i.test(campaignId)){res.status(400).json({error:"Invalid campaign"});return;}
 const result=await remote("/assignments?gavhahUserId="+uid+"&campaignId="+encodeURIComponent(campaignId),"GET");
 res.setHeader("Cache-Control","private, no-store");
 res.json(result);
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
export default router;
