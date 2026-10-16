import type { PoolClient } from "pg";
type Followup={
 id:number;case_id:number;note:string;due_date:string|null;due_time:string|null;
 completed:boolean;completed_at:Date|null;repeat_rule:string|null;
};
/**
 * Reads precisely the same case_followups as My Askanus, scoped through the
 * member's own parent case. Phone completion currently accepts only
 * non-recurring followups; the website's recurring-series generation is
 * intentionally NOT bypassed or approximated here.
 */
export async function readMyFollowup(client:PoolClient,userId:number,page:number):Promise<Followup|null>{
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(page)||page<0||page>500)
  return null;
 const r=await client.query<Followup>(
  "SELECT f.id,f.case_id,f.note,f.due_date,f.due_time,f.completed,f.completed_at,f.repeat_rule "+
  "FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id "+
  "WHERE c.user_id=$1 ORDER BY f.completed ASC, NULLIF(f.due_date,'') ASC NULLS LAST,f.created_at DESC,f.id DESC "+
  "LIMIT 1 OFFSET $2",[userId,page]);
 return r.rows[0]||null;
}
export async function setMySimpleFollowupCompleted(
 client:PoolClient,userId:number,followupId:number,desired:boolean
):Promise<{ok:boolean;message:string}>{
 if(!Number.isSafeInteger(userId)||!Number.isSafeInteger(followupId)||followupId<=0)
  return {ok:false,message:"No followup was selected."};
 const r=await client.query<Followup>(
  "SELECT f.id,f.case_id,f.note,f.due_date,f.due_time,f.completed,f.completed_at,f.repeat_rule "+
  "FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id "+
  "WHERE f.id=$1 AND c.user_id=$2 FOR UPDATE OF f",[followupId,userId]);
 const f=r.rows[0];
 if(!f)return{ok:false,message:"Followup is not available in your Gavhah account."};
 if(f.repeat_rule&&f.repeat_rule!=="none"){
  return {ok:false,message:"This is a recurring followup. Please complete it on the website so the next followup is generated correctly. The phone did not change it."};
 }
 if(f.completed===desired)return{ok:true,message:desired?"Followup was already complete.":"Followup was already open."};
 const updated=await client.query(
  "UPDATE public.case_followups SET completed=$1,completed_at="+
  (desired?"now()":"NULL")+" WHERE id=$2 AND completed=$3 RETURNING id",
  [desired,followupId,!desired]);
 if(!updated.rowCount)return{ok:false,message:"Followup was changed during this request; please retry."};
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,$2,'followup',$3,$4,$5,$6)",
  [userId,f.case_id,followupId,desired?"followup_completed":"followup_reopened",
   f.note.slice(0,240),JSON.stringify({source:"phone",completed:desired,
    previousCompleted:f.completed,dueDate:f.due_date,dueTime:f.due_time,repeatRule:"none"})]);
 return{ok:true,message:desired?
  "Your followup was marked complete on the Gavhah website and saved in its history.":
  "Your followup was reopened on the Gavhah website and saved in its history."};
}
