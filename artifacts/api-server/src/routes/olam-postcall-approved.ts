import {Router} from "express";
import {pool} from "@workspace/db";
import {requireAuth,getSessionUserId} from "../middlewares/auth";

/**
 * Shared post-call intake for Olam MAX; website and verified phone handlers
 * save to same max_call_sessions record. Never guesses a purpose for INBOUND.
 */
const router=Router();
router.use("/askanus/max/calling/approved/postcall",requireAuth);
const valid=(x:unknown)=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const limit=(x:unknown,n:number)=>String(x??"").trim().slice(0,n);
router.get("/askanus/max/calling/approved/postcall/:id",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!valid(id)){res.sendStatus(400);return;}
  const row=(await pool.query(
   "SELECT id,number_e164,contact_id,direction,case_id,outcome,purpose_type,purpose_key "+
   "FROM public.max_call_sessions WHERE id=$1 AND user_id=$2",[id,uid])).rows[0];
  if(!row){res.sendStatus(404);return;}
  const r=await pool.query(
   "SELECT count(*)::int AS previous FROM public.max_call_sessions "+
   "WHERE user_id=$1 AND number_e164=$2 AND id<>$3 AND status<>'prepared'",[uid,row.number_e164,id]);
  const repeat=Number(r.rows[0]?.previous||0)>0;
  res.set("Cache-Control","private,no-store").json({
   call:row,repeat,previousCalls:Number(r.rows[0]?.previous||0),
   prompt:repeat
    ?"אויב איר ווילט אריינלייגן א נייע סטאטוס פארן יעצטיגן קאל דרוקט 1. אויב דאס איז אן אנדערער צוועק דרוקט 2. צו לאזן די אלטע סטאטוסן און נישט אריינלייגן דרוקט שארף."
    :"צו אריינלייגן א קאל־רעזולטאט דרוקט 1. צו באשטימען דעם צוועק דרוקט 2. צו איבערהיפן דרוקט שארף.",
   options:{"1":"new_status","2":"different_purpose","#":"skip"},
   incomingRequiresExplicitPurpose:row.direction==="inbound",missingResponseIsNotMissedCall:true
  });
 }catch(e){next(e);}
});
router.post("/askanus/max/calling/approved/postcall/:id/decision",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!valid(id)){res.sendStatus(400);return;}
  const old=(await pool.query(
   "SELECT id,case_id,direction,purpose_type,purpose_key,report_details "+
   "FROM public.max_call_sessions WHERE id=$1 AND user_id=$2",[id,uid])).rows[0];
  if(!old){res.sendStatus(404);return;}
  const decision=limit(req.body?.decision,24);
  if(!["new_status","different_purpose","skip"].includes(decision)){
   res.status(400).json({error:"Choose new_status / different_purpose / skip"});return;
  }
  let pt=old.purpose_type||"none",pk=old.purpose_key||null,caseId=old.case_id;
  if(decision==="different_purpose"){
   pt=limit(req.body?.purposeType||"none",20),pk=limit(req.body?.purposeKey,80)||null;
   if(!["none","case","project"].includes(pt)){res.status(409).json({error:"A selected campaign needs verified Campaign Connect membership"});return;}
   if(pt==="none"){pk=null;caseId=null;}
   else if(!valid(pk)){res.status(400).json({error:"Select a case or personal project by its ID"});return;}
   else {
    const r=await pool.query("SELECT id FROM public.askanus_cases WHERE id=$1 AND user_id=$2",[pk,uid]);
    if(!r.rowCount){res.sendStatus(404);return;}
    caseId=Number(pk);
   }
  }
  // No fallback to lastCaseId, not even when the member used a campaign earlier.
  if(old.direction==="inbound"&&decision!=="different_purpose"&&
     !(old.purpose_type&&old.purpose_type!=="none")){
   pt="none";pk=null;caseId=null;
  }
  const details={...old.report_details,
   postCallDecision:decision,
   entryStatus:decision==="skip"?"not_entered":"awaiting_answer",
   selectedExplicitly:decision==="different_purpose"&&pt!=="none"};
  // A skipped answer must never turn into actual "no_answer".
  await pool.query(
   "UPDATE public.max_call_sessions SET case_id=$1,purpose_type=$2,purpose_key=$3,report_details=$4::jsonb,updated_at=now() "+
   "WHERE id=$5 AND user_id=$6",
   [caseId,pt,pk,JSON.stringify(details),id,uid]);
  res.json({saved:true,purposeType:pt,purposeKey:pk,entryStatus:details.entryStatus,
   previousStatusesPreserved:true,autoSelectedPurpose:false,
   missedCallStatusChanged:false});
 }catch(e){next(e);}
});
router.post("/askanus/max/calling/approved/postcall/:id/name",async(req,res,next)=>{
 try{
  const uid=getSessionUserId(req)!,id=Number(req.params.id);
  if(!valid(id)){res.sendStatus(400);return;}
  const c=(await pool.query(
   "SELECT contact_id FROM public.max_call_sessions WHERE id=$1 AND user_id=$2",[id,uid])).rows[0];
  if(!c){res.sendStatus(404);return;}
  // Phone prompt: "לייגט אריין דעם נאמען און דרוקט #; צו סקיפן דרוקט גלייך #".
  // # supplies an empty name, which is permitted and never erases an old one.
  const name=limit(req.body?.name,180);
  if(!name){res.json({skipped:true,contactNameUnchanged:true});return;}
  if(!c.contact_id){res.status(409).json({error:"Number has no contact yet; complete call report first"});return;}
  const q=await pool.query(
   "UPDATE public.communication_contacts SET name=$1,updated_at=now() "+
   "WHERE id=$2 AND user_id=$3 AND name='' RETURNING contact_ref,name",
   [name,c.contact_id,uid]);
  res.json({saved:!!q.rowCount,existingNamePreserved:!q.rowCount,contact:q.rows[0]||null});
 }catch(e){next(e);}
});
export default router;
