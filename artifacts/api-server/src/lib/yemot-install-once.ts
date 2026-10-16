import { createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const hotline="6055621286";
const endpoint="https://www.call2all.co.il/ym/api/";
type GlobalRow = {token_nonce:string;token_ciphertext:string;token_tag:string;line_number:string;last_verified_at:string|null};
async function request<T>(operation:string, token:string, params:Record<string,string>):Promise<T>{
  const response=await fetch(endpoint+operation,{
    method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({token,...params}),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error("Provider "+operation+" HTTP failure");
  const json:any=await response.json();
  if(json?.responseStatus!=="OK")throw Error("Provider "+operation+" refused operation");
  return json as T;
}
function getToken(row:GlobalRow):string{
  const key=process.env.YEMOT_ENCRYPTION_KEY||"";
  if(!/^[A-Za-z0-9+/]{43}=$/.test(key))throw Error("Encryption key unavailable");
  const bytes=Buffer.from(key,"base64");
  if(bytes.length!==32)throw Error("Encryption key size invalid");
  const decipher=createDecipheriv("aes-256-gcm",bytes,Buffer.from(row.token_nonce,"base64"));
  decipher.setAAD(Buffer.from("gavhah:yemot:platform:v1"));
  decipher.setAuthTag(Buffer.from(row.token_tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,"base64")),decipher.final()]).toString("utf8");
}
async function mark(state:"blocked"|"live",message:string,summary:Record<string,unknown>={}){
 await pool.query("UPDATE public.gavhah_yemot_ivr_install SET state=$1,safe_message=$2,provider_summary=$3::jsonb,updated_at=now() WHERE id=1",
   [state,message,JSON.stringify(summary)]);
}
// One-time, user-approved fresh-line installation. No persistent token in source,
// database or logs. Never edit an existing directory, and never retry on restart.
export async function installApprovedFreshYemotLine():Promise<void>{
 if(process.env.NODE_ENV!=="production")return;
 let claimed=false;
 try{
   const row=await pool.query("UPDATE public.gavhah_yemot_ivr_install SET state='installing',updated_at=now() WHERE id=1 AND state='queued' AND line_number=$1 RETURNING id",[hotline]);
   if(!row.rowCount)return;
   claimed=true;
   const r=await pool.query<GlobalRow>(
     "SELECT token_nonce,token_ciphertext,token_tag,line_number,last_verified_at FROM public.gavhah_yemot_global WHERE id=1");
   const stored=r.rows[0];
   if(!stored||stored.line_number!==hotline||!stored.last_verified_at)throw Error("Hotline key not verified for the expected configured line");
   let token=getToken(stored);
   try {
     const root:any=await request("GetIVR2Dir",token,{path:"ivr2:/"});
     // A new line may have default ext.ini, but no directory or uploaded
     // file may be silently overwritten.
     if(!Array.isArray(root.dirs)||!Array.isArray(root.files)||!Array.isArray(root.ini))
        throw Error("Unexpected provider directory format; no changes made");
     const unsafeIni=root.ini.some((item:any)=>{
       const name=String(item?.name??"");
       return name && name!=="ext.ini";
     });
     if(root.dirs.length||root.files.length||unsafeIni)
        throw Error("Existing provider content detected; refusing to overwrite");
     const secret=randomBytes(32).toString("hex");
     const hash=createHash("sha256").update(secret).digest("hex");
     // Hash is stored BEFORE remotely enabling the entry; the plaintext exists
     // only inside the provider's protected extension settings.
     await pool.query("UPDATE public.gavhah_yemot_ivr_install SET callback_hash=$1,provider_summary=$2::jsonb,updated_at=now() WHERE id=1 AND state='installing'",
       [hash,JSON.stringify({preexistingDirs:root.dirs.length,preexistingFiles:root.files.length,preexistingIni:root.ini.length})]);
     // Enable authenticated read-only IVR before making provider forward calls.
     await pool.query("UPDATE public.gavhah_yemot_global SET enabled=true,updated_at=now() WHERE id=1 AND last_verified_at IS NOT NULL");
     try{
       await request("UpdateExtension",token,{
         path:"ivr2:/",type:"api",title:"Gavhah and Campaign Center",
         api_link:"https://gavhah.onrender.com/api/yemot/ivr",api_url_post:"yes",
         api_add_0:"entryKey="+secret,language:"en"
       });
     }catch(error){
       await pool.query("UPDATE public.gavhah_yemot_global SET enabled=false,updated_at=now() WHERE id=1");
       throw error;
     }
     // Provider acknowledged change; actual spoken welcome must be verified
     // with a physical call, not claimed by GetTemplates or build success.
     await mark("live","Provider accepted the English root API extension. A real call is still required to verify audio and DTMF.",
       {providerAccepted:true,webhook:"/api/yemot/ivr",lineNumber:hotline,callerVerified:false});
     logger.info({hotline:"***1286"},"Yemot provider accepted the approved English root API extension");
   }finally{token="";}
 }catch(error){
   if(claimed){
    await mark("blocked",error instanceof Error?error.message.slice(0,160):"Provider installation blocked").catch(()=>{});
    logger.warn({reason:error instanceof Error?error.message.slice(0,130):"unknown"},"Yemot installation stopped safely");
   }else{
    logger.warn({reason:"Initial IVR installation state check failed"},"Yemot installer not executed");
   }
 }
}
