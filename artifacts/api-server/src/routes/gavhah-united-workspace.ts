import {Router,type Request} from "express";
import {pool} from "@workspace/db";
import {requireAuth,requireAdmin,getSessionUserId} from "../middlewares/auth";
import {notifyUser,notifyStaff} from "../lib/notify";
import {
 centsFromUnknown,isoDay,requestKeyValid,newUnitedPledge,newUnitedDonationIntent,
 acceptPledgeIntoCase
} from "../lib/gavhah-united-participation";

const router=Router();
function trustedWrite(req:Request):boolean{
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(req.get("sec-fetch-site")==="cross-site"||!origin||!host)return false;
 try{const url=new URL(origin);return url.protocol==="https:"&&url.host===host;}catch{return false;}
}
function idNumber(value:unknown):number|null{
 const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;
}
function textOk(input:unknown,max=1200):input is string{
 return typeof input==="string"&&input.trim().length>0&&input.length<=max;
}
async function transaction<T>(fn:(client:import("pg").PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();
 try{await c.query("BEGIN");const val=await fn(c);await c.query("COMMIT");return val;}
 catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
}
function responseError(error:unknown):{code:number;message:string}{
 const msg=error instanceof Error?error.message:"Unexpected operation error";
 if(msg==="ACTIVE_CAUSE_NOT_FOUND")return {code:404,message:"Active United cause not found"};
 if(msg==="ACCOUNT_NOT_ACTIVE")return {code:403,message:"Member account inactive"};
 if(msg==="DUE_DATE_IN_PAST")return {code:400,message:"The deadline cannot be in the past"};
 if(msg==="REQUEST_KEY_CONFLICT")return {code:409,message:"This request key was used for another submission"};
 return {code:500,message:"Unable to complete the requested operation"};
}
router.post("/united/:causeId/pledges",requireAuth,async(req,res,next)=>{
 if(!trustedWrite(req)){res.sendStatus(403);return;}
 const causeId=idNumber(req.params.causeId),member=getSessionUserId(req);
 const cents=centsFromUnknown(req.body?.amount),dueOn=isoDay(req.body?.dueOn);
 const key=req.body?.requestKey;
 if(!causeId||!member||!cents||!dueOn||!requestKeyValid(key)){
  res.status(400).json({error:"Amount, valid YYYY-MM-DD deadline, and request key required"});return;
 }
 try{
  const item=await transaction(c=>newUnitedPledge(c,{
   causeId,userId:member,amountCents:cents,dueOn,requestKey:key,source:"web"
  }));
  if(!item.duplicate){
   await notifyUser(member,"united_bln",
    item.status==="pending_team"
     ?"Your BLN pledge is awaiting staff approval because the due date is more than two months away."
     :"Your BLN pledge is saved. It is NOT a payment or legally binding charge.",
    "/my?case="+item.caseId);
   await notifyStaff("New United BLN pledge "+item.pledgeId+
    (item.status==="pending_team"?" — needs approval":" — accepted within two months"),
    "/founder","united_pledge");
  }
  res.status(item.status==="pending_team"?202:201).json({...item,
   disclaimer:"BLN — an undertaking without a vow. No funds have been received or charged."});
 }catch(e){if(e instanceof Error&&["ACTIVE_CAUSE_NOT_FOUND","ACCOUNT_NOT_ACTIVE","DUE_DATE_IN_PAST","REQUEST_KEY_CONFLICT"].includes(e.message)){
  const v=responseError(e);res.status(v.code).json({error:v.message});return;
 }next(e);}
});
router.post("/united/:causeId/donate-now",requireAuth,async(req,res,next)=>{
 if(!trustedWrite(req)){res.sendStatus(403);return;}
 const causeId=idNumber(req.params.causeId),member=getSessionUserId(req);
 const amount=req.body?.amount==null||req.body?.amount===""?null:centsFromUnknown(req.body.amount);
 if(!causeId||!member||amount===null&&req.body?.amount!==undefined&&req.body?.amount!==null&&req.body?.amount!==""||
    !requestKeyValid(req.body?.requestKey)){
  res.status(400).json({error:"Invalid donation amount or request key"});return;
 }
 try{
  const item=await transaction(c=>newUnitedDonationIntent(c,{
   causeId,userId:member,amountCents:amount,requestKey:req.body.requestKey,source:"web"
  }));
  if(!item.duplicate){
   await notifyUser(member,"united_donation_intent",
    "Your donation instructions request is saved in My Askanus. Payment has NOT yet been processed.",
    "/my?case="+item.caseId);
   await notifyStaff("United donation instructions request #"+item.intentId,"/founder","united_donation_intent");
  }
  res.status(201).json({...item,paymentCollected:false,
   instructionsUrl:"/united",checkoutStatusUrl:"/api/cause-channels/united/checkout-status"});
 }catch(e){if(e instanceof Error&&["ACTIVE_CAUSE_NOT_FOUND","ACCOUNT_NOT_ACTIVE","REQUEST_KEY_CONFLICT"].includes(e.message)){
  const v=responseError(e);res.status(v.code).json({error:v.message});return;
 }next(e);}
});
router.get("/me/united/workspace",requireAuth,async(req,res,next)=>{
 try{
  const member=getSessionUserId(req)!;
  const [cases,pledges,donations,events,bonuses]=await Promise.all([
   pool.query(
    "SELECT c.id AS case_id,c.source_id AS cause_id,c.status AS case_status,c.funds_promised,"+
    "c.funds_received,c.last_updated,f.title,f.description,f.goal_amount,f.status AS cause_status,"+
    "f.supporter_count "+
    "FROM public.askanus_cases c JOIN public.featured_causes f ON f.id=c.source_id "+
    "WHERE c.user_id=$1 AND c.source_type='featured_cause' "+
    "ORDER BY c.last_updated DESC LIMIT 75",[member]),
   pool.query("SELECT id,cause_id,case_id,amount_cents,due_on,status,source,created_at,review_note "+
    "FROM public.gavhah_united_pledges WHERE member_id=$1 ORDER BY created_at DESC LIMIT 150",[member]),
   pool.query("SELECT id,cause_id,case_id,amount_cents,method,state,created_at,reviewed_at "+
    "FROM public.gavhah_united_donation_intents WHERE member_id=$1 "+
    "ORDER BY created_at DESC LIMIT 150",[member]),
   pool.query("SELECT id,cause_id,case_id,kind,details,created_at FROM public.gavhah_united_case_events "+
    "WHERE case_id IN (SELECT id FROM public.askanus_cases WHERE user_id=$1) "+
    "ORDER BY created_at DESC LIMIT 100",[member]),
   pool.query("SELECT cause_id,minutes_allocated,minutes_used,status,expires_at "+
    "FROM public.gavhah_united_olam_bonus_allocations WHERE member_id=$1",[member])
  ]);
  res.set("Cache-Control","private,no-store").json({
   cases:cases.rows,pledges:pledges.rows,donations:donations.rows,
   events:events.rows,olamBonuses:bonuses.rows,
   moneyNote:"Pledges and donation intentions are NOT received funds; phone minutes are not usable until SignalWire provider enforcement is verified."
  });
 }catch(e){next(e);}
});
router.get("/admin/united/workspace",requireAdmin,async(_req,res,next)=>{
 try{
  const [causes,pledges,donations,cases,bonuses,links]=await Promise.all([
   pool.query("SELECT f.id,f.title,f.status,f.goal_amount,f.supporter_count,"+
    "f.amount_raised AS legacy_pledged_amount,COALESCE(v.verified_cents,0) AS verified_received_cents "+
    "FROM public.featured_causes f LEFT JOIN public.gavhah_united_verified_totals v ON v.cause_id=f.id "+
    "ORDER BY f.created_at DESC LIMIT 30"),
   pool.query("SELECT p.id,p.cause_id,p.member_id,p.case_id,p.amount_cents,p.due_on,p.status,p.created_at,"+
    "p.review_note FROM public.gavhah_united_pledges p ORDER BY p.created_at DESC LIMIT 150"),
   pool.query("SELECT id,cause_id,member_id,case_id,amount_cents,state,method,"+
    "evidence_note,created_at FROM public.gavhah_united_donation_intents ORDER BY created_at DESC LIMIT 150"),
   pool.query("SELECT c.id,c.user_id,c.source_id AS cause_id,c.status,c.funds_promised,c.funds_received,"+
    "c.last_updated FROM public.askanus_cases c "+
    "WHERE c.source_type='featured_cause' ORDER BY c.last_updated DESC LIMIT 200"),
   pool.query("SELECT a.id,a.cause_id,a.member_id,a.minutes_allocated,a.minutes_used,a.status,"+
    "a.expires_at,p.enabled AS policy_enabled,p.provider_enforcement_active "+
    "FROM public.gavhah_united_olam_bonus_allocations a "+
    "LEFT JOIN public.gavhah_united_olam_bonus_policies p ON p.cause_id=a.cause_id "+
    "ORDER BY a.created_at DESC LIMIT 150"),
   pool.query("SELECT cause_id,provider,campaign_reference,plan_code,status,linked_at "+
    "FROM public.gavhah_united_campaign_center_links ORDER BY linked_at DESC LIMIT 30")
  ]);
  res.set("Cache-Control","private,no-store").json({
   causes:causes.rows,pledges:pledges.rows,donationIntents:donations.rows,
   cases:cases.rows,bonuses:bonuses.rows,campaignLinks:links.rows
  });
 }catch(e){next(e);}
});
router.post("/admin/united/pledges/:id/review",requireAdmin,async(req,res,next)=>{
 if(!trustedWrite(req)){res.sendStatus(403);return;}
 const id=idNumber(req.params.id),decision=req.body?.decision;
 if(!id||!["approved","rejected"].includes(decision)){res.status(400).json({error:"Choose approved or rejected"});return;}
 const note=String(req.body?.note||"").slice(0,1200);
 try{
  const result=await transaction(async c=>{
   const selected=await c.query<{
    member_id:number;cause_id:number;case_id:number;amount_cents:string;due_on:string;status:string
   }>("SELECT member_id,cause_id,case_id,amount_cents,due_on::text,status "+
      "FROM public.gavhah_united_pledges WHERE id=$1 FOR UPDATE",[id]);
   const p=selected.rows[0];
   if(!p||p.status!=="pending_team")return null;
   const newStatus=decision==="approved"?"approved_bln":"rejected";
   await c.query("UPDATE public.gavhah_united_pledges SET status=$2,reviewer_id=$3,review_note=$4,"+
    "reviewed_at=now() WHERE id=$1",[id,newStatus,getSessionUserId(req),note]);
   if(decision==="approved")await acceptPledgeIntoCase(c,id,p.case_id,Number(p.amount_cents),p.due_on);
   await c.query("INSERT INTO public.gavhah_united_case_events "+
    "(cause_id,case_id,author_id,kind,details) VALUES($1,$2,$3,'pledge_review',$4)",
    [p.cause_id,p.case_id,getSessionUserId(req),"BLN pledge #"+id+" "+newStatus+". "+note]);
   return {...p,newStatus};
  });
  if(!result){res.status(409).json({error:"Pledge was already reviewed"});return;}
  await notifyUser(result.member_id,"united_pledge_review",
   decision==="approved"?"Your extended BLN pledge was approved; a follow-up was added to My Askanus.":
    "Your extended BLN pledge was not approved by the team.",
   "/my?case="+result.case_id);
  res.json({id,status:result.newStatus,caseId:result.case_id});
 }catch(e){next(e);}
});
router.post("/me/united/donation-intents/:id/report",requireAuth,async(req,res,next)=>{
 if(!trustedWrite(req)){res.sendStatus(403);return;}
 const id=idNumber(req.params.id),member=getSessionUserId(req);
 const amount=centsFromUnknown(req.body?.amount);
 const proof=String(req.body?.evidence||"").trim();
 if(!id||!member||!amount||proof.length<8||proof.length>1000){
  res.status(400).json({error:"A reported dollar amount and evidence/reference (8-1000 characters) required"});return;
 }
 try{
  const r=await pool.query(
   "UPDATE public.gavhah_united_donation_intents SET state='submitted_for_verification',"+
   "amount_cents=$3,method='offline_report',evidence_note=$4 "+
   "WHERE id=$1 AND member_id=$2 AND state IN ('instructions_only','provider_pending') "+
   "RETURNING id,case_id,cause_id",[id,member,amount,proof]);
  if(!r.rowCount){res.status(409).json({error:"Intent unavailable or already submitted"});return;}
  await notifyStaff("United donation #"+id+" needs verification","/founder","united_payment_verification");
  res.json({status:"submitted_for_verification",verified:false,caseId:r.rows[0].case_id});
 }catch(e){next(e);}
});
router.post("/admin/united/donation-intents/:id/review",requireAdmin,async(req,res,next)=>{
 if(!trustedWrite(req)){res.sendStatus(403);return;}
 const id=idNumber(req.params.id),decision=req.body?.decision;
 const proof=String(req.body?.verificationNote||"").trim();
 if(!id||!["verified","rejected"].includes(decision)||decision==="verified"&&proof.length<8||
    proof.length>1500){res.status(400).json({error:"Verification decision and receipt evidence required"});return;}
 try{
  const info=await transaction(async c=>{
   const r=await c.query<{member_id:number;case_id:number;cause_id:number;amount_cents:string|null;state:string}>(
    "SELECT member_id,case_id,cause_id,amount_cents,state "+
    "FROM public.gavhah_united_donation_intents WHERE id=$1 FOR UPDATE",[id]);
   const d=r.rows[0];
   if(!d||d.state!=="submitted_for_verification")return null;
   const cents=Number(d.amount_cents||0);
   if(decision==="verified"&&(!Number.isSafeInteger(cents)||cents<=0))
    throw new Error("AMOUNT_MISSING");
   await c.query(
    "UPDATE public.gavhah_united_donation_intents SET state=$2,reviewed_by=$3,reviewed_at=now(),"+
    "evidence_note=left(coalesce(evidence_note,'') || E'\\nStaff verification: ' || $4,2000) WHERE id=$1",
    [id,decision,getSessionUserId(req),proof]);
   if(decision==="verified"){
    await c.query("INSERT INTO public.gavhah_united_verified_totals "+
     "(cause_id,verified_cents,verification_note,recorded_by) "+
     "VALUES($1,$2,$3,$4) ON CONFLICT(cause_id) DO UPDATE SET "+
     "verified_cents=public.gavhah_united_verified_totals.verified_cents+excluded.verified_cents,"+
     "verification_note=excluded.verification_note,recorded_at=now(),recorded_by=excluded.recorded_by",
     [d.cause_id,cents,"Verified donation #"+id+" / "+proof,getSessionUserId(req)]);
    await c.query("UPDATE public.askanus_cases SET funds_received=funds_received+$2::numeric,"+
     "last_updated=now() WHERE id=$1",[d.case_id,(cents/100).toFixed(2)]);
    await c.query("INSERT INTO public.case_activity_log(case_id,date,type,amount,note) "+
     "VALUES($1,current_date::text,'funds_received',$2,$3)",
     [d.case_id,(cents/100).toFixed(2),"Verified and received by Gavhah team, donation #"+id]);
   }
   await c.query("INSERT INTO public.gavhah_united_case_events "+
    "(cause_id,case_id,author_id,kind,details) VALUES($1,$2,$3,'donation_verified',$4)",
    [d.cause_id,d.case_id,getSessionUserId(req),
     "Donation #"+id+" "+decision+". Amount: $"+(cents/100).toFixed(2)]);
   return {...d,status:decision};
  });
  if(!info){res.status(409).json({error:"Donation was already reviewed or not submitted"});return;}
  await notifyUser(info.member_id,"united_payment_review",
   decision==="verified"?"Your reported donation has been verified and credited to your My Askanus case.":
   "Your donation report was not verified. Please contact the team.",
   "/my?case="+info.case_id);
  res.json({id,status:decision,caseId:info.case_id});
 }catch(e){if(e instanceof Error&&e.message==="AMOUNT_MISSING"){res.status(400).json({error:"Missing amount"});return;}next(e);}
});
export default router;
