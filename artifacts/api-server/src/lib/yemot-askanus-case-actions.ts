import type { PoolClient } from "pg";
type CaseRow={id:number;title:string;status:string;urgency:string;closed_at:Date|null};
const statuses=["open","in_progress","closed"] as const;
const levels=["low","medium","high","critical"] as const;
export async function updateMyCaseOnPhone(
 client:PoolClient,userId:number,caseId:number,action:"status"|"urgency",digit:string
):Promise<{ok:boolean;message:string}>{
 if(!Number.isSafeInteger(userId)||!Number.isSafeInteger(caseId)||caseId<=0)
  return{ok:false,message:"No valid member-owned case was selected."};
 const choices=action==="status"?statuses:levels;
 const value=choices[Number(digit)-1];
 if(!value)return{ok:false,message:action==="status"?
  "Press 1 open, 2 in progress, 3 closed.":
  "Press 1 low, 2 medium, 3 high, 4 critical."};
 const row=await client.query<CaseRow>(
  "SELECT id,title,status,urgency,closed_at FROM public.askanus_cases "+
  "WHERE id=$1 AND user_id=$2 FOR UPDATE",[caseId,userId]);
 const before=row.rows[0];
 if(!before)return{ok:false,message:"This case was removed or does not belong to your Gavhah account."};
 if(before[action]===value)return{ok:true,message:"Your website case is already "+value.replace("_"," ")+". No change needed."};
 if(action==="status"){
  await client.query(
   "UPDATE public.askanus_cases SET status=$1,last_updated=now(),"+
   "closed_at=CASE WHEN $1='closed' THEN COALESCE(closed_at,now()) ELSE NULL END "+
   "WHERE id=$2 AND user_id=$3",[value,caseId,userId]);
 }else{
  await client.query(
   "UPDATE public.askanus_cases SET urgency=$1,last_updated=now() "+
   "WHERE id=$2 AND user_id=$3",[value,caseId,userId]);
 }
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,$2,'case',$2,$3,$4,$5)",
  [userId,caseId,
   action==="urgency"?"case_urgency_changed":
    value==="closed"?"case_completed":value==="open"?"case_reopened":"case_status_changed",
   "Case "+(action==="status"?"status":"urgency")+" changed",
   JSON.stringify({source:"phone",field:action,from:before[action],to:value})]);
 return{ok:true,message:"Your Gavhah website case "+(action==="status"?"status":"urgency")+
  " changed to "+value.replace("_"," ")+". This event was added to your website history."};
}


/**
 * Creates a basic "contact this number" case in the *same* My Askanus site
 * records. No unverified third-party claim, financial amount, or contact
 * membership is created. Case description indicates telephone origin.
 */
export async function createCallbackCase(
 client:PoolClient,userId:number,contactNumber:string
):Promise<{ok:boolean;message:string;id?:number}>{
 if(!Number.isSafeInteger(userId)||userId<=0||!/^[0-9]{10,15}$/.test(contactNumber))
  return{ok:false,message:"Enter a ten to fifteen digit contact number to open a callback case."};
 const count=await client.query<{total:number}>(
  "SELECT count(*)::int AS total FROM public.askanus_cases WHERE user_id=$1 AND created_at>now()-interval '1 hour'",
  [userId]);
 if(Number(count.rows[0]?.total||0)>=10)return {ok:false,message:"Hourly case creation limit reached. Try again later."};
 const title="Callback case "+contactNumber;
 const created=await client.query<{id:number}>(
  "INSERT INTO public.askanus_cases(user_id,title,description,status,urgency,category,notes) "+
  "VALUES($1,$2,$3,'open','medium','General',$4) RETURNING id",
  [userId,title,"Phone-origin callback case. Contact: "+contactNumber,
   "Created from the verified Gavhah telephone member account"]);
 const id=created.rows[0]?.id;
 if(!id)return{ok:false,message:"Case was not created."};
 const now=await client.query<{today:string}>(
  "SELECT to_char(now() AT TIME ZONE 'America/New_York','YYYY-MM-DD') AS today");
 await client.query(
  "INSERT INTO public.case_activity_log(case_id,date,type,note) "+
  "VALUES($1,$2,'status_change','Case opened from the authenticated Gavhah hotline')",
  [id,now.rows[0]?.today]);
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,$2,'case',$2,'case_created',$3,$4)",
  [userId,id,title,JSON.stringify({source:"phone",kind:"callback",fundsChanged:false})]);
 return{ok:true,id,message:"New case "+id+" created on your Gavhah website. Contact telephone saved. No financial record was changed."};
}

/** Adds a NON-RECURRING, date-only followup to an owned case. */
export async function createCaseFollowupFromPad(
 client:PoolClient,userId:number,caseId:number,yyyyMMdd:string
):Promise<{ok:boolean;message:string}>{
 const match=/^(\d{4})(\d{2})(\d{2})$/.exec(yyyyMMdd);
 if(!match)return{ok:false,message:"Enter eight digits for date YYYYMMDD."};
 const yyyy=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const real=new Date(Date.UTC(yyyy,month-1,day));
 if(yyyy<2020||yyyy>2100||real.getUTCFullYear()!==yyyy||
    real.getUTCMonth()!==month-1||real.getUTCDate()!==day)
  return{ok:false,message:"Invalid date. No followup was created."};
 const due=match[1]+"-"+match[2]+"-"+match[3];
 const caseRow=await client.query<{id:number;title:string}>(
  "SELECT id,title FROM public.askanus_cases WHERE id=$1 AND user_id=$2 FOR UPDATE",
  [caseId,userId]);
 const parent=caseRow.rows[0];
 if(!parent)return{ok:false,message:"This case does not belong to your Gavhah website account."};
 const count=await client.query<{total:number}>(
  "SELECT count(*)::int AS total FROM public.case_followups WHERE case_id=$1 "+
  "AND created_at>now()-interval '1 hour'",[caseId]);
 if(Number(count.rows[0]?.total||0)>=12)
  return{ok:false,message:"Too many new reminders for this case in the last hour."};
 const row=await client.query<{id:number}>(
  "INSERT INTO public.case_followups(case_id,date,note,due_date,due_time,time_zone,repeat_rule,completed) "+
  "VALUES($1,to_char(now() AT TIME ZONE 'America/New_York','YYYY-MM-DD'),$2,$3,NULL,'America/New_York','none',false) "+
  "RETURNING id",
  [caseId,"Call about "+parent.title,due]);
 const id=row.rows[0]?.id;
 if(!id)return{ok:false,message:"Followup was not created."};
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,$2,'followup',$3,'followup_created',$4,$5)",
  [userId,caseId,id,"Follow up "+parent.title,
    JSON.stringify({source:"phone",dueDate:due,repeatRule:"none",timeSpecified:false})]);
 return{ok:true,message:"A non recurring website followup was created for case "+
  caseId+" on "+due+". No appointment time was assumed."};
}
