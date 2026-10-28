import {Router, type Request, type Response} from "express";
import {randomUUID, createDecipheriv} from "node:crypto";
import {pool} from "@workspace/db";
import {requireAuth, getCurrentSessionUser} from "../middlewares/auth";
import {phoneTree} from "./yemot-whole-platform-ivr";

// Only the already approved Gavhah/Yemot connection is used. Never change
// the root extension, switch numbers, or use SignalWire for this feature.
const router=Router();
const dbTable="public.gavhah_yemot_voice_prompts";
const safePath=(x:string)=>x==="root"||/^[1-9][0-9]{0,15}$/.test(x);
const problem=(res:Response,code:number,error:string)=>res.status(code).json({error});
const sameOrigin=(req:Request)=>{
 const origin=req.get("origin");
 if(req.get("sec-fetch-site")==="cross-site"||req.get("sec-fetch-site")==="same-site")return false;
 if(!origin)return true;
 try{
  const host=req.get("x-forwarded-host")||req.get("host");
  const url=new URL(origin);
  return url.protocol==="https:"&&url.host===host;
 }catch{return false;}
};
async function admin(req:Request,res:Response,next:(error?:unknown)=>void){
 try{
  const user=await getCurrentSessionUser(req);
  if(!user||user.role!=="super_admin"){problem(res,403,"Super administrator only");return;}
  if(req.method!=="GET"&&!sameOrigin(req)){problem(res,403,"Same-origin only");return;}
  next();
 }catch(e){next(e);}
}
function wrap(fn:(req:Request,res:Response)=>Promise<void>){
 return (req:Request,res:Response,next:(error?:unknown)=>void)=>{void fn(req,res).catch(next);};
}
type TreeItem={label:string;children?:Record<string,TreeItem>};
function catalogue(){
 const items:{path:string,label:string,kind:string,depth:number,parent:string}[]=[
  {path:"root",label:"Main menu — Gavhah / Campaign Center",kind:"menu",depth:0,parent:""}
 ];
 const visit=(tree:Record<string,TreeItem>,prefix:string)=>{
  for(const [digit,item] of Object.entries(tree)){
   const path=prefix+digit;
   items.push({path,label:item.label,kind:item.children?"menu":"button",depth:path.length,parent:prefix||"root"});
   if(item.children)visit(item.children,path);
  }
 };
 visit(phoneTree as Record<string,TreeItem>,"");
 return items;
}
function knownPath(input:string){return catalogue().some(x=>x.path===input);}
function getName(req:Request){return String(req.params.path||"");}
function checkAudio(bytes:Buffer,mime:string){
 if(bytes.length<80||bytes.length>4*1024*1024)return false;
 if(mime==="audio/wav"||mime==="audio/wave"||mime==="audio/x-wav")
  return bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WAVE";
 if(mime==="audio/webm")return bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
 if(mime==="audio/ogg")return bytes.toString("ascii",0,4)==="OggS";
 if(mime==="audio/mpeg"||mime==="audio/mp3")
  return bytes.toString("ascii",0,3)==="ID3"||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
 return false;
}
router.get("/admin/yemot/voice-studio",requireAuth,admin,wrap(async(_req,res)=>{
 const [prompts,installation]=await Promise.all([
  pool.query("SELECT path,tts_text,mime_type,octet_length(audio_data) AS audio_size,published_path,published_at,updated_at FROM "+dbTable+" ORDER BY path"),
  pool.query("SELECT state,target_path FROM public.gavhah_yemot_ivr_install WHERE id=1")
 ]);
 res.setHeader("Cache-Control","private, no-store");
 res.json({catalogue:catalogue(),prompts:prompts.rows,
  provider: {state:installation.rows[0]?.state||"not_configured",
    approvedFolder:installation.rows[0]?.target_path||null},
  note:"Draft audio is private. Only a manually published and verified file is offered to the existing Yemot IVR. No phone number, root menu, or SignalWire configuration is changed."});
}));
router.put("/admin/yemot/voice-studio/:path",requireAuth,admin,wrap(async(req,res)=>{
 const path=getName(req);
 if(!safePath(path)||!knownPath(path)){problem(res,400,"Unknown telephone menu path");return;}
 const phrase=req.body?.ttsText;
 if(typeof phrase!=="string"||phrase.length>950||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(phrase)){
  problem(res,400,"English TTS must contain at most 950 characters");return;
 }
 if(/[\u0590-\u05ff]/u.test(phrase)){problem(res,400,"Telephone TTS is currently English-only");return;}
 const normalized=phrase.replace(/\s+/g," ").trim();
 const q=await pool.query(
  "INSERT INTO "+dbTable+"(path,tts_text) VALUES($1,$2) ON CONFLICT(path) DO UPDATE SET tts_text=EXCLUDED.tts_text,updated_at=now() RETURNING path,tts_text,updated_at",
  [path,normalized]);
 res.json({ok:true,prompt:q.rows[0],note:"TTS applies on the connected Yemot API callback; no provider menu has been altered."});
}));
router.post("/admin/yemot/voice-studio/:path/audio",requireAuth,admin,wrap(async(req,res)=>{
 const path=getName(req);
 if(!safePath(path)||!knownPath(path)){problem(res,400,"Unknown menu path");return;}
 const mime=String(req.body?.mime||"").toLowerCase();
 const encoded=req.body?.base64;
 if(typeof encoded!=="string"||encoded.length>5_700_000||!/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded)){
  problem(res,400,"Audio must be valid base64 under four megabytes");return;
 }
 const bytes=Buffer.from(encoded,"base64");
 if(!checkAudio(bytes,mime)){problem(res,415,"Unsupported audio format or invalid audio signature");return;}
 // Replace draft only. A previously published file remains audible until
 // the owner explicitly publishes a replacement with a new, unique filename.
 const q=await pool.query("INSERT INTO "+dbTable+"(path,audio_data,mime_type) VALUES($1,$2,$3) "+
 "ON CONFLICT(path) DO UPDATE SET audio_data=EXCLUDED.audio_data,mime_type=EXCLUDED.mime_type,updated_at=now() "+
 "RETURNING path,octet_length(audio_data) AS size",[path,bytes,mime]);
 res.json({ok:true,audioSize:q.rows[0].size,live:false,needsPublish:true});
}));
router.get("/admin/yemot/voice-studio/:path/audio",requireAuth,admin,wrap(async(req,res)=>{
 const path=getName(req);
 if(!safePath(path)||!knownPath(path)){problem(res,400,"Unknown menu path");return;}
 const q=await pool.query("SELECT audio_data,mime_type FROM "+dbTable+" WHERE path=$1",[path]);
 const item=q.rows[0];
 if(!item?.audio_data){problem(res,404,"No audio draft");return;}
 res.setHeader("Content-Type",item.mime_type||"application/octet-stream");
 res.setHeader("Cache-Control","private, no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.end(item.audio_data);
}));
const providerRequest=async(token:string,operation:string,values:Record<string,string>)=>{
 const body=new URLSearchParams({token,...values});
 const response=await fetch("https://www.call2all.co.il/ym/api/"+operation,{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error("Yemot API unavailable");
 const result=await response.json() as {responseStatus?:string;files?:unknown[]};
 if(result?.responseStatus!=="OK")throw Error("Yemot declined "+operation);
 return result;
};
const decrypt=(row:{token_nonce:string;token_ciphertext:string;token_tag:string})=>{
 const configured=process.env.YEMOT_ENCRYPTION_KEY||"";
 const key=Buffer.from(configured,"base64");
 if(key.length!==32||key.toString("base64")!==configured)throw Error("Yemot encryption key unavailable");
 const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(row.token_nonce,"base64"));
 decipher.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
 decipher.setAuthTag(Buffer.from(row.token_tag,"base64"));
 return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,"base64")),decipher.final()]).toString("utf8");
};
router.post("/admin/yemot/voice-studio/:path/publish",requireAuth,admin,wrap(async(req,res)=>{
 const path=getName(req);
 if(!safePath(path)||!knownPath(path)){problem(res,400,"Unknown menu path");return;}
 if(req.body?.confirm!=="PUBLISH_TO_APPROVED_YEMOT_FOLDER"){
  problem(res,400,"Explicit publishing confirmation is required");return;
 }
 const row=await pool.query("SELECT audio_data,mime_type FROM "+dbTable+" WHERE path=$1",[path]);
 const asset=row.rows[0];
 if(!asset?.audio_data){problem(res,404,"Record or upload audio first");return;}
 const [installed,global]=await Promise.all([
  pool.query("SELECT state,target_path FROM public.gavhah_yemot_ivr_install WHERE id=1"),
  pool.query("SELECT token_nonce,token_ciphertext,token_tag,enabled,last_verified_at FROM public.gavhah_yemot_global WHERE id=1")
 ]);
 const target=installed.rows[0];
 if(target?.state!=="live"||!/^\/[0-9]{1,3}$/.test(target?.target_path||"")){
  problem(res,409,"A verified add-only Yemot extension must be live first; root untouched");return;
 }
 const conn=global.rows[0];
 if(!conn?.enabled||!conn?.last_verified_at){problem(res,409,"Central Yemot connection is not active");return;}
 const token=decrypt(conn);
 const directory="ivr2:"+target.target_path;
 const before=await providerRequest(token,"GetIVR2Dir",{path:directory});
 if(!Array.isArray(before.files))throw Error("Cannot verify approved Yemot media folder");
 const file="gavhah_"+randomUUID().replace(/-/g,"")+".wav";
 const basename=file.slice(0,-4);
 // Provider may return file objects in several name formats. Do not reuse a filename.
 if(before.files.some(x=>String(typeof x==="object"&&x!==null?(x as {name?:string}).name:x).includes(file)))
  throw Error("Yemot media name collision");
 const form=new FormData();
 form.set("token",token);form.set("path",directory+"/"+file);
 form.set("convertAudio","1");form.set("autoNumbering","false");form.set("tts","0");
 form.set("qqfile",new Blob([new Uint8Array(asset.audio_data)],{type:asset.mime_type}),file);
 const up=await fetch("https://www.call2all.co.il/ym/api/UploadFile",{
  method:"POST",body:form,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(45000)
 });
 if(!up.ok)throw Error("Yemot media upload failed");
 const result=await up.json() as {responseStatus?:string};
 if(result.responseStatus!=="OK")throw Error("Yemot did not accept media");
 const after=await providerRequest(token,"GetIVR2Dir",{path:directory});
 if(!Array.isArray(after.files)||!after.files.some(x=>
  String(typeof x==="object"&&x!==null?(x as {name?:string}).name:x).includes(basename))){
  problem(res,502,"Yemot did not confirm the uploaded file; old recording left unchanged");return;
 }
 const published=directory+"/"+file;
 await pool.query("UPDATE "+dbTable+" SET published_path=$2,published_at=now(),updated_at=now() WHERE path=$1",[path,published]);
 res.json({ok:true,verified:true,publishedPath:published,liveOnConnectedExtension:true});
}));
export async function phonePromptOverride(path:string):Promise<{ttsText:string|null;audioPath:string|null}>{
 const key=path||"root";
 if(!safePath(key))return {ttsText:null,audioPath:null};
 try{
  const q=await pool.query("SELECT tts_text,published_path FROM "+dbTable+" WHERE path=$1",[key]);
  const row=q.rows[0];
  const audioPath=String(row?.published_path||"");
  return {ttsText:typeof row?.tts_text==="string"&&row.tts_text.trim()?row.tts_text:null,
   audioPath:/^ivr2:\/[0-9]{1,3}\/gavhah_[a-f0-9]{32}\.wav$/.test(audioPath)?audioPath:null};
 }catch(e){
  if((e as {code?:string})?.code==="42P01")return {ttsText:null,audioPath:null};
  throw e;
 }
}
export default router;
