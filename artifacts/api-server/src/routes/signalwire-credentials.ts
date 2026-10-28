import {Router,type Request,type Response} from "express";
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {pool} from "@workspace/db";
import {getCurrentSessionUser} from "../middlewares/auth";
import {classifySignalWireNumber} from "../lib/signalwire-number-safety";
import {inspectExisting8080RouteOnce} from "../lib/signalwire-old-route-snapshot";

/**
 * The router is mounted AFTER existing super-admin + same-origin middleware
 * in /api/admin/hotline-migration. Never expose sealed tokens or decrypt them
 * for the browser. No provider writes, number purchases, SMS or outgoing calls.
 */
const router=Router();
const rowTable="public.gavhah_signalwire_credentials";
const AAD=Buffer.from("gavhah:signalwire:replacement:v1");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const spaceName=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function key(){
 // Existing encryption key remains server-only. Distinct AES-GCM AAD prevents
 // accidental cross-decryption with legacy Yemot account credentials.
 const text=process.env.YEMOT_ENCRYPTION_KEY||"";
 const buffer=Buffer.from(text,"base64");
 if(buffer.length!==32||buffer.toString("base64")!==text)throw Error("Server encryption key not configured");
 return buffer;
}
export function normalizeSignalWireSpace(value:string):string|null{
 let valueText=value.trim().toLowerCase().replace(/^https:\/\//,"").replace(/\/$/,"");
 if(valueText.endsWith(".signalwire.com"))valueText=valueText.slice(0,-".signalwire.com".length);
 return spaceName.test(valueText)?valueText+".signalwire.com":null;
}
function encrypt(token:string){
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key(),iv);
 cipher.setAAD(AAD);
 const body=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return {nonce:iv.toString("base64"),ciphertext:body.toString("base64"),tag:cipher.getAuthTag().toString("base64")};
}
type Credential={space_hostname:string;project_id:string;token_nonce:string;token_ciphertext:string;token_tag:string;verified_at:Date|null;last_test_at:Date|null;updated_at:Date|null};
function decrypt(row:Credential){
 const dec=createDecipheriv("aes-256-gcm",key(),Buffer.from(row.token_nonce,"base64"));
 dec.setAAD(AAD);
 dec.setAuthTag(Buffer.from(row.token_tag,"base64"));
 return Buffer.concat([dec.update(Buffer.from(row.token_ciphertext,"base64")),dec.final()]).toString("utf8");
}
const fail=(res:Response,status:number,message:string)=>res.status(status).json({error:message});
async function current(){
 const result=await pool.query<Credential>(
  "SELECT space_hostname,project_id,token_nonce,token_ciphertext,token_tag,verified_at,last_test_at,updated_at "+
  "FROM "+rowTable+" WHERE id=1"
 );
 return result.rows[0]||null;
}
function status(row:Credential|null){
 return {configured:!!row,spaceUrl:row?.space_hostname||null,
  projectId:row?.project_id||null,verified:!!row?.verified_at,
  lastVerifiedAt:row?.verified_at||null,lastTestAt:row?.last_test_at||null,
  updatedAt:row?.updated_at||null,secret:"NEVER_RETURNED",
  encryptionReady:(()=>{try{key();return true;}catch{return false;}})(),
  provider:"signalwire",cutoverEnabled:false,oldYemotUntouched:true};
}
router.get("/status",async(_req,res,next)=>{
 try{res.set("Cache-Control","private,no-store").json(status(await current()));}
 catch(e){next(e);}
});
router.put("/connection",async(req,res,next)=>{
 try{
  const space=typeof req.body?.spaceUrl==="string"?normalizeSignalWireSpace(req.body.spaceUrl):null;
  const project=typeof req.body?.projectId==="string"?req.body.projectId.trim():"";
  const token=typeof req.body?.apiToken==="string"?req.body.apiToken:"";
  if(!space||!uuid.test(project)||token.length<12||token.length>1024||!/^[\x21-\x7e]+$/.test(token)){
   fail(res,400,"Provide a valid SignalWire Space URL, Project ID (UUID) and API Token");return;
  }
  let sealed:{nonce:string;ciphertext:string;tag:string};
  try{sealed=encrypt(token);}catch{
   fail(res,503,"Encryption key not configured on the server");return;
  }
  const actor=(await getCurrentSessionUser(req))!.id;
  await pool.query("INSERT INTO "+rowTable+
   "(id,space_hostname,project_id,token_nonce,token_ciphertext,token_tag,updated_by,verified_at,last_test_at) "+
   "VALUES(1,$1,$2,$3,$4,$5,$6,NULL,NULL) ON CONFLICT(id) DO UPDATE SET "+
   "space_hostname=EXCLUDED.space_hostname,project_id=EXCLUDED.project_id,"+
   "token_nonce=EXCLUDED.token_nonce,token_ciphertext=EXCLUDED.token_ciphertext,token_tag=EXCLUDED.token_tag,"+
   "updated_by=EXCLUDED.updated_by,verified_at=NULL,last_test_at=NULL,updated_at=now()",
   [space,project,sealed.nonce,sealed.ciphertext,sealed.tag,actor]);
  // Previous original routing belongs to a potentially DIFFERENT project.
  // Never carry over its audit result when owner replaces credentials.
  await pool.query(
   "UPDATE public.gavhah_signalwire_shared_route SET audit_state='queued',"+
   "provider_number_sid=NULL,original_voice_url=NULL,original_voice_method=NULL,"+
   "original_voice_application_sid=NULL,original_voice_fallback_url=NULL,"+
   "original_voice_fallback_method=NULL,original_trunk_sid=NULL,original_sms_url=NULL,"+
   "route_fingerprint=NULL,original_provider_api=NULL,original_call_handler=NULL,original_route_details=NULL,"+
   "checked_at=NULL,last_error=NULL,updated_at=now() "+
   "WHERE id=1 AND cutover_enabled=false");
  res.set("Cache-Control","private,no-store").json({
   ...status(await current()),
   message:"SignalWire token saved encrypted. Run read-only connection test next. Existing Yemot hotline unchanged."
  });
 }catch(e){next(e);}
});
router.post("/test",async(_req,res,next)=>{
 try{
  const row=await current();
  if(!row){fail(res,409,"Save SignalWire credentials first");return;}
  const throttle=await pool.query(
   "UPDATE "+rowTable+" SET last_test_at=now() WHERE id=1 "+
   "AND (last_test_at IS NULL OR last_test_at<now()-interval '20 seconds') RETURNING id"
  );
  if(!throttle.rowCount){fail(res,429,"Wait 20 seconds before another test");return;}
  let token="";
  try{token=decrypt(row);}catch{
   fail(res,503,"Encrypted SignalWire credentials unavailable");return;
  }
  let ok=false,ownedNumbers=0;
  try{
   // Official read-only Compatibility API: /IncomingPhoneNumbers, token scope Numbers.
   // No phone is provisioned and no call is placed by this GET.
   const endpoint="https://"+row.space_hostname+"/api/laml/2010-04-01/Accounts/"+
    row.project_id+"/IncomingPhoneNumbers?PageSize=1";
   const auth="Basic "+Buffer.from(row.project_id+":"+token,"utf8").toString("base64");
   const response=await fetch(endpoint,{method:"GET",headers:{Authorization:auth,Accept:"application/json"},
    redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error("SignalWire token authentication or Numbers scope failed");
   const data:any=await response.json();
   if(!Array.isArray(data?.incoming_phone_numbers))throw Error("SignalWire returned unexpected response");
   ok=true;ownedNumbers=data.incoming_phone_numbers.length;
  }catch{
   await pool.query("UPDATE "+rowTable+" SET verified_at=NULL WHERE id=1 AND token_ciphertext=$1",[row.token_ciphertext]);
   fail(res,502,"SignalWire API test failed. Check Space, Project ID, token and Numbers permission.");return;
  }finally{token="";}
  if(ok){
   await pool.query("UPDATE "+rowTable+" SET verified_at=now() WHERE id=1 AND token_ciphertext=$1",[row.token_ciphertext]);
   res.set("Cache-Control","private,no-store").json({
    ...status(await current()),connected:true,readOnly:true,returnedPhoneEntries:ownedNumbers,
    note:"Token authenticated for read-only Numbers API. Phone webhook signing and actual IVR call still require separate checks."
   });
  }
 }catch(e){next(e);}
});

/**
 * Read-only SignalWire inventory; the credentials never leave this server.
 * Even "unassigned" means only *appears* unassigned from the Compatibility
 * API; a Fabric route may exist and must be checked before any provider write.
 */
export async function readSignalWireInventory(){
 const row=await current();
 if(!row||!row.verified_at)throw Error("Verify your SignalWire connection before inventory");
 const token=decrypt(row);
 const url="https://"+row.space_hostname+"/api/laml/2010-04-01/Accounts/"+
  row.project_id+"/IncomingPhoneNumbers?PageSize=50";
 const auth="Basic "+Buffer.from(row.project_id+":"+token,"utf8").toString("base64");
 const response=await fetch(url,{method:"GET",headers:{Authorization:auth,Accept:"application/json"},
  redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("SignalWire provider inventory HTTP "+response.status);
 const data:unknown=await response.json();
 if(!data||typeof data!=="object"||!Array.isArray((data as any).incoming_phone_numbers))
  throw Error("Unexpected SignalWire numbers response");
 const raw=(data as any).incoming_phone_numbers as Array<any>;
 const mapped=raw.map(classifySignalWireNumber);
 if(mapped.some(x=>!/^\+?[0-9]{7,15}$/.test(x.number)))
  throw Error("Unexpected provider phone numbers; inventory ignored");
 return {
  numbers:mapped,
  complete:!(data as any).next_page_uri,
  hasMore:!!(data as any).next_page_uri,
  protectedNumber:"6056558080",
  readOnly:true,
  providerSettingsChanged:false,
  caution:"An empty Compatibility voice route is not proof that a Fabric or another system route is empty. Do not replace other systems."
 };
}
router.get("/numbers",async(_req,res,next)=>{
 try{
  const inventory=await readSignalWireInventory();
  res.set("Cache-Control","private,no-store").json(inventory);
 }catch(e){
  // Do not log or return the secret, encrypted payload, queries or provider body.
  const m=e instanceof Error?e.message:"";
  const providerMatch=/^SignalWire provider inventory HTTP ([0-9]{3})$/.exec(m);
  const code=/authenticate data|bad decrypt|unable to authenticate|Invalid key length/i.test(m)
   ?"TOKEN_DECRYPT_FAILED":
   /Verify your SignalWire connection/.test(m)?"NOT_VERIFIED":
   providerMatch?"PROVIDER_HTTP_"+providerMatch[1]:
   /unexpected.*response/i.test(m)?"PROVIDER_FORMAT_ERROR":
   /Unexpected provider phone numbers/.test(m)?"PROVIDER_PHONE_VALIDATION":
   /timed out|timeout|fetch failed|network/i.test(m)||(e instanceof Error&&e.name==="TimeoutError")?"PROVIDER_NETWORK_ERROR":
   "INVENTORY_UNCLASSIFIED";
  console.error(JSON.stringify({event:"gavhah.signalwire.inventory_failure",at:new Date().toISOString(),code}));
  const isCredential=code==="TOKEN_DECRYPT_FAILED";
  const isProvider=code.startsWith("PROVIDER_");
  res.status(isCredential?503:isProvider?502:code==="NOT_VERIFIED"?409:503)
   .set("Cache-Control","private,no-store")
   .json({error:isCredential
    ?"Saved SignalWire token cannot be decrypted with this Cloudflare encryption key. No provider settings were changed."
    :isProvider?"SignalWire inventory could not be read; no provider settings were changed."
    :"SignalWire inventory is not currently available; no provider settings were changed.",supportCode:code});
 }
});

type SharedAudit={cutover_enabled:boolean;audit_state:string;provider_number_sid:string|null;original_voice_url:string|null;original_voice_application_sid:string|null;original_provider_api:string|null;original_call_handler:string|null;checked_at:Date|null;last_error:string|null};
async function sharedAudit(){
 const result=await pool.query<SharedAudit>(
  "SELECT cutover_enabled,audit_state,provider_number_sid,original_voice_url,original_voice_application_sid,original_provider_api,original_call_handler,checked_at,last_error "+
  "FROM public.gavhah_signalwire_shared_route WHERE id=1");
 const r=result.rows[0];
 return {number:"6056558080",oldSystemExtension:"55555",state:r?.audit_state||"not_configured",
  oldProviderRouteVerified:r?.audit_state==="verified_compatibility_voice_url",
  existingVoiceUrlPresent:!!r?.original_voice_url,
  providerApi:r?.original_provider_api||null,oldCallHandler:r?.original_call_handler||null,
  providerApplicationPresent:!!r?.original_voice_application_sid,
  checkedAt:r?.checked_at||null,reason:r?.last_error||null,
  mainMenuWillBeGavhah:true,oldSystemWillUseExtension:"55555",
  stagedSharedIvrUrl:"https://gavhah.onrender.com/api/signalwire/shared-ivr",
  sharedIvrCodeReady:r?.audit_state==="verified_compatibility_voice_url",
  sharedIvrSigningKeyReady:String(process.env.SIGNALWIRE_SIGNING_KEY||"").length>=24,
  livePhoneTestPassed:false,
  cutoverEnabled:!!r?.cutover_enabled,providerRouteUnchanged:!r?.cutover_enabled,
  nextStep:r?.audit_state==="not_found"?
   "The verified number +16056558080 was not found by either API. Check the native SignalWire project and permissions before switching any routing.":
   r?.audit_state==="unresolved"?
   "Old routing uses Fabric, application or unknown provider route. Preserve original destination before switching main menu.":
   r?.audit_state==="verified_compatibility_voice_url"?
   "55555 redirect is staged using saved original cXML webhook. A real SignalWire signature key and physical test call are still required; live number unchanged.":
   "Inspect the old provider connection without changing its settings."
 };
}
router.get("/shared-route",async(_req,res,next)=>{
 try{res.set("Cache-Control","private,no-store").json(await sharedAudit());}
 catch(e){next(e);}
});
router.post("/shared-route/recheck",async(_req,res,next)=>{
 try{
  const c=await current();
  if(!c?.verified_at)return void fail(res,409,"Verify the SignalWire project credentials first.");
  await pool.query(
   "UPDATE public.gavhah_signalwire_shared_route SET audit_state='queued',"+
   "provider_number_sid=NULL,original_voice_url=NULL,original_voice_method=NULL,"+
   "original_voice_application_sid=NULL,original_voice_fallback_url=NULL,"+
   "original_voice_fallback_method=NULL,original_trunk_sid=NULL,original_sms_url=NULL,"+
   "route_fingerprint=NULL,original_provider_api=NULL,original_call_handler=NULL,original_route_details=NULL,"+
   "checked_at=NULL,last_error=NULL,updated_at=now() "+
   "WHERE id=1 AND cutover_enabled=false");
  // Provider reads only (GET). No provider-number updates.
  await inspectExisting8080RouteOnce();
  res.set("Cache-Control","private,no-store").json(await sharedAudit());
 }catch(e){next(e);}
});
router.delete("/connection",async(req,res,next)=>{
 try{
  if(req.body?.confirm!=="REMOVE_SIGNALWIRE_TOKEN_ONLY"){
   fail(res,400,"Explicit confirmation required");return;
  }
  await pool.query("DELETE FROM "+rowTable+" WHERE id=1");
  res.set("Cache-Control","private,no-store").json({
   configured:false,oldYemotUntouched:true,cutoverEnabled:false
  });
 }catch(e){next(e);}
});
export default router;
