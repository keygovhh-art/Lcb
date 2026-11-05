import type {PoolClient} from "pg";
import {readCauseChannel} from "../routes/gavhah-cause-channels";

export type DailyJoin={charityId:number;caseId:number;newJoin:boolean;causeTitle:string};
export type DailyPledge={pledgeId:number;caseId:number;status:string;duplicate:boolean;newJoin:boolean};
export type DailyDonationIntent={intentId:number;caseId:number;duplicate:boolean;newJoin:boolean};
export async function ensureDailyCase(client:PoolClient,member:number,charityId:number):Promise<DailyJoin>{
 if(!Number.isSafeInteger(member)||member<1||!Number.isSafeInteger(charityId)||charityId<1)
  throw Error("INVALID_MEMBER_OR_CHARITY");
 await client.query("SELECT pg_advisory_xact_lock($1::int,$2::int)",[charityId,member]);
 const [user,channel]=await Promise.all([
  client.query("SELECT id,nickname,name FROM public.users WHERE id=$1 AND status='active'",[member]),
  readCauseChannel(client,"daily")
 ]);
 if(!user.rows[0])throw Error("ACCOUNT_NOT_ACTIVE");
 if(!channel?.enabled||channel.cause?.id!==charityId)throw Error("NOT_CURRENT_DAILY_CAUSE");
 const c=channel.cause;
 const old=await client.query<{case_id:number}>(
  "SELECT case_id FROM public.gavhah_daily_joined "+
  "WHERE charity_id=$1 AND member_id=$2",[charityId,member]);
 if(old.rows[0])return {charityId,caseId:old.rows[0].case_id,newJoin:false,causeTitle:c.title};
 const existing=await client.query<{id:number}>(
  "SELECT id FROM public.askanus_cases WHERE user_id=$1 AND source_type='daily_charity' "+
  "AND source_id=$2 ORDER BY id LIMIT 1",[member,charityId]);
 let caseId=existing.rows[0]?.id;
 if(!caseId){
  const result=await client.query<{id:number}>(
   "INSERT INTO public.askanus_cases "+
   "(user_id,title,description,category,contact_name,notes,goal_amount,source_type,source_id) "+
   "VALUES($1,$2,$3,'General',$4,$5,$6,'daily_charity',$7) RETURNING id",
   [member,c.title.slice(0,240),String(c.description||"").slice(0,5000),
    String(user.rows[0].nickname||user.rows[0].name).slice(0,150),
    "Independent Today's Cause case. Do not combine financial totals with United in Kindness.",
    String(c.goalAmount||0),charityId]);
  caseId=result.rows[0].id;
  await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) "+
   "VALUES($1,current_date::text,'status_change','Official Today Cause case opened')",[caseId]);
 }
 await client.query("INSERT INTO public.gavhah_daily_joined(charity_id,member_id,case_id) "+
  "VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[charityId,member,caseId]);
 return {charityId,caseId,newJoin:true,causeTitle:c.title};
}
export async function newDailyPledge(client:PoolClient,input:{
 charityId:number;memberId:number;amountCents:number;dueOn:string;source:"web"|"yemot";requestKey:string
}):Promise<DailyPledge>{
 const old=await client.query<{id:number;case_id:number;amount_cents:string;due_on:string;charity_id:number;status:string}>(
  "SELECT id,case_id,amount_cents,due_on::text,charity_id,status FROM public.gavhah_daily_pledges "+
  "WHERE member_id=$1 AND request_key=$2",[input.memberId,input.requestKey]);
 if(old.rows[0]){
  const r=old.rows[0];
  if(r.charity_id!==input.charityId||Number(r.amount_cents)!==input.amountCents||
   r.due_on!==input.dueOn)throw Error("REQUEST_KEY_CONFLICT");
  return {pledgeId:r.id,caseId:r.case_id,status:r.status,newJoin:false,duplicate:true};
 }
 const joined=await ensureDailyCase(client,input.memberId,input.charityId);
 const d=await client.query<{past:boolean;later:boolean}>(
  "SELECT $1::date < (now() AT TIME ZONE 'America/New_York')::date AS past,"+
  " $1::date > ((now() AT TIME ZONE 'America/New_York')::date+INTERVAL '2 months')::date AS later",
  [input.dueOn]);
 if(d.rows[0].past)throw Error("DUE_DATE_IN_PAST");
 const status=d.rows[0].later?"pending_team":"accepted_bln";
 const result=await client.query<{id:number}>(
  "INSERT INTO public.gavhah_daily_pledges "+
  "(charity_id,member_id,case_id,amount_cents,due_on,status,source,request_key) "+
  "VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
  [input.charityId,input.memberId,joined.caseId,input.amountCents,input.dueOn,status,
   input.source,input.requestKey]);
 const pledgeId=result.rows[0].id;
 await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) "+
  "VALUES($1,current_date::text,'note',$2)",
  [joined.caseId,"Today's Cause BLN pledge #"+pledgeId+" $"+
   (input.amountCents/100).toFixed(2)+" due "+input.dueOn+
   " — "+status+"; not money received."]);
 if(status==="accepted_bln")await acceptDailyPledge(client,joined.caseId,pledgeId,input.amountCents,input.dueOn);
 return {pledgeId,caseId:joined.caseId,status,duplicate:false,newJoin:joined.newJoin};
}
export async function acceptDailyPledge(client:PoolClient,caseId:number,pledgeId:number,cents:number,dueOn:string){
 const amount=(cents/100).toFixed(2);
 await client.query("UPDATE public.askanus_cases SET funds_promised=funds_promised+$2::numeric,"+
  "last_updated=now() WHERE id=$1",[caseId,amount]);
 await client.query("INSERT INTO public.case_followups(case_id,date,note,due_date) "+
  "VALUES($1,current_date::text,$2,$3)",[
  caseId,"Today's Cause BLN pledge #"+pledgeId+" $"+amount+" due "+dueOn,dueOn]);
}
export async function newDailyDonationIntent(client:PoolClient,input:{
 charityId:number;memberId:number;amountCents:number|null;source:"web"|"yemot";requestKey:string
}):Promise<DailyDonationIntent>{
 const prior=await client.query<{id:number;case_id:number;amount_cents:string|null;charity_id:number}>(
  "SELECT id,case_id,amount_cents,charity_id FROM public.gavhah_daily_donation_intents "+
  "WHERE member_id=$1 AND request_key=$2",[input.memberId,input.requestKey]);
 if(prior.rows[0]){
  const d=prior.rows[0];
  if(d.charity_id!==input.charityId||
    (d.amount_cents===null?null:Number(d.amount_cents))!==input.amountCents)throw Error("REQUEST_KEY_CONFLICT");
  return {intentId:d.id,caseId:d.case_id,newJoin:false,duplicate:true};
 }
 const joined=await ensureDailyCase(client,input.memberId,input.charityId);
 const result=await client.query<{id:number}>(
  "INSERT INTO public.gavhah_daily_donation_intents "+
  "(charity_id,member_id,case_id,amount_cents,request_key) "+
  "VALUES($1,$2,$3,$4,$5) RETURNING id",
  [input.charityId,input.memberId,joined.caseId,input.amountCents,input.requestKey]);
 await client.query("INSERT INTO public.case_activity_log(case_id,date,type,note) "+
  "VALUES($1,current_date::text,'note',$2)",
  [joined.caseId,"Today's Cause donation information requested #"+result.rows[0].id+
   ". No money charged or verified."]);
 return {intentId:result.rows[0].id,caseId:joined.caseId,newJoin:joined.newJoin,duplicate:false};
}
