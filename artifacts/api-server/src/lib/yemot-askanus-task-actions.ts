import type { PoolClient } from "pg";

/**
 * Canonical Gavhah My Askanus task mutations from a verified phone session.
 * Uses the SAME public.askanus_tasks / public.max_history_events as the site.
 * Phone session must be authenticated with the real account BEFORE calling.
 * Every update is owner-scoped (user_id) and auditing stays in the transaction.
 */
type TaskRow={
 id:number;title:string;completed:boolean;priority:"low"|"medium"|"high";
 deadline:string;notes:string;case_title:string;completed_at:Date|null;
};
export type TaskOperationResult={ok:boolean;message:string;id?:number};
const priorities=["low","medium","high"] as const;
function dateFromPad(text:string):string|null{
 if(!/^\d{8}$/.test(text))return null;
 const yyyy=Number(text.slice(0,4));
 const mm=Number(text.slice(4,6));
 const dd=Number(text.slice(6,8));
 if(yyyy<2020||yyyy>2100||mm<1||mm>12||dd<1||dd>31)return null;
 const check=new Date(Date.UTC(yyyy,mm-1,dd));
 if(check.getUTCFullYear()!==yyyy||check.getUTCMonth()!==mm-1||check.getUTCDate()!==dd)return null;
 return text.slice(0,4)+"-"+text.slice(4,6)+"-"+text.slice(6,8);
}
async function audit(client:PoolClient,userId:number,task:TaskRow,action:string,details:Record<string,unknown>={}){
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,NULL,'task',$2,$3,$4,$5)",[userId,task.id,action,task.title,
  JSON.stringify({source:"phone",...details})]);
}
async function owned(client:PoolClient,userId:number,id:number):Promise<TaskRow|null>{
 if(!Number.isSafeInteger(id)||id<=0)return null;
 const r=await client.query<TaskRow>(
  "SELECT id,title,completed,priority,deadline,notes,case_title,completed_at "+
  "FROM public.askanus_tasks WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);
 return r.rows[0]||null;
}
export async function createCallTask(client:PoolClient,userId:number,phone:string):Promise<TaskOperationResult>{
 if(!/^[0-9]{10,15}$/.test(phone))return {ok:false,message:"Enter a ten to fifteen digit callback number. No task was created."};
 const count=await client.query<{total:number}>(
  "SELECT count(*)::int AS total FROM public.askanus_tasks WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[userId]);
 if((count.rows[0]?.total||0)>=15)return {ok:false,message:"You reached the hourly phone task creation limit. Try again later."};
 const r=await client.query<TaskRow>(
  "INSERT INTO public.askanus_tasks(user_id,title,priority,notes,completed,deadline,case_title) "+
  "VALUES($1,$2,'medium',$3,false,'','') "+
  "RETURNING id,title,completed,priority,deadline,notes,case_title,completed_at",
  [userId,"Call "+phone,"Created through verified Gavhah hotline. Callback number: "+phone]);
 const created=r.rows[0];if(!created)return {ok:false,message:"Task could not be created."};
 await audit(client,userId,created,"task_created",{kind:"telephone_callback"});
 return {ok:true,id:created.id,message:"New callback task created on your Gavhah website. Task number "+created.id+"."};
}
export async function changePhoneTaskPriority(client:PoolClient,userId:number,id:number,digit:string):Promise<TaskOperationResult>{
 const priority=priorities[Number(digit)-1];
 if(!priority)return {ok:false,message:"Select 1 low, 2 medium or 3 high. No change made."};
 const before=await owned(client,userId,id);
 if(!before)return{ok:false,message:"The task no longer belongs to your account."};
 if(before.priority===priority)return{ok:true,message:"Priority already "+priority+". No change was needed."};
 await client.query("UPDATE public.askanus_tasks SET priority=$1 WHERE id=$2 AND user_id=$3",[priority,id,userId]);
 await audit(client,userId,{...before,priority},"task_edited",{field:"priority",from:before.priority,to:priority});
 return{ok:true,message:"Website task priority changed to "+priority+"."};
}
export async function changePhoneTaskDeadline(client:PoolClient,userId:number,id:number,raw:string):Promise<TaskOperationResult>{
 const when=raw==="0"?"":dateFromPad(raw);
 if(when===null)return{ok:false,message:"Invalid date. Enter YYYYMMDD, for example 20261130, or zero to clear the deadline."};
 const before=await owned(client,userId,id);
 if(!before)return{ok:false,message:"The task is not in your account."};
 if(before.deadline===when)return{ok:true,message:"The website task already has this deadline."};
 await client.query("UPDATE public.askanus_tasks SET deadline=$1 WHERE id=$2 AND user_id=$3",[when,id,userId]);
 await audit(client,userId,{...before,deadline:when},"task_edited",{field:"deadline",from:before.deadline,to:when});
 return{ok:true,message:when?"Website task deadline set to "+when+".":"Deadline cleared from website task."};
}
export async function setPhoneTaskCompleted(client:PoolClient,userId:number,id:number,completed:boolean):Promise<TaskOperationResult>{
 const before=await owned(client,userId,id);
 if(!before)return{ok:false,message:"The task was removed or belongs to another account."};
 if(before.completed===completed)return{ok:true,message:completed?"Task was already complete.":"Task was already unfinished."};
 await client.query(
  "UPDATE public.askanus_tasks SET completed=$1,completed_at="+(completed?"now()":"NULL")+
  " WHERE id=$2 AND user_id=$3",[completed,id,userId]);
 await audit(client,userId,{...before,completed},completed?"task_completed":"task_reopened",
  {from:before.completed,to:completed});
 return{ok:true,message:completed?"Task marked complete on your website.":"Task reopened on your website."};
}
export async function deletePhoneTask(client:PoolClient,userId:number,id:number):Promise<TaskOperationResult>{
 const before=await owned(client,userId,id);
 if(!before)return{ok:false,message:"The task is not available in your account."};
 const removed=await client.query(
  "DELETE FROM public.askanus_tasks WHERE id=$1 AND user_id=$2 RETURNING id",[id,userId]);
 if(!removed.rowCount)return{ok:false,message:"The task was already removed."};
 await audit(client,userId,before,"task_explicitly_deleted",{completed:before.completed,notes:before.notes});
 return{ok:true,message:"Task "+id+" deleted from your website. The deletion is recorded in your personal history."};
}
