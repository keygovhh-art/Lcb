import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import type { Request, Response } from "express";

// ONE provider API bridge. All IVR paths, identities, and records are owned by
// Gavhah and Neon. No separate provider-side submenus, caller-ID login or
// recordings of card details.
type TreeNode={label:string;children?:Record<string,TreeNode>;details?:string};
type State={
 step:number;path:string;news_position:number;news_chunk:number;
 member_id:number|null;linked_until:string|null;login_failures:number;
 phone_page:number;selected_item_id:number|null;
};
const categories:Record<string,string>={
 "1121":"emergency_appeal","1122":"fundraising","1123":"announcement",
 "1124":"volunteer_call","1125":"alert","1126":"org_update","1127":"bikur_cholim",
 "1128":"community"
};
const newsAll="111",newsImportant="113";
const personalPaths=new Set(["121","122","123","124"]);
const root="Welcome to Gavhah and Campaign Center. Press 1 for Gavhah. Press 2 for Campaign Center.";
export function safeVoice(input:unknown,max=430){
 const plain=String(input??"").replace(/<[^>]+>/g," ").replace(/https?:\/\/\S+/gi," ");
 // English only during testing; never pretend English TTS understands Yiddish.
 if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(plain))return "";
 return plain.replace(/[&=,;#]/g," ").replace(/[^\x20-\x7e]/g," ")
  .replace(/\s+/g," ").trim().slice(0,max);
}
function voice(s:string){return "t-"+safeVoice(s,430);}
function sendRead(res:Response,prompt:string,step:number,mode:"menu"|"news"|"code"|"article"="menu"){
 const name=(mode==="code"?"ln":mode==="article"?"ar":"iv")+step;
 const opts=mode==="code"
 ? [name,"no","8","1","12","Digits","yes"]
 : mode==="article"
 ? [name,"no","8","1","8","Digits","yes"]
 : mode==="news"
 ? [name,"no","1","0","6","Digits","yes","","","012348","","","","","no"]
 : [name,"no","1","1","8","Digits","yes"];
 res.type("text/plain; charset=utf-8").set("Cache-Control","no-store").send("read="+voice(prompt)+"="+opts.join(","));
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
   ". Press 1 to continue, 2 to restart, 3 for important and critical news, 4 for all news, 8 for previous, or zero for the main menu.",
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
   parts[current]+". Press 1 for next part, 2 to enter a new article number, or zero for the main menu.",
  hasMore:current<parts.length-1
 };
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
  "Press 1 for next, 8 for previous, 2 to restart, or zero for the main menu.";
 return heading+(safeVoice(x.content,170)||"This note needs an English audio version.")+
  ". Press 1 for next, 8 for previous, 2 to restart, or zero for the main menu.";
}
function sourceCallId(req:Request){
 const raw=String(req.body?.ApiCallId??req.query.ApiCallId??"");
 return /^[A-Za-z0-9_.:-]{8,160}$/.test(raw)?raw:null;
}
function exactSecret(req:Request){
 const expect=process.env.YEMOT_IVR_CALLBACK_KEY||"";
 const supplied=String(req.body?.entryKey??req.query.entryKey??"");
 return expect.length>=32&&expect.length===supplied.length&&
  timingSafeEqual(Buffer.from(expect),Buffer.from(supplied))?expect:null;
}
export async function handleYemotApp(req:Request,res:Response,tree:Record<string,TreeNode>):Promise<void>{
 const secret=exactSecret(req);
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
  const r=await client.query<State>("SELECT step,path,news_position,news_chunk,member_id,linked_until,login_failures,phone_page,selected_item_id FROM public.gavhah_yemot_call_states WHERE call_hash=$1 FOR UPDATE",[callHash]);
  let s=r.rows[0],{step,path,news_position:position,news_chunk:chunk,phone_page:page,selected_item_id:confirmId}=s;
  let userId=s.member_id;
  if(step>9000){step=0;path="";position=0;chunk=0;page=0;confirmId=null;}
  const inputName=(path==="125"?"ln":path==="115"&&!confirmId?"ar":"iv")+step;
  const raw=req.body?.[inputName]??req.query[inputName];
  let feedback="";
  if(raw!==undefined&&raw!==null){
   const digit=String(raw).trim();
   if(path==="125"){
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
    if(digit==="0"){path="";confirmId=null;chunk=0;}
    else if(confirmId===null){
     if(/^\d{1,8}$/.test(digit)&&Number(digit)>0){
      confirmId=Number(digit);chunk=0;
     }
    }else if(digit==="2"){confirmId=null;chunk=0;}
    else if(digit==="1"){
     const current=await articlePrompt(client,confirmId,chunk);
     if(current.hasMore)chunk++;
    }
   }else if(newsPath(path)){
    if(digit==="0"){path="";position=0;chunk=0;}
    else if(digit==="3"){path=newsImportant;position=0;chunk=0;}
    else if(digit==="4"){path=newsAll;position=0;chunk=0;}
    else if(digit==="2"){position=0;chunk=0;}
    else if(digit==="8"){position=Math.max(0,position-1);chunk=0;}
    else if(digit==="1"||digit===""||digit==="None"){
     const now=await newsPrompt(path,position,chunk);
     if(now.hasMore)chunk++;else{position++;chunk=0;}
    }
   }else if(personalPaths.has(path)){
    if(digit==="0"){path="";page=0;confirmId=null;}
    else if(digit==="1"){page++;confirmId=null;}
    else if(digit==="8"){page=Math.max(0,page-1);confirmId=null;}
    else if(digit==="2"){page=0;confirmId=null;}
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
  let mode:"menu"|"news"|"code"|"article"="menu",spoken=feedback;
  if(path==="125"){
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
   "SET step=$2,path=$3,news_position=$4,news_chunk=$5,phone_page=$6,selected_item_id=$7,member_id=$8,linked_until=$9,login_failures=$10,updated_at=now() "+
   "WHERE call_hash=$1",[callHash,step,path,position,chunk,page,confirmId,userId,s.linked_until,s.login_failures]);
  await client.query("COMMIT");
  sendRead(res,spoken,step,mode);
 }catch(err){await client.query("ROLLBACK").catch(()=>{});throw err;}
 finally{client.release();}
}
