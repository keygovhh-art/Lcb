import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import type { Request, Response } from "express";

// Every selection below runs in OUR backend. Yemot needs just ONE type=api
// entry pointing to /api/yemot/ivr, NOT individual built-in provider menus.
type TreeNode={label:string;children?:Record<string,TreeNode>;details?:string};
type State={step:number;path:string;news_position:number};
const newsAll="111";
const newsImportant="113";
const SAFE_LIMIT=440;
const safeVoice=(input:unknown,max=SAFE_LIMIT)=>{
 const plain=String(input??"").replace(/<[^>]+>/g," ").replace(/https?:\/\/\S+/gi," ");
 // TEST LANGUAGE: English. Do not mispronounce Hebrew/Yiddish as English.
 if(/[\u0590-\u05ff\u0600-\u06ff]/u.test(plain))return "";
 return plain.replace(/[&=,;#.\-]/g," ").replace(/[^\x20-\x7e]/g," ")
   .replace(/\s+/g," ").trim().slice(0,max);
};
const voice=(s:string)=>"t-"+safeVoice(s);
const sendRead=(res:Response,s:string,step:number,autoplay=false)=>{
 // The provider read format supports unique variables on EVERY round trip.
 // Autoplay attempt: accepting an empty digit on a timeout. Whether Yemot
 // returns the empty choice must be checked with an actual physical call.
 const opts=autoplay
  ? ["iv"+step,"no","1","0","6","Digits","yes","","","012348","1","Ok","None","","no"]
  : ["iv"+step,"no","1","1","8","Digits","yes","","","012348","","","","","no"];
 return res.type("text/plain; charset=utf-8").send("read="+voice(s)+"="+opts.join(","));
};
const root="Welcome to Gavhah and Campaign Center. Press 1 for Gavhah. Press 2 for Campaign Center.";
function prompt(path:string,tree:Record<string,TreeNode>):string{
 let nodes=tree, current:TreeNode|undefined;
 for(const digit of path){current=nodes[digit];if(!current)return root;nodes=current.children||{};}
 if(!path)return root;
 if(!current?.children)return current?.details||
  "This option is not ready for telephone access yet. Press 0 to return to the main menu.";
 return current.label+". "+Object.entries(nodes).map(([n,x])=>"Press "+n+" for "+x.label+".").join(" ")+
   " Press zero for the main menu.";
}
const checkedKey=async(req:Request):Promise<string|null>=>{
 const expected=process.env.YEMOT_IVR_CALLBACK_KEY||"";
 const supplied=String(req.body?.entryKey??req.query.entryKey??"");
 if(expected.length<32||supplied.length!==expected.length ||
    !timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return null;
 return expected;
};
async function getNews(position:number,important:boolean){
 // Cursor position is per PHONE CALL and NOT capped at five. The same
 // public news table, sort and urgency categories as the website are used.
 const r=await pool.query<{
  id:number;title:string;content:string|null;summary:string|null;urgency:string;is_featured:boolean;
 }>("SELECT id,title,content,summary,urgency,is_featured FROM public.news "+
    (important?"WHERE urgency IN ('high','breaking') ":"")+
    "ORDER BY created_at DESC,id DESC LIMIT 1 OFFSET $1",[position]);
 return r.rows[0]??null;
}
async function newsPrompt(path:string,position:number):Promise<{text:string;autoplay:boolean}>{
 const important=path===newsImportant;
 const post=await getNews(position,important);
 if(!post)return{
  text:(position?"You have reached the end of these updates. ":"No updates were found. ")+
   "Press 2 to start again. Press 3 for important and critical updates. "+
   "Press 4 for all updates. Press zero for the main menu.",autoplay:false
 };
 const head=safeVoice(post.title,105);
 const body=safeVoice(post.content||post.summary,250);
 const fallback="This update is published in Yiddish. English audio is not available until a verified translation is connected.";
 return {
  text:(important?"Important and critical news. ":"All community updates. ")+
   "Update "+(position+1)+". "+
   (head||"News update")+". "+(body||fallback)+
   " Press 1 for the next update, 2 to start over, 3 for important news, "+
   "4 for all news, or zero for the main menu. If no button is pressed, the next update is selected.",
  autoplay:true
 };
}
function select(path:string,digit:string,tree:Record<string,TreeNode>):string{
 if(digit==="0")return ""; // global escape: no provider folders.
 if(!/^[1-9]$/.test(digit))return path;
 let nodes=tree;
 for(const part of path){if(!nodes[part]?.children)return path;nodes=nodes[part].children||{};}
 return nodes[digit]?path+digit:path;
}
function sanitizeCallId(req:Request):string|null{
 const raw=String(req.body?.ApiCallId??req.query.ApiCallId??"");
 return /^[A-Za-z0-9_.:-]{8,160}$/.test(raw)?raw:null;
}
export async function handleYemotApp(req:Request,res:Response,tree:Record<string,TreeNode>):Promise<void>{
 const secret=await checkedKey(req);
 if(!secret){res.status(403).type("text/plain").send("Access denied");return;}
 const active=await pool.query("SELECT enabled,last_verified_at FROM public.gavhah_yemot_global WHERE id=1");
 if(!active.rows[0]?.enabled||!active.rows[0]?.last_verified_at){
  res.status(503).type("text/plain").send("Hotline integration not enabled");return;
 }
 // Provider call IDs scope only the public navigation state. They are NEVER
 // identities or authorization credentials for member/private data.
 const providerCall=sanitizeCallId(req);
 if(!providerCall){
  res.type("text/plain; charset=utf-8").send("id_list_message="+
    voice("Call session was not received. Please try again later."));return;
 }
 const callHash=createHmac("sha256",secret).update(providerCall).digest("hex");
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  await client.query(
   "DELETE FROM public.gavhah_yemot_call_states WHERE updated_at < now()-interval '8 hours' "+
   "AND call_hash=$1",[callHash]);
  await client.query("INSERT INTO public.gavhah_yemot_call_states(call_hash) VALUES($1) "+
   "ON CONFLICT(call_hash) DO NOTHING",[callHash]);
  const result=await client.query<State>(
   "SELECT step,path,news_position FROM public.gavhah_yemot_call_states WHERE call_hash=$1 FOR UPDATE",[callHash]);
  const state=result.rows[0];
  let {step,path,news_position:newsPosition}=state;
  if(step>=9000){step=0;path="";newsPosition=0;}
  // Each provider read uses a NEW variable. Retries without that variable
  // must return the SAME prompt, never skip items or apply the action twice.
  const value=req.body?.["iv"+step]??req.query["iv"+step];
  if(value!==undefined && value!==null){
   const digit=String(value).trim();
   if(path===newsAll||path===newsImportant){
    if(digit==="0"){path="";newsPosition=0;}
    else if(digit==="3"){path=newsImportant;newsPosition=0;}
    else if(digit==="4"){path=newsAll;newsPosition=0;}
    else if(digit==="2"){newsPosition=0;}
    else if(digit==="8"){newsPosition=Math.max(0,newsPosition-1);}
    else if(digit==="1"||digit===""||digit==="None"){newsPosition++;}
   }else{
    path=select(path,digit,tree);
    newsPosition=0;
   }
   step++;
   await client.query("UPDATE public.gavhah_yemot_call_states SET step=$2,path=$3,news_position=$4,updated_at=now() WHERE call_hash=$1",
    [callHash,step,path,newsPosition]);
  }
  const spoken=path===newsAll||path===newsImportant
   ?await newsPrompt(path,newsPosition)
   :{text:prompt(path,tree),autoplay:false};
  await client.query("COMMIT");
  sendRead(res,spoken.text,step,spoken.autoplay);
 }catch(e){
  await client.query("ROLLBACK").catch(()=>{});
  throw e;
 }finally{client.release();}
}
