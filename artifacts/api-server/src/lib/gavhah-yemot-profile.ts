import type {PoolClient} from "pg";
import {verifyPassword} from "./crypto";
import {validRecordedPath} from "./yemot-news-engagement";
import {readMemberApplications,saveMemberApplicationFollowup,type MemberApplication} from "./member-application-status";

export type PhoneProfileContext={
 path:string;page:number;focusId:number|null;flash:string;feedback:string;
};
type ProfileGate={kind:"gavhah_phone_profile";userId:number;verifiedUntil:number;failures:number};
const parse=(flash:string):ProfileGate|null=>{
 try{
  const v=JSON.parse(flash);
  return v?.kind==="gavhah_phone_profile"&&Number.isSafeInteger(v.userId)&&
   Number.isFinite(v.verifiedUntil)&&Number.isSafeInteger(v.failures)?v:null;
 }catch{return null;}
};
const authorized=(flash:string,userId:number|null)=>{
 const v=parse(flash);
 return !!v&&!!userId&&v.userId===userId&&v.verifiedUntil>Date.now();
};
export const profilePhonePath=(p:string)=>p==="182"||p==="1829"||/^1829[1-8]$/.test(p);
export const profilePhoneRecording=(p:string)=>p==="18294";
export const profilePhoneRequiresPin=(p:string)=>p==="182";
const safe=(v:unknown,max=120)=>String(v||"").replace(/[^\x20-\x7e]/g," ").replace(/[<>&=,;]/g," ").replace(/\s+/g," ").trim().slice(0,max);
export async function profilePhoneDigit(client:PoolClient,current:PhoneProfileContext,digit:string,userId:number|null):Promise<PhoneProfileContext>{
 const next={...current,feedback:""};
 if(!userId){
  next.path="182";next.flash="";next.focusId=null;
  next.feedback="You must securely pair your member account before using My Profile. ";
  return next;
 }
 if(current.path==="182"){
  const gate=parse(current.flash);
  const failures=gate?.userId===userId?gate.failures:0;
  if(failures>=3){
   next.path="18";next.flash="";next.feedback="Too many incorrect passwords. This telephone profile session is closed. ";
   return next;
  }
  if(!/^\d{6,12}$/.test(digit)){
   next.flash=JSON.stringify({kind:"gavhah_phone_profile",userId,verifiedUntil:0,failures:failures+1});
   next.feedback="Enter your six to twelve digit personal password. ";
   return next;
  }
  const account=await client.query<{password_hash:string;status:string}>(
   "SELECT password_hash,status FROM public.users WHERE id=$1",[userId]);
  if(!account.rows[0]||account.rows[0].status!=="active"||
     !await verifyPassword(digit,account.rows[0].password_hash)){
   next.flash=JSON.stringify({kind:"gavhah_phone_profile",userId,verifiedUntil:0,failures:failures+1});
   next.feedback="The password was not correct. ";
   return next;
  }
  next.path="1829";next.focusId=null;next.page=0;
  next.flash=JSON.stringify({kind:"gavhah_phone_profile",userId,verifiedUntil:Date.now()+5*60*1000,failures:0});
  return next;
 }
 if(!authorized(current.flash,userId)){
  next.path="182";next.flash="";next.focusId=null;next.page=0;
  next.feedback="For My Profile, enter your password again. ";
  return next;
 }
 if(current.path==="1829"){
  if(digit==="1"){next.path="18291";next.page=0;}
  else if(digit==="2"){next.path="18292";next.page=0;}
  else if(digit==="3"){next.path="18295";}
  else if(digit==="4"){next.path="18296";}
  else if(digit==="5"){next.path="18297";}
  else if(digit==="6"){next.path="18298";}
  return next;
 }
 if(current.path==="18291"||current.path==="18292"){
  if(digit==="9"){next.page=Math.min(current.page+1,50);return next;}
  if(/^[1-8]$/.test(digit)){
   const items=await readMemberApplications(client,userId);
   const item=items[current.page*8+Number(digit)-1];
   if(!item){next.feedback="No application with that option number. ";return next;}
   if(current.path==="18291"){
    next.feedback=(item.kind==="volunteer"?"Volunteer application. ":"Help request. ")+
     "Status "+safe(item.status)+". Follow-ups "+item.followupCount+". ";
    return next;
   }
   next.path="18293";next.focusId=item.id;
   // Keep item kind encoded in an exclusive index instead of guessing by ID.
   next.page=items.findIndex(x=>x.kind===item.kind&&x.id===item.id);
  }
  return next;
 }
 if(current.path==="18293"){
  const items=await readMemberApplications(client,userId),item=items[next.page];
  if(!item||item.id!==next.focusId){next.path="18292";next.feedback="The chosen application has changed. Select it again. ";return next;}
  if(digit==="1"){
   try{
    const saved=await saveMemberApplicationFollowup(client,userId,item.kind,item.id,
     "I am following up on my "+item.kind+" application #"+item.id+". Please contact me through my approved private contact method.");
    next.path="1829";next.focusId=null;next.page=0;
    next.feedback="Your private follow-up request was sent to Gavhah staff. Reference "+saved.id+". ";
   }catch(e){next.feedback=e instanceof Error?safe(e.message,190):"Unable to send the follow-up. ";}
  }else if(digit==="2"){next.path="18294";}
  return next;
 }
 if(current.path==="18294"){
  const items=await readMemberApplications(client,userId),item=items[current.page];
  if(!item||item.id!==current.focusId){next.path="18292";next.feedback="Please select your application again. ";return next;}
  const wav=validRecordedPath(digit);
  if(!wav){next.feedback="Recording not received. Record after the beep and finish with pound. ";return next;}
  try{
   const saved=await saveMemberApplicationFollowup(client,userId,item.kind,item.id,
    "Private Gavhah Yemot follow-up voice recording for "+item.kind+" application #"+item.id+": "+wav);
   next.path="1829";next.focusId=null;next.page=0;
   next.feedback="Your recorded message was saved in the private staff inbox. Reference "+saved.id+". ";
  }catch(e){next.feedback=e instanceof Error?safe(e.message,190):"Unable to save recording. ";}
  return next;
 }
 return next;
}
export async function profilePhonePrompt(client:PoolClient,ctx:PhoneProfileContext,userId:number|null):Promise<{text:string;mode:"menu"|"pin"|"record"}>{
 const feedback=ctx.feedback||"";
 if(ctx.path==="182")return{text:feedback+"My Profile. Even if you are already signed in, re-enter your personal six to twelve digit password. Press zero to return.",mode:"pin"};
 if(!userId||!authorized(ctx.flash,userId))
  return{text:feedback+"Your private profile verification has expired. Enter your password again.",mode:"menu"};
 if(ctx.path==="1829")return{text:feedback+
  "My Profile. For your volunteer and help application statuses press 1. To send a follow-up to Gavhah staff press 2. "+
  "For your Following list press 3. For My Creations press 4. For your Saved list press 5. For your member ID press 6. "+
  "For editing security credentials use your authenticated account. Press zero to return.",mode:"menu"};
 if(ctx.path==="18291"||ctx.path==="18292"){
  const items=await readMemberApplications(client,userId);
  const list=items.slice(ctx.page*8,ctx.page*8+8);
  const heading=ctx.path==="18291"?"Your applications and their statuses. ":"Choose an application for a private follow-up. ";
  if(!list.length)return{text:feedback+"No additional applications found. Press zero to return.",mode:"menu"};
  return{text:feedback+heading+list.map((x,i)=>"For "+(x.kind==="volunteer"?"volunteer registration":"help request")+" "+
   (i+1)+", status "+safe(x.status)+", press "+(i+1)+". ").join(" ")+
   (items.length>(ctx.page+1)*8?"Next eight press 9. ":"")+"Press zero to return.",mode:"menu"};
 }
 if(ctx.path==="18293")return{text:feedback+
  "For a private request that Gavhah contact you about the chosen application press 1. "+
  "To record a detailed private follow-up voice message press 2. Press zero to return.",mode:"menu"};
 if(ctx.path==="18294")return{text:feedback+
  "Record your private follow-up for the Gavhah staff now. Finish with pound. Do not speak bank or payment card numbers.",mode:"record"};
 if(ctx.path==="18295"){
  const r=await client.query<{entity_title:string;entity_type:string}>(
   "SELECT entity_title,entity_type FROM public.follows WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8",[userId]);
  return{text:feedback+(r.rows.length?"Following "+r.rows.map(x=>safe(x.entity_title)+" "+safe(x.entity_type)).join(". "):
   "You have not followed any groups or projects yet.")+". Press zero to return.",mode:"menu"};
 }
 if(ctx.path==="18296"){
  const r=await client.query<{title:string}>( 
   "SELECT name AS title FROM public.groups WHERE owner_id=$1 "+
   "UNION ALL SELECT title FROM public.community_projects WHERE owner_id=$1 "+
   "UNION ALL SELECT title FROM public.discussions WHERE author_id=$1 LIMIT 8",[userId]);
  return{text:feedback+(r.rows.length?"Your creations: "+r.rows.map(x=>safe(x.title)).join(". "):
   "You have not created any listed public projects yet.")+". Press zero to return.",mode:"menu"};
 }
 if(ctx.path==="18297"){
  const r=await client.query<{content_title:string}>(
   "SELECT content_title FROM public.saved_items WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8",[userId]);
  return{text:feedback+(r.rows.length?"Saved items: "+r.rows.map(x=>safe(x.content_title)).join(". "):
   "You have no saved items.")+". Press zero to return.",mode:"menu"};
 }
 if(ctx.path==="18298"){
  const r=await client.query<{short_member_no:string|null}>(
   "SELECT short_member_no FROM public.gavhah_phone_member_logins WHERE user_id=$1 LIMIT 1",[userId]);
  return{text:feedback+"Your Gavhah member ID is "+safe(r.rows[0]?.short_member_no||userId)+". Press zero to return.",mode:"menu"};
 }
 return{text:feedback+"Press zero to return.",mode:"menu"};
}
