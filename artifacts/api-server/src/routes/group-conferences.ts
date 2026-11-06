import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { createCipheriv, createDecipheriv, randomBytes, randomInt } from "node:crypto";
import { requireAuth, getCurrentSessionUser } from "../middlewares/auth";
import { getYemotConferenceCredentials } from "./yemot-central";

// Gavhah GROUP conferences are independent of the global Hitkabtzu room.
// SignalWire owns ordinary telephone calling; this bridge uses Yemot ONLY
// for existing conference infrastructure and never originates a phone call.
const router=Router();
const wrap=(fn:(req:Request,res:Response)=>Promise<void>)=>
 (req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const idOf=(x:unknown)=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0&&n<100000000?n:null;};
const originOk=(req:Request)=>{
 const site=req.get("sec-fetch-site");
 if(site==="same-site"||site==="cross-site")return false;
 const origin=req.get("origin");
 if(!origin)return site==="same-origin";
 try{const o=new URL(origin);return o.protocol==="https:"&&o.host===(req.get("x-forwarded-host")||req.get("host"));}catch{return false;}
};
const mutating=(req:Request,res:Response,next:NextFunction)=>{
 if(!originOk(req)){res.status(403).json({error:"Same-origin request required"});return;}
 next();
};
type Actor={id:number;role:string};
type Group={id:number;name:string;privacy:string;owner_id:number;member:boolean;manager:boolean};
type Room={
 group_id:number;provider_state:string;enabled:boolean;provider_line:string|null;
 listener_extension:string|null;moderator_extension:string|null;member_pin_sealed:string|null;
 moderator_pin_sealed:string|null;mode:string;access_mode:string;
 provider_checked_at:string|null;last_error:string|null;updated_at:string;
};
const sayError=(res:Response,status:number,error:string)=>res.status(status).json({error});
async function actor(req:Request,res:Response):Promise<Actor|null>{
 const user=await getCurrentSessionUser(req);
 if(!user){sayError(res,401,"Sign in required");return null;}
 return user;
}
async function groupFor(id:number,userId:number|null):Promise<Group|null>{
 const r=await pool.query<Group>(
  "SELECT g.id,g.name,g.privacy,g.owner_id,"+
  "EXISTS(SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=$2 AND m.status='approved') AS member,"+
  "EXISTS(SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=$2 AND m.status='approved' AND m.role IN ('admin','moderator','owner')) AS manager "+
  "FROM public.groups g WHERE g.id=$1",[id,userId]);
 return r.rows[0]||null;
}
const canSee=(g:Group,a:Actor|null)=>g.privacy==="public"||!!a&&(g.owner_id===a.id||g.member);
const canManage=(g:Group,a:Actor)=>a.role==="super_admin"||g.owner_id===a.id||g.manager;
const canEnter=(g:Group,a:Actor|null,r:Room)=>{
 if(!a&&!canSee(g,null))return false;
 if(a&&(canManage(g,a)||g.member))return true;
 return g.privacy==="public"&&r.access_mode==="public";
};
async function roomFor(groupId:number):Promise<Room|null>{
 const r=await pool.query<Room>("SELECT * FROM public.group_conference_rooms WHERE group_id=$1",[groupId]);
 return r.rows[0]||null;
}
function key(){
 const b64=process.env.YEMOT_ENCRYPTION_KEY||"";
 const k=Buffer.from(b64,"base64");
 if(k.length!==32||k.toString("base64")!==b64)throw Error("Server conference encryption unavailable");
 return k;
}
function seal(groupId:number,purpose:"member"|"moderator",value:string):string{
 const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",key(),iv);
 c.setAAD(Buffer.from("gavhah:group-conference:"+groupId+":"+purpose+":v1"));
 const bytes=Buffer.concat([c.update(value,"utf8"),c.final()]);
 return Buffer.concat([iv,c.getAuthTag(),bytes]).toString("base64");
}
function unseal(groupId:number,purpose:"member"|"moderator",blob:string):string{
 const data=Buffer.from(blob,"base64");if(data.length<29)throw Error("Invalid stored conference code");
 const d=createDecipheriv("aes-256-gcm",key(),data.subarray(0,12));
 d.setAAD(Buffer.from("gavhah:group-conference:"+groupId+":"+purpose+":v1"));
 d.setAuthTag(data.subarray(12,28));
 return Buffer.concat([d.update(data.subarray(28)),d.final()]).toString("utf8");
}
async function event(groupId:number,actorId:number|null,action:string,details:Record<string,unknown>={}){
 await pool.query("INSERT INTO public.group_conference_events(group_id,actor_member_id,action,details) VALUES($1,$2,$3,$4::jsonb)",
  [groupId,actorId,action,JSON.stringify(details)]);
}
const safeExt=(p:unknown):p is string=>typeof p==="string"&&/^\/[0-9]{3}$/.test(p);
const publicMode=(r:Room|null)=>r?.mode==="listen_all"?"צוהערן":"שמועסן";
router.get("/groups/:id/conference",wrap(async(req,res)=>{
 const id=idOf(req.params.id);if(!id){sayError(res,400,"Invalid group");return;}
 const user=await getCurrentSessionUser(req),g=await groupFor(id,user?.id||null);
 if(!g||!canSee(g,user)){sayError(res,404,"Group not available");return;}
 const r=await roomFor(id),manager=!!user&&canManage(g,user);
 const usable=!!r&&r.enabled&&r.provider_state==="provider_accepted"&&
  safeExt(r.listener_extension)&&safeExt(r.moderator_extension);
 const enter=!!r&&usable&&canEnter(g,user,r);
 const out:Record<string,unknown>={
  provider:"Yemot",callingProvider:"SignalWire",groupId:id,
  configured:!!r&&r.provider_state==="provider_accepted",enabled:usable,
  mode:publicMode(r),accessMode:r?.access_mode||"members",
  canManage:manager,canJoin:enter,
  status:usable?"open":r?.provider_state==="needs_review"?"needs_provider_review":
   r?.provider_state==="provisioning"?"provisioning":r?.provider_state==="provider_accepted"?"closed":"not_configured",
  providerPhysicallyTested:false,
  note:"Yemot is only the conference provider. Ordinary calls are on SignalWire. Physical phone-call acceptance is not automatically verified."
 };
 if(enter&&r){
  out.dialLine=r.provider_line;out.extension=r.listener_extension;
  if(r.member_pin_sealed)out.entryCode=unseal(id,"member",r.member_pin_sealed);
 }
 if(manager&&r){
  out.providerLine=r.provider_line;
  out.moderatorExtension=r.moderator_extension;
  out.listenerExtension=r.listener_extension;
  out.providerState=r.provider_state;
  if(r.moderator_pin_sealed)out.moderatorCode=unseal(id,"moderator",r.moderator_pin_sealed);
 }
 res.setHeader("Cache-Control","private,no-store").json(out);
}));
router.patch("/groups/:id/conference",requireAuth,mutating,wrap(async(req,res)=>{
 const id=idOf(req.params.id);if(!id){sayError(res,400,"Invalid group");return;}
 const user=await actor(req,res);if(!user)return;
 const g=await groupFor(id,user.id);
 if(!g||!canManage(g,user)){sayError(res,403,"Group conference manager only");return;}
 const {enabled,accessMode,mode}=req.body||{};
 if(typeof enabled!=="boolean"||!["members","public"].includes(accessMode)||!["speech","listen_all"].includes(mode)){
  sayError(res,400,"Conference enabled, accessMode and mode are required");return;
 }
 if(g.privacy!=="public"&&accessMode==="public"){
  sayError(res,400,"Private groups cannot publish an unrestricted conference");return;
 }
 const r=await roomFor(id);
 if(!r){sayError(res,409,"Conference provider room must be provisioned first");return;}
 if(r.provider_state==="provider_accepted"&&r.mode!==mode){
  sayError(res,409,"Conference audio mode cannot change until the provider room is reconfigured and verified");return;
 }
 if(enabled&&(r.provider_state!=="provider_accepted"||!safeExt(r.listener_extension)||!safeExt(r.moderator_extension))){
  sayError(res,409,"Physical Yemot conference settings have not been accepted and verified by API");return;
 }
 await pool.query("UPDATE public.group_conference_rooms SET enabled=$2,access_mode=$3,mode=$4,updated_by=$5,updated_at=now() WHERE group_id=$1",
  [id,enabled,accessMode,mode,user.id]);
 await event(id,user.id,enabled?"invites_opened":"invites_closed",{mode,accessMode});
 res.setHeader("Cache-Control","no-store").json({ok:true,enabled,accessMode,mode,physicalCallsTested:false});
}));
async function superadmin(req:Request,res:Response,next:NextFunction){
 try{const user=await getCurrentSessionUser(req);
  if(!user||user.role!=="super_admin"){sayError(res,403,"Gavhah super administrator only");return;}
  next();
 }catch(e){next(e);}
}
type ProviderResult={responseStatus?:string;contents?:string;fileExists?:boolean;dirs?:unknown[];files?:unknown[]};
async function provider(token:string,action:"GetIVR2Dir"|"CheckIfFileExists"|"UpdateExtension"|"GetTextFile",params:Record<string,string>):Promise<ProviderResult>{
 const result=await fetch("https://www.call2all.co.il/ym/api/"+action,{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},
  body:new URLSearchParams({token,...params}),cache:"no-store",redirect:"error",
  signal:AbortSignal.timeout(15000)
 });
 if(!result.ok)throw Error("Yemot conference provider request failed");
 const data=await result.json() as ProviderResult;
 if(data.responseStatus!=="OK")throw Error("Yemot conference provider did not accept "+action);
 return data;
}
function config(raw:string){
 const out:Record<string,string>={};
 for(const line of raw.split(/\r?\n/)){
  const t=line.trim();if(!t||t.startsWith("#")||t.startsWith(";"))continue;
  const at=t.indexOf("=");if(at>0)out[t.slice(0,at).trim()]=t.slice(at+1).trim();
 }
 return out;
}
async function accepted(token:string,room:Room):Promise<boolean>{
 if(!safeExt(room.listener_extension)||!safeExt(room.moderator_extension))return false;
 const [l,m]=await Promise.all([
  provider(token,"GetTextFile",{what:"ivr2:"+room.listener_extension+"/ext.ini"}),
  provider(token,"GetTextFile",{what:"ivr2:"+room.moderator_extension+"/ext.ini"})
 ]);
 if(typeof l.contents!=="string"||typeof m.contents!=="string")return false;
 const a=config(l.contents),b=config(m.contents);
 const normalRoom=a.type==="confbridge"&&a.conf_bridge_type===room.mode;
 const managerRoom=b.type==="confbridge"&&b.conf_bridge_type==="admin"&&
   b.conf_bridge_folder_to_play===room.listener_extension;
 const passwordProtected=!!a.password&&!!b.password;
 return normalRoom&&managerRoom&&passwordProtected;
}
async function checkRoot(token:string){
 const root=await provider(token,"GetIVR2Dir",{path:"/"});
 if(!Array.isArray(root.dirs)||!Array.isArray(root.files))
  throw Error("Provider root inventory is incomplete; no changes made");
 const used=new Set<string>();
 for(const folder of root.dirs){
  const raw=typeof folder==="string"?folder:String((folder as any)?.name??(folder as any)?.fileName??(folder as any)?.path??"");
  if(!raw.trim())throw Error("Provider directory contains unknown entries; no changes made");
  const segment=raw.trim().replace(/\/+$/,"").split(/[/:]/).pop()||"";
  if(/^[0-9]{1,3}$/.test(segment))used.add(segment);
 }
 return used;
}
router.post("/admin/groups/:id/conference/provision",requireAuth,superadmin,mutating,wrap(async(req,res)=>{
 const id=idOf(req.params.id);if(!id){sayError(res,400,"Invalid group");return;}
 if(req.body?.confirm!=="ADD_ONLY_YEMOT_GROUP_CONFERENCE"){sayError(res,400,"Explicit add-only conference confirmation required");return;}
 const user=await actor(req,res);if(!user)return;
 const g=await groupFor(id,user.id);if(!g){sayError(res,404,"Unknown group");return;}
 const client=await pool.connect();
 let lock=false;
 try{
  const l=await client.query<{locked:boolean}>("SELECT pg_try_advisory_lock(56181,54171) AS locked");
  lock=!!l.rows[0]?.locked;
  if(!lock){sayError(res,409,"Another group conference installation is running");return;}
  const requestedMode=req.body?.mode==="listen_all"?"listen_all":"speech";
  const existing=await roomFor(id);
  if(existing&&existing.provider_state!=="unconfigured"){
   sayError(res,409,"A group conference already exists or requires provider inspection. Never overwrite existing conference extensions.");return;
  }
  const conn=await getYemotConferenceCredentials();
  const used=await checkRoot(conn.token);
  const reserved=await client.query<{extension:string}>(
   "SELECT listener_extension AS extension FROM public.group_conference_rooms WHERE listener_extension IS NOT NULL "+
   "UNION SELECT moderator_extension FROM public.group_conference_rooms WHERE moderator_extension IS NOT NULL");
  for(const r of reserved.rows)used.add(r.extension.replace(/^\//,""));
  const selected:string[]=[];
  for(let n=700;n<=899&&selected.length<2;n++){
   const ext=String(n);if(used.has(ext))continue;
   const chk=await provider(conn.token,"CheckIfFileExists",{path:"ivr2:/"+ext+"/ext.ini"});
   if(chk.fileExists!==false)continue;
   selected.push(ext);
  }
  if(selected.length!==2){sayError(res,409,"No pair of confirmed unused conference extensions found");return;}
  const listener="/"+selected[0],moderator="/"+selected[1];
  const memberPin=String(randomInt(10000000,100000000));
  const moderatorPin=String(randomInt(10000000,100000000));
  await client.query(
   "INSERT INTO public.group_conference_rooms(group_id,provider_state,provider_line,listener_extension,moderator_extension,member_pin_sealed,moderator_pin_sealed,updated_by,mode) "+
   "VALUES($1,'provisioning',$2,$3,$4,$5,$6,$7,$8)",
   [id,conn.lineNumber,listener,moderator,seal(id,"member",memberPin),seal(id,"moderator",moderatorPin),user.id,requestedMode]);
  try{
   await provider(conn.token,"UpdateExtension",{
    path:"ivr2:"+listener,type:"confbridge",title:"Gavhah Group "+id+" Meeting",
    conf_bridge_type:requestedMode,password:memberPin,conf_bridge_record:"no"
   });
   await provider(conn.token,"UpdateExtension",{
    path:"ivr2:"+moderator,type:"confbridge",title:"Gavhah Group "+id+" Moderator",
    conf_bridge_type:"admin",conf_bridge_folder_to_play:listener,
    conf_bridge_admin_no_ask:"yes",password:moderatorPin,conf_bridge_record:"no"
   });
   const current=await roomFor(id);
   if(!current||!await accepted(conn.token,current))throw Error("Provider read-back did not confirm both matching conference extensions");
   await client.query(
    "UPDATE public.group_conference_rooms SET provider_state='provider_accepted',provider_checked_at=now(),last_error=NULL,updated_at=now() WHERE group_id=$1",
    [id]);
   await event(id,user.id,"provider_accepted",{provider:"yemot",listener,moderator,rootUntouched:true,originatingCalls:false});
   res.setHeader("Cache-Control","private,no-store").json({
    providerAccepted:true,enabled:false,rootUntouched:true,callingProvider:"SignalWire",
    conferenceProvider:"Yemot",listenerExtension:listener,moderatorExtension:moderator,
    lineNumber:conn.lineNumber,physicalCallTested:false,
    message:"Yemot accepted and confirmed the conference settings by API. Real telephone acceptance must still be tested before public activation."
   });
  }catch{
   await client.query("UPDATE public.group_conference_rooms SET provider_state='needs_review',enabled=false,last_error=$2,updated_at=now() WHERE group_id=$1",
    [id,"Provider write/read-back inconclusive. Inspect reserved extensions before any retry."]).catch(()=>{});
   sayError(res,409,"Provider settings are not verified. No automatic retry; existing extensions and recordings remain untouched.");
  }
 }finally{
  if(lock)await client.query("SELECT pg_advisory_unlock(56181,54171)").catch(()=>{});
  client.release();
 }
}));
router.post("/admin/groups/:id/conference/verify",requireAuth,superadmin,mutating,wrap(async(req,res)=>{
 const id=idOf(req.params.id);if(!id){sayError(res,400,"Invalid group");return;}
 const user=await actor(req,res);if(!user)return;
 const r=await roomFor(id);
 if(!r||!safeExt(r.listener_extension)||!safeExt(r.moderator_extension)){sayError(res,404,"Conference extensions not reserved");return;}
 const conn=await getYemotConferenceCredentials();
 if(conn.lineNumber!==r.provider_line){sayError(res,409,"Conference belongs to a different provider line");return;}
 const ok=await accepted(conn.token,r);
 await pool.query("UPDATE public.group_conference_rooms SET provider_state=$2,enabled=CASE WHEN $3 THEN enabled ELSE false END,provider_checked_at=now(),last_error=$4,updated_by=$5,updated_at=now() WHERE group_id=$1",
  [id,ok?"provider_accepted":"needs_review",ok,ok?null:"Provider configuration did not match stored extensions",user.id]);
 await event(id,user.id,"provider_rechecked",{providerAccepted:ok});
 res.setHeader("Cache-Control","private,no-store").json({providerAccepted:ok,physicalCallTested:false});
}));

/** Cloudflare scheduled, account-owner-controlled one-time conference installer.
 * No public endpoint, no member impersonation, no call origination. The owner
 * authorized existing Gavhah groups, each is explicitly queued in Neon.
 * Add-only provider writes; one group per run, fail closed and never auto-retry
 * an ambiguous provider write or reuse an occupied root extension.
 */
export async function provisionNextQueuedGroupConference():Promise<{status:string;groupId:number|null}>{
 const client=await pool.connect();
 let locked=false;let id:number|null=null;let providerStarted=false;
 try{
  const advisory=await client.query<{locked:boolean}>("SELECT pg_try_advisory_lock(56181,54171) AS locked");
  locked=!!advisory.rows[0]?.locked;
  if(!locked)return {status:"other_installation_active",groupId:null};
  const claim=await client.query<{group_id:number;mode:string}>(
    "UPDATE public.group_conference_provision_queue SET state='working',updated_at=now() "+
    "WHERE group_id=(SELECT group_id FROM public.group_conference_provision_queue "+
    "WHERE state='queued' ORDER BY requested_at,group_id LIMIT 1 FOR UPDATE SKIP LOCKED) "+
    "RETURNING group_id,mode");
  if(!claim.rowCount)return{status:"queue_empty",groupId:null};
  id=claim.rows[0].group_id;
  const mode=claim.rows[0].mode;
  try{
   const existing=await roomFor(id);
   if(existing?.provider_state==="provider_accepted"){
    await client.query("UPDATE public.group_conference_provision_queue SET state='done',updated_at=now(),last_error=NULL WHERE group_id=$1",[id]);
    return{status:"already_configured",groupId:id};
   }
   if(existing){throw Error("A room already exists; manual review is required. No provider changes made.");}
   const conn=await getYemotConferenceCredentials();
   const used=await checkRoot(conn.token);
   const reserved=await client.query<{extension:string}>(
    "SELECT listener_extension AS extension FROM public.group_conference_rooms WHERE listener_extension IS NOT NULL "+
    "UNION SELECT moderator_extension FROM public.group_conference_rooms WHERE moderator_extension IS NOT NULL");
   for(const row of reserved.rows)used.add(row.extension.replace(/^\//,""));
   const selected:string[]=[];
   for(let n=700;n<=899&&selected.length<2;n++){
    const ext=String(n);if(used.has(ext))continue;
    const chk=await provider(conn.token,"CheckIfFileExists",{path:"ivr2:/"+ext+"/ext.ini"});
    if(chk.fileExists===false)selected.push(ext);
   }
   if(selected.length!==2)throw Error("No pair of confirmed unused conference extensions found");
   const listener="/"+selected[0],moderator="/"+selected[1];
   const memberPin=String(randomInt(10000000,100000000));
   const moderatorPin=String(randomInt(10000000,100000000));
   await client.query(
    "INSERT INTO public.group_conference_rooms(group_id,provider_state,provider_line,listener_extension,moderator_extension,member_pin_sealed,moderator_pin_sealed,mode) "+
    "VALUES($1,'provisioning',$2,$3,$4,$5,$6,$7)",
    [id,conn.lineNumber,listener,moderator,seal(id,"member",memberPin),seal(id,"moderator",moderatorPin),mode]);
   providerStarted=true;
   await provider(conn.token,"UpdateExtension",{
    path:"ivr2:"+listener,type:"confbridge",title:"Gavhah Group "+id+" Meeting",
    conf_bridge_type:mode,password:memberPin,conf_bridge_record:"no"
   });
   await provider(conn.token,"UpdateExtension",{
    path:"ivr2:"+moderator,type:"confbridge",title:"Gavhah Group "+id+" Moderator",
    conf_bridge_type:"admin",conf_bridge_folder_to_play:listener,
    conf_bridge_admin_no_ask:"yes",password:moderatorPin,conf_bridge_record:"no"
   });
   const stored=await roomFor(id);
   if(!stored||!await accepted(conn.token,stored))throw Error("Provider read-back did not confirm conference settings");
   await client.query("UPDATE public.group_conference_rooms SET provider_state='provider_accepted',provider_checked_at=now(),last_error=NULL,updated_at=now() WHERE group_id=$1",[id]);
   await client.query("UPDATE public.group_conference_provision_queue SET state='done',last_error=NULL,updated_at=now() WHERE group_id=$1",[id]);
   await event(id,null,"cloudflare_provider_accepted",{rootUntouched:true,callingProvider:"SignalWire",conferenceProvider:"Yemot",physicalCallTested:false});
   return{status:"provider_accepted",groupId:id};
  }catch(e){
   const message=e instanceof Error?e.message.slice(0,150):"Conference provider setup failed";
   await client.query("UPDATE public.group_conference_provision_queue SET state='failed',last_error=$2,updated_at=now() WHERE group_id=$1",[id,message]).catch(()=>{});
   if(providerStarted)await client.query("UPDATE public.group_conference_rooms SET provider_state='needs_review',enabled=false,last_error=$2,updated_at=now() WHERE group_id=$1",[id,"Manual provider read-back required; do not retry blindly"]).catch(()=>{});
   return{status:"failed_requires_review",groupId:id};
  }
 }finally{
  if(locked)await client.query("SELECT pg_advisory_unlock(56181,54171)").catch(()=>{});
  client.release();
 }
}

export default router;
