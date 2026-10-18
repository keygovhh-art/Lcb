import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import type { Request, Response } from "express";
import { phoneNewsVote, saveVoiceNewsReply, phoneNewsSave, phoneNewsReport } from "./yemot-news-engagement";
import { verifyGavhahPhonePin, requestGavhahPhoneAccount } from "../routes/phone-member-pin";
import { campaignPhoneBridge } from "./campaign-center-phone-bridge";
import { createCallTask, changePhoneTaskPriority, changePhoneTaskDeadline, setPhoneTaskCompleted, deletePhoneTask } from "./yemot-askanus-task-actions";
import { updateMyCaseOnPhone, createCallbackCase, createCaseFollowupFromPad, logMyCaseContactAttempt } from "./yemot-askanus-case-actions";
import { deleteMyPhoneNote,createMyRecordedPhoneNote } from "./yemot-askanus-note-actions";
import { readMyFollowup, setMySimpleFollowupCompleted, changeMyFollowupDueDate, deleteMyFollowupFromPhone } from "./yemot-askanus-followup-actions";
import { readMyContact,findMyContactPage,createMyCallbackContact,markMyContactDoNotCall,myContactDonor360 } from "./yemot-askanus-contacts-actions";
import { readContactFeed } from "./yemot-communications-contact-feed";

