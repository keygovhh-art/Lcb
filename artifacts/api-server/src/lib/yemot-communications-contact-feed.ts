import type { PoolClient } from "pg";

export type ContactFeed="131"|"132"|"1331"|"1332";
export function isContactFeed(path:string):path is ContactFeed{
 return path==="131"||path==="132"||path==="1331"||path==="1332";
}
function say(value:unknown,max=90){
 const raw=String(value??"").replace(/<[^>]*>/g," ").replace(/https?:\/\/\S+/g," ");
 if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(raw))return "available on your website";
 return raw.replace(/[^a-zA-Z0-9 !?'/$]/g," ").replace(/\s+/g," ").trim().slice(0,max)||"not provided";
}
function money(raw:unknown){
 const n=Number(raw);
 return Number.isFinite(n)&&n>=0?n.toFixed(2):"unavailable";
}
/**
 * PRIVATE read-only equivalents of the existing /communications sections.
 * Each query is scoped to the authenticated website member user_id. No
 * caller-ID-based auth, no undocumented outbound call, no donation mutation.
 */
export async function readContactFeed(client:PoolClient,userId:number,path:ContactFeed,page:number):Promise<string>{
 if(!Number.isSafeInteger(userId)||userId<=0||!Number.isSafeInteger(page)||page<0||page>5000)
  return "Invalid account or list position. Press zero for main menu.";
 if(path==="131"||path==="132"){
  const rows=await client.query<{
   id:number;name:string;organization:string|null;city:string|null;
   phone:string|null;contact_role:string|null;do_not_call:boolean;
   preferred_timezone:string|null;preferred_hours:string|null;
   pledged:string;paid:string;receipts:string;
  }>(
   "SELECT c.id,c.name,c.organization,c.city,c.phone,c.contact_role,c.do_not_call,"+
   "c.preferred_timezone,c.preferred_hours,"+
   "COALESCE((SELECT SUM(p.amount) FROM public.max_pledges p WHERE p.user_id=$1 AND p.contact_id=c.id),0)::text AS pledged,"+
   "COALESCE((SELECT SUM(p.paid_amount) FROM public.max_pledges p WHERE p.user_id=$1 AND p.contact_id=c.id),0)::text AS paid,"+
   "COALESCE((SELECT SUM(r.amount-r.refunded_amount) FROM public.max_receipts r WHERE r.user_id=$1 AND r.contact_id=c.id),0)::text AS receipts "+
   "FROM public.communication_contacts c WHERE c.user_id=$1 "+
   "ORDER BY c.created_at DESC,c.id DESC LIMIT 1 OFFSET $2",[userId,page]);
  const x=rows.rows[0];
  if(!x)return "End of your personal contacts. Press 2 to restart, 9 to search by phone number, or zero for main menu.";
  const prefix=path==="131"?"My donor overview":"My contact";
  const person=say(x.name,75)+" "+(x.organization?"organization "+say(x.organization,65)+" ":"")+
   (x.city?"city "+say(x.city,45)+" ":"");
  const safeStatus=x.do_not_call?"Do Not Call restriction is ACTIVE. Do not call this contact. ":
   "The contact is not flagged Do Not Call. This does not itself establish consent to call. ";
  return prefix+" number "+(page+1)+". "+person+
   ". Contact identifier "+x.id+". Role "+say(x.contact_role,35)+". "+
   (x.phone?"Contact telephone "+x.phone+". ":"")+
   safeStatus+
   (path==="131"?"Total recorded pledges "+money(x.pledged)+
     " dollars. Amount applied to pledges "+money(x.paid)+
     " dollars. Net recorded receipts "+money(x.receipts)+" dollars. ":"")+
   (x.preferred_hours?"Preferred calling hours "+say(x.preferred_hours,50)+". ":"")+
   (x.preferred_timezone?"Time zone "+say(x.preferred_timezone,40)+". ":"")+
   "Press 1 for next, 8 for previous, 2 to restart, 9 to search your own contacts by telephone number, or zero for main menu.";
 }
 if(path==="1331"){
  const r=await client.query<{
   id:number;amount:string;paid_amount:string;status:string;due_date:string|null;contact_name:string|null
  }>(
   "SELECT p.id,p.amount::text,p.paid_amount::text,p.status,p.due_date,c.name AS contact_name "+
   "FROM public.max_pledges p LEFT JOIN public.communication_contacts c "+
   "ON c.id=p.contact_id AND c.user_id=p.user_id "+
   "WHERE p.user_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 1 OFFSET $2",
   [userId,page]);
  const p=r.rows[0];
  if(!p)return "End of your recorded pledges. Press 2 to restart, or zero for main menu.";
  return "Website pledge number "+(page+1)+". Pledge ID "+p.id+". "+
   "Contact "+say(p.contact_name,75)+". Amount "+money(p.amount)+" dollars. "+
   "Applied amount "+money(p.paid_amount)+" dollars. Status "+say(p.status,45)+". "+
   (p.due_date?"Due "+say(p.due_date,35)+". ":"")+
   "Press 1 for next, 8 for previous, 2 to restart, or zero for main menu. "+
   "This listing does not collect or change money.";
 }
 const r=await client.query<{
  id:number;amount:string;refunded_amount:string;method:string|null;
  verification:string|null;contact_name:string|null
 }>(
  "SELECT r.id,r.amount::text,r.refunded_amount::text,r.method,r.verification,c.name AS contact_name "+
  "FROM public.max_receipts r LEFT JOIN public.communication_contacts c "+
  "ON c.id=r.contact_id AND c.user_id=r.user_id "+
  "WHERE r.user_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 1 OFFSET $2",
  [userId,page]);
 const receipt=r.rows[0];
 if(!receipt)return "End of your recorded receipts. Press 2 to restart, or zero for main menu.";
 return "Website receipt number "+(page+1)+". Receipt ID "+receipt.id+". "+
  "Contact "+say(receipt.contact_name,75)+". Recorded amount "+money(receipt.amount)+" dollars. "+
  "Refunded "+money(receipt.refunded_amount)+" dollars. "+
  "Payment method "+say(receipt.method,35)+". Verification "+say(receipt.verification,45)+". "+
  "Press 1 for next, 8 for previous, 2 to restart, or zero for main menu. "+
  "These are historical entries, not proof that new funds were transferred.";
}
export async function contactPageFromPhone(client:PoolClient,userId:number,raw:string):Promise<number|null>{
 if(!/^\d{10,15}$/.test(raw))return null;
 const result=await client.query<{place:number}>(
  "SELECT (SELECT count(*)::int FROM public.communication_contacts newer "+
  "WHERE newer.user_id=c.user_id AND "+
  "(newer.created_at,newer.id)>(c.created_at,c.id)) AS place "+
  "FROM public.communication_contacts c WHERE c.user_id=$1 AND "+
  "regexp_replace(COALESCE(c.phone,''),'[^0-9]','','g')=$2 "+
  "ORDER BY c.created_at DESC,c.id DESC LIMIT 1",[userId,raw]);
 return result.rows[0]?.place??null;
}
