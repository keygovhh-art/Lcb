import type {PoolClient} from "pg";

// One verified Gavhah member joins one existing active United cause.
// Both web & Yemot call the SAME transaction; no duplicate supporters/cases.
export type UnitedCause={id:number;title:string;description:string;organizer_name:string|null;goal_amount:string|null;status:string};
export type UnitedJoined={cause:UnitedCause;caseId:number;supporterId:number;newJoin:boolean};
export async function ensureUnitedCauseCase(
 c:PoolClient,userId:number,causeId:number
):Promise<UnitedJoined>{
 if(!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(causeId)||causeId<1)
  throw new Error("MEMBER_OR_CAUSE_INVALID");
 await c.query("SELECT pg_advisory_xact_lock($1::int,$2::int)",[causeId,userId]);
 const account=await c.query("SELECT id,nickname,name FROM public.users WHERE id=$1 AND status='active'",[userId]);
 if(!account.rowCount)throw new Error("ACCOUNT_NOT_ACTIVE");
 const result=await c.query<UnitedCause>(
  "SELECT id,title,description,organizer_name,goal_amount,status FROM public.featured_causes "+
  "WHERE id=$1 AND status='active' FOR SHARE",[causeId]);
 const cause=result.rows[0];
 if(!cause)throw new Error("ACTIVE_CAUSE_NOT_FOUND");
 const display=String(account.rows[0].nickname||account.rows[0].name||"Gavhah member").slice(0,120);
 let existing=await c.query<{id:number}>(
  "SELECT id FROM public.askanus_cases "+
  "WHERE user_id=$1 AND source_type='featured_cause' AND source_id=$2 ORDER BY id LIMIT 1",
  [userId,causeId]);
 let caseId=existing.rows[0]?.id;
 if(!caseId){
  const created=await c.query<{id:number}>(
   "INSERT INTO public.askanus_cases "+
   "(user_id,title,description,category,contact_name,notes,goal_amount,source_type,source_id) "+
   "VALUES($1,$2,$3,'General',$4,$5,$6,'featured_cause',$7) RETURNING id",
   [userId,cause.title.slice(0,240),cause.description.slice(0,5000),
    (cause.organizer_name||display).slice(0,240),
    "Official United in Kindness membership. BLN pledges, verified donations and follow-ups are managed separately.",
    cause.goal_amount||"0",causeId]);
  caseId=created.rows[0].id;
  await c.query(
   "INSERT INTO public.case_activity_log(case_id,date,type,note) "+
   "VALUES($1,now()::date,'status_change','Official United cause case opened')",[caseId]);
 }
 let supporter=await c.query<{id:number}>(
  "SELECT id FROM public.featured_cause_supporters WHERE cause_id=$1 AND user_id=$2 "+
  "ORDER BY id LIMIT 1",[causeId,userId]);
 let supporterId=supporter.rows[0]?.id;
 const newJoin=!supporterId;
 if(!supporterId){
  const added=await c.query<{id:number}>(
   "INSERT INTO public.featured_cause_supporters(cause_id,user_id,name,pledge_type,message) "+
   "VALUES($1,$2,$3,'coordination','Joined via unified Gavhah United case') RETURNING id",
   [causeId,userId,display]);
  supporterId=added.rows[0].id;
  await c.query("UPDATE public.featured_causes SET supporter_count=supporter_count+1 WHERE id=$1",[causeId]);
  await c.query(
   "INSERT INTO public.gavhah_united_case_events(cause_id,case_id,author_id,kind,details) "+
   "VALUES($1,$2,$3,'joined',$4)",
   [causeId,caseId,userId,"Official member joined United in Kindness"]);
 }
 if(newJoin){
  // Optional quota reservation only for separately approved Olam members.
  // Does NOT activate free SignalWire minutes until billing/webhook quota
  // enforcement has been deployed and verified.
  await c.query("SELECT pg_advisory_xact_lock($1::int,4242)",[causeId]);
  const policy=await c.query<{
   enabled:boolean;minutes_per_member:number;max_total_minutes:number;expiration_days:number
  }>("SELECT enabled,minutes_per_member,max_total_minutes,expiration_days "+
     "FROM public.gavhah_united_olam_bonus_policies WHERE cause_id=$1",[causeId]);
  const p=policy.rows[0];
  if(p?.enabled&&p.minutes_per_member>0){
   const allowed=await c.query("SELECT 1 FROM public.gavhah_olam_chesed_access "+
    "WHERE user_id=$1 AND status='linked'",[userId]);
   if(allowed.rowCount){
    const used=await c.query<{n:string}>(
     "SELECT coalesce(sum(minutes_allocated),0)::text AS n "+
     "FROM public.gavhah_united_olam_bonus_allocations WHERE cause_id=$1 AND status!='revoked'",[causeId]);
    if(p.max_total_minutes===0||Number(used.rows[0]?.n||0)+p.minutes_per_member<=p.max_total_minutes){
     const reserved=await c.query(
      "INSERT INTO public.gavhah_united_olam_bonus_allocations "+
      "(cause_id,member_id,minutes_allocated,status,expires_at) "+
      "VALUES($1,$2,$3,'reserved',now()+$4::integer*interval '1 day') "+
      "ON CONFLICT(cause_id,member_id) DO NOTHING RETURNING id",
      [causeId,userId,p.minutes_per_member,p.expiration_days]);
     if(reserved.rowCount){
      await c.query("INSERT INTO public.notifications(user_id,type,message,link_url) "+
       "VALUES($1,'united_olam_bonus',$2,'/my')",
       [userId,"An Olam Chesed bonus quota was reserved after joining. "+
         "This is not active SignalWire calling credit until the service confirms provider enforcement."]);
     }
    }
   }
  }
 }
 return {cause,caseId,supporterId,newJoin};
}
export function centsFromUnknown(amount:unknown):number|null{
 if(typeof amount!=="number"&&typeof amount!=="string")return null;
 const str=String(amount).trim();
 if(!/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/.test(str))return null;
 const [d,f=""]=str.split(".");
 const cents=Number(d)*100+Number(f.padEnd(2,"0"));
 return Number.isSafeInteger(cents)&&cents>0&&cents<=100000000000?cents:null;
}
export function isoDay(s:unknown):string|null{
 if(typeof s!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s))return null;
 const date=new Date(s+"T00:00:00Z");
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===s?s:null;
}
export function requestKeyValid(x:unknown):x is string{
 return typeof x==="string"&&/^[A-Za-z0-9_-]{16,96}$/.test(x);
}
export async function newUnitedPledge(c:PoolClient,input:{
 causeId:number;userId:number;amountCents:number;dueOn:string;source:"web"|"yemot";requestKey:string;
}):Promise<{pledgeId:number;caseId:number;status:string;newJoin:boolean;causeTitle:string;duplicate:boolean}>{
 // Both paths idempotent. Existing key is NEVER re-used for a different request.
 const prior=await c.query<{
  id:number;case_id:number;status:string;amount_cents:string;due_on:string;cause_id:number;
 }>("SELECT id,case_id,status,amount_cents,due_on::text,cause_id "+
  "FROM public.gavhah_united_pledges WHERE member_id=$1 AND request_key=$2",
  [input.userId,input.requestKey]);
 const old=prior.rows[0];
 if(old){
  if(old.cause_id!==input.causeId||Number(old.amount_cents)!==input.amountCents||
    old.due_on!==input.dueOn)throw new Error("REQUEST_KEY_CONFLICT");
  return {pledgeId:old.id,caseId:old.case_id,status:old.status,
   newJoin:false,causeTitle:"",duplicate:true};
 }
 const joined=await ensureUnitedCauseCase(c,input.userId,input.causeId);
 const limit=await c.query<{later:boolean,expired:boolean}>(
  "SELECT ($1::date > ((now() AT TIME ZONE 'America/New_York')::date + INTERVAL '2 months')::date) AS later,"+
  "($1::date < (now() AT TIME ZONE 'America/New_York')::date) AS expired",[input.dueOn]);
 if(limit.rows[0].expired)throw new Error("DUE_DATE_IN_PAST");
 const later=limit.rows[0].later;
 const status=later?"pending_team":"accepted_bln";
 const inserted=await c.query<{id:number}>(
  "INSERT INTO public.gavhah_united_pledges "+
  "(cause_id,member_id,case_id,amount_cents,due_on,status,source,request_key) "+
  "VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
  [input.causeId,input.userId,joined.caseId,input.amountCents,input.dueOn,status,input.source,input.requestKey]);
 const id=inserted.rows[0].id,usd=(input.amountCents/100).toFixed(2);
 await c.query(
  "INSERT INTO public.gavhah_united_case_events(cause_id,case_id,author_id,kind,details) "+
  "VALUES($1,$2,$3,'pledge',$4)",
  [input.causeId,joined.caseId,input.userId,
   "BLN $"+usd+" by "+input.dueOn+" — "+(later?"pending staff review":"accepted BLN")+" (pledge #"+id+")"]);
 await c.query(
  "INSERT INTO public.case_activity_log(case_id,date,type,note) "+
  "VALUES($1,now()::date,'note',$2)",
  [joined.caseId,"BLN pledge #"+id+" $"+usd+" due "+input.dueOn+" ("+status+"). Not received."]);
 if(!later)await acceptPledgeIntoCase(c,id,joined.caseId,input.amountCents,input.dueOn);
 return {pledgeId:id,caseId:joined.caseId,status,newJoin:joined.newJoin,
  causeTitle:joined.cause.title,duplicate:false};
}
export async function acceptPledgeIntoCase(
 c:PoolClient,pledgeId:number,caseId:number,amountCents:number,dueOn:string
){
 const amount=(amountCents/100).toFixed(2);
 await c.query(
  "UPDATE public.askanus_cases SET funds_promised=funds_promised+$2::numeric,last_updated=now() WHERE id=$1",
  [caseId,amount]);
 await c.query(
  "INSERT INTO public.case_followups(case_id,date,note,due_date) "+
  "VALUES($1,now()::date,$2,$3::date)",
  [caseId,"בל״נ אונטערנעמונג #"+pledgeId+": $"+amount+" ביז "+dueOn,dueOn]);
}
export async function newUnitedDonationIntent(c:PoolClient,input:{
 causeId:number;userId:number;amountCents:number|null;requestKey:string;source:"web"|"yemot"
}):Promise<{intentId:number;caseId:number;newJoin:boolean;duplicate:boolean}>{
 const prior=await c.query<{id:number;case_id:number;amount_cents:string|null;cause_id:number}>(
  "SELECT id,case_id,amount_cents,cause_id FROM public.gavhah_united_donation_intents "+
  "WHERE member_id=$1 AND request_key=$2",[input.userId,input.requestKey]);
 if(prior.rows[0]){
  const p=prior.rows[0];
  if(p.cause_id!==input.causeId||(p.amount_cents===null?null:Number(p.amount_cents))!==input.amountCents)
   throw new Error("REQUEST_KEY_CONFLICT");
  return {intentId:p.id,caseId:p.case_id,newJoin:false,duplicate:true};
 }
 const joined=await ensureUnitedCauseCase(c,input.userId,input.causeId);
 const record=await c.query<{id:number}>(
  "INSERT INTO public.gavhah_united_donation_intents "+
  "(cause_id,member_id,case_id,amount_cents,method,state,request_key) "+
  "VALUES($1,$2,$3,$4,'instructions','instructions_only',$5) RETURNING id",
  [input.causeId,input.userId,joined.caseId,input.amountCents,input.requestKey]);
 const id=record.rows[0].id;
 await c.query("INSERT INTO public.gavhah_united_case_events "+
  "(cause_id,case_id,author_id,kind,details) VALUES($1,$2,$3,'donation_intent',$4)",
  [input.causeId,joined.caseId,input.userId,
    "Member requested information to donate now (intent #"+id+
    "). No payment charged, no received funds counted."]);
 await c.query(
  "INSERT INTO public.case_activity_log(case_id,date,type,note) "+
  "VALUES($1,now()::date,'note',$2)",
  [joined.caseId,"Donation instructions requested (#"+id+"). NOT a completed payment."]);
 return {intentId:id,caseId:joined.caseId,newJoin:joined.newJoin,duplicate:false};
}
