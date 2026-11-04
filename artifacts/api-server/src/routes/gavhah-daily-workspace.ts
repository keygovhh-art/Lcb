import {Router,type Request} from "express";
import {pool} from "@workspace/db";
import {requireAuth,requireAdmin,getSessionUserId} from "../middlewares/auth";
import {notifyStaff,notifyUser} from "../lib/notify";
import {centsFromUnknown,isoDay,requestKeyValid} from "../lib/gavhah-united-participation";
import {newDailyPledge,newDailyDonationIntent,acceptDailyPledge} from "../lib/gavhah-daily-participation";

const router=Router();
const num=(x:unknown):number|null=>{
 const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:null;
};
const safeWrite=(req:Request)=>{
 const o=req.get("origin"),h=req.get("x-forwarded-host")||req.get("host");
 if(req.get("sec-fetch-site")==="cross-site"||!o||!h)return false;
 try{return new URL(o).host===h&&new URL(o).protocol==="https:";}catch{return false;}
};
async function trans<T>(fn:(client:import("pg").PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();
 try{await c.query("BEGIN");const res=await fn(c);await c.query("COMMIT");return res;}
 catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
}
function knownError(e:unknown):string|null{
 if(!(e instanceof Error))return null;
 const messages:Record<string,string>={
  ACCOUNT_NOT_ACTIVE:"Member account inactive",
  NOT_CURRENT_DAILY_CAUSE:"That cause is not the current approved Today's Cause",
  DUE_DATE_IN_PAST:"Deadline cannot be in the past",
  REQUEST_KEY_CONFLICT:"A different submission already used this request key",
  INVALID_MEMBER_OR_CHARITY:"Invalid member or cause ID"
 };
 return messages[e.message]||null;
}
router.post("/daily/:causeId/pledges",requireAuth,async(req,res,next)=>{
 if(!safeWrite(req)){res.sendStatus(403);return;}
 const charityId=num(req.params.causeId),member=getSessionUserId(req);
 const cents=centsFromUnknown(req.body?.amount),day=isoDay(req.body?.dueOn),key=req.body?.requestKey;
 if(!charityId||!member||!cents||!day||!requestKeyValid(key)){
  res.status(400).json({error:"Amount, due date and unique request key required"});return;
 }
 try{
  const result=await trans(c=>newDailyPledge(c,{
   charityId,memberId:member,amountCents:cents,dueOn:day,requestKey:key,source:"web"
  }));
  if(!result.duplicate){
   await notifyUser(member,"daily_bln",
    result.status==="pending_team"?
     "Your Today's Cause BLN pledge for a date longer than two months awaits team approval.":
     "Your Today's Cause BLN pledge and follow-up were recorded. No payment was charged.",
    "/my?case="+result.caseId);
   await notifyStaff("Today's Cause BLN pledge #"+result.pledgeId+
    (result.status==="pending_team"?" requires approval":" accepted, not charged"),
    "/founder","daily_bln_review");
  }
  res.status(result.status==="pending_team"?202:201).json({
   ...result,bln:true,moneyCollected:false,independentOfUnited:true
  });
 }catch(e){const reason=knownError(e);if(reason){res.status(409).json({error:reason});return;}next(e);}
});
router.post("/daily/:causeId/donate-now",requireAuth,async(req,res,next)=>{
 if(!safeWrite(req)){res.sendStatus(403);return;}
 const charityId=num(req.params.causeId),member=getSessionUserId(req),key=req.body?.requestKey;
 const cents=req.body?.amount===undefined||req.body?.amount===null||req.body?.amount===""?
  null:centsFromUnknown(req.body.amount);
 if(!charityId||!member||!requestKeyValid(key)||
   cents===null&&req.body?.amount!==undefined&&req.body?.amount!==null&&req.body?.amount!==""){
  res.status(400).json({error:"Invalid amount or request key"});return;
 }
 try{
  const result=await trans(c=>newDailyDonationIntent(c,{
   charityId,memberId:member,amountCents:cents,requestKey:key,source:"web"
  }));
  if(!result.duplicate){
   await notifyUser(member,"daily_donation_request",
    "Your Today's Cause donation information request was recorded in My Askanus. This is NOT a payment.",
    "/my?case="+result.caseId);
   await notifyStaff("Today's Cause donation request #"+result.intentId,"/founder","daily_donation_request");
  }
  res.status(201).json({...result,moneyCollected:false,independentOfUnited:true,
    checkoutStatusUrl:"/api/cause-channels/daily/checkout-status"});
 }catch(e){const reason=knownError(e);if(reason){res.status(409).json({error:reason});return;}next(e);}
});
router.get("/me/daily/workspace",requireAuth,async(req,res,next)=>{
 try{
  const member=getSessionUserId(req)!;
  const [cases,pledges,donations]=await Promise.all([
   pool.query("SELECT c.id AS case_id,c.source_id AS charity_id,c.status AS case_status,"+
    "c.funds_promised,c.funds_received,c.last_updated,f.name AS title,"+
    "f.description,f.goal_amount FROM public.askanus_cases c "+
    "JOIN public.charities f ON f.id=c.source_id "+
    "WHERE c.user_id=$1 AND c.source_type='daily_charity' "+
    "ORDER BY c.last_updated DESC LIMIT 75",[member]),
   pool.query("SELECT id,charity_id,case_id,amount_cents,due_on,status,source,created_at,review_note "+
    "FROM public.gavhah_daily_pledges WHERE member_id=$1 ORDER BY created_at DESC LIMIT 150",[member]),
   pool.query("SELECT id,charity_id,case_id,amount_cents,state,created_at,evidence_note "+
    "FROM public.gavhah_daily_donation_intents WHERE member_id=$1 "+
    "ORDER BY created_at DESC LIMIT 150",[member])
  ]);
  res.set("Cache-Control","private,no-store").json({
   channel:"daily",cases:cases.rows,pledges:pledges.rows,donations:donations.rows,
   moneyNote:"BLN undertakings are separate from verified received funds."
  });
 }catch(e){next(e);}
});
router.get("/admin/daily/workspace",requireAdmin,async(_req,res,next)=>{
 try{
  const [causes,pledges,donations,cases]=await Promise.all([
   pool.query("SELECT c.id,c.name AS title,c.is_todays_featured,c.publication_state,c.goal_amount,"+
    "COALESCE(v.verified_cents,0) AS extra_verified_cents,"+
    "(SELECT COALESCE(SUM(d.amount),0)*100 FROM public.donations d WHERE d.charity_id=c.id) AS existing_verified_cents "+
    "FROM public.charities c LEFT JOIN public.gavhah_daily_verified_totals v ON v.charity_id=c.id "+
    "ORDER BY c.created_at DESC LIMIT 100"),
   pool.query("SELECT id,charity_id,member_id,case_id,amount_cents,due_on,status,review_note,created_at "+
    "FROM public.gavhah_daily_pledges ORDER BY created_at DESC LIMIT 200"),
   pool.query("SELECT id,charity_id,member_id,case_id,amount_cents,state,evidence_note,created_at "+
    "FROM public.gavhah_daily_donation_intents ORDER BY created_at DESC LIMIT 200"),
   pool.query("SELECT id,user_id,source_id AS charity_id,status,funds_promised,funds_received,last_updated "+
    "FROM public.askanus_cases WHERE source_type='daily_charity' "+
    "ORDER BY last_updated DESC LIMIT 250")
  ]);
  res.set("Cache-Control","private,no-store").json({
   channel:"daily",causes:causes.rows,pledges:pledges.rows,
   donationIntents:donations.rows,cases:cases.rows
  });
 }catch(e){next(e);}
});
router.post("/admin/daily/pledges/:id/review",requireAdmin,async(req,res,next)=>{
 if(!safeWrite(req)){res.sendStatus(403);return;}
 const pledgeId=num(req.params.id),decision=req.body?.decision;
 const note=String(req.body?.note||"").slice(0,1200);
 if(!pledgeId||!["approved","rejected"].includes(decision)){
  res.status(400).json({error:"A valid staff approval or rejection is required"});return;
 }
 try{
  const handled=await trans(async c=>{
   const found=await c.query<{member_id:number;case_id:number;amount_cents:string;due_on:string;status:string}>(
    "SELECT member_id,case_id,amount_cents,due_on::text,status "+
    "FROM public.gavhah_daily_pledges WHERE id=$1 FOR UPDATE",[pledgeId]);
   const p=found.rows[0];
   if(!p||p.status!=="pending_team")return null;
   const state=decision==="approved"?"approved_bln":"rejected";
   await c.query("UPDATE public.gavhah_daily_pledges SET status=$2,"+
    "reviewed_by=$3,reviewed_at=now(),review_note=$4 WHERE id=$1",
    [pledgeId,state,getSessionUserId(req),note]);
   if(decision==="approved")await acceptDailyPledge(c,p.case_id,pledgeId,Number(p.amount_cents),p.due_on);
   return {...p,state};
  });
  if(!handled){res.status(409).json({error:"The undertaking was already reviewed"});return;}
  await notifyUser(handled.member_id,"daily_pledge_review",
   decision==="approved"?"Your extended Today's Cause BLN pledge was approved.":
    "Your extended Today's Cause BLN pledge was not approved.",
   "/my?case="+handled.case_id);
  res.json({id:pledgeId,status:handled.state,caseId:handled.case_id});
 }catch(e){next(e);}
});
router.post("/me/daily/donations/:id/report",requireAuth,async(req,res,next)=>{
 if(!safeWrite(req)){res.sendStatus(403);return;}
 const id=num(req.params.id),member=getSessionUserId(req);
 const cents=centsFromUnknown(req.body?.amount),proof=String(req.body?.evidence||"").trim();
 if(!id||!member||!cents||proof.length<8||proof.length>1000){
  res.status(400).json({error:"Amount and an eight-character receipt reference or evidence description required"});return;
 }
 try{
  const r=await pool.query(
   "UPDATE public.gavhah_daily_donation_intents SET amount_cents=$3,"+
   "evidence_note=$4,method='offline_report',state='submitted_for_verification' "+
   "WHERE id=$1 AND member_id=$2 AND state='instructions_only' "+
   "RETURNING id,case_id",[id,member,cents,proof]);
  if(!r.rowCount){res.status(409).json({error:"This donation request has already been processed"});return;}
  await notifyStaff("Today's Cause donation receipt #"+id+" needs verification",
   "/founder","daily_receipt_review");
  res.json({id,status:"submitted_for_verification",verified:false,caseId:r.rows[0].case_id});
 }catch(e){next(e);}
});
router.post("/admin/daily/donations/:id/review",requireAdmin,async(req,res,next)=>{
 if(!safeWrite(req)){res.sendStatus(403);return;}
 const id=num(req.params.id),decision=req.body?.decision,proof=String(req.body?.verificationNote||"").trim();
 if(!id||!["verified","rejected"].includes(decision)||proof.length>1500||
    decision==="verified"&&proof.length<8){
  res.status(400).json({error:"Verified donation must include receipt evidence"});return;
 }
 try{
  const paid=await trans(async c=>{
   const found=await c.query<{charity_id:number;member_id:number;case_id:number;amount_cents:string|null;state:string}>(
    "SELECT charity_id,member_id,case_id,amount_cents,state FROM public.gavhah_daily_donation_intents "+
    "WHERE id=$1 FOR UPDATE",[id]);
   const r=found.rows[0];
   if(!r||r.state!=="submitted_for_verification")return null;
   const cents=Number(r.amount_cents||0);
   if(decision==="verified"&&(!Number.isSafeInteger(cents)||cents<=0))throw Error("MISSING_PAYMENT_AMOUNT");
   await c.query("UPDATE public.gavhah_daily_donation_intents SET state=$2,"+
    "reviewed_by=$3,reviewed_at=now() WHERE id=$1",[id,decision,getSessionUserId(req)]);
   if(decision==="verified"){
    await c.query("INSERT INTO public.gavhah_daily_verified_totals "+
     "(charity_id,verified_cents,verification_note,recorded_by) "+
     "VALUES($1,$2,$3,$4) ON CONFLICT(charity_id) DO UPDATE SET "+
     "verified_cents=public.gavhah_daily_verified_totals.verified_cents+excluded.verified_cents,"+
     "verification_note=excluded.verification_note,recorded_by=excluded.recorded_by,recorded_at=now()",
     [r.charity_id,cents,"Verified intent "+id+" — "+proof,getSessionUserId(req)]);
    await c.query("UPDATE public.askanus_cases SET funds_received=funds_received+$2::numeric,"+
     "last_updated=now() WHERE id=$1",[r.case_id,(cents/100).toFixed(2)]);
    await c.query("INSERT INTO public.case_activity_log(case_id,date,type,amount,note) "+
     "VALUES($1,current_date::text,'funds_received',$2,$3)",
     [r.case_id,(cents/100).toFixed(2),"Today's Cause receipt #"+id+" verified by staff"]);
   }
   return {...r,state:decision};
  });
  if(!paid){res.status(409).json({error:"This donation was already reviewed"});return;}
  await notifyUser(paid.member_id,"daily_payment_review",
   decision==="verified"?"Your Today's Cause donation was verified and credited to your My Askanus case.":
    "Your Today's Cause donation report was not verified. Contact the team.",
   "/my?case="+paid.case_id);
  res.json({id,status:decision,caseId:paid.case_id,verified:decision==="verified"});
 }catch(e){next(e);}
});
// Today's Cause proposals are independent from United featured-cause submissions.
router.post("/daily/proposals",requireAuth,async(req,res,next)=>{
 if(!safeWrite(req)){res.sendStatus(403);return;}
 const member=getSessionUserId(req),title=String(req.body?.title||"").trim(),
  description=String(req.body?.description||"").trim(),location=String(req.body?.location||"").trim(),
  urgency=String(req.body?.urgency||"normal");
 if(!member||title.length<3||title.length>200||description.length<12||
   description.length>5000||location.length>160||!["normal","high","urgent"].includes(urgency)){
  res.status(400).json({error:"Cause title (3-200), description (12-5000), and valid urgency required"});return;
 }
 try{
  const recent=await pool.query<{n:string}>(
   "SELECT count(*)::text AS n FROM public.gavhah_daily_cause_proposals "+
   "WHERE member_id=$1 AND created_at>now()-interval '1 day'",[member]);
  if(Number(recent.rows[0]?.n||0)>=5){
   res.status(429).json({error:"Daily proposal limit reached"});return;
  }
  const r=await pool.query(
   "INSERT INTO public.gavhah_daily_cause_proposals "+
   "(member_id,title,description,location,urgency,status) "+
   "VALUES($1,$2,$3,$4,$5,'pending') RETURNING id,status",
   [member,title,description,location||null,urgency]);
  await notifyStaff("New independent Today's Cause proposal #"+r.rows[0].id+" is awaiting review.",
   "/founder","daily_cause_proposal");
  res.status(201).json({...r.rows[0],published:false,channel:"daily"});
 }catch(e){next(e);}
});
router.get("/admin/daily/proposals",requireAdmin,async(_req,res,next)=>{
 try{
  const r=await pool.query("SELECT id,member_id,title,description,location,urgency,"+
   "status,created_at,review_note FROM public.gavhah_daily_cause_proposals "+
   "ORDER BY created_at DESC LIMIT 200");
  res.set("Cache-Control","private,no-store").json(r.rows);
 }catch(e){next(e);}
});
router.post("/admin/daily/proposals/:id/review",requireAdmin,async(req,res,next)=>{
 if(!safeWrite(req)){res.sendStatus(403);return;}
 const id=num(req.params.id),decision=String(req.body?.decision||""),
  note=String(req.body?.note||"").slice(0,1000);
 if(!id||!["reviewing","approved","rejected"].includes(decision)){
  res.status(400).json({error:"Invalid review decision"});return;
 }
 try{
  const r=await pool.query<{member_id:number;id:number}>(
   "UPDATE public.gavhah_daily_cause_proposals "+
   "SET status=$2,review_note=$3,reviewed_by=$4,reviewed_at=now() "+
   "WHERE id=$1 AND status IN('pending','reviewing') RETURNING id,member_id",
   [id,decision,note,getSessionUserId(req)]);
  if(!r.rowCount){res.status(409).json({error:"Already reviewed"});return;}
  await notifyUser(r.rows[0].member_id,"daily_proposal_review",
   decision==="approved"?
   "Your Today's Cause proposal was accepted for the charity team's publication queue, but it is NOT live yet.":
   decision==="rejected"?"Your Today's Cause proposal was not approved.":
   "Your Today's Cause proposal is being reviewed.",
   "/charity");
  res.json({id,status:decision,published:false,
   note:"The staff must separately create and publish a verified charity under /admin/charity."});
 }catch(e){next(e);}
});

export default router;
