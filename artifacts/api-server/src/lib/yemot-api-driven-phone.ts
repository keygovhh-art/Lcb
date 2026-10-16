import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import type { Request, Response } from "express";

// Every selection below runs in OUR backend. Yemot needs just ONE type=api
// entry pointing to /api/yemot/ivr, NOT individual built-in provider menus.
type TreeNode={label:string;children?:Record<string,TreeNode>;details?:string};
type State={step:number;path:string;news_position:number;news_chunk:number};
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
async function newsPrompt(path:string,position:number,chunkIndex:number):Promise<{text:string;autoplay:boolean;hasNextChunk:boolean}>{
 const important=path===newsImportant;
 const post=await getNews(position,important);
 if(!post)return{
  text:(position?"You have reached the end of these updates. ":"No updates were found. ")+
   "Press 2 to start again. Press 3 for important and critical updates. "+
   "Press 4 for all updates. Press zero for the main menu.",autoplay:false,hasNextChunk:false
 };
 const head=safeVoice(post.title,80);
 const original=String(post.content||post.summary||"").replace(/<[^>]+>/g," ").replace(/https?:\/\/\S+/gi," ");
 const spoken=safeVoice(original,30000);
 const chunks:string[]=[];
 // Split at whole words. Never truncate a full English article to five news
 // items or a single 250-character synopsis.
 let remaining=spoken;
 while(remaining.length){
   if(remaining.length<=230){chunks.push(remaining);break;}
   let split=remaining.lastIndexOf(" ",230);
   if(split<125)split=230;
   chunks.push(remaining.slice(0,split));
   remaining=remaining.slice(split).trimStart();
 }
 if(!chunks.length)chunks.push(
  "This update was written in Yiddish. A verified English voice version is not available yet.");
 const safeIndex=Math.max(0,Math.min(chunkIndex,chunks.length-1));
 const hasNextChunk=safeIndex<chunks.length-1;
 const heading=safeIndex===0
  ?(important?"Important and critical news. ":"All community updates. ")+
   "Update "+(position+1)+". "+(head||"News update")+". ":"";
 return {
  text:heading+chunks[safeIndex]+
   (hasNextChunk?" Next part follows. ":" ")+
   " Press 1 for next, 2 to replay, 3 for important news, "+
   "4 for all news, or zero for the main menu. Press 8 to go back. "+
   "Otherwise continue automatically.",
  autoplay:true,hasNextChunk
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
   "SELECT step,path,news_position,news_chunk FROM public.gavhah_yemot_call_states WHERE call_hash=$1 FOR UPDATE",[callHash]);
  const state=result.rows[0];
  let {step,path,news_position:newsPosition,news_chunk:newsChunk}=state;
  if(step>=9000){step=0;path="";newsPosition=0;newsChunk=0;}
  // Each provider read uses a NEW variable. Retries without that variable
  // must return the SAME prompt, never skip items or apply the action twice.
  const value=req.body?.["iv"+step]??req.query["iv"+step];
  if(value!==undefined && value!==null){
   const digit=String(value).trim();
   if(path===newsAll||path===newsImportant){
    if(digit==="0"){path="";newsPosition=0;newsChunk=0;}
    else if(digit==="3"){path=newsImportant;newsPosition=0;newsChunk=0;}
    else if(digit==="4"){path=newsAll;newsPosition=0;newsChunk=0;}
    else if(digit==="2"){newsPosition=0;newsChunk=0;}
    else if(digit==="8"){newsPosition=Math.max(0,newsPosition-1);newsChunk=0;}
    else if(digit==="1"||digit===""||digit==="None"){
     const previous=await newsPrompt(path,newsPosition,newsChunk);
     if(previous.hasNextChunk)newsChunk++;
     else{newsPosition++;newsChunk=0;}
    }
   }else{
    path=select(path,digit,tree);
    newsPosition=0;newsChunk=0;
   }
   step++;
   await client.query("UPDATE public.gavhah_yemot_call_states SET step=$2,path=$3,news_position=$4,news_chunk=$5,updated_at=now() WHERE call_hash=$1",
    [callHash,step,path,newsPosition,newsChunk]);
  }
  const spoken=path===newsAll||path===newsImportant
   ?await newsPrompt(path,newsPosition,newsChunk)
   :{text:prompt(path,tree),autoplay:false};
  await client.query("COMMIT");
  sendRead(res,spoken.text,step,spoken.autoplay);
 }catch(e){
  await client.query("ROLLBACK").catch(()=>{});
  throw e;
 }finally{client.release();}
}
