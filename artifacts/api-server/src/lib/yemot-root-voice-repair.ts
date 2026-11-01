import { createDecipheriv } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

type Stored = {
 token_nonce:string; token_ciphertext:string; token_tag:string;
 line_number:string; last_verified_at:Date|null;
};
const url="https://www.call2all.co.il/ym/api/";
function decrypt(row:Stored):string{
 const raw=process.env.YEMOT_ENCRYPTION_KEY||"";
 const key=Buffer.from(raw,"base64");
 if(key.length!==32||key.toString("base64")!==raw)throw Error("Encryption key not ready");
 const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(row.token_nonce,"base64"));
 decipher.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
 decipher.setAuthTag(Buffer.from(row.token_tag,"base64"));
 return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,"base64")),decipher.final()]).toString("utf8");
}
async function request(token:string,action:string,params:Record<string,string>):Promise<any>{
 const response=await fetch(url+action,{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
  body:new URLSearchParams({token,...params}),cache:"no-store",redirect:"error",
  signal:AbortSignal.timeout(16000)
 });
 if(!response.ok)throw Error("Yemot "+action+" HTTP error");
 const result:any=await response.json();
 if(result?.responseStatus!=="OK")throw Error("Yemot "+action+" rejected voice settings");
 return result;
}
// Run ONCE following a real caller's silent-menu report. Existing provider
// files, directories, user recordings and API secret are left unchanged.
// UpdateExtension only changes listed root ext.ini keys.
export async function applyYemotVoiceRepair():Promise<void>{
 if(process.env.NODE_ENV!=="production")return;
 let token="";
 let claimed=false;
 let attempted=false;
 let speedOnly=false;
 try{
  const selected=await pool.query(
   "UPDATE public.gavhah_yemot_voice_repair SET state=CASE WHEN state='speed_queued' THEN 'speed_applying' ELSE 'applying' END,"+
   "reason=CASE WHEN state='speed_queued' THEN 'Updating only Yemot root TTS speed keys' ELSE 'Configuring root male English text to speech without altering existing audio or directories' END,updated_at=now() "+
   "WHERE id=1 AND state IN ('queued','speed_queued') RETURNING state");
  if(!selected.rowCount)return;
  claimed=true;
  speedOnly=selected.rows[0].state==="speed_applying";
  const rows=await pool.query<Stored>(
   "SELECT token_nonce,token_ciphertext,token_tag,line_number,last_verified_at "+
   "FROM public.gavhah_yemot_global WHERE id=1");
  const r=rows.rows[0];
  if(!r||r.line_number!=="6055621286"||!r.last_verified_at)
   throw Error("Only the already verified 6055621286 hotline can be changed");
  token=decrypt(r);
  const install=await pool.query("SELECT state,callback_hash FROM public.gavhah_yemot_ivr_install WHERE id=1");
  if(install.rows[0]?.state!=="live"||!install.rows[0]?.callback_hash)
    throw Error("Root IVR was not successfully installed");
  attempted=true;
  if(speedOnly){
   // Add-only root ext.ini patch: do not change language, voice, API, menus, or recordings.
   await request(token,"UpdateExtension",{path:"ivr2:",rate:"6",tts_rate:"6"});
  }else{
   // Original voice-repair behavior remains unchanged.
   await request(token,"UpdateExtension",{
    path:"ivr2:",language:"en",voice:"ymMale",tts_voice:"ymMale",
    api_log:"no",api_hangup_send:"no"
   });
  }
  await pool.query(
   "UPDATE public.gavhah_yemot_voice_repair SET state=$1,"+
   "provider_acknowledged=true,reason=$2,updated_at=now() WHERE id=1",
   [speedOnly?"speed_applied":"applied",speedOnly?
    "Yemot accepted rate=6 and tts_rate=6; physical call test still needed":
    "Yemot accepted male voice settings; actual male audio requires a physical call test"]);
  logger.info({line:"***1286",kind:speedOnly?"tts-speed-only":"english-male-tts",callerVerified:false},"Yemot accepted root voice repair");
 }catch(e){
  const message=e instanceof Error?e.message:"Unknown provider error";
  if(claimed)await pool.query(
   "UPDATE public.gavhah_yemot_voice_repair SET state=$1,provider_acknowledged=false,reason=$2,updated_at=now() WHERE id=1",
   [speedOnly?"speed_blocked":"blocked",(attempted?"Provider update uncertain: ":"") + message.slice(0,150)]).catch(()=>{});
  logger.warn({reason:message.slice(0,120),attempted},"Yemot voice repair failed");
 }finally{token="";}
}
