import {createDecipheriv,createHash} from "node:crypto";
import {pool} from "@workspace/db";
import {logger} from "./logger";
import {normalizedSignalWireNumber} from "./signalwire-number-safety";

const NUMBER="8080655605";
const AAD=Buffer.from("gavhah:signalwire:replacement:v1");
type RecordRow={
 space_hostname:string;project_id:string;
 token_nonce:string;token_ciphertext:string;token_tag:string;
 verified_at:Date|null
};
function secret(row:RecordRow){
 const encoded=process.env.YEMOT_ENCRYPTION_KEY||"";
 const key=Buffer.from(encoded,"base64");
 if(key.length!==32||key.toString("base64")!==encoded)throw Error("Missing encryption key");
 const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(row.token_nonce,"base64"));
 decipher.setAAD(AAD);
 decipher.setAuthTag(Buffer.from(row.token_tag,"base64"));
 return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,"base64")),decipher.final()]).toString("utf8");
}
function safeHTTPS(raw:unknown):string|null{
 if(typeof raw!=="string"||!raw.trim())return null;
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.username||u.password||u.hash||u.href.length>1800)return null;
  if(u.hostname==="gavhah.onrender.com")return null;
  return u.href;
 }catch{return null;}
}
async function readJSON(url:string,auth:string){
 const r=await fetch(url,{method:"GET",headers:{Authorization:auth,Accept:"application/json"},
  redirect:"error",cache:"no-store",signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw Error("Provider read-only request failed");
 return await r.json() as any;
}
/** ONE-SHOT, READ-ONLY: no SignalWire number updates of ANY KIND. */
export async function inspectExisting8080RouteOnce(){
 if(process.env.NODE_ENV!=="production")return;
 const claim=await pool.query(
  "UPDATE public.gavhah_signalwire_shared_route SET audit_state='inspecting',last_error=NULL,updated_at=now() "+
  "WHERE id=1 AND requested_number=$1 AND old_extension='55555' AND audit_state='queued' RETURNING id",
  [NUMBER]).catch(()=>({rowCount:0}));
 if(!claim.rowCount)return;
 try{
  const credentials=(await pool.query<RecordRow>(
   "SELECT space_hostname,project_id,token_nonce,token_ciphertext,token_tag,verified_at "+
   "FROM public.gavhah_signalwire_credentials WHERE id=1")).rows[0];
  if(!credentials||!credentials.verified_at)throw Error("SignalWire account not verified");
  const token=secret(credentials);
  const auth="Basic "+Buffer.from(credentials.project_id+":"+token).toString("base64");
  const base="https://"+credentials.space_hostname+"/api/laml/2010-04-01/Accounts/"+credentials.project_id;
  const listing=await readJSON(base+"/IncomingPhoneNumbers?PageSize=1000",auth);
  if(!Array.isArray(listing.incoming_phone_numbers))throw Error("Unrecognized number inventory");
  const matches=listing.incoming_phone_numbers.filter((n:any)=>normalizedSignalWireNumber(n.phone_number)===NUMBER);
  if(matches.length!==1||listing.next_page_uri){
   await pool.query(
    "UPDATE public.gavhah_signalwire_shared_route SET audit_state=$1,last_error=$2,checked_at=now() WHERE id=1",
    [matches.length===0&&!listing.next_page_uri?"not_found":"unresolved",
     matches.length===0?"8080655605 not in current connected SignalWire project's first page":
      "Provider list not exhaustive or number ambiguous"]);
   return;
  }
  const listed=matches[0];
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(listed.sid||"")))
   throw Error("Phone number resource ID not verified");
  const detail=await readJSON(base+"/IncomingPhoneNumbers/"+encodeURIComponent(listed.sid),auth);
  if(normalizedSignalWireNumber(detail.phone_number)!==NUMBER)throw Error("Phone number resource identity mismatch");
  const oldVoiceUrl=safeHTTPS(detail.voice_url);
  const hasOpaqueRoute=!!detail.voice_application_sid||!!detail.trunk_sid;
  const safeOld=!!oldVoiceUrl&&!hasOpaqueRoute;
  const fields={
   sid:String(detail.sid||""),
   voiceUrl:oldVoiceUrl,
   voiceMethod:String(detail.voice_method||"POST").toUpperCase()==="GET"?"GET":"POST",
   appId:detail.voice_application_sid?String(detail.voice_application_sid):null,
   fallback:safeHTTPS(detail.voice_fallback_url),
   fallbackMethod:String(detail.voice_fallback_method||"POST").toUpperCase()==="GET"?"GET":"POST",
   trunk:detail.trunk_sid?String(detail.trunk_sid):null,
   smsUrl:safeHTTPS(detail.sms_url)
  };
  // The digest allows later comparison before any provider update. No token,
  // raw phone caller information, or secret in these logs.
  const fingerprint=createHash("sha256").update(JSON.stringify(fields)).digest("hex");
  await pool.query(
   "UPDATE public.gavhah_signalwire_shared_route SET "+
   "audit_state=$1,provider_number_sid=$2,original_voice_url=$3,original_voice_method=$4,"+
   "original_voice_application_sid=$5,original_voice_fallback_url=$6,"+
   "original_voice_fallback_method=$7,original_trunk_sid=$8,original_sms_url=$9,"+
   "route_fingerprint=$10,checked_at=now(),last_error=$11,updated_at=now() WHERE id=1 AND audit_state='inspecting'",
   [safeOld?"verified_compatibility_voice_url":"unresolved",
    fields.sid,fields.voiceUrl,fields.voiceMethod,fields.appId,fields.fallback,
    fields.fallbackMethod,fields.trunk,fields.smsUrl,fingerprint,
    safeOld?null:"Original SignalWire phone route is application, trunk, Fabric or non-HTTPS. Never rewrite automatically."]);
  logger.info({numberSuffix:"5605",verifiedCompatibilityVoiceUrl:safeOld},
    "Read-only snapshot of original SignalWire shared number complete; no number settings changed");
 }catch(e){
  await pool.query(
   "UPDATE public.gavhah_signalwire_shared_route SET audit_state='failed',"+
   "last_error=$1,checked_at=now() WHERE id=1 AND audit_state='inspecting'",
   [String(e instanceof Error?e.message:"Provider read error").slice(0,190)]).catch(()=>{});
  logger.warn({numberSuffix:"5605",reason:"Read-only provider audit could not verify route"},
   "Existing SignalWire number left completely unchanged");
 }
}
