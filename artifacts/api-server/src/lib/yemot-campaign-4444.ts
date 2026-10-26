import { createDecipheriv, createHmac } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Add ONLY the unused /4444 child to the existing Gavhah Yemot number.
 * Never update the provider root, /0, another extension, or any media.
 * Activation is explicitly queued by the owner in the existing installation
 * metadata and attempted at most once. An ambiguous provider result blocks
 * rather than auto-retrying.
 */
const LINE="6055621286";
const PATH="4444";
const API="https://www.call2all.co.il/ym/api/";
const WEBHOOK="https://gavhah.onrender.com/api/yemot/ivr/4444";
type Credential={token_nonce:string;token_ciphertext:string;token_tag:string;line_number:string;last_verified_at:Date|null;enabled:boolean};

function encryptionKey():Buffer {
 const encoded=process.env.YEMOT_ENCRYPTION_KEY||"";
 const bytes=Buffer.from(encoded,"base64");
 if(bytes.length!==32||bytes.toString("base64")!==encoded)throw Error("Gavhah encrypted provider key is unavailable");
 return bytes;
}
function tokenFromRow(row:Credential,key:Buffer):string {
 const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(row.token_nonce,"base64"));
 decipher.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
 decipher.setAuthTag(Buffer.from(row.token_tag,"base64"));
 return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,"base64")),decipher.final()]).toString("utf8");
}
async function request(token:string,method:string,params:Record<string,string>):Promise<any>{
 const result=await fetch(API+method,{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},
  body:new URLSearchParams({token,...params}),redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(15000)
 });
 if(!result.ok)throw Error("Yemot "+method+" HTTP failure");
 const data:any=await result.json();
 if(data?.responseStatus!=="OK")throw Error("Yemot "+method+" rejected request");
 return data;
}
async function updateState(state:string,details:Record<string,unknown>){
 await pool.query(
  "UPDATE public.gavhah_yemot_ivr_install "+
  "SET provider_summary=jsonb_set(COALESCE(provider_summary,'{}'::jsonb),'{campaign4444}', $1::jsonb,true),updated_at=now() "+
  "WHERE id=1 AND provider_summary #>> '{campaign4444,state}'='installing'",
  [JSON.stringify({state,...details})]);
}
function directoryName(entry:any):string{
 const raw=typeof entry==="string"?entry:String(entry?.name??entry?.fileName??entry?.path??entry?.what??entry?.dir??"");
 return raw.trim().replace(/\/+$/,"").split(/[/:]/).pop()||"";
}
export async function installCampaign4444Once():Promise<void>{
 if(process.env.NODE_ENV!=="production")return;
 const claimed=await pool.query(
  "UPDATE public.gavhah_yemot_ivr_install "+
  "SET provider_summary=jsonb_set(COALESCE(provider_summary,'{}'::jsonb),'{campaign4444}','{\"state\":\"installing\"}'::jsonb,true),updated_at=now() "+
  "WHERE id=1 AND state='live' AND provider_summary #>> '{campaign4444,state}'='queued' RETURNING id"
 ).catch(()=>({rowCount:0}));
 if(!claimed.rowCount)return;
 let token="";
 let attempted=false;
 try{
  const credentials=(await pool.query<Credential>(
   "SELECT token_nonce,token_ciphertext,token_tag,line_number,last_verified_at,enabled "+
   "FROM public.gavhah_yemot_global WHERE id=1"
  )).rows[0];
  if(!credentials||credentials.line_number!==LINE||!credentials.enabled||!credentials.last_verified_at)
   throw Error("Existing approved Gavhah provider connection is not enabled and verified");
  const key=encryptionKey();
  token=tokenFromRow(credentials,key);
  // Check account ownership and avoid confusing Campaign Center's independent
  // second number with the old Gavhah number.
  const session=await request(token,"GetSession",{});
  if(String(session.username||"").replace(/\D/g,"")!==LINE)
   throw Error("Yemot account ownership does not match existing Gavhah number");
  const dir=await request(token,"GetIVR2Dir",{path:"/"});
  if(!Array.isArray(dir.dirs)||!Array.isArray(dir.files))
   throw Error("Provider returned an incomplete root inventory");
  if(dir.dirs.some((entry:any)=>directoryName(entry)===PATH))
   throw Error("Extension 4444 already exists; never replace its settings or recordings");
  const exists=await request(token,"CheckIfFileExists",{path:"ivr2:"+PATH+"/ext.ini"});
  if(exists.fileExists!==false)
   throw Error("Extension 4444 is not proven empty; nothing changed");
  const secret=createHmac("sha256",key).update("gavhah-campaign-4444-callback-v1").digest("hex");
  attempted=true;
  await request(token,"UpdateExtension",{
   path:"ivr2:"+PATH,type:"api",title:"Campaign Center",
   api_link:WEBHOOK,api_url_post:"yes",api_add_0:"entryKey="+secret,
   language:"en",voice:"ymMale",tts_voice:"ymMale",api_log:"no",api_hangup_send:"no"
  });
  await updateState("live",{path:"/4444",providerAccepted:true,physicalCallTest:false,rootUntouched:true,recordingsUntouched:true});
  logger.info({extension:"/4444",providerAccepted:true,phoneVerified:false},
   "Yemot accepted independent Campaign Center extension on the Gavhah line");
 }catch(error){
  const reason=error instanceof Error?error.message.slice(0,160):"Unexpected provider error";
  await updateState("blocked",{path:"/4444",reason,providerUpdateAttempted:attempted,rootUntouched:true}).catch(()=>{});
  logger.warn({extension:"/4444",providerUpdateAttempted:attempted,reason},
   "Campaign Center extension install stopped; original menu remains enabled");
 }finally{token="";}
}
