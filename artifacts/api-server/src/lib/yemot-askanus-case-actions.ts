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
