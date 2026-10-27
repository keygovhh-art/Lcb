import type {PoolClient} from "pg";

/**
 * Verified-member phone actions for Olam Hachesed.
 * The caller's number is NEVER proof of ownership. The IVR verifies a
 * one-time linked Gavhah member before calling these helpers.
 * All writes run inside the IVR's transaction and are owner-scoped.
 */
type CaseStatus="open"|"in_progress"|"closed";
type OwnedCase={id:number;status:CaseStatus};

export async function currentOwnedCase(client:PoolClient,userId:number,page:number):Promise<OwnedCase|null>{
 const r=await client.query<OwnedCase>(
  "SELECT id,status FROM public.askanus_cases WHERE user_id=$1 "+
  "ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2 FOR UPDATE",
  [userId,Math.max(0,Math.min(40,page))]
 );
 return r.rows[0]||null;
}

export function caseConfirmationToken(caseId:number,choice:string):number|null{
 const code=Number(choice);
 if(!Number.isSafeInteger(caseId)||caseId<=0||caseId>200000000||![5,6,7,9].includes(code))return null;
 return caseId*10+code;
}

export async function applyPhoneCaseAction(client:PoolClient,userId:number,id:number,choice:string):Promise<string>{
 const selected=await client.query<OwnedCase>(
  "SELECT id,status FROM public.askanus_cases WHERE id=$1 AND user_id=$2 FOR UPDATE",
  [id,userId]
 );
 const old=selected.rows[0];
 if(!old)return "This case is not available in your account.";
 const today=new Date().toISOString().slice(0,10);
 if(choice==="9"){
  await client.query(
   "INSERT INTO public.case_followups(case_id,date,note,due_date) VALUES($1,$2,$3,NULL)",
   [id,today,"Follow-up requested using a verified phone session. Add the due date and details on the website."]
  );
  await client.query(
   "INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,$2,'note',$3)",
   [id,today,"Unscheduled phone follow-up added by linked member."]
  );
  await client.query("UPDATE public.askanus_cases SET last_updated=now() WHERE id=$1 AND user_id=$2",[id,userId]);
  return "An unscheduled follow up was added to case "+id+". Choose its date on the website.";
 }
 const target:CaseStatus|undefined=choice==="5"?"in_progress":choice==="6"?"closed":choice==="7"?"open":undefined;
 if(!target)return "Invalid case action.";
 if(old.status===target)return "Case "+id+" already has this status.";
 if(choice==="5"&&old.status==="closed")
  return "This case is closed. Press 7 twice to reopen before marking in progress.";
 if(choice==="7"&&old.status!=="closed")
  return "This case is already open or in progress.";
 const result=await client.query(
  "UPDATE public.askanus_cases SET status=$3::askanus_status,"+
  "closed_at=CASE WHEN $3='closed' THEN now() ELSE NULL END,last_updated=now() "+
  "WHERE id=$1 AND user_id=$2 RETURNING id",
  [id,userId,target]
 );
 if(!result.rowCount)return "This case is no longer available.";
 await client.query(
  "INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,$2,'status_change',$3)",
  [id,today,"Verified phone session changed status from "+old.status+" to "+target]
 );
 return "Case "+id+" status changed to "+target.replace("_"," ")+". The website now uses the same record.";
}

export async function createTelephoneCaseDraft(client:PoolClient,userId:number):Promise<string>{
 const now=new Date(),today=now.toISOString().slice(0,10);
 const record=await client.query<{id:number}>(
  "INSERT INTO public.askanus_cases(user_id,title,description,status,urgency,category) "+
  "VALUES($1,$2,$3,'open','medium','General') RETURNING id",
  [userId,"Telephone case draft "+today,"Created by verified member using the Olam Hachesed phone menu. Add identifying details privately on the website."]
 );
 const id=record.rows[0].id;
 await client.query(
  "INSERT INTO public.case_activity_log(case_id,date,type,note) VALUES($1,$2,'status_change',$3)",
  [id,today,"Draft case opened from verified telephone session"]
 );
 return "Draft case "+id+" created in your own account. Add the details privately on the website before sharing it.";
}

export async function telephoneCaseFollowup(client:PoolClient,userId:number,page:number):Promise<string>{
 const r=await client.query<{id:number;case_id:number;due_date:string|null;completed:boolean}>(
  "SELECT f.id,f.case_id,f.due_date,f.completed FROM public.case_followups f "+
  "JOIN public.askanus_cases c ON c.id=f.case_id "+
  "WHERE c.user_id=$1 ORDER BY f.created_at DESC,f.id DESC LIMIT 1 OFFSET $2",
  [userId,Math.max(0,Math.min(40,page))]
 );
 const f=r.rows[0];
 if(!f)return "No case follow ups found. Press zero for the main menu.";
 return "Follow up "+(page+1)+" for case "+f.case_id+". "+
  (f.completed?"Completed. ":"Not completed. ")+
  (f.due_date?"Due "+f.due_date+". ":"No due date set. ")+
  "Press 1 for next, 8 for previous, 2 to restart, or zero for main menu.";
}

export async function telephoneCaseSummary(client:PoolClient,userId:number):Promise<string>{
 const r=await client.query<{total:number;open:number;active:number;closed:number}>(
  "SELECT count(*)::int AS total,"+
  "count(*) FILTER (WHERE status='open')::int AS open,"+
  "count(*) FILTER (WHERE status='in_progress')::int AS active,"+
  "count(*) FILTER (WHERE status='closed')::int AS closed "+
  "FROM public.askanus_cases WHERE user_id=$1",[userId]
 );
 const x=r.rows[0];
 return "Your Olam Hachesed cases. "+x.total+" total. "+x.open+
  " open. "+x.active+" in progress. "+x.closed+
  " closed. Press zero for the main menu.";
}