// ONE provider API bridge. All IVR paths, identities, and records are owned by
// Gavhah and Neon. No separate provider-side submenus, caller-ID login or
// recordings of card details.
type TreeNode={label:string;children?:Record<string,TreeNode>;details?:string};
type State={
 step:number;path:string;news_position:number;news_chunk:number;
 member_id:number|null;linked_until:string|null;login_failures:number;
 phone_page:number;selected_item_id:number|null;signup_phone:string|null;signup_stage:number;
 task_action:string;task_action_target:number|null;
 case_action:string;case_action_target:number|null;note_delete_target:number|null;note_record_mode:boolean;
 followup_action:string;followup_action_target:number|null;
 contact_action:string;contact_action_target:number|null;
 news_actions_open:boolean;news_reply_mode:boolean;news_reply_target:number|null;news_report_mode:boolean;
};
const categories:Record<string,string>={
 "1121":"emergency_appeal","1122":"fundraising","1123":"announcement",
 "1124":"volunteer_call","1125":"alert","1126":"org_update","1127":"bikur_cholim",
 "1128":"community"
};
const newsAll="111",newsImportant="113";
const personalPaths=new Set(["121","122","123","124","127","128","129","134"]);
const taskPaths=new Set(["121","127","128","129"]);
const contactPaths=new Set(["131","132","1331","1332"]);
// Deadline values are ISO YYYY-MM-DD text. Compare New York local dates.
const taskWhere:Record<string,string>={
 "121":"",
 "127":" AND completed=false",
 "128":" AND completed=false AND deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND deadline < to_char(now() AT TIME ZONE 'America/New_York','YYYY-MM-DD')",
 "129":" AND completed=false AND deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND deadline >= to_char(now() AT TIME ZONE 'America/New_York','YYYY-MM-DD') AND deadline <= to_char((now() AT TIME ZONE 'America/New_York')+interval '7 days','YYYY-MM-DD')"
};
const root="Welcome to Gavhah and Campaign Center  Press 1 for Gavhah  Press 2 for Campaign Center  Press zero for hotline management";
export function safeVoice(input:unknown,max=430){
 const plain=String(input??"").replace(/<[^>]+>/g," ").replace(/https?:\/\/\S+/gi," ");
 // English only during testing; never pretend English TTS understands Yiddish.
 if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(plain))return "";
 return plain.replace(/[&=,;#.\-]/g," ").replace(/[^\x20-\x7e]/g," ")
  .replace(/\s+/g," ").trim().slice(0,max);
}
function voice(s:string){return "t-"+safeVoice(s,430);}
function sendRead(res:Response,prompt:string,step:number,mode:"menu"|"news"|"code"|"article"|"record"|"pin"|"phone"|"contactPhone"|"date"="menu"){
 if(mode==="record"){
  res.type("text/plain; charset=utf-8").set("Cache-Control","no-store")
   .send("read="+voice(prompt)+"=rr"+step+",,record");return;
 }
 const name=(mode==="code"?"ln":mode==="pin"?"pn":mode==="phone"||mode==="contactPhone"?"rg":mode==="date"?"dt":mode==="article"?"ar":"iv")+step;
 // Yehmot's documented read order is:
 // name, reuse, maxDigits, minDigits, timeout, playback, blockStar,
 // blockZero, replacement, allowedDigits, retries, emptyIsOk, emptyValue.
 // Never shift positions or block digit zero. Most menus use the smallest
 // valid six/seven fields so a telephone speech issue can be isolated.
 const opts=mode==="code"
 ? [name,"no","8","8","12","No","no"]
 : mode==="pin"
 ? [name,"no","16","12","15","No","no"]
 : mode==="phone"
 ? [name,"no","15","10","15","No","no"]
 : mode==="contactPhone"
 ? [name,"no","15","1","15","No","no"]
 : mode==="date"
 ? [name,"no","8","8","15","No","no"]
 : mode==="article"
 ? [name,"no","8","1","8","No","no"]
 : mode==="news"
 ? [name,"no","1","0","7","No","no","no","","0123456789","1","Ok","None"]
 : [name,"no","1","1","8","No","no"];
 const providerBody="read="+voice(prompt)+"="+opts.join(",");
 if(step===0)logger.info({ivrResponse:"read",mode,step,promptCharacters:prompt.length,patternVersion:"basic-read-v2"},"Yemot welcome reply delivered");
 res.type("text/plain; charset=utf-8").set("Cache-Control","no-store").send(providerBody);
}
function menuPrompt(path:string,tree:Record<string,TreeNode>){
 let nodes=tree,current:TreeNode|undefined;
 for(const d of path){current=nodes[d];if(!current)return root;nodes=current.children||{};}
 if(!path)return root;
 if(!current?.children)return current?.details||"This option is not ready on the phone. Press zero to return to the main menu.";
 return current.label+". "+Object.entries(nodes)
  .map(([n,item])=>"Press "+n+" for "+item.label+".").join(" ")+
  " Press zero to return to the main menu.";
}
function treeSelect(path:string,digit:string,tree:Record<string,TreeNode>){
 if(digit==="0")return "";
 if(!/^[1-9]$/.test(digit))return path;
 let nodes=tree;
 for(const d of path){if(!nodes[d]?.children)return path;nodes=nodes[d].children||{};}
 return nodes[digit]?path+digit:path;
}
function newsPath(path:string){
 return path===newsAll||path===newsImportant||path==="114"||path in categories||path==="1129";
}
async function getNews(path:string,pos:number){
 let filter="";
 let params:unknown[]=[pos];
 if(path===newsImportant)filter="urgency IN ('high','breaking')";
 else if(path==="114")filter="is_featured=true";
 else if(path==="1129")filter="category IN ('medical','wedding')";
 else if(categories[path]){filter="category=$2";params=[pos,categories[path]];}
 const query="SELECT id,title,content,summary,urgency FROM public.news "+
   (filter?"WHERE "+filter+" ":"")+"ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1";
 const r=await pool.query<{id:number;title:string;content:string|null;summary:string|null;urgency:string}>(query,params);
 return r.rows[0]||null;
}
async function newsPrompt(path:string,position:number,chunkIndex:number){
 const post=await getNews(path,position);
 if(!post)return{
  text:(position?"You have reached the end of this news category. ":"No news in this category. ")+
    "Press 2 to restart. Press 3 for important updates. Press 4 for all updates. Press zero for the main menu.",
  hasMore:false
 };
 const body=safeVoice(post.content||post.summary,30000);
 const chunks:string[]=[];
 let remaining=body;
 while(remaining.length){
  if(remaining.length<=215){chunks.push(remaining);break;}
  let split=remaining.lastIndexOf(" ",215);
  if(split<130)split=215;
  chunks.push(remaining.slice(0,split));
  remaining=remaining.slice(split).trimStart();
 }
 if(!chunks.length)chunks.push("This update needs an English or verified Yiddish audio version. The original remains available on the website.");
 const part=Math.max(0,Math.min(chunkIndex,chunks.length-1));
 const headline=part===0?"News update "+(position+1)+". "+
  (safeVoice(post.title,65)||"This title is in Yiddish")+". ":"";
 return{
  text:headline+chunks[part]+
   ". Press 1 for this update actions, 2 for next, 3 for important news, 4 for all updates, 8 for previous, or zero for the main menu.",
  hasMore:part<chunks.length-1
 };
}
async function articlePrompt(client:import("pg").PoolClient,id:number,part:number){
 const r=await client.query<{title:string;content:string|null;summary:string|null}>(
  "SELECT title,content,summary FROM public.news WHERE id=$1",[id]);
 if(!r.rows[0])return {text:"This news update was not found. Press 2 to enter another article number or zero for the main menu.",hasMore:false};
 const data=r.rows[0];
 const body=safeVoice(data.content||data.summary,30000);
 const parts:string[]=[];
 let remain=body;
 while(remain.length){
  if(remain.length<=230){parts.push(remain);break;}
  let split=remain.lastIndexOf(" ",230);
  if(split<140)split=230;
  parts.push(remain.slice(0,split));
  remain=remain.slice(split).trimStart();
 }
 if(!parts.length)parts.push("This update needs an English or approved Yiddish recording.");
 const current=Math.min(part,parts.length-1);
 return{
  text:(current===0?"Article "+id+". "+(safeVoice(data.title,80)||"Yiddish headline")+". ":"")+
   parts[current]+". Press 1 for article actions, 2 for next part, 8 to restart this article, or zero for the main menu.",
  hasMore:current<parts.length-1
 };
}
async function currentNewsId(path:string,position:number,chosen:number|null):Promise<number|null>{
 if(path==="115")return chosen;
 const post=await getNews(path,position);
 return post?.id||null;
}
async function actionsMenu(client:import("pg").PoolClient,articleId:number|null,userId:number|null,validMember:boolean){
 if(!articleId)return "This news update is no longer available. Press nine to resume or zero for main menu.";
 const r=await client.query<{like_count:number}>("SELECT like_count FROM public.news WHERE id=$1",[articleId]);
 if(!r.rowCount)return "This news update has been removed. Press nine to resume or zero for main menu.";
 const count=r.rows[0]?.like_count??0;
 const replies=await client.query<{total:number}>(
  "SELECT count(*)::int AS total FROM public.gavhah_news_voice_replies "+
  "WHERE news_id=$1 AND status='approved'",[articleId]);
 let personal="";
 if(validMember&&userId){
  // These are the exact site-backed member rows, NOT caller-ID assumptions.
  const state=await client.query<{voted:boolean;saved:boolean}>(
   "SELECT EXISTS(SELECT 1 FROM public.entity_likes WHERE entity_type='news' AND entity_id=$1 AND user_id=$2) AS voted,"+
   "EXISTS(SELECT 1 FROM public.saved_items WHERE content_type='news' AND content_id=$1 AND user_id=$2) AS saved",
   [articleId,userId]);
  personal=(state.rows[0]?.voted?"You have upvoted this update. ":"You have not upvoted this update. ")+
   (state.rows[0]?.saved?"This update is in your saved list. ":"This update is not in your saved list. ");
 }
 return "Update "+articleId+" actions. "+
  personal+"Current upvotes "+count+". Approved voice replies "+(replies.rows[0]?.total||0)+". "+
  "Press 1 to upvote, 2 to remove upvote, 3 to record a reply for moderation, "+
  "4 to repeat the vote count, 5 to save, 6 to remove saved, 7 to report. "+
  "Press 9 to return to listening, or zero for main menu. "+
  (validMember?"Your website account is securely linked. ":
   "To vote save or reply please link your website account under My Askanus.");
}
async function memberAllowed(client:import("pg").PoolClient,state:State){
 if(!state.member_id||!state.linked_until||new Date(state.linked_until).getTime()<Date.now())return false;
 const r=await client.query(
  "SELECT id FROM public.users WHERE id=$1 AND status NOT IN ('banned','suspended')",[state.member_id]);
 return r.rowCount===1;
}
async function myContactPrompt(client:import("pg").PoolClient,userId:number,page:number){
 const person=await readMyContact(client,userId,page);
 if(!person)return "End of your own contacts. Press 2 to restart, 3 to add a contact by telephone number, 4 to look up a telephone number, 7 to find a contact by its website ID, or zero for main menu.";
 const spoken=(s:unknown,length=90)=>safeVoice(s,length)||"available on your private website";
 return "Your personal contact number "+(page+1)+"  website contact ID "+person.id+". "+
  "Name "+spoken(person.name,90)+". "+
  (person.organization?"Organization "+spoken(person.organization,75)+". ":"")+
  (person.city?"City "+spoken(person.city,45)+". ":"")+
  (person.phone?"Contact telephone "+spoken(person.phone,28)+". ":"")+
  "Role "+spoken(person.contact_role,35)+". "+
  (person.preferred_hours?"Preferred contact hours "+spoken(person.preferred_hours,55)+". ":"")+
  (person.do_not_call?"Marked Do Not Call. No automated contact is allowed. ":
    "Not marked Do Not Call. This is NOT proof of permission to contact. ")+
  "Press 1 for next, 8 for previous, 2 to restart, 3 to add a new contact, "+
  "4 to find by telephone number, 7 to find by website ID, 5 then 9 to mark Do Not Call, "+
  "or zero for main menu.";
}
async function myPrompt(client:import("pg").PoolClient,path:string,userId:number,page:number,confirmId:number|null){
 if(path==="134"){
  const followup=await readMyFollowup(client,userId,page);
  if(!followup)return "No more personal followups. Press 4 to create a followup for one of your cases, or 2 to restart, 8 for previous or zero for main menu.";
  const note=safeVoice(followup.note,170)||"This followup needs an English audio version";
  const recurrence=followup.repeat_rule&&followup.repeat_rule!=="none";
  return "Personal followup number "+(page+1)+". "+note+". "+
   (followup.due_date?"Due "+safeVoice(followup.due_date,24)+". ":"No deadline. ")+
   (followup.due_time?"At "+safeVoice(followup.due_time,16)+". ":"")+
   (followup.completed?"Completed. ":"Not completed. ")+
   (recurrence?"This followup repeats "+safeVoice(followup.repeat_rule,35)+
    ". To complete a recurring followup use the website, which creates the next occurrence correctly. ":
    followup.completed?"Press 6 twice to reopen this followup. ":"Press 5 twice to mark this followup done. ")+
   (confirmId===followup.id?"Press 5 again to confirm. ":"")+
   (confirmId===-followup.id?"Press 6 again to confirm. ":"")+
   "Press 1 next, 2 restart, 3 edit due date, 4 create new followup for a case, 5 complete, 6 reopen, 8 previous, 9 delete with confirmation, or zero main menu.";
 }
 if(path==="124"){
  const r=await client.query(
   "SELECT (SELECT count(*) FROM public.askanus_tasks WHERE user_id=$1 AND completed=false)::int AS pending,"+
   "(SELECT count(*) FROM public.askanus_cases WHERE user_id=$1 AND status!='closed')::int AS open_cases,"+
   "(SELECT count(*) FROM public.askanus_notes WHERE user_id=$1)::int AS notes",[userId]);
  const x=r.rows[0];
  return "My Askanus dashboard. "+x.pending+" pending tasks, "+x.open_cases+
   " open cases and "+x.notes+" notes. This is the same account as the website. Press zero for main menu.";
 }
 const isTask=taskPaths.has(path);
 const spec=isTask?
  {table:"askanus_tasks",fields:"id,title,case_title,deadline,priority,completed,notes",name:"tasks"}:
  path==="122"?
  {table:"askanus_cases",fields:"id,title,status,urgency,deadline,goal_amount,description,contact_name,category,funds_promised,funds_received",name:"cases"}:
  {table:"askanus_notes",fields:"id,title,content",name:"notes"};
 const qualifier=isTask?taskWhere[path]:"";
 // Identifiers and query fragments are constants, never supplied by callers.
 const r=await client.query(
   "SELECT "+spec.fields+" FROM public."+spec.table+
   " WHERE user_id=$1 "+qualifier+" ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,page]);
 const x=r.rows[0];
 const listTitle=path==="121"?"All my tasks":path==="127"?"Unfinished tasks":
   path==="128"?"Overdue tasks":path==="129"?"Tasks due within seven days":
   path==="122"?"My cases":"My private notes";
 if(!x)return "End of "+listTitle+". "+(isTask?"Press 3 to add a callback task. ":path==="122"?"Press 5 to create a callback case. ":path==="123"?"Press 3 to record a private voice note. ":"")+"Press 2 to restart, 8 for previous, or zero for main menu.";
 const heading=listTitle+" item "+(page+1)+". "+(safeVoice(x.title,105)||"This title needs English audio")+". ";
 if(isTask)return heading+
  "Priority "+safeVoice(x.priority,25)+". "+(x.completed?"Completed. ":"Not yet completed. ")+
  (x.deadline?"Due "+safeVoice(x.deadline,28)+". ":"")+
  (x.case_title?"Related case "+(safeVoice(x.case_title,50)||"listed on your website")+". ":"")+
  (x.notes?"Task notes "+(safeVoice(x.notes,110)||"need an English audio version")+". ":"")+
  (x.completed?"Press 6 twice to reopen this task. ":"Press 5 twice to mark this task complete. ")+
  (confirmId===x.id?"Press 5 again to confirm completion. ":"")+
  (confirmId===-x.id?"Press 6 again to confirm reopening. ":"")+
  "Press 1 for next, 2 to restart, 3 to create a callback task, 4 to change this task priority, 7 to set the deadline, 8 for previous, 9 twice to delete, or zero for main menu.";
 if(path==="122")return heading+
  "Case actions: 1 next, 2 restart, 3 change status, 4 change urgency, 5 create callback case, 6 add followup, 7 record contact attempt, 8 previous, 9 find case by website number, 0 main menu. "+
  "Status "+safeVoice(x.status,30)+". Priority "+safeVoice(x.urgency,30)+". "+
  (x.category?"Category "+safeVoice(x.category,45)+". ":"")+
  (x.description?"Description "+(safeVoice(x.description,160)||"Needs an English voice version")+". ":"")+
  (x.contact_name?"Contact "+(safeVoice(x.contact_name,45)||"Listed on your website")+". ":"")+
  (x.deadline?"Deadline "+safeVoice(x.deadline,22)+". ":"")+
  "Recorded goal "+Number(x.goal_amount||0)+" dollars. "+
  "Promised "+Number(x.funds_promised||0)+" dollars. "+
  "Received "+Number(x.funds_received||0)+" dollars. "+
  "That is the current information saved in your Gavhah website.";
 return heading+"Note actions: press 1 next, 2 restart, 3 record private note, 8 previous, 9 twice delete selected note, or zero main. "+
  (safeVoice(x.content,180)||"This note needs an English voice version.");
}

function sourceCallId(req:Request){
 const raw=String(req.body?.ApiCallId??req.query.ApiCallId??"");
 return /^[A-Za-z0-9_.:-]{8,160}$/.test(raw)?raw:null;
}
async function exactSecret(req:Request){
 const supplied=String(req.body?.entryKey??req.query.entryKey??"");
 if(!/^[a-f0-9]{64}$/.test(supplied))return null;
 const result=await pool.query<{callback_hash:string;state:string}>(
  "SELECT callback_hash,state FROM public.gavhah_yemot_ivr_install WHERE id=1");
 const expected=result.rows[0]?.callback_hash;
 if(typeof expected!=="string"||!["installing","live"].includes(result.rows[0]?.state))return null;
 const provided=createHash("sha256").update(supplied).digest("hex");
 return expected.length===provided.length&&
  timingSafeEqual(Buffer.from(expected),Buffer.from(provided))?supplied:null;
}
export async function handleYemotApp(req:Request,res:Response,tree:Record<string,TreeNode>):Promise<void>{
 const secret=await exactSecret(req);
 if(!secret){res.status(403).type("text/plain").send("Access denied");return;}
 const active=await pool.query("SELECT enabled,last_verified_at FROM public.gavhah_yemot_global WHERE id=1");
 if(!active.rows[0]?.enabled||!active.rows[0]?.last_verified_at){
  res.status(503).type("text/plain").send("Hotline integration not enabled");return;
 }
 const call=sourceCallId(req);
 if(!call){res.type("text/plain").send("id_list_message="+voice("Call identifier missing. Please try again."));return;}
 const callHash=createHmac("sha256",secret).update(call).digest("hex");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("INSERT INTO public.gavhah_yemot_call_states(call_hash) VALUES($1) ON CONFLICT(call_hash) DO NOTHING",[callHash]);
  const r=await client.query<State>("SELECT step,path,news_position,news_chunk,member_id,linked_until,login_failures,phone_page,selected_item_id,signup_phone,signup_stage,task_action,task_action_target,case_action,case_action_target,note_delete_target,note_record_mode,followup_action,followup_action_target,contact_action,contact_action_target,news_actions_open,news_reply_mode,news_reply_target,news_report_mode FROM public.gavhah_yemot_call_states WHERE call_hash=$1 FOR UPDATE",[callHash]);
  let s=r.rows[0],{step,path,news_position:position,news_chunk:chunk,phone_page:page,selected_item_id:confirmId}=s;
  let userId=s.member_id;
  let signupPhone=s.signup_phone,signupStage=s.signup_stage;
  let taskAction=s.task_action||"",taskActionTarget=s.task_action_target;
  let caseAction=s.case_action||"",caseActionTarget=s.case_action_target;
  let followupAction=s.followup_action||"",followupActionTarget=s.followup_action_target;
  let noteDeleteTarget=s.note_delete_target,noteRecordMode=s.note_record_mode||false;
  let contactAction=s.contact_action||"",contactActionTarget=s.contact_action_target;
  let actionsOpen=s.news_actions_open,replyMode=s.news_reply_mode,replyTarget=s.news_reply_target,reportMode=s.news_report_mode;
  if(step>9000){step=0;path="";position=0;chunk=0;page=0;confirmId=null;actionsOpen=false;replyMode=false;replyTarget=null;reportMode=false;}
  const inputName=(contactAction==="create"||contactAction==="search"?"rg":contactAction==="lookup"?"ar":noteRecordMode?"rr":caseAction==="jump"?"ar":caseAction==="create"?"rg":caseAction==="followup"?"dt":(followupAction==="date"||followupAction==="new_date")?"dt":followupAction==="new_case"?"ar":taskAction==="create"?"rg":taskAction==="deadline"?"dt":replyMode?"rr":path==="1251"?"ln":(path==="1252"||path==="2851"||(path==="1254"&&signupStage===1))?"pn":((path==="1254"&&signupStage===0)||path==="2854")?"rg":path==="115"&&!confirmId&&!actionsOpen?"ar":"iv")+step;
  const raw=req.body?.[inputName]??req.query[inputName];
  let feedback="";
  let goToProviderManagement=false;
  if(raw!==undefined&&raw!==null){
   const digit=String(raw).trim();
   // Existing Yemot management is usually extension /0 (admin_login).
   // Preserve it on root 0, and keep nested 0 returning to the API root.
   // Moving to /0 DOES NOT bypass the provider admin password.
   if(path==="" && digit==="0"){
    goToProviderManagement=true;
   }else if(noteRecordMode&&path==="123"){
    if(!await memberAllowed(client,{...s,member_id:userId})){
     noteRecordMode=false;path="125";
     feedback="Your Gavhah membership was not verified. Private note not saved. ";
    }else{
     const result=await createMyRecordedPhoneNote(client,userId!,callHash,digit);
     feedback=result.message+" ";noteRecordMode=false;page=0;
    }
   }else if(replyMode){
    if(!await memberAllowed(client,{...s,member_id:userId})){
      replyMode=false;actionsOpen=true;feedback="Phone login expired. Please pair your account on the website. ";
    }else{
      const result=await saveVoiceNewsReply(client,replyTarget||0,userId!,callHash,digit);
      replyMode=false;actionsOpen=true;feedback=result.info+" ";
    }
   }else if(reportMode){
    if(digit==="0"){path="";actionsOpen=false;reportMode=false;}
    else if(digit==="9"){reportMode=false;actionsOpen=true;}
    else{
     if(!await memberAllowed(client,{...s,member_id:userId})){feedback="Please link your account first. ";}
     else if(replyTarget){feedback=(await phoneNewsReport(client,userId!,replyTarget,digit))+" ";}
     reportMode=false;actionsOpen=true;
    }
   }else if(actionsOpen){
    const articleId=await currentNewsId(path,position,confirmId);
    if(digit==="0"){path="";position=0;chunk=0;confirmId=null;actionsOpen=false;replyMode=false;replyTarget=null;}
    else if(digit==="9"){actionsOpen=false;}
    else if(digit==="1"||digit==="2"){
     if(!articleId){feedback="News update not found. ";}
     else if(!await memberAllowed(client,{...s,member_id:userId})){
       feedback="Please link your account with an eight digit code in My Askanus before voting. ";
     }else{
       const response=await phoneNewsVote(client,userId!,articleId,digit==="1");
       feedback=response.info+" ";
     }
    }else if(digit==="3"){
     if(!articleId){feedback="News update not found. ";}
     else if(!await memberAllowed(client,{...s,member_id:userId})){
       feedback="Please link your account before recording a reply. ";
     }else{
       replyMode=true;replyTarget=articleId;actionsOpen=false;
       feedback="Your recording will be submitted for review and published on the same website article only after approval. ";
     }
    }else if(digit==="5"||digit==="6"){
     if(!articleId){feedback="News update not found. ";}
     else if(!await memberAllowed(client,{...s,member_id:userId})){
      feedback="Please link your account before saving an update. ";
     }else{feedback=(await phoneNewsSave(client,userId!,articleId,digit==="5"))+" ";}
    }else if(digit==="7"){
     if(!articleId){feedback="News update not found. ";}
     else if(!await memberAllowed(client,{...s,member_id:userId})){
      feedback="Please link your account before reporting an update. ";
     }else{replyTarget=articleId;reportMode=true;actionsOpen=false;}
    }else if(digit==="4"){
     if(!articleId){feedback="News update not found. ";}
     else{
      const r=await client.query("SELECT like_count FROM public.news WHERE id=$1",[articleId]);
      feedback="Current upvote count is "+Number(r.rows[0]?.like_count||0)+". ";
     }
    }
   }else if(path==="1251"){
    if(digit==="0"){path="";}
    else if(/^\d{8}$/.test(digit)&&s.login_failures<5){
     const key=process.env.YEMOT_ENCRYPTION_KEY||"";
     if(key.length>=36){
      const digest=createHmac("sha256",key).update("gavhah-phone-link-v1:"+digit).digest("hex");
      const used=await client.query<{user_id:number}>(
       "UPDATE public.gavhah_phone_pair_codes SET redeemed_at=now() "+
       "WHERE code_hash=$1 AND redeemed_at IS NULL AND expires_at>now() AND user_id IN "+
       "(SELECT id FROM public.users WHERE status NOT IN ('banned','suspended')) RETURNING user_id",[digest]);
      if(used.rows[0]){
       userId=used.rows[0].user_id;
       s.member_id=userId;s.login_failures=0;
       s.linked_until=new Date(Date.now()+30*60*1000).toISOString();
       path="12";feedback="Your account is securely connected for thirty minutes. ";
      }else{
       s.login_failures++;feedback="The code was invalid or expired. ";
      }
     }else{feedback="Secure code verification is not configured. ";}
    }else{
     s.login_failures++;
     feedback="Enter the eight digit website code. ";
    }
   }else if(path==="1252"){
    if(digit==="0"){path="125";}
    else if(/^[0-9]{12,16}$/.test(digit)&&s.login_failures<5){
     const verified=await verifyGavhahPhonePin(digit);
     if(verified){
      userId=verified;s.member_id=verified;s.linked_until=new Date(Date.now()+20*60*1000).toISOString();
      s.login_failures=0;path="12";feedback="Your Gavhah website membership is verified for this call. ";
     }else{s.login_failures++;feedback="Incorrect Gavhah hotline PIN. ";}
    }else{s.login_failures++;feedback="Enter your Gavhah twelve to sixteen digit hotline PIN. ";}
   }else if(path==="1254"){
    if(signupStage===0){
     if(/^[0-9]{10,15}$/.test(digit)){
      signupPhone=digit;signupStage=1;
      feedback="Now choose your own twelve to sixteen digit numerical password. This application will need contact verification before membership becomes active. ";
     }else feedback="Enter a valid ten to fifteen digit telephone contact number. ";
    }else if(signupPhone){
     if(/^[0-9]{12,16}$/.test(digit)){
      feedback=(await requestGavhahPhoneAccount(signupPhone,digit,callHash))+" ";
      signupPhone=null;signupStage=0;path="125";
     }else feedback="Enter a twelve to sixteen digit numbers only password. ";
    }
   }else if(path==="2851"){
    if(digit==="0"){path="285";}
    else if(/^[0-9]{12,16}$/.test(digit)&&s.login_failures<5){
     try{
      const cc=await campaignPhoneBridge("login",callHash,digit);
      if(cc.authenticated){s.login_failures=0;path="2";feedback="Your separate Campaign Center membership is verified. ";}
      else{s.login_failures++;feedback="Incorrect Campaign Center PIN or inactive membership. ";}
     }catch{s.login_failures++;feedback="Campaign Center membership service is temporarily unavailable. ";}
    }else{s.login_failures++;feedback="Enter your separate Campaign Center numeric PIN. ";}
   }else if(path==="2854"){
    if(/^[0-9]{10,15}$/.test(digit)){
     try{
      const submitted=await campaignPhoneBridge("join-request",callHash,undefined,digit);
      feedback=submitted.requested?
       "Your Campaign Center account opening request was saved in the Campaign Center software. You are not a member yet. After identity verification, complete Neon Auth website signup and join an organization. ":
       "Campaign Center registration request was not accepted. ";
      path="285";
     }catch{feedback="Campaign Center telephone account requests are temporarily unavailable. ";}
    }else feedback="Enter your ten to fifteen digit contact telephone number. ";
   }else if(path==="2853"){
    try{await campaignPhoneBridge("logout",callHash);}catch{/* do not falsely claim remote logout */}
    path="2";feedback="Return to Campaign Center. Verify the sign-out status from the account menu. ";
   }else if(path==="115"){
    if(digit==="0"){path="";confirmId=null;chunk=0;actionsOpen=false;}
    else if(confirmId===null){
     if(/^\d{1,8}$/.test(digit)&&Number(digit)>0){confirmId=Number(digit);chunk=0;}
    }else if(digit==="1"){actionsOpen=true;}
    else if(digit==="8"){chunk=0;}
    else if(digit==="2"||digit===""||digit==="None"){
     const current=await articlePrompt(client,confirmId,chunk);
     if(current.hasMore)chunk++;
     else{confirmId=null;chunk=0;feedback="End of article. Enter another article number. ";}
    }
   }else if(newsPath(path)){
    if(digit==="0"){path="";position=0;chunk=0;actionsOpen=false;}
    else if(digit==="1"){actionsOpen=true;}
    else if(digit==="3"){path=newsImportant;position=0;chunk=0;}
    else if(digit==="4"){path=newsAll;position=0;chunk=0;}
    else if(digit==="8"){position=Math.max(0,position-1);chunk=0;}
    else if(digit==="2"||digit===""||digit==="None"){
     const now=await newsPrompt(path,position,chunk);
     if(now.hasMore)chunk++;else{position++;chunk=0;}
    }
   }else if(contactAction&&contactPaths.has(path)){
    if(!await memberAllowed(client,{...s,member_id:userId})){
     contactAction="";contactActionTarget=null;path="125";
     feedback="Your Gavhah website member session is not verified. No private contact information was accessed or changed. ";
    }else if(digit==="0"){
     contactAction="";contactActionTarget=null;feedback="Contact action cancelled. ";
    }else if(contactAction==="create"){
     const created=await createMyCallbackContact(client,userId!,digit);
     feedback=created.message+" ";
     if(created.ok){contactAction="";contactActionTarget=null;page=0;}
    }else if(contactAction==="search"||contactAction==="lookup"){
     const match=await findMyContactPage(client,userId!,digit,
      contactAction==="search"?"phone":"id");
     if(match){
      page=match.page;contactAction="";contactActionTarget=null;
      feedback="Found the contact on your own website. ";
     }else feedback="No matching contact in your Gavhah account. Try another number, or zero to cancel. ";
    }else if(contactAction==="donotcall"){
     if(digit==="9"&&contactActionTarget){
      const result=await markMyContactDoNotCall(client,userId!,contactActionTarget);
      feedback=result.message+" ";
     }else feedback="Do Not Call change cancelled. ";
     contactAction="";contactActionTarget=null;
    }
   }else if(taskAction&&taskPaths.has(path)){
    if(!await memberAllowed(client,{...s,member_id:userId})){
     taskAction="";taskActionTarget=null;path="125";
     feedback="This action requires a valid, active Gavhah website membership. ";
    }else if(digit==="0"&&taskAction!=="deadline"){
     taskAction="";taskActionTarget=null;path="";page=0;confirmId=null;
    }else if(taskAction==="create"){
     const result=await createCallTask(client,userId!,digit);
     feedback=result.message+" ";
     if(result.ok){taskAction="";taskActionTarget=null;path="121";page=0;confirmId=null;}
    }else if(taskAction==="priority"){
     const result=await changePhoneTaskPriority(client,userId!,taskActionTarget||0,digit);
     feedback=result.message+" ";
     if(result.ok){taskAction="";taskActionTarget=null;confirmId=null;}
    }else if(taskAction==="deadline"){
     const result=await changePhoneTaskDeadline(client,userId!,taskActionTarget||0,
       digit==="00000000"?"0":digit);
     feedback=result.message+" ";
     if(result.ok){taskAction="";taskActionTarget=null;confirmId=null;}
    }else if(taskAction==="delete"){
     if(digit!=="9"){taskAction="";taskActionTarget=null;feedback="Delete cancelled. ";}
     else{
      const result=await deletePhoneTask(client,userId!,taskActionTarget||0);
      feedback=result.message+" ";taskAction="";taskActionTarget=null;confirmId=null;
      if(result.ok){page=0;path="121";}
     }
    }
   }else if(caseAction&&path==="122"){
    if(!await memberAllowed(client,{...s,member_id:userId})){
     caseAction="";caseActionTarget=null;path="125";
     feedback="Sign in to your own Gavhah account before changing a case. ";
    }else if(digit==="0"){
     caseAction="";caseActionTarget=null;path="";page=0;
    }else if(caseAction==="jump"){
     const id=/^[1-9][0-9]{0,7}$/.test(digit)?Number(digit):0;
     if(!id){feedback="Enter a valid case number up to eight digits. ";}
     else{
      const target=await client.query<{id:number;place:string}>(
       "SELECT c.id, (SELECT count(*)::text FROM public.askanus_cases newer "+
       "WHERE newer.user_id=$1 AND (newer.created_at,newer.id)>(c.created_at,c.id)) AS place "+
       "FROM public.askanus_cases c WHERE c.user_id=$1 AND c.id=$2",[userId,id]);
      if(!target.rows[0])feedback="This case number is not available on your own website account. ";
      else{
       page=Number(target.rows[0].place);caseAction="";caseActionTarget=null;
       feedback="Opened your own Gavhah case number "+id+". ";
      }
     }
    }else if(caseAction==="contact"){
     if(digit!=="9"){caseAction="";caseActionTarget=null;feedback="Contact attempt cancelled. ";}
     else{
      const result=await logMyCaseContactAttempt(client,userId!,caseActionTarget||0);
      feedback=result.message+" ";
      if(result.ok){caseAction="";caseActionTarget=null;confirmId=null;}
     }
    }else if(caseAction==="create"){
     const result=await createCallbackCase(client,userId!,digit);
     feedback=result.message+" ";
     if(result.ok){caseAction="";caseActionTarget=null;confirmId=null;page=0;}
    }else if(caseAction==="followup"){
     const result=await createCaseFollowupFromPad(client,userId!,caseActionTarget||0,digit);
     feedback=result.message+" ";
     if(result.ok){caseAction="";caseActionTarget=null;confirmId=null;}
    }else{
     const result=await updateMyCaseOnPhone(client,userId!,caseActionTarget||0,
       caseAction==="status"?"status":"urgency",digit);
     feedback=result.message+" ";
     if(result.ok){caseAction="";caseActionTarget=null;confirmId=null;}
    }
   }else if(followupAction&&path==="134"){
    if(!await memberAllowed(client,{...s,member_id:userId})){
     followupAction="";followupActionTarget=null;path="125";
     feedback="Sign in to your Gavhah website account to change your followups. ";
    }else if(followupAction==="new_case"){
     if(digit==="0"){
      followupAction="";followupActionTarget=null;
      feedback="New followup cancelled. ";
     }else if(/^[1-9][0-9]{0,7}$/.test(digit)){
      const exists=await client.query(
       "SELECT id FROM public.askanus_cases WHERE id=$1 AND user_id=$2",
       [Number(digit),userId]);
      if(!exists.rows[0]){
       feedback="No case with this number in your account. Enter the case number shown on your website. ";
      }else{
       followupActionTarget=Number(digit);
       followupAction="new_date";
       feedback="Case verified. Now choose a due date for the new followup. ";
      }
     }else feedback="Enter a valid case number up to eight digits, or zero to cancel. ";
    }else if(followupAction==="new_date"){
     if(digit==="00000000"){
      followupAction="";followupActionTarget=null;
      feedback="New followup cancelled. ";
     }else{
      const result=await createCaseFollowupFromPad(client,userId!,followupActionTarget||0,digit);
      feedback=result.message+" ";
      if(result.ok){followupAction="";followupActionTarget=null;page=0;}
     }
    }else if(followupAction==="date"){
     if(digit==="00000000"){
      followupAction="";followupActionTarget=null;
      feedback="Followup date edit cancelled without changing the website. ";
     }else{
     const result=await changeMyFollowupDueDate(client,userId!,followupActionTarget||0,digit);
     feedback=result.message+" ";
     if(result.ok){followupAction="";followupActionTarget=null;confirmId=null;}
     }
    }else if(followupAction==="delete"){
     if(digit==="9"){
      const result=await deleteMyFollowupFromPhone(client,userId!,followupActionTarget||0);
      feedback=result.message+" ";
      if(result.ok)page=0;
     }else feedback="Followup deletion cancelled. ";
     followupAction="";followupActionTarget=null;confirmId=null;
    }else{followupAction="";followupActionTarget=null;}
   }else if(noteDeleteTarget&&path==="123"){
    if(digit==="0"){
     path="";page=0;noteDeleteTarget=null;feedback="Delete cancelled. ";
    }else if(digit==="9"&&await memberAllowed(client,{...s,member_id:userId})){
     feedback=(await deleteMyPhoneNote(client,userId!,noteDeleteTarget))+" ";
     noteDeleteTarget=null;page=0;
    }else{
     noteDeleteTarget=null;feedback="Delete cancelled. ";
    }
   }else if(contactPaths.has(path)){
    if(!await memberAllowed(client,{...s,member_id:userId})){
     path="125";contactAction="";contactActionTarget=null;
     feedback="Sign in as an active Gavhah member to read your own contacts. ";
    }else if(digit==="0"){
     path="";page=0;contactAction="";contactActionTarget=null;
    }else if(digit==="1"){page++;contactAction="";contactActionTarget=null;}
    else if(digit==="8"){page=Math.max(0,page-1);contactAction="";contactActionTarget=null;}
    else if(digit==="2"){page=0;contactAction="";contactActionTarget=null;}
    else if(digit==="3"){contactAction="create";contactActionTarget=null;}
    else if(digit==="4"){contactAction="search";contactActionTarget=null;}
    else if(digit==="7"){contactAction="lookup";contactActionTarget=null;}
    else if(digit==="5"){
     const current=await readMyContact(client,userId!,page);
     if(!current)feedback="There is no contact at this list position. ";
     else if(current.do_not_call)feedback="This contact is already marked Do Not Call. ";
     else{
      contactAction="donotcall";contactActionTarget=current.id;
      feedback="This will stop outreach to the selected contact. ";
     }
    }
   }else if(contactAction&&(path==="131"||path==="132")){
    if(!await memberAllowed(client,{...s,member_id:userId})){
     contactAction="";contactActionTarget=null;path="125";page=0;
     feedback="Verify your own Gavhah membership before accessing contacts. ";
    }else if(digit==="0"){
     contactAction="";contactActionTarget=null;path="";page=0;
     feedback="Contact action cancelled. ";
    }else if(contactAction==="create"){
     const created=await createMyCallbackContact(client,userId!,digit);
     feedback=created.message+" ";
     if(created.ok){contactAction="";contactActionTarget=null;path="132";page=0;}
    }else if(contactAction==="search"||contactAction==="lookup"){
     const contact=await findMyContactPage(client,userId!,digit,contactAction==="search"?"phone":"id");
     if(contact){
      page=contact.page;path="132";contactAction="";contactActionTarget=null;
      feedback="Found a contact in your own Gavhah website account. ";
     }else feedback="No matching contact was found within your own member account. ";
    }else if(contactAction==="do_not_call"){
     if(digit!=="9"){
      feedback="Do Not Call change cancelled. ";
     }else{
      const result=await markMyContactDoNotCall(client,userId!,contactActionTarget||0);
      feedback=result.message+" ";
     }
     contactAction="";contactActionTarget=null;
    }
   }else if(contactPaths.has(path)){
    if(!await memberAllowed(client,{...s,member_id:userId})){
     path="125";page=0;contactAction="";contactActionTarget=null;
     feedback="This private Gavhah CRM section requires an active verified account. ";
    }else if(digit==="0"){path="";page=0;contactAction="";contactActionTarget=null;}
    else if(digit==="1"){page=Math.min(5000,page+1);}
    else if(digit==="8"){page=Math.max(0,page-1);}
    else if(digit==="2"){page=0;}
    else if((path==="132"||path==="131")&&["3","4","7","9"].includes(digit)){
      contactAction=digit==="3"?"create":(digit==="4"||digit==="9")?"search":"lookup";
      feedback=contactAction==="create"?"Add a new contact to your own Gavhah address book. ":
        contactAction==="search"?"Search only your own contacts by telephone number. ":
        "Look up your own contact by its exact website number. ";
    }else if(path==="132"&&digit==="5"){
      const contact=await readMyContact(client,userId!,page);
      if(!contact)feedback="There is no contact at this position. ";
      else{
       contactAction="do_not_call";contactActionTarget=contact.id;
       feedback="This restriction is saved on your Gavhah website account. ";
      }
    }
   }else if(contactPaths.has(path)){
   if(!await memberAllowed(client,{...s,member_id:userId})){
    path="125";page=0;contactAction="";contactActionTarget=null;
    spoken="This private section requires your own verified Gavhah membership. Please sign in with a website pairing code or your hotline PIN. ";
   }else if(contactAction&&["131","132"].includes(path)){
    if(contactAction==="create"||contactAction==="search"){
     mode="phone";
     spoken+=contactAction==="create"?
      "Enter a ten to fifteen digit number followed by pound to create a callback contact on your own website. This will not make an outbound call or assume consent.":
      "Enter an existing ten to fifteen digit contact phone number followed by pound. The search is restricted to your own website contacts.";
    }else if(contactAction==="lookup"){
     mode="article";
     spoken+="Enter the exact contact ID from your own Gavhah website, up to eight digits, followed by pound.";
    }else if(contactAction==="do_not_call"){
     mode="menu";
     spoken+="Press nine AGAIN to mark the selected contact Do Not Call. Press zero to cancel. This only ADDS a contact restriction.";
    }
   }else if(path==="132"){
    spoken+=await myContactPrompt(client,userId!,page);
   }else{
    spoken+=await readContactFeed(client,userId!,path as "131"|"1331"|"1332",page);
   }
  }else if(personalPaths.has(path)){
    if(digit==="0"){path="";page=0;confirmId=null;taskAction="";taskActionTarget=null;caseAction="";caseActionTarget=null;noteDeleteTarget=null;noteRecordMode=false;followupAction="";followupActionTarget=null;}
    else if(digit==="1"){page++;confirmId=null;}
    else if(digit==="8"){page=Math.max(0,page-1);confirmId=null;}
    else if(digit==="2"){page=0;confirmId=null;}
    else if(path==="134"&&digit==="4"&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     followupAction="new_case";followupActionTarget=null;confirmId=null;
     feedback="Create a followup for your own case. ";
    }
    else if(path==="134"&&["3","9"].includes(digit)&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     const selected=await readMyFollowup(client,userId,page);
     if(!selected)feedback="No followup at this position. Press two to restart. ";
     else{
      followupAction=digit==="3"?"date":"delete";
      followupActionTarget=selected.id;confirmId=null;
      feedback=digit==="3"?"Change followup due date. ":"A followup must be explicitly confirmed before deleting. ";
     }
    }
    else if(path==="134"&&["5","6"].includes(digit)&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     const item=await readMyFollowup(client,userId,page);
     if(!item){confirmId=null;feedback="No followup at this position. ";}
     else if(item.repeat_rule&&item.repeat_rule!=="none"){
      confirmId=null;feedback="Recurring followups must be completed on the website to preserve the next scheduled occurrence. ";
     }else{
      const wanted=digit==="5";
      if(item.completed===wanted){
       confirmId=null;feedback=wanted?"Followup is already complete. ":"Followup is already open. ";
      }else if(confirmId===(wanted?item.id:-item.id)){
       const result=await setMySimpleFollowupCompleted(client,userId,item.id,wanted);
       feedback=result.message+" ";confirmId=null;if(result.ok)page=0;
      }else{
       confirmId=wanted?item.id:-item.id;
       feedback="Press "+digit+" AGAIN to confirm changing this followup status. ";
      }
     }
    }
    else if(path==="123"&&digit==="3"&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     noteRecordMode=true;
     feedback="A private recording will be visible only in your own website Notes. ";
    }
    else if(path==="123"&&digit==="9"&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     const note=await client.query<{id:number}>(
      "SELECT id FROM public.askanus_notes WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",
      [userId,page]);
     if(note.rows[0])noteDeleteTarget=note.rows[0].id;
     else feedback="No private note at the current list position. ";
    }
    else if(path==="122"&&digit==="9"&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     caseAction="jump";caseActionTarget=null;
     feedback="Find a case by its website number. ";
    }
    else if(path==="122"&&digit==="5"&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     caseAction="create";caseActionTarget=null;
     feedback="Create a callback case by entering the contact telephone number. ";
    }
    else if(path==="122"&&["3","4","6","7"].includes(digit)&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     const item=await client.query<{id:number}>(
      "SELECT id FROM public.askanus_cases WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",
      [userId,page]);
     if(!item.rows[0])feedback="No case at this position. Press two to restart. ";
     else{
      caseAction=digit==="3"?"status":digit==="4"?"urgency":digit==="6"?"followup":"contact";
      caseActionTarget=item.rows[0].id;
     }
    }
    else if(taskPaths.has(path)&&digit==="3"&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     taskAction="create";taskActionTarget=null;
     feedback="Create a new callback task with a phone number. ";
    }else if(taskPaths.has(path)&&["4","7","9"].includes(digit)&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     const current=await client.query<{id:number}>(
      "SELECT id FROM public.askanus_tasks WHERE user_id=$1 "+taskWhere[path]+
      " ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,page]);
     if(!current.rows[0])feedback="No task at this position. Press two to restart. ";
     else{
      taskAction=digit==="4"?"priority":digit==="7"?"deadline":"delete";
      taskActionTarget=current.rows[0].id;
     }
    }
    else if((digit==="5"||digit==="6")&&taskPaths.has(path)&&userId&&
      await memberAllowed(client,{...s,member_id:userId})){
     const qualifier=taskWhere[path];
     const current=await client.query<{id:number;completed:boolean}>(
       "SELECT id,completed FROM public.askanus_tasks WHERE user_id=$1 "+
       qualifier+" ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,page]);
     const item=current.rows[0];
     if(item){
      const wantCompleted=digit==="5";
      if(item.completed===wantCompleted){
       confirmId=null;
       feedback=wantCompleted?"Task is already completed. ":"Task is already unfinished. ";
      }else{
       const confirmation=wantCompleted?item.id:-item.id;
       if(confirmId===confirmation){
        const outcome=await setPhoneTaskCompleted(client,userId,item.id,wantCompleted);
        confirmId=null;
        feedback=outcome.message+" ";
       }else{
        confirmId=confirmation;
        feedback="Press "+digit+" again to confirm your task status change. ";
       }
      }
     }
    }
   }else if(path==="126"){
    // A sign-out action is deliberately reachable only through My Askanus.
    userId=null;s.member_id=null;s.linked_until=null;path="12";feedback="You have signed out from this call. ";
   }else{
    const target=treeSelect(path,digit,tree);
    // No caller-ID-based access: every website member-only module must first
    // pass the SAME live member status validation as its web counterpart.
    const gavhahPrivate=target.startsWith("13")||target.startsWith("14")||
      target.startsWith("19")||target==="182"||
      (target.startsWith("12")&&!["12","125","1251","1252","1253","1254","126"].includes(target))||
      ["165","1712","154"].includes(target);
    const ccAccount=target.startsWith("285");
    const ccProtected=target.startsWith("2")&&target.length>=2&&target!=="2"&&
      !target.startsWith("29")&&!ccAccount&&target!=="28";
    if(gavhahPrivate && !await memberAllowed(client,{...s,member_id:userId})){
      path="125";
      feedback="This Gavhah feature requires your own active Gavhah membership. Choose temporary website code or numerical phone PIN. ";
    }else if(gavhahPrivate&&target.startsWith("19")){
      const member=await client.query<{role:string}>("SELECT role FROM public.users WHERE id=$1",[userId]);
      const role=member.rows[0]?.role;
      const requiresStaff=target.startsWith("192")||target.startsWith("193")||target.startsWith("194");
      const requiresSuper=target.startsWith("193");
      if((requiresSuper&&role!=="super_admin")||
         (requiresStaff&&!["admin","super_admin","moderator"].includes(role))){
        feedback="This administrator-only Gavhah section is not permitted for your member role. ";
      }else path=target;
    }else if(ccProtected){
      try{
       const cc=await campaignPhoneBridge("snapshot",callHash);
       if(!cc.authenticated){
        path="285";
        feedback="Campaign Center requires a separate Campaign Center member login. Enter your Campaign Center PIN under member access. ";
       }else{
        // Branch-scoped manager, finance and organization administration
        // checks happen independently on Campaign Center's own service.
        const elevated=(cc.organizations||[]).some(o=>["owner","manager","finance","auditor"].includes(o.role));
        const manager=(cc.organizations||[]).some(o=>["owner","manager"].includes(o.role));
        const needsManager=target.startsWith("28")||target.startsWith("253");
        const needsFinance=target.startsWith("24");
        if((needsManager&&!manager)||(needsFinance&&!elevated)){
         feedback="Your Campaign Center membership does not permit this management or finance option. ";
        }else path=target;
       }
      }catch{
       path="285";feedback="Campaign Center membership is not available for secure verification. Private access is blocked. ";
      }
    }else{
      path=target;
      if(path==="126"){
       userId=null;s.member_id=null;s.linked_until=null;path="12";
       feedback="You have signed out from Gavhah for this call. Campaign Center sessions are separate. ";
      }
    }
    position=0;chunk=0;page=0;confirmId=null;
    if(!taskPaths.has(path)){taskAction="";taskActionTarget=null;}
    if(!contactPaths.has(path)){contactAction="";contactActionTarget=null;}
    if(path!=="122"){caseAction="";caseActionTarget=null;}
    if(path!=="123")noteDeleteTarget=null;
   }
   step++;
  }
  let mode:"menu"|"news"|"code"|"article"|"record"|"pin"|"phone"|"contactPhone"|"date"="menu",spoken=feedback;
  if(contactAction&&contactPaths.has(path)){
   if(contactAction==="create"||contactAction==="search"){
    mode="contactPhone";
    spoken+=contactAction==="create"?
     "Enter ten to fifteen digits for the new contact telephone number followed by pound. No call will be placed. Press zero to cancel.":
     "Enter the contact telephone number with ten to fifteen digits followed by pound. Only contacts in your own Gavhah account can be found. Press zero to cancel.";
   }else if(contactAction==="lookup"){
    mode="article";
    spoken+="Enter the website contact ID, up to eight digits, followed by pound. Press zero to cancel. ";
   }else if(contactAction==="donotcall"){
    mode="menu";
    spoken+="Mark the selected contact Do Not Call on the website? Press 9 to confirm. Press zero to cancel. Only the website permission workflow can later remove this restriction. ";
   }
  }else if(contactPaths.has(path)){
   if(!await memberAllowed(client,{...s,member_id:userId})){
    spoken="This contact directory requires your own active Gavhah member login. Sign in through My Askanus on the hotline.";
   }else{
    spoken+=await myContactPrompt(client,userId!,page);
    if(path==="1311"){
     const current=await readMyContact(client,userId!,page);
     if(current){
      const snapshot=await myContactDonor360(client,userId!,current.id);
      if(snapshot){
       spoken+=" Donor 360 read only financial summary for this own contact. "+
        "Non cancelled pledge records "+snapshot.pledges+
        ". Pledge amounts "+snapshot.totalPromised.toFixed(2)+" dollars. "+
        "Remaining uncollected pledges "+snapshot.outstanding.toFixed(2)+" dollars. "+
        "Recorded receipts "+snapshot.receipts+
        ". Net received after recorded refunds "+snapshot.netReceived.toFixed(2)+" dollars. "+
        "Manual website call reports "+snapshot.manualCallReports+
        ". Linked followup records "+snapshot.linkedFollowups+". "+
        (snapshot.doNotCall?"Do Not Call is enabled. ":"Phone contact permission is NOT implied by this account. ")+
        "This menu does NOT charge, collect, refund or place calls.";
      }
     }
    }
   }
  }else if(followupAction&&path==="134"){
   if(followupAction==="new_case"){
    mode="article";
    spoken+="Enter your own Gavhah case number, up to eight digits, followed by pound. Enter zero to cancel.";
   }else if(followupAction==="new_date"){
    mode="date";
    spoken+="Enter eight digits for the followup due date, year month day, for example 20261130. Enter eight zeros to cancel.";
   }else if(followupAction==="date"){
    mode="date";
    spoken+="Enter a new followup due date as eight digits year month day. For example 20261130. To cancel enter eight zeros. The website will preserve current reminder time and recurrence settings.";
   }else{
    mode="menu";
    spoken+="WARNING. This deletes the selected followup from the Gavhah website. Press nine to CONFIRM deletion, or press zero to cancel.";
   }
  }else if(noteRecordMode&&path==="123"){
   mode="record";
   spoken+="Record your PRIVATE Gavhah note after the beep. Press pound when finished. It will be accessible only in your own Gavhah website Notes, never in public news or Campaign Center.";
  }else if(noteDeleteTarget&&path==="123"){
   mode="menu";
   spoken+="WARNING. You are about to delete this private note permanently from your own Gavhah website. Press nine AGAIN to confirm, or zero to cancel.";
  }else if(caseAction&&path==="122"){
   if(caseAction==="jump"){
    mode="article";
    spoken+="Enter your own Gavhah case number from the website, up to eight digits, followed by pound. Other members' cases cannot be opened.";
   }else if(caseAction==="contact"){
    mode="menu";
    spoken+="Confirm logging an attempted contact in this case website activity. Press nine again to confirm. Press zero to cancel. This will NOT make an outbound call.";
   }else if(caseAction==="create"){
    mode="phone";
    spoken+="Enter the ten to fifteen digit contact phone number followed by pound. A new callback case is created on your own Gavhah website; it does not create a donor or change money.";
   }else if(caseAction==="followup"){
    mode="date";
    spoken+="Enter eight digit followup date YYYYMMDD followed by pound. The reminder will be attached to this case in your Gavhah website. No time or recurring cycle is assumed.";
   }else{
    mode="menu";
    spoken+=caseAction==="status"?
      "Change case status on your Gavhah website. Press 1 open, 2 in progress, or 3 closed. Press zero to cancel.":
      "Change case urgency on your Gavhah website. Press 1 low, 2 medium, 3 high or 4 critical. Press zero to cancel.";
   }
  }else if(taskAction&&taskPaths.has(path)){
   if(taskAction==="create"){
    mode="phone";
    spoken+="Enter a ten to fifteen digit callback phone number followed by pound. A new website task titled Call this number will be added to your own Gavhah tasks.";
   }else if(taskAction==="priority"){
    mode="menu";
    spoken+="Change this task priority on your website. Press 1 low, 2 medium, 3 high. Press zero to cancel.";
   }else if(taskAction==="deadline"){
    mode="date";
    spoken+="Enter an eight digit due date YYYYMMDD, such as 20261130 for November thirtieth. To remove the deadline enter eight zeros. Press pound when finished.";
   }else if(taskAction==="delete"){
    mode="menu";
    spoken+="WARNING. Delete this task from your website. Press nine AGAIN to confirm permanent deletion. Press zero to cancel.";
   }
  }else if(path==="1252"||path==="2851"){
   mode="pin";
   spoken+=path==="1252"?
    "Enter your private twelve to sixteen digit Gavhah hotline PIN. Do not enter your website password.":
    "Enter your separate twelve to sixteen digit Campaign Center hotline PIN. Gavhah membership does not authorize Campaign Center.";
   if(s.login_failures>=5){path=path==="1252"?"125":"285";mode="menu";spoken="Too many attempts this call. Please hang up and try again later. ";}
  }else if(path==="1253"){
   spoken=await memberAllowed(client,{...s,member_id:userId})?
    "You are verified as a Gavhah member for this call. Press zero for the main menu.":
    "Not signed into Gavhah. Open My Askanus account access to enter a website pairing code or your member hotline PIN.";
  }else if(path==="1254"){
   mode=signupStage===0?"phone":"pin";
   spoken=signupStage===0?
    "Gavhah telephone membership application. Enter your ten to fifteen digit contact phone number, followed by pound. Existing accounts should use sign-in instead.":
    "Choose a twelve to sixteen digit numeric password, followed by pound. It will become your Gavhah website password and hotline PIN only after the administrator independently verifies your contact number and approves your application.";
  }else if(path==="2852"){
   try{
    const cc=await campaignPhoneBridge("snapshot",callHash);
    spoken=cc.authenticated?
     "Campaign Center membership verified. Active organizations "+(cc.organizationCount||0)+". "+
       (cc.organizations||[]).map(x=>(safeVoice(x.name,70)||"a Campaign Center organization")+" role "+x.role+".").join(" "):
     "You are not signed into Campaign Center. Use account menu option one for your separate Campaign Center PIN.";
   }catch{spoken="Campaign Center membership service is not configured or temporarily unavailable.";}
  }else if(path==="2854"){
   mode="phone";
   spoken="Campaign Center account opening. Enter your ten to fifteen digit contact telephone number, followed by pound. We will save your application in Campaign Center software. Your contact must be verified and Neon Auth website signup completed before you are a member.";
  }else if(reportMode){
   spoken+="Choose a report reason. Press 1 spam, 2 inappropriate, 3 misinformation, 4 harassment, or 5 other. Press 9 to cancel or zero for the main menu.";
  }else if(replyMode){
   mode="record";spoken+="Record your reply after the beep and press pound when finished. You may cancel by hanging up.";
  }else if(actionsOpen){
   const articleId=await currentNewsId(path,position,confirmId);
   spoken+=await actionsMenu(client,articleId,userId,await memberAllowed(client,{...s,member_id:userId}));
  }else if(path==="1251"){
   mode="code";spoken+="Enter the eight digit code shown in My Askanus on your website. "+
    "Codes expire after five minutes. Never share it with others.";
   if(s.login_failures>=5){path="12";mode="menu";spoken="Too many attempts. Hang up and try again later. ";}
  }else if(path==="115"){
   if(confirmId===null){
    mode="article";spoken+="Enter a news article number to hear its full text. Press zero for the main menu.";
   }else{
    spoken+=(await articlePrompt(client,confirmId,chunk)).text;
   }
  }else if(newsPath(path)){
   mode="news";spoken+=(await newsPrompt(path,position,chunk)).text;
  }else if(personalPaths.has(path)){
   if(!await memberAllowed(client,{...s,member_id:userId})){
    spoken="Your private account is not linked for this call. Open My Askanus on the website and generate an eight-digit code, then press 5 in this phone menu to sign in. Press zero for the main menu.";
   }else{
    spoken+=await myPrompt(client,path,userId!,page,confirmId);
   }
  }else spoken+=menuPrompt(path,tree);
  await client.query("UPDATE public.gavhah_yemot_call_states "+
   "SET step=$2,path=$3,news_position=$4,news_chunk=$5,phone_page=$6,selected_item_id=$7,member_id=$8,linked_until=$9,login_failures=$10,news_actions_open=$11,news_reply_mode=$12,news_reply_target=$13,news_report_mode=$14,signup_phone=$15,signup_stage=$16,task_action=$17,task_action_target=$18,case_action=$19,case_action_target=$20,note_delete_target=$21,note_record_mode=$22,contact_action=$23,contact_action_target=$24,followup_action=$25,followup_action_target=$26,updated_at=now() "+
   "WHERE call_hash=$1",[callHash,step,path,position,chunk,page,confirmId,userId,s.linked_until,s.login_failures,actionsOpen,replyMode,replyTarget,reportMode,signupPhone,signupStage,taskAction,taskActionTarget,caseAction,caseActionTarget,noteDeleteTarget,noteRecordMode,contactAction,contactActionTarget,followupAction,followupActionTarget]);
  await client.query("COMMIT");
  if(goToProviderManagement){
   res.type("text/plain; charset=utf-8").set("Cache-Control","no-store").send("go_to_folder=/0");
  }else{
   sendRead(res,spoken,step,mode);
  }
 }catch(err){await client.query("ROLLBACK").catch(()=>{});throw err;}
 finally{client.release();}
}
