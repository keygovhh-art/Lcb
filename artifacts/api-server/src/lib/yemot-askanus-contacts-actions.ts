import type {PoolClient} from "pg";

// Every lookup/mutation is restricted to the MEMBER who completed a verified
// Gavhah website-to-phone login. A caller ID alone is NEVER a member identity.
export type OwnedPhoneContact={
 id:number;name:string;phone:string;organization:string;city:string;
 contact_role:string;do_not_call:boolean;preferred_hours:string;
};
type Result={ok:boolean;message:string;id?:number};
export async function readMyContact(client:PoolClient,userId:number,page:number):Promise<OwnedPhoneContact|null>{
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(page)||page<0||page>100000)return null;
 const r=await client.query<OwnedPhoneContact>(
  "SELECT id,name,phone,organization,city,contact_role,do_not_call,preferred_hours "+
  "FROM public.communication_contacts WHERE user_id=$1 "+
  "ORDER BY updated_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,page]);
 return r.rows[0]||null;
}
export async function findMyContactPage(client:PoolClient,userId:number,query:string,mode:"phone"|"id"){
 if(!Number.isSafeInteger(userId)||userId<=0)return null;
 if(mode==="phone"&&!/^[0-9]{10,15}$/.test(query))return null;
 if(mode==="id"&&!/^[1-9][0-9]{0,7}$/.test(query))return null;
 // Accept phone numbers formatted on the site with separators but never scan
 // another member's contacts. The direct ID variant is an exact owner match.
 const match=mode==="phone"?
  "regexp_replace(c.phone,'[^0-9]','','g')=$2":
  "c.id=$2::integer";
 const target=await client.query<{id:number;page:number}>(
  "SELECT c.id,(SELECT count(*)::int FROM public.communication_contacts newer "+
  "WHERE newer.user_id=$1 AND (newer.updated_at,newer.id)>(c.updated_at,c.id)) AS page "+
  "FROM public.communication_contacts c WHERE c.user_id=$1 AND "+match+
  " ORDER BY c.updated_at DESC,c.id DESC LIMIT 1",[userId,query]);
 return target.rows[0]||null;
}
export async function createMyCallbackContact(client:PoolClient,userId:number,phone:string):Promise<Result>{
 if(!Number.isSafeInteger(userId)||userId<=0||!/^[0-9]{10,15}$/.test(phone))
  return {ok:false,message:"Enter a ten to fifteen digit contact phone number."};
 const count=await client.query<{total:number}>(
  "SELECT count(*)::int AS total FROM public.communication_contacts "+
  "WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[userId]);
 if(Number(count.rows[0]?.total||0)>=10)
  return {ok:false,message:"Hourly limit reached. No contact was created."};
 const already=await findMyContactPage(client,userId,phone,"phone");
 if(already)return {ok:true,id:already.id,message:"This contact number already exists in your own Gavhah account. Contact ID "+already.id+"."};
 const created=await client.query<{id:number;name:string}>(
  "INSERT INTO public.communication_contacts(user_id,name,phone,notes) "+
  "VALUES($1,$2,$3,$4) RETURNING id,name",
  [userId,"Phone contact "+phone,phone,
   "Contact added through authenticated Gavhah hotline. Number not independently verified; no outreach consent assumed."]);
 const item=created.rows[0];
 if(!item)return {ok:false,message:"Contact was not created."};
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,NULL,'contact',$2,'contact_created',$3,$4)",
  [userId,item.id,item.name,JSON.stringify({source:"phone",phone,phoneVerified:false,outboundCallMade:false})]);
 return {ok:true,id:item.id,message:"Contact "+item.id+" saved to your private Gavhah website contacts. No call or text was sent."};
}
export async function markMyContactDoNotCall(client:PoolClient,userId:number,id:number):Promise<Result>{
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(id)||id<=0)
  return {ok:false,message:"No valid contact selected."};
 const contact=await client.query<OwnedPhoneContact>(
  "SELECT id,name,phone,organization,city,contact_role,do_not_call,preferred_hours "+
  "FROM public.communication_contacts WHERE id=$1 AND user_id=$2 FOR UPDATE",[id,userId]);
 const row=contact.rows[0];
 if(!row)return {ok:false,message:"This contact does not belong to your account."};
 if(row.do_not_call)return {ok:true,message:"Contact is already marked Do Not Call."};
 await client.query(
  "UPDATE public.communication_contacts SET do_not_call=true,"+
  "opt_out_reason='Marked do not call by authenticated member through phone API',updated_at=now() "+
  "WHERE id=$1 AND user_id=$2",[id,userId]);
 await client.query(
  "INSERT INTO public.max_history_events(user_id,case_id,entity_type,entity_id,action,title,details) "+
  "VALUES($1,NULL,'contact',$2,'contact_marked_do_not_call',$3,$4)",
  [userId,id,row.name,JSON.stringify({source:"phone",from:false,to:true})]);
 return{ok:true,message:"Do Not Call flag saved on the website. To remove it, use the site permission and audit workflow."};
}
