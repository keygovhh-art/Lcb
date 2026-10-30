/**
 * Additive, PRIVATE MAX voice-studio drafts.
 * This module NEVER changes a SignalWire number, webhook, legacy 55555 route,
 * live menu, or previously published media. The live provider is deliberately
 * not connected to drafts: a separately tested publication gate is required.
 */
import {Router, type Request, type Response} from "express";
import {pool} from "@workspace/db";
import {requireAuth, getCurrentSessionUser} from "../middlewares/auth";

const router=Router();
const table="public.gavhah_max_voice_drafts";
const validPath=(v:string)=>v==="root"||(v!=="55555"&&/^[1-9][0-9]{0,15}$/.test(v));
const chapters=[
 {path:"root",label:"הויפט מעניו — עולם החסד MAX",guide:"ברוכים הבאים צו עולם החסד. פאר מיין טישל און היינטיגע ארבעט דרוקט איינס. פאר רופן און קאמיוניקאציע דרוקט צוויי. פאר קאנטאקטן און נדבנים דרוקט דריי. פאר פראיעקטן און צילן דרוקט פיר. פאר פינאנצן און באריכטן דרוקט פינף. צו הערן דעם מעניו נאכאמאל דרוקט נול."},
 {path:"1",label:"מיין טישל — היינט און טאַסקס",guide:"מיין טישל. הערט אויס אייערע היינטיגע טאַסקס, דערמאנונגען און צוריקצורופן־רעקארדס. קלויבט די געוואונטשענע אפציע לויטן מעניו. צוריק צום הויפט מעניו דרוקט נול."},
 {path:"2",label:"רופן און קאמיוניקאציע",guide:"רופן און קאמיוניקאציע. איר קענט נאכקוקן אייערע רוף־באריכטן און באשטעטיגטע נאכפאלגן. א רוף־רעזולטאט ווערט פארשריבן אויף אייער עסקנות־חשבון. צוריק דרוקט נול."},
 {path:"3",label:"מענטשן און נדבנים — Donor 360",guide:"מענטשן און נדבנים. דא קען מען נאכקוקן קאנטאקטן, רוף־רעזולטאטן, צוזאגן און נדבות. פריוואטע פרטים זענען נאר פאר א בארעכטיגטן באניצער. צוריק דרוקט נול."},
 {path:"4",label:"פראיעקטן און צילן",guide:"פראיעקטן און צילן. קלויבט א פראיעקט צו הערן דעם מצב, טאַסקס און נאכפאלגן. צוריק דרוקט נול."},
 {path:"5",label:"פינאנצן, באריכטן און חשבון",guide:"פינאנצן און באריכטן. דא קען מען הערן איבער צוזאגן, רעקארדירטע נדבות, היסטאריע און אקאונט. צוריק דרוקט נול."}
];
async function ensure(){
 await pool.query("CREATE TABLE IF NOT EXISTS "+table+" ("+
  "path text PRIMARY KEY CHECK(path='root' OR (path <> '55555' AND path ~ '^[1-9][0-9]{0,15}$')),"+
  "yiddish_script text NOT NULL DEFAULT '',english_tts text NOT NULL DEFAULT '',"+
  "draft_audio bytea,mime_type text,updated_at timestamptz NOT NULL DEFAULT now())");
}
const err=(res:Response,code:number,message:string)=>res.status(code).json({error:message});
function sameOrigin(req:Request){
 if(["cross-site","same-site"].includes(req.get("sec-fetch-site")||""))return false;
 const origin=req.get("origin");
 if(!origin)return true;
 try{
  const o=new URL(origin),host=req.get("x-forwarded-host")||req.get("host");
  return o.protocol==="https:" && o.host===host;
 }catch{return false;}
}
async function gate(req:Request,res:Response,next:(e?:unknown)=>void){
 try{
  const user=await getCurrentSessionUser(req);
  if(!user||user.role!=="super_admin"){err(res,403,"Super administrator only");return;}
  if(req.method!=="GET"&&!sameOrigin(req)){err(res,403,"Same-origin only");return;}
  next();
 }catch(e){next(e);}
}
function wrap(fn:(req:Request,res:Response)=>Promise<void>){
 return (req:Request,res:Response,next:(e?:unknown)=>void)=>{void fn(req,res).catch(next);};
}
router.use("/admin/max/voice-studio",requireAuth,gate);
router.get("/admin/max/voice-studio",wrap(async (_req,res)=>{
 await ensure();
 const q=await pool.query("SELECT path,yiddish_script,english_tts,mime_type,octet_length(draft_audio) AS audio_size,updated_at FROM "+table+" ORDER BY path");
 const route=await pool.query("SELECT audit_state,cutover_enabled,checked_at FROM public.gavhah_signalwire_shared_route WHERE id=1");
 const migration=await pool.query("SELECT stage,tested_calls,last_test_at FROM public.gavhah_hotline_migration WHERE id=1");
 const diagnostic=await pool.query(
  "SELECT (SELECT count(*)::int FROM public.askanus_cases) AS cases,"+
  "(SELECT count(*)::int FROM public.askanus_tasks) AS tasks,"+
  "(SELECT count(*)::int FROM public.case_followups) AS followups,"+
  "(SELECT count(*)::int FROM public.fundraising_call_reports) AS call_reports,"+
  "(SELECT count(*)::int FROM public.max_pledges) AS pledges,"+
  "(SELECT count(*)::int FROM public.gavhah_phone_member_logins) AS linked_phone_members,"+
  "(SELECT count(*)::int FROM public.gavhah_yemot_call_states) AS phone_session_states");

 res.setHeader("Cache-Control","private, no-store");
 res.json({
  catalogue:chapters, drafts:q.rows,
  line:{number:"+16056558080",legacyExtension:"55555",routeAudit:route.rows[0]?.audit_state||"not_checked",
   cutoverEnabled:route.rows[0]?.cutover_enabled===true,migrationStage:migration.rows[0]?.stage||"not_configured",
   recordedCallTests:migration.rows[0]?.tested_calls||0},
  diagnostics:diagnostic.rows[0]||{},
  publicationEnabled:false,
  note:"Private drafts only. Saving cannot modify any existing call, voicemail, SMS, provider webhook, or 55555."
 });
}));
router.put("/admin/max/voice-studio/:path",wrap(async(req,res)=>{
 const path=String(req.params.path||"");
 if(!validPath(path)){err(res,400,"Invalid MAX extension");return;}
 const yi=req.body?.yiddishScript,en=req.body?.englishTts;
 if(typeof yi!=="string"||typeof en!=="string"||yi.length>1500||en.length>950||
   /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(yi+en)){
  err(res,400,"Invalid or overlong script");return;
 }
 // Yiddish is for human recordings; provider English TTS cannot read it reliably.
 if(/[\u0590-\u05ff]/.test(en)){err(res,400,"English carrier TTS only; use recording for Yiddish");return;}
 await ensure();
 await pool.query("INSERT INTO "+table+"(path,yiddish_script,english_tts) VALUES($1,$2,$3) "+
  "ON CONFLICT(path) DO UPDATE SET yiddish_script=EXCLUDED.yiddish_script,english_tts=EXCLUDED.english_tts,updated_at=now()",
  [path,yi.trim(),en.replace(/\s+/g," ").trim()]);
 res.setHeader("Cache-Control","no-store");
 res.json({ok:true,draft:true,live:false});
}));
function audioAllowed(bytes:Buffer,mime:string){
 if(bytes.length<80||bytes.length>4*1024*1024)return false;
 if(["audio/wav","audio/x-wav","audio/wave"].includes(mime))
  return bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WAVE";
 if(mime==="audio/webm")return bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
 if(mime==="audio/ogg")return bytes.toString("ascii",0,4)==="OggS";
 if(["audio/mpeg","audio/mp3"].includes(mime))
  return bytes.toString("ascii",0,3)==="ID3"||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0);
 return false;
}
router.post("/admin/max/voice-studio/:path/audio",wrap(async(req,res)=>{
 const path=String(req.params.path||""),mime=String(req.body?.mime||"").toLowerCase();
 const base64=req.body?.base64;
 if(!validPath(path)||typeof base64!=="string"||base64.length>5700000||
  !/^[a-zA-Z0-9+/]+={0,2}$/.test(base64)){
  err(res,400,"Invalid extension or audio");return;
 }
 const bytes=Buffer.from(base64,"base64");
 if(!audioAllowed(bytes,mime)){err(res,415,"Invalid audio signature or size");return;}
 await ensure();
 await pool.query("INSERT INTO "+table+"(path,draft_audio,mime_type) VALUES($1,$2,$3) "+
  "ON CONFLICT(path) DO UPDATE SET draft_audio=EXCLUDED.draft_audio,mime_type=EXCLUDED.mime_type,updated_at=now()",
  [path,bytes,mime]);
 res.setHeader("Cache-Control","no-store");
 res.json({ok:true,bytes:bytes.length,draft:true,live:false});
}));
router.get("/admin/max/voice-studio/:path/audio",wrap(async(req,res)=>{
 const path=String(req.params.path||"");
 if(!validPath(path)){err(res,400,"Invalid extension");return;}
 await ensure();
 const q=await pool.query("SELECT draft_audio,mime_type FROM "+table+" WHERE path=$1",[path]);
 const audio=q.rows[0];
 if(!audio?.draft_audio){err(res,404,"No draft audio");return;}
 res.setHeader("Cache-Control","private, no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 res.type(audio.mime_type||"audio/wav").end(audio.draft_audio);
}));
export default router;
