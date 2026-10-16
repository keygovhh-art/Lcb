import { createDecipheriv } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const hotline="6055621286";
const maleVoice="ymMale";
type SavedToken={token_nonce:string;token_ciphertext:string;token_tag:string;line_number:string;last_verified_at:string|null};
function decode(row:SavedToken):string{
 const b64=process.env.YEMOT_ENCRYPTION_KEY||"";
 const key=Buffer.from(b64,"base64");
 if(key.length!==32||key.toString("base64")!==b64)throw Error("Provider encryption key unavailable");
 const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(row.token_nonce,"base64"));
 decipher.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
 decipher.setAuthTag(Buffer.from(row.token_tag,"base64"));
 return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,"base64")),decipher.final()]).toString("utf8");
}
/**
 * Prepared-only until the owner separately approves a deployment of this
 * branch. On FIRST production startup after approval, change only the root
 * TTS voice keys; do not touch type=api, any callback secret, extensions,
 * recordings, existing files, or the currently working DTMF routing.
 */
export async function stageApprovedMaleVoiceChange():Promise<void>{
 if(process.env.NODE_ENV!=="production")return;
 let claimed=false;
 let token="";
 try{
  // Additive release tracking. No writes occur before the user approves merge/deploy.
  await pool.query(
   "CREATE TABLE IF NOT EXISTS public.gavhah_yemot_male_voice_release "+
   "(id integer PRIMARY KEY CHECK(id=1), status text NOT NULL CHECK(status IN ('queued','applying','applied','blocked')), "+
   "provider_accepted boolean NOT NULL DEFAULT false, "+
   "safe_message text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now())");
  await pool.query("INSERT INTO public.gavhah_yemot_male_voice_release(id,status,safe_message) "+
   "VALUES(1,'queued','Owner requested male TTS voice; pending approved release') ON CONFLICT(id) DO NOTHING");
  const installed=await pool.query(
   "SELECT i.state AS install_state,g.enabled,g.last_verified_at FROM public.gavhah_yemot_ivr_install i "+
   "JOIN public.gavhah_yemot_global g ON g.id=i.id WHERE i.id=1 AND g.line_number=$1",
   [hotline]);
  if(installed.rows[0]?.install_state!=="live"||!installed.rows[0]?.enabled||!installed.rows[0]?.last_verified_at)
   return;
  const row=await pool.query(
   "UPDATE public.gavhah_yemot_male_voice_release SET status='applying',updated_at=now() "+
   "WHERE id=1 AND status='queued' RETURNING id");
  if(!row.rowCount)return;
  claimed=true;
  const saved=await pool.query<SavedToken>(
   "SELECT token_nonce,token_ciphertext,token_tag,line_number,last_verified_at "+
   "FROM public.gavhah_yemot_global WHERE id=1");
  if(!saved.rows[0]||saved.rows[0].line_number!==hotline||!saved.rows[0].last_verified_at)
   throw Error("Yemot provider not verified for target hotline");
  token=decode(saved.rows[0]);
  // Strictly targeted settings update: this does not change root IVR
  // routing or any audio recording, and does not log provider credentials.
  const result=await fetch("https://www.call2all.co.il/ym/api/UpdateExtension",{
   method:"POST",
   headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
   body:new URLSearchParams({token,path:"ivr2:",voice:maleVoice,tts_voice:maleVoice,language:"en"}),
   redirect:"error",cache:"no-store",signal:AbortSignal.timeout(16000)
  });
  if(!result.ok)throw Error("Yemot voice update network failure");
  const provider:any=await result.json();
  if(provider?.responseStatus!=="OK")throw Error("Yemot did not accept male TTS change");
  await pool.query(
   "UPDATE public.gavhah_yemot_male_voice_release SET status='applied',provider_accepted=true,"+
   "safe_message=$1,updated_at=now() WHERE id=1",
   ["Yemot accepted ymMale for root. Actual male speech still requires physical listening test."]);
  logger.info({hotline:"***1286",setting:"ymMale"},"Yemot male-voice update accepted");
 }catch(e){
  if(claimed){
   const reason=e instanceof Error?e.message:"Provider voice update failed";
   await pool.query(
    "UPDATE public.gavhah_yemot_male_voice_release SET status='blocked',safe_message=$1,updated_at=now() WHERE id=1",
    [reason.slice(0,160)]).catch(()=>{});
   logger.warn({reason:reason.slice(0,110)},"Yemot male voice change requires review");
  }
 }finally{token="";}
}
