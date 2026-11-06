import type {PoolClient} from "pg";

export type ApplicationKind = "volunteer"|"help";
export type MemberApplication = {
  kind:ApplicationKind;id:number;title:string;status:string;createdAt:string;
  followupCount:number;latestFollowupAt:string|null;
};
const validId=(n:unknown)=>Number.isSafeInteger(Number(n))&&Number(n)>0&&Number(n)<100000000;
export async function readMemberApplications(client:PoolClient,userId:number):Promise<MemberApplication[]>{
 if(!validId(userId))return [];
 const [volunteers,requests,followups]=await Promise.all([
  client.query<{id:number;created_at:string;review_state:string}>(
   "SELECT v.id,v.created_at::text, "+
   "CASE WHEN EXISTS (SELECT 1 FROM public.support_messages s WHERE s.user_id=v.user_id "+
   "AND s.type='volunteer_registration' AND s.status='resolved' AND s.created_at>=v.created_at) "+
   "THEN 'staff_processed' ELSE 'received' END AS review_state "+
   "FROM public.volunteer_profiles v WHERE v.user_id=$1 ORDER BY v.created_at DESC",[userId]),
  client.query<{id:number;need_type:string;status:string;created_at:string}>(
   "SELECT id,need_type,status,created_at::text FROM public.help_requests "+
   "WHERE user_id=$1 ORDER BY created_at DESC",[userId]),
  client.query<{subject:string;total:number;latest_at:string|null}>(
   "SELECT subject,COUNT(*)::int AS total,MAX(created_at)::text AS latest_at "+
   "FROM public.support_messages WHERE user_id=$1 AND type='profile_application_followup' "+
   "GROUP BY subject",[userId])
 ]);
 const followMap=new Map(followups.rows.map(x=>[x.subject,x]));
 const entry=(kind:ApplicationKind,id:number,title:string,status:string,createdAt:string):MemberApplication=>{
  const f=followMap.get(kind+":"+id);
  return{kind,id,title,status,createdAt,followupCount:Number(f?.total||0),latestFollowupAt:f?.latest_at||null};
 };
 return [
  ...volunteers.rows.map(v=>entry("volunteer",v.id,"איך וויל העלפן",v.review_state,v.created_at)),
  ...requests.rows.map(r=>entry("help",r.id,r.need_type,r.status,r.created_at)),
 ].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id-a.id);
}
export async function saveMemberApplicationFollowup(
 client:PoolClient,userId:number,kind:ApplicationKind,id:number,message:string
):Promise<{id:number}>{
 if(!validId(userId)||!validId(id)||!["volunteer","help"].includes(kind))
  throw new Error("Invalid application");
 const clean=message.trim();
 if(clean.length<4||clean.length>2000||/[\u0000-\u0008\u000b\u000e-\u001f]/.test(clean))
  throw new Error("Follow-up message must be 4 to 2000 characters");
 const owner=await client.query<{id:number}>(
  kind==="volunteer"?
   "SELECT id FROM public.volunteer_profiles WHERE id=$1 AND user_id=$2":
   "SELECT id FROM public.help_requests WHERE id=$1 AND user_id=$2",[id,userId]);
 if(!owner.rowCount)throw new Error("Application not found in this member account");
 const subject=kind+":"+id;
 const recent=await client.query<{num:number}>(
  "SELECT COUNT(*)::int AS num FROM public.support_messages "+
  "WHERE user_id=$1 AND type='profile_application_followup' "+
  "AND subject=$2 AND created_at>now()-interval '24 hours'",[userId,subject]);
 if(Number(recent.rows[0]?.num||0)>=8)throw new Error("Too many follow-ups for this application today");
 const member=await client.query<{name:string;email:string|null;phone:string|null}>(
  "SELECT name,email,phone FROM public.users WHERE id=$1 AND status='active'",[userId]);
 if(!member.rows[0])throw new Error("Active member account required");
 const name=member.rows[0].name.slice(0,150);
 const email=member.rows[0].email||member.rows[0].phone||"member@internal.invalid";
 const created=await client.query<{id:number}>(
  "INSERT INTO public.support_messages(user_id,name,email,type,subject,message,status) "+
  "VALUES($1,$2,$3,'profile_application_followup',$4,$5,'open') RETURNING id",
  [userId,name,email,subject,clean]);
 return{id:created.rows[0].id};
}
