import type { PoolClient } from "pg";

/**
 * Read-only telephone actions backed by existing Gavhah production tables.
 * The invoking IVR must verify a time-limited website account pairing BEFORE
 * calling any private path. Never trust caller ID or take an unverified ID.
 * The phone does not originate calls, collect card data or bypass web roles.
 */
export const sectionPaths=new Set([
 "127","131","132","133","134","141","142","143","144",
 "1451","1452","1453","1454","1455","1456","1457","1461","1462","1463",
 "151","152","153","154","161","162","163","164","171","172","181","182","191","192","193","194"
]);
export const sectionRequiresLogin=new Set([
 "127","131","132","133","134","141","142","143","144",
 "1451","1452","1453","1454","1455","1456","1457","1461","1462","1463","152","153","164","172","181","182","191","192","193","194"
]);
export const pagedSections=new Set(["132","141","142","1451","1452","1453","1454","1455","1456","1457","1461","1462","1463","151","152","154","161","162","163","164","171","172","181","194"]);

/** For a double-press confirmation, fetch just the CURRENT user's row. */
export async function currentPhoneActionId(
 client:PoolClient,path:"132"|"181",memberId:number,page:number
):Promise<number|null>{
 const p=Math.max(0,Math.min(40,Math.trunc(page)||0));
 const query=path==="132"
  ?"SELECT id FROM public.communication_contacts WHERE user_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 1 OFFSET $2"
  :"SELECT id FROM public.notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2";
 const r=await client.query<{id:number}>(query,[memberId,p]);
 return r.rows[0]?.id??null;
}

/** Writes are limited to private member-owned rows in the caller transaction. */
export async function confirmPhoneAction(
 client:PoolClient,path:"132"|"181",memberId:number,recordId:number
):Promise<string>{
 if(path==="181"){
  const r=await client.query(
   "UPDATE public.notifications SET is_read=true WHERE id=$1 AND user_id=$2 AND is_read=false RETURNING id",
   [recordId,memberId]);
  return r.rowCount?"Your notification is now marked as read on your website account."
   :"This notification is already read or no longer available.";
 }
 const row=await client.query<{id:number;name:string}>(
  "UPDATE public.communication_contacts "+
  "SET do_not_call=true,opt_out_reason='Marked Do Not Call by account owner using verified telephone session',updated_at=now() "+
  "WHERE id=$1 AND user_id=$2 AND COALESCE(do_not_call,false)=false RETURNING id,name",
  [recordId,memberId]);
 if(!row.rowCount)return "Contact is already marked Do Not Call or unavailable.";
 await client.query(
  "INSERT INTO public.max_history_events (user_id,case_id,entity_type,entity_id,action,title,details,happened_at) "+
  "VALUES($1,NULL,'contact',$2,'contact_do_not_call',$3,$4,now())",
  [memberId,recordId,row.rows[0].name,
   JSON.stringify({source:"verified_phone",note:"Owner set Do Not Call; no consent override or outbound call"})]);
 return "Do Not Call is enabled for this contact. No outgoing call was placed.";
}


