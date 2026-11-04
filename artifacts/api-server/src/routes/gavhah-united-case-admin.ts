import {Router,type Request} from "express";
import {pool} from "@workspace/db";
import {requireAuth,requireAdmin,getSessionUserId} from "../middlewares/auth";
import {notifyUser,notifyStaff} from "../lib/notify";

const router=Router();
function sameOrigin(req:Request){
 const origin=req.get("origin"),host=req.get("x-forwarded-host")||req.get("host");
 if(req.get("sec-fetch-site")==="cross-site"||!origin||!host)return false;
 try{return new URL(origin).host===host&&new URL(origin).protocol==="https:";}catch{return false;}
}
function intId(v:unknown):number|null{
 const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;
}
async function caseAccess(userId:number,caseId:number,write=false){
 const r=await pool.query<{
  id:number;owner_id:number;cause_id:number;role:string|null;
 }>(
  "SELECT c.id,c.user_id AS owner_id,c.source_id AS cause_id,a.role "+
  "FROM public.askanus_cases c "+
  "LEFT JOIN public.gavhah_united_case_access a ON a.case_id=c.id AND a.collaborator_id=$2 "+
  "AND a.revoked_at IS NULL AND a.expires_at>now() "+
  "WHERE c.id=$1 AND c.source_type='featured_cause' AND "+
  "(c.user_id=$2 OR a.collaborator_id IS NOT NULL)",
  [caseId,userId]);
 const v=r.rows[0];
 if(!v||write&&v.owner_id!==userId&&v.role!=="coordinator")return null;
 return v;
}
// Limited external participants must be signed-in users, and may only see
// the explicitly shared case. No unrelated case history, password, contacts,
// donor list or Olam account keys are returned.
router.get("/me/united/shared-cases",requireAuth,async(req,res,next)=>{
 try{
  const userId=getSessionUserId(req)!;
  const r=await pool.query(
   "SELECT a.case_id,a.role,a.expires_at,c.title,c.description,c.status,c.source_id AS cause_id,"+
   "f.title AS cause_title,f.goal_amount AS central_goal "+
   "FROM public.gavhah_united_case_access a "+
   "JOIN public.askanus_cases c ON c.id=a.case_id "+
   "JOIN public.featured_causes f ON f.id=c.source_id "+
   "WHERE a.collaborator_id=$1 AND a.revoked_at IS NULL AND a.expires_at>now() "+
   "AND c.source_type='featured_cause' ORDER BY a.expires_at DESC LIMIT 100",[userId]);
  res.set("Cache-Control","private,no-store").json(r.rows);
 }catch(e){next(e);}
});
router.post("/me/united/shared-cases/:caseId/note",requireAuth,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const caseId=intId(req.params.caseId),userId=getSessionUserId(req);
 const note=String(req.body?.note||"").trim();
 if(!caseId||!userId||note.length<2||note.length>1200){
  res.status(400).json({error:"2-1200 character case note required"});return;
 }
 try{
  const access=await caseAccess(userId,caseId,true);
  if(!access){res.sendStatus(404);return;}
  await pool.query(
   "INSERT INTO public.gavhah_united_case_events "+
   "(cause_id,case_id,author_id,kind,details) VALUES($1,$2,$3,'note',$4)",
   [access.cause_id,caseId,userId,note]);
  if(access.owner_id!==userId)
   await notifyUser(access.owner_id,"united_case_note",
    "A permitted coordinator added a note to your United cause case.","/my?case="+caseId);
  res.status(201).json({ok:true,caseId});
 }catch(e){next(e);}
});
router.post("/admin/united/cases/:caseId/collaborators",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const caseId=intId(req.params.caseId),member=intId(req.body?.memberId);
 const role=req.body?.role,days=Number(req.body?.expiresInDays||30);
 if(!caseId||!member||!["viewer","coordinator"].includes(role)||
    !Number.isSafeInteger(days)||days<1||days>365){
  res.status(400).json({error:"Case, existing member, limited role and expiry required"});return;
 }
 try{
  const c=await pool.query<{user_id:number;source_id:number}>(
   "SELECT user_id,source_id FROM public.askanus_cases "+
   "WHERE id=$1 AND source_type='featured_cause'",[caseId]);
  const u=await pool.query(
   "SELECT id FROM public.users WHERE id=$1 AND status='active'",[member]);
  if(!c.rows[0]||!u.rows[0]||c.rows[0].user_id===member){res.status(400).json({error:"Invalid case/member combination"});return;}
  const r=await pool.query(
   "INSERT INTO public.gavhah_united_case_access "+
   "(case_id,collaborator_id,role,granted_by,expires_at) "+
   "VALUES($1,$2,$3,$4,now()+$5::integer*interval '1 day') "+
   "ON CONFLICT(case_id,collaborator_id) DO UPDATE SET "+
   "role=excluded.role,granted_by=excluded.granted_by,expires_at=excluded.expires_at,"+
   "revoked_at=NULL RETURNING case_id,collaborator_id,role,expires_at",
   [caseId,member,role,getSessionUserId(req),days]);
  await notifyUser(member,"united_shared_case",
   "Gavhah has granted you restricted access to one United cause case. "+
   "Sign into your own account. No general administrative access was granted.",
   "/my");
  res.status(201).json(r.rows[0]);
 }catch(e){next(e);}
});
router.post("/admin/united/cases/:caseId/collaborators/:memberId/revoke",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const caseId=intId(req.params.caseId),member=intId(req.params.memberId);
 if(!caseId||!member){res.sendStatus(404);return;}
 try{
  const r=await pool.query(
   "UPDATE public.gavhah_united_case_access SET revoked_at=now() "+
   "WHERE case_id=$1 AND collaborator_id=$2 AND revoked_at IS NULL RETURNING case_id",[caseId,member]);
  if(!r.rowCount){res.status(404).json({error:"No active case access"});return;}
  await notifyUser(member,"united_shared_case",
   "Your restricted United case access was revoked by the Gavhah team.","/my");
  res.json({ok:true});
 }catch(e){next(e);}
});
router.post("/admin/united/cases/:caseId/notify",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const caseId=intId(req.params.caseId),audience=req.body?.audience;
 const message=String(req.body?.message||"").trim();
 if(!caseId||!["member","team","both"].includes(audience)||message.length<2||message.length>900){
  res.status(400).json({error:"Audience and a 2-900 character message required"});return;
 }
 try{
  const r=await pool.query<{user_id:number;source_id:number}>(
   "SELECT user_id,source_id FROM public.askanus_cases "+
   "WHERE id=$1 AND source_type='featured_cause'",[caseId]);
  const c=r.rows[0];if(!c){res.sendStatus(404);return;}
  if(audience!=="team")await notifyUser(c.user_id,"united_followup",message,"/my?case="+caseId);
  if(audience!=="member")await notifyStaff(message,"/founder","united_team_followup");
  await pool.query("INSERT INTO public.gavhah_united_case_events(cause_id,case_id,author_id,kind,details) "+
   "VALUES($1,$2,$3,'staff_notification',$4)",
   [c.source_id,caseId,getSessionUserId(req),"To "+audience+": "+message]);
  res.json({ok:true,sentTo:audience});
 }catch(e){next(e);}
});
router.post("/admin/united/causes/:causeId/goal",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const causeId=intId(req.params.causeId);
 const amount=Number(req.body?.goal);
 if(!causeId||!Number.isFinite(amount)||amount<0||amount>1e9||
    Math.abs(amount*100-Math.round(amount*100))>0.00001){
  res.status(400).json({error:"Valid nonnegative cause goal required"});return;
 }
 try{
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const r=await client.query(
    "UPDATE public.featured_causes SET goal_amount=$2 WHERE id=$1 AND status='active' RETURNING id,title",
    [causeId,amount.toFixed(2)]);
   if(!r.rowCount){await client.query("ROLLBACK");res.sendStatus(404);return;}
   await client.query(
    "INSERT INTO public.gavhah_united_case_events(cause_id,case_id,author_id,kind,details) "+
    "SELECT $1,c.id,$2,'goal_notice',$3 FROM public.askanus_cases c "+
    "WHERE c.source_type='featured_cause' AND c.source_id=$1",
    [causeId,getSessionUserId(req),"Central United goal updated to $"+amount.toFixed(2)]);
   await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();}
  const members=await pool.query<{user_id:number}>(
   "SELECT DISTINCT user_id FROM public.askanus_cases WHERE source_type='featured_cause' AND source_id=$1",
   [causeId]);
  for(const m of members.rows.slice(0,300))
   await notifyUser(m.user_id,"united_goal","The central United cause goal was updated.",
    "/my");
  res.json({ok:true,causeId,centralGoal:amount});
 }catch(e){next(e);}
});
router.post("/admin/united/campaign-center",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const causeId=intId(req.body?.causeId);
 const reference=String(req.body?.campaignReference||"").trim(),plan=String(req.body?.planCode||"").trim();
 if(!causeId||!/^[A-Za-z0-9_-]{3,96}$/.test(reference)||!/^[A-Za-z0-9_-]{2,60}$/.test(plan)){
  res.status(400).json({error:"Cause, Campaign Center reference and plan code required"});return;
 }
 try{
  const c=await pool.query("SELECT id FROM public.featured_causes WHERE id=$1",[causeId]);
  if(!c.rowCount){res.sendStatus(404);return;}
  const r=await pool.query(
   "INSERT INTO public.gavhah_united_campaign_center_links "+
   "(cause_id,provider,campaign_reference,plan_code,linked_by,status) "+
   "VALUES($1,'campaign_center',$2,$3,$4,'prepared') "+
   "ON CONFLICT(cause_id,provider) DO UPDATE SET campaign_reference=excluded.campaign_reference,"+
   "plan_code=excluded.plan_code,linked_by=excluded.linked_by,linked_at=now(),status='prepared' "+
   "RETURNING cause_id,campaign_reference,plan_code,status",
   [causeId,reference,plan,getSessionUserId(req)]);
  res.json({...r.rows[0],automaticExternalSync:false,
   note:"A plan mapping is prepared. No Campaign Center API/billing connection has been made."});
 }catch(e){next(e);}
});
router.post("/admin/united/olam/bonus-policy",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const causeId=intId(req.body?.causeId),enabled=req.body?.enabled,
 minutes=Number(req.body?.minutesPerMember),expires=Number(req.body?.expirationDays||30),
 cap=Number(req.body?.maxTotalMinutes||0);
 if(!causeId||typeof enabled!=="boolean"||![minutes,expires,cap].every(Number.isSafeInteger)||
    minutes<0||minutes>10000||expires<1||expires>365||cap<0||cap>1e6){
  res.status(400).json({error:"Invalid bonus policy limits"});return;
 }
 try{
  const exists=await pool.query("SELECT id FROM public.featured_causes WHERE id=$1",[causeId]);
  if(!exists.rowCount){res.sendStatus(404);return;}
  const r=await pool.query(
   "INSERT INTO public.gavhah_united_olam_bonus_policies "+
   "(cause_id,enabled,minutes_per_member,expiration_days,max_total_minutes,configured_by,"+
   "provider_enforcement_active) VALUES($1,$2,$3,$4,$5,$6,false) "+
   "ON CONFLICT(cause_id) DO UPDATE SET enabled=excluded.enabled,"+
   "minutes_per_member=excluded.minutes_per_member,expiration_days=excluded.expiration_days,"+
   "max_total_minutes=excluded.max_total_minutes,configured_by=excluded.configured_by,"+
   "provider_enforcement_active=false,updated_at=now() "+
   "RETURNING *",
   [causeId,enabled,minutes,expires,cap,getSessionUserId(req)]);
  res.json({...r.rows[0],liveSignalWireCredits:false});
 }catch(e){next(e);}
});
router.post("/admin/united/olam/bonus-allocations",requireAdmin,async(req,res,next)=>{
 if(!sameOrigin(req)){res.sendStatus(403);return;}
 const causeId=intId(req.body?.causeId),member=intId(req.body?.memberId);
 if(!causeId||!member){res.status(400).json({error:"Cause and verified joined member required"});return;}
 try{
  const c=await pool.connect();
  let result:any=null;
  try{
   await c.query("BEGIN");
   await c.query("SELECT pg_advisory_xact_lock($1::int,4242)",[causeId]);
   const p=await c.query<{enabled:boolean;minutes_per_member:number;expiration_days:number;max_total_minutes:number}>(
    "SELECT enabled,minutes_per_member,expiration_days,max_total_minutes "+
    "FROM public.gavhah_united_olam_bonus_policies WHERE cause_id=$1",[causeId]);
   const policy=p.rows[0];
   const memberOk=await c.query(
    "SELECT s.id FROM public.featured_cause_supporters s "+
    "JOIN public.gavhah_olam_chesed_access a ON a.user_id=s.user_id AND a.status='linked' "+
    "JOIN public.users u ON u.id=s.user_id AND u.status='active' "+
    "WHERE s.cause_id=$1 AND s.user_id=$2 LIMIT 1",[causeId,member]);
   if(!policy?.enabled||!policy.minutes_per_member||!memberOk.rowCount){
    await c.query("ROLLBACK");
    res.status(409).json({error:"Bonus unavailable: approved Olam access, active membership and enabled policy required"});return;
   }
   const balance=await c.query<{used:string}>(
    "SELECT coalesce(sum(minutes_allocated),0)::text AS used "+
    "FROM public.gavhah_united_olam_bonus_allocations WHERE cause_id=$1 AND status!='revoked'",[causeId]);
   const prior=await c.query("SELECT id FROM public.gavhah_united_olam_bonus_allocations "+
    "WHERE cause_id=$1 AND member_id=$2",[causeId,member]);
   if(prior.rowCount){await c.query("ROLLBACK");res.status(409).json({error:"Member already has an allocation"});return;}
   if(policy.max_total_minutes&&Number(balance.rows[0]?.used||0)+policy.minutes_per_member>policy.max_total_minutes){
    await c.query("ROLLBACK");res.status(409).json({error:"Cause bonus minute budget exceeded"});return;
   }
   result=(await c.query("INSERT INTO public.gavhah_united_olam_bonus_allocations "+
    "(cause_id,member_id,minutes_allocated,status,expires_at,activated_by) "+
    "VALUES($1,$2,$3,'reserved',now()+$4::integer*interval '1 day',$5) "+
    "RETURNING id,cause_id,member_id,minutes_allocated,status,expires_at",
    [causeId,member,policy.minutes_per_member,policy.expiration_days,getSessionUserId(req)])).rows[0];
   await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
  await notifyUser(member,"united_olam_bonus",
   "The team reserved an Olam Chesed bonus allocation for you. "+
   "This is NOT active calling credit until SignalWire limits are configured and verified.",
   "/my");
  res.status(201).json({...result,usableOnSignalWire:false,
   enforcementStatus:"pending provider integration"});
 }catch(e){next(e);}
});
export default router;
