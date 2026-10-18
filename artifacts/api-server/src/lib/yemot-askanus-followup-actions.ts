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


// Next staged phone parity: a member can change a simple follow-up due date
// or explicitly delete it from their OWN case. All changes share the same
// canonical case_followups and max_history_events rows as the website.
function isoDateFromDtmf(raw:string):string|null{
 if(!/^\d{8}$/.test(raw))return null;
 const yr=Number(raw.slice(0,4)),mo=Number(raw.slice(4,6)),dy=Number(raw.slice(6,8));
 if(yr<2020||yr>2100||mo<1||mo>12||dy<1||dy>31)return null;
 const when=new Date(Date.UTC(yr,mo-1,dy));
 if(when.getUTCFullYear()!==yr||when.getUTCMonth()+1!==mo||when.getUTCDate()!==dy)return null;
 return raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8);
}
export async function changeMyFollowupDueDate(
 client:PoolClient,userId:number,id:number,raw:string
):Promise<{ok:boolean;message:string}>{
 const date=isoDateFromDtmf(raw);
 if(!date)return{ok:false,message:"Enter the date as eight digits, year month day, for example 20261130. No change has been made."};
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(id)||id<=0)
  return{ok:false,message:"A member-owned followup must be selected."};
 const result=await client.query<Followup>(
  "SELECT f.id,f.case_id,f.note,f.due_date,f.due_time,f.completed,f.completed_at,f.repeat_rule "+
  "FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id "+
  "WHERE f.id=$1 AND c.user_id=$2 FOR UPDATE OF f",[id,userId]);
 const before=result.rows[0];
 if(!before)return{ok:false,message:"Followup no longer exists in your Gavhah account."};
 if(before.completed)return{ok:false,message:"Reopen this followup before changing its date."};
 if(before.due_date===date)return{ok:true,message:"This followup already has that website due date."};
 // Preserve recurrence rule, anchor, reminder time and timezone exactly.
 await client.query(
  "UPDATE public.case_followups SET due_date=$1 WHERE id=$2 AND case_id=$3",
  [date,id,before.case_id]);
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,$2,'followup',$3,'followup_edited',$4,$5)",
  [userId,before.case_id,id,before.note.slice(0,240),
    JSON.stringify({source:"phone",field:"dueDate",before:before.due_date,after:date,
      repeatRule:before.repeat_rule,timeNotAltered:true})]);
 return{ok:true,message:"Followup due date saved to "+date+" on your website. Recurring settings and reminder time were kept."};
}
export async function deleteMyFollowupFromPhone(
 client:PoolClient,userId:number,id:number
):Promise<{ok:boolean;message:string}>{
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(id)||id<=0)
  return{ok:false,message:"No valid followup is selected."};
 const result=await client.query<Followup>(
  "SELECT f.id,f.case_id,f.note,f.due_date,f.due_time,f.completed,f.completed_at,f.repeat_rule "+
  "FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id "+
  "WHERE f.id=$1 AND c.user_id=$2 FOR UPDATE OF f",[id,userId]);
 const before=result.rows[0];
 if(!before)return{ok:false,message:"This followup is no longer in your Gavhah account."};
 const deleted=await client.query(
  "DELETE FROM public.case_followups WHERE id=$1 AND case_id=$2 RETURNING id",
  [id,before.case_id]);
 if(!deleted.rowCount)return{ok:false,message:"The followup was already deleted."};
 // Audit avoids copying the entire private note into a phone event.
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,$2,'followup',$3,'followup_explicitly_deleted',$4,$5)",
  [userId,before.case_id,id,before.note.slice(0,240),
    JSON.stringify({source:"phone",confirmation:"selected then 9",date:before.due_date,
      hadReminderTime:!!before.due_time,completed:before.completed,repeatRule:before.repeat_rule})]);
 return{ok:true,message:"Followup deleted from your Gavhah website and recorded in your case history."};
}