// The test line's TTS is currently English; never mispronounce Yiddish/other
// languages or falsely claim to have translated original source material.
function speak(raw:unknown,max=90):string{
 const text=String(raw??"").replace(/<[^>]*>/g," ").replace(/https?:\/\/\S+/gi," ");
 if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(text))return "";
 return text.replace(/[^ -~]/g," ").replace(/[&=,#;.]/g," ")
  .replace(/\s+/g," ").trim().slice(0,max);
}
const amount=(n:unknown):string=>{
 const value=Number(n??0);
 return Number.isFinite(value)&&value>=0 ? value.toFixed(2) : "0";
};
const navigation="Press 1 for next, 8 for previous, 2 to restart, or zero for the main menu.";
const missing=(section:string)=>"No records are available in "+section+". "+navigation;
const detail=(index:number,s:string)=>"Item "+(index+1)+". "+s+". "+navigation;
const scalar=async(client:PoolClient,query:string,args:unknown[])=> (await client.query(query,args)).rows[0]||{};

/**
 * Public, read-only item lookups by website ID. The same published/approved
 * filters as public browsing apply; no private group, unapproved minyan,
 * scheduled/unpublished charity or non-public member data can be exposed.
 * IDs never bypass moderation, and no payment or membership is created.
 */
export const publicIdSections=new Set(["155","166","167","173","1831","1832","1833","1834"]);
// The search menu is an alias to the same approved public queries, not a
// separate database view. One consistent privacy rule applies everywhere.
const canonicalPublicIdPath=(path:string)=>({
 "1831":"155","1832":"166","1833":"167","1834":"173"
} as Record<string,string>)[path]||path;
export async function readPhonePublicById(
 client:PoolClient,path:string,id:number,part:number
):Promise<{text:string;hasMore:boolean}>{
 const returnMenu="Press nine to enter another item number, or zero for the main menu.";
 if(!publicIdSections.has(path)||!Number.isSafeInteger(id)||id<1||id>99999999)
  return {text:"Invalid public item number. "+returnMenu,hasMore:false};
 path=canonicalPublicIdPath(path);
 let heading="",body="";
 if(path==="155"){
  const q=await scalar(client,
   "SELECT name,description,goal_amount,raised_amount FROM public.charities "+
   "WHERE id=$1 AND is_active=true AND (publication_state='live' OR "+
   "(publication_state='scheduled' AND scheduled_at<=now()))",[id]);
  if(q.name){
   heading="Public charity "+id+". "+(speak(q.name,85)||"A Yiddish campaign title")+
     ". Published fundraising goal "+amount(q.goal_amount)+
     " dollars. Website reported "+amount(q.raised_amount)+
     " dollars raised. No payments are accepted by telephone. ";
   body=speak(q.description,5000)||"The description needs an approved Yiddish recording.";
  }
 }else if(path==="166"){
  // Discussions are website-public content. Locked means no new replies,
  // not that reading is prohibited.
  const q=await scalar(client,
   "SELECT title,content,is_locked,comment_count FROM public.discussions WHERE id=$1",[id]);
  if(q.title){
   heading="Public forum topic "+id+". "+(speak(q.title,85)||"Title requires approved audio")+
     ". "+(q.is_locked?"Replies closed. ":"Replies open. ")+
     Number(q.comment_count||0)+" comments. ";
   body=speak(q.content,5000)||"This forum text needs approved Yiddish audio.";
  }
 }else if(path==="167"){
  const q=await scalar(client,
   "SELECT name,description,member_count FROM public.groups WHERE id=$1 AND privacy='public'",[id]);
  if(q.name){
   heading="Public community group "+id+". "+(speak(q.name,85)||"Group title requires approved audio")+
     ". "+Number(q.member_count||0)+" members. ";
   body=speak(q.description,5000)||"The group description needs approved Yiddish audio.";
  }
 }else if(path==="173"){
  const q=await scalar(client,
   "SELECT synagogue_name,city,country,community,shacharis,mincha,maariv,notes "+
   "FROM public.minyans WHERE id=$1 AND status='approved'",[id]);
  if(q.synagogue_name){
   heading="Approved minyan "+id+". "+(speak(q.synagogue_name,85)||"Name needs Yiddish audio")+
    ". City "+(speak(q.city,45)||"on website")+
    ". Country "+(speak(q.country,38)||"on website")+". ";
   body=[
    q.community?"Community "+(speak(q.community,90)||"available on website")+". ":"",
    q.shacharis?"Shacharis "+(speak(q.shacharis,70)||"hours on website")+". ":"",
    q.mincha?"Mincha "+(speak(q.mincha,70)||"hours on website")+". ":"",
    q.maariv?"Maariv "+(speak(q.maariv,70)||"hours on website")+". ":"",
    q.notes?speak(q.notes,900):""
   ].join(" ").trim()||"Additional details are available on the website.";
  }
 }
 if(!heading)return {text:"This public item does not exist or is not approved for public viewing. "+returnMenu,hasMore:false};
 // Split at word boundaries so recordings remain intelligible within Yemot
 // read=t- limits; do not loop forever on a long unbroken word.
 const chunks:string[]=[];
 let rest=body.replace(/\s+/g," ").trim();
 while(rest&&chunks.length<35){
  if(rest.length<=185){chunks.push(rest);break;}
  let end=rest.lastIndexOf(" ",185);if(end<90)end=185;
  chunks.push(rest.slice(0,end).trim());
  rest=rest.slice(end).trimStart();
 }
 if(!chunks.length)chunks.push("Details are available on the website.");
 const current=Math.max(0,Math.min(Math.trunc(part)||0,chunks.length-1));
 const hasMore=current<chunks.length-1;
 return {text:
  (current===0?heading:"Continuation for item "+id+". ")+chunks[current]+". "+
  (hasMore?"Press one for the next part. ":"End of this item. ")+
  "Press eight for the previous part, two to restart, nine for another item, or zero for the main menu.",
  hasMore};
}

/**
 * Every query has a fixed SQL shape. All private data are restricted to the
 * verified user ID, and text returned to IVR is shortened and sanitized.
 * No raw phone numbers, email addresses, contact notes, or secrets are spoken.
 */
export async function readPhoneSection(
 client:PoolClient,path:string,memberId:number|null,page=0
):Promise<string>{
 if(!sectionPaths.has(path))return "This phone option is not yet available.";
 if(sectionRequiresLogin.has(path)&&(!Number.isSafeInteger(memberId)||Number(memberId)<=0))
  return "This is private. Link your Gavhah website account using the eight digit code in My Askanus option 2 then 5.";
 const userId=memberId!;
 const p=Math.min(40,Math.max(0,Math.trunc(page)||0));
 if(path==="127"){
  const result=await scalar(client,
   "SELECT (SELECT count(*) FROM public.askanus_tasks WHERE user_id=$1 AND completed=false)::int AS tasks,"+
   "(SELECT count(*) FROM public.case_followups f JOIN public.askanus_cases c ON c.id=f.case_id "+
   "WHERE c.user_id=$1 AND f.completed=false AND f.due_date<=to_char(now(),'YYYY-MM-DD'))::int AS due,"+
   "(SELECT count(*) FROM public.max_donor_recontact r JOIN public.communication_contacts d "+
   "ON d.id=r.contact_id AND d.user_id=$1 WHERE r.user_id=$1 AND r.status='waiting' "+
   "AND r.due_at<=now() AND COALESCE(d.do_not_call,false)=false)::int AS eligible",[userId]);
  return "Your MAX Tishl. "+result.tasks+" open tasks, "+result.due+" due followups, and "+
   result.eligible+" donors whose next review date has arrived. "+
   "For call result categories press zero, then two for Calling, and five for Saved Results.";
 }
 if(/^145[1-7]$/.test(path)){
  const outcomes:Record<string,string>={
   "1451":"gave","1452":"no_answer","1453":"callback","1454":"not_interested",
   "1455":"do_not_call","1456":"other","1457":"spoke"
  };
  const selected=outcomes[path];
  const list=await client.query<{contact_name:string;money_kind:string;amount:string;created_at:string}>(
   "SELECT contact_name,money_kind,amount,created_at FROM public.fundraising_call_reports "+
   "WHERE user_id=$1 AND outcome=$2 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $3",
   [userId,selected,p]);
  const row=list.rows[0];
  if(!row)return missing("saved "+selected.replaceAll("_"," ")+" call reports");
  return detail(p,"Saved MAX result "+selected.replaceAll("_"," ")+". "+
   (speak(row.contact_name,90)||"Donor name needs an approved Yiddish recording")+
   ". "+(row.money_kind!=="none"?"Manually recorded "+row.money_kind+" "+
    amount(row.amount)+" dollars. ":"")+
   "Press one for next record, eight for previous, two to restart, zero for MAX root");
 }
 if(/^146[1-3]$/.test(path)){
  const wait=path==="1462",due=path==="1461";
  const state=due?"AND r.status='waiting' AND r.due_at<=now() ":
   wait?"AND r.status='waiting' AND r.due_at>now() ":"";
  const query="SELECT d.name,d.do_not_call,r.scope,r.due_at "+
   "FROM public.max_donor_recontact r "+
   "JOIN public.communication_contacts d ON d.id=r.contact_id AND d.user_id=$1 "+
   "JOIN public.askanus_cases c ON c.id=r.case_id AND c.user_id=$1 "+
   "WHERE r.user_id=$1 "+state+"ORDER BY r.due_at ASC,r.id ASC LIMIT 1 OFFSET $2";
  const results=await client.query<{name:string;do_not_call:boolean;scope:string;due_at:Date}>(query,[userId,p]);
  const row=results.rows[0];
  if(!row)return missing("future donor reviews");
  return detail(p,"Donor review. "+
   (speak(row.name,90)||"Name needs an approved Yiddish recording")+
   ". For "+(row.scope==="same_purpose"?"the same purpose":"a new purpose")+
   ". Review date "+row.due_at.toISOString().slice(0,16).replace("T"," at ")+
   " Universal time. "+(row.do_not_call?"Do Not Call is active. No calling allowed. ":
    row.due_at.getTime()<=Date.now()?"Review date arrived; check calling consent and hours. ":"Not due yet. ")+
   "Press one for next, eight for previous, two to restart, zero for MAX root");
 }
 if(path==="131"){
  const x=await scalar(client,
   "SELECT (SELECT count(*) FROM public.communication_contacts WHERE user_id=$1)::int AS contacts,"+
   "(SELECT count(*) FROM public.max_pledges WHERE user_id=$1)::int AS pledges,"+
   "(SELECT count(*) FROM public.max_receipts WHERE user_id=$1)::int AS receipts,"+
   "(SELECT COALESCE(sum(amount-paid_amount),0) FROM public.max_pledges WHERE user_id=$1 AND status NOT IN ('cancelled','void','reversed')) AS outstanding",[userId]);
  return "Your private donor overview. "+x.contacts+" contacts, "+x.pledges+
   " recorded pledges, "+x.receipts+" manually recorded receipts. Unpaid pledged balance "+
   amount(x.outstanding)+" dollars. This is not confirmed bank settlement. Press zero for the main menu.";
 }
 if(path==="132"||path==="141"){
  const queue=path==="141";
  const where=queue?"user_id=$1 AND COALESCE(do_not_call,false)=false":"user_id=$1";
  const x=await scalar(client,"SELECT name,do_not_call,contact_role,city FROM public.communication_contacts "+
   "WHERE "+where+" ORDER BY updated_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,p]);
  if(!x.name)return missing(queue?"your permitted calling list":"your contacts");
  return detail(p,(queue?"Contact queue. ":"Private contact. ")+
   (speak(x.name)||"Name requires recorded Yiddish audio")+
   (x.city?". City "+(speak(x.city,35)||"not available in English"):"")+
   (x.do_not_call?" Do not call is enabled.": queue?"":" Press 5 twice to enable Do Not Call for this contact.")+
   (queue
    ?". Press nine to enter a manual call result for a call you already made. You must have exactly one open MAX case. No outgoing telephone call is started from this menu"
    :". No outgoing telephone call is started from this menu"));
 }
 if(path==="133"){
  const x=await scalar(client,
   "SELECT (SELECT count(*) FROM public.max_pledges WHERE user_id=$1)::int AS pledge_count,"+
   "(SELECT COALESCE(sum(amount),0) FROM public.max_pledges WHERE user_id=$1) AS promised,"+
   "(SELECT COALESCE(sum(amount),0) FROM public.max_receipts WHERE user_id=$1) AS entered,"+
   "(SELECT COALESCE(sum(refunded_amount),0) FROM public.max_receipts WHERE user_id=$1) AS reversed",[userId]);
  return "Your MAX financial entries. "+x.pledge_count+" pledges totaling "+amount(x.promised)+
   " dollars. Manually recorded receipts "+amount(x.entered)+" dollars, reported refunds "+
   amount(x.reversed)+" dollars. These are not verified processor payments. Press zero for the main menu.";
 }
 if(path==="134"){
  const x=await scalar(client,
   "SELECT (SELECT count(*) FROM public.askanus_tasks WHERE user_id=$1 AND completed=false)::int AS tasks,"+
   "(SELECT count(*) FROM public.askanus_cases WHERE user_id=$1 AND status!='closed')::int AS cases",[userId]);
  return "Your personal follow up overview. "+x.tasks+" unfinished tasks and "+x.cases+
   " open cases. Press zero for the main menu. For detailed tasks press 2 then 1.";
 }
 if(path==="142"){
  const x=await scalar(client,"SELECT outcome,money_kind,amount,created_at FROM public.fundraising_call_reports "+
   "WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,p]);
  if(!x.created_at)return missing("your calling history");
  return detail(p,"Previously entered call result "+
   (speak(x.outcome,65)||"Recorded")+". "+(x.money_kind?speak(x.money_kind,35):"")+
   (x.amount!==null?" reported amount "+amount(x.amount)+" dollars":"")+
   ". No live telephone call was initiated by this history screen");
 }
 if(path==="143"){
  const x=await scalar(client,"SELECT count(*)::int AS total,"+
   "count(*) FILTER (WHERE COALESCE(do_not_call,false))::int AS blocked "+
   "FROM public.communication_contacts WHERE user_id=$1",[userId]);
  return "Your calling protections. "+x.total+" contacts. "+x.blocked+
   " marked Do Not Call. Telephone dialing is not activated. Respect consent and permitted calling hours. Press zero for the main menu.";
 }
 if(path==="144"){
  const x=await scalar(client,"SELECT enabled,last_verified_at FROM public.gavhah_yemot_global WHERE id=1",[]);
  return x.enabled&&x.last_verified_at
   ?"Your Gavhah incoming Yemot connection is configured and verified. This does not mean outbound calling or caller ID is authorized. Press zero for the main menu."
   :"The Gavhah telephone provider connection is not currently verified. Press zero for the main menu.";
 }
 if(path==="151"){
  const x=await scalar(client,
   "SELECT id,name,goal_amount,raised_amount FROM public.charities "+
   "WHERE is_active=true AND (publication_state='live' OR "+
   "(publication_state='scheduled' AND scheduled_at<=now())) "+
   "ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1",[p]);
  if(!x.name)return missing("published charity campaigns");
  return detail(p,"Public charity campaign number "+x.id+". "+
   (speak(x.name)||"Name requires an approved Yiddish recording")+
   ". Target "+amount(x.goal_amount)+" dollars. Website reported raised "+
   amount(x.raised_amount)+" dollars. No phone payments are collected");
 }
 if(path==="152"){
  const x=await scalar(client,"SELECT need_type,status,urgency FROM public.help_requests "+
   "WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,p]);
  if(!x.status)return missing("your assistance requests");
  return detail(p,"Your previously submitted assistance request. Type "+
   (speak(x.need_type,40)||"Not available in English")+
   ". Status "+(speak(x.status,32)||"Recorded")+
   ". Urgency "+(speak(x.urgency,30)||"recorded")+
   ". To submit a NEW request use the website until the secure phone recording workflow is built");
 }
 if(path==="153"){
  const x=await scalar(client,"SELECT availability,skills FROM public.volunteer_profiles WHERE user_id=$1 LIMIT 1",[userId]);
  if(!x.availability)return "No volunteer profile is currently registered to your linked account. You can create one on the website. Press zero for the main menu.";
  return "Your volunteering profile is registered. Availability "+
   (speak(x.availability,100)||"available on the website")+
   ". "+(Array.isArray(x.skills)?x.skills.length:0)+" skills recorded. Press zero for the main menu.";
 }
 if(path==="154"){
  const x=await scalar(client,"SELECT title,location FROM public.community_projects "+
   "WHERE status='active' ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1",[p]);
  if(!x.title)return missing("public community projects");
  return detail(p,"Public community project "+(speak(x.title)||"Name requires an approved recording")+
   (x.location?". Location "+(speak(x.location,60)||"not available in English"):""));
 }
 if(path==="161"){
  const x=await scalar(client,"SELECT id,name,description FROM public.groups "+
   "WHERE privacy='public' ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1",[p]);
  if(!x.name)return missing("public groups");
  return detail(p,"Public community group number "+x.id+". "+(speak(x.name)||"Name needs an approved recording"));
 }
 if(path==="162"){
  const x=await scalar(client,"SELECT id,title,is_locked,comment_count FROM public.discussions "+
   "ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1",[p]);
  if(!x.title)return missing("public discussion topics");
  return detail(p,"Public forum topic number "+x.id+". "+
   (speak(x.title)||"Title requires Yiddish audio")+
   ". "+(x.is_locked?"Replies closed":"Replies open")+
   ". "+Number(x.comment_count||0)+" recorded comments");
 }
 if(path==="163"){
  // Only profiles deliberately marked as public featured volunteers.
  const x=await scalar(client,"SELECT user_name,location FROM public.volunteer_profiles "+
   "WHERE is_featured=true ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1",[p]);
  if(!x.user_name)return missing("public featured volunteer listings");
  return detail(p,"Featured volunteer "+
   (speak(x.user_name)||"Name requires approved Yiddish audio")+
   (x.location?". Area "+(speak(x.location,45)||"available online"):""));
 }
 if(path==="164"){
  const x=await scalar(client,"SELECT entity_title,entity_type FROM public.follows "+
   "WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,p]);
  if(!x.entity_title)return missing("your followed updates or organizations");
  return detail(p,"Your followed item "+
   (speak(x.entity_title)||"Title requires Yiddish audio")+
   ". Type "+(speak(x.entity_type,35)||"saved"));
 }
 if(path==="171"){
  const x=await scalar(client,"SELECT id,synagogue_name,city,shacharis,mincha,maariv FROM public.minyans "+
   "WHERE status='approved' ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1",[p]);
  if(!x.synagogue_name)return missing("approved minyan listings");
  return detail(p,"Approved minyan number "+x.id+". "+
   (speak(x.synagogue_name)||"Name requires recorded Yiddish audio")+
   ". City "+(speak(x.city,35)||"not in English")+
   (x.shacharis?". Morning "+(speak(x.shacharis,30)||"time available online"):"")+
   (x.mincha?". Afternoon "+(speak(x.mincha,30)||"time available online"):"")+
   (x.maariv?". Evening "+(speak(x.maariv,30)||"time available online"):""));
 }
 if(path==="172"){
  const x=await scalar(client,"SELECT name,reservation_date,reservation_time,status FROM public.reservations "+
   "WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,p]);
  if(!x.name)return missing("your own reservations");
  return detail(p,"Your reservation "+(speak(x.name)||"Name not available in English")+
   ". Date "+(speak(x.reservation_date,35)||"check on website")+
   ". Time "+(speak(x.reservation_time,25)||"check on website")+
   ". Status "+(speak(x.status,25)||"recorded"));
 }
 if(path==="181"){
  const x=await scalar(client,"SELECT message,is_read FROM public.notifications "+
   "WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,p]);
  if(!x.message)return missing("your notifications");
  return detail(p,(x.is_read?"Previous notification. ":"Unread notification. ")+
   (speak(x.message,170)||"This notification requires Yiddish recorded audio")+
   (x.is_read?"":" Press 5 twice to mark this notification read"));
 }
 if(path==="182"){
  const x=await scalar(client,"SELECT name,nickname,role,preferred_language FROM public.users WHERE id=$1",[userId]);
  return "Your profile. Display name "+
   (speak(x.nickname||x.name,110)||"available on the website")+
   ". Your website account is connected securely for this call. Press zero for the main menu.";
 }
 if(path==="191"){
  const x=await scalar(client,
   "SELECT (SELECT count(*) FROM public.askanus_tasks WHERE user_id=$1 AND completed=false)::int AS tasks,"+
   "(SELECT count(*) FROM public.communication_contacts WHERE user_id=$1)::int AS contacts,"+
   "(SELECT count(*) FROM public.notifications WHERE user_id=$1 AND is_read=false)::int AS unread",[userId]);
  return "Your personal overview. "+x.tasks+" pending tasks, "+x.contacts+
   " private contacts, "+x.unread+" unread notifications. Press zero for the main menu.";
 }
 if(path==="192"){
  const x=await scalar(client,
   "SELECT (SELECT count(*) FROM public.askanus_cases WHERE user_id=$1 AND status!='closed')::int AS cases,"+
   "(SELECT count(*) FROM public.groups WHERE owner_id=$1)::int AS groups,"+
   "(SELECT count(*) FROM public.notifications WHERE user_id=$1 AND is_read=false)::int AS unread",[userId]);
  return "Your system center. "+x.cases+" open cases, "+x.groups+
   " groups owned, and "+x.unread+" unread notifications. Press zero for the main menu.";
 }
 if(path==="193"){
  const admin=await scalar(client,"SELECT role,status FROM public.users WHERE id=$1",[userId]);
  if(admin.role!=="super_admin"||admin.status==="banned"||admin.status==="suspended")
   return "Super administrator statistics require a separate authorized administrator account. Press zero for the main menu.";
  const x=await scalar(client,
   "SELECT (SELECT count(*) FROM public.help_requests WHERE status='pending')::int AS assistance,"+
   "(SELECT count(*) FROM public.cause_submissions WHERE status='pending')::int AS causes",[]);
  return "Super administrator read-only overview. "+x.assistance+
   " pending assistance requests and "+x.causes+
   " pending causes. Sensitive moderation changes require the secure website dashboard. Press zero for the main menu.";
 }
 if(path==="194"){
  const x=await scalar(client,
   "SELECT g.name, a.can_moderate, a.can_view_private FROM public.group_staff_access a "+
   "JOIN public.groups g ON g.id=a.group_id WHERE a.user_id=$1 "+
   "ORDER BY a.updated_at DESC,a.id DESC LIMIT 1 OFFSET $2",[userId,p]);
  if(!x.name)return missing("your group staff permissions");
  return detail(p,"Group "+(speak(x.name,85)||"Name requires approved Yiddish audio")+
   ". Moderation "+(x.can_moderate?"allowed":"not allowed")+
   ". Private access "+(x.can_view_private?"allowed":"not allowed")+
   ". Group administration changes still require verified website controls");
 }
 return "This module is not ready on the phone.";
}
