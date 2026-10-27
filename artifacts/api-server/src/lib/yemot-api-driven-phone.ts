import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import type { Request, Response } from "express";
import { phoneNewsVote, saveVoiceNewsReply, phoneNewsSave, phoneNewsReport } from "./yemot-news-engagement";
import {enrollFromKeypad,pendingPhoneSignup,cancelPhoneSignup} from "./yemot-phone-signup";
import {sectionPaths,sectionRequiresLogin,pagedSections,readPhoneSection,currentPhoneActionId,confirmPhoneAction} from "./yemot-section-batch1";
import {currentOwnedCase,caseConfirmationToken,applyPhoneCaseAction,createTelephoneCaseDraft,telephoneCaseFollowup,telephoneCaseSummary} from "./olam-hachesed-phone-cases";

// ONE provider API bridge. All IVR paths, identities, and records are owned by
// Gavhah and Neon. No separate provider-side submenus, caller-ID login or
// recordings of card details.
type TreeNode={label:string;children?:Record<string,TreeNode>;details?:string};
type State={
 step:number;path:string;news_position:number;news_chunk:number;
 member_id:number|null;linked_until:string|null;login_failures:number;
 phone_page:number;selected_item_id:number|null;
 news_actions_open:boolean;news_reply_mode:boolean;news_reply_target:number|null;news_report_mode:boolean;
};
const categories:Record<string,string>={
 "1121":"emergency_appeal","1122":"fundraising","1123":"announcement",
 "1124":"volunteer_call","1125":"alert","1126":"org_update","1127":"bikur_cholim",
 "1128":"community"
};
const newsAll="111",newsImportant="113";
const personalPaths=new Set(["121","122","123","124"]);
const root="Welcome to Gavhah and Campaign Center. Press 1 for Gavhah. Press 2 for Campaign Center. Press 8 to create a Gavhah website member account by phone. Press zero for hotline management";
const gavhahRoot="Welcome to Gavhah. Press 1 for News, 2 for My Askanus and MAX, 3 for Contacts, 4 for Calling Center, 5 for Kindness, 6 for Community, 7 for Minyans, 8 for Messages and account, or 9 for Management. Enter 4444 for Campaign Center. Press zero for the existing telephone management. Registration is under 8 then 5.";
const nextHotlineRoot="Welcome to the Gavhah replacement hotline TEST. Press 1 for News, 2 for My Askanus and MAX, 3 for Contacts, 4 for Calling Center, 5 for Kindness, 6 for Community, 7 for Minyans, 8 for Messages and account, or 9 for Management. Press zero to repeat. This test does not replace the existing hotline.";
const sharedSignalwireRoot="Welcome to Olam Hachesed and Gavhah. Press 2 for cases, tasks, follow ups and MAX. Press 1 for news, 3 for contacts, 4 for calling center, 5 for kindness, 6 for community, 7 for minyans, 8 for account and messages, or 9 for management. For the previous system press five five five five five. After a single digit press pound, or wait for the keypad timeout.";
export function safeVoice(input:unknown,max=430){
 const plain=String(input??"").replace(/<[^>]+>/g," ").replace(/https?:\/\/\S+/gi," ");
 // English only during testing; never pretend English TTS understands Yiddish.
 if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(plain))return "";
 return plain.replace(/[&=,;#.\-]/g," ").replace(/[^\x20-\x7e]/g," ")
  .replace(/\s+/g," ").trim().slice(0,max);
}
function voice(s:string){return "t-"+safeVoice(s,430);}
function sendRead(res:Response,prompt:string,step:number,mode:"menu"|"root"|"news"|"code"|"article"|"record"|"registration"="menu"){
 if(mode==="record"){
  res.type("text/plain; charset=utf-8").set("Cache-Control","no-store")
   .send("read="+voice(prompt)+"=rr"+step+",,record");return;
 }
 const name=(mode==="code"?"ln":mode==="article"?"ar":mode==="registration"?"rg":"iv")+step;
 // Yehmot's documented read order is:
 // name, reuse, maxDigits, minDigits, timeout, playback, blockStar,
 // blockZero, replacement, allowedDigits, retries, emptyIsOk, emptyValue.
 // Never shift positions or block digit zero. Most menus use the smallest
 // valid six/seven fields so a telephone speech issue can be isolated.
 const opts=mode==="code"
 ? [name,"no","8","8","12","No","no"]
 : mode==="registration"
 ? [name,"no","16","1","18","No","no"]
 : mode==="article"
 ? [name,"no","8","1","8","No","no"]
 : mode==="news"
 ? [name,"no","1","0","7","No","no","no","","0123456789","1","Ok","None"]
 : mode==="root"
 ? [name,"no","4","1","8","No","no"]
 : [name,"no","1","1","8","No","no"];
 const providerBody="read="+voice(prompt)+"="+opts.join(",");
 if(step===0)logger.info({ivrResponse:"read",mode,step,promptCharacters:prompt.length,patternVersion:"basic-read-v2"},"Yemot welcome reply delivered");
 res.type("text/plain; charset=utf-8").set("Cache-Control","no-store").send(providerBody);
}
function menuPrompt(path:string,tree:Record<string,TreeNode>,ready4444=false,fromNext=false,fromShared=false){
 let nodes=tree,current:TreeNode|undefined;
 for(const d of path){current=nodes[d];if(!current)return root;nodes=current.children||{};}
 if(!path)return fromShared?sharedSignalwireRoot:fromNext?nextHotlineRoot:ready4444?gavhahRoot:root;
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
 if(!articleId)return "This news update is no longer available. Press nine to resume or zero for the main menu.";
 const r=await client.query<{like_count:number}>("SELECT like_count FROM public.news WHERE id=$1",[articleId]);
 const counter=r.rows[0]?.like_count??0;
 return "Update "+articleId+" options. Press 1 to upvote. Press 2 to remove an upvote. "+
  "Press 3 to record an audio reply for moderation. Press 4 to hear current upvote count. "+
  "Press 5 to save this article. Press 6 to remove it from saved. Press 7 to report this article. "+
  "Press 9 to return to listening or zero for the main menu. "+
  "Current upvotes "+counter+". "+(validMember?"You are signed in.":"To vote or reply, first link your account with the website code under My Askanus.") ;
}
async function memberAllowed(client:import("pg").PoolClient,state:State){
 if(!state.member_id||!state.linked_until||new Date(state.linked_until).getTime()<Date.now())return false;
 const r=await client.query(
  "SELECT id FROM public.users WHERE id=$1 AND status NOT IN ('banned','suspended')",[state.member_id]);
 return r.rowCount===1;
}
async function myPrompt(client:import("pg").PoolClient,path:string,userId:number,page:number,confirmId:number|null){
 if(path==="124"){
  const r=await client.query(
   "SELECT (SELECT count(*) FROM public.askanus_tasks WHERE user_id=$1 AND completed=false)::int AS pending,"+
   "(SELECT count(*) FROM public.askanus_cases WHERE user_id=$1 AND status!='closed')::int AS open_cases,"+
   "(SELECT count(*) FROM public.askanus_notes WHERE user_id=$1)::int AS notes",[userId]);
  const x=r.rows[0];
  return "My Askanus dashboard. "+x.pending+" pending tasks, "+x.open_cases+" open cases and "+x.notes+
   " notes. This is the same account as the website. Press zero for the main menu.";
 }
 const spec=path==="121"?
  {table:"askanus_tasks",fields:"id,title,deadline,priority,completed",name:"tasks"}:
  path==="122"?
  {table:"askanus_cases",fields:"id,title,status,urgency,deadline,goal_amount",name:"cases"}:
  {table:"askanus_notes",fields:"id,title,content",name:"notes"};
 // Identifiers are fixed constants. No user-supplied SQL identifiers.
 const r=await client.query(
   "SELECT "+spec.fields+" FROM public."+spec.table+
   " WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,page]);
 const x=r.rows[0];
 if(!x)return "You have reached the end of your "+spec.name+
  ". Press 2 to restart, 8 for previous, or zero for the main menu.";
 const heading=spec.name+" item "+(page+1)+". "+(safeVoice(x.title,125)||"This title needs an English audio version")+". ";
 if(path==="121")return heading+
  "Priority "+x.priority+". "+(x.completed?"Completed. ":"Not yet completed. ")+
  (x.deadline?"Due "+safeVoice(x.deadline,28)+". ":"")+
  (x.completed?"":"Press 5, then press 5 again, to mark this task complete. ")+
  (confirmId===x.id?"Confirm completion by pressing 5 now. ":"")+
  "Press 1 for next, 8 for previous, 2 for restart, or zero for the main menu.";
 if(path==="122")return heading+"Status "+x.status+". Priority "+x.urgency+". "+
  (x.deadline?"Deadline "+safeVoice(x.deadline,22)+". ":"")+
  "Recorded goal "+Number(x.goal_amount)+" dollars. "+
  "Press 5 twice to mark this case in progress. Press 6 twice to close. Press 7 twice to reopen a closed case. Press 9 twice to add an unscheduled follow up. "+
  "Press 1 for next, 8 for previous, 2 to restart, or zero for the main menu.";
 return heading+(safeVoice(x.content,170)||"This note needs an English audio version.")+
  ". Press 1 for next, 8 for previous, 2 to restart, or zero for the main menu.";
}
function sourceCallId(req:Request){
 const raw=String(req.body?.ApiCallId??req.query.ApiCallId??"");
 return /^[A-Za-z0-9_.:-]{8,160}$/.test(raw)?raw:null;
}
async function exactSecret(req:Request){
 const supplied=String(req.body?.entryKey??req.query.entryKey??"");
 if(!/^[a-f0-9]{64}$/.test(supplied))return null;
 if(req.path.endsWith("/shared-ivr")){
  // Only an already provider-signed webhook can receive this derived secret.
  // Keep it separate from the original Yemot and next-line callbacks.
  const key=String(process.env.SIGNALWIRE_SIGNING_KEY||"");
  if(key.length<24)return null;
  const row=(await pool.query("SELECT route_fingerprint,audit_state FROM public.gavhah_signalwire_shared_route "+
   "WHERE id=1 AND requested_number='6056558080' AND old_extension='55555' AND cutover_enabled=false")).rows[0];
  if(row?.audit_state!=="verified_compatibility_voice_url"||
     !/^[a-f0-9]{64}$/.test(String(row?.route_fingerprint||"")))return null;
  const expected=createHmac("sha256",key).update("gavhah-shared-55555-v1:"+row.route_fingerprint).digest("hex");
  return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(supplied,"hex"))?supplied:null;
 }
 if(req.path.endsWith("/next-ivr")){
  const selected=await pool.query("SELECT callback_hash,stage,provider_kind FROM public.gavhah_hotline_migration WHERE id=1");
  const record=selected.rows[0];
  if(record?.stage!=="testing"||!["yemot","signalwire"].includes(String(record?.provider_kind))||
     !/^[a-f0-9]{64}$/.test(String(record.callback_hash||"")))return null;
  const suppliedHash=createHash("sha256").update(supplied).digest("hex");
  return timingSafeEqual(Buffer.from(record.callback_hash,"hex"),Buffer.from(suppliedHash,"hex"))?supplied:null;
 }
 if(req.path.endsWith("/4444")){
  const value=process.env.YEMOT_ENCRYPTION_KEY||"";
  const key=Buffer.from(value,"base64");
  if(key.length!==32||key.toString("base64")!==value)return null;
  const expected=createHmac("sha256",key).update("gavhah-campaign-4444-callback-v1").digest("hex");
  if(!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(supplied,"hex")))return null;
  const installed=await pool.query("SELECT provider_summary #>> '{campaign4444,state}' AS state FROM public.gavhah_yemot_ivr_install WHERE id=1");
  return installed.rows[0]?.state==="live"?supplied:null;
 }
 const result=await pool.query<{callback_hash:string;state:string}>(
  "SELECT callback_hash,state FROM public.gavhah_yemot_ivr_install WHERE id=1");
 const expected=result.rows[0]?.callback_hash;
 if(typeof expected!=="string"||!["installing","live"].includes(result.rows[0]?.state))return null;
 const provided=createHash("sha256").update(supplied).digest("hex");
 return expected.length===provided.length&&
  timingSafeEqual(Buffer.from(expected),Buffer.from(provided))?supplied:null;
}
export async function handleYemotApp(req:Request,res:Response,tree:Record<string,TreeNode>):Promise<void>{
 const from4444=req.path.endsWith("/4444");
 const fromShared=req.path.endsWith("/shared-ivr");
 const fromNext=req.path.endsWith("/next-ivr")||fromShared;
 const secret=await exactSecret(req);
 if(!secret){res.status(403).type("text/plain").send("Access denied");return;}
 if(!fromNext){
  const active=await pool.query("SELECT enabled,last_verified_at FROM public.gavhah_yemot_global WHERE id=1");
  if(!active.rows[0]?.enabled||!active.rows[0]?.last_verified_at){
   res.status(503).type("text/plain").send("Hotline integration not enabled");return;
  }
 }
 const installStatus=await pool.query("SELECT provider_summary #>> '{campaign4444,state}' AS state FROM public.gavhah_yemot_ivr_install WHERE id=1");
 const ready4444=installStatus.rows[0]?.state==="live";
 const directGavhah=fromNext||ready4444;
 const call=sourceCallId(req);
 if(!call){res.type("text/plain").send("id_list_message="+voice("Call identifier missing. Please try again."));return;}
 const callHash=createHmac("sha256",secret).update(call).digest("hex");
 if(fromNext&&!fromShared){
  // One hashed, unique provider call per isolated TEST generation.
  const config=await pool.query("SELECT generation,stage FROM public.gavhah_hotline_migration WHERE id=1");
  const record=config.rows[0];
  if(record?.stage!=="testing"){res.status(503).type("text/plain").send("Test disabled");return;}
  const found=await pool.query(
   "INSERT INTO public.gavhah_hotline_migration_probes(generation,call_hash) VALUES($1,$2) "+
   "ON CONFLICT DO NOTHING RETURNING call_hash",[record.generation,callHash]);
  if(found.rowCount)await pool.query(
   "UPDATE public.gavhah_hotline_migration SET tested_calls=tested_calls+1,last_test_at=now() "+
   "WHERE id=1 AND stage='testing' AND generation=$1",[record.generation]);
 }
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("INSERT INTO public.gavhah_yemot_call_states(call_hash) VALUES($1) ON CONFLICT(call_hash) DO NOTHING",[callHash]);
  const r=await client.query<State>("SELECT step,path,news_position,news_chunk,member_id,linked_until,login_failures,phone_page,selected_item_id,news_actions_open,news_reply_mode,news_reply_target,news_report_mode FROM public.gavhah_yemot_call_states WHERE call_hash=$1 FOR UPDATE",[callHash]);
  let s=r.rows[0],{step,path,news_position:position,news_chunk:chunk,phone_page:page,selected_item_id:confirmId}=s;
  if(from4444 && step===0 && !path)path="2";
  let userId=s.member_id;
  let actionsOpen=s.news_actions_open,replyMode=s.news_reply_mode,replyTarget=s.news_reply_target,reportMode=s.news_report_mode;
  if(step>9000){step=0;path="";position=0;chunk=0;page=0;confirmId=null;actionsOpen=false;replyMode=false;replyTarget=null;reportMode=false;}
  const inputName=(replyMode?"rr":path==="125"?"ln":path==="185"?"rg":path==="115"&&!confirmId&&!actionsOpen?"ar":"iv")+step;
  const raw=req.body?.[inputName]??req.query[inputName]??(fromNext?req.body?.signalwireDigits:undefined);
  let feedback="";
  let goToProviderManagement=false;
  let goToCampaignExtension=false;
  if(raw!==undefined&&raw!==null){
   const digit=String(raw).trim();
   // Existing Yemot management is usually extension /0 (admin_login).
   // Preserve it on root 0, and keep nested 0 returning to the API root.
   // Moving to /0 DOES NOT bypass the provider admin password.
   if(path==="" && digit==="0" && !fromNext){
    goToProviderManagement=true;
   }else if(from4444 && digit==="0"){
    path="2";position=0;chunk=0;page=0;confirmId=null;actionsOpen=false;replyMode=false;reportMode=false;
   }else if(!from4444 && !fromNext && ready4444 && path==="" && digit==="4444"){
    goToCampaignExtension=true;
   }else if(!from4444 && directGavhah && path==="" && /^[1-9]$/.test(digit) && tree["1"]?.children?.[digit]){
    path="1"+digit;
   }else if(path==="" && digit==="8" && !ready4444){
    path="185";feedback="You chose Gavhah website member signup. ";
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
   }else if(path==="185"){
    // Public Gavhah registration, not Neon Auth Campaign Center membership.
    // Caller ID is not accepted as identity. PIN is hashed and confirmed twice.
    if(digit==="0"){
      await cancelPhoneSignup(client,callHash);path="";feedback="";
    }else if(userId && await memberAllowed(client,{...s,member_id:userId})){
      path="18";feedback="You already have a signed in website account on this call. ";
    }else{
      const result=await enrollFromKeypad(client,callHash,digit);
      feedback=result.message;
      if(result.completed && result.userId){
        userId=result.userId;s.member_id=userId;
        s.linked_until=new Date(Date.now()+30*60*1000).toISOString();
        path="18";
      }
    }
   }else if(path==="125"){
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
   }else if(sectionPaths.has(path)){
    // For protected actions require a recently paired website identity.
    // Every row is further scoped to that member ID in the SQL.
    if(digit==="0"){path="";page=0;confirmId=null;}
    else if(digit==="5" && (path==="132"||path==="181")){
      if(!userId || !await memberAllowed(client,{...s,member_id:userId})){
        feedback="Link your Gavhah account using the website code before changing private records. ";
        confirmId=null;
      }else{
        const id=await currentPhoneActionId(client,path,userId,page);
        if(!id){feedback="This record is not available. ";confirmId=null;}
        else if(confirmId===id){
          feedback=(await confirmPhoneAction(client,path,userId,id))+" ";
          confirmId=null;
        }else{
          confirmId=id;
          feedback=path==="132"
           ?"Press 5 again to confirm Do Not Call for this contact. "
           :"Press 5 again to mark this notification as read. ";
        }
      }
    }
    else if(pagedSections.has(path)&&digit==="1"){page=Math.min(40,page+1);confirmId=null;}
    else if(pagedSections.has(path)&&digit==="8"){page=Math.max(0,page-1);confirmId=null;}
    else if(pagedSections.has(path)&&digit==="2"){page=0;confirmId=null;}
    else confirmId=null;
   }else if(path==="127"){
    if(digit==="0"){path="";confirmId=null;}
    else if(digit==="5"){
     if(!userId||!await memberAllowed(client,{...s,member_id:userId})){
      confirmId=null;feedback="Link your website account with the eight digit pairing code before opening a private case. ";
     }else if(confirmId===127){
      feedback=await createTelephoneCaseDraft(client,userId);
      confirmId=null;path="122";page=0;
     }else{confirmId=127;feedback="Press 5 again to confirm creating a new private draft case. ";}
    }else{confirmId=null;feedback="Press 5 twice to create a draft case, or zero to return. ";}
   }else if(path==="128"){
    if(digit==="0"){path="";page=0;}
    else if(digit==="1"){page=Math.min(40,page+1);}
    else if(digit==="8"){page=Math.max(0,page-1);}
    else if(digit==="2"){page=0;}
   }else if(path==="129"){
    if(digit==="0"){path="";}
   }else if(personalPaths.has(path)){
    if(digit==="0"){path="";page=0;confirmId=null;}
    else if(digit==="1"){page++;confirmId=null;}
    else if(digit==="8"){page=Math.max(0,page-1);confirmId=null;}
    else if(digit==="2"){page=0;confirmId=null;}
    else if(path==="122"&&["5","6","7","9"].includes(digit)){
     if(!userId||!await memberAllowed(client,{...s,member_id:userId})){
      feedback="Link your website account before changing a case. ";confirmId=null;
     }else{
      const item=await currentOwnedCase(client,userId,page);
      const token=item&&caseConfirmationToken(item.id,digit);
      if(!item||token===null){feedback="Case is not available for telephone editing. ";confirmId=null;}
      else if(confirmId===token){
       feedback=await applyPhoneCaseAction(client,userId,item.id,digit);
       confirmId=null;
      }else{confirmId=token;feedback="Press "+digit+" again to confirm this change to case "+item.id+". ";}
     }
    }
    else if(digit==="5"&&path==="121"&&userId&&await memberAllowed(client,s)){
     const current=await client.query<{id:number;completed:boolean}>(
       "SELECT id,completed FROM public.askanus_tasks WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $2",[userId,page]);
     const item=current.rows[0];
     if(item&&!item.completed){
      if(confirmId===item.id){
       await client.query("UPDATE public.askanus_tasks SET completed=true,completed_at=now() "+
        "WHERE id=$1 AND user_id=$2 AND completed=false",[item.id,userId]);
       confirmId=null;feedback="Task marked complete on your website account. ";
      }else{confirmId=item.id;feedback="Please press 5 again to confirm. ";}
     }
    }
   }else if(path==="126"){
    // A sign-out action is deliberately reachable only through My Askanus.
    userId=null;s.member_id=null;s.linked_until=null;path="12";feedback="You have signed out from this call. ";
   }else{
    path=treeSelect(path,digit,tree);
    if(path==="126"){
      userId=null;s.member_id=null;s.linked_until=null;path="12";feedback="You have signed out from this call. ";
    }
    position=0;chunk=0;page=0;confirmId=null;
   }
   step++;
  }
  let mode:"menu"|"root"|"news"|"code"|"article"|"record"|"registration"="menu",spoken=feedback;
  if(reportMode){
   spoken+="Choose a report reason. Press 1 spam, 2 inappropriate, 3 misinformation, 4 harassment, or 5 other. Press 9 to cancel or zero for the main menu.";
  }else if(replyMode){
   mode="record";spoken+="Record your reply after the beep and press pound when finished. You may cancel by hanging up.";
  }else if(actionsOpen){
   const articleId=await currentNewsId(path,position,confirmId);
   spoken+=await actionsMenu(client,articleId,userId,await memberAllowed(client,{...s,member_id:userId}));
  }else if(path==="185"){
   mode="registration";
   const pending=await pendingPhoneSignup(client,callHash);
   spoken+=pending
    ? "Reenter your twelve to sixteen digit private password, then press pound. Press zero to cancel and return to the main menu. "
    : "Create a new Gavhah website member account by phone. Choose a PRIVATE twelve to sixteen digit numeric password. "+
      "Enter it now and press pound. You will need to enter it twice. After registration you will hear your ten digit member number. "+
      "On the website you can log in with M followed by that number, and the password you chose. "+
      "Phone account creation does not automatically create a separate Campaign Center Neon Auth account. "+
      "Press zero to cancel. ";
  }else if(path==="125"){
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
  }else if(sectionPaths.has(path)){
   const permitted=!sectionRequiresLogin.has(path)||
      await memberAllowed(client,{...s,member_id:userId});
   spoken+=await readPhoneSection(client,path,permitted?userId:null,page);
  }else if(path==="127"){
   spoken+="New Olam Hachesed case draft. Press 5 twice to create a private draft in your account. It will have no personal details until you edit it on the website. Press zero to return.";
  }else if(path==="128"||path==="129"){
   if(!await memberAllowed(client,{...s,member_id:userId})){
    spoken="This is a private Olam Hachesed section. Link your website account through My Askanus option 5 first. Press zero for the main menu.";
   }else{
    spoken+=path==="128"?await telephoneCaseFollowup(client,userId!,page):await telephoneCaseSummary(client,userId!);
   }
  }else if(personalPaths.has(path)){
   if(!await memberAllowed(client,{...s,member_id:userId})){
    spoken="Your private account is not linked for this call. Open My Askanus on the website and generate an eight-digit code, then press 5 in this phone menu to sign in. If you do not have a website account, press zero to return, then press 8 at the welcome menu to register by phone.";
   }else{
    spoken+=await myPrompt(client,path,userId!,page,confirmId);
   }
  }else {
   if(!path && directGavhah && !from4444)mode="root";
   spoken+=menuPrompt(path,tree,ready4444,fromNext,fromShared);
  }
  await client.query("UPDATE public.gavhah_yemot_call_states "+
   "SET step=$2,path=$3,news_position=$4,news_chunk=$5,phone_page=$6,selected_item_id=$7,member_id=$8,linked_until=$9,login_failures=$10,news_actions_open=$11,news_reply_mode=$12,news_reply_target=$13,news_report_mode=$14,updated_at=now() "+
   "WHERE call_hash=$1",[callHash,step,path,position,chunk,page,confirmId,userId,s.linked_until,s.login_failures,actionsOpen,replyMode,replyTarget,reportMode]);
  await client.query("COMMIT");
  if(goToProviderManagement){
   res.type("text/plain; charset=utf-8").set("Cache-Control","no-store").send("go_to_folder=/0");
  }else if(goToCampaignExtension){
   res.type("text/plain; charset=utf-8").set("Cache-Control","no-store").send("go_to_folder=/4444");
  }else{
   sendRead(res,spoken,step,mode);
  }
 }catch(err){await client.query("ROLLBACK").catch(()=>{});throw err;}
 finally{client.release();}
}
