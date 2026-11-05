import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import { requireAuth, getCurrentSessionUser } from "../middlewares/auth";

// Group Center additions use the SAME public.groups, public.group_members,
// public.saved_items and public.notifications as the existing website.
// Never identify a telephone member by caller ID.
const router = Router();
const wrap = (fn:(req:Request,res:Response)=>Promise<void>) =>
 (req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const validId = (v:unknown) => {
 const value=Number(v);
 return Number.isSafeInteger(value)&&value>0&&value<=99999999?value:null;
};
const sameOrigin = (req:Request) => {
 const site=req.get("sec-fetch-site");
 if(site==="cross-site"||site==="same-site")return false;
 const origin=req.get("origin");
 if(!origin)return site==="same-origin";
 try {
  const url=new URL(origin);
  return url.protocol==="https:"&&url.host===(req.get("x-forwarded-host")||req.get("host"));
 }catch{return false;}
};
const mutating = (req:Request,res:Response,next:NextFunction) => {
 if(!sameOrigin(req)){res.status(403).json({error:"Same-origin request required"});return;}
 next();
};
async function current(req:Request,res:Response) {
 const user=await getCurrentSessionUser(req);
 if(!user){res.status(401).json({error:"Sign in required"});return null;}
 return user;
}
async function groupAccess(groupId:number,userId:number|null){
 const r=await pool.query<{
  id:number;name:string;privacy:string;owner_id:number;member_count:number;
  member:boolean;manager:boolean;
 }>(
  "SELECT g.id,g.name,g.privacy,g.owner_id,g.member_count,"+
  "COALESCE(EXISTS(SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=$2 AND m.status='approved'),false) AS member,"+
  "COALESCE(EXISTS(SELECT 1 FROM public.group_members m WHERE m.group_id=g.id AND m.user_id=$2 AND m.status='approved' AND m.role IN ('admin','moderator','owner')),false) AS manager "+
  "FROM public.groups g WHERE g.id=$1",[groupId,userId]);
 const g=r.rows[0];
 if(!g)return null;
 return {...g,canRead:g.privacy==="public"||!!userId&&(g.owner_id===userId||g.member),
  canManage:!!userId&&(g.owner_id===userId||g.manager)};
}
async function phoneProfile(groupId:number) {
 const result=await pool.query<{intro_text:string|null;intro_language:string|null;member_stats_public:boolean;has_audio:boolean;updated_at:string|null}>(
  "SELECT intro_text,intro_language,member_stats_public,intro_wav IS NOT NULL AS has_audio,updated_at "+
  "FROM public.group_phone_profiles WHERE group_id=$1",[groupId]);
 return result.rows[0]||{intro_text:null,intro_language:null,member_stats_public:false,has_audio:false,updated_at:null};
}
// This endpoint is intentionally registered BEFORE the legacy /groups/:id path.
router.get("/groups/me/library",requireAuth,wrap(async(req,res)=>{
 const user=await current(req,res);if(!user)return;
 const r=await pool.query(
  "SELECT g.id,g.name,g.description,g.privacy,g.member_count,"+
  "EXISTS(SELECT 1 FROM public.saved_items s WHERE s.user_id=$1 AND s.content_type='group' AND s.content_id=g.id) AS saved,"+
  "EXISTS(SELECT 1 FROM public.group_members m WHERE m.user_id=$1 AND m.group_id=g.id AND m.status='approved') AS joined "+
  "FROM public.groups g WHERE g.owner_id=$1 OR "+
  "EXISTS(SELECT 1 FROM public.group_members m WHERE m.user_id=$1 AND m.group_id=g.id AND m.status='approved') OR "+
  "(g.privacy='public' AND EXISTS(SELECT 1 FROM public.saved_items s WHERE s.user_id=$1 AND s.content_type='group' AND s.content_id=g.id)) "+
  "ORDER BY g.name ASC",[user.id]);
 res.setHeader("Cache-Control","private,no-store").json(r.rows);
}));
router.put("/groups/:id/save",requireAuth,mutating,wrap(async(req,res)=>{
 const user=await current(req,res);if(!user)return;
 const groupId=validId(req.params.id);
 if(!groupId){res.status(400).json({error:"Invalid group"});return;}
 const g=await groupAccess(groupId,user.id);
 if(!g||!g.canRead){res.status(404).json({error:"Group not available"});return;}
 await pool.query(
  "INSERT INTO public.saved_items(user_id,content_type,content_id,content_title,content_url) "+
  "VALUES($1,'group',$2,$3,$4) ON CONFLICT(user_id,content_type,content_id) DO NOTHING",
  [user.id,groupId,g.name,"/groups/"+groupId]);
 res.json({saved:true,joined:g.member||g.owner_id===user.id});
}));
router.delete("/groups/:id/save",requireAuth,mutating,wrap(async(req,res)=>{
 const user=await current(req,res);if(!user)return;
 const groupId=validId(req.params.id);
 if(!groupId){res.status(400).json({error:"Invalid group"});return;}
 await pool.query("DELETE FROM public.saved_items WHERE user_id=$1 AND content_type='group' AND content_id=$2",[user.id,groupId]);
 res.json({saved:false,note:"Group membership is unchanged"});
}));
router.get("/groups/:id/hotline-profile",wrap(async(req,res)=>{
 const groupId=validId(req.params.id);
 if(!groupId){res.status(400).json({error:"Invalid group"});return;}
 const user=await getCurrentSessionUser(req);
 const g=await groupAccess(groupId,user?.id||null);
 if(!g||!g.canRead){res.status(404).json({error:"Group not available"});return;}
 const profile=await phoneProfile(groupId);
 const show=profile.member_stats_public||g.canManage||user?.role==="super_admin";
 const memberCount=show?(await pool.query<{count:string}>(
   "SELECT count(DISTINCT user_id)::text AS count FROM public.group_members WHERE group_id=$1 AND status='approved'",[groupId])).rows[0]?.count:null;
 const savedCount=show?(await pool.query<{count:string}>(
   "SELECT count(DISTINCT user_id)::text AS count FROM public.saved_items WHERE content_type='group' AND content_id=$1",[groupId])).rows[0]?.count:null;
 const saved=user?!!(await pool.query("SELECT 1 FROM public.saved_items WHERE user_id=$1 AND content_type='group' AND content_id=$2 LIMIT 1",[user.id,groupId])).rowCount:false;
 res.setHeader("Cache-Control","private,no-store").json({
  introText:profile.intro_text,introLanguage:profile.intro_language,
  hasAudio:profile.has_audio,audioUrl:profile.has_audio?"/api/groups/"+groupId+"/hotline-audio":null,
  memberStatsPublic:profile.member_stats_public,memberCount,savedCount,
  joined:g.member||!!user&&g.owner_id===user.id,saved,canManage:g.canManage||user?.role==="super_admin"
 });
}));
router.patch("/groups/:id/hotline-profile",requireAuth,mutating,wrap(async(req,res)=>{
 const user=await current(req,res);if(!user)return;
 const groupId=validId(req.params.id);
 if(!groupId){res.status(400).json({error:"Invalid group"});return;}
 const g=await groupAccess(groupId,user.id);
 if(!g){res.status(404).json({error:"Group not available"});return;}
 if(!g.canManage&&user.role!=="super_admin"){res.status(403).json({error:"Group management required"});return;}
 const {memberStatsPublic,introText,introLanguage}=req.body||{};
 if(memberStatsPublic!==undefined&&typeof memberStatsPublic!=="boolean"){
  res.status(400).json({error:"Invalid stats setting"});return;
 }
 if(introText!==undefined&&(typeof introText!=="string"||introText.length>1000)){
  res.status(400).json({error:"Invalid text"});return;
 }
 if(introLanguage!==undefined&&!["yi","en",null].includes(introLanguage)){
  res.status(400).json({error:"Invalid language"});return;
 }
 await pool.query(
  "INSERT INTO public.group_phone_profiles(group_id,intro_text,intro_language,member_stats_public) VALUES($1,$2,$3,$4) "+
  "ON CONFLICT(group_id) DO UPDATE SET "+
  "intro_text=COALESCE($2,group_phone_profiles.intro_text),"+
  "intro_language=COALESCE($3,group_phone_profiles.intro_language),"+
  "member_stats_public=COALESCE($4,group_phone_profiles.member_stats_public),updated_at=now()",
  [groupId,introText===undefined?null:introText.trim(),introLanguage===undefined?null:introLanguage,memberStatsPublic===undefined?null:memberStatsPublic]);
 res.json({ok:true});
}));
router.post("/groups/:id/hotline-audio",requireAuth,mutating,wrap(async(req,res)=>{
 const user=await current(req,res);if(!user)return;
 const groupId=validId(req.params.id);
 if(!groupId){res.status(400).json({error:"Invalid group"});return;}
 const g=await groupAccess(groupId,user.id);
 if(!g){res.sendStatus(404);return;}
 if(!g.canManage&&user.role!=="super_admin"){res.sendStatus(403);return;}
 const data=req.body?.base64;
 if(req.body?.mime!=="audio/wav"||typeof data!=="string"||data.length>1400000||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(data)){
  res.status(400).json({error:"Short PCM WAV recording required"});return;
 }
 const bytes=Buffer.from(data,"base64");
 if(bytes.length<46||bytes.length>1000000||bytes.toString("ascii",0,4)!=="RIFF"||
    bytes.toString("ascii",8,12)!=="WAVE"||bytes.readUInt16LE(20)!==1||
    bytes.readUInt16LE(22)!==1||bytes.readUInt32LE(24)!==16000||
    bytes.readUInt16LE(34)!==16||bytes.readUInt32LE(40)+44>bytes.length){
  res.status(415).json({error:"Use a recording up to 30 seconds in 16kHz mono WAV"});return;
 }
 await pool.query(
  "INSERT INTO public.group_phone_profiles(group_id,intro_wav) VALUES($1,$2) "+
  "ON CONFLICT(group_id) DO UPDATE SET intro_wav=EXCLUDED.intro_wav,updated_at=now()",
  [groupId,bytes]);
 res.json({ok:true,url:"/api/groups/"+groupId+"/hotline-audio"});
}));
router.delete("/groups/:id/hotline-audio",requireAuth,mutating,wrap(async(req,res)=>{
 const user=await current(req,res);if(!user)return;
 const groupId=validId(req.params.id);
 if(!groupId){res.sendStatus(400);return;}
 const g=await groupAccess(groupId,user.id);
 if(!g){res.sendStatus(404);return;}
 if(!g.canManage&&user.role!=="super_admin"){res.sendStatus(403);return;}
 await pool.query("UPDATE public.group_phone_profiles SET intro_wav=NULL,updated_at=now() WHERE group_id=$1",[groupId]);
 res.json({ok:true});
}));
router.get("/groups/:id/hotline-audio",wrap(async(req,res)=>{
 const groupId=validId(req.params.id);
 if(!groupId){res.sendStatus(404);return;}
 const user=await getCurrentSessionUser(req);
 const g=await groupAccess(groupId,user?.id||null);
 if(!g||!g.canRead){res.sendStatus(404);return;}
 const data=await pool.query<{intro_wav:Buffer}>(
  "SELECT intro_wav FROM public.group_phone_profiles WHERE group_id=$1 AND intro_wav IS NOT NULL",[groupId]);
 const audio=data.rows[0]?.intro_wav;
 if(!audio){res.sendStatus(404);return;}
 res.set("Cache-Control","private,no-store").set("X-Content-Type-Options","nosniff").type("audio/wav").send(audio);
}));
export default router;
