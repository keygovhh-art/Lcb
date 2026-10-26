import {createHmac,timingSafeEqual} from "node:crypto";
import {pool} from "@workspace/db";
import type {Request,Response} from "express";

// This bridge carries NO user credentials, notes, caller-ID numbers or
// membership records across Gavhah and Campaign Center. An authenticated
// Yemot /4444 callback is forwarded as a signed DTMF-only request to the
// independently authenticated Campaign Center service.
const SERVICE="https://gavhah-campaign-center.onrender.com/api/yemot/gavhah-bridge";
const textReply=(res:Response,msg:string)=>{
 const speech=msg.replace(/[^ -~]/g," ").replace(/[&=,#;\r\n]/g," ").slice(0,270);
 res.type("text/plain; charset=utf-8").set("Cache-Control","no-store")
  .send("id_list_message=t-"+speech);
};
export async function forwardCampaign4444(req:Request,res:Response):Promise<void>{
 const shared=process.env.CC_GAVHAH_BRIDGE_SECRET||"";
 if(shared.length<40){res.status(503);textReply(res,"Campaign Center connection is not configured.");return;}
 const installed=(await pool.query(
  "SELECT enabled FROM public.gavhah_yemot_global WHERE id=1"
 )).rows[0]?.enabled;
 const status=(await pool.query(
  "SELECT provider_summary #>> '{campaign4444,state}' AS status FROM public.gavhah_yemot_ivr_install WHERE id=1"
 )).rows[0]?.status;
 if(!installed||status!=="live"){res.status(503);textReply(res,"Campaign Center telephone extension is not enabled.");return;}
 const enc=process.env.YEMOT_ENCRYPTION_KEY||"";
 const key=Buffer.from(enc,"base64");
 if(key.length!==32||key.toString("base64")!==enc){res.status(503);textReply(res,"Phone security settings are unavailable.");return;}
 const incoming=String(req.body?.entryKey??req.query.entryKey??"");
 if(!/^[a-f0-9]{64}$/.test(incoming)){res.status(403).type("text/plain").send("Access denied");return;}
 const authorized=createHmac("sha256",key).update("gavhah-campaign-4444-callback-v1").digest("hex");
 if(!timingSafeEqual(Buffer.from(authorized,"hex"),Buffer.from(incoming,"hex"))){
  res.status(403).type("text/plain").send("Access denied");return;
 }
 const call=String(req.body?.ApiCallId??req.query.ApiCallId??"");
 if(!/^[A-Za-z0-9_.:-]{8,160}$/.test(call)){
  textReply(res,"Please call back. The provider call identifier was not received.");return;
 }
 const entries=Object.entries({...req.query,...req.body}).filter(([name])=>/^(?:iv|ln)\d{1,5}$/.test(name));
 if(entries.length>1){res.status(400);textReply(res,"Invalid keypad input. Please call back.");return;}
 const [field,entered]=entries[0]||["",""];
 const value=typeof entered==="string"?entered:"";
 if(!/^\d{0,8}$/.test(value)){res.status(400);textReply(res,"Invalid keypad input. Please call back.");return;}
 const stamp=Date.now();
 const signed=[stamp,call,field,value].join("|");
 const signature=createHmac("sha256",shared).update(signed).digest("hex");
 try{
  const response=await fetch(SERVICE,{
   method:"POST",headers:{"Content-Type":"application/json","Accept":"text/plain",
     "X-CC-Bridge-Signature":signature},
   body:JSON.stringify({call,key:field,value,stamp}),
   redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error("Campaign Center rejected bridge request");
  const reply=await response.text();
  if(reply.length>1400||!/^read=t-[\x20-\x7e]{1,1200}=(?:iv|ln)\d{1,5},no,\d{1,2},\d{1,2},\d{1,2},No,no$/.test(reply))
   throw Error("Invalid Campaign Center IVR response");
  res.type("text/plain; charset=utf-8").set("Cache-Control","no-store").send(reply);
 }catch{
  // Deliberately never fallback to Gavhah's independent private call state.
  // That would leak identity or misalign private DTMF paths.
  textReply(res,"Campaign Center is temporarily unavailable. Please try again shortly.");
 }
}
